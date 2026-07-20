const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const electronBinary = require('electron');
const debugPort = 9337;
const child = spawn(electronBinary, ['.', `--remote-debugging-port=${debugPort}`], {
  cwd: root,
  env: { ...process.env, NEXUS_SMOKE_TEST: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let stderr = '';
child.stderr.on('data', (chunk) => { stderr += chunk; });
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const exit = new Promise((resolve) => child.once('exit', (code) => resolve(code)));

async function findRendererTarget() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then((response) => response.json());
      const renderer = targets.find((target) => target.type === 'page' && target.url.endsWith('/src/renderer/index.html'));
      if (renderer) return renderer;
    } catch { /* Il server DevTools può non essere ancora pronto. */ }
    await delay(25);
  }
  throw new Error('Renderer Electron non raggiungibile tramite DevTools durante lo smoke test.');
}

async function inspectBridge(target) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const result = await new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result.result.value);
    });
    socket.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(async () => {
          const required = ['bootstrap','chat','reindex','listModels','cancel','copyText','saveSettings','openNote'];
          const bridgeComplete = typeof window.nexus === 'object' && required.every((name) => typeof window.nexus[name] === 'function');
          const data = bridgeComplete ? await window.nexus.bootstrap() : null;
          return {
            bridgeComplete,
            bootstrapComplete: Boolean(data?.settings && data?.stats),
            systemState: document.querySelector('#nexusShell')?.dataset.systemState
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      }
    }));
  });
  socket.close();
  return result;
}

(async () => {
  const timeout = setTimeout(() => child.kill(), 15000);
  try {
    const target = await findRendererTarget();
    const contract = await inspectBridge(target);
    const code = await exit;
    if (code !== 0) throw new Error(stderr.trim() || `Electron terminato con codice ${code}.`);
    if (!contract.bridgeComplete) throw new Error(`Il preload ha esposto un bridge Nexus incompleto: ${JSON.stringify(contract)}.`);
    if (!contract.bootstrapComplete) throw new Error('Il contratto bootstrap non è stato completato.');
    console.log(`Electron, preload, CSP, renderer e IPC caricati correttamente; bridge completo e bootstrap verificato.`);
  } catch (error) {
    child.kill();
    console.error(`${error.message}${stderr.trim() ? `\n${stderr.trim()}` : ''}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
  }
})();
