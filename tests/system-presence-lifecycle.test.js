/**
 * @module tests/system-presence-lifecycle
 * @description Protegge la separazione tra Core, presenza leggera e UI interattiva.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AMBIENT_VOICE_ARGUMENT,
  PRESENCE_ARGUMENT,
  WAKE_WORD_ARGUMENT_PREFIX,
  interactiveLaunchArguments,
  launchInteractiveDesktop,
  launchIndependentWindowsProcess,
  launchSystemPresence,
  presenceLaunchArguments,
  processLockState
} = require('../src/infrastructure/electron/desktop-launcher');
const { CLAUDE_WINDOWS_APP_ID, CLAUDE_DESKTOP_PROCESS_QUERY, activateFromWakeWord, closeClaudeDesktop, isClaudeDesktopRunning, openClaudeDesktop, presenceCapabilities } = require('../src/application/presence-bootstrap');
const { startupCapability } = require('../src/application/register-ipc');
const { continuityTaskScript } = require('../src/infrastructure/windows/continuity-task');

const root = path.resolve(__dirname, '..');

test('Core, presenza e UI hanno ruoli non sovrapposti', () => {
  const capability = presenceCapabilities({ platform: 'win32', shortcutRegistered: true });
  assert.deepEqual(capability, {
    mode: 'system-presence', lightweight: true, ownsAiRuntime: false,
    ownsRemoteGateway: false, opensFullUiOnDemand: true,
    tray: true, shortcut: 'CommandOrControl+Shift+Space'
  });
  assert.deepEqual(interactiveLaunchArguments({ defaultApp: false, appRoot: 'C:\\Nexus' }), ['--ui']);
  assert.deepEqual(interactiveLaunchArguments({ defaultApp: true, appRoot: 'C:\\Nexus' }), ['C:\\Nexus', '--ui']);
  assert.deepEqual(presenceLaunchArguments({ defaultApp: false, appRoot: 'C:\\Nexus' }), [PRESENCE_ARGUMENT]);
  assert.deepEqual(presenceLaunchArguments({ defaultApp: true, appRoot: 'C:\\Nexus' }), ['C:\\Nexus', PRESENCE_ARGUMENT]);
  const ticket = 'A'.repeat(120);
  assert.deepEqual(interactiveLaunchArguments({ defaultApp: false, activationTicket: ticket }), ['--ui', AMBIENT_VOICE_ARGUMENT, `${WAKE_WORD_ARGUMENT_PREFIX}${ticket}`]);
  assert.deepEqual(interactiveLaunchArguments({ defaultApp: false, activationTicket: 'not-valid' }), ['--ui']);
});

test('hidden owner bridge reports no visible tray while retaining desktop access', () => {
  const status = presenceCapabilities({ platform: 'win32', trayVisible: false });
  assert.equal(status.tray, false);
  assert.equal(status.ownsAiRuntime, false);
  assert.equal(status.ownsRemoteGateway, false);
  assert.equal(status.opensFullUiOnDemand, true);
});

test('la UI avvia la Presence in un processo nascosto privo di runtime AI', async () => {
  const calls = [];
  const result = await launchSystemPresence({
    executable: process.execPath,
    platform: 'linux',
    defaultApp: false,
    appRoot: root,
    env: { NEXUS_MANAGED_OLLAMA: '1', NEXUS_SHARED_DATA_ROOT: 'Z:\\NexusData' },
    launch: (file, args, options) => {
      calls.push({ file, args, options });
      return {
        pid: 8124,
        once(event, callback) { if (event === 'spawn') queueMicrotask(callback); return this; },
        unref() {}
      };
    }
  });
  assert.deepEqual(result, { launched: true, pid: 8124 });
  assert.deepEqual(calls[0].args, [PRESENCE_ARGUMENT]);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(calls[0].options.detached, true);
  assert.equal(calls[0].options.env.NEXUS_MANAGED_OLLAMA, '0');
  assert.equal(calls[0].options.env.NEXUS_SHARED_DATA_ROOT, 'Z:\\NexusData');
  assert.equal(calls[0].options.env.NEXUS_USER_DATA_ROOT, 'Z:\\NexusData');
});

test('packaged Presence and UI spawn outside ASAR and preserve the shared profile', async () => {
  for (const launchDesktop of [launchSystemPresence, launchInteractiveDesktop]) {
    let captured;
    await launchDesktop({
      executable: process.execPath,
      platform: 'linux',
      defaultApp: false,
      appRoot: path.join(root, 'resources', 'app.asar'),
      env: { NEXUS_SHARED_DATA_ROOT: root },
      launch: (_file, _args, options) => {
        captured = options;
        return {
          once(event, callback) { if (event === 'spawn') queueMicrotask(callback); return this; },
          unref() {}
        };
      }
    });
    assert.equal(captured.cwd, path.dirname(process.execPath));
    assert.ok(fs.statSync(captured.cwd).isDirectory());
    assert.equal(captured.env.NEXUS_USER_DATA_ROOT, root);
  }
});

test('la capability startup documenta Core persistente e UI on-demand', () => {
  const state = startupCapability({ available: true, enabled: true });
  assert.equal(state.mode, 'headless-core');
  assert.equal(state.coreRunsWhenUiClosed, true);
  assert.equal(state.fullUi, 'on-demand');
  assert.equal(state.presence.surface, 'system-tray');
  assert.equal(state.presence.placement, undefined, 'nessuna finestra sul desktop da posizionare');
  assert.equal(state.presence.ownsAiRuntime, false);
  assert.equal(state.presence.ownsRemoteGateway, false);
  assert.ok(state.activation.includes('approved-remote-action'));
});

test('il task Windows registra Core e presenza come processi separati', () => {
  const script = continuityTaskScript('C:\\Program Files\\NexusNXS\\NexusNXS.exe', true, 'Z:\\NexusData');
  assert.match(script, /--background/);
  assert.match(script, /--presence/);
  assert.match(script, /NexusNXS Connectivity/);
  assert.match(script, /NexusNXS Presence/);
  assert.match(script, /MultipleInstances IgnoreNew/);
  assert.doesNotMatch(script, /RunLevel Highest|User SYSTEM/);
});

test('la workstation avvia automaticamente solo il Server headless', () => {
  const bootstrap = fs.readFileSync(path.join(root, 'src', 'application', 'bootstrap.js'), 'utf8');
  const taskManager = fs.readFileSync(path.join(root, 'scripts', 'manage-headless-server-task.ps1'), 'utf8');
  assert.match(bootstrap, /app\.isPackaged\s*&&\s*!serverMode/);
  assert.match(taskManager, /deviceCoreTaskName\s*=\s*'NexusNXS Connectivity'/);
  assert.match(taskManager, /Unregister-ScheduledTask -TaskName \$deviceCoreTaskName/);
  assert.match(taskManager, /Unregister-ScheduledTask -TaskName \$presenceTaskName/);
  assert.doesNotMatch(taskManager, /Register-ScheduledTask\s+`\s*\n\s*-TaskName \$presenceTaskName/);
  assert.match(taskManager, /desktopBridgeTaskName\s*=\s*'NexusNXS Desktop Bridge'/);
  assert.match(taskManager, /run-presence\.ps1'\) -Interactive/);
});

test('i profili Chromium Core e presenza sono isolati dai dati condivisi', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
  assert.match(source, /NEXUS_SHARED_DATA_ROOT/);
  assert.match(source, /runtime-profiles/);
  assert.match(source, /presenceMode \? 'presence' : 'core'/);
  assert.match(source, /app\.setPath\('userData', chromiumProfilePath\)/);
});

test('il richiamo vocale usa una UI nascosta temporanea e lascia visibile soltanto la Presence', () => {
  const bootstrap = fs.readFileSync(path.join(root, 'src', 'application', 'bootstrap.js'), 'utf8');
  const presence = fs.readFileSync(path.join(root, 'src', 'application', 'presence-bootstrap.js'), 'utf8');
  const windowFactory = fs.readFileSync(path.join(root, 'src', 'infrastructure', 'electron', 'create-main-window.js'), 'utf8');
  const lifecycle = fs.readFileSync(path.join(root, 'src', 'infrastructure', 'electron', 'app-lifecycle.js'), 'utf8');
  assert.match(bootstrap, /ambient-voice-ui\.lock/);
  assert.match(bootstrap, /startHidden: ambientVoiceMode/);
  assert.match(bootstrap, /ambientVoiceBecameActive/);
  assert.match(presence, /AMBIENT_UI_LOCK/);
  assert.match(presence, /waitForFullUi\?\.\(\{ ambient: true \}\)/);
  assert.match(windowFactory, /!smokeTest && !startHidden/);
  assert.match(lifecycle, /handledWithoutWindow/);
});

test('la Presence apre la UI on-demand e ne segue la visibilità', () => {
  const source = fs.readFileSync(path.join(root, 'src', 'application', 'bootstrap.js'), 'utf8');
  const presence = fs.readFileSync(path.join(root, 'src', 'application', 'presence-bootstrap.js'), 'utf8');
  assert.doesNotMatch(source, /attachPrimaryWindow/);
  assert.match(presence, /tray\.on\('click', activateFullUi\)/);
  assert.match(presence, /onWake:\s*\(\)\s*=>\s*activateFromWakeWord/);
  // Nessuna finestra del pet: il processo Presence usa solo impostazioni e barra rapida.
  assert.doesNotMatch(presence, /companion-window|selectPet|nucleusVisible/);
  assert.match(presence, /manager\.setApplicationVisible\?\.\(state\.running\)/);
  assert.match(source, /launchSystemPresence\(\{ appRoot, env \}\)/);
});

test('il richiamo vocale torna idle quando la UI non acquisisce il lock', async () => {
  const states = [];
  const result = await activateFromWakeWord({
    manager: { updateState: (state) => states.push(state) },
    createActivationTicket: () => 'A'.repeat(120),
    openFullUi: async () => ({ launched: true }),
    waitForFullUi: async () => false
  });
  assert.deepEqual(states, ['listening', 'idle']);
  assert.deepEqual(result, { launched: false, reason: 'ui-timeout' });
});

test('il richiamo vocale resta listening soltanto quando la UI risulta avviata', async () => {
  const states = [];
  const result = await activateFromWakeWord({
    manager: { updateState: (state) => states.push(state) },
    createActivationTicket: () => 'A'.repeat(120),
    openFullUi: async () => ({ launched: true }),
    waitForFullUi: async () => true
  });
  assert.deepEqual(states, ['listening']);
  assert.deepEqual(result, { launched: true });
});

test('lo stato lock non espone token e distingue processi vivi', () => {
  const fake = path.join(root, 'not-created.lock');
  assert.deepEqual(processLockState(fake, { processAlive: () => false }), { running: false, pid: null });
});

test('il comando Claude apre prima l app desktop Windows', async () => {
  const calls = [];
  const result = await openClaudeDesktop({
    platform: 'win32',
    spawnProcess: (file, args, options) => {
      calls.push({ file, args, options });
      return {
        once(event, callback) { if (event === 'spawn') queueMicrotask(callback); return this; },
        unref() {}
      };
    },
    openExternal: async () => { throw new Error('browser fallback inatteso'); }
  });
  assert.equal(result.target, 'desktop-app');
  assert.equal(calls[0].file, 'explorer.exe');
  assert.deepEqual(calls[0].args, [`shell:AppsFolder\\${CLAUDE_WINDOWS_APP_ID}`]);
});

test('il comando Claude usa il browser del PC solo come fallback', async () => {
  const opened = [];
  const result = await openClaudeDesktop({
    platform: 'win32',
    spawnProcess: () => { throw new Error('app non disponibile'); },
    openExternal: async (url) => opened.push(url)
  });
  assert.equal(result.target, 'desktop-browser');
  assert.deepEqual(opened, ['https://claude.ai']);
});

test('la Presence riconosce soltanto Claude Desktop, mai Claude Code, con una query fissa e nascosta', async () => {
  const calls = [];
  const running = await isClaudeDesktopRunning({
    platform: 'win32',
    listProcesses: async (file, args, options) => { calls.push({ file, args, options }); return { stdout: '8120\r\n9001\r\n' }; }
  });
  assert.equal(running, true);
  assert.equal(calls[0].file, 'powershell.exe');
  assert.equal(calls[0].args.at(-1), CLAUDE_DESKTOP_PROCESS_QUERY);
  assert.match(CLAUDE_DESKTOP_PROCESS_QUERY, /\\WindowsApps\\Claude_\*\\app\\Claude\.exe/);
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(await isClaudeDesktopRunning({ platform: 'win32', listProcesses: async () => ({ stdout: '' }) }), false);
  assert.equal(await isClaudeDesktopRunning({ platform: 'win32', listProcesses: async () => ({ stdout: 'x; rm -rf' }) }), false);
  assert.equal(await isClaudeDesktopRunning({ platform: 'linux' }), false);
});

const desktopProcesses = async () => ({ stdout: '8120\r\n9001' });

test('la chiusura Claude termina soltanto i PID del pacchetto Desktop, mai per nome immagine', async () => {
  const calls = [];
  const result = await closeClaudeDesktop({
    platform: 'win32', listProcesses: desktopProcesses,
    terminateProcess: async (file, args, options) => { calls.push({ file, args, options }); return { stdout: 'SUCCESS' }; }
  });
  assert.equal(result.closed, true);
  assert.equal(calls[0].file, 'taskkill.exe');
  assert.deepEqual(calls[0].args, ['/PID', '8120', '/PID', '9001', '/T']);
  assert.ok(!calls[0].args.includes('/IM'));
  assert.equal(calls[0].options.windowsHide, true);
});

test('senza processi Desktop la chiusura non tocca nulla', async () => {
  let terminated = false;
  const result = await closeClaudeDesktop({ platform: 'win32', listProcesses: async () => ({ stdout: '' }), terminateProcess: async () => { terminated = true; } });
  assert.equal(result.alreadyClosed, true);
  assert.equal(terminated, false);
});

test('la chiusura Claude passa al fallback forzato sugli stessi PID se WM_CLOSE viene rifiutato', async () => {
  const calls = [];
  const result = await closeClaudeDesktop({
    platform: 'win32', listProcesses: desktopProcesses,
    terminateProcess: async (file, args) => {
      calls.push({ file, args });
      if (!args.includes('/F')) throw Object.assign(new Error('Access denied'), { stderr: 'Access denied' });
      return { stdout: 'SUCCESS' };
    }
  });
  assert.equal(result.closed, true);
  assert.equal(result.forced, true);
  assert.deepEqual(calls.map((entry) => entry.args), [
    ['/PID', '8120', '/PID', '9001', '/T'],
    ['/PID', '8120', '/PID', '9001', '/T', '/F']
  ]);
});

test('Windows independent launch preserves literal arguments, cwd and environment', { skip: process.platform !== 'win32' }, async (t) => {
  const os = require('node:os');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-launch-[literal] '));
  // The probe writes its result just before Windows releases its working directory.
  t.after(() => fs.promises.rm(temporaryRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const script = path.join(temporaryRoot, 'probe.js');
  const output = path.join(temporaryRoot, 'result.json');
  fs.writeFileSync(script, "require('node:fs').writeFileSync('result.json',JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),marker:process.env.NEXUS_LAUNCH_TEST_MARKER}))");
  const args = ['space value', 'quote"value', 'backslash\\"quote', 'C:\\folder with spaces\\', '$env:PATH; $(anything)', ''];
  const launched = await launchIndependentWindowsProcess(process.execPath, [script, ...args], {
    cwd: temporaryRoot, env: { ...process.env, NEXUS_LAUNCH_TEST_MARKER: 'local-probe' }
  });
  assert.ok(launched.pid > 0);
  for (let attempt = 0; attempt < 100 && !fs.existsSync(output); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), { args, cwd: temporaryRoot, marker: 'local-probe' });
});

test('Windows independent launch reports failure and rejects invalid process IDs', async () => {
  const options = { cwd: root, env: {} };
  await assert.rejects(launchIndependentWindowsProcess('Nexus.exe', [], options,
    (_file, _args, _options, callback) => callback(new Error('start failed'))), /non riuscito/);
  for (const output of ['', '0', 'invalid', '-1', '1.5']) {
    await assert.rejects(launchIndependentWindowsProcess('Nexus.exe', [], options,
      (_file, _args, _options, callback) => callback(null, output)), /PID/);
  }
});
