/**
 * @module tests/desktop-application-catalog
 * @description Verifica il telecomando applicativo allowlist-only e privo di dettagli locali.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  closeDesktopApplication,
  desktopApplicationStatus,
  openDesktopApplication,
  openSupremoPrivileged,
  foregroundDesktopApplication,
  parseVisibleProcessNames,
  parseTaskList,
  resolveExecutable
} = require('../src/infrastructure/windows/desktop-application-catalog');

test('rileva la finestra in primo piano soltanto se appartiene al catalogo statico', async () => {
  const env = { WINDIR: 'C:\\Windows' };
  const brave = await foregroundDesktopApplication({
    platform: 'win32', env,
    execute: async () => ({ stdout: '{"process":"brave"}' })
  });
  assert.deepEqual(brave, { id: 'brave', label: 'Brave' });
  const explorer = await foregroundDesktopApplication({
    platform: 'win32', env,
    execute: async () => ({ stdout: '{"process":"explorer"}' })
  });
  assert.equal(explorer, null);
});

test('interpreta tasklist senza esporre righe o percorsi al client', async () => {
  const source = '"brave.exe","100","Console","1","20.000 K"\r\n"WindowsTerminal.exe","200","Console","1","30.000 K"\r\n"Supremo.exe","300","Console","1","15.000 K"';
  assert.deepEqual([...parseTaskList(source)], ['brave.exe', 'windowsterminal.exe', 'supremo.exe']);
  const applications = await desktopApplicationStatus({
    platform: 'win32',
    listProcesses: async () => ({ stdout: source }),
    env: { LOCALAPPDATA: 'C:\\Profile', ProgramFiles: 'C:\\Programs', 'ProgramFiles(x86)': 'C:\\Programs x86', WINDIR: 'C:\\Windows' },
    exists: () => true,
    listVisibleWindows: async () => new Set(['brave.exe', 'windowsterminal.exe', 'supremo.exe']),
    supremoWindow: async () => ({ found: true, visible: true }),
    supremoPrivilege: async () => false
  });
  assert.equal(applications.find((entry) => entry.id === 'brave').open, true);
  assert.equal(applications.find((entry) => entry.id === 'terminal').open, true);
  assert.equal(applications.find((entry) => entry.id === 'supremo').open, true);
  assert.equal(applications.find((entry) => entry.id === 'supremo').adminReady, false);
  assert.equal(JSON.stringify(applications).includes('C:\\'), false);
});

test('risolve soltanto candidati statici e avvia senza shell', async () => {
  const launched = [];
  const env = { LOCALAPPDATA: 'C:\\Profile', ProgramFiles: 'C:\\Programs', WINDIR: 'C:\\Windows' };
  assert.equal(resolveExecutable('notepad', { env, exists: () => true }), 'C:\\Profile\\Microsoft\\WindowsApps\\notepad.exe');
  await openDesktopApplication('notepad', {
    platform: 'win32', env, exists: () => true,
    spawnProcess: (file, args, options) => {
      launched.push({ file, args, options });
      return { once: (name, done) => { if (name === 'spawn') queueMicrotask(done); }, unref() {} };
    }
  });
  assert.equal(launched[0].file, 'C:\\Profile\\Microsoft\\WindowsApps\\notepad.exe');
  assert.deepEqual(launched[0].args, []);
  assert.equal(launched[0].options.windowsHide, false);
  await assert.rejects(openDesktopApplication('arbitrary', { platform: 'win32' }), { code: 'DESKTOP_APP_NOT_ALLOWED' });
});

test('Brave distingue i processi residenti da una finestra davvero visibile', async () => {
  assert.deepEqual([...parseVisibleProcessNames('["brave","Notepad"]')], ['brave.exe', 'notepad.exe']);
  const env = { LOCALAPPDATA: 'C:\\Profile', ProgramFiles: 'C:\\Programs', WINDIR: 'C:\\Windows' };
  const applications = await desktopApplicationStatus({
    platform: 'win32', env, exists: () => true,
    listProcesses: async () => ({ stdout: '"brave.exe","100","Console","1","20.000 K"' }),
    listVisibleWindows: async () => new Set(),
    supremoWindow: async () => ({ found: false, visible: false })
  });
  assert.equal(applications.find((entry) => entry.id === 'brave').open, false);
  const launched = [];
  await openDesktopApplication('brave', {
    platform: 'win32', env, exists: () => true,
    spawnProcess: (file, args, options) => {
      launched.push({ file, args, options });
      return { once: (name, done) => { if (name === 'spawn') queueMicrotask(done); }, unref() {} };
    }
  });
  assert.deepEqual(launched[0].args, ['--new-window']);
  assert.equal(launched[0].options.windowsHide, false);
});

test('Supremo usa il client installato e non arresta helper o servizio', async () => {
  const launched = [];
  const env = { LOCALAPPDATA: 'C:\\Profile', ProgramFiles: 'C:\\Programs', 'ProgramFiles(x86)': 'C:\\Programs x86' };
  await openDesktopApplication('supremo', {
    platform: 'win32', env, exists: (candidate) => candidate === 'C:\\Programs x86\\Supremo\\Supremo.exe',
    supremoWindow: async () => ({ found: false, visible: false }),
    supremoOpen: async () => { throw Object.assign(new Error('not installed'), { code: 'DESKTOP_APP_ELEVATION_REQUIRED' }); },
    spawnProcess: (file, args, options) => {
      launched.push({ file, args, options });
      return { once: (name, done) => { if (name === 'spawn') queueMicrotask(done); }, unref() {} };
    }
  });
  assert.equal(launched[0].file, 'C:\\Programs x86\\Supremo\\Supremo.exe');
  const calls = [];
  await closeDesktopApplication('supremo', {
    platform: 'win32',
    supremoWindow: async () => ({ found: true, visible: true }),
    supremoClose: async () => { calls.push(['broker', ['close']]); },
    terminateProcess: async (file, args) => calls.push([file, args])
  });
  assert.deepEqual(calls, [['broker', ['close']]]);
  assert.equal(JSON.stringify(calls).includes('SupremoService'), false);
  assert.equal(JSON.stringify(calls).includes('SupremoHelper'), false);
});

test('Supremo usa il broker elevato statico e non accetta un falso stato visibile', async () => {
  const launched = [];
  const result = await openDesktopApplication('supremo', {
    platform: 'win32',
    env: { WINDIR: 'C:\\Windows', 'ProgramFiles(x86)': 'C:\\Programs x86' },
    exists: () => true,
    supremoWindow: async () => ({ found: true, visible: false }),
    supremoOpen: async () => { launched.push('broker'); },
    spawnProcess: () => { throw new Error('non deve usare il fallback'); }
  });
  assert.deepEqual(launched, ['broker']);
  assert.equal(result.elevated, true);

  const calls = [];
  await openSupremoPrivileged({
    env: { WINDIR: 'C:\\Windows' },
    execute: async (file, args, options) => calls.push({ file, args, options })
  });
  assert.deepEqual(calls[0].args, ['/Run', '/TN', 'NexusNXS Open Supremo']);
  assert.equal(calls[0].options.windowsHide, true);
});

test('chiude solo processi statici del catalogo senza shell', async () => {
  const calls = [];
  await closeDesktopApplication('notepad', {
    platform: 'win32',
    terminateProcess: async (file, args, options) => calls.push({ file, args, options })
  });
  assert.deepEqual(calls.map((entry) => [entry.file, entry.args]), [
    ['taskkill.exe', ['/IM', 'notepad.exe', '/T']]
  ]);
  assert.equal(calls.every((entry) => entry.options.windowsHide), true);
  await assert.rejects(closeDesktopApplication('arbitrary', { platform: 'win32' }), { code: 'DESKTOP_APP_NOT_ALLOWED' });
});

test('usa /F soltanto come fallback approvato quando la chiusura ordinata viene rifiutata', async () => {
  const calls = [];
  await closeDesktopApplication('brave', {
    platform: 'win32',
    terminateProcess: async (file, args) => {
      calls.push([file, args]);
      if (!args.includes('/F')) {
        const error = new Error('force required');
        error.stderr = 'This process can only be terminated forcefully';
        throw error;
      }
    }
  });
  assert.deepEqual(calls, [
    ['taskkill.exe', ['/IM', 'brave.exe', '/T']],
    ['taskkill.exe', ['/IM', 'brave.exe', '/T', '/F']]
  ]);
});

test('i broker elevati sono confinati al solo eseguibile Supremo firmato', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'manage-supremo-control-task.ps1'), 'utf8');
  assert.match(script, /NexusNXS Open Supremo/);
  assert.match(script, /NexusNXS Close Supremo/);
  assert.match(script, /Get-AuthenticodeSignature/);
  assert.match(script, /Nanosystems S\\\.r\\\.l\\\./);
  assert.match(script, /ProgramFiles/);
  assert.match(script, /taskkill\.exe/);
  assert.match(script, /\/IM Supremo\.exe \/T \/F/);
  assert.match(script, /RunLevel Highest/);
  assert.doesNotMatch(script, /Invoke-Expression|Start-Process|\$args|CommandLine/);
});
