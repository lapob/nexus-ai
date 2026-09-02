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
    const dockInset = innerHeight - dock.getBoundingClientRect().bottom;
    let maxY = initialY;
    let dockDrift = 0;
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
      dockDrift = Math.max(dockDrift, Math.abs((innerHeight - dock.getBoundingClientRect().bottom) - dockInset));
      if (${stop ? 'true' : 'false'} && !stopped && answer.textContent.trim().length >= 140 && send.dataset.mode === 'stop') {
        stopped = true;
        send.click();
      }
      const finished = !answer.classList.contains('streaming') && answer.textContent.trim();
      const stoppedCleanly = stopped && /interrotta/i.test(phase.textContent);
      const completedCleanly = !${stop ? 'true' : 'false'} && !actions.hidden && /pronta/i.test(phase.textContent);
      if (finished && (stoppedCleanly || completedCleanly)) {
        clearInterval(sample);
        cancelAnimationFrame(raf);
        const sorted = frames.filter(Number.isFinite).sort((a, b) => a - b);
        const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
        resolve({
          stopped,
          initialY,
          maxY,
          dockDrift,
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
    setTimeout(() => send.click(), 80);
  })`, stop ? 50_000 : 95_000);
}

function assertExperience(result, { stop = false, label }) {
  if (stop && (!result.stopped || result.answerLength < 100)) {
    throw new Error(`${label}: lo stop non ha conservato una risposta parziale utile.`);
  }
  if (!stop && result.answerLength < 800) {
    throw new Error(`${label}: risposta lunga troppo breve (${result.answerLength} caratteri).`);
  }
  if (result.dockDrift > 2) throw new Error(`${label}: dock instabile di ${result.dockDrift.toFixed(1)}px.`);
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

    console.log(`Web AI verificata: desktop ${desktop.answerLength} caratteri/${desktop.elapsedMs}ms, p95 ${desktop.frameP95}ms; mobile stop ${mobile.answerLength} caratteri, p95 ${mobile.frameP95}ms; dock stabile e memoria temporanea.`);
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
