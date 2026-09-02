/**
 * @module application/retrieval-policy
 * @description Evita inferenze di retrieval costose quando il contesto lessicale e gia sufficiente.
 */

const { tokenize } = require('../knowledge/rag');

const RESEARCH_INTENT = /\b(?:ricerca|fonti|documenta|approfondisci|manuale|enciclopedia|letteratura|stato\s+dell['’]arte|knowledge|conoscenza)\b/i;

function lexicalCoverage(question, sources = []) {
  const terms = [...new Set(tokenize(String(question || '')))];
  if (!terms.length || !sources.length) return 0;
  const available = new Set(sources.slice(0, 3).flatMap((source) => Array.isArray(source.tokens)
    ? source.tokens
    : tokenize(`${source.title || ''} ${source.heading || ''} ${source.text || ''}`)));
  return terms.filter((term) => available.has(term)).length / terms.length;
}

function hasStrongLexicalContext(question, sources = []) {
  if (!sources.length) return false;
  const topScore = Number(sources[0]?.score) || 0;
  return topScore >= 3 && lexicalCoverage(question, sources) >= 0.55;
}

function shouldUseSemanticRetrieval({ question, mode, sources, embeddingModel, tier }) {
  if (!embeddingModel || tier === 'lite') return false;
  return mode === 'deep' && RESEARCH_INTENT.test(String(question || '')) && !hasStrongLexicalContext(question, sources);
}

function shouldExpandWithPlanner({ question, mode, sources, tier, hasAttachment }) {
  if (mode !== 'deep' || tier === 'lite' || hasAttachment) return false;
  return RESEARCH_INTENT.test(String(question || '')) && !hasStrongLexicalContext(question, sources);
}

module.exports = { lexicalCoverage, hasStrongLexicalContext, shouldUseSemanticRetrieval, shouldExpandWithPlanner };
