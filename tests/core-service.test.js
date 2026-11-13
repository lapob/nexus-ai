/**
 * @module tests/core-service
 * @description Il server resta un servizio di sistema: l'app desktop lo risveglia, non lo sostituisce.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { wakeServerCore } = require('../src/infrastructure/electron/core-service');

const fake = (answers) => {
  const calls = [];
  return { calls, exec: async (file, args) => { calls.push(args.slice(0, 3).join(' ')); return answers(args); } };
};

test('attività già in esecuzione: nessun secondo avvio', async () => {
  const { exec, calls } = fake(() => ({ ok: true, stdout: '"\\NexusNXS Server","N/A","Running"' }));
  assert.equal(await wakeServerCore({ platform: 'win32', exec }), 'NexusNXS Server');
  assert.deepEqual(calls, ['/Query /TN NexusNXS Server']);
});

test('attività presente ma ferma: viene avviata e l\'app resta client', async () => {
  const { exec, calls } = fake((args) => ({ ok: true, stdout: args[0] === '/Query' ? '"\\NexusNXS Server","N/A","Ready"' : 'SUCCESS' }));
  assert.equal(await wakeServerCore({ platform: 'win32', exec }), 'NexusNXS Server');
  assert.deepEqual(calls, ['/Query /TN NexusNXS Server', '/Run /TN NexusNXS Server']);
});

test('nessun servizio installato o altro sistema: comportamento autonomo invariato', async () => {
  const { exec } = fake(() => ({ ok: false, stdout: '' }));
  assert.equal(await wakeServerCore({ platform: 'win32', exec }), null);
  assert.equal(await wakeServerCore({ platform: 'linux', exec }), null);
});

test('attività non avviabile: null, così l\'app non resta senza servizio', async () => {
  const { exec } = fake((args) => ({ ok: args[0] === '/Query', stdout: 'Ready' }));
  assert.equal(await wakeServerCore({ platform: 'win32', exec }), null);
});

test('la UI non apre il gateway quando il servizio server esiste', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'bootstrap.js'), 'utf8');
  const branch = source.indexOf('await wakeServerCore(');
  const ownGateway = source.indexOf('remoteGateway.start()\n            .then', branch);
  assert.ok(branch > 0 && ownGateway > branch, 'il risveglio del servizio viene prima del gateway posseduto dalla UI');
});
