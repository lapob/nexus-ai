/** @module security/bounded-response Bounded consumption shared by providers and signed feeds. */
// #region Stream ingestion
async function boundedResponseBytes(response, maximumBytes, label, signal) {
  const cancelBody = () => { void response?.body?.cancel?.().catch(() => {}); };
  if (!response?.ok) { cancelBody(); throw new Error(`${label} non disponibile.`); }
  const declaredLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    cancelBody(); throw new Error(`${label} troppo grande.`);
  }
  if (!response.body?.getReader) throw new Error(`${label} senza flusso leggibile.`);
  if (signal?.aborted) { cancelBody(); signal.throwIfAborted(); }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const chunks = []; let bytes = 0; let complete = false;
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes > maximumBytes) throw new Error(`${label} troppo grande.`);
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}
async function boundedResponseText(response, maximumBytes, label, signal) {
  return new TextDecoder().decode(await boundedResponseBytes(response, maximumBytes, label, signal));
}
module.exports = { boundedResponseBytes, boundedResponseText };
// #endregion
