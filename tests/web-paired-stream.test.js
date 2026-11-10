/**
 * @module tests/web-paired-stream
 * @description Lo stream NDJSON del telefono associato: token in ordine anche con righe spezzate tra i chunk, fasi reali, interruzione segnalata.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = () => import(pathToFileURL(path.join(__dirname, '..', 'web', 'src', 'paired.ts')).href);

test('stato del PC: 503 "offline" blocca l’invio, gli altri errori sono avvio', async () => {
  const { readStatus } = await load();
  const reply = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });
  assert.equal(await readStatus(reply(200, {})), 'ready');
  assert.equal(await readStatus(reply(503, { status: 'offline', retryAfter: 8 })), 'offline');
  assert.equal(await readStatus(reply(503, { status: 'starting' })), 'preparing');
  assert.equal(await readStatus(reply(502)), 'offline');
  assert.equal(await readStatus(new Response('<html>', { status: 503 })), 'preparing', 'corpo non JSON');
});
const streamOf = (chunks) => new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } });

test('ricompone token e fasi anche quando una riga è divisa tra due chunk', async () => {
  const { consumeStream } = await load();
  const events = [];
  await consumeStream(streamOf([
    '{"type":"phase","activity":{"text":"Cerco nei documenti","phase":"work"}}\n{"type":"tok',
    'en","token":"Ciao ","cursor":5}\n{"type":"heartbeat"}\n{"type":"token","token":"mondo","cursor":10}\n',
    '{"type":"phase","activity":{"text":"Risposta pronta","phase":"done"}}\n{"type":"complete","message":"Ciao mondo"}'
  ]), (event) => events.push(event));
  assert.deepEqual(events, [
    { type: 'phase', label: 'Cerco nei documenti' },
    { type: 'token', token: 'Ciao ', cursor: 5 },
    { type: 'token', token: 'mondo', cursor: 10 },
    { type: 'complete', message: 'Ciao mondo', sources: [] }
  ]);
});

test('senza evento finale segnala l’interruzione invece di lasciare la risposta appesa', async () => {
  const { consumeStream } = await load();
  const events = [];
  await consumeStream(streamOf(['{"type":"token","token":"Mezza","cursor":5}\n']), (event) => events.push(event));
  assert.equal(events.at(-1).type, 'error');
  assert.match(events.at(-1).error, /interrotta/);
});
