/** @module tests/knowledge-benchmark-cases Guard retrieval measurements against invalid test corpora. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateKnowledgeBenchmarkCases, loadKnowledgeBenchmarkCases } = require('../scripts/lib/knowledge-benchmark-cases');

const valid = () => ({ query: 'Come verifico un backup prima del ripristino?', expectedPath: 'Guide/Backup', requiresSourceEvidence: false });
test('accetta domande distinte anche se riguardano la stessa fonte', () => {
  assert.equal(validateKnowledgeBenchmarkCases([valid(), { ...valid(), query: 'Come conservo la versione precedente?' }]).length, 2);
});
for (const cases of [[], {}, [null], [{ ...valid(), query: '' }], [{ ...valid(), expectedPath: '' }],
  [{ ...valid(), expectedPath: '../segreti' }], [{ ...valid(), expectedPath: 'C:\\segreti' }],
  [{ ...valid(), requiresSourceEvidence: 'false' }], [valid(), { ...valid(), query: valid().query.toUpperCase() }]]) {
  test(`rifiuta corpus incompleto o ambiguo ${JSON.stringify(cases)}`, () => {
    assert.throws(() => validateKnowledgeBenchmarkCases(cases));
  });
}
test('un corpus assente richiede ripristino e non genera casi o risultati', () => {
  assert.throws(() => loadKnowledgeBenchmarkCases(require('node:path').join(__dirname, 'nonexistent-private-cases.json')), /File dei casi.*assente/);
});
