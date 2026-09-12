/** @module scripts/verify-packaged-presence
 * Exercises real ASAR child launches; development smoke cannot catch an ASAR cwd.
 */
const fs = require('node:fs');
const path = require('node:path');
const { launchInteractiveDesktop } = require('../src/infrastructure/electron/desktop-launcher');
const { readLock, isProcessAlive, requestProcessShutdown } = require('../src/infrastructure/electron/process-lock');
const { sanitizeLogValue } = require('../src/services/logger');
const root = path.resolve(__dirname, '..');
const executable = process.env.NEXUS_PACKAGED_EXECUTABLE || path.join(root, 'release', 'win-unpacked', 'NexusNXS.exe');
const parent = path.join(root, 'qa-artifacts');
const ownedProfile = require('./qa-profile').createQaProfile(parent, 'packaged-presence-');
const profile = ownedProfile.path;
const ui = path.join(profile, 'desktop-ui.lock');
const presence = path.join(profile, 'system-presence.lock');
const active = file => { const lock = readLock(file); return lock && isProcessAlive(lock.pid); };
// #region Diagnostica del profilo isolato

const startedAt = Date.now();
const milestones = [];
let verificationFailed = false;
const redactDiagnostic = value => String(sanitizeLogValue(String(value || '')))
  .replace(/[A-Za-z]:[\\/][^"\r\n]*/g, '[LOCAL_PATH]')
  .replace(/\\\\[^\s"\r\n]+/g, '[LOCAL_PATH]');
function saveDiagnostics(error) {
  const logs = {};
  for (const name of ['presence.log', 'nexus.log']) {
    const file = path.join(profile, 'logs', name);
    if (!fs.existsSync(file)) { logs[name] = []; continue; }
    logs[name] = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(-60).flatMap(line => {
      try {
        const record = JSON.parse(line);
        return [{ timestamp: record.timestamp, level: record.level,
          scope: redactDiagnostic(record.scope), message: redactDiagnostic(record.message),
          ...(record.error ? { error: { name: redactDiagnostic(record.error.name),
            code: redactDiagnostic(record.error.code), message: redactDiagnostic(record.error.message) } } : {}) }];
      } catch { return [{ unreadableRecord: true }]; }
    });
  }
  // Only the isolated QA profile is inspected; credentials and log contexts
  // are deliberately excluded from the retained startup evidence.
  const report = JSON.stringify({
    passed: !error, elapsedMs: Date.now() - startedAt,
    error: error ? redactDiagnostic(error.message) : null, milestones,
    processes: { uiRunning: Boolean(active(ui)), presenceRunning: Boolean(active(presence)) }, logs
  }, null, 2);
  fs.writeFileSync(path.join(parent, 'packaged-presence-diagnostics.json'), report);
  if (error) fs.writeFileSync(path.join(parent, `packaged-presence-failure-${Date.now()}.json`), report);
}
async function until(predicate, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (predicate()) { milestones.push({ check: label, elapsedMs: Date.now() - startedAt }); return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(label);
}
// #endregion
// #region Avvio, chiusura e pulizia del pacchetto

(async () => {
  try {
    const options = { executable, defaultApp: false, appRoot: path.join(path.dirname(executable), 'resources', 'app.asar'),
      env: { ...process.env, NEXUS_USER_DATA_ROOT: profile, NEXUS_SHARED_DATA_ROOT: profile, NEXUS_MANAGED_OLLAMA: '0', NEXUS_SERVICE_URL: 'https://ai.nexusnxs.com' } };
    await launchInteractiveDesktop(options);
    await until(() => active(ui) && active(presence), 'Packaged UI did not launch Presence');
    const log = path.join(profile, 'logs', 'presence.log');
    await until(() => fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('Presenza NexusNXS avviata.'), 'Presence failed before tray initialization');
    requestProcessShutdown(ui);
    await until(() => !active(ui), 'Packaged UI did not close');
    if (!active(presence)) throw new Error('Presence closed with UI');
    await launchInteractiveDesktop(options);
    await until(() => active(ui), 'UI did not reopen from packaged launcher');
  } catch (error) {
    verificationFailed = true;
    try { saveDiagnostics(error); } catch (diagnosticError) {
      console.error(`QA diagnostics unavailable: ${redactDiagnostic(diagnosticError.message)}`);
    }
    throw error;
  } finally {
    try {
      requestProcessShutdown(ui);
      // A reopening UI may still be ensuring its Presence child exists. Close
      // the parent first so teardown cannot race that child launch.
      await until(() => !active(ui), 'QA UI did not stop');
      requestProcessShutdown(presence);
      await until(() => !active(ui) && !active(presence), 'QA processes did not stop');
      if (!verificationFailed) saveDiagnostics();
      ownedProfile.dispose();
    } catch (error) {
      try { saveDiagnostics(error); } catch (diagnosticError) {
        console.error(`QA diagnostics unavailable: ${redactDiagnostic(diagnosticError.message)}`);
      }
      throw error;
    }
  }
  console.log('PASS packaged ASAR: UI, Presence, tray initialization, UI close/reopen, persistent Presence and clean shutdown.');
})().catch(error => { console.error(error.message); process.exitCode = 1; });

// #endregion
