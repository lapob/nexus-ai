const test = require('node:test');
const assert = require('node:assert/strict');
const { researchIntent, webResearchPolicy } = require('../src/research/research-policy');

test('richiede il web per richieste esplicite e informazioni temporali', () => {
  assert.equal(webResearchPolicy({ question: 'Cerca sul web le ultime novità sui modelli', mode: 'deep' }).level, 'required');
  assert.equal(webResearchPolicy({ question: 'Chi è il CEO attuale della società?', mode: 'fast' }).reason, 'time-sensitive');
  assert.equal(webResearchPolicy({ question: 'Qual è il risultato sportivo della partita di oggi?' }).reason, 'time-sensitive');
  assert.equal(researchIntent('Verifica le fonti online').explicit, true);
  assert.equal(webResearchPolicy({ question: 'Spiegalo con una fonte web affidabile' }).level, 'required');
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

test('le priorità personali di oggi non richiedono una ricerca pubblica', () => {
  for (const question of [
    'Ho poco tempo: aiutami a organizzare tre priorità per oggi. Prima fammi una sola domanda utile.',
    'Help me plan my priorities today. Ask me one question first.',
    'Organizza la mia agenda di oggi'
  ]) assert.equal(webResearchPolicy({ question }).level, 'none', question);
  for (const question of [
    'Organizza la giornata considerando il meteo di oggi a Roma',
    'Plan my day around the latest weather forecast',
    'Cerca online come organizzare le priorità di oggi',
    'Pianifica il viaggio considerando gli scioperi di oggi'
  ]) assert.equal(webResearchPolicy({ question }).level, 'required', question);
});
