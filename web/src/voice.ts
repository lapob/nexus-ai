/**
 * @module web/voice
 * @description Voce della web app: registrazione con arresto sul silenzio, conversione locale in WAV PCM 16 kHz mono e riproduzione progressiva della sintesi.
 */

const SAMPLE_RATE = 16_000;
const MAX_SECONDS = 11.5;
const SILENCE_MS = 1_200;
const SPEECH_RMS = 0.02;

export interface Recording { stop: () => void; cancel: () => void; done: Promise<Blob> }

/** Codifica campioni float [-1,1] in WAV PCM 16 bit mono: il formato richiesto dal gateway. */
export function encodeWav(samples: Float32Array, sampleRate = SAMPLE_RATE): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, value < 0 ? value * 0x8000 : value * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Ricampiona qualunque formato registrato dal browser a 16 kHz mono. */
async function toWav16k(recorded: Blob): Promise<Blob> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await recorded.arrayBuffer());
    const duration = Math.min(decoded.duration, MAX_SECONDS);
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(duration * SAMPLE_RATE)), SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0, 0, duration);
    const rendered = await offline.startRendering();
    return encodeWav(rendered.getChannelData(0));
  } finally { void context.close(); }
}

/**
 * Avvia la registrazione. Si ferma da sola dopo un silenzio successivo al
 * parlato o al limite di durata; `onLevel` riceve il livello 0..1 per l'interfaccia.
 */
export async function startRecording(onLevel: (level: number) => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let cancelled = false;
  let spoke = false;
  let lastSound = performance.now();
  let frame = 0;
  const started = performance.now();
  const cleanup = () => {
    window.clearInterval(frame);
    for (const track of stream.getTracks()) track.stop();
    void context.close();
    onLevel(0);
  };
  const stop = () => { if (recorder.state === 'recording') recorder.stop(); };
  const tick = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += value * value;
    const rms = Math.sqrt(sum / samples.length);
    onLevel(Math.min(1, rms * 12));
    const now = performance.now();
    if (rms > SPEECH_RMS) { spoke = true; lastSound = now; }
    if ((spoke && now - lastSound > SILENCE_MS) || now - started > MAX_SECONDS * 1000) { window.clearInterval(frame); stop(); }
  };
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) { reject(new DOMException('Registrazione annullata.', 'AbortError')); return; }
      if (!spoke) { reject(Object.assign(new Error('Non ho sentito nulla. Riprova parlando più vicino al microfono.'), { name: 'NoSpeech' })); return; }
      try { resolve(await toWav16k(new Blob(chunks, { type: recorder.mimeType }))); }
      catch { reject(new Error('Registrazione non leggibile da questo browser.')); }
    };
    recorder.onerror = () => { cleanup(); reject(new Error('Microfono non disponibile.')); };
  });
  recorder.start(250);
  frame = window.setInterval(tick, 40);
  return { stop, cancel: () => { cancelled = true; stop(); }, done };
}

// Frasi che il riconoscimento produce su rumore o silenzio (allucinazioni note di Whisper).
const NOISE_TRANSCRIPTS = /^(?:you|thank you\.?|thanks for watching!?|grazie\.?|grazie a tutti\.?|sottotitoli[^.]*\.?|sous-titres[^.]*\.?|\.+|…|\[[^\]]*\]|\([^)]*\)|musica\.?|music\.?)$/i;

/** Vero se la trascrizione è rumore: nel ciclo live non diventa un messaggio. */
export function isNoiseTranscript(text: string): boolean {
  const clean = text.trim();
  return clean.length < 2 || NOISE_TRANSCRIPTS.test(clean);
}

const BARGE_RMS = 0.07;
const BARGE_MS = 320;

/**
 * Voce live: mentre l'entità parla ascolta il microfono (con cancellazione dell'eco)
 * e chiama `onSpeech` quando l'utente parla sopra con decisione. Restituisce lo stop.
 */
export async function listenForBargeIn(onSpeech: () => void): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  context.createMediaStreamSource(stream).connect(analyser);
  const samples = new Float32Array(analyser.fftSize);
  let loud = 0;
  let last = performance.now();
  let timer = 0;
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    for (const track of stream.getTracks()) track.stop();
    void context.close();
  };
  // Intervallo, non requestAnimationFrame: deve funzionare anche con la finestra in secondo piano.
  timer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += value * value;
    const now = performance.now();
    loud = Math.sqrt(sum / samples.length) > BARGE_RMS ? loud + (now - last) : 0;
    last = now;
    if (loud >= BARGE_MS) { stop(); onSpeech(); }
  }, 40);
  return stop;
}

/** Testo da leggere: niente codice, link, marcatori Markdown; massimo ~3.800 caratteri a fine frase. */
export function speakableText(markdown: string): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, ' (codice omesso) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
    .replace(/\[!(?:RESULT|TIP|NOTE|WARNING)\]/g, '')
    .replace(/[*_~|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= 3_800) return plain;
  const cut = plain.slice(0, 3_800);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return end > 1_000 ? cut.slice(0, end + 1) : cut;
}

export interface Playback { stop: () => void; done: Promise<void> }

/** Riproduce i segmenti man mano che arrivano, senza pause udibili tra l'uno e l'altro. */
export function createPlayer(): { enqueue: (wav: ArrayBuffer) => Promise<void>; finish: () => Promise<void>; stop: () => void } {
  const context = new AudioContext();
  let cursor = 0;
  const sources = new Set<AudioBufferSourceNode>();
  let stopped = false;
  return {
    enqueue: async (wav) => {
      if (stopped) return;
      const buffer = await context.decodeAudioData(wav);
      if (stopped) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      cursor = Math.max(cursor, context.currentTime + 0.03);
      source.start(cursor);
      cursor += buffer.duration;
      sources.add(source);
      source.onended = () => sources.delete(source);
    },
    finish: () => new Promise<void>((resolve) => {
      const wait = () => { if (stopped || (sources.size === 0 && context.currentTime >= cursor)) { void context.close(); resolve(); } else window.setTimeout(wait, 120); };
      wait();
    }),
    stop: () => { stopped = true; for (const source of sources) { try { source.stop(); } catch { /* già terminato */ } } sources.clear(); void context.close(); }
  };
}
