/**
 * @module application/reasoning
 * @description Orchestra le modalità Quick e Deep e fonde le fonti recuperate.
 */
// #region 01 — Planner e fallback deterministico

// Il planner deve restituire JSON, ma alcuni modelli locali aggiungono comunque
// fence Markdown. Ripuliamo l'output e falliamo in modo sicuro sul formato errato.
function parsePlannerOutput(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const candidate = fenced || (start >= 0 && end > start ? raw.slice(start, end + 1) : raw);
  const parsed = JSON.parse(candidate.trim());
  const queries = Array.isArray(parsed.search_queries) ? parsed.search_queries : [];
  return [...new Set(queries
    .map((query) => String(query).replace(/[\u0000-\u001f]+/g, ' ').replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240))
    .filter((query) => query.length >= 3))]
    .slice(0, 3);
}

function classifyTechnicalTask(question) {
  const text = String(question || '').toLocaleLowerCase('it-IT');
  if (/\b(?:errore|error|[a-z]+error|exception|[a-z]+exception|traceback|stack trace|bug|debug|test fallit|failing test)\b/u.test(text)) return 'debugging';
  if (/\b(?:vulnerabil|sicurezza|security|malware|ransomware|incident|forensic|forense|threat|exploit)\b/u.test(text)) return 'security';
  if (/\b(?:prestazioni|performance|latenza|latency|profil|benchmark|memoria|memory|cpu|gpu)\b/u.test(text)) return 'performance';
  if (/\b(?:architettura|architecture|design|refactor|api|database|sistema distribuito)\b/u.test(text)) return 'architecture';
  if (/\b(?:rete|network|tcp|udp|dns|dhcp|routing|firewall|vpn|tls)\b/u.test(text)) return 'networking';
  return 'general-technical';
}

function deriveSearchQueries(question) {
  const raw = String(question || '').replace(/```[\s\S]*?```/g, ' ').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const task = classifyTechnicalTask(raw);
  const quoted = [...raw.matchAll(/["“]([^"”]{3,120})["”]/g)].map((match) => match[1]);
  const error = raw.match(/(?:error|errore|exception|traceback)[:\s]+(.{3,140})/iu)?.[1]?.replace(/[.;].*$/, '').trim();
  const suffix = {
    debugging: 'causa radice diagnostica test regressione',
    security: 'threat model mitigazione verifica difensiva autorizzata',
    performance: 'profiling metriche colli di bottiglia benchmark',
    architecture: 'tradeoff affidabilità sicurezza test',
    networking: 'protocollo diagnostica pacchetti configurazione',
    'general-technical': 'procedura verifica troubleshooting'
  }[task];
  return [...new Set([error, quoted[0], `${raw.slice(0, 220)} ${suffix}`]
    .filter(Boolean)
    .map((query) => query.replace(/<\/?[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240)))]
    .slice(0, 3);
}

function conversationalGuidance(question, history = []) {
  const text = String(question || '').trim();
  const normalized = text.toLocaleLowerCase('it-IT');
  const previous = (Array.isArray(history) ? history : [])
    .filter((turn) => turn && ['user', 'assistant'].includes(turn.role) && String(turn.content || '').trim())
    .slice(-6);
  const signals = [];
  const asksForDepth = /\b(?:approfond\w*|dettagliat\w*|complet\w*|esaustiv\w*|guida|passo\s+passo|elenca|confronta|analizza|spiega\s+bene)\b/iu.test(normalized);
  const shortInformationalTurn = text.length > 0 && text.length <= 180
    && !asksForDepth
    && !/```|(?:^|\s)(?:[-*]|\d+[.)])\s+/mu.test(text)
    && !/\b(?:crea|scrivi|modifica|elimina|installa|esegui|progetta|implementa|debug|correggi)\b/iu.test(normalized);
  if (shortInformationalTurn) {
    signals.push('È una richiesta informativa breve: dai subito la risposta più probabile in linguaggio naturale e fermati quando è soddisfatta. Punta a circa 100-220 parole; niente titoli, conclusione separata, emoji o liste salvo che una lista renda davvero più chiaro un confronto. Se il termine è ambiguo, chiarisci in una sola frase quale significato stai usando.');
  }
  if (/^(?:ok|okay|va bene|s[iì]|vai|perfetto|d'accordo)(?:[,;:]?\s*(?:fallo|procedi|continua|applicalo))?[.!…\s]*$/iu.test(normalized)
    || /^(?:fallo|procedi|continua|applicalo)[.!…\s]*$/iu.test(normalized)) {
    signals.push('È una conferma breve: collegala all’ultima proposta concreta della conversazione, senza chiedere di ripetere il contesto. Non estendere però autorizzazioni oltre l’azione già proposta.');
  }
  if (/\b(?:no[,;:]?|non intendevo|intendevo|invece|correggo|rettifico|come prima|te l['’]?ho detto|non così)\b/iu.test(normalized)) {
    signals.push('È una correzione: dai priorità alla nuova formulazione, conserva le parti precedenti non contraddette e rispondi sul cambiamento concreto senza ricominciare da zero.');
  }
  if (/\b(?:ancora|di nuovo|continua|prosegui|poi|dopodiché|quello|quella|così|stesso|stessa|resto)\b/iu.test(normalized)) {
    signals.push('È un seguito: risolvi i riferimenti usando i turni recenti e mantieni decisioni, terminologia e vincoli già stabiliti.');
  }
  if (/\b(?:non funziona|non va|buggat[oa]|sbagliat[oa]|peggiorat[oa]|rotto|problema|per giorni|sempre uguale)\b/iu.test(normalized)) {
    signals.push('L’utente segnala un problema persistente: evita scuse rituali e rassicurazioni assolute; parti dalla causa o dalla verifica concreta, distingui ciò che hai osservato da ciò che ipotizzi e indica il risultato misurabile.');
  }
  if (/\b(?:suggerisci|idee|alternative|miglioramenti|come potremmo|che altro|altre modifiche)\b/iu.test(normalized)) {
    signals.push('È una richiesta esplorativa: proponi poche opzioni ad alto impatto, ordinate per utilità e costo, spiegando il compromesso reale senza produrre una lista generica.');
  }
  if (!signals.length) signals.push('Mantieni un tono naturale e proporzionato: vai al punto, varia la struttura in base alla richiesta e non aggiungere formule di apertura o chiusura automatiche.');
  return `CONTINUITÀ CONVERSAZIONALE (${previous.length} turni recenti disponibili):\n${signals.map((signal) => `- ${signal}`).join('\n')}`;
}

// #endregion

// #region 02 — Fusione, affidabilità e diversità delle fonti

// Una stessa sezione può emergere da più sotto-query. La chiave composta evita
// duplicati nel prompt e conserva il punteggio migliore trovato.
function sourceReliability(source) {
  const status = String(source?.status || '').toLowerCase();
  const sourceKind = String(source?.sourceKind || source?.source_kind || '').toLowerCase();
  let weight = status === 'evergreen' ? 1.12 : status === 'verified' ? 1.08 : status === 'draft' ? 0.88 : 1;
  if (/official|standard/.test(sourceKind)) weight += 0.05;
  return weight;
}

function mergeSources(groups, limit = 8, perFileLimit = 2) {
  const unique = new Map();
  for (const source of groups.flat()) {
    const key = `${source.relativePath}#${source.heading}`;
    if (!unique.has(key) || unique.get(key).score < source.score) unique.set(key, source);
  }
  const ranked = [...unique.values()].sort((a, b) => (b.score * sourceReliability(b)) - (a.score * sourceReliability(a)));
  const selected = [];
  const perFile = new Map();
  for (const source of ranked) {
    const count = perFile.get(source.relativePath) || 0;
    if (count >= perFileLimit) continue;
    selected.push(source);
    perFile.set(source.relativePath, count + 1);
    if (selected.length >= limit) return selected;
  }
  for (const source of ranked) {
    if (!selected.includes(source)) selected.push(source);
    if (selected.length >= limit) break;
  }
  return selected;
}

module.exports = { classifyTechnicalTask, conversationalGuidance, deriveSearchQueries, parsePlannerOutput, mergeSources, sourceReliability };

// #endregion
