/**
 * @module scripts/verify-public-ai-experience
 * @description Verifica la web app pubblica con una richiesta reale e controlla che lo stream segua il fondo pagina.
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

// #region 02 — Scenario browser pubblico
async function main() {
  const port = await freePort();
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'nexus-web-experience-'));
  const child = spawn(browserExecutable(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=390,844', '--disable-background-networking', '--disable-default-apps',
    '--no-first-run', '--remote-allow-origins=*', url
  ], { stdio: 'ignore', windowsHide: true });
  let client;
  try {
    const target = await waitForTarget(port, url);
    client = await new Cdp(target.webSocketDebuggerUrl).open();
    await client.command('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 390,
      screenHeight: 844
    });
    await client.command('Page.reload', { ignoreCache: true });
    const result = await evaluateWhenReady(client, `new Promise((resolve, reject) => {
      const keyboard = document.querySelector('#keyboard');
      const prompt = document.querySelector('#prompt');
      const send = document.querySelector('#send');
      const answer = document.querySelector('#answer');
      const actions = document.querySelector('#responseActions');
      if (!keyboard || !prompt || !send || !answer || !actions) return reject(new Error('Controlli NexusNXS AI mancanti'));
      keyboard.click();
      prompt.value = 'Spiega come progettare una coda concorrente sicura con quattro sezioni, una tabella, un esempio JavaScript completo e una nota sui deadlock.';
      prompt.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt.value }));
      const initialY = scrollY;
      let maxY = initialY;
      let minimumBottomGap = Infinity;
      const startedAt = performance.now();
      const sample = setInterval(() => {
        maxY = Math.max(maxY, scrollY);
        minimumBottomGap = Math.min(minimumBottomGap, document.documentElement.scrollHeight - innerHeight - scrollY);
        if (!answer.classList.contains('streaming') && answer.textContent.trim() && !actions.hidden) {
          clearInterval(sample);
          resolve({
            initialY,
            maxY,
            minimumBottomGap,
            finalBottomGap: document.documentElement.scrollHeight - innerHeight - scrollY,
            answerLength: answer.textContent.trim().length,
            elapsedMs: Math.round(performance.now() - startedAt),
            actions: [...actions.querySelectorAll('button')].map((button) => button.id)
          });
        }
      }, 80);
      setTimeout(() => {
        clearInterval(sample);
        reject(new Error('Stream pubblico non completato: ' + JSON.stringify({
          disabled: send.disabled,
          phase: document.querySelector('#phase')?.textContent || '',
          answer: answer.textContent.slice(0, 120),
          streaming: answer.classList.contains('streaming'),
          online: navigator.onLine
        })));
      }, 45000);
      setTimeout(() => send.click(), 80);
    })`, 50_000);
    if (result.answerLength < 320) throw new Error(`Risposta pubblica troppo breve (${result.answerLength} caratteri).`);
    if (result.maxY <= result.initialY) throw new Error('La pagina non ha seguito la generazione verso il basso.');
    if (result.finalBottomGap > 220) throw new Error(`Lo stream ha lasciato ${Math.round(result.finalBottomGap)}px sotto il viewport.`);
    for (const action of ['copyResponse', 'deepenResponse', 'exportResponse', 'feedbackAction']) {
      if (!result.actions.includes(action)) throw new Error(`Azione finale assente: ${action}.`);
    }
    console.log(`Web AI reale verificata: ${result.answerLength} caratteri in ${result.elapsedMs}ms; scroll ${Math.round(result.initialY)}→${Math.round(result.maxY)}px; fondo ${Math.round(result.finalBottomGap)}px.`);
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
