/**
 * @module scripts/normalize-public-knowledge
 * @description Uniforma i metadati editoriali della knowledge pubblica senza modificare i capitoli.
 */
const fs = require('node:fs');
const path = require('node:path');

// La vault pubblica vive accanto al repository per restare disponibile anche
// all'installazione portabile; il pack versionato viene prodotto separatamente
// da publish-knowledge.js. Manteniamo qui un solo percorso autoritativo così il
// gate non può risultare verde limitandosi, per errore, a ignorare la vault.
const root = path.resolve(__dirname, '..', '..', '.knowledge-public');
const today = new Date().toISOString().slice(0, 10);
const checkOnly = process.argv.includes('--check');

if (!fs.existsSync(root)) {
  process.stdout.write('Knowledge pubblica non installata: normalizzazione ignorata.\n');
  process.exit(0);
}

// #region 01 — Classificazione editoriale

function areaFor(relativePath) {
  const top = relativePath.split(path.sep)[0];
  const areas = {
    '01_Informatica': 'informatica',
    '02_Italiano_e_Comunicazione': 'italiano-comunicazione',
    '03_Matematica': 'matematica',
    '04_Fisica': 'fisica',
    '05_Scienze': 'scienze',
    '06_Storia_Geografia_Societa': 'storia-geografia-societa',
    '07_Filosofia_Arte_Psicologia': 'filosofia-arte-psicologia',
    '08_Metodo_e_Cultura': 'metodo-cultura',
    '99_Fonti': 'fonti'
  };
  return areas[top] || 'enciclopedia';
}

function typeFor(filename, area) {
  const name = filename.toLocaleLowerCase('it-IT');
  if (name.startsWith('00 - indice')) return 'index';
  if (area === 'fonti') return 'reference';
  if (name.includes('glossario') || name.includes('atlante')) return 'reference';
  if (name.includes('roadmap') || name.includes('percorso')) return 'learning-path';
  if (name.includes('laboratorio') || name.includes('progetti professionali')) return 'workbook';
  if (name.includes('metodo') || name.includes('ricerca e verifica')) return 'guide';
  return 'chapter';
}

function tagsFor(area, type) {
  const values = [area, type === 'chapter' ? 'manuale' : type, 'knowledge'];
  return `[${[...new Set(values)].join(', ')}]`;
}

// #endregion
// #region 02 — Normalizzazione conservativa

function parseFrontmatter(source) {
  if (!source.startsWith('---\n')) return { metadata: new Map(), body: source };
  const end = source.indexOf('\n---\n', 4);
  if (end < 0) return { metadata: new Map(), body: source };
  const metadata = new Map();
  for (const line of source.slice(4, end).split('\n')) {
    const separator = line.indexOf(':');
    if (separator > 0) metadata.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return { metadata, body: source.slice(end + 5).replace(/^\n+/, '') };
}

function normalizeFile(file) {
  const relative = path.relative(root, file);
  const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const { metadata, body } = parseFrontmatter(original);
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const area = metadata.get('area') || areaFor(relative);
  const type = metadata.get('type') || typeFor(path.basename(file), area);
  const canonical = new Map([
    ['title', metadata.get('title') || heading || path.basename(file, '.md')],
    ['type', type],
    ['area', area],
    ['status', metadata.get('status') || 'evergreen'],
    ['level', metadata.get('level') || 'foundation'],
    ['visibility', metadata.get('visibility') || 'public'],
    ['created', metadata.get('created') || today],
    ['updated', metadata.get('updated') || today],
    ['source_kind', metadata.get('source_kind') || 'curated'],
    ['tags', metadata.get('tags') || tagsFor(area, type)],
    ['aliases', metadata.get('aliases') || '[]']
  ]);
  for (const [key, value] of metadata) if (!canonical.has(key)) canonical.set(key, value);
  const frontmatter = [...canonical].map(([key, value]) => `${key}: ${value}`).join('\n');
  const normalized = `---\n${frontmatter}\n---\n\n${body.trimEnd()}\n`;
  if (normalized !== original && !checkOnly) fs.writeFileSync(file, normalized, 'utf8');
  return normalized !== original;
}

function markdownFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === '.obsidian' ? [] : markdownFiles(target);
    return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  });
}

const files = markdownFiles(root);
const changed = files.reduce((count, file) => count + Number(normalizeFile(file)), 0);
if (checkOnly && changed) {
  process.stderr.write(`Knowledge pubblica non normalizzata: ${changed} note da aggiornare.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`Knowledge pubblica ${checkOnly ? 'verificata' : 'normalizzata'}: ${files.length} note, ${changed} aggiornate.\n`);
}

// #endregion
