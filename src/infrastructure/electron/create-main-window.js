/**
 * @module infrastructure/electron/create-main-window
 * @description Adapter infrastrutturale Electron isolato dalla logica applicativa.
 */
// #region 01 — Dipendenze e stato finestra

const { app, BrowserWindow, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { loadWindowState, saveWindowState } = require('./window-state');

// #endregion

// #region 02 — Creazione, hardening e smoke capture

function createMainWindow({ rendererUrl, smokeTest, startHidden = false, screenshotPath, accessibilityReportPath = '', smokeViewport = {}, smokeView = '', logger }) {
  const smokeHoldMilliseconds = smokeTest
    ? Math.max(0, Math.min(15_000, Number(process.env.NEXUS_SMOKE_HOLD_MS) || 0))
    : 0;
  const statePath = path.join(app.getPath('userData'), 'window-state.json');
  const state = loadWindowState(statePath, screen.getAllDisplays().map((display) => display.workArea));
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: smokeTest && smokeViewport.width >= 720 ? smokeViewport.width : state.width,
    height: smokeTest && smokeViewport.height >= 560 ? smokeViewport.height : state.height,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: '#030405',
    icon: path.join(__dirname, '..', '..', '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    title: 'NEXUSNXS',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#020405',
      symbolColor: '#9fe7e7',
      height: 34
    },
    // All'avvio con Windows NexusNXS prepara AI e remoto senza imporre una
    // finestra. Una seconda apertura richiama normalmente la finestra unica.
    show: !smokeTest && !startHidden && !process.argv.includes('--background'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      spellcheck: false,
      safeDialogs: true
    }
  });
  if (!smokeTest && state.isFullScreen) win.setFullScreen(true);
  else if (!smokeTest && state.isMaximized) win.maximize();
  win.setMenu(null);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.on('will-frame-navigate', (event) => event.preventDefault());
  win.webContents.on('will-redirect', (event) => event.preventDefault());
  win.webContents.on('context-menu', (event) => event.preventDefault());
  win.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const inspectShortcut = key === 'f12' || (input.control && input.shift && ['i', 'j', 'c'].includes(key)) || (input.control && key === 'u');
    if (inspectShortcut) event.preventDefault();
  });
  win.webContents.on('did-fail-load', (_event, code, description) => logger.error('Caricamento renderer fallito.', { code, description }));
  win.webContents.on('render-process-gone', (_event, details) => logger.error('Processo renderer terminato.', { details }));
  if (smokeTest) {
    win.webContents.once('did-finish-load', () => setTimeout(async () => {
      if (smokeView) {
        // Le catture usano un profilo Chromium temporaneo: è quindi sicuro
        // preparare lo stato necessario senza alterare le preferenze reali.
        if (smokeView === 'settings' || smokeView === 'settings-ai' || smokeView === 'settings-data' || smokeView === 'settings-connections' || smokeView === 'settings-shortcuts' || smokeView === 'settings-pets' || smokeView === 'remote-pairing' || smokeView === 'settings-select' || smokeView === 'permission' || smokeView === 'barge-in' || smokeView === 'queued-text' || smokeView === 'response' || smokeView === 'command' || smokeView === 'command-policy' || smokeView === 'history' || smokeView === 'conversation' || smokeView === 'artifacts' || smokeView === 'models' || smokeView === 'saturn' || smokeView === 'jarvis' || smokeView === 'neural') {
          if (smokeView === 'history' || smokeView === 'conversation' || smokeView === 'artifacts') {
            await win.webContents.executeJavaScript(`
              localStorage.setItem('nexus.conversations.v1', JSON.stringify([{
                id: 'qa-conversation',
                title: 'Progettare un assistente locale',
                createdAt: Date.now() - 3600000,
                updatedAt: Date.now(),
                turns: [
                  { role: 'user', content: 'Come possiamo rendere NEXUSNXS più naturale e affidabile?', createdAt: Date.now() - 3600000 },
                  { role: 'assistant', content: 'Possiamo unire un riconoscimento vocale adattivo, una memoria personale controllata e autorizzazioni trasparenti.', createdAt: Date.now() - 3590000 },
                  { role: 'user', content: 'Mostrami anche come continuare la conversazione dalla cronologia.', createdAt: Date.now() - 3580000 },
                  { role: 'assistant', content: 'Aprendo una chat archiviata ora puoi rileggere tutti i messaggi in ordine. Chiudendo questa vista, il contesto rimane attivo e puoi continuare esattamente da dove eri rimasto.', createdAt: Date.now() - 3570000 }
                  ,${smokeView === 'artifacts'
                    ? JSON.stringify({ role: 'assistant', content: 'Ho completato e verificato la modifica richiesta.', createdAt: Date.now() - 3560000, artifacts: [{ id: 'qa-artifact', kind: 'file-change', title: 'src/app.ts', subtitle: 'Modificato', language: 'typescript', previousContent: 'const status = "old";\n', content: 'const status = "ready";\nexport { status };\n', diff: '− const status = "old";\n+ const status = "ready";\n+ export { status };', added: 2, removed: 1, events: [{ label: 'Versione acquisita', status: 'complete' }, { label: 'Modifica applicata', status: 'complete' }, { label: 'Scrittura verificata', status: 'complete' }] }] })
                    : "{ role: 'assistant', content: Array.from({ length: 18 }, (_, index) => 'Dettaglio ' + (index + 1) + ': contenuto della conversazione conservato in modo fluido e leggibile.').join('\\n\\n'), createdAt: Date.now() - 3560000 }"}
                ]
              }]));
            `);
          }
          const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
          win.webContents.reload();
          await reloaded;
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
        if (smokeView === 'saturn' || smokeView === 'jarvis' || smokeView === 'neural') {
          await win.webContents.executeJavaScript(`
            localStorage.setItem('nexus.interface.preferences.v1', JSON.stringify({
              coreAppearance: '${smokeView === 'jarvis' ? 'jarvis-reactor' : smokeView === 'neural' ? 'neural' : 'saturn-experimental'}',
              visualQuality: 'ultra'
            }));
          `);
          const reloaded = new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
          win.webContents.reload();
          await reloaded;
          await win.webContents.executeJavaScript(`new Promise((resolve) => {
            const startedAt = Date.now();
            const check = () => {
              const canvas = document.querySelector('.voice-visualizer canvas');
              if (canvas && canvas.width > 0 && canvas.height > 0) return resolve(true);
              if (Date.now() - startedAt >= 8000) return resolve(false);
              setTimeout(check, 120);
            };
            check();
          })`);
        }
        // Chromium sospende i frame di Framer Motion nelle finestre nascoste.
        // La vista composer non esegue il reload preparatorio usato dagli altri
        // casi, quindi va resa inattiva prima dello shortcut e della readiness.
        if ((smokeView === 'command' || smokeView === 'response') && screenshotPath) {
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 120));
        }
        const shortcut = smokeView === 'settings' || smokeView === 'settings-ai' || smokeView === 'settings-data' || smokeView === 'settings-connections' || smokeView === 'settings-shortcuts' || smokeView === 'settings-pets' || smokeView === 'remote-pairing' || smokeView === 'settings-select'
          ? ','
          : smokeView === 'history' || smokeView === 'artifacts'
            ? 'H'
          : smokeView === 'command' || smokeView === 'command-policy' || smokeView === 'permission' || smokeView === 'response'
            ? 'K'
            : smokeView === 'models'
              ? 'M'
            : smokeView === 'voice-off'
              ? 'V'
              : null;
        if (shortcut) {
            if (smokeView === 'settings' || smokeView === 'settings-ai' || smokeView === 'settings-data' || smokeView === 'settings-connections' || smokeView === 'settings-shortcuts' || smokeView === 'settings-pets' || smokeView === 'remote-pairing' || smokeView === 'settings-select' || smokeView === 'command-policy') {
              // Gli acceleratori dipendono dal layout tastiera della macchina;
              // l'evento DOM rende la QA deterministica anche in CI.
              const smokeKey = smokeView === 'command-policy' ? 'k' : ',';
              await win.webContents.executeJavaScript(
                `window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(smokeKey)}, ctrlKey: true, bubbles: true }))`
              );
          } else {
            const modifiers = smokeView === 'voice-off' ? [] : ['control'];
            win.webContents.sendInputEvent({ type: 'keyDown', keyCode: shortcut, modifiers });
            win.webContents.sendInputEvent({ type: 'keyUp', keyCode: shortcut, modifiers });
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (smokeView === 'response') {
          await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
          await new Promise((resolve) => setTimeout(resolve, 220));
          // Il provider smoke non deve produrre testo: montiamo soltanto il DOM
          // rappresentativo con le classi reali e validiamo geometria e CSS.
          await win.webContents.executeJavaScript(`(() => {
            document.querySelector('#nexusShell')?.setAttribute('data-focus', 'true');
            const fixture = document.createElement('article');
            fixture.className = 'answer-surface';
            fixture.dataset.size = 'expanded';
            fixture.dataset.streaming = 'false';
            fixture.dataset.reveal = 'ready';
            fixture.innerHTML = '<div class="answer-context" data-kind="code" role="status"><i></i><span><small>CODICE</small><strong>Risposta pronta</strong></span></div><div class="answer-scroll"><div class="answer-markdown"><h2>Risultato verificato</h2><aside class="response-callout" data-tone="result"><strong>Verifica completata</strong><p>La risposta è ordinata e immediata.</p></aside><h3>Codice</h3><section class="code-card"><div class="code-card-meta"><span>typescript</span><button>Copia</button></div><pre><code><span class="syntax-line"><i>1</i><b><span class="syntax-keyword">const</span> stato = <span class="syntax-string">&quot;pronto&quot;</span>;</b></span><span class="syntax-line"><i>2</i><b>console.log(stato);</b></span></code></pre></section><div class="response-table-wrap"><table><thead><tr><th>Area</th><th>Stato</th></tr></thead><tbody><tr><td>Rendering</td><td>Pronto</td></tr></tbody></table></div></div></div>';
            document.body.append(fixture);
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 320));
        }
        if (smokeView === 'conversation' || smokeView === 'artifacts') {
          await win.webContents.executeJavaScript("document.querySelector('.history-shortcut')?.click()");
          await new Promise((resolve) => setTimeout(resolve, 220));
          await win.webContents.executeJavaScript("document.querySelector('.conversation-history-list article > button:first-child')?.click()");
          await new Promise((resolve) => setTimeout(resolve, 320));
          if (smokeView === 'artifacts') {
            await win.webContents.executeJavaScript("document.querySelector('.artifact-item > button')?.click()");
            await new Promise((resolve) => setTimeout(resolve, 260));
          }
        }
        if (smokeView === 'settings-ai' || smokeView === 'settings-data' || smokeView === 'settings-connections' || smokeView === 'settings-shortcuts' || smokeView === 'settings-pets' || smokeView === 'remote-pairing') {
          await win.webContents.executeJavaScript(`
            (async () => {
              const tabs = [...document.querySelectorAll('.settings-tabs [role="tab"]')];
              const requested = ${JSON.stringify(smokeView)};
              const patterns = {
                'settings-ai': /intelligenza|modelli/i,
                'settings-data': /dati|privacy|memoria/i,
                'settings-connections': /funzioni|git|computer use/i,
                'settings-shortcuts': /scorciatoie|tastiera/i,
                'settings-pets': /companion|cosmici/i,
                'remote-pairing': /remoto|telefono|dispositivi/i
              };
              tabs.find((tab) => patterns[requested]?.test(tab.textContent || ''))?.click();
            })()
          `);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (smokeView === 'settings-data') {
          await win.webContents.executeJavaScript(`(() => {
            const scroller = document.querySelector('.settings-content');
            const target = document.querySelector('.settings-health-check');
            if (scroller && target) {
              scroller.scrollLeft = 0;
              scroller.scrollTop = Math.max(0, target.offsetTop - scroller.clientHeight * 0.62);
            }
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 220));
        }
        if (smokeView === 'remote-pairing') {
          await win.webContents.executeJavaScript(`
            (async () => {
              document.querySelector('.remote-connect')?.click();
            })()
          `);
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
        if (smokeView === 'permission') {
          await win.webContents.executeJavaScript(`
            (() => {
              const overlay = document.createElement('div');
              overlay.className = 'permission-overlay';
              overlay.innerHTML = '<section class="permission-card" data-risk="low" role="dialog" aria-modal="true"><div class="permission-heading"><span class="permission-orbit" data-risk="low"><i></i></span><div><small>Autorizzazione richiesta</small><strong id="permission-title">Aprire Calcolatrice</strong></div></div><p class="permission-reason">NexusNXS richiede un consenso monouso prima di agire sul computer.</p><details class="permission-preview"><summary>Dettagli dell’operazione</summary><pre>Avvia Calcolatrice</pre></details><div class="permission-footer-copy"><span>Valida una sola volta</span><small>L’azione successiva richiederà una nuova conferma</small></div><footer><button type="button" class="permission-deny">Annulla</button><button type="button" class="permission-approve">Consenti</button></footer></section>';
              document.querySelector('#nexusShell')?.appendChild(overlay);
            })()
          `);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        if (smokeView === 'settings-select') {
          await win.webContents.executeJavaScript(`
            (async () => {
              const trigger = document.querySelector('.settings-panel .nexus-select-trigger');
              trigger?.focus();
              trigger?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
            })()
          `);
          await new Promise((resolve) => setTimeout(resolve, 240));
        }
        if (smokeView === 'command-policy') {
          await win.webContents.executeJavaScript("document.querySelector('.approval-chip .nexus-select-trigger')?.click()");
          await new Promise((resolve) => setTimeout(resolve, 260));
        }
        if (smokeView === 'command') {
          await win.webContents.executeJavaScript(`(() => {
            const input = document.querySelector('.command-input textarea, .command-input input');
            const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
            if (!input || !setter) return false;
            setter.call(input, 'Una bozza resta leggibile mentre scrivi');
            input.dispatchEvent(new Event('input', { bubbles: true }));
            return true;
          })()`);
          await new Promise((resolve) => setTimeout(resolve, 320));
        }
        if (smokeView === 'barge-in' || smokeView === 'queued-text') {
          // Stato puramente visivo per la regressione screenshot: il test
          // funzionale della concorrenza voce/stream resta deterministico.
          await win.webContents.executeJavaScript(`
            (() => {
              const shell = document.querySelector('#nexusShell');
              document.body.setAttribute('data-smoke-barge-in', 'true');
              if (${JSON.stringify(smokeView === 'barge-in')}) shell?.setAttribute('data-barge-in', 'true');
              shell?.setAttribute('data-next-turn', 'true');
              shell?.setAttribute('data-generating', 'true');
              shell?.setAttribute('data-system-state', ${JSON.stringify(smokeView === 'queued-text' ? 'responding' : 'listening')});
              const status = document.querySelector('.status-title strong');
              const detail = document.querySelector('.status-copy > p');
              if (status) status.textContent = ${JSON.stringify(smokeView === 'queued-text' ? 'Sto completando…' : 'In ascolto…')};
              if (detail) detail.textContent = ${JSON.stringify(smokeView === 'queued-text' ? 'Puoi preparare il prossimo messaggio' : 'Ti ascolto mentre la risposta continua')};
              const overlay = document.querySelector('.ui-overlay');
              if (overlay) {
                overlay.style.cssText = 'opacity:1;filter:none;transform:translateY(-50%);pointer-events:auto';
              }
              if (${JSON.stringify(smokeView === 'barge-in')} && overlay && !overlay.querySelector('.queued-turn')) {
                const queued = document.createElement('div');
                queued.className = 'queued-turn';
                queued.innerHTML = ${JSON.stringify(smokeView === 'queued-text'
                  ? '<i></i><span>Il prossimo messaggio partirà al termine della risposta</span>'
                  : '<i></i><span>Ti ascolto mentre completo la risposta</span>')};
                overlay.appendChild(queued);
              }
              const article = document.createElement('article');
              article.className = 'answer-surface';
              article.dataset.size = 'expanded';
              article.dataset.reveal = 'ready';
              article.style.opacity = '1';
              article.innerHTML = '<span class="answer-stream-indicator"></span><div class="answer-scroll"><div class="answer-markdown"><h2>Una risposta continua senza interrompersi</h2><p>NEXUSNXS mantiene il flusso precedente leggibile mentre prepara il turno vocale successivo.</p><pre class="code-card"><code>const nextTurn = await voice.listen();</code></pre></div></div>';
              shell?.appendChild(article);
            })()
          `);
          if (smokeView === 'queued-text') {
            await win.webContents.executeJavaScript("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }))");
            await new Promise((resolve) => setTimeout(resolve, 180));
            await win.webContents.executeJavaScript(`
              (() => {
                document.querySelector('#nexusShell')?.setAttribute('data-next-turn', 'true');
                const input = document.querySelector('.command-input textarea, .command-input input');
                if (input) input.placeholder = 'Scrivi il prossimo messaggio…';
                const hint = document.querySelector('.command-meta small');
                if (hint) hint.textContent = 'Invio · metti in coda';
              })()
            `);
          }
          await new Promise((resolve) => setTimeout(resolve, 420));
        }
        const expectedSelector = smokeView === 'settings' || smokeView === 'settings-ai' || smokeView === 'settings-connections' || smokeView === 'settings-shortcuts' || smokeView === 'settings-pets'
          ? '.settings-overlay'
          : smokeView === 'settings-data'
            ? '.settings-health-check'
          : smokeView === 'remote-pairing'
            ? '.remote-pairing-card img'
          : smokeView === 'settings-select'
            ? '.nexus-select-menu'
          : smokeView === 'models'
            ? '.model-switcher'
          : smokeView === 'history'
            ? '.conversation-history'
          : smokeView === 'conversation'
            ? '.conversation-transcript'
          : smokeView === 'artifacts'
            ? '.artifact-popover'
          : smokeView === 'command'
            ? '.command-input'
          : smokeView === 'command-policy'
            ? '.approval-chip .nexus-select-menu'
          : smokeView === 'permission'
            ? '.permission-card'
          : smokeView === 'response'
            ? '.answer-surface .response-callout'
            : smokeView === 'barge-in'
              ? '.queued-turn'
          : smokeView === 'queued-text'
              ? '.command-input'
            : smokeView === 'saturn' || smokeView === 'jarvis' || smokeView === 'neural'
              ? '.voice-visualizer canvas'
            : null;
        if (expectedSelector) {
          const readiness = await win.webContents.executeJavaScript(
            `(() => {
              const element = document.querySelector(${JSON.stringify(expectedSelector)});
              if (!element) return { ready: false, reason: 'missing', diagnostics: { history: document.querySelectorAll('.conversation-history').length, transcript: document.querySelectorAll('.conversation-transcript').length, artifacts: document.querySelectorAll('.artifact-item').length } };
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
                const visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0
                  && rect.width > 0 && rect.height > 0;
                const insideViewport = rect.top >= -1 && rect.left >= -1
                  && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
                const noPageOverflow = document.documentElement.scrollWidth <= innerWidth + 1
                  && document.documentElement.scrollHeight <= innerHeight + 1;
                return { ready: visible && insideViewport && noPageOverflow, reason: !visible ? 'hidden' : !insideViewport ? 'outside-viewport' : !noPageOverflow ? 'page-overflow' : 'ready', rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height }, viewport: { width: innerWidth, height: innerHeight }, page: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }, diagnostics: { history: document.querySelectorAll('.conversation-history').length, transcript: document.querySelectorAll('.conversation-transcript').length, artifacts: document.querySelectorAll('.artifact-item').length } };
            })()`
          );
          if (!readiness.ready) {
            if (screenshotPath) fs.writeFileSync(`${screenshotPath}.error.json`, JSON.stringify({ smokeView, expectedSelector, ...readiness }, null, 2));
            logger.error('Vista QA non raggiunta.', { smokeView, readiness });
            app.exit(1);
            return;
          }
        }
      }
      if (screenshotPath) {
        if (smokeView) {
          win.showInactive();
          await new Promise((resolve) => setTimeout(resolve, 620));
        }
        const image = await win.webContents.capturePage();
        fs.writeFileSync(screenshotPath, image.toPNG());
      }
      if (accessibilityReportPath) {
        const report = await win.webContents.executeJavaScript(`(() => {
          const visible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden'
              && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
          };
          const text = (element) => String(element.getAttribute('aria-label') || element.getAttribute('title')
            || element.closest('label')?.textContent || element.textContent || '').replace(/\\s+/g, ' ').trim();
          const interactive = [...document.querySelectorAll('button, a[href], input, textarea, select, [role="button"], [role="tab"], [tabindex]')]
            .filter(visible).filter((element) => element.getAttribute('tabindex') !== '-1');
          const duplicateIds = [...document.querySelectorAll('[id]')].map((element) => element.id)
            .filter((id, index, values) => id && values.indexOf(id) !== index);
          const unnamed = interactive.filter((element) => !text(element) && !element.getAttribute('aria-labelledby'))
            .map((element) => element.outerHTML.slice(0, 180));
          const imagesWithoutAlt = [...document.querySelectorAll('img')].filter(visible)
            .filter((element) => !element.hasAttribute('alt')).map((element) => element.outerHTML.slice(0, 180));
          const invalidDialogs = [...document.querySelectorAll('[role="dialog"]')].filter(visible)
            .filter((element) => !text(element) && !element.getAttribute('aria-labelledby'))
            .map((element) => element.className || element.tagName);
          return {
            view: ${JSON.stringify(smokeView || 'main')},
            interactive: interactive.length,
            duplicateIds: [...new Set(duplicateIds)],
            unnamed,
            imagesWithoutAlt,
            invalidDialogs,
            passed: !duplicateIds.length && !unnamed.length && !imagesWithoutAlt.length && !invalidDialogs.length
          };
        })()`);
        fs.mkdirSync(path.dirname(accessibilityReportPath), { recursive: true });
        fs.writeFileSync(accessibilityReportPath, JSON.stringify(report, null, 2));
        if (!report.passed) {
          logger.error('Audit accessibilità non superato.', { smokeView, report });
          app.exit(1);
          return;
        }
      }
      if (smokeHoldMilliseconds) {
        await new Promise((resolve) => setTimeout(resolve, smokeHoldMilliseconds));
      }
      win.destroy();
      app.exit(0);
    // Le catture visive aspettano anche il chunk WebGL lazy; lo smoke
    // contrattuale resta rapido perché non deve attendere il visualizzatore.
    // Lo smoke contrattuale esercita anche l'intera animazione di chiusura del
    // composer: il renderer deve restare vivo abbastanza da osservarne cleanup
    // e focus senza affidarsi alla velocità della macchina CI.
    }, screenshotPath ? 4400 : 2500));
  }
  if (!smokeTest && !startHidden) win.once('ready-to-show', () => win.show());
  win.on('close', () => { if (!smokeTest) saveWindowState(statePath, win); });
  win.loadURL(rendererUrl);
  return win;
}

module.exports = { createMainWindow };

// #endregion
