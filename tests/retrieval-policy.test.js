const test = require('node:test');
const assert = require('node:assert/strict');
const { lexicalCoverage, hasStrongLexicalContext, shouldUseSemanticRetrieval, shouldExpandWithPlanner } = require('../src/application/retrieval-policy');

const strongSources = [{
  title: 'Prestazioni AI', heading: 'Ottimizzazione del modello',
  text: 'Ridurre latenza e migliorare prestazioni del modello.',
  tokens: ['prestazioni', 'ottimizzazione', 'modello', 'ridurre', 'latenza', 'migliorare'], score: 8
}];

test('misura la copertura lessicale del contesto recuperato', () => {
  assert.ok(lexicalCoverage('ottimizzazione prestazioni modello', strongSources) >= 0.9);
  assert.equal(hasStrongLexicalContext('ottimizzazione prestazioni modello', strongSources), true);
});

test('non usa un planner di ricerca per debug e lavoro operativo', () => {
  const request = { question: 'Debugga e ottimizza il codice dell app', mode: 'deep', sources: [], tier: 'ultra' };
  assert.equal(shouldUseSemanticRetrieval({ ...request, embeddingModel: 'nomic-embed-text' }), false);
  assert.equal(shouldExpandWithPlanner({ ...request, hasAttachment: false }), false);
  assert.equal(shouldUseSemanticRetrieval({ ...request, sources: strongSources, embeddingModel: 'nomic-embed-text' }), false);
});

test('espande una ricerca approfondita soltanto quando il contesto e debole', () => {
  const request = { question: 'Ricerca fonti e approfondisci la letteratura sui transformer', mode: 'deep', tier: 'ultra', hasAttachment: false };
  assert.equal(shouldExpandWithPlanner({ ...request, sources: [] }), true);
  assert.equal(shouldExpandWithPlanner({ ...request, sources: strongSources }), true);
  assert.equal(shouldExpandWithPlanner({ ...request, sources: [], hasAttachment: true }), false);
  assert.equal(shouldUseSemanticRetrieval({ ...request, sources: [], embeddingModel: 'nomic-embed-text' }), true);
});
