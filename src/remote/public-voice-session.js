/** @module remote/public-voice-session Shared chat history and cancellable browser media. */
// #region Session controls and capture
function createPublicVoiceSession({ core, prompt, runtime, session, fetchAudio, ask, encodeWav, spokenLanguage, setState, setPhase, isBusy, showText }) {
  const copy = (it, en) => /^it\b/i.test(navigator.language) ? it : en;
  let active = false, epoch = 0, stream = null, recorder = null;
  let controller = null, finishCapture = null, finishPlayback = null;
  let savedDraft = ''; const background = new Map();
  const controls = document.createElement('div');
  controls.className = 'voice-session-controls'; controls.hidden = true;
  const status = document.createElement('p'); status.setAttribute('role', 'status');
  const close = document.createElement('button'); close.type = 'button';
  close.setAttribute('aria-label', copy('Torna alla conversazione scritta', 'Return to text conversation'));
  close.title = close.getAttribute('aria-label');
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
  controls.append(status, close); document.body.append(controls);
  const state = (value, message) => { setState(value); status.textContent = message; };
  const stopMedia = () => {
    controller?.abort(); finishCapture?.(); finishPlayback?.();
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    runtime.voiceEnergy = 0;
  };
  function leave({ focus = true } = {}) {
    if (!active) return;
    active = false; ++epoch; stopMedia(); controls.hidden = true;
    document.body.classList.remove('voice-session');
    for (const [element, inert] of background) element.inert = inert;
    background.clear(); if (!prompt.value && savedDraft) prompt.value = savedDraft;
    prompt.dispatchEvent(new Event('input', { bubbles: true }));
    core.setAttribute('aria-label', copy('Avvia conversazione vocale', 'Start voice conversation'));
    setPhase(''); setState('ready'); showText(focus);
  }
  close.onclick = () => leave();
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); leave(); }
    if (event.key === 'Tab') { event.preventDefault(); (document.activeElement === close ? core : close).focus({ preventScroll: true }); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave({ focus: false }); });
  addEventListener('pagehide', () => leave({ focus: false }));
  const valid = id => active && id === epoch && !controller.signal.aborted;
  async function capture(id) {
    const Engine = globalThis.AudioContext || globalThis.webkitAudioContext;
    const context = new Engine(), source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
    const samples = new Uint8Array(512), chunks = [];
    analyser.fftSize = 1024; source.connect(analyser);
    let frame = 0, timer = 0, heard = false, voiced = 0, floor = .009;
    let last = performance.now(), lastSpeech = last; const started = last;
    const current = new MediaRecorder(stream, { audioBitsPerSecond: 64000 }); recorder = current;
    const stop = () => { if (current.state === 'recording') current.stop(); };
    try {
      await context.resume();
      if (!valid(id)) return null;
      return await new Promise((resolve, reject) => {
        finishCapture = stop;
        current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        current.onerror = () => reject(new Error(copy('Registrazione interrotta. Tocca il Core per riprovare.', 'Recording interrupted. Tap the Core to retry.')));
        current.onstop = () => resolve(heard ? new Blob(chunks, { type: current.mimeType || 'audio/webm' }) : null);
        current.start(250);
        state('listening', copy('Ti ascolto', 'Listening'));
        const sample = now => {
          if (!valid(id) || current.state !== 'recording') return;
          const dt = Math.min(80, now - last); last = now;
          analyser.getByteTimeDomainData(samples);
          const level = Math.sqrt(samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length);
          runtime.voiceEnergy = Math.min(1, Math.max(0, (level - floor) * 10));
          if (now - started < 300 && level < .02) floor = floor * .9 + level * .1;
          else if (level > Math.max(.016, Math.min(.065, floor * 2.35 + .006))) {
            voiced += dt; if (voiced >= 140) { heard = true; lastSpeech = now; }
          } else voiced = Math.max(0, voiced - dt);
          if (heard && now - lastSpeech > 950) return current.stop();
          frame = requestAnimationFrame(sample);
        };
        frame = requestAnimationFrame(sample);
        timer = setTimeout(stop, 30000);
      });
    } finally {
      clearTimeout(timer); cancelAnimationFrame(frame); if (finishCapture === stop) finishCapture = null;
      if (current.state === 'recording') current.stop();
      if (recorder === current) recorder = null;
      source.disconnect(); analyser.disconnect(); await context.close().catch(() => {});
      runtime.voiceEnergy = 0;
    }
  }
  // #endregion
  // #region Playback and conversational loop
  async function speak(text) {
    const id = epoch; if (!active) return;
    let url = '';
    try {
      state('speaking', copy('NexusNXS parla · tocca il Core per interrompere', 'NexusNXS is speaking · tap the Core to interrupt'));
      const response = await fetchAudio('/api/guest/voice/synthesize', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text.slice(0, 4000), language: spokenLanguage(text) }) });
      if (!valid(id)) return;
      if (!response.ok) throw new Error(copy('Audio non disponibile. La risposta resta nella chat.', 'Audio unavailable. Your answer remains in chat.'));
      const blob = await response.blob(); if (!valid(id)) return;
      url = URL.createObjectURL(blob); const current = new Audio(url);
      await new Promise((resolve, reject) => {
        finishPlayback = () => { current.pause(); resolve(); };
        current.onended = resolve; current.onerror = () => reject(new Error(copy('Riproduzione audio non riuscita.', 'Audio playback failed.')));
        current.play().catch(reject);
      });
    } catch (error) { if (valid(id)) throw error; }
    finally { finishPlayback = null; if (url) URL.revokeObjectURL(url); }
  }
  async function start() {
    if (active || isBusy()) return;
    active = true; const id = ++epoch; controller = new AbortController();
    savedDraft = prompt.value;
    for (const element of document.querySelectorAll('.exchange,.copy,.dock,.privacy,.identity')) { background.set(element, element.inert); element.inert = true; }
    document.body.classList.add('voice-session'); document.body.classList.remove('keyboard-open');
    prompt.blur(); controls.hidden = false; close.focus({ preventScroll: true });
    core.setAttribute('aria-label', copy('Invia la frase o interrompi la voce', 'Send speech or interrupt playback'));
    state('requesting', copy('Autorizza il microfono', 'Allow microphone access'));
    try {
      await session(); if (!valid(id)) return;
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error(copy('Microfono non disponibile in questo browser.', 'Microphone unavailable in this browser.'));
      const acquired = await navigator.mediaDevices.getUserMedia({ video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!valid(id)) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      while (valid(id)) {
        const blob = await capture(id); if (!valid(id)) break;
        if (!blob) throw new Error(copy('Non ho sentito una frase. Tocca il Core per riprovare.', 'No speech detected. Tap the Core to retry.'));
        state('transcribing', copy('Comprendo la voce', 'Understanding speech'));
        const Engine = globalThis.AudioContext || globalThis.webkitAudioContext, context = new Engine({ sampleRate: 16000 });
        let wav; try { wav = encodeWav(await context.decodeAudioData(await blob.arrayBuffer())); } finally { await context.close(); }
        if (!valid(id)) break;
        const response = await fetchAudio('/api/guest/voice/transcribe', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'audio/wav' }, body: wav });
        const data = await response.json(); if (!valid(id)) break;
        if (!response.ok || !String(data.text || '').trim()) throw new Error(copy('Frase non riconosciuta. Tocca il Core per riprovare.', 'Speech not recognized. Tap the Core to retry.'));
        state('thinking', copy('Sto preparando la risposta', 'Preparing a response'));
        await ask(data.text);
        if (document.getElementById('phase')?.classList.contains('error')) throw new Error(document.getElementById('phase').textContent);
      }
    } catch (error) {
      if (valid(id)) { stopMedia(); state('error', error.name === 'NotAllowedError' ? copy('Microfono non autorizzato. Puoi tornare alla chat scritta.', 'Microphone permission denied. You can return to text chat.') : error.message); }
    } finally { if (id === epoch) { stream?.getTracks().forEach(track => track.stop()); stream = null; } }
  }
  function interact() {
    if (!active) return start();
    if (finishPlayback) return finishPlayback();
    if (recorder?.state === 'recording') return finishCapture?.();
    if (runtime.voiceState === 'error') { leave({ focus: false }); return start(); }
  }
  return { start, interact, speak, leave, get active() { return active; } };
}

module.exports = { createPublicVoiceSession };
// #endregion
