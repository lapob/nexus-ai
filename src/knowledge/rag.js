/**
 * @module knowledge/rag
 * @description Indicizza le note Markdown e recupera contesto locale con provenienza.
 */
// #region 01 — Parsing e policy di indicizzazione

const fs = require('node:fs');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

// Le voci sono già senza accenti perché tokenize normalizza prima del confronto.
const STOP = new Set('a ad al alla alle anche che chi con cosa da dal dalla dei del della di dove due e ed frasi gli ha i il in io la le lo ma mi nel nella non o per perche piu quale quando quanto se si sia sono su tra un una come spiegami scrivi suggerisci breve semplici'.split(' '));

// Normalizza accenti e parole comuni per un retrieval lessicale prevedibile.
// È una base trasparente: in futuro potrà precedere embedding e reranking locali.
function tokenize(text) {
  return (text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z0-9]{2,}/g) || [])
    .filter((word) => !STOP.has(word));
}

function parseFrontmatter(raw) {
  // Per il ranking servono pochi campi scalari; non è necessario introdurre una
  // dipendenza YAML completa in questa prima versione.
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([\w-]+):\s*(.*)$/);
    if (pair) meta[pair[1]] = pair[2].replace(/^['"]|['"]$/g, '');
  }
  return { meta, body: raw.slice(match[0].length) };
}

function walk(directory) {
  const files = [];
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    // Non indicizzare configurazione Obsidian, cartelle nascoste o il codice app.
    if (item.name.startsWith('.') || item.name === 'NexusAI') continue;
    const full = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...walk(full));
    else if (item.isFile() && item.name.endsWith('.md')) files.push(full);
  }
  return files;
}

function retrievalPolicy(vaultPath, file, meta) {
  const relativePath = path.relative(vaultPath, file).replaceAll('\\', '/');
  if (meta.rag === 'false') return { include: false, relativePath };
  if (relativePath.startsWith('05_Risorse/Templates/')) return { include: false, relativePath };
  if (relativePath.startsWith('99_Archivio/')) return { include: false, relativePath };

  // Le note professionali possono contenere informazioni riservate. Restano
  // escluse finché la singola nota non contiene un opt-in esplicito.
  if (relativePath.startsWith('07_Lavoro/') && meta.rag !== 'true') {
    return { include: false, relativePath };
  }
  return { include: true, relativePath };
}

function splitSections(body) {
  // Un chunk coincide con una sezione Markdown: conserva contesto migliore di
  // tagli arbitrari per numero di caratteri e produce citazioni leggibili.
  const lines = body.split(/\r?\n/);
  const title = (lines.find((line) => line.startsWith('# ')) || '# Senza titolo').slice(2).trim();
  const sections = [];
  let heading = 'Introduzione';
  let buffer = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text && !/^[-*]\s*$/.test(text)) sections.push({ heading, text });
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(/^#{2,4}\s+(.+)$/);
    if (match) { flush(); heading = match[1].trim(); }
    else if (!line.startsWith('# ')) buffer.push(line);
  }
  flush();
  return { title, sections };
}

const COURSE_META_HEADINGS = new Set([
  'obiettivi di apprendimento',
  'percorso consigliato',
  'laboratorio guidato',
  "verifica dell'apprendimento"
]);

function retrievableSections(sections) {
  return sections.filter((section) => !COURSE_META_HEADINGS.has(String(section.heading).trim().toLowerCase())
    && !String(section.text).includes('nexus-course-v1'));
}

// #endregion

// #region 02 — Indice e retrieval

class NexusIndex {
  constructor(vaultPath, { cachePath = '' } = {}) {
    this.vaultPath = vaultPath;
    this.cachePath = cachePath ? path.resolve(cachePath) : '';
    this.chunks = [];
    this.indexedAt = null;
    this.fileCache = new Map();
    this.activeRebuilds = new Map();
    this.disposed = false;
    this.loadPersistentCache();
  }

  loadPersistentCache() {
    if (!this.cachePath) return false;
    try {
      const payload = JSON.parse(fs.readFileSync(this.cachePath, 'utf8'));
      if (payload?.schemaVersion !== 2 || payload.vaultPath !== path.resolve(this.vaultPath)
        || !Array.isArray(payload.fileCache)) return false;
      this.fileCache = new Map(payload.fileCache);
      this.chunks = [...this.fileCache.values()].flatMap((entry) => Array.isArray(entry.chunks) ? entry.chunks : []);
      this.indexedAt = payload.indexedAt || null;
      return true;
    } catch {
      return false;
    }
  }

  savePersistentCache() {
    if (!this.cachePath) return;
    const temporary = `${this.cachePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify({
      schemaVersion: 2,
      vaultPath: path.resolve(this.vaultPath),
      indexedAt: this.indexedAt,
      fileCache: [...this.fileCache.entries()]
    }), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, this.cachePath);
  }

  rebuild() {
    if (this.disposed) throw new Error('Indice knowledge arrestato.');
    // I file invariati riusano i chunk già analizzati. Il risultato rimane
    // deterministico, mentre le reindicizzazioni successive evitano di rileggere
    // l'intera vault e rimuovono automaticamente le note eliminate.
    const nextCache = new Map();
    for (const file of walk(this.vaultPath)) {
      const stat = fs.statSync(file);
      const cached = this.fileCache.get(file);
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        nextCache.set(file, cached);
        continue;
      }
      const raw = fs.readFileSync(file, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      if (meta.status === 'deprecated') continue;
      const policy = retrievalPolicy(this.vaultPath, file, meta);
      if (!policy.include) continue;
      const { title, sections } = splitSections(body);
      const chunks = retrievableSections(sections).map((section) => {
        const content = `${title}\n${section.heading}\n${section.text}`;
        return {
          title,
          heading: section.heading,
          text: section.text.slice(0, 4000),
          relativePath: policy.relativePath,
          status: meta.status || 'draft',
          sourceKind: meta.source_kind || 'curated',
          area: meta.area || 'general',
          tokens: tokenize(content)
        };
      });
      nextCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, chunks });
    }
    this.fileCache = nextCache;
    this.chunks = [...nextCache.values()].flatMap((entry) => entry.chunks);
    this.indexedAt = new Date().toISOString();
    this.savePersistentCache();
    return this.stats();
  }

  rebuildAsync({ timeoutMs = 120_000 } = {}) {
    if (this.disposed) return Promise.reject(new Error('Indice knowledge arrestato.'));
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'rag-worker.js'), {
        workerData: { vaultPath: this.vaultPath, cachePath: this.cachePath }
      });
      let settled = false;
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        worker.removeAllListeners();
        this.activeRebuilds.delete(worker);
        void worker.terminate();
        callback();
      };
      this.activeRebuilds.set(worker, () => finish(() => reject(new Error('Indicizzazione locale interrotta.'))));
      const timeout = setTimeout(() => finish(() => reject(new Error('Indicizzazione locale scaduta.'))), timeoutMs);
      timeout.unref?.();
      worker.once('message', (payload) => {
        finish(() => {
          if (!payload?.ok) {
            reject(new Error(payload?.error || 'Indicizzazione locale non riuscita.'));
            return;
          }
          this.chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
          this.fileCache = new Map(Array.isArray(payload.fileCache) ? payload.fileCache : []);
          this.indexedAt = payload.indexedAt || new Date().toISOString();
          this.savePersistentCache();
          resolve(this.stats());
        });
      });
      worker.once('error', (error) => finish(() => reject(error)));
      worker.once('exit', (code) => {
        if (code !== 0) finish(() => reject(new Error(`Worker knowledge terminato con codice ${code}.`)));
      });
    });
  }

  shutdown() {
    if (this.disposed) return false;
    this.disposed = true;
    const active = [...this.activeRebuilds.values()];
    for (const cancel of active) cancel();
    return active.length > 0;
  }

  stats() {
    return { chunks: this.chunks.length, notes: new Set(this.chunks.map((c) => c.relativePath)).size, indexedAt: this.indexedAt };
  }

  needsRebuild() {
    if (!this.indexedAt || !fs.existsSync(this.vaultPath)) return true;
    const files = walk(this.vaultPath);
    if (files.length !== this.fileCache.size) return true;
    for (const file of files) {
      const cached = this.fileCache.get(file);
      if (!cached) return true;
      const stat = fs.statSync(file);
      if (cached.mtimeMs !== stat.mtimeMs || cached.size !== stat.size) return true;
    }
    return false;
  }

  search(query, limit = 6) {
    // Ranking leggero: frequenza termini + bonus per titolo/heading + stato nota.
    const terms = tokenize(query);
    const scored = this.chunks.map((chunk) => {
      const counts = new Map();
      for (const token of chunk.tokens) counts.set(token, (counts.get(token) || 0) + 1);
      const titleTokens = new Set(tokenize(chunk.title));
      const headingTokens = new Set(tokenize(chunk.heading));
      let score = 0;
      let matchedTerms = 0;
      let headingMatch = false;
      for (const term of terms) {
        const frequency = counts.get(term) || 0;
        const inTitle = titleTokens.has(term);
        const inHeading = headingTokens.has(term);
        if (frequency || inTitle || inHeading) matchedTerms += 1;
        if (frequency) score += 1 + Math.log(frequency);
        if (inTitle) { score += 2.5; headingMatch = true; }
        if (inHeading) { score += 1.5; headingMatch = true; }
      }
      if (chunk.status === 'verified') score *= 1.2;
      if (chunk.status === 'draft') score *= 0.82;
      return { chunk, score, matchedTerms, headingMatch };
    });
    // Una parola generica isolata nel corpo non basta per contaminare una
    // domanda generalista. Le query a parola singola e i match nei titoli
    // restano invece utili per aprire una nota precisa.
    const ranked = scored
      .filter((item) => item.score > 0 && (terms.length === 1 || item.matchedTerms >= 2 || item.headingMatch))
      .sort((a, b) => b.score - a.score)
      .map(({ chunk, score }) => ({ ...chunk, score }));
    const selected = [];
    const perFile = new Map();
    for (const result of ranked) {
      const count = perFile.get(result.relativePath) || 0;
      if (count >= 2) continue;
      selected.push(result);
      perFile.set(result.relativePath, count + 1);
      if (selected.length >= limit) return selected;
    }
    // Se la query riguarda una sola nota, completa comunque il limite con le
    // sezioni restanti invece di restituire artificialmente pochi risultati.
    for (const result of ranked) {
      if (!selected.includes(result)) selected.push(result);
      if (selected.length >= limit) break;
    }
    return selected;
  }

  setEmbeddings(entries = []) {
    const byKey = new Map(entries.map((entry) => [`${entry.relativePath}\n${entry.heading}`, entry.vector]));
    let changed = false;
    for (const chunk of this.chunks) {
      const vector = byKey.get(`${chunk.relativePath}\n${chunk.heading}`);
      if (!Array.isArray(vector) || !vector.length) continue;
      chunk.embedding = vector;
      changed = true;
    }
    if (changed) {
      for (const cached of this.fileCache.values()) {
        for (const chunk of cached.chunks || []) {
          const vector = byKey.get(`${chunk.relativePath}\n${chunk.heading}`);
          if (vector) chunk.embedding = vector;
        }
      }
      this.savePersistentCache();
    }
  }

  searchHybrid(query, queryVector, limit = 6) {
    if (!Array.isArray(queryVector) || !queryVector.length) return this.search(query, limit);
    const lexical = this.search(query, Math.max(16, limit * 3));
    const lexicalScores = new Map(lexical.map((chunk, index) => [
      `${chunk.relativePath}\n${chunk.heading}`,
      1 - (index / Math.max(1, lexical.length))
    ]));
    const magnitude = (vector) => Math.sqrt(vector.reduce((total, value) => total + value * value, 0));
    const queryMagnitude = magnitude(queryVector) || 1;
    return this.chunks
      .filter((chunk) => Array.isArray(chunk.embedding) && chunk.embedding.length === queryVector.length)
      .map((chunk) => {
        const dot = chunk.embedding.reduce((total, value, index) => total + value * queryVector[index], 0);
        const semantic = dot / ((magnitude(chunk.embedding) || 1) * queryMagnitude);
        const lexicalScore = lexicalScores.get(`${chunk.relativePath}\n${chunk.heading}`) || 0;
        const editorial = /official|standard/.test(String(chunk.sourceKind || '')) ? 1.05 : 1;
        const trust = (chunk.status === 'verified' ? 1.08 : chunk.status === 'draft' ? 0.92 : 1) * editorial;
        return { chunk, score: ((semantic * 0.68) + (lexicalScore * 0.32)) * trust };
      })
      .filter((item) => item.score > 0.2)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ chunk, score }) => ({ ...chunk, score }));
  }
}

module.exports = { NexusIndex, tokenize, parseFrontmatter, retrievalPolicy, splitSections, retrievableSections };

// #endregion
