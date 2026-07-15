// Il planner deve restituire JSON, ma alcuni modelli locali aggiungono comunque
// fence Markdown. Ripuliamo l'output e falliamo in modo sicuro sul formato errato.
function parsePlannerOutput(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  const queries = Array.isArray(parsed.search_queries) ? parsed.search_queries : [];
  return queries.map((query) => String(query).trim().slice(0, 240)).filter(Boolean).slice(0, 3);
}

// Una stessa sezione può emergere da più sotto-query. La chiave composta evita
// duplicati nel prompt e conserva il punteggio migliore trovato.
function mergeSources(groups, limit = 8) {
  const unique = new Map();
  for (const source of groups.flat()) {
    const key = `${source.relativePath}#${source.heading}`;
    if (!unique.has(key) || unique.get(key).score < source.score) unique.set(key, source);
  }
  return [...unique.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { parsePlannerOutput, mergeSources };
