/** @module remote/pdf-extraction Cancellable PDF worker lifecycle, input, heap and elapsed-time limits. */
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const failure = (code) => Object.assign(new Error(code === 'ABORT_ERR' ? 'Richiesta annullata.' : 'Il PDF supera i limiti di elaborazione o non è leggibile.'), { code, ...(code === 'ABORT_ERR' ? { name: 'AbortError' } : {}) });

function extractPdfText(bytes, { signal, timeoutMs = 8000, WorkerClass = Worker } = {}) {
  if (signal?.aborted) return Promise.reject(failure('ABORT_ERR'));
  if (!Buffer.isBuffer(bytes) || bytes.length > 1_500_000 || bytes.length < 5 || bytes.toString('ascii', 0, 5) !== '%PDF-') return Promise.reject(failure('PDF_INVALID'));
  return new Promise((resolve, reject) => {
    let worker;
    try {
      worker = new WorkerClass(path.join(__dirname, 'pdf-extraction-worker.js'), {
        workerData: bytes,
        resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 }
      });
    } catch { reject(failure('PDF_UNAVAILABLE')); return; }
    let settled = false;
    const finish = async (error, text) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      // Keep the request slot until termination completes; failed parsers
      // must not accumulate behind subsequent requests.
      try { await worker.terminate(); } catch (terminationError) { reject(terminationError); return; }
      if (error) reject(error); else resolve({ text });
    };
    const abort = () => { void finish(failure('ABORT_ERR')); };
    const timer = setTimeout(() => { void finish(failure('PDF_TIMEOUT')); }, Math.max(1, Math.min(8000, timeoutMs)));
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', (value) => {
      if (value?.error) void finish(failure(value.error));
      else if (typeof value?.text !== 'string' || value.text.length > 120_000) void finish(failure('PDF_RESOURCE_LIMIT'));
      else void finish(null, value.text);
    });
    worker.once('error', () => { void finish(failure('PDF_RESOURCE_LIMIT')); });
    worker.once('exit', () => { if (!settled) void finish(failure('PDF_UNAVAILABLE')); });
    if (signal?.aborted) abort();
  });
}
module.exports = { extractPdfText };
