const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { argumentUserDataRoot, externalNexusDataRoot } = require('../src/infrastructure/storage/portable-user-data');

test('i dati NexusNXS seguono automaticamente il progetto sull SSD esterno', () => {
  const portable = process.platform === 'win32' ? 'R:\\Portable\\NexusNXS' : '/opt/portable/NexusNXS';
  const executable = path.join(portable, '.AI', 'release', 'win-unpacked', 'NexusNXS.exe');
  assert.equal(externalNexusDataRoot(executable), path.join(portable, '.nexus-data'));
});

test('un percorso dati esplicito prevale senza dipendere dalla lettera del disco', () => {
  const expected = process.platform === 'win32' ? 'X:\\NexusData' : '/opt/nexus-data';
  assert.equal(argumentUserDataRoot(['NexusNXS.exe', `--user-data-root=${expected}`]), expected);
});
