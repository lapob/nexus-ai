/**
 * @module renderer/systems/AudioEnvelope
 * @description Converte l'RMS del microfono in un livello percettivo continuo e indipendente dall'hardware.
 */

// #region 01 — Curva percettiva

export function normalizedVoiceLevel(rms: number, noiseFloor: number, sensitivity = 1): number {
  const safeRms = Math.max(0, Number(rms) || 0);
  const safeFloor = Math.max(0.001, Math.min(0.12, Number(noiseFloor) || 0.018));
  const safeSensitivity = Math.max(0.7, Math.min(1.35, Number(sensitivity) || 1));
  // Una zona neutra leggermente più ampia evita che rumore, respiro o piccoli
  // cambi di volume facciano espandere l'intera scena. La curva resta
  // progressiva e conserva dettaglio nella voce bassa senza saturare presto.
  const signal = Math.max(0, safeRms - safeFloor - 0.006);
  const logarithmic = Math.log1p(signal * 24) / Math.log1p(0.24 * 24);
  return Math.max(0, Math.min(0.9, Math.pow(Math.min(1, logarithmic), 0.9) * safeSensitivity));
}

export function smoothVoiceLevel(previous: number, target: number): number {
  const safePrevious = Math.max(0, Math.min(1, previous));
  const safeTarget = Math.max(0, Math.min(1, target));
  const coefficient = safeTarget > safePrevious ? 0.09 : 0.055;
  const next = safePrevious + ((safeTarget - safePrevious) * coefficient);
  return next < 0.002 ? 0 : next;
}

export function trimVoiceSignal(input: Float32Array, sampleRate: number): Float32Array {
  if (input.length < sampleRate * 0.35) return input;
  const frameSize = Math.max(80, Math.round(sampleRate * 0.02));
  const energies: number[] = [];
  let peakRms = 0;
  for (let offset = 0; offset < input.length; offset += frameSize) {
    let squareTotal = 0;
    const end = Math.min(input.length, offset + frameSize);
    for (let index = offset; index < end; index += 1) squareTotal += input[index] * input[index];
    const rms = Math.sqrt(squareTotal / Math.max(1, end - offset));
    energies.push(rms);
    peakRms = Math.max(peakRms, rms);
  }
  // La soglia relativa funziona con microfoni da notebook, headset e input
  // professionali. Il minimo assoluto impedisce di ritagliare il solo rumore.
  const threshold = Math.max(0.0032, peakRms * 0.065);
  let first = energies.findIndex((energy) => energy >= threshold);
  let last = energies.length - 1;
  while (last >= 0 && energies[last] < threshold) last -= 1;
  if (first < 0 || last < first) return input;
  const paddingFrames = Math.ceil(0.38 / (frameSize / sampleRate));
  first = Math.max(0, first - paddingFrames);
  last = Math.min(energies.length - 1, last + paddingFrames);
  const start = first * frameSize;
  const end = Math.min(input.length, (last + 1) * frameSize);
  // Non consegnare a Whisper ritagli microscopici prodotti da un click.
  return end - start >= sampleRate * 0.32 ? input.slice(start, end) : input;
}

// #endregion
