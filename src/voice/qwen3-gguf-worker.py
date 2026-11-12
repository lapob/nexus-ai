"""@module voice/qwen3-gguf-worker
Local, bounded JSONL worker for Qwen3-TTS on the GGUF path:
talker/predictor on llama.cpp (Vulkan), codec decoder on ONNX Runtime DirectML
(HaujetZhao/Qwen3-TTS-GGUF, vendored under vendor/qwen3-tts-gguf).

Same protocol as voice/qwen3-worker.py:
  stdin  {"id", "text", "language", "gender", "output"}   synthesize one segment
  stdin  {"type": "cancel", "id"}                          barge-in: stop generation now
  stdout {"type": "ready", "sampleRate", "model", "engine": "gguf"}
  stdout {"id", "type": "chunk", "seq", "pcm": base64 s16le mono}   streamed audio
  stdout {"id", "ok": true, "firstChunkMs", "totalMs", "audioMs", "frames"}
  stdout {"id", "ok": false, "cancelled"?: true}
Private speech text is never written to stdout, stderr or log files.
"""
import base64
import contextlib
import json
import logging
import os
from pathlib import Path
import queue
import re
import sys
import tempfile
import threading
import time

#region 01 — Request validation
LANGUAGES = {
    "it": "italian", "en": "english", "es": "spanish", "fr": "french", "de": "german",
    "pt": "portuguese", "ru": "russian", "ja": "japanese", "ko": "korean", "zh": "chinese",
}
MODEL_DIRS = {"0.6b": "Qwen3-TTS-12Hz-0.6B-Base", "1.7b": "Qwen3-TTS-12Hz-1.7B-Base"}
UUID = re.compile(r"[a-f0-9-]{36}")
MAX_FRAMES = 12 * 60  # 60 s of audio at 12.5 Hz, the same bound as the PyTorch worker


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


def chunk_plan(first, rest):
    """Frames per decoded block: a short first block bounds time-to-first-audio."""
    first = max(1, int(first))
    rest = max(first, int(rest))
    return first, rest


class GgufStreamingEngine:
    """Talker+predictor generate one 16-codebook frame per step; a decoder thread
    turns blocks of frames into PCM with the stateful ONNX decoder, so decoding
    overlaps generation instead of adding to it."""

    def __init__(self, package_root, model_dir, voices_dir, provider="DML", first_frames=4, block_frames=12, n_ctx=2048):
        sys.path.insert(0, str(package_root))
        import qwen3_tts_gguf  # noqa: F401 - configures its file logger on import
        package_logger = logging.getLogger("qwen3_tts_gguf")
        for handler in list(package_logger.handlers):
            package_logger.removeHandler(handler)
            with contextlib.suppress(Exception):
                handler.close()
        package_logger.addHandler(logging.NullHandler())
        from qwen3_tts_gguf.inference import TTSEngine, TTSConfig
        from qwen3_tts_gguf.inference.voice import prepare_voice
        self.TTSConfig = TTSConfig
        self.prepare_voice = prepare_voice
        self.first_frames, self.block_frames = chunk_plan(first_frames, block_frames)
        self.engine = TTSEngine(model_dir=str(model_dir), onnx_provider=provider, llm_use_gpu=True,
                                chunk_size=self.block_frames, verbose=False, subprocess_decoder=False)
        if not self.engine.ready:
            raise RuntimeError("GGUF engine not ready")
        self.decoder = self.engine.decoder._dec  # StatefulDecoder
        self.provider = self.decoder.active_provider
        self.stream = self.engine.create_stream(n_ctx=n_ctx)
        self.voices_dir = Path(voices_dir)
        self.voices = {}
        self.sample_rate = 24_000

    def voice(self, gender):
        if gender not in self.voices:
            wav = self.voices_dir / f"nexus-{gender}-reference.wav"
            transcript = wav.with_suffix(".txt")
            text = transcript.read_text(encoding="utf-8").strip() if transcript.exists() else ""
            prepared = self.prepare_voice(self.engine, self.engine.tokenizer, wav, text)
            if prepared is None:
                raise RuntimeError("Voice anchor unavailable")
            self.voices[gender] = prepared
        return self.voices[gender]

    def stream_pcm(self, text, language, gender, cancel_event, on_chunk):
        """Generate and decode; on_chunk(pcm float32) runs on the decoder thread."""
        import numpy as np
        stream = self.stream
        voice = self.voice(gender)
        stream.voice = voice
        stream.talker.clear_memory()
        from qwen3_tts_gguf.inference.schema.constants import map_language
        from qwen3_tts_gguf.inference.schema.result import Timing
        pdata = stream.prompt_builder.build_clone_prompt(text, voice, map_language(LANGUAGES[language]), False)
        config = self.TTSConfig(max_steps=MAX_FRAMES, streaming=True)
        blocks = queue.Queue()
        failure = []

        def decode_loop():
            state = voice.final_state
            try:
                while True:
                    item = blocks.get()
                    if item is None:
                        return
                    frames, final = item
                    if cancel_event.is_set():
                        continue
                    codes = np.asarray(frames, dtype=np.int64).reshape(-1, 16) if frames else np.zeros((0, 16), dtype=np.int64)
                    pcm, state = self.decoder.decode(codes, state=state, is_final=final)
                    if len(pcm):
                        on_chunk(pcm)
            except BaseException as error:  # noqa: BLE001 - reported to the caller
                failure.append(error)
                cancel_event.set()

        worker = threading.Thread(target=decode_loop, daemon=True)
        worker.start()
        pending = []
        produced = 0
        try:
            for step_codes, _summed in stream._run_engine_loop_gen(pdata, config, Timing()):
                if cancel_event.is_set():
                    break
                pending.append(step_codes)
                threshold = self.block_frames if produced else self.first_frames
                if len(pending) >= threshold:
                    blocks.put((pending, False))
                    produced += len(pending)
                    pending = []
            if not cancel_event.is_set():
                blocks.put((pending, True))
                produced += len(pending)
        finally:
            blocks.put(None)
            worker.join()
        if failure:
            raise failure[0]
        if cancel_event.is_set():
            raise Cancelled()
        return produced

#endregion
#region 03 — Process loop with concurrent cancel


def to_s16(pcm):
    import numpy as np
    return (np.clip(pcm, -1.0, 1.0) * 32767.0).astype("<i2").tobytes()


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    root = Path(os.environ.get("NEXUS_QWEN3_ROOT") or Path.cwd())
    size = os.environ.get("NEXUS_QWEN3_SIZE", "0.6b")
    if size not in MODEL_DIRS:
        size = "0.6b"
    voices = Path(os.environ.get("NEXUS_QWEN3_VOICES") or (root / "voices"))
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import soundfile as sf
        engine = GgufStreamingEngine(root / "src", root / "models" / MODEL_DIRS[size], voices,
                                     provider=os.environ.get("NEXUS_QWEN3_ONNX_PROVIDER", "DML"),
                                     first_frames=int(os.environ.get("NEXUS_QWEN3_FIRST_FRAMES", "4")),
                                     block_frames=int(os.environ.get("NEXUS_QWEN3_EMIT_FRAMES", "12")))
        for gender in ("male", "female"):
            if (voices / f"nexus-{gender}-reference.wav").exists():
                engine.voice(gender)
        # Warm the Vulkan pipelines and DirectML shapes once.
        with contextlib.suppress(Exception):
            engine.stream_pcm("Pronto.", "it", "male", threading.Event(), lambda _pcm: None)
    emit({"type": "ready", "sampleRate": engine.sample_rate, "model": MODEL_DIRS[size], "engine": "gguf",
          "decoderProvider": engine.provider})

    jobs = queue.Queue()
    active = {"id": None, "event": None}
    guard = threading.Lock()

    def reader():
        while True:
            line = sys.stdin.readline(65537)
            if not line or len(line) > 65536:
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

            def on_chunk(pcm):
                if first[0] is None:
                    first[0] = time.perf_counter() - started
                blocks.append(pcm)
                emit({"id": identifier, "type": "chunk", "seq": seq[0], "pcm": base64.b64encode(to_s16(pcm)).decode("ascii")})
                seq[0] += 1

            with contextlib.redirect_stdout(sys.stderr):
                frames = engine.stream_pcm(text, language, gender, cancel, on_chunk)
                audio = np.concatenate(blocks) if blocks else np.zeros(0, dtype=np.float32)
                if not len(audio) or not np.isfinite(audio).all():
                    raise ValueError("Invalid audio")
                sf.write(str(output), audio, engine.sample_rate, subtype="PCM_16", format="WAV")
            emit({"id": identifier, "ok": True, "firstChunkMs": round(first[0] * 1000),
                  "totalMs": round((time.perf_counter() - started) * 1000),
                  "audioMs": round(len(audio) * 1000 / engine.sample_rate), "frames": frames})
        except Cancelled:
            emit({"id": identifier, "ok": False, "cancelled": True})
        except Exception as error:
            print(type(error).__name__, file=sys.stderr, flush=True)
            emit({"id": identifier, "ok": False})
        finally:
            with guard:
                active["id"], active["event"] = None, None


if __name__ == "__main__":
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
