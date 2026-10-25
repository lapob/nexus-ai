/** @module remote/public-voice-session Shared chat history and cancellable browser media. */
// #region Session controls and capture
function createPublicVoiceSession({ core, prompt, runtime, session, fetchAudio, ask, encodeWav, spokenLanguage, setState, setPhase, isBusy, showText, cancelResponse = () => {}, getPreferences = () => ({}), closeIcon = '', collapseIcon = '', onPresentationChange = () => {}, duplex = false }) {
  let capturedLanguage = '';
  const normalizedLanguage = value => /^[a-z]{2}(?:-[a-z]{2})?$/i.test(String(value || '')) ? String(value).toLowerCase().split('-')[0] : '';
  const preferredLanguage = () => normalizedLanguage(getPreferences().responseLanguage);
  const copy = (it, en) => /^it\b/i.test(preferredLanguage() || capturedLanguage || navigator.language) ? it : en;
  let active = false, minimized = false, epoch = 0, stream = null, recorder = null;
  let lastMessage = '', swipe = null, suppressInteractionUntil = 0;
  let controller = null, finishCapture = null, finishPlayback = null;
  let pendingCapture = null, playbackActive = false, responseInterrupted = false;
  const echoMode = () => stream?.getAudioTracks()[0]?.getSettings?.().echoCancellation;
  const canInterruptBySpeech = () => duplex && [true, 'all'].includes(echoMode());
  const updateMode = () => {
    runtime.voiceMode = canInterruptBySpeech() ? 'duplex' : 'turns';
    document.body.dataset.voiceMode = runtime.voiceMode;
  };
  let savedDraft = ''; const background = new Map();
  const controls = document.createElement('div');
  controls.className = 'voice-session-controls'; controls.hidden = true;
  const status = document.createElement('p'); status.id = 'nexusVoiceStatus'; status.setAttribute('role', 'status');
  const collapse = document.createElement('button'); collapse.type = 'button'; collapse.className = 'voice-collapse';
  collapse.setAttribute('aria-label', copy('Riduci voce e mostra chat', 'Minimize voice and show chat'));
  collapse.setAttribute('data-material', String(Boolean(collapseIcon)));
  collapse.innerHTML = collapseIcon || '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const close = document.createElement('button'); close.type = 'button';
  close.setAttribute('aria-label', copy('Termina conversazione vocale', 'End voice conversation'));
  close.innerHTML = closeIcon || '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 15v-3c5-5 13-5 18 0v3l-5-1v-3M8 11v3l-5 1"/></svg>';
  close.setAttribute('data-material', String(Boolean(closeIcon)));
  const actions = document.createElement('div'); actions.className = 'voice-session-actions'; actions.append(collapse, close);
  controls.append(status, actions); document.body.append(controls);
  const fitVoiceCore = () => {
    if (!active || !controls.getBoundingClientRect) return;
    const viewport = globalThis.visualViewport;
    if (minimized) {
      const width = viewport?.width || innerWidth, height = viewport?.height || innerHeight;
      const diameter = Math.max(52, Math.min(80, width < 380 || height < 420 ? 64 : 80));
      const dockTop = document.querySelector?.('.dock')?.getBoundingClientRect().top;
      const bottom = Math.min(Number.isFinite(dockTop) ? dockTop - 12 : height - 104, (viewport?.offsetTop || 0) + height - 12);
      const center = Math.max((viewport?.offsetTop || 0) + diameter / 2 + 12, bottom - diameter / 2);
      const values = { '--nxs-mini-core-size': diameter + 'px',
        '--nxs-mini-core-left': ((viewport?.offsetLeft || 0) + width / 2 - 24) + 'px',
        '--nxs-mini-core-top': center + 'px',
        '--nxs-mini-close-right': Math.max(12, width / 2 - diameter / 2 - 40) + 'px' };
      for (const [key, value] of Object.entries(values)) document.body.style.setProperty(key, value);
      return;
    }
    const top = (viewport?.offsetTop || 0) + 16;
    const bottom = Math.min(controls.getBoundingClientRect().top, (viewport?.offsetTop || 0) + (viewport?.height || innerHeight));
    const available = Math.max(64, bottom - top - 24);
    const diameter = Math.max(64, Math.min(innerWidth - 16, available, 1100));
    core.style.setProperty('--nxs-voice-core-size', diameter + 'px');
    core.style.setProperty('--nxs-voice-core-top', top + available / 2 + 'px');
  };
  const layout = globalThis.ResizeObserver ? new ResizeObserver(fitVoiceCore) : null;
  layout?.observe(controls);
  const dock = document.querySelector?.('.dock'); if (dock) layout?.observe(dock);
  addEventListener('resize', fitVoiceCore, { passive: true });
  globalThis.visualViewport?.addEventListener('resize', fitVoiceCore, { passive: true });
  globalThis.visualViewport?.addEventListener('scroll', fitVoiceCore, { passive: true });
  const state = (value, message) => {
    setState(value); lastMessage = message; status.textContent = message;
    if (minimized && value === 'error') setPhase(message, true);
    if (minimized) core.setAttribute('aria-label', copy('Espandi conversazione vocale', 'Expand voice conversation'));
    fitVoiceCore();
  };
  function minimize() {
    if (!active || minimized) return false;
    minimized = true; swipe = null;
    for (const [element, inert] of background) element.inert = inert;
    document.body.classList.remove('voice-session'); document.body.classList.add('voice-minimized');
    core.setAttribute('aria-label', copy('Espandi conversazione vocale', 'Expand voice conversation'));
    onPresentationChange('compact'); fitVoiceCore(); core.focus({ preventScroll: true });
    if (runtime.voiceState === 'error') setPhase(lastMessage, true);
    return true;
  }
  function expand() {
    if (!active || !minimized) return false;
    minimized = false; swipe = null; prompt.blur();
    for (const element of background.keys()) element.inert = true;
    document.body.classList.remove('voice-minimized', 'keyboard-open'); document.body.classList.add('voice-session');
    core.setAttribute('aria-label', copy('Invia la frase o interrompi la voce', 'Send speech or interrupt playback'));
    status.textContent = lastMessage; onPresentationChange('full'); fitVoiceCore(); collapse.focus({ preventScroll: true });
    return true;
  }
  collapse.onclick = minimize;
  core.addEventListener('pointerdown', event => {
    swipe = active && !minimized && ['touch', 'pen'].includes(event.pointerType) && event.isPrimary !== false
      ? { id: event.pointerId, x: event.clientX, y: event.clientY, recognized: false } : null;
  });
  core.addEventListener('pointermove', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dy = event.clientY - swipe.y, dx = event.clientX - swipe.x;
    if (dy > 64 && dy > Math.abs(dx) * 1.5) {
      swipe.recognized = true;
      try { core.setPointerCapture?.(event.pointerId); } catch { /* The pointer may already have ended or been cancelled. */ }
      if (event.cancelable) event.preventDefault();
    }
  }, { passive: false });
  core.addEventListener('pointerup', event => {
    const recognized = swipe?.id === event.pointerId && swipe.recognized; swipe = null;
    if (recognized) { suppressInteractionUntil = performance.now() + 500; minimize(); }
  });
  core.addEventListener('pointercancel', () => { swipe = null; });
  const stopMedia = () => {
    controller?.abort(); finishCapture?.(); finishPlayback?.();
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    pendingCapture = null; playbackActive = false;
    runtime.voiceMode = 'off'; delete document.body.dataset.voiceMode;
    runtime.voiceEnergy = 0;
  };
  function leave({ focus = true } = {}) {
    if (!active) return;
    active = false; minimized = false; swipe = null; ++epoch; stopMedia(); controls.hidden = true;
    document.body.classList.remove('voice-session', 'voice-minimized');
    core.style?.removeProperty('--nxs-voice-core-size'); core.style?.removeProperty('--nxs-voice-core-top');
    for (const key of ['--nxs-mini-core-size', '--nxs-mini-core-left', '--nxs-mini-core-top', '--nxs-mini-close-right']) document.body.style?.removeProperty(key);
    core.setAttribute('aria-describedby', '');
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
    if (event.key === 'Tab' && !minimized) {
      event.preventDefault(); const focusable = [core, collapse, close], current = focusable.indexOf(document.activeElement);
      focusable[(current + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length].focus({ preventScroll: true });
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) leave({ focus: false }); });
  addEventListener('pagehide', () => leave({ focus: false }));
  const valid = id => active && id === epoch && !controller.signal.aborted;
  const startConcurrentCapture = id => {
    if (pendingCapture) return;
    pendingCapture = capture(id, true).then(value => value || { blob: null }, error => {
      responseInterrupted = true;
      const wasPlaying = playbackActive; finishPlayback?.();
      if (!wasPlaying && isBusy()) cancelResponse();
      return { error };
    });
  };
  async function capture(id, duringPlayback = false) {
    const Engine = globalThis.AudioContext || globalThis.webkitAudioContext;
    const context = new Engine(), source = context.createMediaStreamSource(stream), analyser = context.createAnalyser();
    const floatSamples = typeof analyser.getFloatTimeDomainData === 'function';
    const samples = floatSamples ? new Float32Array(1024) : new Uint8Array(1024), chunks = [];
    analyser.fftSize = 1024; source.connect(analyser);
    let frame = 0, timer = 0, heard = false, voiced = 0, floor = .009;
    let last = performance.now(), lastSpeech = last, started = last, firstSpeech = null;
    const current = new MediaRecorder(stream, { audioBitsPerSecond: 64000 }); recorder = current;
    const stop = () => { if (current.state === 'recording') current.stop(); };
    try {
      await Promise.race([context.resume(), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(copy('Leva il blocco audio del browser e tocca il Core per riprovare.', 'Allow browser audio and tap the Core to retry.'))), 5000);
      })]);
      clearTimeout(timer);
      if (!valid(id)) return null;
      return await new Promise((resolve, reject) => {
        finishCapture = stop;
        current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
        current.onerror = () => reject(new Error(copy('Registrazione interrotta. Tocca il Core per riprovare.', 'Recording interrupted. Tap the Core to retry.')));
        current.onstop = () => resolve(heard ? {
          blob: new Blob(chunks, { type: current.mimeType || 'audio/webm' }),
          startSeconds: Math.max(0, (firstSpeech - started) / 1000 - .4),
          endSeconds: (lastSpeech - started) / 1000 + .3
        } : null);
        started = last = performance.now();
        current.start(250);
        if (!duringPlayback) state('listening', copy('Ti ascolto', 'Listening'));
        else if (playbackActive) state('speaking', copy('Puoi interrompermi parlando', 'You can interrupt me by speaking'));
        const sample = now => {
          if (!valid(id) || current.state !== 'recording') return;
          const dt = Math.min(80, now - last); last = now;
          if (floatSamples) analyser.getFloatTimeDomainData(samples); else analyser.getByteTimeDomainData(samples);
          let squared = 0;
          for (let index = 0; index < samples.length; index++) {
            const value = floatSamples ? samples[index] : (samples[index] - 128) / 128;
            squared += value * value;
          }
          const level = Math.sqrt(squared / samples.length);
          runtime.voiceEnergy = Math.min(1, Math.max(0, (level - floor) * 10));
          if (now - started < 300 && level < .02) floor = floor * .9 + level * .1;
          else if (level > Math.max(.016, Math.min(.065, floor * 2.35 + .006))) {
            voiced += dt; if (voiced >= (playbackActive ? 240 : 140)) {
              if (!heard && duringPlayback) {
                responseInterrupted = true;
                const wasPlaying = playbackActive;
                finishPlayback?.();
                if (!wasPlaying && isBusy()) cancelResponse();
                state('listening', copy('Ti ascolto', 'Listening'));
              }
              if (!heard) firstSpeech = now - voiced;
              heard = true; lastSpeech = now;
            }
          } else voiced = Math.max(0, voiced - dt);
          // Waiting for the next turn is not part of the utterance. Never send
          // a silently truncated command when the spoken turn exceeds the cap.
          if (heard && now - firstSpeech > 12000) {
            stop(); reject(new Error(copy('Frase troppo lunga. Riprova con una frase entro 12 secondi.', 'Speech too long. Retry with a phrase under 12 seconds.'))); return;
          }
          if (heard && now - lastSpeech > 950) return current.stop();
          frame = requestAnimationFrame(sample);
        };
        frame = requestAnimationFrame(sample);
        timer = setTimeout(stop, duringPlayback ? 120000 : 30000);
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
    const id = epoch; if (!active || responseInterrupted) return;
    const synthesis = new AbortController(), sessionSignal = controller.signal;
    let url = '', current = null, settlePlayback = null;
    const cancel = () => {
      synthesis.abort(); playbackActive = false;
      current?.pause(); settlePlayback?.();
    };
    finishPlayback = cancel;
    sessionSignal.addEventListener('abort', cancel, { once: true });
    try {
      const canDuplex = canInterruptBySpeech();
      state('thinking', copy('Preparo la voce · tocca il Core per interrompere', 'Preparing audio · tap the Core to interrupt'));
      const tone = getPreferences().tone;
      const delivery = tone === 'warm' ? 'warm' : tone === 'direct' ? 'serious' : 'neutral';
      if (String(text).length > 4000) throw new Error(copy('La risposta è troppo lunga per la voce. Puoi leggerla integralmente nella chat.', 'This answer is too long for speech. The complete answer is available in chat.'));
      const response = await fetchAudio('/api/guest/voice/synthesize', { method: 'POST', signal: synthesis.signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' }, body: JSON.stringify({ text, language: preferredLanguage() || capturedLanguage || spokenLanguage(text), delivery }) });
      if (!valid(id) || synthesis.signal.aborted) return;
      if (!response.ok) throw new Error(copy('Audio non disponibile. La risposta resta nella chat.', 'Audio unavailable. Your answer remains in chat.'));
      const play = async blob => {
        if (!valid(id) || synthesis.signal.aborted) return;
        url = URL.createObjectURL(blob); current = new Audio(url);
        try { await new Promise((resolve, reject) => {
        settlePlayback = resolve;
        current.onended = () => { playbackActive = false; resolve(); }; current.onerror = () => reject(new Error(copy('Riproduzione audio non riuscita.', 'Audio playback failed.')));
        current.play().then(() => {
          if (!valid(id) || synthesis.signal.aborted) { current.pause(); resolve(); return; }
          playbackActive = true;
          state('speaking', canDuplex && recorder?.state === 'recording' ? copy('Puoi interrompermi parlando', 'You can interrupt me by speaking') : copy('NexusNXS parla · tocca il Core per interrompere', 'NexusNXS is speaking · tap the Core to interrupt'));
          if (canDuplex && !pendingCapture) {
            // Retain the whole utterance, including its beginning during playback.
            // Catch immediately: the conversational loop consumes the outcome later.
            startConcurrentCapture(id);
          }
        }).catch(reject);
        }); } finally { current?.pause(); current = null; if (url) URL.revokeObjectURL(url); url = ''; }
      };
      if (response.headers?.get('content-type')?.startsWith('application/x-ndjson')) {
        const reader = response.body.getReader(), decoder = new TextDecoder();
        const queue = []; let done = false, failure = null, wake = null, bytes = 0, wireBytes = 0, count = 0, terminal = false;
        const receive = (async () => {
          let pending = '';
          try {
            const line = value => {
              if (value.length > 4 * 1024 * 1024 || terminal) throw new Error('Invalid voice stream');
              const event = JSON.parse(value);
              if (event.type === 'done' && event.segments === count && count > 0) { terminal = true; return; }
              if (event.type !== 'audio' || event.index !== count || count >= 32 || event.mimeType !== 'audio/wav'
                || typeof event.audio !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(event.audio) || event.audio.length % 4) throw new Error('Invalid voice stream');
              const decoded = atob(event.audio); bytes += decoded.length;
              if (bytes > 16 * 1024 * 1024) throw new Error('Voice stream too large');
              queue.push(new Blob([Uint8Array.from(decoded, value => value.charCodeAt(0))], { type: 'audio/wav' }));
              ++count; wake?.(); wake = null;
            };
            while (!synthesis.signal.aborted && valid(id)) {
              const result = await reader.read();
              if (result.done) { pending += decoder.decode(); if (pending) line(pending); if (!terminal) throw new Error('Incomplete voice stream'); break; }
              wireBytes += result.value.byteLength;
              if (wireBytes > 24 * 1024 * 1024) throw new Error('Voice stream too large');
              pending += decoder.decode(result.value, { stream: true });
              let boundary;
              while ((boundary = pending.indexOf('\n')) >= 0) { const value = pending.slice(0, boundary); pending = pending.slice(boundary + 1); if (value) line(value); }
              if (pending.length > 4 * 1024 * 1024) throw new Error('Voice stream too large');
            }
          } catch (error) { failure = error; }
          finally { done = true; wake?.(); wake = null; }
        })();
        const notifyCancellation = () => { wake?.(); wake = null; void reader.cancel().catch(() => {}); };
        synthesis.signal.addEventListener('abort', notifyCancellation, { once: true });
        try {
          while (valid(id) && !synthesis.signal.aborted) {
            if (failure) throw new Error(copy('Audio interrotto. La risposta completa resta nella chat.', 'Audio interrupted. The complete answer remains in chat.'));
            if (queue.length) await play(queue.shift());
            else if (done) break;
            else await new Promise(resolve => { wake = resolve; });
          }
        } finally {
          synthesis.signal.removeEventListener('abort', notifyCancellation);
          await reader.cancel().catch(() => {}); await receive; queue.length = 0;
        }
      } else {
        const blob = await response.blob();
        if (blob.size > 16 * 1024 * 1024) throw new Error(copy('Audio troppo grande. La risposta resta nella chat.', 'Audio too large. The answer remains in chat.'));
        await play(blob);
      }
    } catch (error) { if (valid(id) && !synthesis.signal.aborted) throw error; }
    finally {
      sessionSignal.removeEventListener('abort', cancel);
      current?.pause();
      if (finishPlayback === cancel) { playbackActive = false; finishPlayback = null; }
      if (url) URL.revokeObjectURL(url);
    }
  }
  async function start() {
    if (active || isBusy()) return;
    active = true; minimized = false; const id = ++epoch; controller = new AbortController();
    capturedLanguage = '';
    responseInterrupted = false;
    savedDraft = prompt.value;
    for (const element of document.querySelectorAll('.exchange,.copy,.dock,.privacy,.identity')) { background.set(element, element.inert); element.inert = true; }
    document.body.classList.add('voice-session'); document.body.classList.remove('keyboard-open');
    core.setAttribute('aria-describedby', status.id);
    prompt.blur(); controls.hidden = false; close.focus({ preventScroll: true });
    core.setAttribute('aria-label', copy('Invia la frase o interrompi la voce', 'Send speech or interrupt playback'));
    state('requesting', copy('Autorizza il microfono', 'Allow microphone access'));
    try {
      await session(); if (!valid(id)) return;
      if (runtime.capabilities?.['voice-input']?.state !== 'available') throw new Error(copy('Voce non disponibile. Tocca per riprovare.', 'Speech unavailable. Tap to retry.'));
      if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error(copy('Microfono non disponibile in questo browser.', 'Microphone unavailable in this browser.'));
      const acquired = await navigator.mediaDevices.getUserMedia({ video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (!valid(id)) { acquired.getTracks().forEach(track => track.stop()); return; }
      stream = acquired;
      const track = stream.getAudioTracks()[0];
      track?.addEventListener?.('ended', () => {
        if (!valid(id)) return;
        ++epoch; responseInterrupted = true;
        if (isBusy()) cancelResponse();
        stopMedia();
        state('error', copy('Microfono scollegato. Tocca il Core per riprovare.', 'Microphone disconnected. Tap the Core to retry.'));
      }, { once: true, signal: controller.signal });
      // Modern browsers can expose an explicit mode which also covers local
      // HTMLAudio playback. remote-only covers WebRTC, not this audio source.
      const echoOptions = track?.getCapabilities?.().echoCancellation;
      if (duplex && Array.isArray(echoOptions) && echoOptions.includes('all')) {
        try { await track.applyConstraints({ echoCancellation: { exact: 'all' } }); } catch { /* Keep the actual browser-reported setting. */ }
      }
      if (!valid(id)) { acquired.getTracks().forEach(item => item.stop()); return; }
      updateMode();
      while (valid(id)) {
        const concurrent = pendingCapture; pendingCapture = null;
        if (concurrent) state('listening', copy('Ti ascolto', 'Listening'));
        const captured = (concurrent ? await concurrent : await capture(id)) || { blob: null };
        if (!valid(id)) break;
        if (captured.error) throw captured.error;
        const blob = captured.blob;
        if (!blob && concurrent) continue;
        if (!blob) throw new Error(copy('Non ho sentito una frase. Tocca il Core per riprovare.', 'No speech detected. Tap the Core to retry.'));
        state('transcribing', copy('Trascrivo la voce', 'Transcribing speech'));
        const Engine = globalThis.AudioContext || globalThis.webkitAudioContext, context = new Engine({ sampleRate: 16000 });
        let wav;
        try {
          const decoded = await context.decodeAudioData(await blob.arrayBuffer());
          const first = Math.max(0, Math.floor(captured.startSeconds * decoded.sampleRate));
          const end = Math.min(decoded.length, Math.ceil(captured.endSeconds * decoded.sampleRate));
          const length = end - first;
          if (!Number.isFinite(length) || length <= 0 || length / decoded.sampleRate > 12) {
            throw new Error(copy('Frase troppo lunga o incompleta. Riprova con una frase entro 12 secondi.', 'Speech too long or incomplete. Retry with a phrase under 12 seconds.'));
          }
          wav = encodeWav({ sampleRate: decoded.sampleRate, length, numberOfChannels: decoded.numberOfChannels,
            getChannelData: channel => decoded.getChannelData(channel).subarray(first, end) });
        } finally { await context.close(); }
        if (!valid(id)) break;
        const response = await fetchAudio('/api/guest/voice/transcribe', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'audio/wav', 'X-Nexus-Speech-Language': preferredLanguage() || capturedLanguage || 'auto' }, body: wav });
        const data = await response.json(); if (!valid(id)) break;
        if (!response.ok || !String(data.text || '').trim()) throw new Error(copy('Frase non riconosciuta. Tocca il Core per riprovare.', 'Speech not recognized. Tap the Core to retry.'));
        // Le risposte brevi o numeriche non contengono indizi linguistici:
        // usare la lingua riconosciuta dalla voce, non quella del browser.
        capturedLanguage = normalizedLanguage(data.language) || capturedLanguage;
        responseInterrupted = false;
        close.setAttribute('aria-label', copy('Torna alla conversazione scritta', 'Return to text conversation'));
        core.setAttribute('aria-label', copy('Invia la frase o interrompi la voce', 'Send speech or interrupt playback'));
        // Il microfono rimane attivo anche mentre il modello ragiona o prepara
        // l'audio: una nuova frase può annullare la risposta prima del playback.
        if (canInterruptBySpeech() && !pendingCapture) {
          startConcurrentCapture(id);
        }
        state('thinking', copy('Sto preparando la risposta', 'Preparing a response'));
        await ask(data.text, { language: preferredLanguage() || capturedLanguage });
        if (document.getElementById('phase')?.classList.contains('error')) throw new Error(document.getElementById('phase').textContent);
      }
    } catch (error) {
      if (valid(id)) { stopMedia(); state('error', error.name === 'NotAllowedError' ? copy('Microfono non autorizzato. Puoi tornare alla chat scritta.', 'Microphone permission denied. You can return to text chat.') : error.message); }
    } finally { if (id === epoch) { stream?.getTracks().forEach(track => track.stop()); stream = null; } }
  }
  function interact() {
    if (performance.now() < suppressInteractionUntil) return;
    if (!active) return start();
    if (minimized) return expand();
    if (finishPlayback) return finishPlayback();
    if (isBusy()) { responseInterrupted = true; return cancelResponse(); }
    if (recorder?.state === 'recording') return finishCapture?.();
    if (runtime.voiceState === 'error') { leave({ focus: false }); return start(); }
  }
  return { start, interact, speak, leave, minimize, expand, get active() { return active; }, get minimized() { return minimized; } };
}

module.exports = { createPublicVoiceSession };
// #endregion
