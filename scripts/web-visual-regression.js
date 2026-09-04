/**
 * @module scripts/web-visual-regression
 * @description Regresione strutturale e screenshot delle superfici web pubbliche.
 */
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'qa-artifacts', 'web-visual-regression');
const temporaryRoot = path.join(root, 'qa-artifacts', '.tmp');
const baselinePath = path.join(root, 'config', 'web-visual-baseline.json');
const update = process.argv.includes('--update');
const cases = [
  { id: 'site-desktop', url: 'https://nexusnxs.com/', width: 1440, height: 900 },
  { id: 'site-mobile', url: 'https://nexusnxs.com/', width: 390, height: 844 },
  { id: 'ai-desktop', url: 'https://ai.nexusnxs.com/', width: 1440, height: 900 },
  { id: 'ai-mobile', url: 'https://ai.nexusnxs.com/', width: 390, height: 844 }
];

// #region 01 - Browser e protocollo DevTools

function browserExecutable() {
  const candidates = process.platform === 'win32'
    ? [
      path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
    ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  const candidate = candidates.find((value) => value && fs.existsSync(value));
  if (!candidate) throw new Error('Chrome o Chromium non trovato per il QA web.');
  return candidate;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

class Cdp {
  constructor(url) { this.url = url; this.sequence = 0; this.pending = new Map(); }
  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) return;
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
    await this.command('Runtime.enable');
    await this.command('Page.enable');
    return this;
  }
  command(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Valutazione pagina non riuscita.');
    return result.result.value;
  }
  close() { try { this.socket?.close(); } catch {} }
}

async function waitForTarget(port, expectedUrl, timeoutMs = 20_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const rows = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = rows.find((row) => row.type === 'page' && row.url.startsWith(new URL(expectedUrl).origin));
      if (target) return target;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Pagina non raggiungibile: ${expectedUrl}`);
}

async function evaluateWhenReady(client, expression, timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    let ready = false;
    try {
      ready = await client.evaluate('document.readyState === "complete"');
    } catch (error) { lastError = error; }
    if (ready) {
      // An interaction may submit a request: never replay it after an error.
      let timer;
      try {
        return await Promise.race([
          client.evaluate(expression),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Scenario browser oltre il timeout.')), Math.max(1, timeoutMs - (Date.now() - started))); })
        ]);
      } finally { clearTimeout(timer); }
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw lastError || new Error('Contesto pagina non pronto.');
}

async function removeTemporaryPath(target, attempts = 15) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.rmSync(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EBUSY', 'ENOTEMPTY', 'EPERM'].includes(error?.code) || attempt === attempts - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 160 + attempt * 80));
    }
  }
}

// #endregion
// #region 02 - Cattura e criteri visivi

const METRICS_EXPRESSION = `new Promise((resolve) => {
  const finish = () => {
    const rect = (element) => {
      if (!element) return null;
      const value = element.getBoundingClientRect();
      return { x: value.x / innerWidth, y: value.y / innerHeight, width: value.width / innerWidth, height: value.height / innerHeight };
    };
    const logo = [...document.images].find((image) => /nexus/i.test(image.src + image.alt)) || document.querySelector('header img, .brand-mark');
    // Il canvas globale del sito e un fondale ambientale, non il Core del
    // prodotto. Il fallback generico al canvas resta valido solo in NexusNXS AI.
    const core = location.hostname.startsWith('ai.')
      ? document.querySelector('#core, [data-testid*=core], canvas')
      : document.querySelector('#core, [data-testid*=core]');
    const interactive = [...document.querySelectorAll('button,a,input,textarea')].filter((element) => {
      const value = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return value.width > 0 && value.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });
    resolve({
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      overflowX: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth,
      logo: logo ? { ...rect(logo), loaded: logo.complete && logo.naturalWidth > 0, ratio: logo.naturalWidth / Math.max(1, logo.naturalHeight) } : null,
      core: rect(core),
      interactiveCount: interactive.length,
      undersizedTargets: interactive.filter((element) => { const value = element.getBoundingClientRect(); return value.width < 32 || value.height < 32; }).length,
      bodyTextLength: document.body.innerText.trim().length
    });
  };
  if (document.readyState === 'complete') setTimeout(finish, 1800);
  else addEventListener('load', () => setTimeout(finish, 1800), { once: true });
})`;

async function capture(entry) {
  const port = await freePort();
  fs.mkdirSync(temporaryRoot, { recursive: true });
  const profile = fs.mkdtempSync(path.join(temporaryRoot, 'nexus-web-visual-'));
  const child = spawn(browserExecutable(), [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${entry.width},${entry.height}`, '--hide-scrollbars', '--disable-background-networking',
    '--disable-default-apps', '--no-first-run', '--remote-allow-origins=*', entry.url
  ], { stdio: 'ignore', windowsHide: true });
  let client;
  try {
    const target = await waitForTarget(port, entry.url);
    client = await new Cdp(target.webSocketDebuggerUrl).open();
    await client.command('Emulation.setDeviceMetricsOverride', {
      width: entry.width,
      height: entry.height,
      deviceScaleFactor: 1,
      mobile: entry.width < 600,
      screenWidth: entry.width,
      screenHeight: entry.height
    });
    await client.command('Page.reload', { ignoreCache: true });
    const metrics = await evaluateWhenReady(client, METRICS_EXPRESSION);
    const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const bytes = Buffer.from(screenshot.data, 'base64');
    if (bytes.length < 10_000 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`${entry.id}: screenshot non valido`);
    fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, `${entry.id}.png`), bytes);
    return { ...metrics, screenshotBytes: bytes.length };
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close();
    if (child.exitCode === null) child.kill();
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3_000))
    ]);
    if (child.exitCode === null && process.platform === 'win32' && Number.isInteger(child.pid)) {
      // Termina soltanto il browser headless creato da questo test e i suoi
      // renderer: Chromium puo mantenere il profilo bloccato dopo Browser.close.
      spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }
    await removeTemporaryPath(profile);
  }
}

function validate(entry, metrics) {
  const failures = [];
  if (!/nexusnxs/i.test(metrics.title)) failures.push('titolo non coerente');
  if (metrics.overflowX > 2) failures.push(`overflow orizzontale ${metrics.overflowX}px`);
  if (!metrics.logo?.loaded || Math.abs(metrics.logo.ratio - 1) > 0.08) failures.push('logo mancante o deformato');
  if (metrics.interactiveCount < 1) failures.push('nessun controllo interattivo');
  if (metrics.bodyTextLength < 40) failures.push('contenuto insufficiente');
  if (entry.id.startsWith('ai-') && !metrics.core) failures.push('Core non visibile');
  if (failures.length) throw new Error(`${entry.id}: ${failures.join(', ')}`);
}

function compare(current, baseline) {
  for (const entry of cases) {
    const now = current[entry.id];
    const before = baseline[entry.id];
    if (!before) throw new Error(`Baseline mancante: ${entry.id}`);
    const sizeRatio = now.screenshotBytes / Math.max(1, before.screenshotBytes);
    if (sizeRatio < 0.55 || sizeRatio > 1.8) throw new Error(`${entry.id}: variazione visiva anomala (${sizeRatio.toFixed(2)}x)`);
    for (const key of ['logo', 'core']) {
      if (!now[key] && !before[key]) continue;
      if (!now[key] || !before[key]) throw new Error(`${entry.id}: ${key} comparso o scomparso`);
      for (const field of ['x', 'y', 'width', 'height']) {
        if (Math.abs(now[key][field] - before[key][field]) > 0.09) throw new Error(`${entry.id}: geometria ${key}.${field} regressa`);
      }
    }
  }
}

// #endregion
// #region 03 - Esecuzione

async function main() {
  try {
    const results = {};
    for (const entry of cases) {
      results[entry.id] = await capture(entry);
      validate(entry, results[entry.id]);
      console.log(`OK ${entry.id}: ${results[entry.id].viewport.width}x${results[entry.id].viewport.height}`);
    }
    if (update) {
      fs.writeFileSync(baselinePath, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
      console.log(`Baseline aggiornata: ${baselinePath}`);
      return;
    }
    if (!fs.existsSync(baselinePath)) throw new Error('Baseline visiva mancante: esegui npm run qa:web:visual:update dopo una revisione umana.');
    compare(results, JSON.parse(fs.readFileSync(baselinePath, 'utf8')));
    console.log('Regressione web superata.');
  } finally {
    // Other QA runs own sibling profiles; remove only an empty shared root.
    try { fs.rmdirSync(temporaryRoot); }
    catch (error) { if (!['ENOENT', 'ENOTEMPTY', 'EEXIST', 'EPERM', 'EBUSY'].includes(error.code)) throw error; }
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

// #endregion

module.exports = { browserExecutable, Cdp, compare, evaluateWhenReady, freePort, removeTemporaryPath, validate, waitForTarget };
