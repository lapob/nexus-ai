const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeArtifacts } = require('../src/application/artifact-stream');

test('gli artefatti pubblici sono limitati e non espongono modifiche locali', () => {
  const result = normalizeArtifacts([
    { id: 'a', kind: 'file-change', title: 'C:\\private\\secret.js', content: 'secret' },
    { id: 'b', kind: 'link', title: 'Fonte', url: 'https://example.com', content: 'Esempio' },
    { id: 'c', kind: 'link', title: 'Unsafe', url: 'file:///C:/secret', content: 'No' }
  ], { publicAudience: true });
  assert.equal(result.length, 2);
  assert.equal(result[0].url, 'https://example.com');
  assert.equal('url' in result[1], false);
  assert.doesNotMatch(JSON.stringify(result), /C:\\private/);
});
