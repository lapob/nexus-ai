/**
 * @module renderer/systems/ActivationSound
 * @description Firma sonora locale riprodotta quando NEXUSNXS apre un nuovo turno vocale.
 */

let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  const AudioContextClass = window.AudioContext
    || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext ??= new AudioContextClass({ latencyHint: 'interactive' });
  return audioContext;
}

/**
 * Il suono nasce da oscillatori Web Audio e non usa asset o rete. Il master
 * resta sotto -26 dB per segnalare l'ascolto senza competere con la voce.
 */
export function playActivationSound(): void {
  try {
    const engine = context();
    if (!engine) return;
    if (engine.state === 'suspended') void engine.resume();

    const now = engine.currentTime;
    const master = engine.createGain();
    const filter = engine.createBiquadFilter();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.045, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3_400, now);
    filter.Q.setValueAtTime(0.8, now);
    master.connect(filter);
    filter.connect(engine.destination);

    [
      { frequency: 392, start: 0, duration: 0.28, gain: 0.72 },
      { frequency: 659.25, start: 0.075, duration: 0.3, gain: 0.38 }
    ].forEach((voice) => {
      const oscillator = engine.createOscillator();
      const envelope = engine.createGain();
      const begins = now + voice.start;
      const ends = begins + voice.duration;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(voice.frequency, begins);
      oscillator.frequency.exponentialRampToValueAtTime(voice.frequency * 1.045, ends);
      envelope.gain.setValueAtTime(0.0001, begins);
      envelope.gain.exponentialRampToValueAtTime(voice.gain, begins + 0.014);
      envelope.gain.exponentialRampToValueAtTime(0.0001, ends);
      oscillator.connect(envelope);
      envelope.connect(master);
      oscillator.start(begins);
      oscillator.stop(ends + 0.02);
    });
  } catch {
    // AudioContext può essere negato da policy o driver: l'attivazione vocale
    // resta sempre disponibile anche senza feedback sonoro.
  }
}
