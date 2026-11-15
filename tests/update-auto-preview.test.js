/**
 * @module tests/update-auto-preview
 * @description Aggiornamento automatico della Preview firmata: controllo in background, download reale
 * verificato da electron-updater contro un feed Preview finto su loopback, toast "Aggiornamento pronto",
 * rifiuto di firme e build non fiduciarie, rollback automatico dopo un avvio fallito.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { NsisUpdater: RealNsisUpdater } = require('electron-updater');
const { HttpExecutor, configureRequestOptions, configureRequestUrl } = require('builder-util-runtime');
const { releaseManifest } = require('../scripts/release-manifest');
const { signatureEnvelope } = require('../src/security/release-integrity');
const { CHANNELS } = require('../src/application/ipc-contracts');
const { rolloutBucket } = require('../src/infrastructure/electron/update-rollout');
const { createUpdateRollback, compareVersions } = require('../src/infrastructure/electron/update-rollback');
const { createUpdateHealth } = require('../src/infrastructure/electron/update-health');

const FEED = 'https://preview.nexus.test';
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const sha512 = (bytes) => crypto.createHash('sha512').update(bytes).digest('base64');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const seedWhere = (predicate) => { let index = 0; while (!predicate(rolloutBucket(`seed-${index}`, 'preview'))) index += 1; return `seed-${index}`; };
const IN_FIRST_RING = seedWhere((bucket) => bucket <= 25);
const OUTSIDE_FIRST_RING = seedWhere((bucket) => bucket > 25);

// #region 01 — Feed Preview finto, firmato con le vere funzioni di release

function previewFeed({ version = '2.0.0', signer = null, unsignedPolicy = false, tamperInstaller = false } = {}) {
  const installer = Buffer.from(`NexusNXS ${version} synthetic installer · ${'x'.repeat(4096)}`);
  const name = `NexusNXS-${version}-Setup.exe`;
  const latest = `version: ${version}\nfiles:\n  - url: ${name}\n    sha512: ${sha512(installer)}\n    size: ${installer.length}\npath: ${name}\nsha512: ${sha512(installer)}\nreleaseDate: '2026-11-15T08:00:00.000Z'\n`;
  const manifest = releaseManifest({ product: 'NexusNXS', version, channel: 'preview', visibility: 'public', releaseClass: 'preview',
    signatureRequired: !unsignedPolicy, artifacts: [
      { path: `release/${name}`, kind: 'installer', bytes: installer.length, sha256: sha256(installer), visibility: 'public' },
      { path: 'release/latest.yml', kind: 'update-manifest', bytes: Buffer.byteLength(latest), sha256: sha256(latest), visibility: 'public' }
    ] });
  const keys = crypto.generateKeyPairSync('ed25519');
  const trusted = keys.publicKey.export({ format: 'pem', type: 'spki' });
  const signingKey = (signer || keys).privateKey.export({ format: 'pem', type: 'pkcs8' });
  const text = JSON.stringify(manifest);
  return {
    version, installer, publicKey: trusted,
    files: {
      '/release-manifest.json': text,
      '/release-manifest.sig.json': JSON.stringify(signatureEnvelope(text, { privateKey: signingKey, keyId: 'preview-test' })),
      '/latest.yml': latest,
      [`/${name}`]: tamperInstaller ? Buffer.from(`substituted bytes ${'y'.repeat(4096)}`) : installer
    }
  };
}

async function serve(feed) {
  const requests = [];
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://loopback').pathname;
    requests.push(pathname);
    const body = feed.files[pathname];
    if (body === undefined) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Length': Buffer.byteLength(body) });
    response.end(body);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port, requests, close: () => new Promise((resolve) => server.close(resolve)) };
}

/** Executor HTTP di electron-updater instradato sul loopback: stesso doDownload, stesso DigestTransform SHA-512. */
class LoopbackExecutor extends HttpExecutor {
  constructor(port) { super(); this.port = port; }
  createRequest(options, callback) {
    const { protocol: _protocol, hostname: _hostname, host: _host, port: _port, agent: _agent, ...rest } = options;
    return http.request({ ...rest, protocol: 'http:', hostname: '127.0.0.1', port: this.port }, callback);
  }
  download(url, destination, options) {
    return options.cancellationToken.createPromise((resolve, reject, onCancel) => {
      const requestOptions = { headers: options.headers || undefined, redirect: 'manual' };
      configureRequestUrl(url, requestOptions);
      configureRequestOptions(requestOptions);
      this.doDownload(requestOptions, { destination, options, onCancel, responseHandler: null,
        callback: (error) => (error == null ? resolve(destination) : reject(error)) }, 0);
    });
  }
}

// #endregion

// #region 02 — Update manager reale con Electron simulato

function loadManager({ root, port, version = '1.0.0', feed, rolloutSeed = IN_FIRST_RING, launches = [], quits = [], published = [] }) {
  const handlers = new Map();
  let instance;
  const cacheRoot = path.join(root, 'cache');
  const updateConfig = path.join(root, 'app-update.yml');
  fs.mkdirSync(cacheRoot, { recursive: true });
  fs.writeFileSync(updateConfig, `provider: generic\nurl: ${FEED}\nupdaterCacheDirName: nexusnxs-updater\n`);
  class LoopbackNsisUpdater extends RealNsisUpdater {
    constructor(options) {
      super(undefined, { version, name: 'nexusnxs', isPackaged: true, whenReady: async () => {}, baseCachePath: cacheRoot,
        userDataPath: root, appUpdateConfigPath: updateConfig, onQuit() {}, quit() {} });
      instance = this;
      this.httpExecutor = new LoopbackExecutor(port);
      this.stagingUserIdPromise = { value: Promise.resolve('11111111-1111-4111-8111-111111111111') };
      this.quitAndInstall = (silent, runAfter) => { quits.push({ silent, runAfter }); };
      this.setFeedURL(options);
    }
  }
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') {
      return { app: { isPackaged: true, getVersion: () => version, isReady: () => true, quit: () => quits.push('app-quit') },
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, net: { fetch: async () => new Response('ok') } };
    }
    if (request === 'electron-updater') return { NsisUpdater: LoopbackNsisUpdater };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('../src/infrastructure/electron/update-manager');
  delete require.cache[modulePath];
  try {
    const { createUpdateManager } = require(modulePath);
    const manager = createUpdateManager({
      updateUrl: FEED, channel: 'preview', manifestPublicKey: feed.publicKey, manifestKeyId: 'preview-test', rolloutSeed,
      trustedRendererUrl: 'nexus://app/index.html', logger: { info() {}, warn() {}, error() {}, debug() {} },
      healthStatePath: path.join(root, 'data', 'updates', 'health.json'),
      installerCopyPath: path.join(cacheRoot, 'nexusnxs-updater', 'installer.exe'),
      launchInstaller: (file) => launches.push(file), quit: () => quits.push('rollback-quit'),
      initialCheckMs: 5, checkIntervalMs: 60 * 60 * 1000
    });
    const window = { isDestroyed: () => false, webContents: { send: (channel, state) => { if (channel === CHANNELS.updateEvent) published.push({ ...state }); } } };
    manager.setWindowProvider(() => window);
    const sender = { sender: { getURL: () => 'nexus://app/index.html' } };
    return { manager, instance: () => instance, check: () => handlers.get(CHANNELS.updateCheck)(sender), install: () => handlers.get(CHANNELS.updateInstall)(sender) };
  } finally {
    Module._load = originalLoad;
    delete require.cache[modulePath];
  }
}

/** Instala il fetch globale (usato per la distinta firmata) sul feed loopback, vietando i redirect. */
function routeFetch(port) {
  const original = globalThis.fetch;
  globalThis.fetch = (url, options = {}) => {
    assert.equal(options.redirect, 'error', 'la distinta firmata non segue redirect');
    return original(String(url).replace(FEED, `http://127.0.0.1:${port}`), options);
  };
  return () => { globalThis.fetch = original; };
}

async function until(predicate, label, timeout = 10_000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`Timeout: ${label}`);
    await tick(10);
  }
}

async function withFeed(feed, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-auto-update-'));
  const loopback = await serve(feed);
  const restoreFetch = routeFetch(loopback.port);
  try {
    await callback({ root, port: loopback.port, requests: loopback.requests });
  } finally {
    restoreFetch();
    await loopback.close();
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

// #endregion

// #region 03 — End-to-end: controllo, download verificato, toast, rollback

test('e2e: all avvio la Preview firmata si scarica e verifica da sola, poi solo il toast "Aggiornamento pronto"', async () => {
  const { updateVisible, updateIsToast } = await import('../web/src/update-visibility.ts');
  const feed = previewFeed();
  await withFeed(feed, async ({ root, port, requests }) => {
    const published = [];
    const quits = [];
    const { manager, instance, install } = loadManager({ root, port, feed, published, quits });
    try {
      manager.start();
      await until(() => manager.status().status === 'ready', 'download in background');
      const state = manager.status();
      assert.equal(state.version, '2.0.0');
      assert.equal(state.automatic, true);
      assert.ok(requests.includes('/NexusNXS-2.0.0-Setup.exe'), 'installer scaricato dal feed');
      assert.ok(!requests.some((item) => item.endsWith('preview.yml')), 'mai il canale mutabile non firmato');
      // Il file scaricato è esattamente quello firmato.
      const cached = path.join(root, 'cache', 'nexusnxs-updater', 'pending', 'NexusNXS-2.0.0-Setup.exe');
      assert.equal(sha512(fs.readFileSync(cached)), sha512(feed.installer));
      assert.equal(instance().autoInstallOnAppQuit, true, 'senza "Riavvia ora" si installa alla chiusura');
      assert.equal(instance().allowDowngrade, false);
      // Discreto: nessuna scheda durante controllo e download, soltanto il toast finale.
      const shown = published.filter((item) => updateVisible(item));
      assert.ok(shown.length >= 1);
      assert.ok(shown.every((item) => item.status === 'ready' && updateIsToast(item)), JSON.stringify(shown.map((item) => item.status)));
      assert.ok(published.some((item) => item.status === 'downloading' && item.phase === 'background'));
      // La nuova versione sarà "in prova" al primo avvio.
      const rollback = JSON.parse(fs.readFileSync(path.join(root, 'data', 'updates', 'rollback.json'), 'utf8'));
      assert.equal(rollback.trial.version, '2.0.0');
      assert.equal(rollback.trial.from, '1.0.0');
      // "Riavvia ora": installazione silenziosa e rilancio.
      assert.equal(await install(), true);
      assert.equal(manager.status().status, 'installing');
      await tick(1500);
      assert.deepEqual(quits, [{ silent: true, runAfter: true }]);
    } finally {
      manager.stop();
    }
  });
});

test('e2e: un installer sostituito sul feed non diventa mai "pronto" e l errore resta discreto', async () => {
  const { updateVisible } = await import('../web/src/update-visibility.ts');
  const feed = previewFeed({ tamperInstaller: true });
  await withFeed(feed, async ({ root, port, requests }) => {
    const published = [];
    const { manager } = loadManager({ root, port, feed, published });
    try {
      manager.start();
      await until(() => manager.status().status === 'error', 'rifiuto del digest');
      assert.ok(requests.includes('/NexusNXS-2.0.0-Setup.exe'), 'il rifiuto avviene sui byte scaricati');
      assert.equal(manager.status().phase, 'background');
      assert.equal(fs.existsSync(path.join(root, 'cache', 'nexusnxs-updater', 'pending', 'NexusNXS-2.0.0-Setup.exe')), false);
      assert.ok(!published.some((item) => item.status === 'ready'));
      assert.ok(!published.some((item) => updateVisible(item)), 'nessuna scheda per un errore in background');
      assert.equal(fs.existsSync(path.join(root, 'data', 'updates', 'rollback.json')), false, 'nessuna prova armata');
    } finally {
      manager.stop();
    }
  });
});

test('e2e: firma di un altra chiave, distinta non firmata o feed senza firma non avviano alcun download', async () => {
  const intruder = crypto.generateKeyPairSync('ed25519');
  const cases = [
    previewFeed({ signer: intruder }),
    previewFeed({ unsignedPolicy: true }),
    (() => { const feed = previewFeed(); delete feed.files['/release-manifest.sig.json']; return feed; })()
  ];
  for (const feed of cases) {
    await withFeed(feed, async ({ root, port, requests }) => {
      const { manager, check } = loadManager({ root, port, feed });
      try {
        await assert.rejects(check());
        manager.start();
        await until(() => manager.status().status === 'error', 'rifiuto della distinta');
        assert.ok(!requests.includes('/NexusNXS-2.0.0-Setup.exe'), 'nessun byte di installer');
        assert.ok(!requests.includes('/latest.yml'), 'nessun metadato oltre la distinta rifiutata');
      } finally {
        manager.stop();
      }
    });
  }
});

test('e2e: la policy di rollout firmata vale anche in background (coorte fuori dal primo anello)', async () => {
  const feed = previewFeed();
  await withFeed(feed, async ({ root, port, requests }) => {
    const { manager } = loadManager({ root, port, feed, rolloutSeed: OUTSIDE_FIRST_RING });
    try {
      manager.start();
      await until(() => manager.status().status === 'deferred', 'coorte rimandata');
      assert.ok(!requests.includes('/NexusNXS-2.0.0-Setup.exe'));
    } finally {
      manager.stop();
    }
  });
});

test('e2e: due avvii falliti della versione in prova reinstallano il punto di ripristino e bloccano la versione', async () => {
  const feed = previewFeed();
  await withFeed(feed, async ({ root, port, requests }) => {
    // La 1.0.0 installata è sana: il suo installer (copia NSIS) diventa il punto di ripristino.
    const installerCopy = path.join(root, 'cache', 'nexusnxs-updater', 'installer.exe');
    fs.mkdirSync(path.dirname(installerCopy), { recursive: true });
    fs.writeFileSync(installerCopy, 'NexusNXS 1.0.0 installer');
    const restore = createUpdateRollback({ statePath: path.join(root, 'data', 'updates', 'rollback.json'),
      restoreDir: path.join(root, 'cache', 'nexusnxs-updater', 'rollback'), installerCopyPath: installerCopy, version: '1.0.0',
      launchInstaller() {}, quit() {} });
    assert.equal(await restore.confirmHealthy(), true);

    const first = loadManager({ root, port, feed });
    first.manager.start();
    await until(() => first.manager.status().status === 'ready', 'download in background');
    first.manager.stop();

    // La 2.0.0 va in crash all'avvio due volte (nessuno stop pulito).
    const launches = [];
    const quits = [];
    const boot = () => loadManager({ root, port, feed, version: '2.0.0', launches, quits });
    assert.notEqual(boot().manager.status().status, 'rolling-back');
    assert.notEqual(boot().manager.status().status, 'rolling-back');
    const third = boot();
    assert.equal(third.manager.status().status, 'rolling-back');
    assert.equal(launches.length, 1);
    assert.equal(fs.readFileSync(launches[0], 'utf8'), 'NexusNXS 1.0.0 installer');
    assert.deepEqual(quits, ['rollback-quit']);

    // Di nuovo sulla 1.0.0: la 2.0.0 ripristinata non viene riscaricata.
    const downloadsBefore = requests.filter((item) => item.endsWith('.exe')).length;
    const back = loadManager({ root, port, feed });
    try {
      await back.check();
      assert.equal(back.manager.status().status, 'current');
      assert.equal(back.manager.status().blockedVersion, '2.0.0');
      assert.equal(requests.filter((item) => item.endsWith('.exe')).length, downloadsBefore);
    } finally {
      back.manager.stop();
    }
  });
});

// #endregion

// #region 04 — Unità: rollback, salute, visibilità

test('rollback: chiusure pulite non contano, crash sì; punto di ripristino alterato = nessuna esecuzione', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-rollback-'));
  try {
    const statePath = path.join(root, 'rollback.json');
    const restoreDir = path.join(root, 'restore');
    const installerCopyPath = path.join(root, 'installer.exe');
    fs.writeFileSync(installerCopyPath, 'healthy 0.3.41');
    const make = (version, launches = []) => createUpdateRollback({ statePath, restoreDir, installerCopyPath, version,
      launchInstaller: (file) => launches.push(file), quit() {} });

    const healthy = make('0.3.41');
    assert.equal(healthy.arm('0.3.41'), false, 'mai in prova la stessa versione');
    assert.equal(healthy.arm('0.3.40'), false, 'mai un downgrade');
    await healthy.confirmHealthy();
    assert.equal(healthy.snapshot().restorePoint.version, '0.3.41');
    assert.equal(healthy.arm('0.3.42'), true);

    // Avvio interrotto dall'utente con chiusura pulita: non è un fallimento.
    const clean = make('0.3.42');
    assert.equal(clean.boot().action, 'trial');
    clean.cleanExit();
    assert.equal(make('0.3.42').boot().failures, 0);

    // Due crash di processo prima di diventare sana: rollback immediato.
    const launches = [];
    const crashing = make('0.3.42', launches);
    assert.equal(crashing.recordCrash().action, 'trial');
    assert.equal(crashing.recordCrash().action, 'none', 'un crash per sessione');
    const again = make('0.3.42', launches);
    again.boot();
    assert.equal(again.recordCrash().action, 'rollback');
    assert.equal(launches.length, 1);
    assert.equal(again.isBlocked('0.3.42'), true);
    assert.equal(make('0.3.42').boot().action, 'none', 'un solo rollback per prova');

    // Restore point manomesso: blocca la versione ma non esegue byte non verificati.
    fs.writeFileSync(path.join(restoreDir, healthy.snapshot().restorePoint.file), 'tampered');
    const other = make('0.3.41');
    other.arm('0.3.43');
    const launches2 = [];
    const bad = make('0.3.43', launches2);
    bad.boot(); bad.boot();
    assert.equal(bad.recordCrash().action, 'unavailable');
    assert.equal(launches2.length, 0);
    assert.equal(compareVersions('0.3.10', '0.3.9'), 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('salute: "healthy" avvisa il rollback anche con il segnale anonimo disattivato', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nxs-health-hook-'));
  try {
    const events = [];
    const sent = [];
    const health = createUpdateHealth({ statePath: path.join(root, 'health.json'), version: '0.3.42', channel: 'preview',
      endpoint: 'https://x/health', send: async (...args) => sent.push(args), enabled: false, healthyAfterMs: 5, onEvent: (event) => events.push(event) });
    health.start();
    await tick(30);
    health.stop();
    assert.deepEqual(events, ['healthy']);
    assert.equal(sent.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('avviso: i flussi in background restano invisibili, quelli manuali invariati', async () => {
  const { updateVisible, updateIsToast } = await import('../web/src/update-visibility.ts');
  assert.equal(updateVisible({ status: 'available', version: '2.0.0', automatic: true }), false);
  assert.equal(updateVisible({ status: 'downloading', version: '2.0.0', automatic: true }), false);
  assert.equal(updateVisible({ status: 'error', phase: 'background', version: '2.0.0', automatic: true }), false);
  assert.equal(updateVisible({ status: 'ready', version: '2.0.0', automatic: true }), true);
  assert.equal(updateIsToast({ status: 'ready', version: '2.0.0', automatic: true }), true);
  assert.equal(updateVisible({ status: 'ready', version: '2.0.0', automatic: true }, '2.0.0'), false, '"Più tardi" vale anche per il toast');
  assert.equal(updateVisible({ status: 'available', version: '2.0.0' }), true);
  assert.equal(updateIsToast({ status: 'ready', version: '2.0.0' }), false);
  assert.equal(updateVisible({ status: 'error', phase: 'download', version: '2.0.0' }), true);
  assert.equal(updateVisible({ status: 'installing', version: '2.0.0', automatic: true }, '2.0.0'), true);
});

// #endregion
