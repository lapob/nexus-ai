/**
 * @module infrastructure/storage/encrypted-backup
 * @description Archivio personale portabile cifrato con AES-256-GCM e scrypt.
 */
const crypto = require('node:crypto');

const SCHEMA = 2;
const KEY_BYTES = 32;

function normalizePassphrase(value) {
  const passphrase = String(value || '');
  if (passphrase.length < 10 || passphrase.length > 256) {
    throw new Error('La password del backup deve contenere almeno 10 caratteri.');
  }
  return passphrase;
}

function encryptArchive(data, passphrase) {
  const password = normalizePassphrase(passphrase);
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(password, salt, KEY_BYTES, { N: 16384, r: 8, p: 1 });
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    schemaVersion: SCHEMA,
    encryption: 'aes-256-gcm+scrypt',
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ciphertext.toString('base64')
  };
}

function decryptArchive(container, passphrase) {
  if (container?.schemaVersion !== SCHEMA || container?.encryption !== 'aes-256-gcm+scrypt') {
    throw new Error('Archivio NEXUSNXS cifrato non valido.');
  }
  const password = normalizePassphrase(passphrase);
  try {
    const salt = Buffer.from(String(container.salt || ''), 'base64');
    const iv = Buffer.from(String(container.iv || ''), 'base64');
    const tag = Buffer.from(String(container.tag || ''), 'base64');
    const ciphertext = Buffer.from(String(container.data || ''), 'base64');
    if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error('invalid');
    const key = crypto.scryptSync(password, salt, KEY_BYTES, { N: 16384, r: 8, p: 1 });
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  } catch {
    throw new Error('Password errata oppure archivio NEXUSNXS danneggiato.');
  }
}

module.exports = { decryptArchive, encryptArchive, normalizePassphrase };
