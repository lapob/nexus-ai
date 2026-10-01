/** @module scripts/lib/knowledge-benchmark-cases Validate independent retrieval cases before indexing. */
const fs = require('node:fs');

function validateKnowledgeBenchmarkCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw Error('Il benchmark richiede casi revisionati non vuoti.');
  const queries = new Set();
  for (const entry of cases) {
    if (!entry || typeof entry.query !== 'string' || entry.query.trim().length < 3
      || typeof entry.expectedPath !== 'string' || !entry.expectedPath.trim()
      || /^(?:[\\/]|[A-Za-z]:)|(?:^|[\\/])\.\.(?:[\\/]|$)/.test(entry.expectedPath)
      || (entry.requiresSourceEvidence !== undefined && typeof entry.requiresSourceEvidence !== 'boolean')) {
      throw Error('Caso di benchmark non valido: servono domanda e percorso relativo atteso.');
    }
    const query = entry.query.trim().toLocaleLowerCase('it-IT');
    if (queries.has(query)) throw Error('Domanda duplicata nel benchmark: non conteggiarla due volte.');
    queries.add(query);
  }
  return cases;
}

function loadKnowledgeBenchmarkCases(file) {
  if (!fs.existsSync(file)) throw Error('File dei casi di benchmark assente: ripristinalo oppure specifica --cases=<file revisionato>.');
  return validateKnowledgeBenchmarkCases(JSON.parse(fs.readFileSync(file, 'utf8')));
}

module.exports = { validateKnowledgeBenchmarkCases, loadKnowledgeBenchmarkCases };
