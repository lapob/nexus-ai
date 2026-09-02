const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  ProcessLock,
  readLock,
  requestFilePath,
  requestProcessShutdown
} = require('../src/infrastructure/electron/process-lock');

test('un solo processo possiede il lock headless e il rilascio è autenticato', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-process-lock-'));
  const filePath = path.join(root, 'server.lock');
  try {
    const first = new ProcessLock({ filePath, pid: 101, processAlive: (pid) => pid === 101 });
    const second = new ProcessLock({ filePath, pid: 202, processAlive: (pid) => pid === 101 });
    assert.equal(first.acquire(), true);
    assert.equal(readLock(filePath).pid, 101);
    assert.equal(second.acquire(), false);
    assert.equal(second.release(), false);
    assert.equal(first.release(), true);
    assert.equal(fs.existsSync(filePath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('un lock obsoleto viene sostituito ma uno corrotto recente resta protetto', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stale-lock-'));
  const filePath = path.join(root, 'server.lock');
  try {
    fs.writeFileSync(filePath, JSON.stringify({ pid: 77, token: 'old', createdAt: 1 }), 'utf8');
    const replacement = new ProcessLock({ filePath, pid: 303, processAlive: () => false, now: () => Date.now() });
    assert.equal(replacement.acquire(), true);
    assert.equal(readLock(filePath).pid, 303);
    assert.equal(replacement.release(), true);

    fs.writeFileSync(filePath, '{', 'utf8');
    const cautious = new ProcessLock({ filePath, pid: 404, processAlive: () => false, now: () => Date.now() });
    assert.equal(cautious.acquire(), false);
    assert.equal(fs.existsSync(filePath), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('due processi che recuperano lo stesso lock stale non diventano entrambi proprietari', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-lock-race-'));
  const filePath = path.join(root, 'server.lock');
  const modulePath = path.resolve(__dirname, '..', 'src', 'infrastructure', 'electron', 'process-lock.js');
  fs.writeFileSync(filePath, JSON.stringify({ pid: 999_999, token: 'stale', createdAt: 1 }), 'utf8');
  const startAt = Date.now() + 500;
  const program = `
    const { ProcessLock } = require(process.env.NEXUS_LOCK_MODULE);
    const lock = new ProcessLock({ filePath: process.env.NEXUS_LOCK_PATH });
    const wait = Math.max(0, Number(process.env.NEXUS_LOCK_START) - Date.now());
    setTimeout(() => {
      const acquired = lock.acquire();
      process.stdout.write(acquired ? 'acquired' : 'blocked');
      if (acquired) setTimeout(() => { lock.release(); }, 750);
    }, wait);
  `;
  const launch = () => new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(process.execPath, ['-e', program], {
      env: {
        ...process.env,
        NEXUS_LOCK_MODULE: modulePath,
        NEXUS_LOCK_PATH: filePath,
        NEXUS_LOCK_START: String(startAt)
      },
      windowsHide: true
    });
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? resolve(stdout) : reject(new Error(stderr || `child ${code}`)));
  });
  try {
    const results = await Promise.all([launch(), launch()]);
    assert.equal(results.filter((value) => value === 'acquired').length, 1);
    assert.equal(results.filter((value) => value === 'blocked').length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('la richiesta di shutdown usa pid e nonce del lock posseduto', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-lock-shutdown-'));
  const filePath = path.join(root, 'server.lock');
  const lock = new ProcessLock({ filePath });
  try {
    assert.equal(lock.acquire(), true);
    const observed = new Promise((resolve) => lock.onShutdownRequested(resolve, { pollIntervalMs: 25 }));
    const request = requestProcessShutdown(filePath);
    assert.equal(request.requested, true);
    assert.equal(request.pid, process.pid);
    const payload = await observed;
    assert.equal(payload.pid, process.pid);
    assert.equal(payload.token, readLock(filePath).token);
    assert.equal(fs.existsSync(requestFilePath(filePath)), false);
    assert.equal(lock.release(), true);
  } finally {
    lock.release();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
