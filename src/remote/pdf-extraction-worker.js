/** @module remote/pdf-extraction-worker Isolated PDF text extraction with bounded decoded allocations; limits arrive from the caller's profile. */
const { parentPort, workerData } = require('node:worker_threads');
const { installPdfAllocationBudget } = require('../security/pdf-allocation-budget');
// Compatibile con il vecchio formato (solo Buffer): valgono i limiti dell'ospite.
const input = Buffer.isBuffer(workerData) || workerData instanceof Uint8Array ? { bytes: workerData } : workerData;
const maxChars = Number(input.maxChars) || 120_000;
const maxPages = Number.isInteger(input.maxPages) ? input.maxPages : 80;
const consumed = installPdfAllocationBudget(Number(input.budgetBytes) || 64 * 1024 * 1024);
const parsePdf = require('pdf-parse');

(async () => {
  let outputCharacters = 0;
  const result = await parsePdf(new Uint8Array(input.bytes), {
    max: maxPages,
    pagerender: async (page) => {
      const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let text = '', lastY;
      for (const item of content.items) {
        const value = String(item.str || '');
        outputCharacters += value.length + 1;
        if (outputCharacters > maxChars) throw Object.assign(new Error('PDF output limit exceeded.'), { code: 'PDF_RESOURCE_LIMIT' });
        text += lastY === item.transform[5] || !lastY ? value : `\n${value}`;
        lastY = item.transform[5];
      }
      return text;
    }
  });
  // pdf-parse catches page-render failures internally: reject exhausted
  // budgets explicitly rather than returning a misleading partial success.
  if (outputCharacters > maxChars || consumed().exceeded) {
    throw Object.assign(new Error('PDF resource limit exceeded.'), { code: 'PDF_RESOURCE_LIMIT' });
  }
  parentPort.postMessage({ text: String(result.text || '').slice(0, maxChars) });
})().catch((error) => parentPort.postMessage({ error: error.code === 'PDF_RESOURCE_LIMIT' || consumed().exceeded ? 'PDF_RESOURCE_LIMIT' : 'PDF_INVALID' }));
