/**
 * @module tests/windows-continuity
 * @description Verifica che il gateway NexusNXS venga registrato come attività Windows resiliente.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  configureContinuityTask,
  continuityTaskScript,
  createTrackedExecFileRunner,
  terminateOwnedCommandTree
} = require('../src/infrastructure/windows/continuity-task');

test('il watchdog parte al login e riavvia NexusNXS senza duplicare processi', () => {
  const executable = 'C:\\Program Files\\NexusNXS\\NexusNXS.exe';
  const script = continuityTaskScript(executable, true);
  assert.match(script, /New-ScheduledTaskTrigger -AtLogOn/);
  assert.match(script, /--background/);
  assert.match(script, /--presence/);
  assert.match(script, /NexusNXS Presence/);
  assert.match(script, /RestartCount 999/);
  assert.match(script, /RestartInterval \(New-TimeSpan -Minutes 1\)/);
  assert.match(script, /MultipleInstances IgnoreNew/);
  assert.doesNotMatch(script, /RunLevel Highest|User SYSTEM/);
});

test('la disattivazione rimuove soltanto il watchdog NexusNXS', () => {
  const script = continuityTaskScript('ignored', false);
  assert.match(script, /Unregister-ScheduledTask/);
  assert.match(script, /NexusNXS Connectivity/);
  assert.match(script, /NexusNXS Presence/);
  assert.match(script, /Confirm:\$false/);
});

test('la configurazione del watchdog usa il runner posseduto dalla UI', async () => {
  const calls = [];
  const signal = new AbortController().signal;
  const result = await configureContinuityTask({
    executable: 'C:\\NexusNXS.exe',
    enabled: true,
    platform: 'win32',
    userDataRoot: 'C:\\NexusData',
    signal,
    runCommand: async (...args) => { calls.push(args); return { stdout: '', stderr: '' }; }
  });

  assert.equal(result.available, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'powershell.exe');
  assert.deepEqual(calls[0][1].slice(0, 3), ['-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.equal(calls[0][2].signal, signal);
});

test('il runner rimuove i comandi completati dal registro', async () => {
  let complete;
  const runner = createTrackedExecFileRunner({
    launch: (_file, _args, _options, callback) => {
      complete = callback;
      return { killed: false, kill() { this.killed = true; } };
    }
  });

  const pending = runner.run('tailscale.exe', ['version']);
  assert.equal(runner.activeCount, 1);
  complete(null, '1.0', '');
  assert.deepEqual(await pending, { stdout: '1.0', stderr: '' });
  assert.equal(runner.activeCount, 0);
  await runner.shutdown();
});

test('lo shutdown annulla soltanto i processi figli posseduti e impedisce nuovi comandi', async () => {
  const children = [];
  let launches = 0;
  const unrelatedService = { killed: false };
  const runner = createTrackedExecFileRunner({
    terminate: (child) => child.kill(),
    launch: (_file, _args, options, callback) => {
      launches += 1;
      const child = {
        killed: false,
        kill() {
          if (this.killed) return false;
          this.killed = true;
          const error = new Error('aborted');
          error.name = 'AbortError';
          error.code = 'ABORT_ERR';
          callback(error);
          return true;
        }
      };
      options.signal.addEventListener('abort', () => child.kill(), { once: true });
      children.push(child);
      return child;
    }
  });

  const powershell = runner.run('powershell.exe', ['-NoProfile']);
  const tailscale = runner.run('tailscale.exe', ['status']);
  const rejected = Promise.all([
    assert.rejects(powershell, { name: 'AbortError', code: 'ABORT_ERR' }),
    assert.rejects(tailscale, { name: 'AbortError', code: 'ABORT_ERR' })
  ]);
  assert.equal(runner.activeCount, 2);

  await runner.shutdown();
  await rejected;
  assert.equal(runner.activeCount, 0);
  assert.equal(runner.stopped, true);
  assert.equal(children.every((child) => child.killed), true);
  assert.equal(unrelatedService.killed, false);
  await assert.rejects(runner.run('powershell.exe', []), { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(launches, 2);
});

test('il terminatore usa un fallback diretto per un figlio senza PID Windows valido', () => {
  const child = { exitCode: null, signalCode: null, killed: false, kill(signal) { this.killed = signal; return true; } };
  assert.equal(terminateOwnedCommandTree(child, 'win32'), true);
  assert.equal(child.killed, 'SIGKILL');
});

test('gli handler IPC instradano PowerShell, Tailscale e continuity nel registro di shutdown', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'application', 'register-ipc.js'), 'utf8');
  assert.match(source, /createTrackedExecFileRunner\(\)/);
  assert.match(source, /runCommand: runUiCommand/);
  assert.match(source, /runUiCommand\('powershell\.exe'/);
  assert.match(source, /uiCommandRunner\.shutdown\(\)/);
  assert.doesNotMatch(source, /execFileAsync\((?:candidate|executable|'powershell\.exe')/);
});
