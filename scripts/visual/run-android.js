/**
 * @module scripts/visual/run-android
 * @description Regressione visiva di NexusNXS Control via adb: catture `screencap` confrontate con le baseline
 * approvate, rapporto HTML in qa-artifacts/visual-runs/<suite>.
 *  - Emulatore (predefinito, suite `android`): demo mode della system UI, scale di animazione a 0, profili verticale,
 *    font 1.3 e orizzontale. Ogni impostazione toccata è salvata prima e ripristinata sempre. Avviare l'emulatore
 *    con scripts/start-android-emulator.ps1 (swiftshader: niente VRAM sottratta al modello) e chiuderlo a fine prova.
 *  - Telefono reale (`--phone`, suite `android-phone`): SOLO lettura. Nessuna impostazione, niente demo mode né
 *    force-stop, nessun tocco: porta Control in primo piano, cattura, torna alla home se prima c'era il launcher.
 *    Procede solo se in primo piano ci sono già Control o il launcher e il telefono è sbloccato.
 * In entrambi i casi la barra di stato e i testi con cifre (orari, percentuali, contatori live) sono coperti in modo
 * identico in catture e baseline: si confronta il layout, non i valori del momento.
 * Uso: npm run qa:visual:android [-- --update] [--phone] [--serial=<seriale>] [--require]
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createSuite } = require('./lib/baselines');
const { decode, encode } = require('./lib/png');

const root = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const option = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const update = args.includes('--update');
const phone = args.includes('--phone');
const PACKAGE = 'local.nexus.console';
const ACTIVITY = `${PACKAGE}/.NativeMainActivity`;
const PROFILES = phone ? [{ id: 'portrait' }] : [{ id: 'portrait' }, { id: 'font-130', font: '1.3' }, { id: 'landscape', rotation: '1' }];
// Su 1080×2424 un solo controllo spostato cambia migliaia di pixel; il rumore del rasterizzatore resta sotto i 1500.
const TOLERANCE = { threshold: 0.1, maxDiffRatio: 0.002, maxDiffPixels: 1500 };
const STATUS_BAR_DP = 56; // include le fotocamere a ritaglio

// #region 01 — adb e dispositivo

function adbPath() {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [process.env.NEXUS_ADB, path.resolve(root, '..', '.toolchains', 'android-sdk', 'platform-tools', exe),
    ...[process.env.NEXUS_ANDROID_SDK, process.env.ANDROID_SDK_ROOT, process.env.ANDROID_HOME].filter(Boolean).map((sdk) => path.join(sdk, 'platform-tools', exe))];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function makeAdb(adb, serial) {
  const run = (argv, { binary = false, allowFail = false } = {}) => {
    const result = spawnSync(adb, serial ? ['-s', serial, ...argv] : argv, { encoding: binary ? 'buffer' : 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 60_000 });
    if ((result.status !== 0 || result.error) && !allowFail) throw new Error(`adb ${argv.join(' ')}: ${result.error?.message || String(result.stderr).trim()}`);
    return binary ? result.stdout : String(result.stdout || '').trim();
  };
  return { run, shell: (command, options) => run(['shell', command], options) };
}

const isEmulator = (serial) => /^emulator-\d+$/.test(serial);

/** Emulatore per la suite deterministica; telefono reale solo con --phone (e mai con impostazioni modificate). */
function pickDevice(adb, requested) {
  const devices = makeAdb(adb).run(['devices']).split(/\r?\n/).slice(1).map((line) => line.split('\t')).filter(([, state]) => state === 'device').map(([serial]) => serial);
  if (requested && !phone && !isEmulator(requested)) throw new Error(`${requested} non è un emulatore: per un telefono reale usare --phone (sola lettura).`);
  if (requested) return devices.find((serial) => serial === requested) || null;
  return devices.find((serial) => phone ? !isEmulator(serial) : isEmulator(serial)) || null;
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function foreground(device) {
  return /mCurrentFocus=.*?\su0\s+([^/\s]+)\//.exec(device.shell('dumpsys window | grep mCurrentFocus', { allowFail: true }))?.[1] || '';
}

// #endregion
// #region 02 — Emulatore: impostazioni salvate, demo mode e ripristino

const SETTINGS = [['global', 'animator_duration_scale'], ['global', 'transition_animation_scale'], ['global', 'window_animation_scale'],
  ['system', 'font_scale'], ['system', 'user_rotation'], ['system', 'accelerometer_rotation'], ['global', 'sysui_demo_allowed']];

function snapshot(device) {
  return Object.fromEntries(SETTINGS.map(([ns, key]) => [`${ns}/${key}`, device.shell(`settings get ${ns} ${key}`)]));
}

function restore(device, saved) {
  device.shell('am broadcast -a com.android.systemui.demo -e command exit', { allowFail: true });
  for (const [id, value] of Object.entries(saved)) {
    const [ns, key] = id.split('/');
    device.shell(value === 'null' || value === '' ? `settings delete ${ns} ${key}` : `settings put ${ns} ${key} ${value}`, { allowFail: true });
  }
}

function demoMode(device) {
  device.shell('settings put global sysui_demo_allowed 1');
  const demo = (extra) => device.shell(`am broadcast -a com.android.systemui.demo ${extra}`);
  demo('-e command enter');
  demo('-e command clock -e hhmm 0930');
  demo('-e command battery -e level 100 -e plugged false');
  demo('-e command network -e wifi show -e level 4 -e mobile show -e datatype none -e level 4');
  demo('-e command notifications -e visible false');
  for (const key of ['animator_duration_scale', 'transition_animation_scale', 'window_animation_scale']) device.shell(`settings put global ${key} 0`);
}

// #endregion
// #region 03 — Maschere: barra di stato e valori live

/** Riquadri [x1,y1,x2,y2] dei nodi di Control il cui testo contiene cifre (orari, percentuali, contatori). */
function liveTextBounds(xml) {
  const boxes = [];
  for (const match of xml.matchAll(/<node\b[^>]*>/g)) {
    const node = match[0];
    if (!node.includes(`package="${PACKAGE}"`)) continue;
    const text = /\btext="([^"]*)"/.exec(node)?.[1] || '';
    const bounds = /\bbounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node);
    if (bounds && /\d/.test(text)) boxes.push(bounds.slice(1, 5).map(Number));
  }
  return boxes;
}

function mask(png, density, boxes) {
  const image = decode(png);
  const paint = (x1, y1, x2, y2) => {
    for (let y = Math.max(0, y1); y < Math.min(image.height, y2); y += 1) {
      for (let x = Math.max(0, x1); x < Math.min(image.width, x2); x += 1) {
        const i = (y * image.width + x) * 4;
        image.data[i] = 0; image.data[i + 1] = 0; image.data[i + 2] = 0; image.data[i + 3] = 255;
      }
    }
  };
  paint(0, 0, image.width, Math.ceil(STATUS_BAR_DP * density / 160));
  for (const [x1, y1, x2, y2] of boxes) paint(x1, y1, x2, y2);
  return encode(image);
}

// #endregion
// #region 04 — Cattura e confronto

function capture(device, suite, profile, density) {
  const ui = device.run(['exec-out', 'uiautomator', 'dump', '/dev/tty'], { allowFail: true });
  // Lo stato (dashboard o PC non raggiungibile) cambia la schermata: baseline distinte per stato.
  const state = /text="[^"]*OFFLINE[^"]*"/i.test(ui) ? 'offline' : /text="Riavvia"/.test(ui) ? 'dashboard' : 'altro';
  const png = device.run(['exec-out', 'screencap', '-p'], { binary: true });
  if (png.length < 1000 || png.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`${profile.id}: screencap non valido.`);
  const name = `control-${state}-${profile.id}`;
  const result = suite.check(name, mask(png, density, liveTextBounds(ui)));
  console.log(`${['pass', 'approved'].includes(result.status) ? '✔' : '✖'} ${suite.dirs.run.split(/[\\/]/).pop()} ${name} ${result.status}${result.diffRatio !== undefined ? ` ${(result.diffRatio * 100).toFixed(3)}%` : ''}`);
}

function main() {
  const adb = adbPath();
  const skip = (reason) => { console.log(`Android visual: SKIPPED (${reason}).`); return args.includes('--require') ? 2 : 0; };
  if (!adb) return skip('adb non trovato');
  const serial = pickDevice(adb, option('serial'));
  if (!serial) return skip(phone ? 'nessun telefono collegato' : 'nessun emulatore avviato: scripts/start-android-emulator.ps1, oppure --phone');
  const device = makeAdb(adb, serial);
  if (!device.shell(`pm list packages ${PACKAGE}`).includes(`package:${PACKAGE}`)) throw new Error(`Control (${PACKAGE}) non installato su ${serial}.`);
  if (/mDreamingLockscreen=true|mShowingLockscreen=true/.test(device.shell('dumpsys window | grep -E "mDreamingLockscreen|mShowingLockscreen"', { allowFail: true }))) throw new Error('Dispositivo bloccato: nessuna azione eseguita (il PIN resta al proprietario).');
  const home = /^([^/\s]+)\//m.exec(device.shell('cmd package resolve-activity --brief -a android.intent.action.MAIN -c android.intent.category.HOME', { allowFail: true }))?.[1];
  const before = foreground(device);
  if (before && before !== PACKAGE && before !== home) throw new Error(`In primo piano c'è ${before}: catture sospese prima di toccare qualcosa.`);
  const densities = device.shell('wm density').match(/\d+/g) || ['420'];
  const density = Number(densities[densities.length - 1]);
  const suite = createSuite({ root, suite: phone ? 'android-phone' : 'android', update, defaults: TOLERANCE });

  if (phone) {
    try {
      device.shell(`am start -W -n ${ACTIVITY}`);
      sleep(4500);
      if (foreground(device) !== PACKAGE) throw new Error('Control non è in primo piano.');
      capture(device, suite, PROFILES[0], density);
    } finally {
      if (before === home) device.shell('input keyevent KEYCODE_HOME', { allowFail: true });
    }
  } else {
    const saved = snapshot(device);
    try {
      demoMode(device);
      for (const profile of PROFILES) {
        device.shell('settings put system accelerometer_rotation 0');
        device.shell(`settings put system user_rotation ${profile.rotation || '0'}`);
        device.shell(`settings put system font_scale ${profile.font || '1.0'}`);
        device.shell(`am force-stop ${PACKAGE}`);
        device.shell(`am start -W -n ${ACTIVITY}`);
        sleep(4500);
        if (foreground(device) !== PACKAGE) throw new Error(`${profile.id}: Control non è in primo piano.`);
        capture(device, suite, profile, density);
      }
    } finally {
      restore(device, saved);
      device.shell(`am force-stop ${PACKAGE}`, { allowFail: true });
      device.shell(`am start -n ${ACTIVITY}`, { allowFail: true });
    }
  }
  const summary = suite.finish({ device: phone ? 'telefono reale (sola lettura)' : serial, model: device.shell('getprop ro.product.model') });
  console.log(`\n${summary.failed ? '✖' : '✔'} ${summary.total - summary.failed}/${summary.total} · rapporto ${path.relative(root, summary.report)}`);
  return summary.failed ? 1 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

// #endregion

module.exports = { liveTextBounds, mask };
