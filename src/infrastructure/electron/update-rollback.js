/**
 * @module infrastructure/electron/update-rollback
 * @description Rollback automatico di un aggiornamento che non riesce ad avviarsi. Ogni versione che arriva
 * sana (segnale "healthy" di update-health) conserva una copia verificata (SHA-512) del proprio installer
 * NSIS come punto di ripristino. Una versione appena installata resta "in prova": se si chiude male o va
 * in crash prima di diventare sana per `failureThreshold` volte, la versione viene bloccata e l'installer
 * del punto di ripristino viene rieseguito in silenzio. Nessun download e nessuna rete: solo file locali.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const RESTORE_FILE = 'NexusNXS-restore-point-Setup.exe';

// #region 01 — Stato e confronto versioni

function compareVersions(left, right) {
  const parse = (value) => String(value || '').split(/[-+]/)[0].split('.').map((part) => Number(part) || 0);
  const [a, b] = [parse(left), parse(right)];
  for (let index = 0; index < 3; index += 1) if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  return 0;
}

function readJson(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function writeJson(filePath, value) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600 });
    fs.renameSync(temporary, filePath);
  } catch {
    // Lo stato del rollback non deve mai bloccare l'avvio.
  }
}

function sha512File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    fs.createReadStream(filePath).on('error', reject).on('data', (chunk) => hash.update(chunk)).on('end', () => resolve(hash.digest('base64')));
  });
}

function sha512FileSync(filePath) {
  const hash = crypto.createHash('sha512');
  const descriptor = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let read;
    while ((read = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('base64');
}

// #endregion

// #region 02 — Prova, punto di ripristino e rollback

/**
 * @param {{ statePath: string, restoreDir: string, installerCopyPath: string, version: string,
 *   launchInstaller: (file: string) => void, quit: () => void, logger?: any, failureThreshold?: number, now?: () => number }} options
 */
function createUpdateRollback({ statePath, restoreDir, installerCopyPath, version, launchInstaller, quit, logger, failureThreshold = 2, now = Date.now }) {
  const active = Boolean(statePath && restoreDir && VERSION.test(String(version || '')));
  let state = active ? readJson(statePath) : {};
  let crashedThisBoot = false;
  let retaining = null;
  const save = () => { if (active) writeJson(statePath, state); };
  const trial = () => (state.trial && state.trial.version === version && !state.trial.done ? state.trial : null);
  const blocked = () => (Array.isArray(state.blocked) ? state.blocked.filter((item) => VERSION.test(item)) : []);

  /** Verifica il punto di ripristino e, se integro, reinstalla in silenzio la versione sana precedente. */
  const rollBack = (reason) => {
    const current = trial();
    if (!current) return { action: 'none' };
    state = { ...state, blocked: [...new Set([...blocked(), version])].slice(-20), trial: { ...current, done: true, outcome: 'failed', reason } };
    const restore = state.restorePoint;
    const file = restore?.file ? path.join(restoreDir, path.basename(restore.file)) : '';
    let verified = false;
    try {
      verified = Boolean(restore && VERSION.test(String(restore.version)) && compareVersions(restore.version, version) < 0
        && fs.existsSync(file) && fs.statSync(file).size === restore.size && sha512FileSync(file) === restore.sha512);
    } catch { verified = false; }
    if (!verified) {
      save();
      logger?.warn?.('Aggiornamento instabile ma punto di ripristino assente o alterato: rollback non eseguito.', { version, reason });
      return { action: 'unavailable', version };
    }
    state = { ...state, lastRollback: { from: version, to: restore.version, at: now(), reason } };
    save();
    logger?.warn?.('Aggiornamento instabile all’avvio: ripristino automatico della versione sana.', { from: version, to: restore.version, reason });
    try {
      launchInstaller(file);
      quit();
    } catch (error) {
      logger?.warn?.('Avvio del ripristino non riuscito.', { error });
      return { action: 'unavailable', version };
    }
    return { action: 'rollback', from: version, to: restore.version };
  };

  return {
    /** Da chiamare subito all'avvio: una prova ancora "in volo" dall'avvio precedente è un avvio fallito. */
    boot() {
      const current = trial();
      if (!current) return { action: 'none' };
      const failures = (Number(current.failures) || 0) + (current.inFlight ? 1 : 0);
      state = { ...state, trial: { ...current, failures, boots: (Number(current.boots) || 0) + 1, inFlight: true } };
      save();
      if (failures >= failureThreshold) return rollBack('startup');
      return { action: 'trial', version, failures };
    },
    /** Una nuova versione verificata è stata scaricata: dal suo primo avvio sarà in prova. */
    arm(nextVersion) {
      if (!active || !VERSION.test(String(nextVersion || '')) || compareVersions(nextVersion, version) <= 0) return false;
      state = { ...state, trial: { version: String(nextVersion), from: version, armedAt: now(), failures: 0, boots: 0, inFlight: false } };
      save();
      return true;
    },
    /** Crash di un processo dell'app prima che la versione in prova sia diventata sana. */
    recordCrash() {
      const current = trial();
      if (!current || crashedThisBoot) return { action: 'none' };
      crashedThisBoot = true;
      const failures = (Number(current.failures) || 0) + 1;
      // Il crash è già contato: all'avvio successivo questa sessione non conta una seconda volta.
      state = { ...state, trial: { ...current, failures, inFlight: false } };
      save();
      return failures >= failureThreshold ? rollBack('crash') : { action: 'trial', version, failures };
    },
    /** Chiusura pulita: un avvio interrotto dall'utente non è un fallimento. */
    cleanExit() {
      const current = trial();
      if (!current || !current.inFlight) return;
      state = { ...state, trial: { ...current, inFlight: false } };
      save();
    },
    /** La versione attuale è sana: chiude la prova e ne conserva l'installer come punto di ripristino. */
    async confirmHealthy() {
      if (!active) return false;
      const current = trial();
      if (current) { state = { ...state, trial: { ...current, done: true, inFlight: false, outcome: 'healthy' } }; save(); }
      if (state.restorePoint?.version === version) return true;
      if (retaining) return retaining;
      retaining = (async () => {
        try {
          if (!installerCopyPath || !fs.existsSync(installerCopyPath)) return false;
          await fs.promises.mkdir(restoreDir, { recursive: true });
          const temporary = path.join(restoreDir, `${RESTORE_FILE}.${process.pid}.tmp`);
          await fs.promises.copyFile(installerCopyPath, temporary);
          const sha512 = await sha512File(temporary);
          const size = (await fs.promises.stat(temporary)).size;
          await fs.promises.rename(temporary, path.join(restoreDir, RESTORE_FILE));
          state = { ...state, restorePoint: { version, file: RESTORE_FILE, sha512, size, at: now() } };
          save();
          return true;
        } catch (error) {
          logger?.debug?.('Punto di ripristino aggiornamento non salvato.', { error: error?.message });
          return false;
        } finally {
          retaining = null;
        }
      })();
      return retaining;
    },
    isBlocked: (candidate) => blocked().includes(String(candidate || '')),
    snapshot: () => JSON.parse(JSON.stringify(state))
  };
}

// #endregion

module.exports = { compareVersions, createUpdateRollback, RESTORE_FILE };
