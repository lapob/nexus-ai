/**
 * @module scripts/audit-knowledge-governance
 * @description Verifica provenienza, aggiornamento, licenze, duplicati, contraddizioni esplicite e separazione delle knowledge.
 */
const fs = require('node:fs');
const path = require('node:path');
const { auditVault, compareVaults } = require('./lib/knowledge-governance');

const root = path.resolve(__dirname, '..');
const privateVault = path.resolve(process.argv.find((arg) => arg.startsWith('--private='))?.slice(10)
  || path.join(root, '..', '.knowledge-private'));
const publicVault = path.resolve(process.argv.find((arg) => arg.startsWith('--public='))?.slice(9)
  || path.join(root, '..', '.knowledge-public'));
const strict = process.argv.includes('--strict');
const privateAudit = auditVault(privateVault, 'private');
const publicAudit = auditVault(publicVault, 'public');
const separation = compareVaults(privateAudit, publicAudit);
const report = {
  schemaVersion: 1,
  auditedAt: new Date().toISOString(),
  private: privateAudit,
  public: publicAudit,
  separation
};
const output = path.join(root, 'qa-artifacts', 'knowledge-governance.json');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

process.stdout.write([
  `Knowledge governance: privata ${privateAudit.notes} note, pubblica ${publicAudit.notes} note.`,
  `Provenienza effettiva: ${privateAudit.effectiveProvenanceCoverage}% / ${publicAudit.effectiveProvenanceCoverage}%.`,
  `Da revisionare: ${privateAudit.stale + publicAudit.stale}; duplicati interni: ${privateAudit.exactDuplicates.length + publicAudit.exactDuplicates.length}; contraddizioni esplicite: ${privateAudit.claimConflicts.length + publicAudit.claimConflicts.length}.`,
  `Fondazione condivisa tracciata: ${separation.sharedExactBodies} corpi; contenuti esclusivi: ${separation.privateOnly} privati, ${separation.publicOnly} pubblici.`
].join('\n') + '\n');

const blocking = [...privateAudit.issues, ...publicAudit.issues];
if (strict && blocking.length) {
  process.stderr.write(`${blocking.slice(0, 50).map((issue) => `${issue.kind}: ${issue.file} (${issue.detail})`).join('\n')}\n`);
  if (blocking.length > 50) process.stderr.write(`... altre ${blocking.length - 50} anomalie nel report.\n`);
  process.exitCode = 1;
}
