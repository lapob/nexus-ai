/**
 * @module ai/native-runtime-supervisor
 * @description Chiude il figlio nativo quando il processo proprietario perde il canale IPC.
 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const { sanitizedRuntimeEnvironment, terminateOwnedProcessTree } = require('./managed-ollama-runtime');
const utilityChildren = new WeakSet();

// #region 01 — Processo supervisore con canale privato

function spawnSupervisedLlamaProcess(executable, args, options = {}) {
  const env = { ...sanitizedRuntimeEnvironment(options.env), LLAMA_API_KEY: options.env?.LLAMA_API_KEY,
    HF_HUB_OFFLINE: '1' };
  if (process.versions.electron) return spawnUtilitySupervisor(executable, args, options, env);
  return spawn(process.execPath, [__filename, executable, ...args], {
    ...options, windowsHide: true, shell: false,
    // Il gruppo POSIX appartiene esclusivamente a questa istanza.
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env
  });
}

function spawnUtilitySupervisor(executable, args, options, env) {
  if (process.type !== 'browser') throw new Error('Il supervisore Electron richiede il processo principale.');
  // Il pacchetto conserva runAsNode:false: usare il servizio Node di Chromium,
  // senza riavviare l'eseguibile come UI o indebolire i fuse della release.
  const { utilityProcess, MessageChannelMain } = require('electron');
  const channel = new MessageChannelMain();
  const worker = utilityProcess.fork(__filename, [executable, ...args], {
    env, cwd: options.cwd, stdio: 'ignore', serviceName: 'Nexus native supervisor'
  });
  const child = new EventEmitter();
  utilityChildren.add(child);
  child.connected = true; child.exitCode = null; child.signalCode = null;
  child.disconnect = () => { child.connected = false; channel.port1.close(); };
  child.kill = () => worker.kill();
  worker.once('spawn', () => { child.pid = worker.pid; child.emit('spawn'); });
  worker.once('error', error => child.emit('error', error));
  worker.once('exit', code => {
    child.exitCode = code; child.connected = false; channel.port1.close();
    child.emit('exit', code, null); child.emit('close', code, null);
  });
  worker.postMessage({ type: 'native-runtime-owner' }, [channel.port2]);
  return child;
}

function terminateSupervisedLlamaProcess(child) {
  if (!child || child.exitCode != null || child.signalCode != null) return false;
  if (child.connected) {
    try { child.disconnect(); return true; } catch { /* Recupero forzato del solo gruppo posseduto. */ }
  }
  if (process.platform !== 'win32' && Number.isInteger(child.pid) && child.pid > 0) {
    if (utilityChildren.has(child)) return child.kill();
    try { process.kill(-child.pid, 'SIGKILL'); return true; } catch { return false; }
  }
  return terminateOwnedProcessTree(child);
}

// #endregion

// #region 02 — Guardia della vita del proprietario

function superviseNative() {
  const executable = process.argv[2];
  const key = process.env.LLAMA_API_KEY;
  const utility = process.type === 'utility' && process.parentPort;
  if ((!process.connected && !utility) || !path.isAbsolute(executable || '') || !/^[A-Za-z0-9_-]{32,256}$/u.test(key || '')) {
    process.exitCode = 1;
    if (process.connected) process.disconnect();
    return;
  }
  let child, closing = false, ownerPort;
  const stop = () => {
    closing = true;
    if (child) terminateOwnedProcessTree(child);
  };
  process.once('SIGTERM', stop);
  // Registrare prima dello spawn: la morte del proprietario non può lasciare
  // un avvio differito senza guardia. Nessun messaggio può cambiare il comando.
  const start = () => {
    if (closing) return;
    try {
      child = spawn(executable, process.argv.slice(3), {
        windowsHide: true, detached: false, shell: false, stdio: 'ignore', cwd: path.dirname(executable),
        env: { ...sanitizedRuntimeEnvironment(), LLAMA_API_KEY: key, HF_HUB_OFFLINE: '1' }
      });
    } catch { process.exit(1); return; }
    child.once('error', () => { process.exitCode = 1; });
    child.once('close', code => {
      const exitCode = closing ? 0 : Number.isInteger(code) ? code : 1;
      ownerPort?.close();
      if (process.connected) process.disconnect();
      process.exit(exitCode);
    });
  };
  if (utility) {
    const deadline = setTimeout(() => process.exit(1), 10000);
    const bindOwner = event => {
      if (ownerPort || event.data?.type !== 'native-runtime-owner' || event.ports?.length !== 1) return;
      clearTimeout(deadline); ownerPort = event.ports[0];
      process.parentPort.removeListener('message', bindOwner);
      ownerPort.once('close', stop); ownerPort.start(); start();
    };
    process.parentPort.on('message', bindOwner);
  } else {
    process.once('disconnect', stop);
    if (process.connected) start();
  }
}

if (require.main === module) superviseNative();
module.exports = { spawnSupervisedLlamaProcess, terminateSupervisedLlamaProcess };

// #endregion
