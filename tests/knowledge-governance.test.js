const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  auditVault,
  compareVaults,
  effectiveLicense,
  effectiveProvenance,
  effectiveTrustTier
} = require('../scripts/lib/knowledge-governance');

function writeNote(root, relativePath, metadata, body) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const frontmatter = Object.entries(metadata).map(([key, value]) => `${key}: ${value}`).join('\n');
  fs.writeFileSync(target, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf8');
}

test('deriva provenienza, licenza e trust tier senza promuovere note non verificate', () => {
  assert.equal(effectiveProvenance({ source_kind: 'official-docs' }), 'primary-reference-synthesis');
  assert.equal(effectiveProvenance({ source_kind: 'local-inventory' }), 'local-observation');
  assert.equal(effectiveLicense({ source_kind: 'curated' }), 'NexusNXS-Proprietary');
  assert.equal(effectiveTrustTier({ status: 'verified', source_kind: 'official' }, ['https://example.test'], false), 'tier-1-verified');
  assert.equal(effectiveTrustTier({ status: 'evergreen', source_kind: 'curated' }, [], false), 'tier-3-curated');
  assert.equal(effectiveTrustTier({ status: 'verified', source_kind: 'official' }, ['https://example.test'], true), 'tier-4-review-required');
});

test('rileva staleness, duplicati, conflitti espliciti e divulgazioni pubbliche', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-governance-'));
  const privateVault = path.join(root, '.knowledge-private');
  const publicVault = path.join(root, '.knowledge-public');
  fs.mkdirSync(privateVault);
  fs.mkdirSync(publicVault);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const common = { type: 'chapter', area: 'test', level: 'foundation', created: '2026-01-01', updated: '2026-01-01', source_kind: 'curated', tags: '[test]', aliases: '[]' };
  writeNote(privateVault, 'Prima.md', { ...common, status: 'verified', verified_at: '2026-01-01', review_after: '2026-01-02', claim_id: 'dns-port', claim_value: '53' }, '# Prima\n\n## Fonti\n\nhttps://www.rfc-editor.org/rfc/rfc1035');
  writeNote(privateVault, 'Seconda.md', { ...common, status: 'evergreen', claim_id: 'dns-port', claim_value: '54' }, '# Seconda\n\nContenuto originale sufficiente.');
  writeNote(privateVault, 'Copia.md', { ...common, status: 'evergreen' }, '# Seconda\n\nContenuto originale sufficiente.');
  writeNote(publicVault, 'Pubblica.md', { ...common, status: 'evergreen', visibility: 'public' }, '# Pubblica\n\nPercorso C:\\Users\\persona\\segreto');

  const privateAudit = auditVault(privateVault, 'private');
  const publicAudit = auditVault(publicVault, 'public');
  const kinds = new Set([...privateAudit.issues, ...publicAudit.issues].map((issue) => issue.kind));
  assert.ok(kinds.has('stale'));
  assert.ok(kinds.has('exact-duplicate'));
  assert.ok(kinds.has('claim-conflict'));
  assert.ok(kinds.has('public-disclosure'));
  assert.equal(compareVaults(privateAudit, publicAudit).publicOnly, 1);
});
