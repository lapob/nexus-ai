/**
 * @module security/abuse-guard
 * @description Quote persistenti e rilevamento conservativo dei tentativi di esfiltrazione della knowledge.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXTRACTION_PATTERNS = [
  /\b(?:dump|export|reveal|extract|print|list|show)\b.{0,50}\b(?:knowledge|corpus|documents?|sources?|system prompt|internal context)\b/iu,
  /\b(?:mostra|elenca|rivela|estrai|esporta|stampa|ricostruisci)\b.{0,60}\b(?:knowledge|conoscenza interna|documenti|fonti interne|prompt di sistema|contesto interno)\b/iu,
  /\b(?:repeat|continue|next)\b.{0,40}\b(?:document|chunk|source|context)\b/iu,
  /\b(?:ignora|ignore)\b.{0,80}\b(?:istruzioni|instructions|policy|regole)\b/iu
];

function extractionRisk(text) {
  const value = String(text || '').slice(0, 12_000);
  return EXTRACTION_PATTERNS.reduce((score, pattern) => score + (pattern.test(value) ? 1 : 0), 0);
}

class PersistentQuotaStore {
  constructor({ filePath, windowMs = 24 * 60 * 60 * 1000, maxBuckets = 4096 } = {}) {
    this.filePath = filePath;
    this.windowMs = windowMs;
    this.maxBuckets = Math.max(1, Math.min(100_000, Number(maxBuckets) || 4096));
    this.state = this.read();
  }

  read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (parsed?.schemaVersion === 1 && typeof parsed.salt === 'string' && parsed.buckets) return parsed;
    } catch {}
    return { schemaVersion: 1, salt: crypto.randomBytes(24).toString('base64url'), buckets: {} };
  }

  key(value) {
    return crypto.createHmac('sha256', this.state.salt).update(String(value)).digest('hex');
  }

  allow(identifier, { cost = 1, limit = 200, now = Date.now() } = {}) {
    const key = this.key(identifier);
    const current = this.state.buckets[key];
    if (!current && Object.keys(this.state.buckets).length >= this.maxBuckets) {
      // Expired buckets have no enforcement value. Remove them before failing
      // closed so an address flood cannot grow the persistent state forever.
      for (const [bucketKey, bucket] of Object.entries(this.state.buckets)) {
        if (!bucket || now - Number(bucket.startedAt) >= this.windowMs) delete this.state.buckets[bucketKey];
      }
      if (Object.keys(this.state.buckets).length >= this.maxBuckets) return false;
    }
    const bucket = !current || now - current.startedAt >= this.windowMs
      ? { startedAt: now, used: 0 }
      : current;
    if (bucket.used + cost > limit) return false;
    bucket.used += cost;
    this.state.buckets[key] = bucket;
    this.prune(now);
    this.persist();
    return true;
  }

  prune(now = Date.now()) {
    for (const [key, bucket] of Object.entries(this.state.buckets)) {
      if (!bucket || now - Number(bucket.startedAt) >= this.windowMs * 2) delete this.state.buckets[key];
    }
  }

  persist() {
    if (!this.filePath) return;
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    try { fs.chmodSync(this.filePath, 0o600); } catch {}
  }
}

module.exports = { PersistentQuotaStore, extractionRisk };
