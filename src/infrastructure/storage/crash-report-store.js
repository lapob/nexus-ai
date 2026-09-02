/**
 * @module infrastructure/storage/crash-report-store
 * @description Registro locale limitato di arresti anomali, privo di contenuti personali.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class CrashReportStore {
  constructor({ filePath, enabled = true, limit = 20 } = {}) {
    this.filePath = filePath;
    this.enabled = enabled;
    this.limit = Math.max(1, Math.min(100, Number(limit) || 20));
  }

  append(kind, details = {}) {
    if (!this.enabled || !this.filePath) return null;
    const safe = {
      kind: String(kind || 'unknown').slice(0, 48),
      reason: String(details.reason || 'unknown').slice(0, 80),
      exitCode: Number.isInteger(details.exitCode) ? details.exitCode : null
    };
    const report = {
      code: crypto.createHash('sha256').update(JSON.stringify(safe)).digest('hex').slice(0, 12).toUpperCase(),
      occurredAt: new Date().toISOString(),
      ...safe
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    let records = [];
    try { records = JSON.parse(fs.readFileSync(this.filePath, 'utf8')); } catch {}
    records = (Array.isArray(records) ? records : []).slice(-(this.limit - 1));
    records.push(report);
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return report;
  }
}

module.exports = { CrashReportStore };
