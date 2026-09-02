/**
 * @module renderer/systems/StartupMetrics
 * @description Timeline locale e anonima del cold start per regressioni prestazionali.
 */

const START = 'nexus:start';
const STORAGE_KEY = 'nexus.startup.metrics.v1';

if (!performance.getEntriesByName(START).length) performance.mark(START);

export function markStartup(name: 'shell' | 'interactive' | 'webgl-requested' | 'webgl-ready'): number {
  const mark = `nexus:${name}`;
  if (!performance.getEntriesByName(mark).length) performance.mark(mark);
  const durationMs = Math.round(performance.getEntriesByName(mark)[0]?.startTime || performance.now());
  if (name === 'webgl-ready') {
    try {
      const previous = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      const entry = {
        recordedAt: Date.now(),
        shellMs: Math.round(performance.getEntriesByName('nexus:shell')[0]?.startTime || 0),
        interactiveMs: Math.round(performance.getEntriesByName('nexus:interactive')[0]?.startTime || 0),
        webglMs: durationMs
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...Array.isArray(previous) ? previous : [], entry].slice(-10)));
    } catch { /* Le metriche non devono mai influire sull'avvio. */ }
  }
  return durationMs;
}

export function startupMetrics(): ReadonlyArray<{ recordedAt: number; shellMs: number; interactiveMs: number; webglMs: number }> {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.slice(-10) : [];
  } catch { return []; }
}
