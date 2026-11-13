/**
 * @module infrastructure/electron/core-service
 * @description Il server NexusNXS (Core headless) è un servizio di sistema indipendente dall'app desktop:
 * un'attività pianificata di Windows lo avvia al boot e lo riavvia se cade. Quando l'app desktop parte e il
 * Core non è attivo (riavvio in corso, crash), l'app NON deve prenderne il posto: chiudendola si fermerebbe
 * il servizio per tutti e il Core, al riavvio, troverebbe le porte occupate. Qui l'app risveglia l'attività.
 */
const { execFile } = require('node:child_process');

// #region 01 — Attività di sistema del server

const SERVER_TASKS = Object.freeze(['NexusNXS Server', 'Nexus AI Server']);

function run(file, args, { timeoutMs = 8_000 } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: timeoutMs }, (error, stdout) => resolve({ ok: !error, stdout: String(stdout || '') }));
  });
}

/**
 * Se su questo PC è installato il servizio server, lo avvia (idempotente: un'attività già in esecuzione
 * resta com'è) e restituisce il nome dell'attività; altrimenti null e l'app usa il comportamento autonomo.
 */
async function wakeServerCore({ platform = process.platform, exec = run, logger = null } = {}) {
  if (platform !== 'win32') return null;
  for (const name of SERVER_TASKS) {
    const query = await exec('schtasks.exe', ['/Query', '/TN', name, '/FO', 'CSV', '/NH']);
    if (!query.ok) continue;
    if (/Running|In esecuzione/i.test(query.stdout)) return name;
    const started = await exec('schtasks.exe', ['/Run', '/TN', name]);
    if (started.ok) {
      logger?.info?.('Server NexusNXS non attivo: riavviato tramite la sua attività di sistema.', { task: name });
      return name;
    }
    logger?.warn?.('Attività del server NexusNXS presente ma non avviabile.', { task: name });
    return null;
  }
  return null;
}

// #endregion
// #region 02 — Esportazioni

module.exports = { SERVER_TASKS, wakeServerCore };

// #endregion
