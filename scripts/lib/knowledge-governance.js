/**
 * @module scripts/lib/knowledge-governance
 * @description Deriva metadati verificabili e controlla qualità, confini e duplicati delle knowledge.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXCLUDED_DIRECTORIES = new Set(['.nexus', '.obsidian', '.git', 'node_modules', 'tools']);
const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;
const PRIVATE_DISCLOSURE_PATTERNS = [
  /[A-Z]:\\Users\\[^\\\r\n]+\\/i,
  /[A-Z]:\\(?:\[AI\]|\[BRAIN\])\\/i,
  /\bpc-studio\b/i,
  /\btailnet\b/i,
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/i,
  /\b(?:ghp_|github_pat_|AKIA|sk-)[A-Za-z0-9_-]{16,}\b/
];

// #region Lettura e metadati

function walkMarkdown(root) {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) return [];
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) return walkMarkdown(target);
    return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
  });
}

function parseFrontmatter(raw) {
  const block = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1] || '';
  return Object.fromEntries(block.split(/\r?\n/).map((line) => {
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    return pair ? [pair[1], pair[2].trim().replace(/^['"]|['"]$/g, '')] : null;
  }).filter(Boolean));
}

function parseList(value) {
  return String(value || '')
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

function markdownBody(raw) {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim();
}

function normalizeContent(raw) {
  return markdownBody(raw)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('it-IT');
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sourceUrls(raw) {
  return [...new Set((raw.match(URL_PATTERN) || []).map((url) => url.replace(/[.,;:]+$/, '')))];
}

function effectiveProvenance(meta) {
  if (meta.provenance) return meta.provenance;
  const sourceKind = String(meta.source_kind || '').toLowerCase();
  if (sourceKind === 'local-inventory') return 'local-observation';
  if (/official|standard|primary/.test(sourceKind)) return 'primary-reference-synthesis';
  if (sourceKind === 'lab') return 'nexus-laboratory-evidence';
  if (sourceKind === 'professional-practice') return 'professional-practice-synthesis';
  if (sourceKind === 'generated') return 'derived-index';
  if (/original|policy/.test(sourceKind)) return 'nexus-original';
  if (/^curated(?:-synthesis)?$/.test(sourceKind)) return 'nexus-curated-synthesis';
  return 'unspecified';
}

function effectiveLicense(meta) {
  if (meta.license) return meta.license;
  return effectiveProvenance(meta) === 'unspecified' ? 'UNSPECIFIED' : 'NexusNXS-Proprietary';
}

function effectiveTrustTier(meta, urls, stale) {
  if (stale || meta.status === 'draft' || meta.status === 'deprecated') return 'tier-4-review-required';
  const observed = meta.source_kind === 'local-inventory' && Boolean(meta.verified_at);
  if (meta.status === 'verified' && (urls.length > 0 || observed)) return 'tier-1-verified';
  if (/official|standard|primary/.test(String(meta.source_kind || ''))) return 'tier-2-primary-reference';
  return 'tier-3-curated';
}

function readNote(vault, file) {
  const raw = fs.readFileSync(file, 'utf8');
  const meta = parseFrontmatter(raw);
  const content = normalizeContent(raw);
  const urls = sourceUrls(raw);
  const reviewAfter = meta.review_after || '';
  const stale = Boolean(reviewAfter) && Date.parse(`${reviewAfter}T23:59:59Z`) < Date.now();
  const relativePath = path.relative(vault, file).replaceAll('\\', '/');
  return {
    file,
    relativePath,
    title: markdownBody(raw).match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md'),
    meta,
    raw,
    content,
    words: content.match(/[\p{L}\p{N}]+/gu) || [],
    sourceUrls: urls,
    reviewAfter,
    stale,
    contentSha256: sha256(content),
    documentSha256: sha256(raw),
    provenance: effectiveProvenance(meta),
    license: effectiveLicense(meta),
    trustTier: effectiveTrustTier(meta, urls, stale),
    claims: parseList(meta.claim_id).map((id) => ({ id, value: String(meta.claim_value || '').trim() })),
    supersedes: parseList(meta.supersedes),
    contradictedBy: parseList(meta.contradicted_by)
  };
}

// #endregion
// #region Analisi e confronto

function fnv1a(value, seed) {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function minHashSignature(words, size = 24) {
  if (words.length < 80) return [];
  const shingles = new Set();
  for (let index = 0; index <= words.length - 5; index += 1) {
    shingles.add(words.slice(index, index + 5).join(' '));
  }
  return Array.from({ length: size }, (_, seed) => {
    let minimum = 0xffffffff;
    for (const shingle of shingles) minimum = Math.min(minimum, fnv1a(shingle, seed * 2654435761));
    return minimum;
  });
}

function nearDuplicatePairs(notes, threshold = 0.92) {
  const signatures = notes.map((note) => minHashSignature(note.words));
  const pairs = [];
  for (let left = 0; left < notes.length; left += 1) {
    if (!signatures[left].length) continue;
    for (let right = left + 1; right < notes.length; right += 1) {
      if (!signatures[right].length) continue;
      const sizeRatio = Math.min(notes[left].words.length, notes[right].words.length)
        / Math.max(notes[left].words.length, notes[right].words.length);
      if (sizeRatio < 0.75) continue;
      let equal = 0;
      for (let index = 0; index < signatures[left].length; index += 1) {
        if (signatures[left][index] === signatures[right][index]) equal += 1;
      }
      const similarity = equal / signatures[left].length;
      if (similarity >= threshold) pairs.push({
        left: notes[left].relativePath,
        right: notes[right].relativePath,
        similarity: Math.round(similarity * 1000) / 1000
      });
    }
  }
  return pairs;
}

function auditVault(vault, profile) {
  if (!fs.existsSync(vault)) throw new Error(`Knowledge ${profile} non trovata: ${vault}`);
  const notes = walkMarkdown(vault).map((file) => readNote(vault, file));
  const issues = [];
  const exactGroups = new Map();
  const claimGroups = new Map();
  const paths = new Set(notes.map((note) => note.relativePath.toLocaleLowerCase('it-IT')));

  for (const note of notes) {
    const duplicates = exactGroups.get(note.contentSha256) || [];
    duplicates.push(note.relativePath);
    exactGroups.set(note.contentSha256, duplicates);
    if (note.stale) issues.push({ kind: 'stale', file: note.relativePath, detail: note.reviewAfter });
    if (note.provenance === 'unspecified') issues.push({ kind: 'provenance', file: note.relativePath, detail: 'source_kind o provenance assente' });
    if (note.license === 'UNSPECIFIED') issues.push({ kind: 'license', file: note.relativePath, detail: 'licenza non determinabile' });

    const observed = note.meta.source_kind === 'local-inventory' && Boolean(note.meta.verified_at);
    if (note.meta.status === 'verified' && note.sourceUrls.length === 0 && !observed) {
      issues.push({ kind: 'verification-evidence', file: note.relativePath, detail: 'verified senza fonte URL o osservazione locale datata' });
    }
    if (profile === 'private' && (note.relativePath.startsWith('04_Cultura_Generale/') || note.meta.area === 'cultura-generale')) {
      issues.push({ kind: 'private-boundary', file: note.relativePath, detail: 'cultura generale nella knowledge tecnica privata' });
    }
    if (profile === 'public') {
      if (note.meta.visibility !== 'public') issues.push({ kind: 'public-visibility', file: note.relativePath, detail: 'visibility deve essere public' });
      if (note.relativePath.toLowerCase().includes('strumenti locali/') || note.meta.source_kind === 'local-inventory') {
        issues.push({ kind: 'public-boundary', file: note.relativePath, detail: 'inventario locale nella knowledge pubblica' });
      }
      for (const pattern of PRIVATE_DISCLOSURE_PATTERNS) {
        if (pattern.test(note.raw)) issues.push({ kind: 'public-disclosure', file: note.relativePath, detail: pattern.source });
      }
    }

    for (const claim of note.claims) {
      const group = claimGroups.get(claim.id) || [];
      group.push({ file: note.relativePath, value: claim.value, status: note.meta.status || 'draft' });
      claimGroups.set(claim.id, group);
    }
    for (const target of [...note.supersedes, ...note.contradictedBy]) {
      const normalized = target.replace(/\.md$/i, '').replaceAll('\\', '/').toLocaleLowerCase('it-IT');
      const resolved = [...paths].some((candidate) => candidate === `${normalized}.md` || candidate.endsWith(`/${normalized}.md`));
      if (!resolved) issues.push({ kind: 'claim-reference', file: note.relativePath, detail: target });
    }
  }

  const exactDuplicates = [...exactGroups.values()].filter((group) => group.length > 1);
  for (const group of exactDuplicates) issues.push({ kind: 'exact-duplicate', file: group.join(' | '), detail: 'corpo Markdown identico' });
  // Le schede dell'inventario locale condividono intenzionalmente lo stesso
  // template: differenze di versione, hash e disponibilità sono sostanziali e
  // non devono essere scambiate per copie editoriali.
  const nearDuplicates = nearDuplicatePairs(notes.filter((note) => note.meta.source_kind !== 'local-inventory'));
  for (const pair of nearDuplicates) issues.push({ kind: 'near-duplicate', file: `${pair.left} | ${pair.right}`, detail: String(pair.similarity) });

  const claimConflicts = [];
  for (const [id, entries] of claimGroups) {
    const activeValues = new Set(entries.filter((entry) => entry.status !== 'deprecated').map((entry) => entry.value).filter(Boolean));
    if (activeValues.size > 1) {
      const conflict = { id, entries };
      claimConflicts.push(conflict);
      issues.push({ kind: 'claim-conflict', file: entries.map((entry) => entry.file).join(' | '), detail: id });
    }
  }

  const trustTiers = Object.fromEntries([...new Set(notes.map((note) => note.trustTier))].sort().map((tier) => [
    tier,
    notes.filter((note) => note.trustTier === tier).length
  ]));
  return {
    profile,
    vault,
    notes: notes.length,
    sourceCoverage: Math.round((notes.filter((note) => note.sourceUrls.length > 0).length / Math.max(1, notes.length)) * 1000) / 10,
    explicitReviewCoverage: Math.round((notes.filter((note) => note.reviewAfter).length / Math.max(1, notes.length)) * 1000) / 10,
    effectiveProvenanceCoverage: Math.round((notes.filter((note) => note.provenance !== 'unspecified').length / Math.max(1, notes.length)) * 1000) / 10,
    effectiveLicenseCoverage: Math.round((notes.filter((note) => note.license !== 'UNSPECIFIED').length / Math.max(1, notes.length)) * 1000) / 10,
    stale: notes.filter((note) => note.stale).length,
    exactDuplicates,
    nearDuplicates,
    claimConflicts,
    trustTiers,
    issues,
    records: notes.map((note) => ({
      path: note.relativePath,
      documentSha256: note.documentSha256,
      contentSha256: note.contentSha256,
      sourceUrls: note.sourceUrls,
      provenance: note.provenance,
      license: note.license,
      trustTier: note.trustTier,
      reviewAfter: note.reviewAfter,
      stale: note.stale
    }))
  };
}

function compareVaults(privateAudit, publicAudit) {
  const publicHashes = new Map(publicAudit.records.map((record) => [record.contentSha256, record.path]));
  const sharedExactBodies = privateAudit.records
    .filter((record) => publicHashes.has(record.contentSha256))
    .map((record) => ({ privatePath: record.path, publicPath: publicHashes.get(record.contentSha256) }));
  return {
    sharedExactBodies: sharedExactBodies.length,
    privateOnly: privateAudit.records.length - sharedExactBodies.length,
    publicOnly: publicAudit.records.length - sharedExactBodies.length,
    sharedDetails: sharedExactBodies
  };
}

// #endregion

module.exports = {
  auditVault,
  compareVaults,
  effectiveLicense,
  effectiveProvenance,
  effectiveTrustTier,
  normalizeContent,
  parseFrontmatter,
  readNote,
  sha256,
  sourceUrls,
  walkMarkdown
};
