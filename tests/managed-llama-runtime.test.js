const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { EventEmitter, once } = require('node:events');
const { setTimeout: delay } = require('node:timers/promises');
const { ManagedLlamaRuntime } = require('../src/ai/managed-llama-runtime');
const { assertRuntimeAdmission } = require('../src/ai/managed-ollama-runtime');

function fixture(t, options = {}, dependencies = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-native-lifecycle-'));
  const executablePath = path.join(root, 'server'), modelPath = path.join(root, 'model.gguf');
  fs.writeFileSync(executablePath, 'synthetic executable'); fs.writeFileSync(modelPath, 'synthetic model');
  const children = [], launches = [];
  const runtime = new ManagedLlamaRuntime({ enabled: true, executablePath, modelPath, model: 'fixture-9b',
    startupTimeoutMs: 300, stopTimeoutMs: 100, ...options }, {
    portFree: async () => true,
    runtimeSecurityCheck: async (executable, config) => ({ admitted: true, executablePath: executable,
      usage: config.usage, modelPath: config.modelPath, model: config.model }),
    fetch: async () => new Response(JSON.stringify({ data: [{ id: 'fixture-9b' }] })),
    spawnProcess(executable, args, config) {
      const child = new EventEmitter(); child.pid = 123; child.exitCode = null; child.signalCode = null;
      children.push(child); launches.push({ executable, args, config }); return child;
    },
    terminateProcess(child) {
      if (child.exitCode == null) {
        child.exitCode = 0; child.emit('exit', 0, null); child.emit('close', 0, null);
      }
      return true;
    }, ...dependencies
  });
  t.after(async () => { await runtime.shutdown(); fs.rmSync(root, { recursive: true, force: true }); });
  return { runtime, root, children, launches };
}

test('configurazione immutabile, nessun endpoint remoto o argomento shell', t => {
  const { runtime } = fixture(t);
  assert.equal(Reflect.set(runtime, 'securityUsage', 'evaluation'), false);
  assert.equal(Reflect.set(runtime, 'port', 80), false);
  for (const options of [{ port: 80 }, { device: 'Vulkan0 --rpc remote' }, { contextTokens: Infinity },
    { securityUsage: 'development' }, { executablePath: 'relative' }, { model: '--evil' },
    { reasoningBudget: -2 }, { reasoningBudget: 1.5 }, { reasoningBudget: 20000 }]) {
    assert.throws(() => new ManagedLlamaRuntime({ executablePath: process.execPath, modelPath: process.execPath,
      model: 'test', ...options }), TypeError);
  }
});

test('senza ammissione esplicita o con verdetto non vincolato non crea processi', async t => {
  for (const runtimeSecurityCheck of [undefined, () => true, () => ({ admitted: true }),
    () => { throw new Error('inventory mismatch'); }]) {
    const { runtime, launches } = fixture(t, {}, { runtimeSecurityCheck });
    assert.equal((await runtime.start()).reason, 'runtime-security-blocked');
    assert.equal(launches.length, 0);
  }
});

test('il gate pubblico richiede ownership anche quando il runtime nativo manca o è disabilitato', async t => {
  await assert.rejects(assertRuntimeAdmission(null, { provider: 'llama-cpp', requireDistribution: true }),
    error => error.code === 'AI_PROVIDER_UNAVAILABLE');
  for (const options of [{ enabled: false }, { securityUsage: 'evaluation' }]) {
    const { runtime } = fixture(t, options);
    if (runtime.enabled) assert.equal((await runtime.start()).available, true);
    await assert.rejects(assertRuntimeAdmission(runtime, { provider: 'llama-cpp', requireDistribution: true }),
      error => error.code === 'AI_PROVIDER_UNAVAILABLE');
  }
});

test('start concorrenti condividono un solo figlio; segreti solo in env e nessuna variabile AI ereditata', async t => {
  const { runtime, launches } = fixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => runtime.start()));
  assert.ok(results.every(result => result.available)); assert.equal(launches.length, 1);
  const { args, config } = launches[0], secret = runtime.providerConfig().llamaCpp.apiKey;
  assert.equal(config.env.LLAMA_API_KEY, secret); assert.equal(config.shell, false);
  assert.equal(config.env.HF_HUB_OFFLINE, '1');
  assert.ok(args.includes('--offline') && args.includes('--no-agent') && args.includes('--no-ui-mcp-proxy'));
  assert.ok(args.includes('--no-mmproj') && args.includes('--no-slots'));
  assert.equal(args.join(' ').includes(secret), false);
  assert.equal(JSON.stringify(results).includes(secret), false);
  assert.equal(JSON.stringify(runtime).includes(secret), false);
  assert.equal((await runtime.start()).available, true); assert.equal(launches.length, 1);
});

test('il budget di ragionamento è esplicito, limitato e non deriva da variabili ereditate', async t => {
  for (const reasoningBudget of [-1, 0, 512]) {
    const { runtime, launches } = fixture(t, { reasoningBudget });
    assert.equal((await runtime.start()).available, true);
    const args = launches[0].args, index = args.indexOf('--reasoning-budget');
    assert.equal(args[index + 1], String(reasoningBudget));
    assert.equal(launches[0].config.env.LLAMA_ARG_THINK_BUDGET, undefined);
  }
});

test('shutdown durante ammissione pendente annulla lo start senza lanciare figli tardivi', async t => {
  let resolveAdmission, entered;
  const admissionEntered = new Promise(resolve => { entered = resolve; });
  const { runtime, launches } = fixture(t, {}, { runtimeSecurityCheck: (executablePath, config) => {
    entered(); return new Promise(resolve => { resolveAdmission = () => resolve({ admitted: true,
      executablePath, usage: config.usage, modelPath: config.modelPath, model: config.model }); });
  } });
  const pending = runtime.start(); await admissionEntered; await runtime.shutdown();
  assert.equal((await pending).available, false); resolveAdmission(); await delay(10);
  assert.equal(launches.length, 0); assert.equal((await runtime.start()).reason, 'runtime-stopped');
});

test('ammissione senza risposta ha un timeout e non permette spawn successivo', async t => {
  const { runtime, launches } = fixture(t, { admissionTimeoutMs: 250 }, {
    runtimeSecurityCheck: () => new Promise(() => {})
  });
  assert.equal((await runtime.start()).reason, 'runtime-security-blocked');
  assert.equal(launches.length, 0);
});

test('exit durante health revoca readiness anche se la risposta in volo era valida', async t => {
  let runtime;
  ({ runtime } = fixture(t, {}, { fetch: async () => {
    const child = runtime.process; child.exitCode = 1; child.emit('exit', 1); child.emit('close', 1);
    return new Response(JSON.stringify({ data: [{ id: 'fixture-9b' }] }));
  } }));
  assert.equal((await runtime.start()).available, false);
  assert.equal(runtime.hasAdmittedProcess(), false);
});

test('un figlio non terminato resta tracciato e impedisce spawn sovrapposti', async t => {
  const { runtime, launches, children } = fixture(t, {}, { terminateProcess: () => false });
  assert.equal((await runtime.start()).available, true);
  assert.equal(await runtime.stop(), false); assert.equal(runtime.process, children[0]);
  assert.equal((await runtime.start()).available, false); assert.equal(launches.length, 1);
  assert.equal((await runtime.ensureHealthy()).reason, 'runtime-stop-failed');
  children[0].exitCode = 0; children[0].emit('exit', 0); children[0].emit('close', 0);
  assert.equal(runtime.process, null);
});

test('se il supervisore non chiude dopo il primo segnale forza solo lo stesso figlio e ne attende close', async t => {
  const stopped = [];
  const { runtime, children } = fixture(t, { stopTimeoutMs: 100 }, { terminateProcess(child) {
    stopped.push(child);
    if (stopped.length === 2) { child.exitCode = 0; child.emit('exit', 0); child.emit('close', 0); }
    return true;
  } });
  assert.equal((await runtime.start()).available, true);
  assert.equal(await runtime.stop(), true); assert.deepEqual(stopped, [children[0], children[0]]);
  assert.equal(runtime.process, null); assert.equal(runtime.hasAdmittedProcess(), false);
});

test('exit confermato dopo disconnect conclude shutdown anche senza un evento close successivo', async t => {
  const { runtime } = fixture(t, {}, { terminateProcess(child) {
    child.exitCode = 0; child.emit('exit', 0); return true;
  } });
  assert.equal((await runtime.start()).available, true);
  assert.equal(await runtime.shutdown(), true); assert.equal(runtime.process, null);
  assert.equal(runtime.hasAdmittedProcess(), false);
});

test('spawn error è gestito e la recovery fallita rispetta il cooldown', async t => {
  let spawns = 0;
  const { runtime } = fixture(t, {}, { spawnProcess() { spawns++; throw new Error('ENOENT'); } });
  assert.equal((await runtime.ensureHealthy()).reason, 'runtime-spawn-failed');
  assert.equal((await runtime.ensureHealthy()).reason, 'restart-cooldown'); assert.equal(spawns, 1);
});

test('un crash causa una sola recovery concorrente con nuova ammissione', async t => {
  let admissions = 0;
  const { runtime, launches, children } = fixture(t, {}, { runtimeSecurityCheck: (executablePath, config) => {
    admissions++; return { admitted: true, executablePath, usage: config.usage, modelPath: config.modelPath, model: config.model };
  } });
  assert.equal((await runtime.start()).available, true);
  children[0].exitCode = 1; children[0].emit('exit', 1); children[0].emit('close', 1);
  const results = await Promise.all(Array.from({ length: 8 }, () => runtime.ensureHealthy()));
  assert.ok(results.every(result => result.available)); assert.equal(launches.length, 2); assert.equal(admissions, 2);
});

test('dopo un crash attende il rilascio tardivo della sola porta già posseduta', async t => {
  let probes = 0;
  const { runtime, children, launches } = fixture(t, {}, { portFree: async () => ++probes === 1 || probes >= 4 });
  assert.equal((await runtime.start()).available, true);
  children[0].exitCode = 1; children[0].emit('exit', 1); children[0].emit('close', 1);
  assert.equal((await runtime.ensureHealthy()).available, true);
  assert.equal(launches.length, 2); assert.equal(probes, 4);
});

test('il rilascio tardivo ha un limite e non adotta un listener che resta occupato', async t => {
  let probes = 0;
  const { runtime, children, launches } = fixture(t, { portReleaseTimeoutMs: 100 }, { portFree: async () => ++probes === 1 });
  assert.equal((await runtime.start()).available, true);
  children[0].exitCode = 1; children[0].emit('exit', 1); children[0].emit('close', 1);
  assert.equal((await runtime.ensureHealthy()).reason, 'port-in-use');
  assert.equal(launches.length, 1); assert.equal(runtime.hasAdmittedProcess(), false);
});

test('un listener estraneo reale non è riutilizzato né terminato', async t => {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { runtime, launches } = fixture(t, { port: server.address().port }, { portFree: undefined });
  assert.equal((await runtime.start()).reason, 'port-in-use'); assert.equal(launches.length, 0);
  await runtime.shutdown(); assert.equal(server.listening, true);
});

const syntheticServer = `
const http = require('node:http');
http.createServer((req, res) => {
  if (req.headers.authorization !== 'Bearer ' + process.env.LLAMA_API_KEY) {
    res.writeHead(401); res.end(); return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({data:[{id: process.env.TEST_MODEL}]}));
}).listen(Number(process.env.TEST_PORT), '127.0.0.1');
`;

test('processo HTTP reale: autenticazione, ownership, crash, riavvio e shutdown senza orfani', async t => {
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const realChildren = [];
  const { runtime } = fixture(t, { port, startupTimeoutMs: 10000, stopTimeoutMs: 5000 }, {
    portFree: undefined, fetch: globalThis.fetch,
    spawnProcess(_executable, _args, config) {
      const child = spawn(process.execPath, ['-e', syntheticServer], { ...config,
        env: { ...config.env, TEST_PORT: String(port), TEST_MODEL: 'fixture-9b' } });
      realChildren.push(child); return child;
    }, terminateProcess: child => child.kill('SIGKILL')
  });
  t.after(() => { for (const child of realChildren) if (child.exitCode == null && child.signalCode == null) child.kill('SIGKILL'); });
  assert.equal((await runtime.start()).available, true);
  const response = await fetch(runtime.baseUrl + '/v1/models');
  assert.equal(response.status, 401); await response.body.cancel();
  await assertRuntimeAdmission(runtime, { provider: 'llama-cpp', requireDistribution: true });
  const crashed = once(realChildren[0], 'close'); realChildren[0].kill('SIGKILL'); await crashed;
  assert.equal((await runtime.ensureHealthy()).available, true); assert.equal(realChildren.length, 2);
  assert.equal(await runtime.shutdown(), true); assert.equal(runtime.process, null);
  assert.equal(runtime.hasAdmittedProcess(), false);
  await assert.rejects(fetch(runtime.baseUrl + '/v1/models', { signal: AbortSignal.timeout(1000) }));
});

test('il supervisore non lancia un runtime senza il canale IPC del proprietario', async () => {
  const supervisor = require.resolve('../src/ai/native-runtime-supervisor');
  const child = spawn(process.execPath, [supervisor, process.execPath, '-e', 'process.exit(99)'], {
    windowsHide: true, stdio: 'ignore', env: { ...process.env, LLAMA_API_KEY: 'x'.repeat(32) }
  });
  const [code] = await once(child, 'close'); assert.equal(code, 1);
});

test('Electron usa utilityProcess e un port proprietario senza richiedere RunAsNode', () => {
  const vm = require('node:vm'), { createRequire } = require('node:module');
  const file = require.resolve('../src/ai/native-runtime-supervisor'), localRequire = createRequire(file);
  const worker = new EventEmitter(); worker.pid = 123; worker.kill = () => true;
  let forkOptions, ownerMessage, transferred, ownerClosed = false;
  worker.postMessage = (message, ports) => { ownerMessage = message; transferred = ports; };
  const port1 = { close() { ownerClosed = true; } }, port2 = {};
  const fakeElectron = { utilityProcess: { fork(_file, _args, options) { forkOptions = options; return worker; } },
    MessageChannelMain: class { constructor() { this.port1 = port1; this.port2 = port2; } } };
  const module = { exports: {} };
  const fakeRequire = name => name === 'electron' ? fakeElectron : name === 'node:child_process'
    ? { spawn() { throw new Error('Electron executable must not be relaunched as Node.'); } } : localRequire(name);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, __filename: file, require: fakeRequire,
    process: { versions: { electron: '43' }, platform: 'win32', type: 'browser' } });
  const child = module.exports.spawnSupervisedLlamaProcess(process.execPath, [], {
    env: { PATH: 'fixture', LLAMA_API_KEY: 'x'.repeat(32), GITHUB_TOKEN: 'fixture-not-a-real-token', ELECTRON_RUN_AS_NODE: '1' }
  });
  assert.equal(forkOptions.env.ELECTRON_RUN_AS_NODE, undefined); assert.equal(forkOptions.env.GITHUB_TOKEN, undefined);
  assert.equal(forkOptions.env.LLAMA_API_KEY, 'x'.repeat(32)); assert.equal(forkOptions.stdio, 'ignore');
  assert.equal(ownerMessage.type, 'native-runtime-owner'); assert.equal(transferred[0], port2);
  worker.emit('spawn'); assert.equal(child.pid, 123);
  assert.equal(module.exports.terminateSupervisedLlamaProcess(child), true); assert.equal(ownerClosed, true);
  worker.emit('exit', 0); assert.equal(child.exitCode, 0); assert.equal(child.connected, false);
  assert.equal(require('../package.json').build.electronFuses.runAsNode, false);
});

test('il crash reale del proprietario chiude anche il listener del runtime supervisionato', { timeout: 15000 }, async t => {
  const reservation = net.createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const supervisor = require.resolve('../src/ai/native-runtime-supervisor');
  // Il limite indipendente evita di lasciare un server di test se la regressione ricompare.
  const serverCode = syntheticServer.replace('process.env.TEST_MODEL', "'fixture-9b'")
    .replace('Number(process.env.TEST_PORT)', String(port)) + '\nsetTimeout(()=>process.exit(0),8000);';
  const parentCode = `
    const { spawnSupervisedLlamaProcess } = require(${JSON.stringify(supervisor)});
    const child = spawnSupervisedLlamaProcess(process.execPath, ['-e', ${JSON.stringify(serverCode)}], {
      env: {...process.env, LLAMA_API_KEY: 'x'.repeat(32)}
    });
    child.once('spawn',()=>console.log('spawned'));
    child.once('close',()=>process.exit(0));
    setInterval(()=>{},1000);
  `;
  const parent = spawn(process.execPath, ['-e', parentCode], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  t.after(() => { if (parent.exitCode == null && parent.signalCode == null) parent.kill('SIGKILL'); });
  await once(parent.stdout, 'data');
  const endpoint = `http://127.0.0.1:${port}/v1/models`;
  const reachable = async () => {
    try {
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(250), headers: { Authorization: 'Bearer ' + 'x'.repeat(32) } });
      await response.body?.cancel(); return response.ok;
    } catch { return false; }
  };
  const readyDeadline = Date.now() + 4000;
  while (!await reachable() && Date.now() < readyDeadline) await delay(25);
  assert.equal(await reachable(), true);
  const exited = once(parent, 'close'); parent.kill('SIGKILL'); await exited;
  const stopDeadline = Date.now() + 3000;
  while (await reachable() && Date.now() < stopDeadline) await delay(25);
  assert.equal(await reachable(), false, 'La perdita del proprietario deve chiudere il figlio, senza aspettare il timer di sicurezza.');
});
