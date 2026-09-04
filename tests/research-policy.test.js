const test = require('node:test');
const assert = require('node:assert/strict');
const { researchIntent, webResearchPolicy } = require('../src/research/research-policy');

test('richiede il web per richieste esplicite e informazioni temporali', () => {
  assert.equal(webResearchPolicy({ question: 'Cerca sul web le ultime novità sui modelli', mode: 'deep' }).level, 'required');
  assert.equal(webResearchPolicy({ question: 'Chi è il CEO attuale della società?', mode: 'fast' }).reason, 'time-sensitive');
  assert.equal(webResearchPolicy({ question: 'Qual è il risultato sportivo della partita di oggi?' }).reason, 'time-sensitive');
  assert.equal(researchIntent('Verifica le fonti online').explicit, true);
});

test('non rallenta domande stabili o operazioni locali', () => {
  assert.equal(webResearchPolicy({ question: 'Spiegami il teorema di Pitagora' }).level, 'none');
  assert.equal(webResearchPolicy({ question: 'Rispondi soltanto con il risultato numerico di 17 per 19.' }).level, 'none');
  assert.equal(webResearchPolicy({ question: 'Modifica questo file del progetto', workspaceActive: true }).reason, 'local-context');
  assert.equal(webResearchPolicy({ question: 'Spiega come organizzare un piccolo progetto software. Concludi con FINE VERIFICA.' }).level, 'none');
  assert.equal(webResearchPolicy({ question: 'Verifica il risultato di 17 per 19' }).level, 'none');
  assert.equal(webResearchPolicy({ question: 'Controlla questo ragionamento matematico' }).level, 'none');
  assert.equal(webResearchPolicy({ question: 'Verifica online questa informazione' }).level, 'required');
});

test('non invia sul web richieste che contengono segreti o percorsi locali', () => {
  assert.equal(webResearchPolicy({ question: 'Cerca C:\\Users\\utente\\segreto.txt sul web' }).reason, 'privacy-boundary');
  assert.equal(webResearchPolicy({ question: 'Verifica api_key=supersegreto123456 online' }).reason, 'privacy-boundary');
});
