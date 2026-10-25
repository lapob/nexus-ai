# Isolated resident speech-recognition candidate

The active recognizer remains the admitted CLI baseline. The new resident CPU
adapter is available to the existing evaluator with `--backend=resident`; it is
not selected by an environment flag, remote caller or automatic production
fallback. Quality, dependency review and real microphone/echo acceptance precede
any promotion. GPU/Vulkan remains unevaluated for this candidate.

The adapter reuses the pinned multilingual base model and upstream archive in
`config/whisper-runtime.json`. Provisioning now extracts and verifies the server
binary too. Every launch checks the model and all neighboring DLLs against source
pins; unknown DLLs are refused. Hash verification proves identity, not freedom
from vulnerabilities. A fresh context binds only to loopback behind a random
capability path. It does not accept model changes, prompts or filenames from a
caller and does not enable conversion or save uploaded speech to disk.

Requests are bounded mono16kHz PCM, with no cross-request context. The parent
supervisor owns process lifetime. Cancelling HTTP alone cannot interrupt the
native decoder: cancellation terminates the owned process and waits for exit and
port release before allowing another instance. The next request loads a fresh
context. Shutdown cannot revive a late launch. Unknown language/confidence stays
unknown; private URLs, audio and native diagnostics are not returned publicly.

Run the existing STT evaluator on a reviewed local corpus:

```powershell
npm run voice:evaluate:stt -- --dataset=PATH_TO_REVIEWED_CORPUS --backend=cli
npm run voice:evaluate:stt -- --dataset=PATH_TO_REVIEWED_CORPUS --backend=resident
```

The same speech/noise coverage and per-language gates apply to both. Keep corpus
audio, expected transcripts and generated reports private. Human test recordings
are not training data. Two authorized Italian clips exercised the real adapter
and lifecycle, but do not establish WER, acoustic robustness, p95 latency or
equivalence to a realtime speech-to-speech service.
