/**
 * Rilevatore di interruzione vocale (barge-in): decide quando l'utente sta davvero parlando sopra
 * la voce di NexusNXS. Puro e senza dipendenze dal browser, così è verificabile con i test.
 *
 * - Soglia adattiva: si calibra sul rumore di fondo del microfono (eco residua inclusa) invece di un
 *   valore fisso che fallisce con microfoni molto sensibili o molto deboli.
 * - Avvio protetto: nei primi istanti la voce appena partita può filtrare dall'altoparlante.
 * - Tolleranza alle pause: il parlato ha brevi cali fra le sillabe, che non azzerano il conteggio.
 */
export interface BargeInOptions {
  /** Millisecondi iniziali in cui si calibra e non si interrompe. */
  warmupMs?: number;
  /** Parlato continuo (pause brevi incluse) necessario per interrompere. */
  speechMs?: number;
  /** Pausa oltre la quale il parlato accumulato si azzera. */
  gapMs?: number;
  /** Soglia minima e massima di RMS, e quante volte sopra il fondo deve stare la voce. */
  minRms?: number;
  maxRms?: number;
  ratio?: number;
}

export interface BargeInDetector {
  /** Aggiunge una misura RMS a `elapsedMs` dall'inizio; vero quando l'utente ha interrotto. */
  push: (rms: number, elapsedMs: number) => boolean;
  /** Soglia corrente, utile per diagnosi e test. */
  threshold: () => number;
}

export function createBargeInDetector(options: BargeInOptions = {}): BargeInDetector {
  const warmupMs = options.warmupMs ?? 350;
  const speechMs = options.speechMs ?? 300;
  const gapMs = options.gapMs ?? 140;
  const minRms = options.minRms ?? 0.03;
  const maxRms = options.maxRms ?? 0.18;
  const ratio = options.ratio ?? 3.2;
  let floor = 0;
  let warmup: number[] | null = [];
  let loud = 0;
  let gap = 0;
  let last = -1;
  let fired = false;
  const threshold = () => Math.min(maxRms, Math.max(minRms, floor * ratio));
  return {
    threshold,
    push(rms, elapsedMs) {
      if (fired) return true;
      const value = Number.isFinite(rms) && rms > 0 ? rms : 0;
      const step = last < 0 ? 0 : Math.max(0, Math.min(250, elapsedMs - last));
      last = elapsedMs;
      if (elapsedMs < warmupMs) {
        warmup?.push(value);
        return false;
      }
      if (warmup) {
        // Mediana dell'avvio: un'eco forte della voce appena partita non gonfia la soglia per secondi.
        const sorted = warmup.sort((a, b) => a - b);
        floor = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
        warmup = null;
      }
      if (value > threshold()) {
        loud += step;
        gap = 0;
      } else {
        gap += step;
        if (gap > gapMs) loud = 0;
        // Solo i momenti di quiete aggiornano il fondo, lentamente: la voce dell'utente non alza la soglia.
        floor = floor * 0.97 + value * 0.03;
      }
      if (loud >= speechMs) fired = true;
      return fired;
    }
  };
}
