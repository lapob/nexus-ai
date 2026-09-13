/** @module remote/pdf-extraction-worker Isolated PDF text extraction with bounded decoded allocations. */
const { parentPort, workerData } = require('node:worker_threads');
const { installPdfAllocationBudget } = require('../security/pdf-allocation-budget');
const consumed = installPdfAllocationBudget();
const parsePdf = require('pdf-parse');

(async () => {
  let outputCharacters = 0;
  const result = await parsePdf(new Uint8Array(workerData), {
    max: 80,
    pagerender: async (page) => {
      const content = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
      let text = '', lastY;
      for (const item of content.items) {
        const value = String(item.str || '');
        outputCharacters += value.length + 1;
        if (outputCharacters > 120_000) throw Object.assign(new Error('PDF output limit exceeded.'), { code: 'PDF_RESOURCE_LIMIT' });
        text += lastY === item.transform[5] || !lastY ? value : `\n${value}`;
        lastY = item.transform[5];
      }
      return text;
    }
  });
  // pdf-parse catches page-render failures internally: reject exhausted
  // budgets explicitly rather than returning a misleading partial success.
  if (outputCharacters > 120_000 || consumed().exceeded) {
    throw Object.assign(new Error('PDF resource limit exceeded.'), { code: 'PDF_RESOURCE_LIMIT' });
  }
  parentPort.postMessage({ text: String(result.text || '').slice(0, 120_000) });
})().catch((error) => parentPort.postMessage({ error: error.code === 'PDF_RESOURCE_LIMIT' || consumed().exceeded ? 'PDF_RESOURCE_LIMIT' : 'PDF_INVALID' }));
