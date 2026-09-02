/**
 * @module infrastructure/storage/training-store
 * @description Salva soltanto esempi conversazionali approvati esplicitamente per il miglioramento di NEXUSNXS.
 */
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// #region 01 — Normalizzazione per il recupero

const SEARCH_STOPWORDS = new Set(['anche', 'come', 'con', 'dalla', 'delle', 'della', 'degli', 'deve', 'essere', 'fare', 'gli', 'nel', 'nella', 'non', 'per', 'piu', 'questo', 'sono', 'una', 'uno']);
const SENSITIVE_VALUE_PATTERNS = Object.freeze([
  /\b(?:api[_ -]?key|token|password|passwd|pwd|secret|chiave privata|private key)\b\s*[:=]\s*\S+/iu,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\b(?:sk|pk|ghp|github_pat|xox[baprs]|AKIA)[_-]?[A-Za-z0-9_-]{12,}\b/u,
  /\b(?:\d[ -]*?){13,19}\b/u
]);

function containsSensitiveMemory(value) {
  const text = String(value || '');
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(text));
}
function searchTokens(value) {
  return [...new Set(String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('it-IT')
    .match(/[\p{L}\p{N}]{3,}/gu) || [])]
    .filter((token) => !SEARCH_STOPWORDS.has(token))
    .slice(0, 64);
}

function exampleFingerprint(example) {
  return `${String(example.prompt || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase()}\u0000${String(example.response || '').replace(/\s+/g, ' ').trim()}`;
}

function promptFingerprint(example) {
  return String(example?.prompt || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function detectTrainingLanguage(value) {
  const text = String(value || '').toLocaleLowerCase();
  if (/\b(?:the|and|with|from|this|that|should|please|what|how)\b/u.test(text)) return 'en';
  if (/\b(?:il|lo|la|gli|della|come|perché|perche|questa|questo|deve|posso)\b/u.test(text)) return 'it';
  return 'und';
}

function classifyTrainingDomain(value) {
  const text = String(value || '').toLocaleLowerCase();
  if (/\b(?:javascript|typescript|python|java|c\+\+|codice|funzione|bug|debug|api|sql|git)\b/u.test(text)) return 'coding';
  if (/\b(?:sicurezza|security|cyber|vulnerabil|malware|phishing|firewall|prompt injection)\b/u.test(text)) return 'security';
  if (/\b(?:equazione|calcol|matemat|probabilit|percentual|geometri|algebra)\b/u.test(text)) return 'mathematics';
  if (/\b(?:file|cartella|computer|windows|app|processo|terminale|server|rete)\b/u.test(text)) return 'computer-use';
  if (/\b(?:fonte|documento|contesto|knowledge|conoscenza|citazione)\b/u.test(text)) return 'retrieval';
  return 'general';
}

// #endregion

// #region 02 — Archivio append-only e memoria approvata

class TrainingStore {
  constructor({ filePath, clock = () => new Date(), createId = randomUUID }) {
    this.filePath = path.resolve(filePath);
    this.clock = clock;
    this.createId = createId;
  }

  append(example) {
    if (containsSensitiveMemory(example.prompt)
      || containsSensitiveMemory(example.response)
      || containsSensitiveMemory(example.originalResponse)) {
      throw new Error('Questo contenuto può includere dati sensibili e non verrà memorizzato.');
    }
    const fingerprint = exampleFingerprint(example);
    const existing = this.records({ limit: 1000 }).find((record) => exampleFingerprint(record) === fingerprint);
    if (existing) return { status: 'saved', id: existing.id };
    const record = {
      schemaVersion: 4,
      id: this.createId(),
      createdAt: this.clock().toISOString(),
      verifiedAt: this.clock().toISOString(),
      provenance: example.provenance || 'user-approved-conversation',
      confidence: example.originalResponse ? 'verified-correction' : 'approved-example',
      reviewStatus: example.reviewStatus === 'quarantine' ? 'quarantine' : 'approved',
      license: example.license || 'user-approved-private-use',
      language: example.language || detectTrainingLanguage(example.prompt),
      domain: example.domain || classifyTrainingDomain(example.prompt),
      ...(example.consent === true ? { consent: true } : {}),
      ...(Number.isFinite(Number(example.expiresAt)) ? { expiresAt: new Date(Number(example.expiresAt)).toISOString() } : {}),
      ...(example.reviewedBy ? { reviewedBy: String(example.reviewedBy).slice(0, 80) } : {}),
      requestId: example.requestId,
      prompt: example.prompt,
      response: example.response,
      ...(example.originalResponse ? { originalResponse: example.originalResponse } : {}),
      model: example.model,
      mode: example.mode
    };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, { encoding: 'utf8', mode: 0o600 });
    fs.chmodSync(this.filePath, 0o600);
    return { status: 'saved', id: record.id };
  }

  records({ limit = 1000 } = {}) {
    if (!fs.existsSync(this.filePath)) return [];
    try {
      if (fs.statSync(this.filePath).size > 8 * 1024 * 1024) return [];
      return fs.readFileSync(this.filePath, 'utf8').split(/\r?\n/).filter(Boolean).slice(-limit)
        .map((line) => { try { return JSON.parse(line); } catch { return null; } })
        .filter((record) => record?.prompt && record?.response)
        .filter((record) => !record.expiresAt || Date.parse(record.expiresAt) > this.clock().getTime());
    } catch {
      return [];
    }
  }

  revision() {
    try {
      const metadata = fs.statSync(this.filePath);
      return `${metadata.size}:${Math.trunc(metadata.mtimeMs)}`;
    } catch {
      return 'empty';
    }
  }

  stats() {
    const records = this.records();
    const corrected = records.filter((record) => record.originalResponse).length;
    const approved = records.filter((record) => record.reviewStatus !== 'quarantine').length;
    const quarantined = records.filter((record) => record.reviewStatus === 'quarantine').length;
    const evaluationExamples = Math.floor(records.length * 0.2);
    const domains = Object.fromEntries([...new Set(records.map((record) => record.domain || classifyTrainingDomain(record.prompt)))]
      .sort().map((domain) => [domain, records.filter((record) => (record.domain || classifyTrainingDomain(record.prompt)) === domain).length]));
    return {
      examples: records.length,
      approved,
      quarantined,
      corrected,
      preferencePairs: corrected,
      domains,
      evaluationExamples,
      evaluationReady: evaluationExamples >= 4,
      nextMilestone: records.length < 20 ? 20 : Math.ceil((records.length + 1) / 25) * 25
    };
  }

  evaluation() {
    const records = this.records();
    const prompts = records.map((record) => searchTokens(record.prompt));
    const vocabulary = new Set(prompts.flat());
    const corrected = records.filter((record) => record.originalResponse).length;
    const averagePromptTokens = prompts.length
      ? prompts.reduce((sum, tokens) => sum + tokens.length, 0) / prompts.length
      : 0;
    const diversity = records.length
      ? Math.min(100, Math.round((vocabulary.size / Math.max(8, records.length * 3)) * 100))
      : 0;
    const correctionCoverage = records.length ? Math.round((corrected / records.length) * 100) : 0;
    const readiness = Math.min(100, Math.round(
      Math.min(55, records.length * 2.75)
      + diversity * 0.3
      + Math.min(15, correctionCoverage * 0.35)
    ));
    return {
      examples: records.length,
      readiness,
      diversity,
      correctionCoverage,
      averagePromptTokens: Math.round(averagePromptTokens * 10) / 10,
      status: readiness >= 78 ? 'ready' : readiness >= 45 ? 'growing' : 'early'
    };
  }

  clear() {
    if (!fs.existsSync(this.filePath)) return { removed: 0 };
    const removed = this.records().length;
    fs.rmSync(this.filePath, { force: true });
    return { removed };
  }

  replace(records = []) {
    const valid = records.slice(-1000).filter((record) => record?.prompt && record?.response)
      .filter((record) => !containsSensitiveMemory(record.prompt)
        && !containsSensitiveMemory(record.response)
        && !containsSensitiveMemory(record.originalResponse));
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, valid.map((record) => JSON.stringify(record)).join('\n') + (valid.length ? '\n' : ''), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    fs.chmodSync(this.filePath, 0o600);
    return valid.length;
  }

  findRelevant(query, { limit = 2 } = {}) {
    if (!fs.existsSync(this.filePath)) return [];
    const queryTokens = searchTokens(query);
    if (!queryTokens.length) return [];
    let content;
    try {
      if (fs.statSync(this.filePath).size > 8 * 1024 * 1024) return [];
      content = fs.readFileSync(this.filePath, 'utf8');
    } catch {
      return [];
    }
    return content.split(/\r?\n/)
      .filter(Boolean)
      .slice(-500)
      .map((line, index) => {
        try {
          const record = JSON.parse(line);
          if (!record?.prompt || !record?.response || record.reviewStatus === 'quarantine'
            || (record.expiresAt && Date.parse(record.expiresAt) <= this.clock().getTime())) return null;
          const candidateTokens = new Set(searchTokens(record.prompt));
          const overlap = queryTokens.reduce((score, token) => score + (candidateTokens.has(token) ? 1 : 0), 0);
          const score = overlap / Math.max(2, Math.sqrt(queryTokens.length * Math.max(1, candidateTokens.size)));
          return score > 0 ? {
            prompt: String(record.prompt).slice(0, 4000),
            response: String(record.response).slice(0, 8000),
            score,
            provenance: record.provenance || 'legacy-approved-example',
            verifiedAt: record.verifiedAt || record.createdAt || null,
            index
          } : null;
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((left, right) => right.score - left.score || right.index - left.index)
      .slice(0, Math.max(0, Math.min(4, limit)))
      .map(({ prompt, response, score, provenance, verifiedAt }) => ({ prompt, response, score, provenance, verifiedAt }));
  }
}

module.exports = {
  TrainingStore,
  classifyTrainingDomain,
  containsSensitiveMemory,
  detectTrainingLanguage,
  exampleFingerprint,
  promptFingerprint,
  searchTokens
};

// #endregion
