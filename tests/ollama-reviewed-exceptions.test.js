const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { auditOllamaRuntime, auditOllamaRuntimeAsync, loadReviewedExceptions, packageLinked, REVIEWED_EXCEPTIONS_PATH } = require('../src/ai/ollama-runtime-security');

const FINDING = { vulnerability: { id: 'GO-2026-6860', severity: 'High' }, artifact: { name: 'golang.org/x/net', version: 'v0.61.0' } };

function runner(findings) {
  return (command, args) => {
    if (command === 'powershell.exe') return { status: 0, stdout: JSON.stringify({ Status: 'Valid', Signer: 'CN=Ollama Inc.' }), stderr: '' };
    if (command === 'grype') return { status: 0, stdout: JSON.stringify({ matches: findings }), stderr: '' };
    if (args?.[0] === '--version') return { status: 0, stdout: 'ollama version is 0.40.9', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected' };
  };
}

function fixture(t, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-exception-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, content);
  return { executable, sha256: crypto.createHash('sha256').update(content).digest('hex') };
}

function exception(overrides = {}) {
  return {
    advisory: 'GO-2026-6860', aliases: ['CVE-2026-78661'], severity: 'high', module: 'golang.org/x/net', moduleVersion: 'v0.61.0',
    vulnerablePackages: ['golang.org/x/net/html'], reviewedMs: Date.parse('2026-11-07T00:00:00Z'), expiresMs: Date.parse('2026-12-07T23:59:59Z'),
    expiresAt: '2026-12-07', ...overrides
  };
}

const NOW = Date.parse('2026-11-08T12:00:00Z');
const options = (sha256, overrides = {}) => ({ platform: 'win32', usage: 'distribution', runProcess: runner([FINDING]), now: NOW,
  reviewedExceptions: [exception({ runtimeSha256: sha256 })], ...overrides });

test('eccezione esatta: High esonerato solo se il pacchetto vulnerabile non è nel binario', (t) => {
  const { executable, sha256 } = fixture(t, 'golang.org/x/net/http2.(*Framer) golang.org/x/net/idna.ToASCII');
  const result = auditOllamaRuntime(executable, options(sha256));
  assert.equal(result.blockingFindings, 0);
  assert.equal(result.waivedFindings, 1);
  assert.equal(result.warnings[0].code, 'OLLAMA_REVIEWED_EXCEPTION');
});

test('ogni variazione rispetto all’eccezione resta bloccata (fail-closed)', (t) => {
  const { executable, sha256 } = fixture(t, 'golang.org/x/net/http2.(*Framer)');
  const blocked = (overrides) => assert.throws(() => auditOllamaRuntime(executable, { ...options(sha256), ...overrides }), { code: 'OLLAMA_RUNTIME_VULNERABLE' });
  blocked({ reviewedExceptions: [exception({ runtimeSha256: 'f'.repeat(64) })] });
  blocked({ now: Date.parse('2026-12-09T00:00:00Z') });
  blocked({ reviewedExceptions: [exception({ runtimeSha256: sha256, moduleVersion: 'v0.60.0' })] });
  blocked({ reviewedExceptions: [] });
  blocked({ runProcess: runner([{ ...FINDING, vulnerability: { id: 'GO-2026-6860', severity: 'Critical' } }]) });
  blocked({ runProcess: runner([FINDING, { vulnerability: { id: 'GO-2026-9999', severity: 'High' }, artifact: { name: 'golang.org/x/net', version: 'v0.61.0' } }]) });
});

test('se il pacchetto vulnerabile è compilato nel binario l’eccezione non vale', (t) => {
  const { executable, sha256 } = fixture(t, 'runtime golang.org/x/net/html.Parse golang.org/x/net/http2.(*Framer)');
  assert.throws(() => auditOllamaRuntime(executable, options(sha256)), { code: 'OLLAMA_RUNTIME_VULNERABLE' });
});

test('anche il percorso asincrono del server applica controllo dei simboli ed eccezione', async (t) => {
  const { executable, sha256 } = fixture(t, 'golang.org/x/net/http2.(*Framer)');
  const run = runner([FINDING]);
  const stages = [];
  const result = await auditOllamaRuntimeAsync(executable, { ...options(sha256), runProcess: async (...args) => run(...args), onStage: ({ stage }) => stages.push(stage) });
  assert.equal(result.waivedFindings, 1);
  assert.ok(stages.includes('reachability'));
});

test('file eccezioni: schema stretto, scadenza ≤ 30 giorni, mai Critical', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-exception-file-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (exceptions) => { const file = path.join(root, `${crypto.randomUUID()}.json`); fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, exceptions })); return file; };
  const valid = { advisory: 'GO-2026-6860', severity: 'high', module: 'golang.org/x/net', moduleVersion: 'v0.61.0', vulnerablePackages: ['golang.org/x/net/html'],
    runtimeSha256: 'a'.repeat(64), reviewedAt: '2026-11-07', expiresAt: '2026-12-07', evidence: 'Pacchetto html assente dal binario, verificato sui simboli Go.' };
  assert.equal(loadReviewedExceptions(write([valid])).length, 1);
  assert.deepEqual(loadReviewedExceptions(path.join(root, 'missing.json')), []);
  for (const bad of [{ expiresAt: '2027-01-30' }, { severity: 'critical' }, { vulnerablePackages: ['other/module'] }, { evidence: 'breve' }, { runtimeSha256: 'xyz' }]) {
    assert.throws(() => loadReviewedExceptions(write([{ ...valid, ...bad }])), { code: 'OLLAMA_EXCEPTIONS_INVALID' });
  }
  const broken = path.join(root, 'broken.json'); fs.writeFileSync(broken, '{');
  assert.throws(() => loadReviewedExceptions(broken), { code: 'OLLAMA_EXCEPTIONS_INVALID' });
});

test('il file di policy del repository è valido e copre solo GO-2026-6860', () => {
  const entries = loadReviewedExceptions(REVIEWED_EXCEPTIONS_PATH);
  assert.deepEqual(entries.map((entry) => entry.advisory), ['GO-2026-6860']);
  assert.ok(entries[0].expiresMs - entries[0].reviewedMs <= 31 * 86_400_000);
  assert.equal(packageLinked('x golang.org/x/net/html.Parse', 'golang.org/x/net/html'), true);
  assert.equal(packageLinked('x golang.org/x/net/http2.Framer', 'golang.org/x/net/html'), false);
});
