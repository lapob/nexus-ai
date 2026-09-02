/**
 * @module scripts/audit-knowledge-quality
 * @description Produce un quality gate editoriale della knowledge privata senza promuovere note automaticamente.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Scansione e criteri

const root = path.resolve(process.argv.find((value) => value.startsWith('--vault='))?.slice(8) || path.join(__dirname, '..', '..', '.knowledge-private'));
const strict = process.argv.includes('--strict');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.md')) files.push(target);
  }
}

function inspect(file) {
  const text = fs.readFileSync(file, 'utf8');
  const frontmatter = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)?.[1] || '';
  const status = frontmatter.match(/^status:\s*([^\r\n]+)/mi)?.[1].trim() || 'missing';
  const sourceKind = frontmatter.match(/^source_kind:\s*([^\r\n]+)/mi)?.[1].trim() || 'missing';
  const reviewAfter = frontmatter.match(/^review_after:\s*(\d{4}-\d{2}-\d{2})/mi)?.[1] || '';
  const stale = Boolean(reviewAfter) && Date.parse(`${reviewAfter}T23:59:59Z`) < Date.now();
  const checks = {
    frontmatter: Boolean(frontmatter),
    summary: /^##\s+(?:Sintesi|Lezione|Obiettivi)/mi.test(text),
    verification: /^##\s+(?:Verifica|Test|Laboratorio)/mi.test(text),
    risks: /^##\s+(?:Sicurezza|Rischi|Limiti)/mi.test(text),
    sources: /^##\s+(?:Fonti|Fonte ufficiale|Riferimenti|Bibliografia|Sources)\b/mi.test(text) && /https?:\/\//i.test(text)
  };
  return { file: path.relative(root, file), status, sourceKind, reviewAfter, stale, score: Object.values(checks).filter(Boolean).length, checks };
}

// #endregion

// #region 02 — Report e soglia

walk(root);
const notes = files.map(inspect);
const drafts = notes.filter((note) => note.status === 'draft');
const stale = notes.filter((note) => note.stale);
const missingProvenance = notes.filter((note) => note.sourceKind === 'missing');
const report = { auditedAt: new Date().toISOString(), vault: root, notes: notes.length, drafts: drafts.length, stale: stale.length, missingProvenance: missingProvenance.length, readyForHumanReview: drafts.filter((note) => note.score >= 4).length, staleDetails: stale, provenanceDetails: missingProvenance, draftDetails: drafts };
const output = path.resolve(__dirname, '..', 'qa-artifacts', 'knowledge-quality.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`Knowledge quality: ${notes.length} note, ${drafts.length} draft, ${stale.length} da revisionare, ${missingProvenance.length} senza provenienza.\n`);
if (strict && (drafts.some((note) => note.score < 4) || stale.length || missingProvenance.length)) process.exitCode = 2;

// #endregion
