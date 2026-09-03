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
  launchSystemPresence,
  presenceLaunchArguments,
  processLockState
} = require('../src/infrastructure/electron/desktop-launcher');
const { CHATGPT_WINDOWS_APP_ID, activateFromWakeWord, closeChatGptDesktop, isChatGptDesktopRunning, openChatGptDesktop, presenceCapabilities } = require('../src/application/presence-bootstrap');
const { startupCapability } = require('../src/application/register-ipc');
const { continuityTaskScript } = require('../src/infrastructure/windows/continuity-task');

const root = path.resolve(__dirname, '..');

test('Core, presenza e UI hanno ruoli non sovrapposti', () => {
  const capability = presenceCapabilities({ platform: 'win32', shortcutRegistered: true });
  assert.deepEqual(capability, {
    mode: 'system-presence', lightweight: true, ownsAiRuntime: false,
    ownsRemoteGateway: false, multiDisplay: true, opensFullUiOnDemand: true,
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

test('la UI avvia la Presence in un processo nascosto privo di runtime AI', async () => {
  const calls = [];
  const result = await launchSystemPresence({
    executable: process.execPath,
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
});

test('la capability startup documenta Core persistente e UI on-demand', () => {
  const state = startupCapability({ available: true, enabled: true });
  assert.equal(state.mode, 'headless-core');
  assert.equal(state.coreRunsWhenUiClosed, true);
  assert.equal(state.fullUi, 'on-demand');
  assert.equal(state.presence.placement, 'adaptive-single-display');
  assert.deepEqual(state.presence.placementPolicy, { one: 'primary', two: 'secondary', threeOrMore: 'primary' });
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
  assert.match(presence, /openPrimaryWindow:\s*activateFullUi/);
  assert.match(presence, /activateVoice:\s*\(\)\s*=>\s*activateFromWakeWord/);
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

test('il comando ChatGPT apre prima l app desktop Windows', async () => {
  const calls = [];
  const result = await openChatGptDesktop({
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
  assert.deepEqual(calls[0].args, [`shell:AppsFolder\\${CHATGPT_WINDOWS_APP_ID}`]);
});

test('il comando ChatGPT usa il browser del PC solo come fallback', async () => {
  const opened = [];
  const result = await openChatGptDesktop({
    platform: 'win32',
    spawnProcess: () => { throw new Error('app non disponibile'); },
    openExternal: async (url) => opened.push(url)
  });
  assert.equal(result.target, 'desktop-browser');
  assert.deepEqual(opened, ['https://chatgpt.com']);
});

test('la Presence distingue ChatGPT già aperto senza shell o finestre visibili', async () => {
  const calls = [];
  const running = await isChatGptDesktopRunning({
    platform: 'win32',
    listProcesses: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: '"ChatGPT.exe","8120","Console","1","164.000 K"' };
    }
  });
  assert.equal(running, true);
  assert.equal(calls[0].file, 'tasklist.exe');
  assert.equal(calls[0].options.windowsHide, true);
  assert.equal(await isChatGptDesktopRunning({ platform: 'linux' }), false);
});

test('la chiusura ChatGPT usa soltanto il nome processo statico e resta nascosta', async () => {
  const calls = [];
  const result = await closeChatGptDesktop({
    platform: 'win32',
    terminateProcess: async (file, args, options) => {
      calls.push({ file, args, options });
      return { stdout: 'SUCCESS' };
    }
  });
  assert.equal(result.closed, true);
  assert.equal(calls[0].file, 'taskkill.exe');
  assert.deepEqual(calls[0].args, ['/IM', 'ChatGPT.exe', '/T']);
  assert.equal(calls[0].options.windowsHide, true);
});

test('la chiusura forzata ChatGPT resta confinata allo stesso nome statico', async () => {
  const calls = [];
  await closeChatGptDesktop({
    platform: 'win32',
    force: true,
    terminateProcess: async (file, args) => { calls.push({ file, args }); return { stdout: 'SUCCESS' }; }
  });
  assert.deepEqual(calls, [{ file: 'taskkill.exe', args: ['/IM', 'ChatGPT.exe', '/T', '/F'] }]);
});

test('la chiusura ChatGPT passa automaticamente al fallback se WM_CLOSE viene rifiutato', async () => {
  const calls = [];
  const result = await closeChatGptDesktop({
    platform: 'win32',
    terminateProcess: async (file, args) => {
      calls.push({ file, args });
      if (!args.includes('/F')) throw Object.assign(new Error('Access denied'), { stderr: 'Access denied' });
      return { stdout: 'SUCCESS' };
    }
  });
  assert.equal(result.closed, true);
  assert.equal(result.forced, true);
  assert.deepEqual(calls.map((entry) => entry.args), [
    ['/IM', 'ChatGPT.exe', '/T'],
    ['/IM', 'ChatGPT.exe', '/T', '/F']
  ]);
});
