/**
 * @module scripts/accessibility-qa
 * @description Audit accessibilità deterministico sulle superfici Electron reali.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const output = path.join(root, 'qa-artifacts', 'accessibility');
const availableViews = [
  'settings', 'settings-pets', 'history', 'conversation', 'command', 'command-policy'
];
const requestedViews = new Set((process.argv.find((argument) => argument.startsWith('--views='))?.slice(8) || '')
  .split(',').map((view) => view.trim()).filter(Boolean));
const views = requestedViews.size ? availableViews.filter((view) => requestedViews.has(view)) : availableViews;
if (requestedViews.size && views.length !== requestedViews.size) throw new Error('Una o più viste accessibilità richieste non esistono.');
fs.mkdirSync(output, { recursive: true });

for (const view of views) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-a11y-'));
  if (view === 'command-policy') {
    fs.writeFileSync(path.join(profile, 'workspace.json'), JSON.stringify({ path: root }, null, 2));
  }
  const reportPath = path.join(output, `${view}.json`);
  const result = spawnSync(electron, ['.', `--user-data-dir=${profile}`], {
    cwd: root,
    timeout: 35_000,
    windowsHide: true,
    env: {
      ...process.env,
      NEXUS_SMOKE_TEST: '1',
      NEXUS_SMOKE_VIEW: view,
      NEXUS_SMOKE_WIDTH: '1090',
      NEXUS_SMOKE_HEIGHT: '700',
      NEXUS_ACCESSIBILITY_REPORT_PATH: reportPath
    }
  });
  fs.rmSync(profile, { recursive: true, force: true });
  const report = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : null;
  if (result.status !== 0 || !report?.passed) {
    const detail = String(result.stderr || result.stdout || '').trim().slice(-1200);
    throw new Error(`Audit accessibilità ${view} non riuscito.${detail ? `\n${detail}` : ''}`);
  }
  process.stdout.write(`OK accessibilità ${view} · ${report.interactive} controlli verificati\n`);
}

process.stdout.write(`Audit accessibilità completato: ${views.length} superfici in ${output}\n`);
