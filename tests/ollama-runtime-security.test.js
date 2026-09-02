const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { auditOllamaRuntime, blockingFindings, compareVersions, isLoopbackHost, parseOllamaVersion } = require('../src/ai/ollama-runtime-security');

function fixtureRunner({ findings = [], signature = { Status: 'Valid', Signer: 'CN=Ollama Inc., O=Ollama Inc.' } } = {}) {
  return (command, args) => {
    if (command === 'powershell.exe') return { status: 0, stdout: JSON.stringify(signature), stderr: '' };
    if (command === 'grype') return { status: 0, stdout: JSON.stringify({ matches: findings }), stderr: '' };
    if (args?.[0] === '--version') return { status: 0, stdout: 'ollama version is 0.32.15', stderr: '' };
    return { status: 1, stdout: '', stderr: 'unexpected command' };
  };
}

test('estrae la versione client anche quando Ollama non raggiunge il server', () => {
  assert.equal(parseOllamaVersion('Warning: client version is 0.32.3'), '0.32.3');
  assert.equal(parseOllamaVersion('ollama version is 0.32.15'), '0.32.15');
  assert.equal(compareVersions('0.32.15', '0.32.3'), 1);
  assert.equal(compareVersions('0.32.3', '0.32.3'), 0);
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});

test('il gate accetta soltanto firma ufficiale e scansione senza High o Critical', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'verified-runtime');
  const result = auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner() });
  assert.equal(result.version, '0.32.15');
  assert.equal(result.signature.status, 'Valid');
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
});

test('il gate blocca vulnerabilità High o Critical e ignora severità inferiori', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'vulnerable-runtime');
  const findings = [
    { vulnerability: { id: 'LOW-1', severity: 'Low' }, artifact: { name: 'safe-enough' } },
    { vulnerability: { id: 'HIGH-1', severity: 'High' }, artifact: { name: 'stdlib' } },
    { vulnerability: { id: 'CRIT-1', severity: 'Critical' }, artifact: { name: 'x/crypto' } }
  ];
  assert.deepEqual(blockingFindings({ matches: findings }).map((item) => item.id), ['HIGH-1', 'CRIT-1']);
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner({ findings }) }),
    (error) => error.code === 'OLLAMA_RUNTIME_VULNERABLE' && error.details.findings.length === 2
  );
  const loopback = auditOllamaRuntime(executable, {
    platform: 'win32', runProcess: fixtureRunner({ findings }), usage: 'development', host: '127.0.0.1'
  });
  assert.equal(loopback.blockingFindings, 2);
  assert.equal(loopback.warnings[0].code, 'OLLAMA_MODULE_FINDINGS_LOOPBACK_ONLY');
  assert.throws(
    () => auditOllamaRuntime(executable, {
      platform: 'win32', runProcess: fixtureRunner({ findings }), usage: 'development', host: '0.0.0.0'
    }),
    (error) => error.code === 'OLLAMA_RUNTIME_VULNERABLE'
  );
});

test('il gate applica un floor di versione anche allo sviluppo loopback', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'old-runtime');
  const runner = (command, args) => {
    if (command === 'powershell.exe') return { status: 0, stdout: JSON.stringify({ Status: 'Valid', Signer: 'CN=Ollama Inc.' }), stderr: '' };
    if (command === 'grype') return { status: 0, stdout: JSON.stringify({ matches: [] }), stderr: '' };
    if (args?.[0] === '--version') return { status: 0, stdout: 'ollama version is 0.31.9', stderr: '' };
    return { status: 1, stderr: 'unexpected' };
  };
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'win32', runProcess: runner, usage: 'development', host: '127.0.0.1' }),
    (error) => error.code === 'OLLAMA_VERSION_UNSUPPORTED'
  );
});

test('il gate fallisce chiuso se firma o scanner non sono verificabili', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-ollama-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'ollama.exe');
  fs.writeFileSync(executable, 'unknown-runtime');
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'win32', runProcess: fixtureRunner({ signature: { Status: 'NotSigned', Signer: '' } }) }),
    (error) => error.code === 'OLLAMA_SIGNATURE_INVALID'
  );
  assert.throws(
    () => auditOllamaRuntime(executable, { platform: 'linux', requireSignature: false, runProcess: (command, args) => (
      args?.[0] === '--version' ? { status: 0, stdout: 'ollama version is 0.32.15', stderr: '' } : { status: 1, stderr: 'missing scanner' }
    ) }),
    (error) => error.code === 'OLLAMA_SECURITY_SCAN_FAILED'
  );
});

test('il provisioning preserva backend GPU firmati, aggiornamento esplicito e rollback atomico', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'prepare-ollama-runtime.ps1'), 'utf8');
  assert.match(source, /\[switch\]\$ForceUpdate/);
  assert.match(source, /\[switch\]\$KeepBackup/);
  assert.match(source, /\[string\]\$SourceDirectory/);
  assert.match(source, /Assert-OfficialRuntimeTree -Root \$sourceFull/);
  assert.match(source, /Copy-Item -LiteralPath \(Join-Path \$sourceFull 'lib'\)/);
  assert.match(source, /Get-ChildItem -LiteralPath \$extract -Force[\s\S]+Copy-Item -Destination \$staging/);
  assert.match(source, /lib\\ollama\\rocm_v7_1\\ggml-hip\.dll/);
  assert.match(source, /lib\\ollama\\cuda_v12\\ggml-cuda\.dll/);
  assert.match(source, /lib\\ollama\\vulkan\\ggml-vulkan\.dll/);
  assert.match(source, /Get-ChildItem -LiteralPath \$Root -Recurse -File/);
  assert.match(source, /SignerCertificate\.Subject -notmatch '\\bOllama Inc\\b'/);
  assert.match(source, /\.ollama-download-/);
  assert.match(source, /Move-Item -LiteralPath \$destinationFull -Destination \$backup/);
  assert.match(source, /Move-Item -LiteralPath \$staging -Destination \$destinationFull[\s\S]+Assert-OfficialRuntimeTree -Root \$destinationFull/);
  assert.match(source, /Move-Item -LiteralPath \$backup -Destination \$destinationFull/);
  assert.match(source, /if \(\$KeepBackup\)/);
});
