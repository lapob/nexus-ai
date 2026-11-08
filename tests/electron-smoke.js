const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const packagedExecutable = process.env.NEXUS_PACKAGED_EXECUTABLE;
const electronBinary = packagedExecutable || require('electron');
const smokeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-electron-smoke-'));
let debugPort = 0;
let child;
let stderr = '';
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let exit;
let spawnError;

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

function launchElectron() {
  const launchArguments = [
    ...(packagedExecutable ? [] : ['.']),
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${smokeProfile}`
  ];
  child = spawn(electronBinary, launchArguments, {
    cwd: root,
    env: {
      ...process.env,
      NEXUS_SMOKE_TEST: '1',
      NEXUS_SMOKE_DEBUG_PORT: String(debugPort),
      NEXUS_SMOKE_STAGE_PATH: path.join(smokeProfile, 'smoke-stages.log'),
      // Mantiene i log del bootstrap nel profilo effimero del test: in caso di
      // errore del pacchetto possiamo riportare la causa senza toccare i dati
      // dell'installazione o del server reale.
      NEXUS_SHARED_DATA_ROOT: smokeProfile
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  exit = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  spawnError = new Promise((_, reject) => child.once('error', reject));
}

async function findRendererTarget() {
  // Il pacchetto Windows può impiegare alcuni secondi in più al primo avvio
  // (estrazione del profilo Chromium e verifica dell'ASAR). Manteniamo il
  // controllo rapido, ma lasciamo una finestra sufficiente anche su macchine
  // lente senza confondere un cold-start legittimo con un renderer assente.
  const observedPages = new Set();
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`Electron impacchettato terminato prima del renderer (codice ${child.exitCode}).${stderr.trim() ? `\n${stderr.trim()}` : ''}`);
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 150);
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json`, { signal: controller.signal })
        .then((response) => response.json())
        .finally(() => clearTimeout(timeout));
      const renderer = targets.find((target) => target.type === 'page' && (
        target.url === 'nexus://app/index.html'
        || target.url === 'nexus://app/'
      ));
      for (const target of targets) {
        if (target.type === 'page' && target.url) observedPages.add(target.url);
      }
      if (renderer) return renderer;
    } catch { /* Il server DevTools può non essere ancora pronto. */ }
    await delay(25);
  }
  const suffix = observedPages.size ? ` Pagine osservate: ${[...observedPages].join(', ')}.` : '';
  throw new Error(`Renderer Electron non raggiungibile tramite DevTools durante lo smoke test.${suffix}`);
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
          for (let attempt = 0; attempt < 20 && typeof window.nexus !== 'object'; attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 20));
          }
          const required = ['bootstrap','chat','streamChat','onStreamEvent','health','reindex','listModels','setModel','cancel','copyText','saveSettings','openNote','embed','listAgentCapabilities','planAction','executeAction','undoLastAction','neuralVoiceCapabilities','synthesizeVoice','stopSpeaking','voiceCapabilities','voiceDevices','transcribeVoice','transcribeVoiceAudio','onVoiceActivity','onVoicePartial','stopVoice','finishVoice','listKnowledgeNotes','readKnowledgeNote','saveTrainingExample','provisioningStatus','startProvisioning','cancelProvisioning','onProvisioningEvent','openEngineInstaller','openVoiceSettings','selectAttachments'];
          const bridgeComplete = typeof window.nexus === 'object' && required.every((name) => typeof window.nexus[name] === 'function');
          const data = bridgeComplete ? await window.nexus.bootstrap() : null;
          let permissionPersistence = false;
          if (bridgeComplete && data?.settings) {
            await window.nexus.saveSettings({ actionApprovalMode: 'full-access' });
            const afterPartialSave = await window.nexus.saveSettings({ temperature: data.settings.temperature });
            permissionPersistence = afterPartialSave.actionApprovalMode === 'full-access';
          }
          const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
          const fits = (element) => { const rect = element?.getBoundingClientRect(); return Boolean(rect && rect.width > 0 && rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight); };
          for (let attempt = 0; attempt < 200 && !document.querySelector('canvas.core'); attempt += 1) await wait(25);
          await wait(160);
          const corePresent = Boolean(document.querySelector('canvas.core'));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }));
          await wait(200);
          const palettePresent = Boolean(document.querySelector('.palette[role=dialog] input'));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await wait(200);
          const historyPresent = Boolean(document.querySelector('.sidebar input[type=search], .sidebar input'));
          const composer = document.querySelector('.composer');
          const composerInput = composer?.querySelector('textarea');
          const composerFits = fits(composer) && Boolean(composer?.querySelector('[aria-label="Allega file"]'));
          const draft = 'Bozza mantenuta';
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
          if (composerInput && setter) { setter.call(composerInput, draft); composerInput.dispatchEvent(new Event('input', { bubbles: true })); await wait(60); }
          const composerKeepsDraft = composer?.querySelector('textarea')?.value === draft;
          [...document.querySelectorAll('.sidebar-foot button')].find((button) => /Centro di controllo/.test(button.textContent))?.click();
          // Il pannello entra con un'animazione: si attende che compaia e si fermi (max 3 s), non un tempo fisso.
          const controlStarted = performance.now();
          for (let attempt = 0; attempt < 120 && !document.querySelector('.sheet.control'); attempt += 1) await wait(25);
          const controlAppearedMs = Math.round(performance.now() - controlStarted);
          await wait(400);
          const control = document.querySelector('.sheet.control');
          const controlFits = fits(control) && document.querySelectorAll('.sheet.control [role=tab]').length >= 6;
          const controlGeometry = control ? (({ left, top, right, bottom }) => ({ left, top, right, bottom, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight }))(control.getBoundingClientRect())
            : { missing: true, controlAppearedMs, footButtons: [...document.querySelectorAll('.sidebar-foot button')].map((button) => button.textContent.trim()), sheets: [...document.querySelectorAll('.sheet, [role=dialog]')].map((element) => element.className || element.getAttribute('role')) };
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          return {
            bridgeComplete,
            bridgeKeys: typeof window.nexus === 'object' ? Object.keys(window.nexus).sort() : [],
            bootstrapComplete: Boolean(data?.settings && data?.stats),
            permissionPersistence,
            corePresent,
            palettePresent,
            historyPresent,
            composerFits,
            composerKeepsDraft,
            controlFits,
            controlGeometry
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
  debugPort = await reserveDebugPort();
  launchElectron();
    const timeout = setTimeout(() => child.kill(), 25000);
  try {
    let contract;
    let lastInspectionError;
    for (let attempt = 0; attempt < 3 && !contract; attempt += 1) {
      try {
        const target = await findRendererTarget();
        contract = await Promise.race([inspectBridge(target), spawnError]);
      } catch (error) {
        lastInspectionError = error;
        await delay(50);
      }
    }
    if (!contract) throw lastInspectionError || new Error('Impossibile ispezionare il renderer Electron.');
    const code = await exit;
    if (code !== 0) throw new Error(`Electron terminato con codice ${code} e segnale ${child.signalCode || 'nessuno'}.`);
    if (!contract.bridgeComplete) throw new Error(`Il preload ha esposto un bridge NexusNXS incompleto: ${JSON.stringify(contract)}.`);
    if (!contract.bootstrapComplete) throw new Error('Il contratto bootstrap non è stato completato.');
    if (!contract.permissionPersistence) throw new Error('Il profilo autorizzazioni non sopravvive a un salvataggio parziale.');
    if (!contract.corePresent) throw new Error('Il nucleo dell’entità non è presente nel renderer.');
    if (!contract.palettePresent) throw new Error('La palette comandi non risponde a Ctrl+K.');
    if (!contract.historyPresent) throw new Error('La cronologia conversazioni non è visibile o ricercabile.');
    if (!contract.composerFits) throw new Error('Il composer o il controllo allegati non rientra nella finestra Electron.');
    if (!contract.composerKeepsDraft) throw new Error('Il composer non conserva la bozza.');
    if (!contract.controlFits) throw new Error(`Il Centro di controllo non rientra nella finestra Electron: ${JSON.stringify(contract.controlGeometry)}.`);
    console.log(`Electron, preload, CSP, renderer e IPC caricati correttamente; bridge completo e bootstrap verificato.`);
  } catch (error) {
    child.kill();
    console.error(`${error.message}${stderr.trim() ? `\n${stderr.trim()}` : ''}`);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    if (process.exitCode && fs.existsSync(path.join(smokeProfile, 'logs', 'nexus.log'))) {
      const diagnostic = fs.readFileSync(path.join(smokeProfile, 'logs', 'nexus.log'), 'utf8').trim();
      if (diagnostic) console.error(diagnostic);
    }
    if (process.exitCode && fs.existsSync(path.join(smokeProfile, 'smoke-stages.log'))) {
      const stages = fs.readFileSync(path.join(smokeProfile, 'smoke-stages.log'), 'utf8').trim();
      if (stages) console.error(`Bootstrap stages:\n${stages}`);
    }
    // Chromium child processes can release their profile after the main exit.
    await Promise.race([exit, delay(2000)]);
    fs.rmSync(smokeProfile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
})();
