const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NexusIndex, tokenize, parseFrontmatter, splitSections, retrievableSections } = require('../src/knowledge/rag');

test('normalizza token e rimuove stopword italiane', () => {
  assert.deepEqual(tokenize('Il modello è più utile con la conoscenza'), ['modello', 'utile', 'conoscenza']);
});

test('legge frontmatter e sezioni Markdown', () => {
  const raw = '---\nstatus: verified\narea: ai\n---\n# RAG\n\nIntro\n\n## Retrieval\nContesto utile';
  const { meta, body } = parseFrontmatter(raw);
  assert.equal(meta.status, 'verified');
  assert.deepEqual(splitSections(body), { title: 'RAG', sections: [{ heading: 'Introduzione', text: 'Intro' }, { heading: 'Retrieval', text: 'Contesto utile' }] });
});

test('il manuale mostra gli esercizi senza usarli come fatti nel retrieval', () => {
  const sections = splitSections(`# Reti\n\n<!-- nexus-course-v1 -->\nStudia il capitolo.\n\n## Obiettivi di apprendimento\nImpara le reti.\n\n## DNS\nRisolvi un nome in un indirizzo.\n\n## Laboratorio guidato\nProva un caso.`).sections;
  assert.deepEqual(retrievableSections(sections), [{ heading: 'DNS', text: 'Risolvi un nome in un indirizzo.' }]);
});

test('indicizza note, applica privacy RAG ed esclude app e deprecated', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-test-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.mkdirSync(path.join(vault, 'NexusAI'));
  fs.mkdirSync(path.join(vault, '.AI', 'docs'), { recursive: true });
  fs.mkdirSync(path.join(vault, '07_Lavoro'));
  fs.mkdirSync(path.join(vault, '05_Risorse', 'Templates'), { recursive: true });
  fs.writeFileSync(path.join(vault, 'RAG.md'), '---\nstatus: verified\narea: ai\n---\n# RAG\n## Retrieval\nIl retrieval recupera conoscenza locale.');
  fs.writeFileSync(path.join(vault, 'Vecchia.md'), '---\nstatus: deprecated\n---\n# Vecchia\n## Nota\nretrieval obsoleto');
  fs.writeFileSync(path.join(vault, 'Esclusa.md'), '---\nstatus: evergreen\nrag: false\n---\n# Esclusa\n## Nota\nsegreto escluso');
  fs.writeFileSync(path.join(vault, '07_Lavoro', 'Privata.md'), '---\nstatus: evergreen\n---\n# Privata\n## Nota\ninformazione professionale privata');
  fs.writeFileSync(path.join(vault, '07_Lavoro', 'Opt-in.md'), '---\nstatus: verified\nrag: true\n---\n# Opt-in\n## Nota\nprocedura professionale autorizzata');
  fs.writeFileSync(path.join(vault, '05_Risorse', 'Templates', 'Template.md'), '# Template\n## Nota\ncontenuto non indicizzabile');
  fs.writeFileSync(path.join(vault, 'NexusAI', 'Codice.md'), '# Codice\n## Interno\nNon indicizzare');
  fs.writeFileSync(path.join(vault, '.AI', 'docs', 'ARCHITECTURE.md'), '# Sorgente\n## Interno\npassword-sorgente-non-indicizzabile');

  const index = new NexusIndex(vault);
  assert.deepEqual(index.rebuild().notes, 2);
  const results = index.search('retrieval conoscenza', 3);
  assert.equal(results.length, 1);
  assert.equal(results[0].relativePath, 'RAG.md');
  assert.equal(index.search('spiegami conoscenza del cielo blu', 10).length, 0);
  assert.equal(index.search('segreto privato template', 10).length, 0);
  assert.equal(index.search('password sorgente indicizzabile', 10).length, 0);
  assert.equal(index.search('procedura professionale autorizzata', 3)[0].relativePath, '07_Lavoro/Opt-in.md');
});

test('la reindicizzazione incrementale aggiorna modifiche e rimozioni', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-incremental-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  const first = path.join(vault, 'Prima.md');
  const second = path.join(vault, 'Seconda.md');
  fs.writeFileSync(first, '# Prima\n## Nota\ncontenuto iniziale');
  fs.writeFileSync(second, '# Seconda\n## Nota\ncontenuto stabile');
  const index = new NexusIndex(vault);

  assert.equal(index.rebuild().notes, 2);
  fs.writeFileSync(first, '# Prima\n## Nota\ncontenuto aggiornato e ampliato');
  fs.rmSync(second);
  const stats = index.rebuild();

  assert.equal(stats.notes, 1);
  assert.equal(index.search('aggiornato ampliato', 3)[0].relativePath, 'Prima.md');
  assert.equal(index.search('stabile', 3).length, 0);
});

test('rileva automaticamente una cache knowledge obsoleta', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stale-index-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  const note = path.join(vault, 'Nota.md');
  fs.writeFileSync(note, '# Nota\n## Stato\ncontenuto iniziale');
  const index = new NexusIndex(vault);

  assert.equal(index.needsRebuild(), true);
  index.rebuild();
  assert.equal(index.needsRebuild(), false);
  fs.writeFileSync(note, '# Nota\n## Stato\ncontenuto iniziale esteso');
  assert.equal(index.needsRebuild(), true);
  index.rebuild();
  fs.writeFileSync(path.join(vault, 'Nuova.md'), '# Nuova\n## Stato\nnuova nota');
  assert.equal(index.needsRebuild(), true);
  index.rebuild();
  fs.rmSync(note);
  assert.equal(index.needsRebuild(), true);
});

test('conserva la provenienza editoriale e diversifica i risultati tra note', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-diverse-index-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.writeFileSync(path.join(vault, 'Prima.md'), '---\nstatus: verified\nsource_kind: official\n---\n# Diagnostica rete\n## DNS\nrete diagnostica DNS\n## TCP\nrete diagnostica TCP\n## UDP\nrete diagnostica UDP');
  fs.writeFileSync(path.join(vault, 'Seconda.md'), '# Osservabilità rete\n## Telemetria\nrete diagnostica telemetria');
  const index = new NexusIndex(vault);
  index.rebuild();
  const results = index.search('rete diagnostica', 3);

  assert.equal(results.filter((item) => item.relativePath === 'Prima.md').length, 2);
  assert.ok(results.some((item) => item.relativePath === 'Seconda.md'));
  assert.equal(results.find((item) => item.relativePath === 'Prima.md').sourceKind, 'official');
});

test('indicizza in worker senza bloccare e trasferisce i chunk al processo chiamante', async (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-worker-index-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.writeFileSync(path.join(vault, 'Worker.md'), '# Worker\n## Background\nindicizzazione eseguita fuori dal main process');
  const index = new NexusIndex(vault);
  assert.equal(index.stats().chunks, 0);
  const stats = await index.rebuildAsync();
  assert.equal(stats.notes, 1);
  assert.equal(index.search('indicizzazione background').length, 1);
});

test('shutdown interrompe il worker knowledge e impedisce nuove indicizzazioni', async (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-worker-stop-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  fs.writeFileSync(path.join(vault, 'Worker.md'), '# Worker\n## Background\ncontenuto');
  const index = new NexusIndex(vault);
  const rebuild = index.rebuildAsync();

  assert.equal(index.shutdown(), true);
  await assert.rejects(rebuild, /interrotta/i);
  assert.equal(index.shutdown(), false);
  await assert.rejects(index.rebuildAsync(), /arrestato/i);
});

test('riapre l’indice persistente e combina similarità semantica e lessicale', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-persistent-index-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  const cachePath = path.join(vault, '.cache', 'knowledge.json');
  fs.writeFileSync(path.join(vault, 'Voce.md'), '# Voce\n## Fluidità\ncalibrazione dinamica del microfono');
  const first = new NexusIndex(vault, { cachePath });
  first.rebuild();
  const chunk = first.search('microfono', 1)[0];
  first.setEmbeddings([{ relativePath: chunk.relativePath, heading: chunk.heading, vector: [1, 0, 0] }]);

  const reopened = new NexusIndex(vault, { cachePath });
  assert.equal(reopened.stats().notes, 1);
  assert.equal(reopened.searchHybrid('audio', [0.99, 0.01, 0], 1)[0].relativePath, 'Voce.md');
});

test('rifiuta cache persistenti di schema precedente', (t) => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-cache-schema-'));
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  const cachePath = path.join(vault, 'legacy.json');
  fs.writeFileSync(cachePath, JSON.stringify({ schemaVersion: 1, vaultPath: vault, indexedAt: new Date().toISOString(), fileCache: [] }));
  const index = new NexusIndex(vault, { cachePath });

  assert.equal(index.stats().indexedAt, null);
  assert.equal(index.needsRebuild(), true);
});
