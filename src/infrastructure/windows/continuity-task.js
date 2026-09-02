/**
 * @module infrastructure/windows/continuity-task
 * @description Registra NexusNXS come attività utente resiliente senza richiedere privilegi amministrativi.
 */
const { execFile, spawnSync } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const TASK_NAME = 'NexusNXS Connectivity';
const PRESENCE_TASK_NAME = 'NexusNXS Presence';

// #region Processi CLI posseduti dalla UI

function commandAbortError(reason) {
  const error = new Error('Comando annullato durante la chiusura di NexusNXS.', { cause: reason });
  error.name = 'AbortError';
  error.code = 'ABORT_ERR';
  return error;
}

function terminateOwnedCommandTree(child, platform = process.platform) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return false;
  if (platform === 'win32' && Number.isInteger(child.pid)) {
    const result = spawnSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    if (result.status === 0) return true;
  }
  try { return child.kill('SIGKILL'); } catch { return false; }
}

/**
 * Crea un esecutore che possiede esclusivamente i processi figli avviati
 * attraverso di esso. Lo shutdown non cerca processi per nome e non arresta
 * servizi di sistema: annulla soltanto i comandi CLI appartenenti alla UI.
 */
function createTrackedExecFileRunner({ launch = execFile, terminate = terminateOwnedCommandTree } = {}) {
  const active = new Set();
  let stopped = false;
  let shutdownPromise = null;

  const run = (executable, args = [], options = {}) => {
    const inheritedSignal = options.signal;
    if (stopped || inheritedSignal?.aborted) {
      return Promise.reject(commandAbortError(inheritedSignal?.reason));
    }

    const controller = new AbortController();
    const entry = { child: null, controller, promise: null };
    let removeInheritedAbort = () => {};
    const promise = new Promise((resolve, reject) => {
      let settled = false;
      const complete = (error, stdout, stderr) => {
        if (settled) return;
        settled = true;
        removeInheritedAbort();
        active.delete(entry);
        if (error) reject(error);
        else resolve({ stdout, stderr });
      };

      if (inheritedSignal) {
        const forwardAbort = () => controller.abort(inheritedSignal.reason);
        inheritedSignal.addEventListener('abort', forwardAbort, { once: true });
        removeInheritedAbort = () => inheritedSignal.removeEventListener('abort', forwardAbort);
      }

      active.add(entry);
      try {
        entry.child = launch(executable, args, { ...options, signal: controller.signal }, complete);
      } catch (error) {
        complete(error);
      }
    });
    entry.promise = promise;
    return promise;
  };

  const shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    stopped = true;
    const entries = [...active];
    const pending = entries.map((entry) => entry.promise).filter(Boolean);
    for (const entry of entries) {
      // Prima chiude l'intero albero Windows mentre il PID radice è ancora
      // valido; poi abortisce la promise per sbloccare immediatamente l'IPC.
      terminate(entry.child);
      entry.controller.abort(commandAbortError());
    }
    shutdownPromise = Promise.allSettled(pending).then(() => undefined);
    return shutdownPromise;
  };

  return {
    run,
    shutdown,
    get activeCount() { return active.size; },
    get stopped() { return stopped; }
  };
}

// #endregion

// #region Attivita di continuita Windows

function continuityTaskScript(executable, enabled, userDataRoot = '') {
  const encodedExecutable = Buffer.from(String(executable || ''), 'utf8').toString('base64');
  const encodedUserData = Buffer.from(String(userDataRoot || ''), 'utf8').toString('base64');
  if (!enabled) return [TASK_NAME, PRESENCE_TASK_NAME]
    .map((name) => `Unregister-ScheduledTask -TaskName '${name}' -Confirm:$false -ErrorAction SilentlyContinue`)
    .join(';');
  return [
    `$exe=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedExecutable}'))`,
    `$data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedUserData}'))`,
    `$suffix=if($data){' --user-data-root="'+$data.Replace('"','')+'"'}else{''}`,
    `$trigger=New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME`,
    `$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew`,
    `$core=New-ScheduledTaskAction -Execute $exe -Argument ('--background'+$suffix)`,
    `$presence=New-ScheduledTaskAction -Execute $exe -Argument ('--presence'+$suffix)`,
    `Register-ScheduledTask -TaskName '${TASK_NAME}' -Action $core -Trigger $trigger -Settings $settings -Description 'Mantiene disponibile il Core NexusNXS per i dispositivi associati.' -Force | Out-Null`,
    `Register-ScheduledTask -TaskName '${PRESENCE_TASK_NAME}' -Action $presence -Trigger $trigger -Settings $settings -Description 'Mostra la presenza di sistema NexusNXS senza caricare AI o database.' -Force | Out-Null`
  ].join(';');
}

function continuityTaskStatusScript() {
  return `$core=Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue;`+
    `$presence=Get-ScheduledTask -TaskName '${PRESENCE_TASK_NAME}' -ErrorAction SilentlyContinue;`+
    `if($core -and $presence){'enabled'}elseif($core -or $presence){'partial'}else{'disabled'}`;
}

async function continuityTaskStatus({ platform = process.platform, runCommand = execFileAsync, signal } = {}) {
  if (platform !== 'win32') return { available: false, enabled: false, complete: false };
  const encoded = Buffer.from(continuityTaskStatusScript(), 'utf16le').toString('base64');
  try {
    const result = await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
      timeout: 15_000,
      ...(signal ? { signal } : {})
    });
    const state = String(result?.stdout || '').trim().toLowerCase();
    return { available: true, enabled: state !== 'disabled', complete: state === 'enabled' };
  } catch {
    return { available: true, enabled: false, complete: false };
  }
}

async function configureContinuityTask({ executable = process.execPath, enabled = true, platform = process.platform, userDataRoot = '', runCommand = execFileAsync, signal } = {}) {
  if (platform !== 'win32') return { available: false, enabled: false };
  const encoded = Buffer.from(continuityTaskScript(executable, enabled, userDataRoot), 'utf16le').toString('base64');
  await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
    windowsHide: true,
    timeout: 30_000,
    ...(signal ? { signal } : {})
  });
  return { available: true, enabled: Boolean(enabled), taskName: TASK_NAME };
}

module.exports = { TASK_NAME, PRESENCE_TASK_NAME, configureContinuityTask, continuityTaskScript, continuityTaskStatus, continuityTaskStatusScript, createTrackedExecFileRunner, terminateOwnedCommandTree };

// #endregion
