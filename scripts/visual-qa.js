/**
 * @module scripts/visual-qa
 * @description Catture deterministiche delle superfici critiche su viewport differenti.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// #region Catalogo viewport e selezione

const root = path.resolve(__dirname, '..');
const electron = require('electron');
const output = path.join(root, 'qa-artifacts');
const cases = [
  ['settings', 720, 560],
  ['settings-ai', 900, 700],
  ['settings-pets', 1080, 760],
  ['settings-data', 900, 700],
  ['settings-connections', 900, 700],
  ['settings-shortcuts', 900, 700],
  ['remote-pairing', 900, 760],
  ['settings-select', 720, 640],
  ['models', 900, 700],
  ['permission', 900, 640],
  ['command-policy', 900, 560],
  ['command', 1090, 700],
  ['queued-text', 1090, 700],
  ['barge-in', 1090, 700],
  ['response', 1090, 700],
  ['conversation', 1090, 613],
  ['artifacts', 1280, 800],
  ['history', 1920, 1080],
  ['saturn', 2560, 1080],
  ['jarvis', 2560, 1440],
  ['neural', 3840, 2160]
];
const requestedViews = new Set((process.argv.find((argument) => argument.startsWith('--views='))?.slice(8) || '')
  .split(',').map((view) => view.trim()).filter(Boolean));
const selectedCases = requestedViews.size ? cases.filter(([view]) => requestedViews.has(view)) : cases;
if (requestedViews.size && selectedCases.length !== requestedViews.size) throw new Error('Una o più viste QA richieste non esistono.');
const requestedScales = (process.argv.find((argument) => argument.startsWith('--scales='))?.slice(9) || '100')
  .split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
if (!requestedScales.length || requestedScales.some((value) => value < 75 || value > 250)) {
  throw new Error('Le scale QA devono essere percentuali comprese tra 75 e 250.');
}

// #endregion
// #region Esecuzione e validazione PNG

fs.mkdirSync(output, { recursive: true });
for (const [view, width, height] of selectedCases) {
 for (const scale of requestedScales) {
  const scaleSuffix = scale === 100 && requestedScales.length === 1 ? '' : `-scale-${scale}`;
  const screenshot = path.join(output, `${view}-${width}x${height}${scaleSuffix}.png`);
  let result;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-visual-qa-'));
    if (view === 'command-policy') {
      fs.writeFileSync(path.join(profile, 'workspace.json'), JSON.stringify({ path: root }, null, 2));
    }
    if (view === 'remote-pairing') {
      const stateDirectory = path.join(profile, 'data');
      fs.mkdirSync(stateDirectory, { recursive: true });
      fs.writeFileSync(path.join(stateDirectory, 'remote-access.json'), JSON.stringify({
        schemaVersion: 2, enabled: true, allowLan: true, port: 33145,
        publicUrl: 'https://nexus-qa.example.ts.net', devices: []
      }));
    }
    result = spawnSync(electron, ['.', `--user-data-dir=${profile}`, `--force-device-scale-factor=${scale / 100}`], {
      cwd: root,
      // Alcune viste interrogano il provider prima di aprirsi. Su cold start il
      // timeout del provider può avvicinarsi a 20 s anche quando la cattura è già
      // stata prodotta; lasciamo margine al teardown verificato di Electron.
      timeout: 35_000,
      windowsHide: true,
      env: {
        ...process.env,
        NEXUS_SMOKE_TEST: '1', NEXUS_SMOKE_VIEW: view,
        NEXUS_SMOKE_WIDTH: String(width), NEXUS_SMOKE_HEIGHT: String(height),
        NEXUS_SCREENSHOT_PATH: screenshot
      }
    });
    fs.rmSync(profile, { recursive: true, force: true });
    if (result.status === 0 && fs.existsSync(screenshot)) break;
    if (attempt === 2) break;
    fs.rmSync(screenshot, { force: true });
    process.stdout.write(`RETRY ${view} · scala ${scale}% con profilo Chromium pulito\n`);
  }
  if (result.status !== 0 || !fs.existsSync(screenshot)) {
    const detail = String(result.stderr || result.stdout || '').trim().slice(-1200);
    throw new Error(`Cattura ${view} non riuscita.${detail ? `\n${detail}` : ''}`);
  }
  // Un primo tentativo Chromium può lasciare una diagnostica accanto alla
  // cattura. Se il retry pulito è riuscito, quel file non descrive più l'esito
  // del caso e non deve contaminare gli artefatti consegnati.
  fs.rmSync(`${screenshot}.error.json`, { force: true });
  const png = fs.readFileSync(screenshot);
  if (png.length < 10_000 || png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`PNG ${view} non valido.`);
  const actualWidth = png.readUInt32BE(16);
  const actualHeight = png.readUInt32BE(20);
  // Windows limita una finestra all'area di lavoro del monitor corrente
  // (es. 1440 diventa 1392 con la taskbar). È un clamp del sistema, non una
  // regressione responsive: la cattura deve comunque restare ampia e valida.
  const expectedWidth = width * scale / 100;
  const expectedHeight = height * scale / 100;
  const dimensionTolerance = Math.max(4, Math.ceil(scale / 25));
  if (actualWidth < Math.min(720, expectedWidth) - dimensionTolerance
    || actualHeight < Math.min(560, expectedHeight) - dimensionTolerance
    || actualWidth > expectedWidth + dimensionTolerance
    || actualHeight > expectedHeight + dimensionTolerance) {
    throw new Error(`Viewport ${view} errata: ${actualWidth}x${actualHeight}.`);
  }
  process.stdout.write(`OK ${view} richiesto ${width}x${height} · scala ${scale}% · acquisito ${actualWidth}x${actualHeight}\n`);
 }
}
process.stdout.write(`QA visivo completato: ${selectedCases.length} superfici × ${requestedScales.length} scale in ${output}\n`);

// #endregion
