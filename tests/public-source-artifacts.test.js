const test = require('node:test');
const assert = require('node:assert/strict');
const { publicSourceArtifacts } = require('../src/application/register-ipc');

test('le card pubbliche espongono solo fonti HTTPS deduplicate e prive di credenziali', () => {
  const artifacts = publicSourceArtifacts([
    { title: 'Documentazione', url: 'https://example.com/guide#section', snippet: 'Fonte pubblica verificata.' },
    { title: 'Duplicato', url: 'https://example.com/guide', snippet: 'Non deve apparire due volte.' },
    { title: 'Locale', url: 'file:///Z:/private.md', snippet: 'Percorso privato.' },
    { title: 'Credenziali', url: 'https://user:secret@example.net/private', snippet: 'Segreto.' },
    { title: 'Non cifrata', url: 'http://example.org/', snippet: 'HTTP.' }
  ]);

  assert.deepEqual(artifacts, [{
    id: 'public-source-1',
    kind: 'link',
    title: 'Documentazione',
    content: 'Fonte pubblica verificata.',
    url: 'https://example.com/guide'
  }]);
  assert.doesNotMatch(JSON.stringify(artifacts), /Z:|private\.md|secret/);
});

test('le card pubbliche hanno un limite stretto e testo confinato', () => {
  const artifacts = publicSourceArtifacts(Array.from({ length: 10 }, (_, index) => ({
    title: `Fonte ${index}`,
    url: `https://example.com/${index}`,
    snippet: 'x'.repeat(400)
  })));
  assert.equal(artifacts.length, 6);
  assert.ok(artifacts.every((artifact) => artifact.content.length <= 240));
});

test('la data di consultazione valida rimane distinta dal contenuto e le date malformate sono escluse', () => {
  const artifacts = publicSourceArtifacts([
    { title: 'Fonte live', url: 'https://example.com/live', snippet: 'x'.repeat(400), retrievedAt: '2026-10-01T12:00:00Z' },
    { title: 'Fonte senza data', url: 'https://example.com/invalid', snippet: 'Contenuto.', retrievedAt: 'data inventata' }
  ]);
  assert.equal(artifacts[0].content, 'x'.repeat(240) + '\nConsultato: 2026-10-01T12:00:00.000Z');
  assert.equal(artifacts[1].content, 'Contenuto.');
});
