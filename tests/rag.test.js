const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NexusIndex, tokenize, parseFrontmatter, splitSections } = require('../src/rag');

test('normalizza token e rimuove stopword italiane', () => {
  assert.deepEqual(tokenize('Il modello è più utile con la conoscenza'), ['modello', 'utile', 'conoscenza']);
});

test('legge frontmatter e sezioni Markdown', () => {
  const raw = '---\nstatus: verified\narea: ai\n---\n# RAG\n\nIntro\n\n## Retrieval\nContesto utile';
  const { meta, body } = parseFrontmatter(raw);
  assert.equal(meta.status, 'verified');
  assert.deepEqual(splitSections(body), { title: 'RAG', sections: [{ heading: 'Introduzione', text: 'Intro' }, { heading: 'Retrieval', text: 'Contesto utile' }] });
});

test('indicizza note, esclude app e deprecated, restituisce fonti pertinenti', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.mkdirSync(path.join(vault, 'NexusAI'));
  fs.writeFileSync(path.join(vault, 'RAG.md'), '---\nstatus: verified\narea: ai\n---\n# RAG\n## Retrieval\nIl retrieval recupera conoscenza locale.');
  fs.writeFileSync(path.join(vault, 'Vecchia.md'), '---\nstatus: deprecated\n---\n# Vecchia\n## Nota\nretrieval obsoleto');
  fs.writeFileSync(path.join(vault, 'NexusAI', 'Codice.md'), '# Codice\n## Interno\nNon indicizzare');

  const index = new NexusIndex(vault);
  assert.deepEqual(index.rebuild().notes, 1);
  const results = index.search('retrieval conoscenza', 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].relativePath, 'RAG.md');
});
