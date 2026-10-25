/** @module remote/public-interaction-metrics Bounded, in-memory responsiveness observations; no event contents or uploads. */
// #region Event Timing observations
function observePublicInteractions({ maximumLatencyMs = 200, minimumSamples = 10, limit = 200 } = {}) {
  limit = Number.isSafeInteger(limit) ? Math.max(10, Math.min(200, limit)) : 200;
  const records = new Map(), observers = [];
  let supported = false, longTasks = 0, longTaskMs = 0, disposed = false, scriptErrors = 0, unhandledRejections = 0;
  // Count only; never inspect messages, filenames, rejected values or stacks.
  const error = () => { if (!disposed) scriptErrors = Math.min(1000000, scriptErrors + 1); };
  const rejection = () => { if (!disposed) unhandledRejections = Math.min(1000000, unhandledRejections + 1); };
  addEventListener('error', error); addEventListener('unhandledrejection', rejection);
  const snapshot = () => {
    const durations = [...records.values()].sort((a, b) => a - b), count = durations.length;
    const ready = supported && count >= minimumSamples;
    return Object.freeze({
      status: !supported ? 'unsupported' : ready ? 'observed-window' : 'insufficient',
      observedInteractions: count, maximumRecords: limit, maximumLatencyMs,
      worstInteractionMs: count ? durations[count - 1] : null,
      p95InteractionMs: count ? durations[Math.ceil(count * .95) - 1] : null,
      passing: ready ? durations[Math.ceil(count * .95) - 1] <= maximumLatencyMs : null,
      longTasks, longTaskMs: Math.round(longTaskMs), scriptErrors, unhandledRejections,
      scope: 'recent-observed-events-not-field-inp', persisted: false, uploaded: false
    });
  };
  if (typeof PerformanceObserver === 'function') {
    try {
      const events = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!Number.isSafeInteger(entry.interactionId) || entry.interactionId <= 0 || !Number.isFinite(entry.duration) || entry.duration < 0) continue;
          records.set(entry.interactionId, Math.max(records.get(entry.interactionId) || 0, entry.duration));
          if (records.size > limit) records.delete(records.keys().next().value);
        }
      });
      const options = { type: 'event', buffered: true, durationThreshold: 16 };
      events.observe(options); supported = true; observers.push({ observer: events, options });
    } catch { /* Unsupported browsers retain the same interface without synthetic measurements. */ }
    try {
      const tasks = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) if (Number.isFinite(entry.duration) && entry.duration >= 0) {
          longTasks++; longTaskMs += entry.duration;
        }
      });
      const options = { type: 'longtask', buffered: true };
      tasks.observe(options); observers.push({ observer: tasks, options });
    } catch { /* Long Tasks is optional and independent from Event Timing. */ }
  }
  const pause = () => observers.forEach(({ observer }) => observer.disconnect());
  const stop = () => { disposed = true; pause(); globalThis.removeEventListener?.('error', error); globalThis.removeEventListener?.('unhandledrejection', rejection); };
  addEventListener('pagehide', event => { if (event.persisted) pause(); else stop(); });
  addEventListener('pageshow', event => {
    if (event.persisted && !disposed) for (const { observer, options } of observers) {
      try { observer.observe({ ...options, buffered: false }); } catch { /* Restoration must not affect navigation. */ }
    }
  });
  return Object.freeze({ snapshot, stop });
}
// #endregion
module.exports = { observePublicInteractions };
