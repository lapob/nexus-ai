/**
 * @module scripts/lib/evaluation-isolation
 * @description Limiti delle valutazioni locali: niente endpoint del servizio o contesa GPU.
 */
function evaluationPlan({ endpoint = 'http://127.0.0.1:11435', activeEndpoint = '', freeBytes, modelBytes }) {
  const url = new URL(endpoint);
  const loopback = ['localhost', '127.0.0.1', '[::1]'];
  if (url.protocol !== 'http:' || !loopback.includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('La valutazione richiede un endpoint HTTP loopback dedicato.');
  }
  if (activeEndpoint && url.port === new URL(activeEndpoint).port) throw new Error('Valutazione rifiutata: endpoint del servizio attivo.');
  const cpuOnly = Boolean(activeEndpoint);
  const requiredBytes = Math.max(2 * 2 ** 30, cpuOnly ? modelBytes * 1.25 + 2 * 2 ** 30 : 2 * 2 ** 30);
  if (!Number.isFinite(freeBytes) || !Number.isFinite(modelBytes) || freeBytes < requiredBytes) {
    throw new Error(`RAM insufficiente per valutazione isolata: servono ${(requiredBytes / 2 ** 30).toFixed(1)} GiB liberi. Nessun modello caricato.`);
  }
  return { endpoint: url.origin, cpuOnly, requiredBytes, options: cpuOnly ? { num_gpu: 0 } : {} };
}
module.exports = { evaluationPlan };
