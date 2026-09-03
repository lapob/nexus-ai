/**
 * @module research/research-orchestrator
 * @description Applica policy, budget e deduplicazione alla ricerca web del motore NexusNXS.
 */

const { webResearchPolicy } = require('./research-policy');

// #region 01 — Query pubblica minima

function normalizedQuery(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500);
}

function publicQuerySeed(question) {
  const original = normalizedQuery(question);
  if (!original) return '';
  // Quando ricerca e lavoro locale convivono nello stesso turno, inviamo al
  // provider soltanto la clausola iniziata dal verbo di ricerca. Allegati,
  // cronologia, workspace e memoria non vengono mai concatenati qui.
  const explicit = original.match(/\b(?:cerca(?:mi)?|ricerca|verifica|controlla|consulta|browse|search|look\s+up)\b[\s\S]*/iu)?.[0];
  if (!explicit) return original;
  return normalizedQuery(explicit
    .replace(/^(?:cerca(?:mi)?|ricerca|verifica|controlla|consulta|browse|search|look\s+up)\b\s*/iu, '')
    .replace(/^(?:sul\s+web|su\s+internet|online)\b\s*/iu, '')
    .replace(/^(?:e\s+)?(?:spiegami|dimmi|mostrami|indicami|tell\s+me|explain|show\s+me)\b\s*/iu, '')
    .replace(/^(?:in\s+una\s+sola\s+frase|in\s+breve|brevemente)\b\s*/iu, '')
    .replace(/^(?:che\s+cosa\s+significa|cosa\s+significa|che\s+cos['’]?è|cos['’]?è|qual\s+è|what\s+is|what\s+does)\b\s*/iu, '')
    .replace(/[,;]\s*(?:e\s+)?(?:spiega(?:mi|le)?|riassumi|descrivi|mostra|indica)\b[\s\S]*$/iu, '')
    .replace(/[,;]?\s*(?:e\s+)?cita\s+(?:la|le)?\s*font[ei]\b[\s\S]*$/iu, '')
    .replace(/^(?:le?\s+)?(?:ultim[aei]|pi[uù]\s+recenti)\s+(?:informazioni|notizie|dati)(?:\s+stabili)?\s+(?:su|di)\s+/iu, '')
    .replace(/[,;]?\s*\b(?:citando\s+(?:la|le)\s+font[ei]|con\s+(?:una|le)\s+font[ei]|with\s+(?:a\s+)?citation)\b[\s\S]*$/iu, '')) || original;
}

function researchLanguage(question = '') {
  const text = String(question || '');
  return /\b(?:il|lo|la|gli|le|che|come|cosa|perch[eé]|quale|quando|dove|cerca|ricerca|oggi|ultimo|ultima)\b/iu.test(text) ? 'it' : 'en';
}

function deriveResearchQueries(question, maxQueries = 1) {
  const original = publicQuerySeed(question);
  if (!original) return [];
  const queries = [original];
  if (maxQueries > 1) {
    const withoutRequestWords = normalizedQuery(original
      .replace(/\b(?:cerca(?:mi)?|ricerca|verifica|controlla|consulta|approfondisci|confronta|sul\s+web|su\s+internet|con\s+fonti)\b/giu, ' '));
    if (withoutRequestWords && withoutRequestWords.toLowerCase() !== original.toLowerCase()) queries.push(withoutRequestWords);
  }
  return [...new Set(queries)].slice(0, Math.max(1, maxQueries));
}

// #endregion

// #region 02 — Fonti e citazioni

function deduplicateSources(groups, limit) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const source of group || []) {
      const key = String(source.url || '').replace(/#.*$/, '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push({
        ...source,
        text: `Titolo pubblico: ${source.title}\nURL pubblico: ${source.url}\nEstratto: ${source.snippet}`
      });
      if (merged.length >= limit) return merged;
    }
  }
  return merged;
}

function publicCitations(sources) {
  return (sources || []).filter((source) => source.sourceKind === 'web' && source.url).map((source) => ({
    title: source.title,
    url: source.url,
    snippet: source.snippet,
    sourceKind: 'web',
    status: 'external',
    provider: source.provider
  }));
}

function canonicalCitationUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    url.hash = '';
    return url.href.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function enforcePublicCitationUrls(text, citations = []) {
  const value = String(text || '');
  const allowed = new Set(citations.map((source) => canonicalCitationUrl(source.url)).filter(Boolean));
  const citationByUrl = new Map(citations.map((source) => [canonicalCitationUrl(source.url), source]).filter(([url]) => Boolean(url)));
  let rejected = 0;
  let accepted = 0;
  const normalizedParenthetical = value.replace(/(?<!\])\((https:\/\/[^)\s]+)\)/giu, (match, url) => {
    const canonical = canonicalCitationUrl(url);
    if (!allowed.has(canonical)) {
      rejected += 1;
      return '';
    }
    const label = String(citationByUrl.get(canonical)?.title || 'Fonte').replace(/[\[\]]/g, '').trim() || 'Fonte';
    return `[${label}](${url})`;
  });
  const normalized = normalizedParenthetical.replace(/\[([^\],]{1,100}),?\s*(https:\/\/[^\]\s]+)\]/giu, (match, label, url) => {
    if (allowed.has(canonicalCitationUrl(url))) {
      return `[${String(label || 'Fonte').trim()}](${url})`;
    }
    rejected += 1;
    return String(label || '').trim();
  });
  const linked = normalized.replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/giu, (match, label, url) => {
    if (allowed.has(canonicalCitationUrl(url))) {
      accepted += 1;
      return match;
    }
    rejected += 1;
    return String(label || '').trim();
  });
  const safe = linked.replace(/(?<!\]\()https:\/\/[^\s<>()\]]+/giu, (match) => {
    const punctuation = match.match(/[.,;!?]+$/u)?.[0] || '';
    const url = punctuation ? match.slice(0, -punctuation.length) : match;
    if (allowed.has(canonicalCitationUrl(url))) {
      accepted += 1;
      return match;
    }
    rejected += 1;
    return punctuation;
  });
  return { text: safe, changed: safe !== value, rejected, accepted };
}

function ensurePublicCitation(text, citations = []) {
  const checked = enforcePublicCitationUrls(text, citations);
  if (!citations.length || checked.accepted > 0) return { ...checked, added: false };
  const source = citations.find((candidate) => canonicalCitationUrl(candidate.url));
  if (!source) return { ...checked, added: false };
  const label = String(source.title || 'Fonte pubblica').replace(/[\[\]]/g, '').trim() || 'Fonte pubblica';
  // Un'attribuzione finale non presente tra le fonti recuperate viene rimossa
  // prima di allegare il riferimento reale; il contenuto non viene riscritto.
  const withoutUnsupportedAttribution = checked.text.replace(
    /,?\s*(?:come\s+(?:definito|riportato|spiegato)\s+da|secondo|according\s+to)\s+[^.,;\n]{1,120}(?:\([^)]{1,40}\))?\.?\s*$/iu,
    ''
  ).trim();
  return {
    ...checked,
    text: `${withoutUnsupportedAttribution}\n\nFonte: [${label}](${source.url})`,
    changed: true,
    added: true
  };
}

// #endregion

// #region 03 — Orchestrazione

async function researchQuestion({ question, mode = 'fast', hasAttachment = false, workspaceActive = false, enabled = true, language = 'it', service, signal } = {}) {
  const policy = webResearchPolicy({ question, mode, hasAttachment, workspaceActive, enabled: enabled && Boolean(service) });
  if (policy.level === 'none') return { policy, sources: [], citations: [], searched: false, unavailable: false, provider: 'off' };
  const queries = deriveResearchQueries(question, policy.maxQueries);
  try {
    const batches = await Promise.all(queries.map((query) => service.search(query, {
      limit: Math.max(2, Math.ceil(policy.maxResults / queries.length)),
      language,
      signal,
      freshOnly: policy.reason === 'time-sensitive'
    })));
    const sources = deduplicateSources(batches.map((batch) => batch.results), policy.maxResults);
    return {
      policy,
      queries: queries.length,
      sources,
      citations: publicCitations(sources),
      searched: true,
      unavailable: sources.length === 0,
      provider: batches.find((batch) => batch.provider)?.provider || 'off'
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { policy, queries: queries.length, sources: [], citations: [], searched: true, unavailable: true, provider: 'unavailable', error };
  }
}

// #endregion

module.exports = { canonicalCitationUrl, deduplicateSources, deriveResearchQueries, enforcePublicCitationUrls, ensurePublicCitation, publicCitations, publicQuerySeed, researchLanguage, researchQuestion };
