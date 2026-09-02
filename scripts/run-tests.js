/**
 * @module scripts/run-tests
 * @description Esegue la suite Node e rimuove soltanto i temporanei NexusNXS creati dalla stessa esecuzione.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsDirectory = path.join(root, 'tests');
const temporaryRoot = path.resolve(os.tmpdir());

// #region 01 — Confine temporaneo della singola suite

function nexusTemporaryDirectories() {
  try {
    return fs.readdirSync(temporaryRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^nexus(?:nxs)?-/iu.test(entry.name))
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

function removeCreatedTemporaryDirectories(previousNames) {
  const created = nexusTemporaryDirectories().filter((name) => !previousNames.has(name));
  let removed = 0;
  for (const name of created) {
    const candidate = path.resolve(temporaryRoot, name);
    if (path.dirname(candidate) !== temporaryRoot) continue;
    try {
      fs.rmSync(candidate, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
      removed += 1;
    } catch (error) {
      process.stderr.write(`Temporaneo di test non rimosso: ${name} (${error.message})\n`);
    }
  }
  return removed;
}

// #endregion

// #region 02 — Esecuzione deterministica

const before = new Set(nexusTemporaryDirectories());
const testFiles = fs.readdirSync(testsDirectory)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  throw new Error('Nessun file di test trovato: la suite non può essere dichiarata valida.');
}

let result;
try {
  // Node espande nativamente il glob. Passare tutti i percorsi assoluti
  // superava il limite della command line di Windows e avviava una suite vuota.
  process.stdout.write(`Suite Node: ${testFiles.length} file.\n`);
  result = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true
  });
} finally {
  const removed = removeCreatedTemporaryDirectories(before);
  if (removed > 0) process.stdout.write(`Temporanei della suite rimossi: ${removed}\n`);
}

if (result?.error) {
  process.stderr.write(`${result.error.stack || result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = Number.isInteger(result?.status) ? result.status : 1;
}

// #endregion
