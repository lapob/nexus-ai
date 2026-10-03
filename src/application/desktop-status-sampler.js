/**
 * @module application/desktop-status-sampler
 * @description Shares bounded desktop probes without blocking the authenticated status endpoint.
 */
// #region Cached observations
function createDesktopStatusSampler({ load, initial, onUpdate = () => {}, onError = () => {}, now = Date.now, ttlMs = 1500 }) {
  let snapshot = { ...initial }, sampledAt = null, pending = null, generation = 0, disposed = false;
  function refresh() {
    if (disposed || pending) return pending;
    const revision = generation;
    pending = Promise.resolve().then(load).then(value => {
      if (!disposed && revision === generation) {
        snapshot = { ...value };
        sampledAt = now();
        onUpdate(snapshot);
      }
    }).catch(error => { if (!disposed) onError(error); })
      .finally(() => { pending = null; });
    return pending;
  }
  return {
    read() {
      if (!disposed && (sampledAt === null || now() - sampledAt >= ttlMs)) void refresh();
      return { ...snapshot };
    },
    patch(value) {
      if (disposed) return;
      generation++;
      snapshot = { ...snapshot, ...value };
      sampledAt = null;
    },
    refresh,
    dispose() { disposed = true; generation++; }
  };
}
// #endregion
// #region Public contract
module.exports = { createDesktopStatusSampler };
// #endregion
