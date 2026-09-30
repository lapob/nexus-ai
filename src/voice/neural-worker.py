"""@module voice/neural-worker
Local, bounded JSONL worker for the separately provisioned Kokoro runtime.
"""
import contextlib
import json
from pathlib import Path
import re
import sys
import tempfile

#region 01 — Request validation and language profiles
PROFILES = {
    "en": {"lang": "en-us", "male": "am_michael", "female": "af_heart"},
    "es": {"lang": "es", "male": "em_alex", "female": "ef_dora"},
    "fr": {"lang": "fr-fr", "male": "ff_siwis", "female": "ff_siwis"},
    "hi": {"lang": "hi", "male": "hm_omega", "female": "hf_alpha"},
    "it": {"lang": "it", "male": "im_nicola", "female": "if_sara"},
    "ja": {"lang": "ja", "male": "jm_kumo", "female": "jf_alpha"},
    "pt": {"lang": "pt-br", "male": "pm_alex", "female": "pf_dora"},
    "zh": {"lang": "cmn", "male": "zm_yunxi", "female": "zf_xiaobei"},
}
SPEEDS = {"neutral": 1.0, "warm": 0.98, "calm": 0.94, "serious": 0.97, "energetic": 1.06}


def validate_request(request):
    if not isinstance(request, dict):
        raise ValueError("Invalid request")
    identifier = request.get("id", "")
    if not isinstance(identifier, str) or not re.fullmatch(r"[a-f0-9-]{36}", identifier):
        raise ValueError("Invalid identifier")
    text = request.get("text", "")
    if not isinstance(text, str) or not text.strip() or len(text) > 520:
        raise ValueError("Invalid text length")
    language = request.get("language", "it")
    if language not in PROFILES:
        raise ValueError("Unsupported language")
    gender = request.get("gender", "male")
    if gender not in ("male", "female"):
        raise ValueError("Unsupported voice")
    output = Path(request.get("output", "")).resolve()
    expected = Path(tempfile.gettempdir()).resolve() / f"nexus-tts-{identifier}.wav"
    if output != expected or output.is_symlink():
        raise ValueError("Output outside owned temporary file")
    return identifier, text.strip(), PROFILES[language], gender, output


def text_segments(text):
    for sentence in re.split(r"(?<=[.!?;:。！？；：])\s+", text):
        while len(sentence) > 180:
            boundary = sentence.rfind(" ", 0, 181)
            boundary = boundary if boundary > 40 else 180
            yield sentence[:boundary]
            sentence = sentence[boundary:].lstrip()
        if sentence:
            yield sentence

#endregion
#region 02 — CPU inference and framed responses
def emit(event):
    print(json.dumps(event, ensure_ascii=True), flush=True)


def main():
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    # Library diagnostics must never enter the JSONL protocol.
    with contextlib.redirect_stdout(sys.stderr):
        import numpy as np
        import onnxruntime as ort
        import soundfile as sf
        from kokoro_onnx import Kokoro
        options = ort.SessionOptions()
        options.intra_op_num_threads = 4
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(Path.cwd() / "models/kokoro-v1.0.onnx"),
                                       sess_options=options, providers=["CPUExecutionProvider"])
        engine = Kokoro.from_session(session, str(Path.cwd() / "models/voices-v1.0.bin"))
    emit({"type": "ready"})
    while True:
        line = sys.stdin.readline(65537)
        if not line:
            break
        if len(line) > 65536:
            raise ValueError("Protocol frame too large")
        identifier = None
        try:
            request = json.loads(line)
            identifier, text, profile, gender, output = validate_request(request)
            samples = []
            with contextlib.redirect_stdout(sys.stderr):
                for segment in text_segments(text):
                    audio, rate = engine.create(segment, voice=profile[gender],
                                                speed=SPEEDS.get(request.get("delivery"), 1.0),
                                                lang=profile["lang"])
                    if not len(audio) or not np.isfinite(audio).all():
                        raise ValueError("Invalid audio")
                    if samples:
                        samples.append(np.zeros(int(rate * 0.06), dtype=np.float32))
                    samples.append(audio)
                sf.write(str(output), np.concatenate(samples), rate, subtype="PCM_16", format="WAV")
            emit({"id": identifier, "ok": True})
        except Exception as error:
            # Do not log private speech text or request contents.
            print(type(error).__name__, file=sys.stderr, flush=True)
            emit({"id": identifier, "ok": False})


if __name__ == "__main__":
    main()
#endregion
