const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { installShutdownBarrier, isAudioOnlyMediaRequest, shouldBlockRendererRequest, shouldKeepApplicationAlive, shouldQuitAfterAllWindowsClosed } = require('../src/infrastructure/electron/app-lifecycle');

test('il renderer non può contattare Internet o servizi HTTP locali', () => {
  assert.equal(shouldBlockRendererRequest('https://example.test/data'), true);
  assert.equal(shouldBlockRendererRequest('http://127.0.0.1:11434/api/tags'), true);
  assert.equal(shouldBlockRendererRequest('nexus://app/index.html'), false);
  assert.equal(shouldBlockRendererRequest('blob:nexus://app/89ce'), false);
  assert.equal(shouldBlockRendererRequest('data:image/png;base64,AA=='), false);
  assert.equal(shouldBlockRendererRequest('file:///C:/Windows/System32/drivers/etc/hosts'), true);
  assert.equal(shouldBlockRendererRequest('javascript:alert(1)'), true);
  assert.equal(shouldBlockRendererRequest('nexus://renderer/index.html'), true);
  assert.equal(shouldBlockRendererRequest('blob:https://example.test/89ce'), true);
  assert.equal(shouldBlockRendererRequest('about:blank'), true);
  assert.equal(shouldBlockRendererRequest('not a url'), true);
});

test('autorizza entrambe le forme Electron di una richiesta microfono e mai il video', () => {
  assert.equal(isAudioOnlyMediaRequest({ mediaType: 'audio' }), true);
  assert.equal(isAudioOnlyMediaRequest({ mediaTypes: ['audio'] }), true);
  assert.equal(isAudioOnlyMediaRequest({ mediaType: 'video' }), false);
  assert.equal(isAudioOnlyMediaRequest({ mediaTypes: ['audio', 'video'] }), false);
  assert.equal(isAudioOnlyMediaRequest({}), false);
});

test('la policy distingue un processo headless dalla chiusura normale', () => {
  assert.equal(shouldQuitAfterAllWindowsClosed('win32', true), false);
  assert.equal(shouldQuitAfterAllWindowsClosed('win32', false), true);
  assert.equal(shouldQuitAfterAllWindowsClosed('darwin', false), false);
});

test('la X termina il client desktop mentre il server headless resta indipendente', () => {
  assert.equal(shouldKeepApplicationAlive({ headless: false }), false);
  assert.equal(shouldKeepApplicationAlive({ headless: true }), true);
});

test('la barriera di chiusura attende il cleanup una sola volta prima di uscire', async () => {
  class FakeApplication extends EventEmitter {
    constructor() { super(); this.quitCalls = 0; this.prevented = 0; }
    quit() {
      this.quitCalls += 1;
      this.emit('before-quit', { preventDefault: () => { this.prevented += 1; } });
    }
  }
  const application = new FakeApplication();
  let releaseCleanup;
  let cleanupCalls = 0;
  const cleanupGate = new Promise((resolve) => { releaseCleanup = resolve; });
  const barrier = installShutdownBarrier({
    application,
    timeoutMs: 2_000,
    onShutdown: async () => { cleanupCalls += 1; await cleanupGate; }
  });

  application.quit();
  application.quit();
  await Promise.resolve();
  assert.equal(barrier.state, 'running');
  assert.equal(cleanupCalls, 1);
  assert.equal(application.prevented, 2);
  releaseCleanup();
  await barrier.beginShutdown();
  assert.equal(barrier.state, 'finished');
  assert.equal(cleanupCalls, 1);
  assert.equal(application.quitCalls, 3);
});

test('un bootstrap tardivo non riapre la UI dopo la chiusura durante il caricamento', async () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const application = new EventEmitter();
  application.whenReady = () => Promise.resolve();
  application.requestSingleInstanceLock = () => true;
  application.quit = () => application.emit('before-quit', { preventDefault() {} });
  const session = { defaultSession: {
    setPermissionCheckHandler() {}, setPermissionRequestHandler() {},
    webRequest: { onBeforeRequest() {} }
  } };
  const fixture = { module: { exports: {} }, process, URL, setTimeout, clearTimeout,
    require: () => ({ app: application, Menu: { setApplicationMenu() {} }, session }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/infrastructure/electron/app-lifecycle'), 'utf8'), fixture);
  let releaseBootstrap, showWindow;
  let windows = 0, activations = 0;
  const pendingBootstrap = new Promise(resolve => { releaseBootstrap = resolve; });
  const lifecycle = fixture.module.exports.startAppLifecycle({
    createWindow: () => { windows++; return { once() {}, isDestroyed: () => false }; },
    onReady: async ({ showPrimaryWindow }) => {
      showWindow = showPrimaryWindow;
      showPrimaryWindow();
      await pendingBootstrap;
    },
    onShutdown: async () => {}, onExternalActivation: () => { activations++; },
    logger: { error() {} }
  });
  await Promise.resolve();
  assert.equal(windows, 1);
  application.quit();
  assert.equal(showWindow(), null);
  releaseBootstrap();
  await lifecycle;
  assert.equal(windows, 1);
  assert.equal(activations, 0);
  application.emit('activate');
  assert.equal(windows, 1);
});
