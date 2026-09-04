/**
 * @module scripts/verify-app-shutdown
 * @description Verifica reale che la X termini la UI ma conservi la Presence leggera.
 */
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { isProcessAlive, readLock, requestProcessShutdown } = require('../src/infrastructure/electron/process-lock');

const root = path.resolve(__dirname, '..');
const electronBinary = require('electron');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-shutdown-'));
let debugPort = 0;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function reserveDebugPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

// #region 01 — Inventario e terminazione dei processi di prova

function processSnapshot() {
  if (process.platform === 'win32') {
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      '@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine) | ConvertTo-Json -Compress'
    ], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0 || !result.stdout.trim()) return [];
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
      pid: Number(item.ProcessId),
      parentPid: Number(item.ParentProcessId),
      commandLine: String(item.CommandLine || '')
    }));
  }
  const result = spawnSync('ps', ['-eo', 'pid=,ppid=,args='], { encoding: 'utf8' });
  if (result.status !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s*(.*)$/);
    return match ? { pid: Number(match[1]), parentPid: Number(match[2]), commandLine: match[3] } : null;
  }).filter(Boolean);
}

function descendantsOf(snapshot, rootPid) {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of snapshot) {
      if (item.parentPid !== rootPid && !descendants.has(item.parentPid)) continue;
      if (descendants.has(item.pid)) continue;
      descendants.add(item.pid);
      changed = true;
    }
  }
  return descendants;
}

function terminateTestTree(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
  } else {
    try { child.kill('SIGKILL'); } catch {}
  }
}

// #endregion

// #region 02 — Controllo della finestra Electron

async function rendererTarget() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && item.url === 'nexus://app/index.html');
      if (target) return target;
    } catch {}
    await delay(50);
  }
  throw new Error('La finestra NexusNXS non è diventata raggiungibile durante il test di chiusura.');
}

async function closePage(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  // window.close() attraversa il normale lifecycle BrowserWindow come la X
  // nativa. Page.close può limitarsi a chiudere il target DevTools e lasciare
  // viva la finestra host in alcune versioni Chromium/Electron.
  socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'window.close()' } }));
  await delay(120);
  try { socket.close(); } catch {}
}

function waitForExit(child, timeoutMs = 15_000) {
  if (child.exitCode !== null) return Promise.resolve(child.exitCode);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`NexusNXS non si è chiuso entro ${timeoutMs / 1000} secondi.`)), timeoutMs);
    // La Presence è deliberatamente detached. Attendere `close` può restare
    // legato a pipe ereditate da processi Chromium; `exit` misura invece il
    // processo UI proprietario, che è ciò che la X deve terminare.
    child.once('exit', (code) => { clearTimeout(timeout); resolve(code); });
  });
}

async function waitForProcessLock(lockPath, running, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const descriptor = readLock(lockPath);
    const active = Boolean(descriptor && isProcessAlive(descriptor.pid));
    if (active === running) return descriptor;
    await delay(75);
  }
  throw new Error(running
    ? 'La Presence non è rimasta disponibile dopo la chiusura della UI.'
    : 'La Presence di prova non si è arrestata in tempo.');
}

async function removeProfile() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { fs.rmSync(profile, { recursive: true, force: true }); return; }
    catch { await delay(120); }
  }
}

// #endregion

// #region 03 — Scenario end-to-end di chiusura

(async () => {
  debugPort = await reserveDebugPort();
  let stderr = '';
  const child = spawn(electronBinary, ['.', `--remote-debugging-port=${debugPort}`], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: {
      ...process.env,
      NEXUS_USER_DATA_ROOT: profile,
      NEXUS_DISTRIBUTION_MODE: 'public',
      NEXUS_USE_SYSTEM_OLLAMA: '1',
      NEXUS_MANAGED_OLLAMA: '0',
      NEXUS_DISABLE_EXPRESSIVE_VOICE: '1',
      NEXUS_LOCAL_CRASH_REPORTS: '0'
    }
  });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  try {
    const target = await rendererTarget();
    const before = processSnapshot();
    const owned = new Set([child.pid, ...descendantsOf(before, child.pid)]);
    await closePage(target);
    const code = await waitForExit(child);
    const presenceLockPath = path.join(profile, 'system-presence.lock');
    const presenceDescriptor = await waitForProcessLock(presenceLockPath, true);
    await delay(350);
    const normalizedProfile = path.resolve(profile).toLowerCase();
    const afterUiClose = processSnapshot();
    const allowedPresence = new Set([presenceDescriptor.pid, ...descendantsOf(afterUiClose, presenceDescriptor.pid)]);
    const remainingUi = afterUiClose.filter((item) => (owned.has(item.pid)
      || item.commandLine.toLowerCase().includes(normalizedProfile))
      && !allowedPresence.has(item.pid));
    if (code !== 0) throw new Error(stderr.trim() || `NexusNXS è terminato con codice ${code}.`);
    if (remainingUi.length) throw new Error(`Processi UI rimasti dopo la chiusura: ${remainingUi.map((item) => item.pid).join(', ')}.`);
    if (!requestProcessShutdown(presenceLockPath)) throw new Error('Arresto della Presence di prova non richiesto.');
    await waitForProcessLock(presenceLockPath, false);
    console.log('Chiusura finestra verificata: UI terminata, Presence leggera mantenuta e arrestabile dal tray/controllo.');
  } catch (error) {
    requestProcessShutdown(path.join(profile, 'system-presence.lock'));
    terminateTestTree(child);
    throw error;
  } finally {
    requestProcessShutdown(path.join(profile, 'system-presence.lock'));
    await removeProfile();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

// #endregion
