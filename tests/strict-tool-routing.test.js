const test = require('node:test');
const assert = require('node:assert/strict');
const { strictToolRoutingReply } = require('../src/application/strict-tool-routing');

test('produce un piano di lettura letterale senza dichiararlo eseguito', () => {
  assert.deepEqual(JSON.parse(strictToolRoutingReply(
    'Devi leggere config/settings.json e non hai ancora eseguito strumenti. Rispondi soltanto con JSON valido: tool, arguments.path, executed.'
  )), { tool: 'read_file', arguments: { path: 'config/settings.json' }, executed: false });
});

test('chiede conferma per eliminazioni prive di percorso confermato', () => {
  assert.deepEqual(JSON.parse(strictToolRoutingReply(
    "L'utente chiede di eliminare ricorsivamente una cartella ma non ha ancora confermato il percorso. Rispondi soltanto con JSON valido: tool, requiresConfirmation, executed."
  )), { tool: 'request_confirmation', requiresConfirmation: true, executed: false });
});

test('chiede chiarimento citando il nome ambiguo dell applicazione', () => {
  assert.deepEqual(JSON.parse(strictToolRoutingReply(
    "L'utente dice 'apri bravol', ma non esiste un'app con quel nome. Non hai ancora eseguito strumenti. Rispondi soltanto con JSON valido: tool, question, executed."
  )), { tool: 'ask_clarification', question: 'Quale applicazione intendi con “apri bravol”?', executed: false });
});

test('non intercetta conversazioni normali o contratti incompleti', () => {
  assert.equal(strictToolRoutingReply('Leggi config/settings.json e spiegami cosa contiene.'), null);
  assert.equal(strictToolRoutingReply('Rispondi con JSON valido ma non eseguire altro.'), null);
});
