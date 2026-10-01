const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { aggregateResults, validatedAudioPath, wordErrorRate } = require('../scripts/evaluate-local-stt');
const { sttGateFailures, validateThresholds } = require('../scripts/evaluate-local-stt');

test('calcola una Word Error Rate ripetibile e insensibile agli accenti', () => {
  assert.equal(wordErrorRate('Perché NexusNXS è locale', 'perche nexusnxs e locale'), 0);
  assert.equal(wordErrorRate('uno due tre', 'uno quattro tre'), 1 / 3);
});

test('il dataset STT accetta soltanto WAV confinati e lingue supportate', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stt-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifest = path.join(root, 'dataset.json');
  const wav = path.join(root, 'voce.wav');
  fs.writeFileSync(wav, Buffer.alloc(44));
  assert.equal(validatedAudioPath(manifest, { file: 'voce.wav', text: 'Ciao NexusNXS', language: 'it' }, 0).audioPath, wav);
  assert.throws(() => validatedAudioPath(manifest, { file: '../voce.wav', text: 'Ciao', language: 'it' }, 0), /fuori dal dataset/i);
  assert.equal(validatedAudioPath(manifest, { file: 'voce.wav', text: 'こんにちは', language: 'ja' }, 0).language, 'ja');
  assert.equal(validatedAudioPath(manifest, { file: 'voce.wav', text: 'مرحبا', language: 'ara' }, 0).language, 'ara');
  assert.throws(() => validatedAudioPath(manifest, { file: 'voce.wav', text: 'Ciao', language: 'invalid' }, 0), /lingua/i);
  assert.equal(validatedAudioPath(manifest, { file: 'voce.wav', text: '', kind: 'noise', language: 'it', device: 'USB Mic' }, 0).kind, 'noise');
});

test('il gate STT separa accuratezza, latenza e falsi richiami per ambiente', () => {
  const report = aggregateResults([
    { kind: 'speech', language: 'it', device: 'usb', environment: 'quiet', wer: 0.1, latencyMs: 300, falseActivation: false },
    { kind: 'speech', language: 'it', device: 'usb', environment: 'noise', wer: 0.2, latencyMs: 500, falseActivation: false },
    { kind: 'noise', language: 'it', device: 'usb', environment: 'noise', wer: 0, latencyMs: 400, falseActivation: true }
  ]);
  assert.equal(report.accuracy, 0.85);
  assert.equal(report.falseActivationRate, 1);
  assert.equal(report.latencyP95Ms, 500);
  assert.equal(report.devices.usb.cases, 3);
});

test('il gate non lascia che molte frasi corrette mascherino una lingua insufficiente', () => {
  const report = aggregateResults([
    ...Array.from({ length: 30 }, () => ({ kind: 'speech', language: 'it', device: 'usb', environment: 'quiet', wer: 0, latencyMs: 10 })),
    ...Array.from({ length: 3 }, () => ({ kind: 'speech', language: 'en', device: 'usb', environment: 'quiet', wer: 1, latencyMs: 10 })),
    { kind: 'noise', language: 'it', device: 'usb', environment: 'quiet', latencyMs: 10, falseActivation: false }
  ]);
  assert.ok(report.accuracy > 0.85);
  assert.ok(sttGateFailures(report, { minimumAccuracy: 85, maximumFalsePositive: 5 }).includes('accuracy:en'));
});

test('il gate distingue un corpus senza rumore e rifiuta soglie NaN o fuori scala', () => {
  const report = aggregateResults([{ kind: 'speech', language: 'it', device: 'usb', environment: 'quiet', wer: 0, latencyMs: 10 }]);
  assert.equal(report.falseActivationRate, null);
  assert.ok(sttGateFailures(report, { minimumAccuracy: 85, maximumFalsePositive: 5 }).includes('noise-coverage'));
  for (const value of [NaN, Infinity, -1, 101]) {
    assert.throws(() => validateThresholds({ minimumAccuracy: 85, maximumFalsePositive: value, minimumLanguageCases: 3 }));
  }
});

test('un collegamento WAV esterno al corpus non viene trascritto', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stt-link-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const dataset = path.join(root, 'dataset'); fs.mkdirSync(dataset);
  const outside = path.join(root, 'private'); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'voice.wav'), Buffer.alloc(44));
  try { fs.symlinkSync(outside, path.join(dataset, 'linked'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES'].includes(error.code)) return t.skip('Creazione symlink non autorizzata dal sistema'); throw error; }
  assert.throws(() => validatedAudioPath(path.join(dataset, 'dataset.json'), { file: 'linked/voice.wav', text: 'ciao Nexus', language: 'it' }, 0), /fuori dal dataset/);
});
