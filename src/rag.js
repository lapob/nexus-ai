const fs = require('node:fs');
const path = require('node:path');

// Le voci sono già senza accenti perché tokenize normalizza prima del confronto.
const STOP = new Set('a ad al alla alle anche che chi con da dal dalla dei del della di e ed gli ha i il in io la le lo ma mi nel nella non o per piu se si sia sono su tra un una'.split(' '));

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

class NexusIndex {
  constructor(vaultPath) {
    this.vaultPath = vaultPath;
    this.chunks = [];
    this.indexedAt = null;
  }

  rebuild() {
    // Ricostruzione completa e deterministica. Con 154 note è più semplice e
    // affidabile di un watcher incrementale; nessun file della vault viene scritto.
    this.chunks = [];
    for (const file of walk(this.vaultPath)) {
      const raw = fs.readFileSync(file, 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      if (meta.status === 'deprecated') continue;
      const { title, sections } = splitSections(body);
      for (const section of sections) {
        const content = `${title}\n${section.heading}\n${section.text}`;
        this.chunks.push({
          title,
          heading: section.heading,
          text: section.text.slice(0, 4000),
          relativePath: path.relative(this.vaultPath, file).replaceAll('\\', '/'),
          status: meta.status || 'draft',
          area: meta.area || 'general',
          tokens: tokenize(content)
        });
      }
    }
    this.indexedAt = new Date().toISOString();
    return this.stats();
  }

  stats() {
    return { chunks: this.chunks.length, notes: new Set(this.chunks.map((c) => c.relativePath)).size, indexedAt: this.indexedAt };
  }

  search(query, limit = 6) {
    // Ranking leggero: frequenza termini + bonus per titolo/heading + stato nota.
    const terms = tokenize(query);
    const scored = this.chunks.map((chunk) => {
      const counts = new Map();
      for (const token of chunk.tokens) counts.set(token, (counts.get(token) || 0) + 1);
      let score = 0;
      for (const term of terms) {
        const frequency = counts.get(term) || 0;
        if (frequency) score += 1 + Math.log(frequency);
        if (chunk.title.toLowerCase().includes(term)) score += 2.5;
        if (chunk.heading.toLowerCase().includes(term)) score += 1.5;
      }
      if (chunk.status === 'verified') score *= 1.2;
      if (chunk.status === 'draft') score *= 0.82;
      return { ...chunk, score };
    });
    return scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  }
}

module.exports = { NexusIndex, tokenize, parseFrontmatter, splitSections };
