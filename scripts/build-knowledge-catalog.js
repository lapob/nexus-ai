/**
 * @module scripts/build-knowledge-catalog
 * @description Genera il catalogo strutturato della knowledge senza modificare le note sorgenti.
 */
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { readNote } = require('./lib/knowledge-governance');

// #region 01 — Raccolta e normalizzazione

const vault = path.resolve(process.argv.find((arg) => arg.startsWith('--vault='))?.slice(8)
  || path.join(__dirname, '..', '..', '.knowledge-private'));
const checkOnly = process.argv.includes('--check');
const outputDirectory = path.join(vault, '.nexus');
const catalogPath = path.join(outputDirectory, 'knowledge-catalog.json');
const recordsPath = path.join(outputDirectory, 'knowledge-records.jsonl');
const databasePath = path.join(outputDirectory, 'knowledge.sqlite');
const graphPath = path.join(outputDirectory, 'knowledge-graph.json');
const supportedAssets = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.pdf', '.wav', '.mp3', '.mp4']);

function prepareGeneratedFile(file) {
  if (process.platform !== 'win32' || !fs.existsSync(file)) return;
  const result = spawnSync('attrib.exe', ['-H', '-R', file], { windowsHide: true, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Impossibile aggiornare il catalogo generato: ${result.stderr || result.stdout || file}`);
  }
}

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.obsidian' || entry.name === '.nexus') continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(target));
    else files.push(target);
  }
  return files;
}

function frontmatter(text) {
  const block = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
  return Object.fromEntries(block.split(/\r?\n/).map((line) => {
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    return pair ? [pair[1], pair[2].replace(/^['"]|['"]$/g, '')] : null;
  }).filter(Boolean));
}

function uniqueMatches(text, pattern, mapper = (match) => match[1]) {
  return [...new Set([...text.matchAll(pattern)].map(mapper).filter(Boolean))];
}

function normalizeReference(value) {
  return String(value || '').split('|', 1)[0].split('#', 1)[0].trim().replaceAll('\\', '/');
}

// #endregion

// #region 02 — Record documentali e allegati

if (!fs.existsSync(vault)) throw new Error(`Knowledge non trovata: ${vault}`);
const files = walk(vault);
const assets = files.filter((file) => supportedAssets.has(path.extname(file).toLowerCase())).map((file) => ({
  path: path.relative(vault, file).replaceAll('\\', '/'),
  mediaType: path.extname(file).slice(1).toLowerCase(),
  bytes: fs.statSync(file).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}));
const assetLookup = new Set(assets.flatMap((asset) => [asset.path.toLowerCase(), path.basename(asset.path).toLowerCase()]));

const records = files.filter((file) => file.endsWith('.md')).map((file) => {
  const text = fs.readFileSync(file, 'utf8');
  const relativePath = path.relative(vault, file).replaceAll('\\', '/');
  const meta = frontmatter(text);
  const governance = readNote(vault, file);
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md');
  const attachments = uniqueMatches(text, /!\[\[([^\]\r\n]+)\]\]|!\[[^\]]*\]\(([^)]+)\)/g,
    (match) => normalizeReference(match[1] || match[2]));
  return {
    id: crypto.createHash('sha256').update(relativePath.toLowerCase()).digest('hex').slice(0, 20),
    path: relativePath,
    title,
    area: meta.area || 'general',
    type: meta.type || 'note',
    level: meta.level || 'foundation',
    status: meta.status || 'draft',
    sourceKind: meta.source_kind || 'unknown',
    provenance: governance.provenance,
    license: governance.license,
    trustTier: governance.trustTier,
    updated: meta.updated || '',
    reviewAfter: governance.reviewAfter,
    verifiedAt: meta.verified_at || '',
    stale: governance.stale,
    tags: uniqueMatches(meta.tags || '', /([\p{L}\p{N}][\p{L}\p{N}-]*)/gu),
    headings: uniqueMatches(text, /^#{2,4}\s+(.+)$/gm),
    links: uniqueMatches(text, /\[\[([^\]\r\n]+)\]\]/g, (match) => normalizeReference(match[1])),
    urls: governance.sourceUrls,
    attachments,
    missingAttachments: attachments.filter((asset) => !assetLookup.has(asset.toLowerCase()) && !assetLookup.has(path.basename(asset).toLowerCase())),
    codeLanguages: uniqueMatches(text, /^```([\w.+-]+)\s*$/gm),
    words: text.replace(/^---[\s\S]*?---/, '').trim().split(/\s+/).filter(Boolean).length,
    citationKey: `kb:${crypto.createHash('sha256').update(relativePath.toLowerCase()).digest('hex').slice(0, 20)}`,
    sha256: governance.documentSha256,
    contentSha256: governance.contentSha256
  };
}).sort((left, right) => left.path.localeCompare(right.path, 'it'));

const catalog = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  counts: {
    records: records.length,
    assets: assets.length,
    examples: records.filter((record) => record.codeLanguages.length || /esemp/i.test(record.type)).length,
    tools: records.filter((record) => record.area === 'tools' || record.tags.includes('tools')).length,
    brokenAttachments: records.reduce((total, record) => total + record.missingAttachments.length, 0),
    stale: records.filter((record) => record.stale).length,
    sourceCovered: records.filter((record) => record.urls.length > 0).length,
    provenanceCovered: records.filter((record) => record.provenance !== 'unspecified').length,
    licenseCovered: records.filter((record) => record.license !== 'UNSPECIFIED').length
  },
  areas: Object.entries(records.reduce((result, record) => {
    result[record.area] = (result[record.area] || 0) + 1;
    return result;
  }, {})).sort(([left], [right]) => left.localeCompare(right, 'it')).map(([area, count]) => ({ area, count })),
  assets,
  records
};
const titleLookup = new Map(records.flatMap((record) => [
  [record.title.toLocaleLowerCase('it'), record.id],
  [path.basename(record.path, '.md').toLocaleLowerCase('it'), record.id]
]));
const graph = {
  schemaVersion: 2,
  generatedAt: catalog.generatedAt,
  nodes: records.map((record) => ({
    id: record.id,
    title: record.title,
    area: record.area,
    type: record.type,
    trustTier: record.trustTier,
    citationKey: record.citationKey
  })),
  edges: records.flatMap((record) => record.links.map((link) => ({
    from: record.id,
    to: titleLookup.get(path.basename(link).toLocaleLowerCase('it')) || '',
    label: link
  })).filter((edge) => edge.to))
};

// #endregion

// #region 03 — Persistenza e controllo

const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
const jsonl = `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
if (checkOnly) {
  if (![catalogPath, recordsPath, databasePath, graphPath].every(fs.existsSync)) throw new Error('Catalogo knowledge assente: esegui npm run knowledge:catalog.');
  const current = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const currentRecords = new Map((current.records || []).map((record) => [record.path, record]));
  const contentChanged = records.some((record) => {
    const existing = currentRecords.get(record.path);
    return !existing || existing.sha256 !== record.sha256 || existing.contentSha256 !== record.contentSha256
      || existing.trustTier !== record.trustTier || existing.provenance !== record.provenance
      || existing.license !== record.license || existing.reviewAfter !== record.reviewAfter;
  });
  const database = new DatabaseSync(databasePath, { readOnly: true });
  const databaseVersion = database.prepare('PRAGMA user_version').get().user_version;
  const databaseRecords = database.prepare('SELECT COUNT(*) AS count FROM documents').get().count;
  database.close();
  if (current.schemaVersion !== catalog.schemaVersion || current.counts.records !== catalog.counts.records
    || current.counts.assets !== catalog.counts.assets || current.counts.brokenAttachments !== 0
    || contentChanged || databaseVersion !== catalog.schemaVersion || databaseRecords !== records.length) {
    throw new Error('Catalogo knowledge non aggiornato o con allegati mancanti.');
  }
} else {
  fs.mkdirSync(outputDirectory, { recursive: true });
  for (const output of [catalogPath, recordsPath, graphPath, databasePath]) prepareGeneratedFile(output);
  fs.writeFileSync(catalogPath, serialized, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(recordsPath, jsonl, { encoding: 'utf8', mode: 0o600 });
  fs.writeFileSync(graphPath, `${JSON.stringify(graph, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  const temporaryDatabase = `${databasePath}.${process.pid}.tmp`;
  fs.rmSync(temporaryDatabase, { force: true });
  const database = new DatabaseSync(temporaryDatabase);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA user_version = 2;
    CREATE TABLE documents (id TEXT PRIMARY KEY, path TEXT UNIQUE, title TEXT, area TEXT, type TEXT, level TEXT, status TEXT, source_kind TEXT, provenance TEXT, license TEXT, trust_tier TEXT, updated TEXT, review_after TEXT, document_sha256 TEXT, content_sha256 TEXT, body TEXT);
    CREATE VIRTUAL TABLE documents_fts USING fts5(id UNINDEXED, title, headings, body, tokenize='unicode61 remove_diacritics 2');
    CREATE TABLE links (source_id TEXT, target_id TEXT, label TEXT);
    CREATE TABLE assets (path TEXT PRIMARY KEY, media_type TEXT, bytes INTEGER, sha256 TEXT);
    CREATE TABLE sources (document_id TEXT, url TEXT, PRIMARY KEY (document_id, url));
  `);
  const insertDocument = database.prepare('INSERT INTO documents VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insertFts = database.prepare('INSERT INTO documents_fts VALUES (?, ?, ?, ?)');
  const insertLink = database.prepare('INSERT INTO links VALUES (?, ?, ?)');
  const insertAsset = database.prepare('INSERT INTO assets VALUES (?, ?, ?, ?)');
  const insertSource = database.prepare('INSERT INTO sources VALUES (?, ?)');
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const record of records) {
      const body = fs.readFileSync(path.join(vault, record.path), 'utf8').replace(/^---[\s\S]*?---\s*/, '');
      insertDocument.run(record.id, record.path, record.title, record.area, record.type, record.level, record.status,
        record.sourceKind, record.provenance, record.license, record.trustTier, record.updated, record.reviewAfter,
        record.sha256, record.contentSha256, body);
      insertFts.run(record.id, record.title, record.headings.join('\n'), body);
      for (const url of record.urls) insertSource.run(record.id, url);
    }
    for (const edge of graph.edges) insertLink.run(edge.from, edge.to, edge.label);
    for (const asset of assets) insertAsset.run(asset.path, asset.mediaType, asset.bytes, asset.sha256);
    database.exec('COMMIT');
    // Il catalogo distribuito è immutabile: consolida il WAL nel singolo file
    // SQLite così non restano sidecar temporanei né stato incoerente nel pack.
    database.exec('PRAGMA journal_mode = DELETE');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  } finally {
    database.close();
  }
  fs.rmSync(`${temporaryDatabase}-wal`, { force: true });
  fs.rmSync(`${temporaryDatabase}-shm`, { force: true });
  fs.renameSync(temporaryDatabase, databasePath);
  fs.rmSync(`${databasePath}-wal`, { force: true });
  fs.rmSync(`${databasePath}-shm`, { force: true });
}
process.stdout.write(`Knowledge catalog: ${records.length} record, ${assets.length} allegati, ${graph.edges.length} relazioni, ${catalog.counts.brokenAttachments} riferimenti mancanti.\n`);
if (catalog.counts.brokenAttachments) process.exitCode = 1;

// #endregion
