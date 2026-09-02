const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, verify } = require('node:crypto');
const { canonicalReceiptPayload, createActionReceipt, verifyReceiptDigest } = require('../src/security/action-receipt');

test('la ricevuta contiene solo metadati firmabili e nessun contenuto operativo', () => {
  const keys = generateKeyPairSync('ed25519');
  const receipt = createActionReceipt({
    actionId: 'ticket-1', outcome: 'completed', tool: 'write_file', effect: 'write',
    verification: 'write-complete', workspaceId: 'a'.repeat(64), subjectId: 'b'.repeat(64),
    subjectKind: 'verified-device', keyFingerprint: 'c'.repeat(64), rollbackPolicy: 'automatic',
    rollbackStatus: 'available', transactionId: 'private-transaction-name', checkpointCount: 1,
    artifactKinds: ['file-change'], startedAt: 1000, completedAt: 1200,
    path: 'C:\\private\\secret.txt', content: 'token=do-not-store'
  }, {
    receiptId: 'receipt-1',
    signer: (payload) => ({ algorithm: 'ed25519', keyId: 'test-only', signature: sign(null, payload, keys.privateKey) })
  });
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('private\\secret'), false);
  assert.equal(serialized.includes('do-not-store'), false);
  assert.equal(serialized.includes('private-transaction-name'), false);
  assert.equal(receipt.rollback.transaction.length, 64);
  assert.equal(verifyReceiptDigest(receipt), true);
  assert.equal(verify(null, canonicalReceiptPayload(receipt), keys.publicKey, Buffer.from(receipt.integrity.signature.signature, 'base64url')), true);
});

test('la modifica della ricevuta invalida il digest', () => {
  const receipt = createActionReceipt({
    actionId: 'ticket-2', outcome: 'completed', tool: 'read_file', workspaceId: 'a'.repeat(64),
    startedAt: 1, completedAt: 2
  }, { receiptId: 'receipt-2' });
  assert.equal(verifyReceiptDigest(receipt), true);
  assert.equal(verifyReceiptDigest({ ...receipt, outcome: 'failed' }), false);
});
