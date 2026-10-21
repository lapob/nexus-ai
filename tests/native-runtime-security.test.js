const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { inspectPeImports, inspectNativeRuntime } = require('../src/ai/native-runtime-inventory');
const { createNativeRuntimeSecurityCheck, assertNativeRuntimeSecure } = require('../src/ai/native-runtime-security');

function pe(normal = [], delayed = []) {
  const bytes = Buffer.alloc(4096), coff = 0x84, optional = 0x98;
  bytes.writeUInt16LE(0x5a4d, 0); bytes.writeUInt32LE(0x80, 0x3c); bytes.writeUInt32LE(0x4550, 0x80);
  bytes.writeUInt16LE(0x8664, coff); bytes.writeUInt16LE(1, coff + 2); bytes.writeUInt16LE(240, coff + 16);
  bytes.writeUInt16LE(0x20b, optional); bytes.writeUInt32LE(512, optional + 60); bytes.writeUInt32LE(16, optional + 108);
  const section = optional + 240;
  bytes.writeUInt32LE(0x1000, section + 12); bytes.writeUInt32LE(3584, section + 16); bytes.writeUInt32LE(512, section + 20);
  let cursor = 1800;
  for (const [directory, offset, size, nameOffset, names] of [[1, 512, 20, 12, normal], [13, 1024, 32, 4, delayed]]) {
    if (!names.length) continue;
    bytes.writeUInt32LE(0x1000 + offset - 512, optional + 112 + directory * 8);
    bytes.writeUInt32LE((names.length + 1) * size, optional + 116 + directory * 8);
    for (let index = 0; index < names.length; index += 1) {
      if (directory === 13) bytes.writeUInt32LE(1, offset + index * size);
      bytes.writeUInt32LE(0x1000 + cursor - 512, offset + index * size + nameOffset);
      cursor += bytes.write(names[index] + '\0', cursor, 'ascii');
    }
  }
  return bytes;
}

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-native-security-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'server.exe'), modelPath = path.join(root, 'model.gguf');
  fs.writeFileSync(executable, pe(['library.dll', 'KERNEL32.dll'], ['USER32.dll']));
  fs.writeFileSync(path.join(root, 'library.dll'), pe(['KERNEL32.dll']));
  fs.writeFileSync(modelPath, 'synthetic model');
  const inventory = await inspectNativeRuntime(executable);
  const now = Date.parse('2026-10-21T12:00:00Z');
  const release = { inventorySha256: inventory.inventorySha256, executable: 'server.exe', usages: ['evaluation', 'distribution'],
    archiveSha256: 'a'.repeat(64), sourceCommit: 'b'.repeat(40), externalImports: inventory.externalImports,
    review: { status: 'approved', reviewedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 86400000).toISOString(),
      coverage: 'files-embedded-dynamic-host', blockingFindings: [],
      components: [{ name: 'synthetic fixture', version: '1', evidenceSha256: 'c'.repeat(64) }] } };
  const model = { alias: 'fixture', usages: ['evaluation', 'distribution'], bytes: 15,
    sha256: crypto.createHash('sha256').update('synthetic model').digest('hex') };
  const options = { usage: 'distribution', host: '127.0.0.1', modelPath, model: 'fixture' };
  const hostDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-native-host-'));
  t.after(() => fs.rmSync(hostDirectory, { recursive: true, force: true }));
  release.hostFiles = inventory.externalImports.map(name => {
    const bytes = Buffer.from('synthetic host ' + name); fs.writeFileSync(path.join(hostDirectory, name), bytes);
    return { path: name, bytes: bytes.length, imports: [name], sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  });
  const check = (releases = [release], models = [model]) => createNativeRuntimeSecurityCheck({ releases, models, platform: 'win32', hostDirectory, clock: () => now });
  return { root, executable, modelPath, hostDirectory, inventory, now, release, model, options, check };
}

test('PE legge import normali e ritardati distinti, senza caricare il codice', () => {
  assert.deepEqual(inspectPeImports(pe(['b.dll', 'A.dll', 'b.dll'], ['c.dll'])), {
    architecture: 'x64', imports: ['a.dll', 'b.dll'], delayImports: ['c.dll'] });
  assert.deepEqual(inspectPeImports(pe()).imports, []);
});

test('PE rifiuta troncamenti, architetture, tabelle fuori sezione e nomi con percorsi', () => {
  const corruptions = [b => b.subarray(0, 200), b => { b.writeUInt16LE(0x14c, 0x84); return b; },
    b => { b.writeUInt32LE(0xfffffff0, 0x98 + 120); return b; },
    b => { b.writeUInt32LE(0xfffffff0, 512 + 12); return b; },
    b => { b.writeUInt32LE(20, 0x98 + 124); return b; },
    b => { b.writeUInt32LE(0, 1024); return b; }];
  for (const corrupt of corruptions) assert.throws(() => inspectPeImports(corrupt(pe(['ok.dll'], ['delay.dll']))));
  for (const name of ['../evil.dll', 'C:\\evil.dll', 'bad name.dll', 'not-an-import.exe']) {
    assert.throws(() => inspectPeImports(pe([name])));
  }
});

test('inventario include ogni DLL, anche backend non importati direttamente, e separa import esterni', async t => {
  const f = await fixture(t);
  fs.writeFileSync(path.join(f.root, 'backend.dll'), pe(['vulkan-1.dll']));
  const inventory = await inspectNativeRuntime(f.executable);
  assert.equal(inventory.files.length, 3);
  assert.deepEqual(inventory.externalImports, ['kernel32.dll', 'user32.dll', 'vulkan-1.dll']);
  assert.notEqual(inventory.inventorySha256, f.inventory.inventorySha256);
  assert.equal(JSON.stringify(inventory).includes(f.root), false);
  assert.equal((await inspectNativeRuntime(f.executable)).inventorySha256, inventory.inventorySha256);
});

test('gate predefinito non ammette un inventario locale, né report dichiarati sicuri', async t => {
  const f = await fixture(t);
  await assert.rejects(assertNativeRuntimeSecure(f.executable, f.options));
  await assert.rejects(f.check([])(f.executable, f.options), { code: 'NATIVE_RELEASE_NOT_REVIEWED' });
  const verdict = await f.check()(f.executable, f.options);
  assert.equal(verdict.admitted, true); assert.equal(verdict.usage, 'distribution');
  assert.equal(verdict.executablePath, fs.realpathSync(f.executable));
  assert.equal(verdict.modelPath, fs.realpathSync(f.modelPath));
});

test('gate rifiuta DLL aggiunte, mancanti o alterate e modello alterato', async t => {
  for (const mutation of ['extra', 'missing', 'changed', 'model']) {
    const f = await fixture(t), checker = f.check();
    if (mutation === 'extra') fs.writeFileSync(path.join(f.root, 'extra.dll'), pe());
    if (mutation === 'missing') fs.unlinkSync(path.join(f.root, 'library.dll'));
    if (mutation === 'changed') { const bytes = pe(); bytes[3000] = 1; fs.writeFileSync(path.join(f.root, 'library.dll'), bytes); }
    if (mutation === 'model') fs.writeFileSync(f.modelPath, 'modified model!');
    await assert.rejects(checker(f.executable, f.options));
  }
});

test('gate non confonde firma/integrità con revisione completa, fresca e priva di blocchi', async t => {
  const f = await fixture(t);
  const changes = [r => { delete r.sourceCommit; }, r => { r.review.status = 'pending'; },
    r => { r.review.coverage = 'grype-zero-matches'; }, r => { r.review.components = []; },
    r => { r.review.blockingFindings = ['CVE-fixture']; }, r => { r.externalImports = []; },
    r => { r.review.expiresAt = new Date(f.now).toISOString(); },
    r => { r.review.reviewedAt = new Date(f.now + 1).toISOString(); },
    r => { r.review.expiresAt = new Date(f.now + 31 * 86400000).toISOString(); },
    r => { r.review.components[0].evidenceSha256 = 'unverified'; }];
  for (const change of changes) { const release = structuredClone(f.release); change(release); await assert.rejects(f.check([release])(f.executable, f.options)); }
});

test('policy copiata, evaluation non promuovibile, scope e cancellazione vincolanti', async t => {
  const f = await fixture(t), checker = f.check();
  f.release.review.status = 'pending'; assert.equal((await checker(f.executable, f.options)).admitted, true);
  const evaluation = structuredClone(f.release); evaluation.review.status = 'approved'; evaluation.usages = ['evaluation'];
  await assert.rejects(f.check([evaluation])(f.executable, f.options), { code: 'NATIVE_RELEASE_NOT_REVIEWED' });
  for (const values of [{ host: 'localhost' }, { usage: 'development' }, { model: 'other' }, { executablePath: 'relative' }]) {
    await assert.rejects(checker(values.executablePath || f.executable, { ...f.options, ...values }));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(checker(f.executable, { ...f.options, signal: controller.signal }), { name: 'AbortError' });
});

test('dipendenze host devono essere coperte e mantenere hash, dimensione e percorso revisionati', async t => {
  const f = await fixture(t);
  for (const mutate of [r => { delete r.hostFiles; }, r => { r.hostFiles[0].path = '../outside.dll'; },
    r => { r.hostFiles[0].imports = []; }, r => { r.hostFiles[0].sha256 = 'd'.repeat(64); }]) {
    const release = structuredClone(f.release); mutate(release);
    await assert.rejects(f.check([release])(f.executable, f.options));
  }
  const checker = f.check(); fs.writeFileSync(path.join(f.hostDirectory, 'kernel32.dll'), 'changed');
  await assert.rejects(checker(f.executable, f.options), { code: 'NATIVE_HOST_INTEGRITY_FAILED' });
});

test('inventario rifiuta manifest locali, limiti e link invece di seguirli', async t => {
  const f = await fixture(t);
  await assert.rejects(inspectNativeRuntime(f.executable, { maxFileBytes: 1024 }));
  await assert.rejects(inspectNativeRuntime('relative.exe'));
  fs.mkdirSync(path.join(f.root, 'server.exe.local'));
  await assert.rejects(inspectNativeRuntime(f.executable), /loader/);
  fs.rmdirSync(path.join(f.root, 'server.exe.local'));
  if (process.platform !== 'win32') {
    fs.symlinkSync(f.executable, path.join(f.root, 'link.dll'));
    await assert.rejects(inspectNativeRuntime(f.executable), /collegamento/);
  }
});
