/**
 * @module scripts/check-private-knowledge
 * @description Verifica struttura editoriale e nomenclatura della knowledge privata.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region Configurazione e raccolta note

const vault = path.resolve(process.argv.find((arg) => arg.startsWith('--vault='))?.slice(8)
  || path.join(__dirname, '..', '..', '.knowledge-private'));
const issues = [];
const files = [];
const forbiddenNames = /(?:^|\s)(?:MOC|CheatSheets|Quaderno|Cervello|Benvenuto)(?:\s|$)/i;
const instructionalText = /(?:obiettivi di apprendimento|alla fine della lezione|cosa ho imparato|percorso consigliato|laboratorio guidato|verifica dell['’]apprendimento)/i;

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.obsidian' || entry.name === 'tools') continue;
    const target = path.join(directory, entry.name);
    if (forbiddenNames.test(entry.name)) issues.push(`${path.relative(vault, target)}: nomenclatura non professionale`);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.md')) files.push(target);
  }
}

// #endregion

// #region Analisi editoriale e collegamenti

if (!fs.existsSync(vault)) {
  process.stderr.write(`Knowledge privata non trovata: ${vault}\n`);
  process.exit(2);
}
walk(vault);
const titles = new Map();
const noteNames = new Set(files.map((file) => path.basename(file, '.md').toLocaleLowerCase('it-IT')));
const notePaths = new Set(files.map((file) => path.relative(vault, file)
  .slice(0, -3)
  .replaceAll('\\', '/')
  .toLocaleLowerCase('it-IT')));

function withoutCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\r\n]*`/g, '');
}

function unresolvedWikiLinks(text) {
  const unresolved = new Set();
  for (const match of withoutCode(text).matchAll(/\[\[([^\]\r\n]+)\]\]/g)) {
    const target = match[1]
      .split(/\\?\|/, 1)[0]
      .split('#', 1)[0]
      .trim()
      .replaceAll('\\', '/');
    if (!target || /[$"'=<>]/.test(target)) continue;
    const normalized = target.replace(/\.md$/i, '').replace(/^\.\//, '').toLocaleLowerCase('it-IT');
    // Gli embed multimediali sono verificati dal catalogo degli allegati e non
    // appartengono all'insieme delle note Markdown.
    if (/\.(?:png|jpe?g|webp|gif|svg|pdf|wav|mp3|mp4)$/i.test(target)) continue;
    const basename = normalized.split('/').at(-1);
    if (!notePaths.has(normalized) && !noteNames.has(basename)) unresolved.add(target);
  }
  return unresolved;
}

// #endregion

// #region Validazione e report

for (const file of files) {
  const relative = path.relative(vault, file);
  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
  const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (!frontmatter) issues.push(`${relative}: frontmatter assente`);
  for (const field of ['type', 'area', 'status', 'level']) {
    if (!new RegExp(`^${field}:\\s*\\S+`, 'mi').test(frontmatter)) issues.push(`${relative}: metadata ${field} assente`);
  }
  if (!title) issues.push(`${relative}: titolo H1 assente`);
  if (instructionalText.test(text)) issues.push(`${relative}: tono didattico non enciclopedico`);
  if (/^status:\s*verified\s*$/mi.test(frontmatter)) {
    for (const field of ['verified_at', 'review_after']) {
      if (!new RegExp(`^${field}:\\s*\\d{4}-\\d{2}-\\d{2}`, 'mi').test(frontmatter)) issues.push(`${relative}: ${field} richiesto per status verified`);
    }
  }
  for (const target of unresolvedWikiLinks(text)) issues.push(`${relative}: collegamento non risolto [[${target}]]`);
  const key = title?.toLocaleLowerCase('it-IT');
  if (key) {
    if (titles.has(key)) issues.push(`${relative}: titolo duplicato con ${titles.get(key)}`);
    else titles.set(key, relative);
  }
}

fs.mkdirSync(path.join(__dirname, '..', 'qa-artifacts'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'qa-artifacts', 'private-knowledge-lint.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(), vault, notes: files.length, issues }, null, 2)}\n`);
process.stdout.write(`Private knowledge lint: ${files.length} note, ${issues.length} anomalie.\n`);
if (issues.length) {
  process.stderr.write(`${issues.join('\n')}\n`);
  process.exitCode = 1;
}

// #endregion
