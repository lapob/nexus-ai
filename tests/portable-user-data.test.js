const test = require('node:test');
const assert = require('node:assert/strict');
const { argumentUserDataRoot, externalNexusDataRoot } = require('../src/infrastructure/storage/portable-user-data');

test('i dati NexusNXS seguono automaticamente il progetto sull SSD esterno', () => {
  const executable = 'R:\\Portable\\NexusNXS\\.AI\\release\\win-unpacked\\NexusNXS.exe';
  assert.equal(externalNexusDataRoot(executable), 'R:\\Portable\\NexusNXS\\.nexus-data');
});

test('un percorso dati esplicito prevale senza dipendere dalla lettera del disco', () => {
  assert.equal(argumentUserDataRoot(['NexusNXS.exe', '--user-data-root=X:\\NexusData']), 'X:\\NexusData');
});
