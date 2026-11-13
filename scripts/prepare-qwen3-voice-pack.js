/**
 * @module scripts/prepare-qwen3-voice-pack
 * @description Builds the optional Qwen3-TTS GGUF 0.6B voice pack from the
 * local runtime (vendor/qwen3-tts-gguf): only the files used at runtime, a
 * CPython 3.14, a sha256 manifest and an uncompressed .tar (GGUF/ONNX do not
 * compress). The pack is a generated build: it goes to release/voice-packs and
 * is never committed.
 *
 *   node scripts/prepare-qwen3-voice-pack.js --python <CPython 3.14 dir> [--version 1] [--out release/voice-packs]
 */
// #region 01 — Selezione dei file

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { QWEN3_PACK_ID, buildManifest, sha256File, verifyPack } = require('../src/voice/voice-pack');

const root = path.resolve(__dirname, '..');
const argument = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const runtime = path.join(root, 'vendor', 'qwen3-tts-gguf');
const modelName = 'Qwen3-TTS-12Hz-0.6B-Base';
// Exactly the files TTSEngine and the worker open (engine.py, assets.py, qwen3-speech paths()).
const MODEL_FILES = ['qwen3_tts_talker.q5_k.gguf', 'qwen3_tts_predictor.q8_0.gguf', 'qwen3_tts_decoder.fp16.onnx',
  'qwen3_tts_codec_encoder.fp16.onnx', 'qwen3_tts_speaker_encoder.fp16.onnx', 'tokenizer.json'];
// Installation, export and download tools: never imported by inference.
const SITE_EXCLUDED = /^(pip|sympy|mpmath|huggingface_hub|hf_xet)([-_.].*)?$/i;
// llama.cpp tools that the inference library does not load.
const BIN_EXCLUDED = /^(llama-(server|cli|bench|batched-bench|perplexity|quantize|completion|fit-params)(-impl)?\.(dll|exe)|mtmd\.dll)$/i;
const PYTHON_EXCLUDED_DIRS = new Set(['Doc', 'include', 'libs', 'Tools', 'Scripts', 'tcl', 'test', 'tests', 'idlelib', 'tkinter', 'turtledemo', 'ensurepip', '__pycache__']);
const SKIP_FILE = /\.(pyc|pdb)$/i;

function copyTree(from, to, { skipDir = () => false, skipFile = () => false } = {}) {
  let bytes = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (entry.name === '__pycache__' || skipDir(entry.name, source)) continue;
      fs.mkdirSync(target, { recursive: true });
      bytes += copyTree(source, target, { skipDir, skipFile });
    } else if (entry.isFile() && !SKIP_FILE.test(entry.name) && !skipFile(entry.name, source)) {
      fs.mkdirSync(to, { recursive: true });
      fs.copyFileSync(source, target);
      bytes += fs.statSync(target).size;
    }
  }
  return bytes;
}

// #endregion
// #region 02 — Costruzione e archivio

function main() {
  const python = path.resolve(argument('python', ''));
  const version = argument('version', '1');
  const out = path.resolve(root, argument('out', path.join('release', 'voice-packs')));
  const probe = spawnSync(path.join(python, 'python.exe'), ['-I', '-c', 'import sys;print("%d.%d"%sys.version_info[:2])'], { encoding: 'utf8', windowsHide: true });
  if (probe.status !== 0 || probe.stdout.trim() !== '3.14') throw new Error('--python deve indicare una cartella CPython 3.14 (python.exe), come richiesto da qwen3_tts_gguf.');
  const model = path.join(runtime, 'models', modelName);
  for (const file of MODEL_FILES) if (!fs.existsSync(path.join(model, file))) throw new Error(`Manca ${file}: prepara prima vendor/qwen3-tts-gguf.`);

  const staging = path.join(out, `${QWEN3_PACK_ID}-v${version}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const sizes = {};
  sizes.python = copyTree(python, path.join(staging, 'python'), {
    skipDir: (name) => PYTHON_EXCLUDED_DIRS.has(name) || name === 'site-packages',
    skipFile: (name) => name === '__install__.json'
  });
  sizes.sitePackages = copyTree(path.join(runtime, '.venv', 'Lib', 'site-packages'), path.join(staging, 'site-packages'), {
    skipDir: (name) => SITE_EXCLUDED.test(name) || /^tests?$/.test(name),
    skipFile: (name) => SITE_EXCLUDED.test(name) || /^(distutils-precedence|_virtualenv)\.pth$/i.test(name) || name === '_virtualenv.py'
  });
  const pkg = path.join(runtime, 'src', 'qwen3_tts_gguf');
  fs.mkdirSync(path.join(staging, 'src', 'qwen3_tts_gguf'), { recursive: true });
  fs.copyFileSync(path.join(pkg, '__init__.py'), path.join(staging, 'src', 'qwen3_tts_gguf', '__init__.py'));
  fs.copyFileSync(path.join(runtime, 'src', 'LICENSE'), path.join(staging, 'src', 'LICENSE-qwen3-tts-gguf.txt'));
  sizes.library = copyTree(path.join(pkg, 'inference'), path.join(staging, 'src', 'qwen3_tts_gguf', 'inference'), {
    skipFile: (name, source) => source.includes(`${path.sep}bin${path.sep}`) && BIN_EXCLUDED.test(name)
  });
  sizes.model = 0;
  const modelOut = path.join(staging, 'models', modelName);
  fs.mkdirSync(modelOut, { recursive: true });
  for (const file of MODEL_FILES) { fs.copyFileSync(path.join(model, file), path.join(modelOut, file)); sizes.model += fs.statSync(path.join(modelOut, file)).size; }
  sizes.model += copyTree(path.join(model, 'embeddings'), path.join(modelOut, 'embeddings'));
  sizes.voices = copyTree(path.join(root, 'vendor', 'qwen3-tts', 'voices'), path.join(staging, 'voices'), { skipFile: (name) => !/^nexus-(male|female)-reference\.(wav|txt)$/.test(name) });
  fs.copyFileSync(path.join(root, 'src', 'voice', 'qwen3-gguf-worker.py'), path.join(staging, 'worker.py'));

  const manifest = buildManifest(staging, { version });
  fs.writeFileSync(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  verifyPack(staging, { deep: false });

  const archive = `${staging}.tar`;
  fs.rmSync(archive, { force: true });
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const packed = spawnSync(tar, ['-cf', archive, '-C', staging, '.'], { windowsHide: true, encoding: 'utf8' });
  if (packed.status !== 0) throw new Error(`Archivio non creato: ${packed.stderr || packed.error}`);
  const archiveSha256 = sha256File(archive);
  const mb = (bytes) => Math.round(bytes / 1024 / 1024);
  process.stdout.write(`${JSON.stringify({ id: QWEN3_PACK_ID, version, directory: path.relative(root, staging), archive: path.relative(root, archive),
    archiveBytes: fs.statSync(archive).size, archiveSha256, files: manifest.files.length,
    mb: Object.fromEntries(Object.entries(sizes).map(([key, value]) => [key, mb(value)])), totalMb: mb(manifest.bytes) }, null, 2)}\n`);
}

try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }

// #endregion
