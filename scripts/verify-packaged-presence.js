/** @module scripts/verify-packaged-presence
 * Exercises real ASAR child launches; development smoke cannot catch an ASAR cwd.
 */
const fs = require('node:fs');
const path = require('node:path');
const { launchInteractiveDesktop } = require('../src/infrastructure/electron/desktop-launcher');
const { readLock, isProcessAlive, requestProcessShutdown } = require('../src/infrastructure/electron/process-lock');
const root = path.resolve(__dirname, '..');
const executable = process.env.NEXUS_PACKAGED_EXECUTABLE || path.join(root, 'release', 'win-unpacked', 'NexusNXS.exe');
const parent = path.join(root, 'qa-artifacts');
const profile = fs.mkdtempSync(path.join(parent, 'packaged-presence-'));
const ui = path.join(profile, 'desktop-ui.lock');
const presence = path.join(profile, 'system-presence.lock');
const active = file => { const lock = readLock(file); return lock && isProcessAlive(lock.pid); };
async function until(predicate, label) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(label);
}
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
    console.log('PASS packaged ASAR: UI, Presence, tray initialization, UI close/reopen and persistent Presence.');
  } finally {
    requestProcessShutdown(ui);
    requestProcessShutdown(presence);
    await until(() => !active(ui) && !active(presence), 'QA processes did not stop');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
