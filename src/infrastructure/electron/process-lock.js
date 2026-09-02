/**
 * @module infrastructure/electron/process-lock
 * @description Impedisce avvii headless concorrenti senza interferire con il lock della UI Electron.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// #region 01 — Lock inspection

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readLock(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      pid: Number(value.pid),
      token: typeof value.token === 'string' ? value.token : '',
      createdAt: Number(value.createdAt) || 0
    };
  } catch {
    return null;
  }
}

function requestFilePath(filePath) {
  return `${path.resolve(filePath)}.shutdown`;
}

function reclaimFilePath(filePath) {
  return `${path.resolve(filePath)}.reclaim`;
}

function writeLock(descriptor, { pid, token, createdAt }) {
  fs.writeFileSync(descriptor, JSON.stringify({
    schemaVersion: 1,
    pid,
    token,
    createdAt
  }), 'utf8');
  fs.fsyncSync(descriptor);
}

function readShutdownRequest(filePath) {
  try {
    const value = JSON.parse(fs.readFileSync(requestFilePath(filePath), 'utf8'));
    return {
      pid: Number(value.pid),
      token: typeof value.token === 'string' ? value.token : '',
      requestedAt: Number(value.requestedAt) || 0
    };
  } catch {
    return null;
  }
}

function requestProcessShutdown(filePath, { now = Date.now, processAlive = isProcessAlive } = {}) {
  const resolvedPath = path.resolve(filePath);
  const lock = readLock(resolvedPath);
  if (!lock || !lock.token || !processAlive(lock.pid)) {
    return { requested: false, reason: lock ? 'process-offline' : 'lock-missing' };
  }
  fs.writeFileSync(requestFilePath(resolvedPath), JSON.stringify({
    schemaVersion: 1,
    pid: lock.pid,
    token: lock.token,
    requestedAt: now()
  }), { encoding: 'utf8', mode: 0o600 });
  return { requested: true, pid: lock.pid };
}

// #endregion

// #region 02 — Lock lifecycle

class ProcessLock {
  constructor({ filePath, pid = process.pid, processAlive = isProcessAlive, now = Date.now } = {}) {
    if (!filePath) throw new Error('Percorso lock di processo mancante.');
    this.filePath = path.resolve(filePath);
    this.pid = Number(pid);
    this.processAlive = processAlive;
    this.now = now;
    this.token = randomUUID();
    this.owned = false;
    this.shutdownTimer = null;
  }

  createLockFile() {
    const descriptor = fs.openSync(this.filePath, 'wx', 0o600);
    try {
      writeLock(descriptor, {
        pid: this.pid,
        token: this.token,
        createdAt: this.now()
      });
    } finally {
      fs.closeSync(descriptor);
    }
  }

  acquireReclaimLease() {
    const leasePath = reclaimFilePath(this.filePath);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const descriptor = fs.openSync(leasePath, 'wx', 0o600);
        try {
          writeLock(descriptor, {
            pid: this.pid,
            token: this.token,
            createdAt: this.now()
          });
        } finally {
          fs.closeSync(descriptor);
        }
        return true;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const lease = readLock(leasePath);
        if (lease && this.processAlive(lease.pid)) return false;
        let ageMs = 0;
        try { ageMs = this.now() - fs.statSync(leasePath).mtimeMs; } catch {}
        if (!lease && ageMs < 30_000) return false;
        try { fs.rmSync(leasePath); } catch { return false; }
      }
    }
    return false;
  }

  releaseReclaimLease() {
    const leasePath = reclaimFilePath(this.filePath);
    const lease = readLock(leasePath);
    if (!lease || lease.pid !== this.pid || lease.token !== this.token) return false;
    try {
      fs.rmSync(leasePath);
      return true;
    } catch {
      return false;
    }
  }

  acquire() {
    if (this.owned) return true;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        this.createLockFile();
        this.owned = true;
        return true;
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        const existing = readLock(this.filePath);
        if (existing && this.processAlive(existing.pid)) return false;
        // Un file appena creato ma non ancora popolato può appartenere a un
        // processo concorrente. Attendere evita che due bootstrap rimuovano
        // reciprocamente il lock durante la stretta finestra di scrittura.
        let ageMs = 0;
        try { ageMs = this.now() - fs.statSync(this.filePath).mtimeMs; } catch {}
        if (!existing && ageMs < 30_000) return false;
        // La sostituzione di un lock obsoleto è serializzata da un lease
        // laterale creato con O_EXCL. Senza il lease, due avvii simultanei
        // potrebbero entrambi cancellare il lock appena scritto dal rivale.
        if (!this.acquireReclaimLease()) return false;
        try {
          const current = readLock(this.filePath);
          if (current && this.processAlive(current.pid)) return false;
          let currentAgeMs = Infinity;
          try { currentAgeMs = this.now() - fs.statSync(this.filePath).mtimeMs; } catch {}
          if (!current && currentAgeMs < 30_000) return false;
          try { fs.rmSync(this.filePath, { force: true }); } catch { return false; }
          try {
            this.createLockFile();
            this.owned = true;
            return true;
          } catch (createError) {
            if (createError?.code !== 'EEXIST') throw createError;
          }
        } finally {
          this.releaseReclaimLease();
        }
      }
    }
    return false;
  }

  onShutdownRequested(callback, { pollIntervalMs = 250 } = {}) {
    if (!this.owned) throw new Error('Il lock deve essere acquisito prima di osservare lo shutdown.');
    if (typeof callback !== 'function') throw new TypeError('Callback di shutdown mancante.');
    if (this.shutdownTimer) return () => this.stopShutdownWatcher();
    const inspect = () => {
      const request = readShutdownRequest(this.filePath);
      if (!request || request.pid !== this.pid || request.token !== this.token) return;
      this.stopShutdownWatcher();
      try { fs.rmSync(requestFilePath(this.filePath), { force: true }); } catch {}
      callback(request);
    };
    this.shutdownTimer = setInterval(inspect, Math.max(50, Number(pollIntervalMs) || 250));
    this.shutdownTimer.unref?.();
    inspect();
    return () => this.stopShutdownWatcher();
  }

  stopShutdownWatcher() {
    if (!this.shutdownTimer) return false;
    clearInterval(this.shutdownTimer);
    this.shutdownTimer = null;
    return true;
  }

  release() {
    if (!this.owned) return false;
    this.stopShutdownWatcher();
    const existing = readLock(this.filePath);
    if (!existing || existing.token !== this.token || existing.pid !== this.pid) {
      this.owned = false;
      return false;
    }
    try {
      fs.rmSync(this.filePath, { force: true });
      this.owned = false;
      const request = readShutdownRequest(this.filePath);
      if (request?.pid === this.pid && request.token === this.token) {
        try { fs.rmSync(requestFilePath(this.filePath), { force: true }); } catch {}
      }
      return true;
    } catch {
      return false;
    }
  }
}

// #endregion

module.exports = {
  ProcessLock,
  isProcessAlive,
  readLock,
  readShutdownRequest,
  reclaimFilePath,
  requestFilePath,
  requestProcessShutdown
};
