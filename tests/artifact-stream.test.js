const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeArtifacts } = require('../src/application/artifact-stream');

test('result identifiers are stable and unique even when an engine omits or duplicates IDs', () => {
  const values = [{ kind: 'document', content: 'one' }, { id: 'artifact-2', content: 'two' }, { id: 'artifact-2', content: 'three' }];
  const first = normalizeArtifacts(values), second = normalizeArtifacts(values);
  assert.deepEqual(first, second); assert.equal(new Set(first.map(item => item.id)).size, 3);
});

test('invalid images are not silently truncated and links cannot carry credentials', () => {
  const result = normalizeArtifacts([
    { kind: 'image', url: 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024) },
    { kind: 'image', url: 'data:image/svg+xml;base64,AA==' },
    { kind: 'link', url: 'https://user:password@example.com' },
    { kind: 'link', url: 'https://[' }
  ]);
  assert.ok(result.every(item => !item.url));
});

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
