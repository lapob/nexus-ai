/**
 * @module scripts/prepare-development
 * @description Preflight idempotente per npm start e npm run dev.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const modeArgument = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArgument?.slice('--mode='.length) === 'dev' ? 'dev' : 'start';
const npmCli = [
  process.env.npm_execpath,
  path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
].find((candidate) => candidate && fs.existsSync(candidate));

// #region 01 — Prerequisiti e comandi

function message(text) {
  process.stdout.write(`[NEXUSNXS] ${text}\n`);
}

function runNpm(script, args = []) {
  if (!npmCli) throw new Error('CLI npm non disponibile. Reinstalla Node.js con npm incluso.');
  const result = spawnSync(process.execPath, [npmCli, 'run', script, ...args], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Il comando npm run ${script} non è riuscito.`);
}

function requireFile(relativePath, recovery) {
  if (fs.existsSync(path.join(root, relativePath))) return;
  throw new Error(`${relativePath} non è disponibile. ${recovery}`);
}

function validateConfiguration() {
  const configRoot = path.join(root, 'config');
  for (const entry of fs.readdirSync(configRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    JSON.parse(fs.readFileSync(path.join(configRoot, entry.name), 'utf8'));
  }
}

// #endregion
// #region 02 — Build incrementale

function newestModification(target) {
  if (!fs.existsSync(target)) return 0;
  const stat = fs.statSync(target);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const child = path.join(target, entry.name);
    newest = Math.max(newest, newestModification(child));
  }
  return newest;
}

function rendererNeedsBuild() {
  const output = path.join(root, 'renderer-dist', 'index.html');
  if (!fs.existsSync(output)) return true;
  const outputTime = fs.statSync(output).mtimeMs;
  const inputs = [
    path.join(root, 'src', 'renderer'),
    path.join(root, 'vite.config.ts'),
    path.join(root, 'package.json'),
    path.join(root, 'package-lock.json')
  ];
  return inputs.some((input) => newestModification(input) > outputTime);
}

function ensureManagedRuntime() {
  const executable = path.join(root, 'vendor', 'ollama', 'windows-x64', 'ollama.exe');
  if (process.platform !== 'win32' || fs.existsSync(executable)) return;
  message('Runtime AI locale mancante: preparo la copia ufficiale necessaria...');
  runNpm('prepare:ollama');
  requireFile(path.relative(root, executable), 'Esegui npm run prepare:ollama e riprova.');
}

// #endregion
// #region 03 — Orchestrazione

function main() {
  requireFile('package-lock.json', 'Esegui npm install nella cartella del progetto.');
  requireFile(path.join('node_modules', 'electron', 'cli.js'), 'Esegui npm install nella cartella del progetto.');
  requireFile(path.join('node_modules', 'vite', 'bin', 'vite.js'), 'Esegui npm install nella cartella del progetto.');
  validateConfiguration();
  runNpm('knowledge:normalize');
  ensureManagedRuntime();
  // Lo stesso rilevamento usato dal setup viene eseguito anche dai due comandi
  // npm: segnala profilo, libreria e modelli richiesti senza riscaricare pesi
  // già presenti né lasciare processi AI orfani prima di Electron.
  const aiCheck = spawnSync(process.execPath, [path.join(__dirname, 'ensure-ollama-runtime.js'), '--check-only'], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true,
    env: process.env
  });
  if (aiCheck.status !== 0) throw new Error('Diagnostica adattiva AI non riuscita.');

  const buildRequired = mode === 'dev' || rendererNeedsBuild();
  if (buildRequired) {
    message(mode === 'dev' ? 'Compilo il renderer di sviluppo...' : 'Renderer assente o non aggiornato: lo ricompilo...');
    runNpm('build:renderer');
  } else {
    message('Renderer già aggiornato.');
  }
  requireFile(path.join('renderer-dist', 'index.html'), 'Esegui npm run build.');
  message(`Preflight ${mode} completato.`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[NEXUSNXS] Preparazione fallita: ${error.message}\n`);
  process.exitCode = 1;
}

// #endregion
