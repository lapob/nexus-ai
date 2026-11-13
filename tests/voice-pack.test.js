const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { QWEN3_PACK_ID, MIN_GPU_BYTES, buildManifest, verifyPack, installedPack, eligibility, installPack, removePack,
  createVoicePackController } = require('../src/voice/voice-pack');
const { Qwen3GgufSpeechService } = require('../src/voice/qwen3-speech');

const temp = (t) => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-pack-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };
const write = (root, relative, content) => { const file = path.join(root, ...relative.split('/')); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };

function makePack(root, { id = QWEN3_PACK_ID, version = '1' } = {}) {
  write(root, 'python/python.exe', 'exe');
  write(root, 'worker.py', 'print(1)');
  write(root, 'site-packages/numpy/__init__.py', '');
  write(root, 'models/Qwen3-TTS-12Hz-0.6B-Base/qwen3_tts_talker.q5_k.gguf', 'gguf');
  write(root, 'manifest.json', JSON.stringify(buildManifest(root, { id, version })));
  return root;
}

const tarAvailable = process.platform === 'win32' && fs.existsSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'));
function tarOf(directory, archive) {
  const result = spawnSync(path.join(process.env.SystemRoot, 'System32', 'tar.exe'), ['-cf', archive, '-C', directory, '.'], { windowsHide: true });
  assert.equal(result.status, 0);
  return archive;
}

test('il manifest elenca ogni file con dimensione e sha256 e la verifica profonda li controlla', (t) => {
  const pack = makePack(path.join(temp(t), 'pack'));
  const manifest = verifyPack(pack, { deep: true });
  assert.equal(manifest.files.length, 4);
  assert.ok(manifest.files.every((file) => /^[a-f0-9]{64}$/.test(file.sha256)));
  write(pack, 'worker.py', 'print(2)');
  assert.doesNotThrow(() => verifyPack(pack), 'stessa dimensione: la verifica rapida non rilegge i file');
  assert.throws(() => verifyPack(pack, { deep: true }), /Integrità non valida: worker.py/);
});

test('file estranei, percorsi fuori dal pacchetto e id diverso vengono rifiutati', (t) => {
  const pack = makePack(path.join(temp(t), 'pack'));
  write(pack, 'site-packages/evil.pth', 'import os');
  assert.throws(() => verifyPack(pack), /File non previsti/);
  fs.rmSync(path.join(pack, 'site-packages', 'evil.pth'));
  write(pack, 'src/log/qwen3.log', 'log');
  assert.doesNotThrow(() => verifyPack(pack), 'la libreria scrive solo il suo log');
  const manifest = JSON.parse(fs.readFileSync(path.join(pack, 'manifest.json'), 'utf8'));
  for (const bad of ['../outside.dll', 'C:/Windows/x.dll', 'a/../../b', 'dir\\file']) {
    fs.writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify({ ...manifest, files: [...manifest.files, { path: bad, size: 1, sha256: 'a'.repeat(64) }] }));
    assert.throws(() => verifyPack(pack), /manifest non valida/, bad);
  }
  fs.writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify({ ...manifest, id: 'altro' }));
  assert.throws(() => verifyPack(pack), /non corrisponde/);
});

test('il pacchetto è proposto solo su Windows con almeno 12 GB di VRAM', () => {
  assert.deepEqual(eligibility({ platform: 'win32', gpuMemoryBytes: 16 * 1024 ** 3 }), { eligible: true, reason: null });
  assert.equal(eligibility({ platform: 'win32', gpuMemoryBytes: MIN_GPU_BYTES - 1 }).reason, 'gpu-memory');
  assert.equal(eligibility({ platform: 'linux', gpuMemoryBytes: 24 * 1024 ** 3 }).reason, 'platform');
});

test('installazione da archivio: digest verificato, staging atomico, rimozione', { skip: !tarAvailable }, async (t) => {
  const root = temp(t);
  const archive = tarOf(makePack(path.join(root, 'build'), { version: '2' }), path.join(root, 'pack.tar'));
  const packsRoot = path.join(root, 'packs');
  await assert.rejects(installPack({ packsRoot, archivePath: archive, sha256: 'b'.repeat(64) }), /Digest del pacchetto voce non corrispondente/);
  assert.equal(installedPack(packsRoot), null);
  const phases = [];
  const result = await installPack({ packsRoot, archivePath: archive, sha256: require('../src/voice/voice-pack').sha256File(archive), onProgress: (p) => phases.push(p.phase) });
  assert.equal(result.version, '2');
  assert.deepEqual(phases, ['hash', 'extract', 'verify', 'done']);
  assert.equal(installedPack(packsRoot).manifest.version, '2');
  assert.deepEqual(fs.readdirSync(packsRoot), [QWEN3_PACK_ID], 'nessun residuo di staging');
  assert.equal(removePack({ packsRoot }), true);
  assert.deepEqual(fs.readdirSync(packsRoot), []);
  assert.equal(removePack({ packsRoot }), false);
});

test('un archivio manomesso non sostituisce il pacchetto già installato', { skip: !tarAvailable }, async (t) => {
  const root = temp(t);
  const packsRoot = path.join(root, 'packs');
  await installPack({ packsRoot, archivePath: tarOf(makePack(path.join(root, 'good')), path.join(root, 'good.tar')) });
  const bad = makePack(path.join(root, 'bad'), { version: '9' });
  write(bad, 'worker.py', 'print(9)');
  await assert.rejects(installPack({ packsRoot, archivePath: tarOf(bad, path.join(root, 'bad.tar')) }), /Integrità non valida: worker.py/);
  assert.equal(installedPack(packsRoot).manifest.version, '1');
  assert.deepEqual(fs.readdirSync(packsRoot), [QWEN3_PACK_ID]);
});

test('il download richiede HTTPS e un digest fissato', async (t) => {
  const packsRoot = temp(t);
  await assert.rejects(installPack({ packsRoot, url: 'https://example.invalid/p.tar' }), /Digest del pacchetto voce mancante/);
  await assert.rejects(installPack({ packsRoot, url: 'http://example.invalid/p.tar', sha256: 'a'.repeat(64) }), /solo via HTTPS/);
  const fetchImpl = async () => ({ ok: true, headers: new Map(), body: (async function* body() { yield Buffer.from('not the pack'); })() });
  await assert.rejects(installPack({ packsRoot, url: 'https://example.invalid/p.tar', sha256: 'a'.repeat(64), fetchImpl }), /Digest del pacchetto voce non corrispondente/);
  assert.deepEqual(fs.readdirSync(packsRoot), [], 'il file scaricato viene eliminato');
});

test('il controller libera la voce, impedisce operazioni sovrapposte e chiede il riavvio', async (t) => {
  const packsRoot = temp(t);
  let released = 0;
  let finish;
  const controller = createVoicePackController({
    packsRoot, catalog: { [QWEN3_PACK_ID]: { url: 'https://example.invalid/p.tar', sha256: 'c'.repeat(64) } },
    getHardware: () => ({ platform: 'win32', gpuMemoryBytes: 16 * 1024 ** 3 }), releaseVoice: () => { released += 1; },
    install: (options) => new Promise((resolve) => { finish = () => resolve({ id: QWEN3_PACK_ID, version: '1', bytes: 1, received: options.url }); }),
    remove: () => true
  });
  assert.equal(controller.status().available, true);
  const pending = controller.install();
  assert.equal(controller.status().busy, 'install');
  await assert.rejects(controller.install(), /già in corso/);
  assert.throws(() => controller.remove(), /già in corso/);
  finish();
  assert.equal((await pending).restartRequired, true);
  assert.equal(released, 1);
  assert.equal(controller.status().busy, null);
  const ineligible = createVoicePackController({ packsRoot, getHardware: () => ({ platform: 'win32', gpuMemoryBytes: 8 * 1024 ** 3 }), localArchive: 'x.tar' });
  await assert.rejects(ineligible.install(), /almeno 12 GB/);
  const unpublished = createVoicePackController({ packsRoot, getHardware: () => ({ platform: 'win32', gpuMemoryBytes: 16 * 1024 ** 3 }) });
  assert.equal(unpublished.status().available, false);
  await assert.rejects(unpublished.install(), /non è ancora pubblicato/);
});

test('con il pacchetto il worker GGUF usa il Python incluso e aggiunge le sue site-packages', () => {
  const service = new Qwen3GgufSpeechService({ runtimeDirectory: 'P', pythonExecutable: 'P/python/python.exe', sitePackages: 'P/site-packages', workerPath: 'P/worker.py' });
  const files = service.paths();
  assert.equal(files.python, 'P/python/python.exe');
  assert.equal(files.sitePackages, 'P/site-packages');
  const args = service.workerArgs(files);
  assert.deepEqual(args.slice(0, 3), ['-I', '-B', '-c']);
  assert.match(args[3], /site\.addsitedir\("P\/site-packages"\)/);
  assert.match(args[3], /runpy\.run_path\("P\/worker\.py",run_name='__main__'\)/);
  assert.deepEqual(new Qwen3GgufSpeechService({ runtimeDirectory: 'R', workerPath: 'R/w.py' }).workerArgs({ worker: 'R/w.py' }), ['-I', 'R/w.py']);
});
