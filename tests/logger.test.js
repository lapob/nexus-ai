const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger, sanitizeLogValue } = require('../src/services/logger');

test('scrive log locali ruotati senza interrompere il processo', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-logger-'));
  const filePath = path.join(directory, 'logs', 'nexus.log');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const originalLog = console.log;
  console.log = () => {};
  t.after(() => { console.log = originalLog; });

  const logger = createLogger({ filePath, maxBytes: 120, backups: 2 });
  logger.info('prima registrazione');
  logger.info('seconda registrazione abbastanza lunga da attivare la rotazione');
  logger.info('terza registrazione');

  assert.equal(fs.existsSync(filePath), true);
  assert.equal(fs.existsSync(`${filePath}.1`), true);
  assert.match(fs.readFileSync(filePath, 'utf8'), /terza registrazione/);
});

test('oscura credenziali comuni anche dentro testo, URL e JWT', () => {
  const githubCredential = `github_${'pat'}_abcdefghijklmnopqrstuvwxyz123456`;
  const input = [
    'password=hunter2',
    githubCredential,
    'https://user:secret@example.test/path?access_token=topsecret',
    'eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop'
  ].join(' ');
  const sanitized = sanitizeLogValue(input);
  assert.equal(sanitized.includes(githubCredential), false);
  assert.doesNotMatch(sanitized, /hunter2|:secret@|topsecret|eyJabcdefghijk/);
  assert.match(sanitized, /\[REDACTED\]/);
});

test('gestisce riferimenti circolari senza interrompere il logging', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-logger-cycle-'));
  const filePath = path.join(directory, 'nexus.log');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const context = { safe: 'ok' };
  context.self = context;
  createLogger({ filePath }).info('contesto circolare', context);
  const record = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.equal(record.safe, 'ok');
  assert.equal(record.self, '[Circular]');
});
