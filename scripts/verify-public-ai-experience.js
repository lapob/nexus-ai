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

async function exercise(client, { stop = false } = {}) {
  return evaluateWhenReady(client, `new Promise((resolve, reject) => {
    const keyboard = document.querySelector('#keyboard');
    const prompt = document.querySelector('#prompt');
    const send = document.querySelector('#send');
    const answer = document.querySelector('#answer');
    const actions = document.querySelector('#responseActions');
    const dock = document.querySelector('.dock');
    const phase = document.querySelector('#phase');
    if (!keyboard || !prompt || !send || !answer || !actions || !dock || !phase) {
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
      if (requestActive && performance.now() - startedAt >= 650) {
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
        const finalDockRect = dock.getBoundingClientRect();
        resolve({
          stopped,
          initialY,
          maxY,
          dockDrift,
          idleDockCenter,
          finalDockCenter: finalDockRect.top + finalDockRect.height / 2,
          bodyClass: document.body.className,
          returnedToCenter: Number.isFinite(idleDockCenter) && Math.abs((finalDockRect.top + finalDockRect.height / 2) - idleDockCenter) <= 2,
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
    setTimeout(() => {
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
        resolve({ entries, returnedToCenter: document.body.classList.contains('keyboard-open') });
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
  if (!result.returnedToCenter) throw new Error(`${label}: il composer non è tornato al centro dopo la risposta (${JSON.stringify({ idle: result.idleDockCenter, final: result.finalDockCenter, bodyClass: result.bodyClass })}).`);
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

    await viewport(client, 1180, 860, false);
    const desktop = await exercise(client);
    assertExperience(desktop, { label: 'Desktop' });
    const continuity = await verifySessionContinuity(client);
    if (continuity.entries < 2 || !continuity.returnedToCenter) {
      throw new Error('Desktop: i turni della sessione o il ritorno del composer non sono coerenti.');
    }

    await viewport(client, 390, 844, true);
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

    console.log(`Web AI verificata: desktop ${desktop.answerLength} caratteri/${desktop.elapsedMs}ms, p95 ${desktop.frameP95}ms; continuità ${continuity.entries} turni; mobile stop ${mobile.answerLength} caratteri, p95 ${mobile.frameP95}ms; dock stabile e memoria temporanea.`);
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
