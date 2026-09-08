/**
 * @module scripts/run-tests
 * @description Esegue la suite Node e rimuove soltanto i temporanei NexusNXS creati dalla stessa esecuzione.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const testsDirectory = path.join(root, 'tests');
const temporaryRoot = path.join(root, 'qa-artifacts', 'test-tmp');

// #region 01 — Confine temporaneo della singola suite

// Ogni processo figlio eredita una directory esclusiva. Il confronto prima/dopo
// nella TEMP globale non dimostra proprieta e coinvolgeva altre verifiche attive.
function createSuiteTemporaryDirectory() {
  fs.mkdirSync(temporaryRoot, { recursive: true });
  return fs.mkdtempSync(path.join(temporaryRoot, 'suite-'));
}

// #endregion

// #region 02 — Esecuzione deterministica

const testFiles = fs.readdirSync(testsDirectory)
  .filter((name) => name.endsWith('.test.js'))
  .sort();

if (testFiles.length === 0) {
  throw new Error('Nessun file di test trovato: la suite non può essere dichiarata valida.');
}

let result;
const suiteTemporary = createSuiteTemporaryDirectory();
try {
  // Node espande nativamente il glob. Passare tutti i percorsi assoluti
  // superava il limite della command line di Windows e avviava una suite vuota.
  process.stdout.write(`Suite Node: ${testFiles.length} file.\n`);
  result = spawnSync(process.execPath, ['--test', 'tests/*.test.js'], {
    cwd: root,
    env: { ...process.env, TEMP: suiteTemporary, TMP: suiteTemporary, TMPDIR: suiteTemporary },
    stdio: 'inherit',
    windowsHide: true
  });
} finally {
  try {
    if (path.dirname(path.resolve(suiteTemporary)) !== path.resolve(temporaryRoot)) throw new Error('Directory test fuori confine');
    fs.rmSync(suiteTemporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 80 });
    process.stdout.write('Directory temporanea esclusiva della suite rimossa.\n');
  } catch (error) {
    process.stderr.write(`Pulizia temporanei della suite fallita: ${error.message}\n`);
  }
}

if (result?.error) {
  process.stderr.write(`${result.error.stack || result.error.message}\n`);
  process.exitCode = 1;
} else {
  process.exitCode = Number.isInteger(result?.status) ? result.status : 1;
}

// #endregion
