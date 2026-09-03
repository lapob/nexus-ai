/**
 * @module scripts/verify-public-ai-experience
 * @description Verifica reale desktop/mobile: stream lungo, dock stabile, stop e sessione temporanea.
 */
// #region 01 — Dipendenze e configurazione
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  browserExecutable,
  Cdp,
  evaluateWhenReady,
  freePort,
  waitForTarget
} = require('./web-visual-regression');

const root = path.resolve(__dirname, '..');
const temporaryRoot = path.join(root, 'qa-artifacts', '.tmp');
const url = String(process.env.NEXUS_PUBLIC_AI_URL || 'https://ai.nexusnxs.com/').trim();
const parsedUrl = new URL(url);
const qaSecretPath = String(process.env.NEXUS_QA_SECRET_FILE || path.join(root, '..', '.nexus-data', 'secrets', 'qa-browser.key')).trim();
const qaSecret = ['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname) && fs.existsSync(qaSecretPath)
  ? fs.readFileSync(qaSecretPath, 'utf8').trim()
  : '';
// #endregion

// #region 02 — Scenari browser pubblici
async function viewport(client, width, height, mobile) {
  await client.command('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height
  });
  await client.command('Page.reload', { ignoreCache: true });
  await evaluateWhenReady(client, `new Promise((resolve) => {
    const ready = () => document.querySelector('#send') && document.querySelector('#answer');
    if (ready()) return resolve(true);
    const timer = setInterval(() => { if (ready()) { clearInterval(timer); resolve(true); } }, 30);
  })`, 10_000);
}

async function verifyIdleLayout(client, label) {
  const result = await evaluateWhenReady(client, `new Promise((resolve, reject) => {
    const keyboard = document.querySelector('#keyboard');
    const dock = document.querySelector('.dock');
    const copy = document.querySelector('.copy');
    const privacy = document.querySelector('.privacy');
    const shell = document.querySelector('.shell');
    const phase = document.querySelector('#phase');
    if (!keyboard || !dock || !copy || !privacy || !shell || !phase) return reject(new Error('Layout iniziale incompleto'));
    const measure = () => {
      const dockRect = dock.getBoundingClientRect();
      const copyRect = copy.getBoundingClientRect();
      const privacyRect = privacy.getBoundingClientRect();
      return {
        bodyClass: document.body.className,
        dockTop: dockRect.top,
        dockBottom: dockRect.bottom,
        privacyTop: privacyRect.top,
        dockTransform: getComputedStyle(dock).transform,
        idleShift: getComputedStyle(document.documentElement).getPropertyValue('--nxs-idle-dock-shift'),
        gapFromHeadline: dockRect.top - copyRect.bottom,
        gapFromPrivacy: privacyRect.top - dockRect.bottom,
        privacyBottom: innerHeight - privacyRect.bottom
      };
    };
    setTimeout(() => {
      const geometry = measure();
      phase.textContent = 'SERVIZIO MOMENTANEAMENTE NON DISPONIBILE';
      document.body.classList.add('status-active');
      const phaseRect = phase.getBoundingClientRect();
      const statusDockRect = dock.getBoundingClientRect();
      const statusPrivacyRect = privacy.getBoundingClientRect();
      const statusGeometry = {
        statusGap: statusDockRect.top - phaseRect.bottom,
        statusPrivacyGap: statusPrivacyRect.top - statusDockRect.bottom
      };
      phase.textContent = '';
      document.body.classList.remove('status-active');
      keyboard.click();
      const opened = document.body.classList.contains('keyboard-open');
      const classAfterOpen = document.body.className;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      const closedByEscape = !document.body.classList.contains('keyboard-open');
      keyboard.click();
      shell.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      const closedByOutside = !document.body.classList.contains('keyboard-open');
      resolve({ ...geometry, ...statusGeometry, opened, classAfterOpen, closedByEscape, closedByOutside });
    }, 360);
  })`, 10_000);
  if (result.gapFromHeadline < 16) throw new Error(`${label}: icone troppo vicine al testo (${result.gapFromHeadline.toFixed(1)}px).`);
  if (result.gapFromPrivacy < 12) throw new Error(`${label}: controlli e nota inferiore collidono (${result.gapFromPrivacy.toFixed(1)}px; ${JSON.stringify(result)}).`);
  if (result.privacyBottom < 0 || result.privacyBottom > 40) throw new Error(`${label}: nota inferiore non ancorata (${result.privacyBottom.toFixed(1)}px).`);
  if (result.statusGap < 12) throw new Error(`${label}: stato operativo e icone collidono (${result.statusGap.toFixed(1)}px).`);
  if (result.statusPrivacyGap < 12) throw new Error(`${label}: icone stato e nota inferiore collidono (${result.statusPrivacyGap.toFixed(1)}px).`);
  if (!result.opened || !result.closedByEscape || !result.closedByOutside) throw new Error(`${label}: chiusura tastiera vuota incompleta (${JSON.stringify(result)}).`);
}

async function exercise(client, { stop = false } = {}) {
  return evaluateWhenReady(client, `new Promise((resolve, reject) => {
    const keyboard = document.querySelector('#keyboard');
    const prompt = document.querySelector('#prompt');
    const send = document.querySelector('#send');
    const answer = document.querySelector('#answer');
    const actions = document.querySelector('#responseActions');
    const dock = document.querySelector('.dock');
    const composer = document.querySelector('.composer');
    const privacy = document.querySelector('.privacy');
    const phase = document.querySelector('#phase');
    if (!keyboard || !prompt || !send || !answer || !actions || !dock || !composer || !privacy || !phase) {
      return reject(new Error('Controlli NexusNXS AI mancanti'));
    }
    keyboard.click();
    prompt.value = ${JSON.stringify('Spiega come progettare una coda concorrente sicura in sei sezioni, con tabella, esempio JavaScript completo, gestione degli errori, deadlock e checklist finale. Scrivi una risposta approfondita e completa.')};
    prompt.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt.value }));
    const startedAt = performance.now();
    const initialY = scrollY;
    let idleDockCenter = null;
    let maxY = initialY;
    let dockDrift = 0;
    let activeDockInset = null;
    let finishedAt = 0;
    let stopped = false;
    const frames = [];
    let previousFrame = performance.now();
    let raf = 0;
    const frame = (now) => {
      frames.push(now - previousFrame);
      previousFrame = now;
      if (frames.length > 1_800) frames.shift();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const sample = setInterval(() => {
      maxY = Math.max(maxY, scrollY);
      const requestActive = document.body.classList.contains('request-active');
      const currentDockInset = innerHeight - dock.getBoundingClientRect().bottom;
      // La transizione centro -> dock parte 420 ms dopo l'avvio ed è lunga
      // 280 ms. Lasciamo anche due frame di assestamento e campioniamo soltanto
      // lo stato ancorato, non l'animazione intenzionale.
      if (requestActive && performance.now() - startedAt >= 1_000) {
        if (activeDockInset === null) activeDockInset = currentDockInset;
        else dockDrift = Math.max(dockDrift, Math.abs(currentDockInset - activeDockInset));
      }
      if (${stop ? 'true' : 'false'} && !stopped && answer.textContent.trim().length >= 140 && send.dataset.mode === 'stop') {
        stopped = true;
        send.click();
      }
      const finished = !answer.classList.contains('streaming') && answer.textContent.trim();
      const stoppedCleanly = stopped && /interrotta/i.test(phase.textContent);
      const completedCleanly = !${stop ? 'true' : 'false'} && !actions.hidden && /pronta/i.test(phase.textContent);
      if (finished && (stoppedCleanly || completedCleanly)) {
        if (!finishedAt) finishedAt = performance.now();
        if (performance.now() - finishedAt < 360) return;
        clearInterval(sample);
        cancelAnimationFrame(raf);
        const sorted = frames.filter(Number.isFinite).sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        keyboard.click();
        const collapsedComposer = document.body.classList.contains('composer-collapsed') && !document.body.classList.contains('keyboard-open');
        const collapsedDockRect = dock.getBoundingClientRect();
        keyboard.click();
        const restoredComposer = document.body.classList.contains('keyboard-open') && !document.body.classList.contains('composer-collapsed');
        const finalDockRect = dock.getBoundingClientRect();
        const finalComposerRect = composer.getBoundingClientRect();
        const finalPrivacyRect = privacy.getBoundingClientRect();
        clearTimeout(timeout);
        resolve({
          stopped,
          initialY,
          maxY,
          dockDrift,
          idleDockCenter,
          finalDockCenter: finalDockRect.top + finalDockRect.height / 2,
          bodyClass: document.body.className,
          pinnedAfterResponse: document.body.classList.contains('conversation-active') && innerHeight - finalDockRect.bottom >= 0 && innerHeight - finalDockRect.bottom <= 64,
          collapsedComposer,
          restoredComposer,
          collapsedDockPinned: innerHeight - collapsedDockRect.bottom >= 0 && innerHeight - collapsedDockRect.bottom <= 64,
          composerPrivacyGap: finalPrivacyRect.top - finalComposerRect.bottom,
          finalBottomGap: document.documentElement.scrollHeight - innerHeight - scrollY,
          answerLength: answer.textContent.trim().length,
          elapsedMs: Math.round(performance.now() - startedAt),
          frameP95: Math.round(p95 * 10) / 10,
          longFrameRatio: sorted.length ? sorted.filter((value) => value > 40).length / sorted.length : 0,
          sendMode: send.dataset.mode,
          actions: [...actions.querySelectorAll('button')].map((button) => button.id)
        });
      }
    }, 70);
    const timeout = setTimeout(() => {
      clearInterval(sample);
      cancelAnimationFrame(raf);
      reject(new Error('Stream pubblico non completato: ' + JSON.stringify({
        sendMode: send.dataset.mode,
        phase: phase.textContent,
        answerLength: answer.textContent.trim().length,
        streaming: answer.classList.contains('streaming'),
        online: navigator.onLine
      })));
    }, ${stop ? '45_000' : '90_000'});
    setTimeout(() => { const rect = dock.getBoundingClientRect(); idleDockCenter = rect.top + rect.height / 2; }, 360);
    setTimeout(() => send.click(), 420);
  })`, stop ? 50_000 : 95_000);
}

async function verifyComposerSlide(client, label) {
  const result = await evaluateWhenReady(client, `new Promise((resolve, reject) => {
    const keyboard = document.querySelector('#keyboard');
    const dock = document.querySelector('.dock');
    if (!keyboard || !dock || !document.body.classList.contains('conversation-active')) {
      return reject(new Error('Composer conversazione non disponibile'));
    }
    const capture = (action) => new Promise((done) => {
      const samples = [];
      const started = performance.now();
      let previous = started;
      const frame = (now) => {
        const rect = dock.getBoundingClientRect();
        const keyboardRect = keyboard.getBoundingClientRect();
        const composerBox = document.querySelector('.composer-box');
        samples.push({ keyboardLeft: keyboardRect.left, composerOpacity: Number(getComputedStyle(composerBox).opacity), bottom: rect.bottom, interval: now - previous });
        previous = now;
        if (now - started >= 380) return done(samples);
        requestAnimationFrame(frame);
      };
      action();
      requestAnimationFrame(frame);
    });
    setTimeout(async () => {
      const collapse = await capture(() => keyboard.click());
      const collapsed = document.body.classList.contains('composer-collapsed') && !document.body.classList.contains('keyboard-open');
      const restore = await capture(() => keyboard.click());
      const restored = document.body.classList.contains('keyboard-open') && !document.body.classList.contains('composer-collapsed');
      const metrics = (samples) => {
        const intervals = samples.map((sample) => sample.interval).filter(Number.isFinite).sort((a, b) => a - b);
        const bottoms = samples.map((sample) => sample.bottom);
        return {
          startKeyboardLeft: samples[0]?.keyboardLeft || 0,
          endKeyboardLeft: samples.at(-1)?.keyboardLeft || 0,
          startComposerOpacity: samples[0]?.composerOpacity ?? 0,
          endComposerOpacity: samples.at(-1)?.composerOpacity ?? 0,
          anchorDrift: bottoms.length ? Math.max(...bottoms) - Math.min(...bottoms) : 0,
          p95: intervals[Math.floor(intervals.length * .95)] || 0,
          frames: samples.length
        };
      };
      resolve({ collapsed, restored, collapse: metrics(collapse), restore: metrics(restore) });
    }, 420);
  })`, 12_000);
  if (!result.collapsed || !result.restored) throw new Error(`${label}: stato slide non reversibile.`);
  if (result.collapse.endKeyboardLeft - result.collapse.startKeyboardLeft < 80 || result.collapse.endComposerOpacity > .08) throw new Error(`${label}: uscita composer senza slide misurabile.`);
  if (result.restore.startKeyboardLeft - result.restore.endKeyboardLeft < 80 || result.restore.endComposerOpacity < .92) throw new Error(`${label}: rientro composer senza slide misurabile.`);
  if (result.collapse.anchorDrift > 3 || result.restore.anchorDrift > 3) throw new Error(`${label}: slide perde l’ancoraggio inferiore (${JSON.stringify(result)}).`);
  if (result.collapse.p95 > 40 || result.restore.p95 > 40) throw new Error(`${label}: slide oltre il budget frame (${JSON.stringify(result)}).`);
  return result;
}

async function verifySessionContinuity(client) {
  return evaluateWhenReady(client, `new Promise((resolve, reject) => {
    const prompt = document.querySelector('#prompt');
    const send = document.querySelector('#send');
    const history = document.querySelector('#sessionHistory');
    const answer = document.querySelector('#answer');
    if (!prompt || !send || !history || !answer) return reject(new Error('Continuità di sessione non disponibile'));
    prompt.value = 'Riassumi la risposta precedente in una sola frase.';
    prompt.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt.value }));
    send.click();
    let stopped = false;
    const timer = setInterval(() => {
      const entries = history.querySelectorAll('.session-turn').length;
      if (!stopped && answer.textContent.trim().length >= 80 && send.dataset.mode === 'stop') {
        stopped = true;
        send.click();
      }
      if (entries >= 2 && answer.textContent.trim() && !answer.classList.contains('streaming') && !document.body.classList.contains('request-active')) {
        clearInterval(timer);
        resolve({ entries, pinnedAfterResponse: document.body.classList.contains('keyboard-open') && document.body.classList.contains('conversation-active') });
      }
    }, 60);
    setTimeout(() => { clearInterval(timer); reject(new Error('Continuità di sessione non verificata: '+JSON.stringify({ entries: history.querySelectorAll('.session-turn').length, answerLength: answer.textContent.trim().length, mode: send.dataset.mode, bodyClass: document.body.className }))); }, 45_000);
  })`, 50_000);
}

function assertExperience(result, { stop = false, label }) {
  if (stop && (!result.stopped || result.answerLength < 100)) {
    throw new Error(`${label}: lo stop non ha conservato una risposta parziale utile.`);
  }
  if (!stop && result.answerLength < 800) {
    throw new Error(`${label}: risposta lunga troppo breve (${result.answerLength} caratteri).`);
  }
  if (result.dockDrift > 2) throw new Error(`${label}: dock instabile di ${result.dockDrift.toFixed(1)}px.`);
  if (!result.pinnedAfterResponse) throw new Error(`${label}: il composer non è rimasto ancorato in basso dopo la risposta (${JSON.stringify({ final: result.finalDockCenter, bodyClass: result.bodyClass })}).`);
  if (!result.collapsedComposer || !result.collapsedDockPinned || !result.restoredComposer) throw new Error(`${label}: il composer compatto non resta ancorato o non viene ripristinato (${JSON.stringify({ collapsed: result.collapsedComposer, pinned: result.collapsedDockPinned, restored: result.restoredComposer })}).`);
  if (result.composerPrivacyGap < 6) throw new Error(`${label}: nota inferiore sovrapposta al composer (${result.composerPrivacyGap.toFixed(1)}px).`);
  if (result.longFrameRatio > 0.2) throw new Error(`${label}: troppi frame oltre 40ms (${(result.longFrameRatio * 100).toFixed(1)}%).`);
  if (!stop) {
    for (const action of ['copyResponse', 'deepenResponse', 'exportResponse', 'feedbackAction']) {
      if (!result.actions.includes(action)) throw new Error(`${label}: azione finale assente: ${action}.`);
    }
  }
}

async function main() {
  const port = await freePort();
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'nexus-web-experience-'));
  const child = spawn(browserExecutable(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1280,900', '--disable-background-networking', '--disable-default-apps',
    '--no-first-run', '--remote-allow-origins=*', url
  ], { stdio: 'ignore', windowsHide: true });
  let client;
  try {
    const target = await waitForTarget(port, url);
    client = await new Cdp(target.webSocketDebuggerUrl).open();
    if (qaSecret) {
      await client.command('Network.enable');
      await client.command('Network.setExtraHTTPHeaders', { headers: { 'X-Nexus-QA-Key': qaSecret } });
    }

    await viewport(client, 1180, 860, false);
    await verifyIdleLayout(client, 'Desktop');
    const desktop = await exercise(client);
    assertExperience(desktop, { label: 'Desktop' });
    const desktopSlide = await verifyComposerSlide(client, 'Desktop');
    const continuity = await verifySessionContinuity(client);
    if (continuity.entries < 2 || !continuity.pinnedAfterResponse) {
      throw new Error('Desktop: i turni della sessione o il composer ancorato non sono coerenti.');
    }

    await viewport(client, 390, 844, true);
    await verifyIdleLayout(client, 'Mobile');
    const mobile = await exercise(client, { stop: true });
    assertExperience(mobile, { stop: true, label: 'Mobile' });

    await client.command('Page.reload', { ignoreCache: true });
    const forgotten = await evaluateWhenReady(client, `new Promise((resolve) => {
      const check = () => {
        const answer = document.querySelector('#answer');
        if (!answer) return setTimeout(check, 30);
        setTimeout(() => resolve({ answer: answer.textContent.trim(), prompt: document.querySelector('#userPrompt')?.textContent.trim() || '' }), 180);
      };
      check();
    })`, 10_000);
    if (forgotten.answer || forgotten.prompt) throw new Error('La sessione web è sopravvissuta alla riapertura della pagina.');

    console.log(`Web AI verificata: desktop ${desktop.answerLength} caratteri/${desktop.elapsedMs}ms, p95 ${desktop.frameP95}ms; slide ${desktopSlide.collapse.frames}+${desktopSlide.restore.frames} frame; continuità ${continuity.entries} turni; mobile stop ${mobile.answerLength} caratteri, p95 ${mobile.frameP95}ms; dock stabile e memoria temporanea.`);
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close();
    if (child.exitCode === null) child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 200 });
  }
}

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { main };
// #endregion
