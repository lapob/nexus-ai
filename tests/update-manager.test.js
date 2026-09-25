/**
 * @module tests/update-manager
 * @description Verifica il confine pubblico dell'aggiornamento desktop.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const { NsisUpdater: RealNsisUpdater } = require('electron-updater');
const { releaseManifest } = require('../scripts/release-manifest');
const { signatureEnvelope } = require('../src/security/release-integrity');
const { CHANNELS } = require('../src/application/ipc-contracts');
const { DigestTransform } = require('builder-util-runtime');
const { Readable, Writable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

function signedFeed(channel, { paused = false, tamper = false } = {}) {
  const installer = Buffer.from('synthetic installer bytes; never downloaded or executed');
  const sha512 = crypto.createHash('sha512').update(installer).digest('base64');
  const sha256 = crypto.createHash('sha256').update(installer).digest('hex');
  const latest = `version: 2.0.0\nfiles:\n  - url: NexusNXS-2.0.0-Setup.exe\n    sha512: ${sha512}\n    size: ${installer.length}\npath: NexusNXS-2.0.0-Setup.exe\nsha512: ${sha512}\n`;
  const manifest = releaseManifest({ product: 'NexusNXS', version: '2.0.0', channel, visibility: 'public',
    releaseClass: channel === 'stable' ? 'production' : channel, signatureRequired: true,
    artifacts: [
      { path: 'release/NexusNXS-2.0.0-Setup.exe', kind: 'installer', bytes: installer.length, sha256, visibility: 'public' },
      { path: 'release/latest.yml', kind: 'update-manifest', bytes: Buffer.byteLength(latest), sha256: crypto.createHash('sha256').update(latest).digest('hex'), visibility: 'public' }
    ] });
  manifest.updatePolicy.initialPercentage = 100;
  manifest.updatePolicy.paused = paused;
  const keys = crypto.generateKeyPairSync('ed25519');
  const privateKey = keys.privateKey.export({ format: 'pem', type: 'pkcs8' });
  const publicKey = keys.publicKey.export({ format: 'pem', type: 'spki' });
  const text = JSON.stringify(manifest);
  const signature = signatureEnvelope(text, { privateKey, keyId: 'test-key' });
  return { publicKey, installer, sha512, sha256, latest, responses: {
    '/release-manifest.json': text,
    '/release-manifest.sig.json': JSON.stringify(signature),
    '/latest.yml': tamper ? latest.replace('2.0.0', '9.9.9') : latest,
    [`/${channel}.yml`]: `version: 9.9.9\npath: unsigned-channel.exe\nsha512: ${crypto.createHash('sha512').update('attacker bytes').digest('base64')}\n`
  } };
}

async function withOfflineUpdater(feed, callback) {
  const handlers = new Map();
  const requests = [];
  const downloads = [];
  let instance;
  const responseText = (url) => {
    requests.push(new URL(url).pathname);
    const content = feed.responses[new URL(url).pathname];
    if (content === undefined) throw new Error(`Unexpected network request: ${url}`);
    return content;
  };
  // The actual installed NsisUpdater and provider factory run. Only HTTP and
  // the download boundary are replaced: no network, files or installers run.
  class OfflineNsisUpdater extends RealNsisUpdater {
    constructor(options) {
      super(undefined, { version: '1.0.0', isPackaged: true, whenReady: async () => {} });
      instance = this;
      this.httpExecutor = { request: async (options) => responseText(`https://${options.hostname}${options.path}`) };
      this.stagingUserIdPromise = { value: Promise.resolve('11111111-1111-4111-8111-111111111111') };
      this.setFeedURL(options);
    }
    async downloadUpdate() {
      const { info, provider } = this.updateInfoAndProvider;
      downloads.push({ info, files: provider.resolveFiles(info) });
      return [];
    }
  }
  const originalLoad = Module._load;
  const originalFetch = globalThis.fetch;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: { isPackaged: true, getVersion: () => '1.0.0' }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) } };
    if (request === 'electron-updater') return { NsisUpdater: OfflineNsisUpdater };
    return originalLoad.call(this, request, parent, isMain);
  };
  const modulePath = require.resolve('../src/infrastructure/electron/update-manager');
  delete require.cache[modulePath];
  let manager;
  try {
    const exports = require(modulePath);
    globalThis.fetch = async (url, options) => {
      assert.equal(options.redirect, 'error', 'signed metadata may not redirect');
      const content = responseText(url);
      return { ok: true, headers: { get: () => null }, text: async () => content };
    };
    manager = exports.createUpdateManager({ updateUrl: 'https://updates.example.test', channel: feed.channel || 'stable',
      manifestPublicKey: feed.publicKey, manifestKeyId: 'test-key', trustedRendererUrl: 'nexus://app/index.html',
      logger: { info() {}, warn() {}, error() {}, debug() {} } });
    const check = () => handlers.get(CHANNELS.updateCheck)({ sender: { getURL: () => 'nexus://app/index.html' } });
    await callback({ check, requests, downloads, instance, manager, ...exports });
  } finally {
    manager?.stop();
    Module._load = originalLoad;
    globalThis.fetch = originalFetch;
    delete require.cache[modulePath];
  }
}

// electron-updater carica Electron; in Node puro verifichiamo le primitive
// esportate senza inizializzare il lifecycle di rete.
test('l updater accetta soltanto una origine HTTPS pulita', () => {
  const Module = require('node:module');
  const original = Module._load;
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return { app: { getVersion: () => '1.0.0' }, ipcMain: { handle() {} } };
    if (request === 'electron-updater') return { NsisUpdater: class {} };
    return original.call(this, request, parent, isMain);
  };
  try {
    const modulePath = require.resolve('../src/infrastructure/electron/update-manager');
    delete require.cache[modulePath];
    const { cleanUpdateUrl, publicUpdateInfo } = require(modulePath);
    assert.equal(cleanUpdateUrl('https://updates.example.test/stable/'), 'https://updates.example.test/stable');
    assert.throws(() => cleanUpdateUrl('http://updates.example.test'));
    assert.throws(() => cleanUpdateUrl('https://user:secret@updates.example.test'));
    assert.deepEqual(publicUpdateInfo({ version: '2.0.0', releaseName: 'Stabile', releaseNotes: '<b>Più veloce</b>', files: ['private'] }), { version: '2.0.0', releaseName: 'Stabile', releaseNotes: 'Più veloce' });
  } finally {
    Module._load = original;
  }
});

for (const channel of ['stable', 'beta']) {
  test(`il vero provider NSIS usa soltanto latest.yml firmato per ${channel}, mai il canale mutabile`, async () => {
    const feed = { ...signedFeed(channel), channel };
    await withOfflineUpdater(feed, async ({ check, requests, downloads, instance }) => {
      await check();
      assert.equal(downloads.length, 1);
      assert.equal(downloads[0].info.version, '2.0.0');
      assert.equal(downloads[0].files[0].url.href, 'https://updates.example.test/NexusNXS-2.0.0-Setup.exe');
      assert.equal(downloads[0].files[0].info.sha512, feed.sha512);
      assert.equal(downloads[0].files[0].info.sha2, feed.sha256);
      assert.deepEqual(requests.sort(), ['/latest.yml', '/release-manifest.json', '/release-manifest.sig.json'].sort());
      assert.equal(instance.disableWebInstaller, true);
      assert.equal(instance.autoDownload, true);
      assert.equal(instance.autoInstallOnAppQuit, true);
      assert.equal(instance.allowDowngrade, false);
      assert.equal(instance.verifySignature, RealNsisUpdater.prototype.verifySignature, 'Authenticode remains the upstream verifier');
      const provider = instance.updateInfoAndProvider.provider;
      const altered = await provider.getLatestVersion();
      altered.files[0].url = 'https://attacker.invalid/other.exe';
      altered.files[0].sha512 = 'attacker';
      assert.equal(provider.resolveFiles(altered)[0].info.sha512, feed.sha512);
      assert.equal(provider.resolveFiles(altered)[0].url.href, downloads[0].files[0].url.href);
      altered.version = '9.9.9';
      assert.throws(() => provider.resolveFiles(altered), /non autorizzata/);
      // The installed HTTP executor uses this digest transform even after
      // redirects. Redirecting an artifact cannot authorize different bytes.
      const checkBytes = (bytes) => pipeline(Readable.from([bytes]),
        new DigestTransform(downloads[0].files[0].info.sha512, 'sha512', 'base64'),
        new Writable({ write(_chunk, _encoding, done) { done(); } }));
      await checkBytes(feed.installer);
      await assert.rejects(checkBytes(Buffer.from('substituted artifact after redirect')), { code: 'ERR_CHECKSUM_MISMATCH' });
    });
  });
}

test('rollout in pausa e feed alterato non raggiungono il download NSIS', async () => {
  await withOfflineUpdater(signedFeed('stable', { paused: true }), async ({ check, downloads, manager }) => {
    await check();
    assert.equal(downloads.length, 0);
    assert.equal(manager.status().status, 'paused');
  });
  await withOfflineUpdater(signedFeed('stable', { tamper: true }), async ({ check, downloads }) => {
    await assert.rejects(check(), /non corrisponde/);
    assert.equal(downloads.length, 0);
  });
});
