const test = require('node:test');
const assert = require('node:assert/strict');
const { deflateSync } = require('node:zlib');
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const { extractPdfText } = require('../src/remote/pdf-extraction');

function pdf(content, compressed = false) {
  const stream = compressed ? deflateSync(content) : Buffer.from(content);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    Buffer.concat([Buffer.from(`<< /Length ${stream.length}${compressed ? ' /Filter /FlateDecode' : ''} >>\nstream\n`), stream, Buffer.from('\nendstream')])
  ];
  const chunks = [Buffer.from(`%PDF-1.4\n%${'fixture '.repeat(160)}\n`)], offsets = [0];
  let size = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(size);
    const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.from(body), Buffer.from('\nendobj\n')]);
    chunks.push(object); size += object.length;
  });
  chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

test('PDF parser extracts normal documents and survives rejected compressed expansion', async () => {
  const normal = pdf('BT /F1 12 Tf 20 200 Td (Nexus document) Tj ET');
  assert.match((await extractPdfText(normal)).text, /Nexus document/);
  const segmented = await extractPdfText(pdf('BT /F1 12 Tf 20 200 Td (INV-) Tj (123) Tj ET'));
  assert.match(segmented.text, /INV-123/);
  const compressed = pdf(Buffer.alloc(40 * 1024 * 1024, 32), true);
  assert.ok(compressed.length < 1_500_000);
  await assert.rejects(extractPdfText(compressed), { code: 'PDF_RESOURCE_LIMIT' });
  assert.match((await extractPdfText(normal)).text, /Nexus document/);
});

test('PDF timeout and abort terminate worker before settling', async () => {
  const bytes = pdf('BT /F1 12 Tf 20 200 Td (Nexus) Tj ET');
  await assert.rejects(extractPdfText(bytes, { timeoutMs: 1 }), { code: 'PDF_TIMEOUT' });
  const controller = new AbortController();
  const promise = extractPdfText(bytes, { signal: controller.signal }); controller.abort();
  await assert.rejects(promise, { code: 'ABORT_ERR' });
  await assert.rejects(extractPdfText(bytes, { signal: controller.signal }), { code: 'ABORT_ERR' });
});

test('allocation budget records swallowed errors and native copies inside worker only', async () => {
  const modulePath = path.resolve(__dirname, '../src/security/pdf-allocation-budget.js');
  const worker = new Worker(`const {parentPort,workerData}=require('node:worker_threads'); const stats=require(workerData).installPdfAllocationBudget(100); const a=new Uint8Array(60); let code; try { a.slice(); } catch(e) {code=e.code;} parentPort.postMessage({code,stats:stats()});`, { eval: true, workerData: modulePath });
  const result = await new Promise((resolve, reject) => { worker.once('message', resolve); worker.once('error', reject); });
  await worker.terminate();
  assert.equal(result.code, 'PDF_RESOURCE_LIMIT');
  assert.equal(result.stats.exceeded, true);
  assert.equal(new Uint8Array(1024).length, 1024);
});
