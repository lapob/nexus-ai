"""@module voice/qwen3-worker
Local, bounded JSONL worker for the optional Qwen3-TTS runtime (PyTorch ROCm/CUDA).

Protocol (one JSON object per line):
  stdin  {"id", "text", "language", "gender", "output"}   synthesize one segment
  stdin  {"type": "cancel", "id"}                          barge-in: stop generation now
  stdout {"type": "ready", "sampleRate", "model"}
  stdout {"id", "type": "chunk", "seq", "pcm": base64 s16le mono}   streamed audio
  stdout {"id", "ok": true, "firstChunkMs", "totalMs", "audioMs"}   complete WAV written
  stdout {"id", "ok": false, "cancelled"?: true}
Private speech text is never written to stdout or stderr.
"""
import base64
import contextlib
import functools
import json
import os
from pathlib import Path
import queue
import re
import sys
import tempfile
import threading
import time

#region 01 — Request validation and language profiles
LANGUAGES = {
    "it": "italian", "en": "english", "es": "spanish", "fr": "french", "de": "german",
    "pt": "portuguese", "ru": "russian", "ja": "japanese", "ko": "korean", "zh": "chinese",
}
MODEL_DIRS = {"0.6b": "Qwen3-TTS-12Hz-0.6B-Base", "1.7b": "Qwen3-TTS-12Hz-1.7B-Base"}
LEFT_CONTEXT_FRAMES = 25  # same left context the official chunked decoder uses
UUID = re.compile(r"[a-f0-9-]{36}")


def validate_request(request):
    if not isinstance(request, dict):
        raise ValueError("Invalid request")
    identifier = request.get("id", "")
    if not isinstance(identifier, str) or not UUID.fullmatch(identifier):
        raise ValueError("Invalid identifier")
    text = request.get("text", "")
    if not isinstance(text, str) or not text.strip() or len(text) > 520:
        raise ValueError("Invalid text length")
    language = request.get("language", "it")
    if language not in LANGUAGES:
        raise ValueError("Unsupported language")
    gender = request.get("gender", "male")
    if gender not in ("male", "female"):
        raise ValueError("Unsupported voice")
    output = Path(request.get("output", "")).resolve()
    expected = Path(tempfile.gettempdir()).resolve() / f"nexus-qwen3-{identifier}.wav"
    if output != expected or output.is_symlink():
        raise ValueError("Output outside owned temporary file")
    return identifier, text.strip(), language, gender, output


def emit(event, lock=threading.Lock()):
    with lock:
        sys.__stdout__.write(json.dumps(event, ensure_ascii=True) + "\n")
        sys.__stdout__.flush()

#endregion
#region 02 — Streaming engine


class Cancelled(Exception):
    pass


class StreamingEngine:
    """Wraps the official model: frames are captured as the talker produces them
    and decoded incrementally with the causal decoder plus a short left context."""

    def __init__(self, root, size="0.6b", dtype="bfloat16", device="cuda:0", emit_frames=4):
        import torch
        from qwen_tts import Qwen3TTSModel
        self.torch = torch
        if getattr(torch.version, "hip", None):
            # Measured on RX 9070 XT / ROCm 7.2.1 Windows: MIOpen falls back to slow
            # GemmFwdRest solvers and re-tunes every new decoder length (0.4-18 s per
            # call). PyTorch's native convolution path decodes a block in ~25 ms.
            torch.backends.cudnn.enabled = False
        self.root = Path(root)
        self.emit_frames = max(1, int(emit_frames))
        self.tts = Qwen3TTSModel.from_pretrained(
            str(self.root / "models" / MODEL_DIRS[size]), device_map=device,
            dtype=getattr(torch, dtype), attn_implementation="sdpa")
        self.model = self.tts.model
        tokenizer = self.model.speech_tokenizer.model
        self.decoder = tokenizer.decoder
        self.upsample = int(tokenizer.get_decode_upsample_rate())
        self.sample_rate = int(tokenizer.get_output_sample_rate())
        self.eos = self.model.config.talker_config.codec_eos_token_id
        self.prompts = {}
        self.frames = None
        self.cancel_event = None
        talker = self.model.talker
        original = talker.forward

        # wraps() keeps the original signature: transformers validates
        # generate() kwargs against inspect.signature(forward).
        @functools.wraps(original)
        def forward(*args, **kwargs):
            if self.cancel_event is not None and self.cancel_event.is_set():
                raise Cancelled()
            result = original(*args, **kwargs)
            codes = result.hidden_states[1]
            if codes is not None and self.frames is not None:
                self.frames.put(codes[0].detach())
            return result

        talker.forward = forward

    def vram(self):
        cuda = self.torch.cuda
        free, total = cuda.mem_get_info()
        return {"vramReservedMb": round(cuda.memory_reserved() / 2**20), "vramPeakMb": round(cuda.max_memory_reserved() / 2**20),
                "gpuFreeMb": round(free / 2**20), "gpuTotalMb": round(total / 2**20)}

    def prompt(self, gender):
        if gender not in self.prompts:
            voice = self.root / "voices" / f"nexus-{gender}-reference.wav"
            transcript = voice.with_suffix(".txt")
            ref_text = transcript.read_text(encoding="utf-8").strip() if transcript.exists() else None
            items = self.tts.create_voice_clone_prompt(
                ref_audio=str(voice), ref_text=ref_text, x_vector_only_mode=not ref_text)
            self.prompts[gender] = items
        return self.prompts[gender]

    def _generate(self, text, language, gender):
        tts = self.tts
        items = self.prompt(gender)
        prompt = tts._prompt_items_to_voice_clone_prompt(items)
        input_ids = tts._tokenize_texts([tts._build_assistant_text(text)])
        ref_ids = [tts._tokenize_texts([tts._build_ref_text(it.ref_text)])[0] if it.ref_text else None for it in items]
        kwargs = tts._merge_generate_kwargs()
        kwargs["max_new_tokens"] = min(int(kwargs.get("max_new_tokens", 4096)), 12 * 60)
        self.model.generate(input_ids=input_ids, ref_ids=ref_ids, voice_clone_prompt=prompt,
                            languages=[LANGUAGES[language]], non_streaming_mode=False, **kwargs)
        return items[0].ref_code

    def _decode(self, frames, context):
        torch = self.torch
        codes = torch.stack(frames, dim=0)  # T x Q
        if context is not None and len(context):
            codes = torch.cat([context.to(codes.device), codes], dim=0)
        wav = self.decoder(codes.clamp(min=0).transpose(0, 1).unsqueeze(0))  # 1 x 1 x S
        skip = (0 if context is None else len(context)) * self.upsample
        return wav[0, 0, skip:].float().cpu().numpy()

    def stream(self, text, language, gender, cancel_event, on_chunk):
        """Yield decoded PCM blocks; raises Cancelled on barge-in."""
        torch = self.torch
        self.frames = queue.Queue()
        self.cancel_event = cancel_event
        failure = []
        ref_holder = {}
        done = threading.Event()

        def run():
            try:
                with torch.inference_mode():
                    ref_holder["ref"] = self._generate(text, language, gender)
            except BaseException as error:  # noqa: BLE001 - reported to the consumer thread
                failure.append(error)
            finally:
                done.set()
                self.frames.put(None)

        ref_code = self.prompt(gender)[0].ref_code
        context = ref_code[-LEFT_CONTEXT_FRAMES:] if ref_code is not None else None
        produced = []
        pending = []
        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        finished = False
        while not finished:
            frame = self.frames.get()
            if frame is None:
                finished = True
            elif int(frame[0]) == self.eos:
                finished = True
            else:
                pending.append(frame)
            if cancel_event.is_set():
                break
            # The first block is shorter: it bounds time-to-first-audio.
            threshold = self.emit_frames if produced else max(1, self.emit_frames // 2)
            if pending and (finished or len(pending) >= threshold):
                with torch.inference_mode():
                    pcm = self._decode(pending, context)
                window = produced[-LEFT_CONTEXT_FRAMES:] + pending
                context = torch.stack(window[-LEFT_CONTEXT_FRAMES:], dim=0)
                produced.extend(pending)
                pending = []
                on_chunk(pcm)
        thread.join()
        self.frames = None
        self.cancel_event = None
        if cancel_event.is_set():
            raise Cancelled()
        if failure and not isinstance(failure[0], Cancelled):
            raise failure[0]
        return len(produced)

#endregion
#region 03 — Process loop with concurrent cancel


def to_s16(pcm):
    import numpy as np
    return (np.clip(pcm, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


class TailCloser:
    """Holds back the last few milliseconds of the stream so the final block can
    fade out and end in silence: the codec sometimes stops inside the last
    phoneme, which sounds like a hard cut or a click (measured 13/11/2026).
    Same helper as voice/qwen3-gguf-worker.py."""

    def __init__(self, sample_rate, fade_ms=20, pad_ms=120):
        self.hold = max(1, int(sample_rate * fade_ms / 1000))
        self.pad = max(0, int(sample_rate * pad_ms / 1000))
        self.tail = None

    def push(self, pcm):
        import numpy as np
        pcm = np.asarray(pcm, dtype=np.float32).reshape(-1)
        joined = pcm if self.tail is None else np.concatenate([self.tail, pcm])
        self.tail = joined[-self.hold:]
        return joined[:-self.hold]

    def finish(self):
        import numpy as np
        tail = np.zeros(0, dtype=np.float32) if self.tail is None else self.tail
        self.tail = None
        ramp = 0.5 * (1.0 + np.cos(np.linspace(0.0, np.pi, len(tail), dtype=np.float32)))
        return np.concatenate([tail * ramp, np.zeros(self.pad, dtype=np.float32)])


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    root = Path(os.environ.get("NEXUS_QWEN3_ROOT") or Path.cwd())
    size = os.environ.get("NEXUS_QWEN3_SIZE", "0.6b")
    if size not in MODEL_DIRS:
        size = "0.6b"
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import soundfile as sf
        engine = StreamingEngine(root, size=size, emit_frames=int(os.environ.get("NEXUS_QWEN3_EMIT_FRAMES", "4")))
        for gender in ("male", "female"):
            if (root / "voices" / f"nexus-{gender}-reference.wav").exists():
                engine.prompt(gender)
        # Warm kernels once so the first real request does not pay compilation.
        warm = threading.Event()
        try:
            engine.stream("Pronto.", "it", "male", warm, lambda _pcm: None)
        except Exception:
            pass
    emit({"type": "ready", "sampleRate": engine.sample_rate, "model": MODEL_DIRS[size], **engine.vram()})

    jobs = queue.Queue()
    active = {"id": None, "event": None}
    guard = threading.Lock()

    def reader():
        while True:
            line = sys.stdin.readline(65537)
            if not line:
                jobs.put(None)
                return
            if len(line) > 65536:
                jobs.put(None)
                return
            try:
                request = json.loads(line)
            except ValueError:
                continue
            if isinstance(request, dict) and request.get("type") == "cancel":
                with guard:
                    if active["event"] is not None and request.get("id") in (active["id"], "*"):
                        active["event"].set()
                continue
            jobs.put(request)

    threading.Thread(target=reader, daemon=True).start()
    while True:
        request = jobs.get()
        if request is None:
            break
        identifier = request.get("id") if isinstance(request, dict) else None
        try:
            identifier, text, language, gender, output = validate_request(request)
            cancel = threading.Event()
            with guard:
                active["id"], active["event"] = identifier, cancel
            started = time.perf_counter()
            first = [None]
            blocks = []
            seq = [0]
            closer = TailCloser(engine.sample_rate)

            def send(pcm):
                if not len(pcm):
                    return
                if first[0] is None:
                    first[0] = time.perf_counter() - started
                blocks.append(pcm)
                emit({"id": identifier, "type": "chunk", "seq": seq[0], "pcm": base64.b64encode(to_s16(pcm)).decode("ascii")})
                seq[0] += 1

            def on_chunk(pcm):
                send(closer.push(pcm))

            with contextlib.redirect_stdout(sys.stderr):
                engine.stream(text, language, gender, cancel, on_chunk)
                if not blocks and closer.tail is None:
                    raise ValueError("Invalid audio")
                send(closer.finish())
                audio = np.concatenate(blocks) if blocks else np.zeros(0, dtype=np.float32)
                if not len(audio) or not np.isfinite(audio).all():
                    raise ValueError("Invalid audio")
                sf.write(str(output), audio, engine.sample_rate, subtype="PCM_16", format="WAV")
            emit({"id": identifier, "ok": True, "firstChunkMs": round(first[0] * 1000),
                  "totalMs": round((time.perf_counter() - started) * 1000),
                  "audioMs": round(len(audio) * 1000 / engine.sample_rate), **engine.vram()})
        except Cancelled:
            emit({"id": identifier, "ok": False, "cancelled": True})
        except Exception as error:
            print(type(error).__name__, file=sys.stderr, flush=True)
            emit({"id": identifier, "ok": False})
        finally:
            with guard:
                active["id"], active["event"] = None, None


if __name__ == "__main__":
    # On Windows the HIP runtime can block interpreter teardown: exit at once.
    status = 1
    try:
        main()
        status = 0
    except BaseException as error:  # noqa: BLE001 - only the type is logged
        print(type(error).__name__, file=sys.stderr, flush=True)
    finally:
        sys.__stdout__.flush()
        os._exit(status)
#endregion
