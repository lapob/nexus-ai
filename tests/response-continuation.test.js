const test = require('node:test');
const assert = require('node:assert/strict');
const { createContinuationTokenPublisher, continuationDelta, continuationMessages } = require('../src/application/response-continuation');

test('la continuazione riparte dal testo precedente e richiede una chiusura naturale', () => {
  const messages = continuationMessages([{ role: 'user', content: 'Scrivi una guida.' }], 'Prima parte');
  assert.equal(messages.at(-2).role, 'assistant');
  assert.equal(messages.at(-2).content, 'Prima parte');
  assert.match(messages.at(-1).content, /frase conclusiva completa/);
});

test('la continuazione elimina un eventuale prefisso ripetuto senza spezzare parole', () => {
  assert.equal(continuationDelta('Menu di navigazione: Int', 'Interattivo e accessibile.'), 'erattivo e accessibile.');
  assert.equal(continuationDelta('Testo completo. ', 'Nuova sezione.'), 'Nuova sezione.');
});

test('il contesto di ripresa resta entro il limite del provider', () => {
  const messages = continuationMessages([], 'x'.repeat(40_000));
  assert.equal(messages[0].content.length, 11_000);
  assert.ok(messages.every((message) => message.content.length <= 12_000));
});

test('la continuazione viene pubblicata progressivamente senza ripetere il confine', () => {
  const chunks = [];
  const publisher = createContinuationTokenPublisher('Menu di navigazione: Int', (chunk) => chunks.push(chunk));
  publisher.onToken('Int');
  assert.deepEqual(chunks, []);
  publisher.onToken('erattivo ');
  publisher.onToken('e accessibile.');
  assert.equal(publisher.complete('Interattivo e accessibile.'), 'erattivo e accessibile.');
  assert.equal(chunks.join(''), 'erattivo e accessibile.');
});

test('una continuazione nuova inizia lo stream senza attendere la fine del segmento', () => {
  const chunks = [];
  const publisher = createContinuationTokenPublisher('Prima parte.', (chunk) => chunks.push(chunk));
  publisher.onToken('Nuova');
  assert.equal(chunks.join(''), 'Nuova');
  publisher.onToken(' parte.');
  assert.equal(publisher.complete('Nuova parte.'), 'Nuova parte.');
  assert.equal(chunks.join(''), 'Nuova parte.');
});
