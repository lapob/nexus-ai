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
        || target.url.endsWith('/src/renderer/index.html')
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
          for (let attempt = 0; attempt < 200 && !document.querySelector('.voice-visualizer'); attempt += 1) {
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
          // Il canvas compare nel commit React precedente agli effect globali:
          // attendiamo che il listener delle scorciatoie sia effettivamente attivo.
          await new Promise((resolve) => setTimeout(resolve, 160));
          document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'm',
            code: 'KeyM',
            ctrlKey: true,
            bubbles: true
          }));
          await new Promise((resolve) => setTimeout(resolve, 180));
          const modelSwitcherPresent = Boolean(document.querySelector('.model-switcher'));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          document.querySelector('.history-shortcut')?.click();
          await new Promise((resolve) => setTimeout(resolve, 120));
          const historyPresent = Boolean(document.querySelector('.conversation-history')
            && document.querySelector('.conversation-history-search input'));
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'k',
            code: 'KeyK',
            ctrlKey: true,
            bubbles: true
          }));
          await new Promise((resolve) => setTimeout(resolve, 120));
          const composer = document.querySelector('.command-input');
          const composerRect = composer?.getBoundingClientRect();
          const composerFits = Boolean(composerRect
            && composerRect.left >= 0
            && composerRect.right <= window.innerWidth
            && composerRect.bottom <= window.innerHeight
            && composer.querySelector('.attachment-trigger'));
          const composerInput = composer?.querySelector('textarea, input');
          const composerFocused = document.activeElement === composerInput;
          const draft = 'Bozza mantenuta durante la chiusura';
          const inputPrototype = composerInput instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const inputValueSetter = Object.getOwnPropertyDescriptor(inputPrototype, 'value')?.set;
          if (composerInput && inputValueSetter) {
            inputValueSetter.call(composerInput, draft);
            composerInput.dispatchEvent(new Event('input', { bubbles: true }));
            // Le finestre smoke sono intenzionalmente nascoste e Chromium può
            // sospenderne requestAnimationFrame: un timer osserva comunque il
            // commit React senza rendere il test dipendente dalla visibilità.
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await new Promise((resolve) => setTimeout(resolve, 80));
          const exitingComposer = document.querySelector('.command-input');
          const composerExitRetainsDraft = exitingComposer?.querySelector('textarea, input')?.value === draft;
          document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: ',',
            code: 'Comma',
            ctrlKey: true,
            bubbles: true
          }));
          await new Promise((resolve) => setTimeout(resolve, 140));
          const settingsSurface = document.querySelector('.settings-overlay');
          const settingsRect = settingsSurface?.getBoundingClientRect();
          const settingsFooter = document.querySelector('.settings-footer');
          const settingsFooterRect = settingsFooter?.getBoundingClientRect();
          const settingsButtons = [...document.querySelectorAll('.settings-footer button')]
            .map((button) => button.getBoundingClientRect());
          const settingsFits = Boolean(settingsRect
            && settingsRect.left >= 0
            && settingsRect.top >= 0
            && settingsRect.right <= window.innerWidth
            && settingsRect.bottom <= window.innerHeight);
          const settingsFooterFits = Boolean(settingsFooterRect
            && settingsRect
            && settingsFooterRect.left >= settingsRect.left
            && settingsFooterRect.right <= settingsRect.right
            && settingsFooterRect.bottom <= settingsRect.bottom
            && settingsButtons.length === 2
            && Math.abs(settingsButtons[0].top - settingsButtons[1].top) < 1
            && Math.abs(settingsButtons[0].height - settingsButtons[1].height) < 1);
          const settingsGeometry = settingsRect ? {
            left: settingsRect.left,
            top: settingsRect.top,
            right: settingsRect.right,
            bottom: settingsRect.bottom,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
          } : null;
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          if (${JSON.stringify(process.env.NEXUS_SMOKE_AGENT_DIALOG === '1')}) document.querySelector('#agentDialog')?.showModal();
          if (${JSON.stringify(process.env.NEXUS_SMOKE_CHAT_OPEN === '1')}) {
            document.querySelector('#chatOverlay')?.setAttribute('data-state', 'open');
            document.querySelector('#nexusShell')?.setAttribute('data-chat-state', 'open');
          }
          return {
            bridgeComplete,
            bridgeKeys: typeof window.nexus === 'object' ? Object.keys(window.nexus).sort() : [],
            bootstrapComplete: Boolean(data?.settings && data?.stats),
            permissionPersistence,
            systemState: document.querySelector('#nexusShell')?.dataset.systemState,
            visualizerPresent: Boolean(document.querySelector('.voice-visualizer')),
            modelSwitcherPresent,
            historyPresent,
            composerFits,
            composerFocused,
            composerExitRetainsDraft,
            settingsFits,
            settingsFooterFits,
            settingsFooterGeometry: settingsFooterRect ? {
              left: settingsFooterRect.left,
              top: settingsFooterRect.top,
              right: settingsFooterRect.right,
              bottom: settingsFooterRect.bottom,
              buttons: settingsButtons.map((rect) => ({ top: rect.top, height: rect.height }))
            } : null,
            settingsGeometry
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
    if (code !== 0) throw new Error(stderr.trim() || `Electron terminato con codice ${code}.`);
    if (!contract.bridgeComplete) throw new Error(`Il preload ha esposto un bridge NexusNXS incompleto: ${JSON.stringify(contract)}.`);
    if (!contract.bootstrapComplete) throw new Error('Il contratto bootstrap non è stato completato.');
    if (!contract.permissionPersistence) throw new Error('Il profilo autorizzazioni non sopravvive a un salvataggio parziale.');
    if (!contract.visualizerPresent) throw new Error('Il visualizer principale non è presente nel renderer.');
    if (!contract.modelSwitcherPresent) throw new Error('Il selettore rapido dei modelli non risponde a Ctrl+M.');
    if (!contract.historyPresent) throw new Error('La cronologia conversazioni non è visibile o ricercabile.');
    if (!contract.composerFits) throw new Error('Il composer o il controllo allegati non rientra nella finestra Electron.');
    if (!contract.composerFocused) throw new Error('Il composer non riceve il focus durante l’animazione di apertura.');
    if (!contract.composerExitRetainsDraft) throw new Error('Il composer svuota la bozza prima di completare l’animazione di chiusura.');
    if (!contract.settingsFits) throw new Error(`La superficie impostazioni non rientra nella finestra Electron: ${JSON.stringify(contract.settingsGeometry)}.`);
    if (!contract.settingsFooterFits) throw new Error(`I pulsanti del footer impostazioni non sono visibili e allineati: ${JSON.stringify(contract.settingsFooterGeometry)}.`);
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
