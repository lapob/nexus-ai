/**
 * @module security/action-receipt
 * @description Ricevute minimali e firmabili per azioni e rollback, prive di contenuti utente.
 */

const { createHash, randomUUID } = require('node:crypto');

// #region 01 — Canonicalizzazione metadata-only

function bounded(value, max = 128, fallback = '') {
  const text = String(value ?? '').trim().slice(0, max);
  return text || fallback;
}

function canonicalReceiptPayload(receipt) {
  const payload = { ...receipt };
  delete payload.integrity;
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function transactionFingerprint(value) {
  if (!value) return '';
  return createHash('sha256').update('nexusnxs-transaction-v1\0').update(String(value)).digest('hex');
}

function normalizeSignature(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const algorithm = bounded(value.algorithm, 32);
  const keyId = bounded(value.keyId, 128);
  const signature = Buffer.isBuffer(value.signature)
    ? value.signature.toString('base64url')
    : bounded(value.signature, 16 * 1024);
  if (!algorithm || !keyId || !signature) return null;
  return { algorithm, keyId, signature };
}

// #endregion
// #region 02 — Creazione e verifica ricevute

function createActionReceipt({
  actionId,
  outcome,
  tool,
  effect = 'unknown',
  verification = '',
  workspaceId,
  subjectId = '',
  subjectKind = 'local',
  keyFingerprint = '',
  rollbackPolicy = 'not-guaranteed',
  rollbackStatus = 'not-requested',
  transactionId = '',
  checkpointCount = 0,
  artifactKinds = [],
  startedAt,
  completedAt
}, { signer = null, receiptId = randomUUID() } = {}) {
  const receipt = {
    version: 1,
    id: bounded(receiptId, 128),
    actionId: bounded(actionId, 128),
    outcome: bounded(outcome, 32, 'unknown'),
    tool: bounded(tool, 64, 'unknown'),
    effect: bounded(effect, 32, 'unknown'),
    verification: bounded(verification, 128, 'not-reported'),
    workspaceId: bounded(workspaceId, 128),
    subject: subjectId
      ? {
          kind: bounded(subjectKind, 32, 'opaque-session'),
          id: bounded(subjectId, 128),
          ...(keyFingerprint ? { keyFingerprint: bounded(keyFingerprint, 128) } : {})
        }
      : { kind: 'local' },
    rollback: {
      policy: bounded(rollbackPolicy, 32, 'not-guaranteed'),
      status: bounded(rollbackStatus, 32, 'not-requested'),
      transaction: transactionFingerprint(transactionId),
      checkpoints: Math.max(0, Math.min(Number(checkpointCount) || 0, 10_000))
    },
    artifacts: {
      count: Math.max(0, Math.min(artifactKinds.length, 10_000)),
      kinds: [...new Set(artifactKinds.map((item) => bounded(item, 32)).filter(Boolean))].slice(0, 16)
    },
    startedAt: Number(startedAt) || 0,
    completedAt: Number(completedAt) || 0
  };
  const payload = canonicalReceiptPayload(receipt);
  const digest = createHash('sha256').update(payload).digest('hex');
  const signed = typeof signer === 'function' ? normalizeSignature(signer(payload, { digest })) : null;
  receipt.integrity = {
    digest: `sha256:${digest}`,
    signature: signed || { status: typeof signer === 'function' ? 'invalid' : 'not-configured' }
  };
  Object.freeze(receipt.subject);
  Object.freeze(receipt.rollback);
  Object.freeze(receipt.artifacts.kinds);
  Object.freeze(receipt.artifacts);
  Object.freeze(receipt.integrity.signature);
  Object.freeze(receipt.integrity);
  return Object.freeze(receipt);
}

function verifyReceiptDigest(receipt) {
  if (!receipt || typeof receipt !== 'object' || !receipt.integrity?.digest) return false;
  const digest = createHash('sha256').update(canonicalReceiptPayload(receipt)).digest('hex');
  return receipt.integrity.digest === `sha256:${digest}`;
}

// #endregion

module.exports = { canonicalReceiptPayload, createActionReceipt, transactionFingerprint, verifyReceiptDigest };
