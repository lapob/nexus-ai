/**
 * @module renderer/systems/VoiceRecognition
 * @description Acquisisce lo spettro del microfono senza far transitare audio fuori dal renderer.
 */
import type { AudioBus } from '../types/nexus';
import { normalizedVoiceLevel, smoothVoiceLevel, trimVoiceSignal } from './AudioEnvelope';

// #region 01 — Stato e acquisizione audio

export class VoiceRecognition {
  readonly bus: AudioBus = { current: { level: 0, bass: 0, mid: 0, treble: 0 } };
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private recorder: ScriptProcessorNode | null = null;
  private recorderSink: GainNode | null = null;
  private stream: MediaStream | null = null;
  private frame = 0;
  private frequencyData: Uint8Array<ArrayBuffer> | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private noiseFloor = 0.018;
  private calibrationFrames = 0;
  private smoothedLevel = 0;
  private speechProbability = 0;
  private sensitivity = 1;
  private generation = 0;
  private recordedChunks: Float32Array[] = [];
  private recordedSamples = 0;

  async start(microphoneId = 'default', sensitivity = 1): Promise<void> {
    if (this.stream) return;
    const generation = ++this.generation;
    const deviceId = microphoneId && microphoneId !== 'default'
      ? { exact: microphoneId }
      : undefined;
    const constraints = (selectedDevice?: MediaTrackConstraints['deviceId']) => ({
      audio: {
        deviceId: selectedDevice,
        echoCancellation: true,
        noiseSuppression: true,
        // Il livello fisico varia enormemente fra notebook, cuffie, USB e
        // interfacce professionali. WebRTC applica il guadagno del driver
        // prima della registrazione, mentre la normalizzazione finale sotto
        // conserva dinamica e consonanti senza dipendere dal singolo PC.
        autoGainControl: true,
        channelCount: 1,
        sampleRate: { ideal: 48_000 }
      },
      video: false as const
    });
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints(deviceId));
    } catch (error) {
      // Le periferiche USB e Bluetooth cambiano spesso identificatore. Se la
      // preferenza non è più valida, il dispositivo di sistema evita un errore
      // permanente e potrà essere riselezionato dalle impostazioni.
      if (!deviceId || !/notfound|overconstrained|requested device/i.test(String(error))) throw error;
      this.stream = await navigator.mediaDevices.getUserMedia(constraints());
    }
    try {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.78;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.fftSize);
      this.noiseFloor = 0.018;
      this.calibrationFrames = 0;
      this.smoothedLevel = 0;
      this.sensitivity = Math.min(1.35, Math.max(0.7, sensitivity));
      this.recordedChunks = [];
      this.recordedSamples = 0;
      this.source = this.context.createMediaStreamSource(this.stream);
      this.source.connect(this.analyser);
      this.recorder = this.context.createScriptProcessor(2048, 1, 1);
      this.recorderSink = this.context.createGain();
      this.recorderSink.gain.value = 0;
      this.recorder.onaudioprocess = (event) => {
        if (generation !== this.generation || !this.context) return;
        const input = event.inputBuffer.getChannelData(0);
        const remaining = (this.context.sampleRate * 30) - this.recordedSamples;
        if (remaining <= 0) return;
        const copy = input.slice(0, Math.min(input.length, remaining));
        this.recordedChunks.push(copy);
        this.recordedSamples += copy.length;
      };
      this.source.connect(this.recorder);
      this.recorder.connect(this.recorderSink);
      this.recorderSink.connect(this.context.destination);
      if (this.context.state === 'suspended') await this.context.resume();
      if (generation !== this.generation) return;
      this.sample(generation);
    } catch (error) {
      // Se WebAudio fallisce dopo il consenso, libera subito il device:
      // altrimenti le attivazioni successive vedrebbero uno stream fantasma.
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      if (this.context && this.context.state !== 'closed') await this.context.close().catch(() => {});
      this.context = null;
      this.analyser = null;
      this.frequencyData = null;
      this.timeData = null;
      throw error;
    }
  }

  // #endregion

  // #region 02 — Analisi, calibrazione e inviluppo

  private sample = (generation: number): void => {
    if (generation !== this.generation
      || !this.analyser || !this.frequencyData || !this.timeData || !this.context) return;
    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);
    const averageHz = (fromHz: number, toHz: number): number => {
      const nyquist = this.context!.sampleRate / 2;
      const from = Math.max(1, Math.floor((fromHz / nyquist) * this.frequencyData!.length));
      const to = Math.ceil((toHz / nyquist) * this.frequencyData!.length);
      let total = 0;
      const end = Math.min(to, this.frequencyData!.length);
      for (let index = from; index < end; index += 1) total += this.frequencyData![index];
      return total / Math.max(1, end - from) / 255;
    };

    let squareTotal = 0;
    for (const sample of this.timeData) {
      const normalized = (sample - 128) / 128;
      squareTotal += normalized * normalized;
    }
    const rms = Math.sqrt(squareTotal / this.timeData.length);

    if (this.calibrationFrames < 36) {
      // L'utente spesso parla immediatamente al secondo giro. La vecchia
      // calibrazione apprendeva quei primi fonemi come rumore, spezzando poi
      // voce e visualizer. Durante l'avvio seguiamo solo campioni plausibilmente
      // ambientali e limitiamo comunque quanto il floor può salire per frame.
      if (rms <= this.noiseFloor + 0.018) {
        const adjustment = (rms - this.noiseFloor) * 0.08;
        this.noiseFloor += Math.max(-0.0015, Math.min(0.0006, adjustment));
      }
      this.calibrationFrames += 1;
    } else if (rms < this.noiseFloor + 0.012) {
      this.noiseFloor += (rms - this.noiseFloor) * 0.004;
    }

    // La curva logaritmica segue la percezione umana: rende visibile la voce
    // bassa senza trasformare un piccolo aumento in saturazione istantanea.
    const targetLevel = normalizedVoiceLevel(rms, this.noiseFloor, this.sensitivity);
    this.smoothedLevel = smoothVoiceLevel(this.smoothedLevel, targetLevel);

    const shapeBand = (value: number): number => {
      const normalized = Math.max(0, Math.min(1, (value - 0.018) / 0.48));
      return Math.pow(normalized, 0.9) * (0.18 + this.smoothedLevel * 0.72);
    };
    const bass = shapeBand(averageHz(70, 250));
    const mid = shapeBand(averageHz(250, 2_000));
    const treble = shapeBand(averageHz(2_000, 8_000));
    const voiceBand = averageHz(120, 3_800);
    const peripheralNoise = averageHz(20, 110) + averageHz(5_500, 10_000);
    const aboveNoise = Math.max(0, rms - this.noiseFloor - 0.006);
    const signalScore = Math.min(1, aboveNoise / 0.055);
    const spectralScore = Math.min(1, voiceBand / Math.max(0.025, peripheralNoise * 0.85));
    const calibrated = this.calibrationFrames >= 24 ? 1 : this.calibrationFrames / 24;
    const targetSpeech = signalScore * spectralScore * calibrated;
    const speechEnvelope = targetSpeech > this.speechProbability ? 0.32 : 0.14;
    this.speechProbability += (targetSpeech - this.speechProbability) * speechEnvelope;
    this.bus.current.level = this.smoothedLevel;
    this.bus.current.bass = bass;
    this.bus.current.mid = mid;
    this.bus.current.treble = treble;
    this.frame = requestAnimationFrame(() => this.sample(generation));
  };

  activity(): { level: number; speech: number; calibrated: boolean } {
    return {
      level: this.smoothedLevel,
      speech: this.speechProbability,
      calibrated: this.calibrationFrames >= 24
    };
  }

  // #endregion

  // #region 03 — Arresto e rilascio risorse

  async finishRecording(): Promise<Uint8Array> {
    const sampleRate = this.context?.sampleRate || 48_000;
    const input = new Float32Array(this.recordedSamples);
    let offset = 0;
    for (const chunk of this.recordedChunks) {
      input.set(chunk, offset);
      offset += chunk.length;
    }
    const targetRate = 16_000;
    const resampledLength = Math.floor(input.length * targetRate / sampleRate);
    const resampled = new Float32Array(resampledLength);
    const ratio = sampleRate / targetRate;
    for (let index = 0; index < resampledLength; index += 1) {
      // Durante il downsampling 48 kHz → 16 kHz una media pesata conserva
      // meglio consonanti e nomi propri ed evita aliasing rispetto alla vecchia
      // interpolazione di un singolo campione.
      const start = index * ratio;
      const end = Math.min(input.length, (index + 1) * ratio);
      const first = Math.floor(start);
      const last = Math.ceil(end);
      let total = 0;
      let weightTotal = 0;
      for (let sourceIndex = first; sourceIndex < last; sourceIndex += 1) {
        const weight = Math.max(0, Math.min(end, sourceIndex + 1) - Math.max(start, sourceIndex));
        total += (input[sourceIndex] || 0) * weight;
        weightTotal += weight;
      }
      resampled[index] = weightTotal ? total / weightTotal : 0;
    }
    // Rimuove offset DC e rimbombo sotto la banda vocale. Il filtro è
    // indipendente dall'hardware e migliora soprattutto microfoni integrati,
    // ingressi economici e mixer virtuali.
    const trimmed = trimVoiceSignal(resampled, targetRate);
    const outputLength = trimmed.length;
    let mean = 0;
    for (const sample of trimmed) mean += sample;
    mean /= Math.max(1, trimmed.length);
    let previousInput = 0;
    let previousOutput = 0;
    let peak = 0;
    let voicedSquareTotal = 0;
    let voicedSamples = 0;
    const filtered = new Float32Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const centered = trimmed[index] - mean;
      const highPassed = centered - previousInput + (0.975 * previousOutput);
      previousInput = centered;
      previousOutput = highPassed;
      filtered[index] = highPassed;
      const magnitude = Math.abs(highPassed);
      peak = Math.max(peak, magnitude);
      if (magnitude >= 0.006) {
        voicedSquareTotal += highPassed * highPassed;
        voicedSamples += 1;
      }
    }
    const voicedRms = Math.sqrt(voicedSquareTotal / Math.max(1, voicedSamples));
    // Non amplifica il silenzio. Per una voce reale punta a un RMS moderato e
    // limita il guadagno sia dal rumore sia dal picco, evitando clipping.
    const desiredGain = voicedRms >= 0.004 ? 0.115 / voicedRms : 1;
    const gain = Math.max(0.72, Math.min(3.6, desiredGain, peak > 0 ? 0.88 / peak : 1));
    const pcm = new Int16Array(outputLength);
    for (let index = 0; index < outputLength; index += 1) {
      const amplified = filtered[index] * gain;
      // Soft limiter continuo: nessun taglio duro delle consonanti esplosive.
      const limited = Math.tanh(amplified * 1.08) / Math.tanh(1.08);
      pcm[index] = Math.round(Math.max(-1, Math.min(1, limited)) * 0x7fff);
    }
    const wav = new Uint8Array(44 + pcm.byteLength);
    const view = new DataView(wav.buffer);
    const writeText = (at: number, text: string) => {
      for (let index = 0; index < text.length; index += 1) wav[at + index] = text.charCodeAt(index);
    };
    writeText(0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    writeText(8, 'WAVE');
    writeText(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, 'data');
    view.setUint32(40, pcm.byteLength, true);
    new Int16Array(wav.buffer, 44).set(pcm);
    await this.stop();
    return wav;
  }

  async stop(): Promise<void> {
    this.generation += 1;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.recorder) {
      this.recorder.onaudioprocess = null;
      this.recorder.disconnect();
    }
    this.recorderSink?.disconnect();
    this.source?.disconnect();
    this.stream = null;
    this.source = null;
    this.recorder = null;
    this.recorderSink = null;
    this.analyser = null;
    this.frequencyData = null;
    this.timeData = null;
    if (this.context && this.context.state !== 'closed') await this.context.close();
    this.context = null;
    this.calibrationFrames = 0;
    this.noiseFloor = 0.018;
    this.smoothedLevel = 0;
    this.speechProbability = 0;
    this.recordedChunks = [];
    this.recordedSamples = 0;
    this.bus.current.level = 0;
    this.bus.current.bass = 0;
    this.bus.current.mid = 0;
    this.bus.current.treble = 0;
  }

  // #endregion
}
