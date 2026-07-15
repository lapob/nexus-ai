const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePlannerOutput, mergeSources } = require('../src/reasoning');

test('estrae sotto-query JSON anche da fence Markdown', () => {
  assert.deepEqual(parsePlannerOutput('```json\n{"search_queries":["RAG locale","sicurezza NEXUS"]}\n```'), ['RAG locale', 'sicurezza NEXUS']);
  assert.throws(() => parsePlannerOutput('testo non JSON'));
});

test('unisce fonti duplicate conservando il punteggio migliore', () => {
  const low = { relativePath: 'A.md', heading: 'H', score: 1 };
  const high = { relativePath: 'A.md', heading: 'H', score: 4 };
  const other = { relativePath: 'B.md', heading: 'X', score: 2 };
  assert.deepEqual(mergeSources([[low, other], [high]], 8), [high, other]);
});
