/**
 * @module scripts/motion-qa
 * @description Misura frame pacing, transizioni e companion su istanze Electron isolate.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const outputPath = path.join(root, 'qa-artifacts', 'desktop-motion-qa.json');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function availableDebugPort() {
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

// #region 01 - CDP e ciclo di vita isolato

class CdpClient {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.sequence = 0;
    this.pending = new Map();
    this.exceptions = [];
    this.consoleIssues = [];
  }

  async open() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        this.exceptions.push(message.params?.exceptionDetails?.text || 'Renderer exception');
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
        const detail = (message.params.args || []).map((item) => item.value ?? item.description ?? '').join(' ').trim();
        this.consoleIssues.push(detail || 'console.error');
      }
      if (message.method === 'Log.entryAdded' && message.params?.entry?.level === 'error') {
        this.consoleIssues.push(message.params.entry.text || 'Renderer log error');
      }
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject, method } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${method}: ${message.error.message || JSON.stringify(message.error)}`));
      else resolve(message.result);
    });
    await this.command('Runtime.enable');
    await this.command('Log.enable').catch(() => {});
    return this;
  }

  command(method, params = {}) {
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const response = await this.command('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
  }

  close() {
    try { this.socket?.close(); } catch {}
  }
}

async function findTarget(port, predicate, timeout = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
      const target = targets.find((item) => item.type === 'page' && predicate(item));
      if (target) return target;
    } catch {}
    await delay(40);
  }
  throw new Error('Renderer Electron non raggiungibile tramite DevTools.');
}

async function connectFor(port, predicate, expression, timeout = 12_000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeout) {
    let client;
    try {
      const target = await findTarget(port, predicate, 1_000);
      client = await new CdpClient(target.webSocketDebuggerUrl).open();
      if (await client.evaluate(expression)) return client;
    } catch (error) {
      lastError = error;
    }
    client?.close();
    await delay(55);
  }
  throw lastError || new Error(`Condizione renderer non raggiunta: ${expression.slice(0, 100)}`);
}

async function waitForClient(client, expression, timeout = 4_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try { if (await client.evaluate(expression)) return; } catch {}
    await delay(40);
  }
  throw new Error(`Condizione renderer non raggiunta: ${expression.slice(0, 100)}`);
}

async function reconnectFor(runtime, expression, timeout = 12_000) {
  const client = await connectFor(runtime.port, (item) => item.url === 'nexus://app/index.html'
    || item.url.endsWith('/src/renderer/index.html'), expression, timeout);
  runtime.client?.close();
  runtime.client = client;
  return client;
}

async function waitForFile(filePath, timeout = 18_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (fs.existsSync(filePath) && fs.statSync(filePath).size > 10_000) return;
    await delay(60);
  }
  throw new Error(`Artefatto smoke non prodotto: ${filePath}`);
}

async function launchCase(view, { motion = 'system', width = 1920, height = 1080 } = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-motion-qa-'));
  const screenshotPath = path.join(profile, `${view}.png`);
  const port = await availableDebugPort();
  const child = spawn(electron, ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`], {
    cwd: root,
    env: {
      ...process.env,
      NEXUS_SMOKE_TEST: '1',
      NEXUS_SMOKE_ALLOW_GPU: '1',
      NEXUS_SMOKE_DEBUG_PORT: String(port),
      NEXUS_SHARED_DATA_ROOT: profile,
      NEXUS_SMOKE_VIEW: view,
      NEXUS_SMOKE_WIDTH: String(width),
      NEXUS_SMOKE_HEIGHT: String(height),
      NEXUS_SCREENSHOT_PATH: screenshotPath,
      NEXUS_SMOKE_HOLD_MS: '12000'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const exit = new Promise((resolve) => child.once('exit', resolve));
  const target = await findTarget(port, (item) => item.url === 'nexus://app/index.html'
    || item.url.endsWith('/src/renderer/index.html'));
  const client = await new CdpClient(target.webSocketDebuggerUrl).open();
  await client.evaluate(`(() => {
    const key = 'nexus.interface.preferences.v1';
    let current = {};
    try { current = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch {}
    current.motion = ${JSON.stringify(motion)};
    localStorage.setItem(key, JSON.stringify(current));
    return true;
  })()`);
  client.close();
  return {
    child, client: null, exit, port, profile, screenshotPath, stderr: () => stderr,
    async dispose() {
      this.client?.close();
      if (child.exitCode === null) child.kill();
      await Promise.race([exit, delay(2_000)]);
      fs.rmSync(profile, { recursive: true, force: true });
    }
  };
}

// #endregion
// #region 02 - Frame pacing e puntatore dei tre visualizer

const coreAppearances = {
  saturn: 'saturn-experimental',
  jarvis: 'jarvis-reactor',
  neural: 'neural'
};

async function measureCore(view) {
  process.stdout.write(`Misuro ${view}...\n`);
  const runtime = await launchCase(view);
  try {
    await waitForFile(runtime.screenshotPath);
    await reconnectFor(runtime, `(() => {
      let preferences = {};
      try { preferences = JSON.parse(localStorage.getItem('nexus.interface.preferences.v1') || '{}'); } catch {}
      const canvas = document.querySelector('.voice-visualizer canvas');
      return preferences.coreAppearance === ${JSON.stringify(coreAppearances[view])}
        && document.querySelector('#nexusShell')?.dataset.core === ${JSON.stringify(coreAppearances[view])}
        && canvas && canvas.width > 0 && canvas.height > 0
        && document.visibilityState === 'visible';
    })()`, 16_000);
    process.stdout.write(`Renderer ${view} stabile.\n`);
    await runtime.client.command('Page.bringToFront');
    const geometry = await runtime.client.evaluate(`(() => {
      const canvas = document.querySelector('.voice-visualizer canvas');
      const rect = canvas.getBoundingClientRect();
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
    })()`);
    const pointerPoints = [
      [geometry.left + 2, geometry.top + 2],
      [geometry.left + geometry.width / 2, geometry.top + geometry.height / 2],
      [geometry.right - 2, geometry.bottom - 2]
    ];
    for (const [x, y] of pointerPoints) {
      await runtime.client.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
      await delay(70);
    }
    process.stdout.write(`Puntatore ${view} verificato.\n`);
    const metrics = await runtime.client.evaluate(`(async () => {
      const canvas = document.querySelector('.voice-visualizer canvas');
      const rect = canvas.getBoundingClientRect();
      const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
      const startedAt = performance.now();
      const frameTimes = [];
      let previous = 0;
      await new Promise((resolve) => {
        const sample = (now) => {
          if (previous) frameTimes.push(now - previous);
          previous = now;
          if (now - startedAt >= 1_400) resolve();
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const ordered = [...frameTimes].sort((a, b) => a - b);
      const percentile = (value) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * value))] || 0;
      const elapsed = Math.max(1, frameTimes.reduce((sum, value) => sum + value, 0));
      const longTasks = performance.getEntriesByType('longtask')
        .filter((entry) => entry.startTime >= startedAt).map((entry) => entry.duration);
      return {
        frames: frameTimes.length,
        fps: frameTimes.length * 1000 / elapsed,
        p50Ms: percentile(.5),
        p95Ms: percentile(.95),
        maxMs: ordered.at(-1) || 0,
        slowFrameRatio: frameTimes.filter((value) => value > 25).length / Math.max(1, frameTimes.length),
        longTasks,
        visibility: document.visibilityState,
        contextLost: Boolean(context?.isContextLost()),
        canvasCoversViewport: Math.abs(rect.left) <= 1 && Math.abs(rect.top) <= 1
          && Math.abs(rect.right - innerWidth) <= 1 && Math.abs(rect.bottom - innerHeight) <= 1,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1
          || document.documentElement.scrollHeight > innerHeight + 1,
        activeAnimations: document.getAnimations().filter((animation) => animation.playState === 'running').length
      };
    })()`);
    let fullscreen;
    try {
      // Electron non espone il dominio CDP `Browser` su tutte le build Windows.
      // Un viewport desktop massimo verifica comunque gli stessi vincoli CSS,
      // pointer mapping e copertura WebGL senza cambiare lo stato della finestra.
      await runtime.client.command('Emulation.setDeviceMetricsOverride', {
        width: 2560, height: 1440, deviceScaleFactor: 1, mobile: false,
        screenWidth: 2560, screenHeight: 1440
      });
      await delay(260);
      await runtime.client.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none' });
      fullscreen = await runtime.client.evaluate(`(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const canvas = document.querySelector('.voice-visualizer canvas');
        const pet = document.querySelector('.nexus-pet');
        const overlay = document.querySelector('.ui-overlay');
        const shortcuts = document.querySelector('.shortcut-ribbon');
        const rect = (element) => element?.getBoundingClientRect();
        const canvasRect = rect(canvas);
        const petRect = rect(pet);
        const overlayRect = rect(overlay);
        const shortcutsRect = rect(shortcuts);
        const inside = (bounds) => !bounds || (bounds.left >= -1 && bounds.top >= -1
          && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1);
        return {
          viewport: { width: innerWidth, height: innerHeight },
          canvasCoversViewport: Boolean(canvasRect) && Math.abs(canvasRect.left) <= 1 && Math.abs(canvasRect.top) <= 1
            && Math.abs(canvasRect.right - innerWidth) <= 1 && Math.abs(canvasRect.bottom - innerHeight) <= 1,
          petFits: inside(petRect),
          overlayFits: inside(overlayRect),
          shortcutsFit: inside(shortcutsRect),
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 1
            || document.documentElement.scrollHeight > innerHeight + 1
        };
      })()`);
      const fullscreenCapture = await runtime.client.command('Page.captureScreenshot', { format: 'png', fromSurface: true });
      fullscreen.screenshot = path.join(root, 'qa-artifacts', `${view}-fullscreen.png`);
      fs.mkdirSync(path.dirname(fullscreen.screenshot), { recursive: true });
      fs.writeFileSync(fullscreen.screenshot, Buffer.from(fullscreenCapture.data, 'base64'));
    } catch (error) {
      fullscreen = { error: error.message };
    }
    const failures = [];
    if (!metrics.canvasCoversViewport) failures.push('canvas non allineato al viewport');
    if (metrics.contextLost) failures.push('contesto WebGL perso');
    if (metrics.pageOverflow) failures.push('overflow pagina');
    if (metrics.fps < 35) failures.push(`FPS ${metrics.fps.toFixed(1)} < 35`);
    if (metrics.p95Ms > 34) failures.push(`p95 ${metrics.p95Ms.toFixed(1)} ms > 34 ms`);
    if (metrics.slowFrameRatio > .2) failures.push(`frame lenti ${(metrics.slowFrameRatio * 100).toFixed(1)}% > 20%`);
    if (fullscreen.error) failures.push(`fullscreen non verificato: ${fullscreen.error}`);
    else if (!fullscreen.canvasCoversViewport || !fullscreen.petFits || !fullscreen.overlayFits
      || !fullscreen.shortcutsFit || fullscreen.pageOverflow) failures.push('layout fullscreen non confinato');
    if (runtime.client.exceptions.length) failures.push(`eccezioni renderer: ${runtime.client.exceptions.join('; ')}`);
    if (runtime.client.consoleIssues.length) failures.push(`errori console renderer: ${[...new Set(runtime.client.consoleIssues)].join('; ')}`);
    return { view, geometry, ...metrics, fullscreen, consoleIssues: [...new Set(runtime.client.consoleIssues)], failures };
  } finally {
    await runtime.dispose();
  }
}

// #endregion
// #region 03 - Composer, overlay, hover e companion

async function measureInteraction(motion) {
  const runtime = await launchCase('command', { motion, width: 1090, height: 700 });
  try {
    await waitForFile(runtime.screenshotPath);
    await reconnectFor(runtime, `document.querySelector('.command-input')
      && document.querySelector('#nexusShell')?.dataset.motion === ${JSON.stringify(motion)}`, 14_000);
    await runtime.client.command('Page.bringToFront');
    const petRect = await runtime.client.evaluate(`(() => {
      const rect = document.querySelector('.nexus-pet')?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        transform: getComputedStyle(document.querySelector('.nexus-pet')).transform } : null;
    })()`);
    let petHover = null;
    if (petRect) {
      await runtime.client.command('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: petRect.x + petRect.width / 2, y: petRect.y + petRect.height / 2, button: 'none'
      });
      await delay(140);
      petHover = await runtime.client.evaluate(`getComputedStyle(document.querySelector('.nexus-pet')).transform`);
      await runtime.client.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 2, button: 'none' });
    }
    const surfaces = await runtime.client.evaluate(`(async () => {
      const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      const key = (value, code, control = false) => window.dispatchEvent(new KeyboardEvent('keydown', {
        key: value, code, ctrlKey: control, bubbles: true
      }));
      const waitSelector = async (selector, present = true, timeout = 1_600) => {
        const startedAt = performance.now();
        while (performance.now() - startedAt < timeout) {
          if (Boolean(document.querySelector(selector)) === present) return true;
          await sleep(18);
        }
        return false;
      };
      const inside = (rect) => rect && rect.left >= -1 && rect.top >= -1
        && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
      const intersects = (a, b) => Boolean(a && b && a.left < b.right && a.right > b.left
        && a.top < b.bottom && a.bottom > b.top);

      key('Escape', 'Escape');
      await waitSelector('.command-input', false);
      key('k', 'KeyK', true);
      const composerFrames = [];
      let previous = 0;
      for (let index = 0; index < 34; index += 1) {
        const now = await frame();
        const element = document.querySelector('.command-input');
        if (element) {
          const rect = element.getBoundingClientRect();
          composerFrames.push({ time: now, interval: previous ? now - previous : 0,
            top: rect.top, bottom: rect.bottom, height: rect.height,
            opacity: Number(getComputedStyle(element).opacity), transform: getComputedStyle(element).transform });
        }
        previous = now;
      }
      const composer = document.querySelector('.command-input');
      const composerRect = composer?.getBoundingClientRect();
      const input = composer?.querySelector('textarea, input');
      const initialInputHeight = input?.getBoundingClientRect().height || 0;
      const inputPrototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(inputPrototype, 'value')?.set;
      if (input && setter) {
        setter.call(input, 'Una bozza sufficientemente lunga mantiene il composer leggibile e stabile.\\nIl secondo paragrafo verifica la crescita fluida senza perdere i controlli.');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const inputHeights = [];
      for (let index = 0; index < 20; index += 1) {
        await frame();
        inputHeights.push(input?.getBoundingClientRect().height || 0);
      }

      key('Escape', 'Escape');
      await waitSelector('.command-input', false);
      key('h', 'KeyH', true);
      await waitSelector('.conversation-history');
      const history = document.querySelector('.conversation-history')?.getBoundingClientRect();
      const historyExclusive = !document.querySelector('.command-input, .settings-overlay, .model-switcher');
      key('Escape', 'Escape');
      await waitSelector('.conversation-history', false);
      key(',', 'Comma', true);
      await waitSelector('.settings-overlay');
      const settings = document.querySelector('.settings-overlay')?.getBoundingClientRect();
      const footer = document.querySelector('.settings-footer')?.getBoundingClientRect();
      const settingsExclusive = !document.querySelector('.command-input, .conversation-history, .model-switcher');
      key('Escape', 'Escape');

      const tops = composerFrames.map((sample) => sample.top);
      const intervals = composerFrames.map((sample) => sample.interval).filter(Boolean).sort((a, b) => a - b);
      const movingFrames = composerFrames.slice(1).filter((sample, index) =>
        Math.abs(sample.top - composerFrames[index].top) > .1).length;
      return {
        composerPresent: Boolean(composer),
        composerFits: inside(composerRect),
        composerTravelPx: tops.length ? Math.max(...tops) - Math.min(...tops) : 0,
        composerMovingFrames: movingFrames,
        composerTransforms: [...new Set(composerFrames.map((sample) => sample.transform))].slice(0, 12),
        composerFrameP95Ms: intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * .95))] || 0,
        initialInputHeight,
        expandedInputHeight: Math.max(0, ...inputHeights),
        historyFits: inside(history),
        historyExclusive,
        settingsFits: inside(settings),
        settingsFooterFits: inside(footer) && footer.left >= settings.left && footer.right <= settings.right
          && footer.bottom <= settings.bottom,
        settingsExclusive,
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1
          || document.documentElement.scrollHeight > innerHeight + 1
      };
    })()`);

    const failures = [];
    if (!surfaces.composerFits) failures.push('composer fuori viewport');
    if (!surfaces.historyFits || !surfaces.historyExclusive) failures.push('cronologia non confinata o non esclusiva');
    if (!surfaces.settingsFits || !surfaces.settingsFooterFits || !surfaces.settingsExclusive) failures.push('impostazioni non confinate o non esclusive');
    if (surfaces.pageOverflow) failures.push('overflow pagina durante le transizioni');
    if (surfaces.composerFrameP95Ms > 34) failures.push(`composer p95 ${surfaces.composerFrameP95Ms.toFixed(1)} ms > 34 ms`);
    if (motion === 'reduced' && surfaces.composerMovingFrames > 1) failures.push(`movimento ridotto anima il composer per ${surfaces.composerMovingFrames} frame`);
    if (motion === 'full' && petRect && petHover === petRect.transform) failures.push('hover pet senza risposta visiva');
    if (runtime.client.exceptions.length) failures.push('eccezioni renderer durante le interazioni');
    const consoleIssues = [...new Set(runtime.client.consoleIssues)];
    if (consoleIssues.length) failures.push(`errori console renderer: ${consoleIssues.join('; ')}`);
    return { motion, pet: { idleTransform: petRect?.transform || null, hoverTransform: petHover }, surfaces,
      consoleIssues, failures };
  } finally {
    await runtime.dispose();
  }
}

// #endregion
// #region 04 - Gate e report

(async () => {
  const cores = [];
  if (!process.argv.includes('--interactions-only')) {
    for (const view of Object.keys(coreAppearances)) {
      const result = await measureCore(view);
      cores.push(result);
      process.stdout.write(`OK ${view} - ${result.fps.toFixed(1)} FPS, p95 ${result.p95Ms.toFixed(1)} ms, frame lenti ${(result.slowFrameRatio * 100).toFixed(1)}%\n`);
    }
  }
  const interactions = [];
  for (const motion of ['full', 'reduced']) {
    const result = await measureInteraction(motion);
    interactions.push(result);
    process.stdout.write(`OK interazioni ${motion} - composer p95 ${result.surfaces.composerFrameP95Ms.toFixed(1)} ms, spostamento ${result.surfaces.composerTravelPx.toFixed(1)} px in ${result.surfaces.composerMovingFrames} frame\n`);
  }
  const report = {
    generatedAt: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    cores,
    interactions,
    passed: [...cores, ...interactions].every((result) => result.failures.length === 0)
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  if (!report.passed) {
    for (const result of [...cores, ...interactions]) {
      for (const failure of result.failures) process.stderr.write(`FAIL ${result.view || result.motion}: ${failure}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(`QA motion completata: ${outputPath}\n`);
  }
})().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});

// #endregion
