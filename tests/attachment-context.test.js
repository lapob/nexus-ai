const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { fitAttachmentContext, FILE_SEPARATOR } = require('../src/application/attachment-context');
const { extractAttachmentAsync } = require('../src/application/attachments');
const { validateChatRequest } = require('../src/ai/ai-provider');

test('un allegato che entra nel contesto resta intero', () => {
  const text = 'ALLEGATO FILE: note.md\n\nFILE: note.md\nbreve contenuto';
  assert.equal(fitAttachmentContext(text, 'riassumi', 50_000), text);
});

test('un file enorme conserva inizio e passaggi pertinenti, dichiarando le omissioni', () => {
  const filler = 'Paragrafo di contorno senza informazioni utili. '.repeat(40);
  const sections = Array.from({ length: 400 }, (_, index) => index === 287
    ? `Sezione ${index}: il codice di attivazione del reattore è ORS-5521. ${filler}`
    : `Sezione ${index}: ${filler}`);
  const text = `ALLEGATO FILE: manuale.txt\n\nFILE: manuale.txt\nIndice generale del manuale.\n${sections.join('\n')}`;
  assert.ok(text.length > 700_000);
  const fitted = fitAttachmentContext(text, 'Qual è il codice di attivazione del reattore?', 30_000);
  assert.ok(fitted.length <= 32_000, `lunghezza ${fitted.length}`);
  assert.match(fitted, /Indice generale del manuale/, 'l’inizio del file resta come orientamento');
  assert.match(fitted, /ORS-5521/, 'il passaggio pertinente entra nel contesto');
  assert.match(fitted, /estratti pertinenti: \d+ sezioni su \d+/);
  assert.match(fitted, /\[…\]/);
});

test('con più file ogni file mantiene la propria intestazione', () => {
  const big = (name, needle) => `ALLEGATO FILE: ${name}\n\nFILE: ${name}\n${'riga neutra di riempimento. '.repeat(4_000)}${needle}${'altra riga neutra. '.repeat(4_000)}`;
  const fitted = fitAttachmentContext([big('a.txt', 'budget trimestrale 42.000'), big('b.txt', 'fornitore Rossi')].join(FILE_SEPARATOR), 'budget trimestrale', 20_000);
  assert.match(fitted, /ALLEGATO FILE: a\.txt/);
  assert.match(fitted, /ALLEGATO FILE: b\.txt/);
  assert.match(fitted, /budget trimestrale 42\.000/);
});

test('il desktop legge file grandi per intero e il provider accetta il contesto adattato', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-att-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'registro.log');
  fs.writeFileSync(file, `${'evento normale\n'.repeat(200_000)}ERRORE CRITICO 0xDEAD alla riga finale\n`);
  const extracted = await extractAttachmentAsync(file);
  assert.ok(extracted.size > 2_000_000);
  assert.match(extracted.content, /ERRORE CRITICO 0xDEAD/, 'nessun taglio a 96 KB');
  const secret = path.join(dir, '.env');
  fs.writeFileSync(secret, 'TOKEN=segreto');
  assert.match((await extractAttachmentAsync(secret)).content, /Contenuto non incluso \(sensibile\)/);
  const fitted = fitAttachmentContext(extracted.content, 'trova l errore critico', 48_000);
  assert.match(fitted, /0xDEAD/);
  // Prima un messaggio oltre 12.000 caratteri veniva rifiutato come "non valido".
  assert.doesNotThrow(() => validateChatRequest({ requestId: 'r1', messages: [{ role: 'user', content: `domanda\n${fitted}` }] }));
});

test('i PDF del proprietario usano il profilo esteso, gli ospiti restano limitati', async (t) => {
  const { PDF_PROFILES } = require('../src/remote/pdf-extraction');
  assert.equal(PDF_PROFILES.guest.maxBytes, 1_500_000);
  assert.ok(PDF_PROFILES.owner.maxBytes >= 1024 * 1024 * 1024);
  assert.equal(PDF_PROFILES.owner.maxPages, 0, 'tutte le pagine');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pdf-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'doc.pdf');
  fs.writeFileSync(file, '%PDF-1.4 finto');
  let profile;
  const extracted = await extractAttachmentAsync(file, { extractPdf: async (_bytes, options) => { profile = options.profile; return { text: 'testo del PDF' }; } });
  assert.equal(profile, 'owner');
  assert.match(extracted.content, /testo del PDF/);
});
