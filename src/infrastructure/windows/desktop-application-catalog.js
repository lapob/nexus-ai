/**
 * @module infrastructure/windows/desktop-application-catalog
 * @description Catalogo statico delle applicazioni Windows controllabili dalla Console privata.
 * Espone soltanto stato e identificatori pubblici: mai percorsi, argomenti o processi grezzi.
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const SUPREMO_WINDOW_ACTIONS = new Set(['status', 'open', 'close']);
const SUPREMO_OPEN_TASK = 'NexusNXS Open Supremo';
const SUPREMO_CLOSE_TASK = 'NexusNXS Close Supremo';
let supremoRequestedVisible = false;
const FOREGROUND_WINDOW_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
$signature='[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);'
Add-Type -MemberDefinition $signature -Name ForegroundWindow -Namespace NexusNXS -ErrorAction SilentlyContinue
$handle=[NexusNXS.ForegroundWindow]::GetForegroundWindow()
$processIdValue=[uint32]0
if ($handle -eq [IntPtr]::Zero) { @{process=''}|ConvertTo-Json -Compress; exit 0 }
[void][NexusNXS.ForegroundWindow]::GetWindowThreadProcessId($handle,[ref]$processIdValue)
$process=Get-Process -Id $processIdValue -ErrorAction SilentlyContinue
@{process=if($process){$process.ProcessName}else{''}}|ConvertTo-Json -Compress
`;
const SUPREMO_WINDOW_SCRIPT = String.raw`
$ErrorActionPreference='Stop'
$signature='[DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd); [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd,int nCmdShow); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);'
Add-Type -MemberDefinition $signature -Name WindowControl -Namespace NexusNXS -ErrorAction SilentlyContinue
$process=Get-Process -Name Supremo -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { @{found=$false;visible=$false}|ConvertTo-Json -Compress; exit 0 }
$handle=[IntPtr]$process.MainWindowHandle
$wasVisible=[NexusNXS.WindowControl]::IsWindowVisible($handle)
if ($action -eq 'open') { [void][NexusNXS.WindowControl]::ShowWindow($handle,9); [void][NexusNXS.WindowControl]::SetForegroundWindow($handle) }
if ($action -eq 'close') { [void][NexusNXS.WindowControl]::ShowWindow($handle,0) }
if ($action -ne 'status') { Start-Sleep -Milliseconds 120 }
$visible=[NexusNXS.WindowControl]::IsWindowVisible($handle)
@{found=$true;visible=$visible;changed=($wasVisible -ne $visible)}|ConvertTo-Json -Compress
`;

// #region 01 — Catalogo e risoluzione confinata

const DESKTOP_APPLICATIONS = Object.freeze([
  Object.freeze({ id: 'brave', label: 'Brave', icon: 'browser', processes: ['brave.exe'] }),
  // Un pwsh headless può appartenere al server: soltanto Windows Terminal
  // indica una finestra realmente aperta e controllabile dall'utente.
  Object.freeze({ id: 'terminal', label: 'Terminale', icon: 'terminal', processes: ['WindowsTerminal.exe', 'wt.exe'] }),
  // Supremo.exe e soltanto la superficie interattiva. Helper e servizio non
  // vengono mai terminati: la console puo chiudere la finestra senza spezzare
  // la disponibilita remota configurata dall'utente.
  Object.freeze({ id: 'supremo', label: 'Supremo', icon: 'supremo', processes: ['Supremo.exe'] }),
  Object.freeze({ id: 'notepad', label: 'Note', icon: 'note', processes: ['Notepad.exe', 'notepad.exe'] })
]);
const APPLICATION_BY_ID = new Map(DESKTOP_APPLICATIONS.map((entry) => [entry.id, entry]));

function executableCandidates(id, env = process.env) {
  const local = String(env.LOCALAPPDATA || '');
  const programFiles = String(env.ProgramFiles || env.PROGRAMFILES || '');
  const programFilesX86 = String(env['ProgramFiles(x86)'] || env.PROGRAMFILES_X86 || '');
  const windows = String(env.WINDIR || 'C:\\Windows');
  if (id === 'brave') return [
    path.join(local, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(programFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    path.join(programFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
  ];
  if (id === 'terminal') return [
    path.join(local, 'Microsoft', 'WindowsApps', 'wt.exe'),
    path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'),
    path.join(windows, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  ];
  if (id === 'supremo') return [
    path.join(programFilesX86, 'Supremo', 'Supremo.exe'),
    path.join(programFiles, 'Supremo', 'Supremo.exe'),
    path.join(local, 'Supremo', 'Supremo.exe')
  ];
  if (id === 'notepad') return [
    path.join(local, 'Microsoft', 'WindowsApps', 'notepad.exe'),
    path.join(windows, 'System32', 'notepad.exe')
  ];
  return [];
}

function resolveExecutable(id, { env = process.env, exists = fs.existsSync } = {}) {
  return executableCandidates(id, env).find((candidate) => candidate && exists(candidate)) || '';
}

async function controlSupremoWindow(action, { env = process.env, execute = execFileAsync } = {}) {
  if (!SUPREMO_WINDOW_ACTIONS.has(action)) throw Object.assign(new Error('Azione finestra non consentita.'), { code: 'DESKTOP_APP_NOT_ALLOWED' });
  const powershell = path.join(String(env.WINDIR || 'C:\\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = `$action='${action}'\n${SUPREMO_WINDOW_SCRIPT}`;
  const { stdout = '' } = await execute(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-Command', command
  ], { windowsHide: true, timeout: 3_000, encoding: 'utf8', maxBuffer: 64 * 1024 });
  const line = String(stdout).trim().split(/\r?\n/).filter(Boolean).at(-1) || '{}';
  const state = JSON.parse(line);
  return Object.freeze({ found: state.found === true, visible: state.visible === true, changed: state.changed === true });
}

async function runSupremoPrivilegedTask(taskName, { env = process.env, execute = execFileAsync } = {}) {
  const taskScheduler = path.join(String(env.WINDIR || 'C:\\Windows'), 'System32', 'schtasks.exe');
  try {
    await execute(taskScheduler, ['/Run', '/TN', taskName], {
      windowsHide: true, timeout: 3_000, encoding: 'utf8', maxBuffer: 64 * 1024
    });
  } catch (error) {
    throw Object.assign(new Error('Il controllo Supremo richiede la configurazione amministrativa una tantum.'), {
      code: 'DESKTOP_APP_ELEVATION_REQUIRED', cause: error
    });
  }
}

async function openSupremoPrivileged(options = {}) {
  await runSupremoPrivilegedTask(SUPREMO_OPEN_TASK, options);
  supremoRequestedVisible = true;
  return Object.freeze({ found: true, launched: true, elevated: true });
}

async function supremoPrivilegeReady({ env = process.env, execute = execFileAsync } = {}) {
  const taskScheduler = path.join(String(env.WINDIR || 'C:\\Windows'), 'System32', 'schtasks.exe');
  try {
    await execute(taskScheduler, ['/Query', '/TN', SUPREMO_OPEN_TASK], {
      windowsHide: true, timeout: 2_000, encoding: 'utf8', maxBuffer: 64 * 1024
    });
    return true;
  } catch {
    return false;
  }
}

async function closeSupremoPrivileged({ env = process.env, execute = execFileAsync, supremoWindow = controlSupremoWindow } = {}) {
  await runSupremoPrivilegedTask(SUPREMO_CLOSE_TASK, { env, execute });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    const state = await supremoWindow('status', { env });
    if (!state.found) {
      supremoRequestedVisible = false;
      return Object.freeze({ found: true, closed: true });
    }
  }
  throw Object.assign(new Error('Supremo non ha confermato la chiusura.'), { code: 'DESKTOP_APP_CLOSE_UNCONFIRMED' });
}

// #endregion

// #region 02 — Stato metadata-only e avvio statico

function parseTaskList(value) {
  const names = new Set();
  for (const line of String(value || '').split(/\r?\n/)) {
    const match = line.match(/^"([^"]+)"/);
    if (match) names.add(match[1].toLowerCase());
  }
  return names;
}

function parseVisibleProcessNames(value) {
  let rows = [];
  try { rows = JSON.parse(String(value || '[]')); } catch { return new Set(); }
  if (!Array.isArray(rows)) rows = rows ? [rows] : [];
  return new Set(rows
    .map((name) => String(name || '').trim().toLowerCase())
    .filter(Boolean)
    .map((name) => name.endsWith('.exe') ? name : `${name}.exe`));
}

async function visibleWindowProcessNames({ env = process.env, execute = execFileAsync } = {}) {
  const powershell = path.join(String(env.WINDIR || 'C:\\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const command = "@(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty ProcessName) | ConvertTo-Json -Compress";
  const { stdout = '' } = await execute(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command
  ], { windowsHide: true, timeout: 2_000, encoding: 'utf8', maxBuffer: 256 * 1024 });
  return parseVisibleProcessNames(stdout);
}

async function foregroundDesktopApplication({ platform = process.platform, env = process.env, execute = execFileAsync } = {}) {
  if (platform !== 'win32') return null;
  const powershell = path.join(String(env.WINDIR || 'C:\\Windows'), 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try {
    const { stdout = '' } = await execute(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-Command', FOREGROUND_WINDOW_SCRIPT
    ], { windowsHide: true, timeout: 2_000, encoding: 'utf8', maxBuffer: 64 * 1024 });
    const line = String(stdout).trim().split(/\r?\n/).filter(Boolean).at(-1) || '{}';
    const processName = String(JSON.parse(line)?.process || '').trim().toLowerCase();
    if (!processName) return null;
    const executable = processName.endsWith('.exe') ? processName : `${processName}.exe`;
    const application = DESKTOP_APPLICATIONS.find((entry) => entry.processes.some((name) => name.toLowerCase() === executable));
    return application ? Object.freeze({ id: application.id, label: application.label }) : null;
  } catch {
    return null;
  }
}

async function desktopApplicationStatus({ platform = process.platform, listProcesses = execFileAsync, listVisibleWindows = visibleWindowProcessNames, env = process.env, exists, supremoWindow = controlSupremoWindow, supremoPrivilege = supremoPrivilegeReady } = {}) {
  if (platform !== 'win32') return DESKTOP_APPLICATIONS.map(({ id, label, icon }) => ({ id, label, icon, available: false, open: false, canClose: false }));
  let running = new Set();
  try {
    const { stdout = '' } = await listProcesses('tasklist.exe', ['/FO', 'CSV', '/NH'], {
      windowsHide: true, timeout: 2_000, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024
    });
    running = parseTaskList(stdout);
  } catch {}
  let visible = running;
  try { visible = await listVisibleWindows({ env }); } catch {}
  const supremoRunning = running.has('supremo.exe');
  if (!supremoRunning) supremoRequestedVisible = false;
  let supremoVisible = supremoRunning && supremoRequestedVisible;
  if (supremoRunning) {
    try { supremoVisible = (await supremoWindow('status', { env })).visible || supremoVisible; } catch {}
  }
  const supremoAdminReady = await supremoPrivilege({ env });
  return DESKTOP_APPLICATIONS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    icon: entry.icon,
    available: Boolean(resolveExecutable(entry.id, { env, exists })),
    // Per le app interattive "aperta" significa finestra realmente visibile:
    // i processi Chromium residenti non devono trasformare il tap Apri in Chiudi.
    open: entry.id === 'supremo' ? supremoVisible : entry.processes.some((name) => visible.has(name.toLowerCase())),
    canClose: entry.processes.length > 0,
    ...(entry.id === 'supremo' ? { adminReady: supremoAdminReady } : {})
  }));
}

async function openDesktopApplication(id, { platform = process.platform, env = process.env, exists, spawnProcess = spawn, supremoWindow = controlSupremoWindow, supremoOpen = openSupremoPrivileged } = {}) {
  const application = APPLICATION_BY_ID.get(String(id || ''));
  if (!application) throw Object.assign(new Error('Applicazione non consentita.'), { code: 'DESKTOP_APP_NOT_ALLOWED' });
  if (platform !== 'win32') throw Object.assign(new Error('Applicazione disponibile solo su Windows.'), { code: 'DESKTOP_APP_UNSUPPORTED' });
  if (application.id === 'supremo') {
    try {
      const state = await supremoWindow('open', { env });
      if (state.found && state.visible) {
        supremoRequestedVisible = true;
        return Object.freeze({ id: application.id, launched: true, elevated: null });
      }
    } catch {}
    try {
      await supremoOpen({ env });
      return Object.freeze({ id: application.id, launched: true, elevated: true });
    } catch (error) {
      if (error?.code !== 'DESKTOP_APP_ELEVATION_REQUIRED') throw error;
    }
  }
  const executable = resolveExecutable(application.id, { env, exists });
  if (!executable) throw Object.assign(new Error('Applicazione non installata.'), { code: 'DESKTOP_APP_UNAVAILABLE' });
  const args = application.id === 'brave' ? ['--new-window'] : [];
  await new Promise((resolve, reject) => {
    // windowsHide viene usato per i processi tecnici, non per una UI richiesta
    // esplicitamente: su Chromium può creare un processo senza finestra visibile.
    const child = spawnProcess(executable, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('spawn', resolve);
    child.once('error', reject);
    child.unref?.();
  });
  if (application.id === 'supremo') supremoRequestedVisible = true;
  return Object.freeze({ id: application.id, launched: true });
}

async function closeDesktopApplication(id, { platform = process.platform, terminateProcess = execFileAsync, supremoWindow = controlSupremoWindow, supremoClose = closeSupremoPrivileged } = {}) {
  const application = APPLICATION_BY_ID.get(String(id || ''));
  if (!application) throw Object.assign(new Error('Applicazione non consentita.'), { code: 'DESKTOP_APP_NOT_ALLOWED' });
  if (platform !== 'win32') throw Object.assign(new Error('Applicazione disponibile solo su Windows.'), { code: 'DESKTOP_APP_UNSUPPORTED' });
  if (application.id === 'supremo') {
    const state = await supremoWindow('status');
    if (!state.found) return Object.freeze({ id: application.id, closed: false, alreadyClosed: true });
    await supremoClose({ supremoWindow });
    return Object.freeze({ id: application.id, closed: true, alreadyClosed: false });
  }
  let matched = false;
  const processNames = [...new Set(application.processes.map((name) => name.toLowerCase()))];
  for (const processName of processNames) {
    try {
      await terminateProcess('taskkill.exe', ['/IM', processName, '/T'], {
        windowsHide: true, timeout: 4_000, encoding: 'utf8'
      });
      matched = true;
    } catch (error) {
      const output = `${error?.stdout || ''}\n${error?.stderr || ''}`;
      if (/not found|non trovato|impossibile trovare|nessuna attivit|no running instance/i.test(output)) continue;
      // Alcune app multi-processo (in particolare i browser Chromium) non
      // accettano WM_CLOSE tramite taskkill /T. Il comando e gia passato da
      // plan + approvazione esplicita: il fallback /F resta confinato ai soli
      // nomi statici dell'allowlist e non accetta input libero dal client.
      await terminateProcess('taskkill.exe', ['/IM', processName, '/T', '/F'], {
        windowsHide: true, timeout: 5_000, encoding: 'utf8'
      });
      matched = true;
    }
  }
  return Object.freeze({ id: application.id, closed: matched, alreadyClosed: !matched });
}

// #endregion

module.exports = {
  DESKTOP_APPLICATIONS,
  closeDesktopApplication,
  closeSupremoPrivileged,
  controlSupremoWindow,
  desktopApplicationStatus,
  executableCandidates,
  foregroundDesktopApplication,
  openDesktopApplication,
  openSupremoPrivileged,
  parseVisibleProcessNames,
  parseTaskList,
  resolveExecutable,
  supremoPrivilegeReady,
  visibleWindowProcessNames
};
