const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  ManagedOllamaRuntime,
  parseExcludedTcpPortRanges,
  selectManagedRuntimePort
} = require('../src/ai/managed-ollama-runtime');

test('sceglie una porta runtime fuori dagli intervalli riservati da Windows', () => {
  const netsh = `\nProtocol tcp Port Exclusion Ranges\n\nStart Port    End Port\n----------    --------\n     12813       12912\n     12913       13012\n     50000       50059     *\n`;
  assert.deepEqual(parseExcludedTcpPortRanges(netsh), [[12813, 12912], [12913, 13012], [50000, 50059]]);
  const port = selectManagedRuntimePort(872, {
    platform: 'win32',
    runProcess() { return { status: 0, stdout: netsh }; }
  });
  assert.equal(port, 13013);
});

test('shutdown termina soltanto il runtime Ollama posseduto e ne vieta il riavvio', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-managed-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'resources', 'ollama', process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ollama.exe' : 'ollama');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'runtime');
  const child = new EventEmitter();
  child.pid = 4242;
  let spawns = 0;
  let taskkillCalls = 0;
  let fallbackKills = 0;
  let runtime;
  child.kill = (signal) => {
    assert.equal(runtime.process, child);
    assert.equal(signal, 'SIGKILL');
    fallbackKills += 1;
    return true;
  };
  runtime = new ManagedOllamaRuntime({
    enabled: true,
    resourcesPath: path.join(root, 'resources'),
    userDataPath: path.join(root, 'data'),
    platform: 'win32',
    logger: { info() {}, warn() {}, error() {} },
    runtimeSecurityCheck() { return { version: 'test', blockingFindings: 0 }; },
    spawnProcess() { spawns += 1; return child; },
    runTaskkill(command, args) {
      assert.equal(command, 'taskkill.exe');
      assert.deepEqual(args, ['/pid', '4242', '/t', '/f']);
      assert.equal(runtime.process, child);
      taskkillCalls += 1;
      return { status: 1 };
    }
  });
  let healthChecks = 0;
  runtime.health = async () => ++healthChecks > 1;

  assert.equal((await runtime.start()).available, true);
  assert.equal(spawns, 1);
  assert.equal(runtime.shutdown(), true);
  assert.equal(taskkillCalls, 1);
  assert.equal(fallbackKills, 1);
  assert.equal(runtime.shutdown(), false);
  assert.equal((await runtime.ensureHealthy()).reason, 'runtime-stopped');
  assert.equal((await runtime.start()).reason, 'runtime-stopped');
  assert.equal(spawns, 1);
});

test('non avvia un runtime che non supera il gate di sicurezza', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-managed-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'resources', 'ollama', process.platform === 'win32' ? 'windows-x64' : `${process.platform}-${process.arch}`, process.platform === 'win32' ? 'ollama.exe' : 'ollama');
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, 'runtime');
  let spawns = 0;
  const runtime = new ManagedOllamaRuntime({
    enabled: true,
    resourcesPath: path.join(root, 'resources'),
    userDataPath: path.join(root, 'data'),
    logger: { info() {}, warn() {}, error() {} },
    runtimeSecurityCheck() { throw Object.assign(new Error('vulnerabile'), { code: 'OLLAMA_RUNTIME_VULNERABLE' }); },
    spawnProcess() { spawns += 1; throw new Error('non deve partire'); }
  });
  runtime.health = async () => false;

  assert.deepEqual(await runtime.start(), {
    managed: true, available: false, baseUrl: runtime.baseUrl, reason: 'runtime-security-blocked'
  });
  assert.equal(spawns, 0);
});

test('shutdown non termina un servizio Ollama esterno non posseduto', async () => {
  let terminations = 0;
  const runtime = new ManagedOllamaRuntime({
    enabled: false,
    resourcesPath: '',
    userDataPath: '',
    terminateProcess() { terminations += 1; }
  });
  runtime.health = async () => true;

  assert.deepEqual(await runtime.start(), { managed: false, available: true, baseUrl: runtime.baseUrl });
  assert.equal(runtime.shutdown(), false);
  assert.equal(terminations, 0);
});

test('usa un eseguibile verificato alternativo per i loader GPU sensibili al percorso', () => {
  const explicit = path.join(os.tmpdir(), 'NexusNXS-Runtime', 'ollama.exe');
  const runtime = new ManagedOllamaRuntime({
    enabled: false,
    resourcesPath: path.join(os.tmpdir(), '[AI]', 'vendor'),
    executablePath: explicit,
    userDataPath: os.tmpdir()
  });
  assert.equal(runtime.executablePath, path.resolve(explicit));
  assert.equal(runtime.securityExecutablePath, path.resolve(explicit));
});

test('taskkill riuscito chiude l albero posseduto senza inviare un secondo segnale', () => {
  let fallbackKills = 0;
  let runtime;
  const child = {
    pid: 4243,
    kill() {
      fallbackKills += 1;
      return true;
    }
  };
  runtime = new ManagedOllamaRuntime({
    enabled: true,
    resourcesPath: '',
    userDataPath: '',
    platform: 'win32',
    runTaskkill(command, args) {
      assert.equal(command, 'taskkill.exe');
      assert.deepEqual(args, ['/pid', '4243', '/t', '/f']);
      assert.equal(runtime.process, child);
      return { status: 0 };
    }
  });
  runtime.process = child;
  runtime.ownedProcess = true;

  assert.equal(runtime.shutdown(), true);
  assert.equal(fallbackKills, 0);
  assert.equal(runtime.process, null);
  assert.equal(runtime.ownedProcess, false);
});
