/**
 * @module research/research-policy
 * @description Decide se una richiesta richiede dati pubblici aggiornati senza inviare contesto privato sul web.
 */

// #region 01 — Segnali deterministici

// Verification alone can refer to maths, code, or an output marker, not the web.
const EXPLICIT_WEB_PATTERN = /\b(?:cerca|cercami|ricerca|naviga|browse|search|look\s*up|find\s+online|(?:verifica|controlla|consulta)\s+online|sul\s+web|su\s+internet|font[ei]\s+(?:online|web|pubblic[aoe])|citazioni)\b/iu;
const TIME_SENSITIVE_PATTERN = /\b(?:oggi|adesso|attuale|attualmente|corrente|correnti|ultimo|ultima|ultimi|ultime|pi[uù]\s+recente|novit[aà]|news|prezzo|prezzi|quotazione|meteo|risultat[oi]\s+(?:sportiv[oi]|elettoral[ei]|della\s+(?:partita|gara|corsa|votazione))|classifica|calendario|versione|release|legge|normativa|regolamento|presidente|ceo|latest|current|today|recent|news|price|weather|score|standings|schedule|version|release|law|regulation)\b/iu;
const RESEARCH_PATTERN = /\b(?:approfondisci|confronta|letteratura|studi|paper|ricerca\s+scientifica|prove|evidenze|benchmark|deep\s+research|research)\b/iu;
const LOCAL_OPERATION_PATTERN = /\b(?:quest[oa]\s+(?:pc|computer|cartella|file|progetto)|workspace|repository\s+locale|desktop|disco|volume|terminale|powershell|prompt|apri|chiudi|avvia|spegni|riavvia|modifica|elimina|sposta|rinomina)\b/iu;
const PRIVATE_LITERAL_PATTERN = /(?:\b[A-Z]:\\|\/(?:Users|home)\/|\b(?:api[_ -]?key|token|password|secret|chiave\s+privata)\s*[:=]\s*[^\s]{6,}|\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]{12,})/iu;

function researchIntent(question = '') {
  const text = String(question || '').trim();
  return {
    explicit: EXPLICIT_WEB_PATTERN.test(text),
    timeSensitive: TIME_SENSITIVE_PATTERN.test(text),
    research: RESEARCH_PATTERN.test(text),
    localOperation: LOCAL_OPERATION_PATTERN.test(text),
    containsPrivateLiteral: PRIVATE_LITERAL_PATTERN.test(text)
  };
}

// #endregion

// #region 02 — Politica e budget

function webResearchPolicy({ question, mode = 'fast', hasAttachment = false, workspaceActive = false, enabled = true } = {}) {
  const intent = researchIntent(question);
  if (!enabled) return { level: 'none', reason: 'disabled', maxQueries: 0, maxResults: 0, intent };
  if (!String(question || '').trim()) return { level: 'none', reason: 'empty', maxQueries: 0, maxResults: 0, intent };
  if (intent.containsPrivateLiteral) return { level: 'none', reason: 'privacy-boundary', maxQueries: 0, maxResults: 0, intent };
  if ((hasAttachment || workspaceActive || intent.localOperation) && !intent.explicit && !intent.timeSensitive) {
    return { level: 'none', reason: 'local-context', maxQueries: 0, maxResults: 0, intent };
  }
  if (intent.explicit || intent.timeSensitive || (mode === 'deep' && intent.research)) {
    return {
      level: 'required',
      reason: intent.timeSensitive ? 'time-sensitive' : intent.explicit ? 'explicit' : 'deep-research',
      maxQueries: mode === 'deep' ? 2 : 1,
      maxResults: mode === 'deep' ? 6 : 4,
      intent
    };
  }
  return { level: 'none', reason: 'knowledge-sufficient', maxQueries: 0, maxResults: 0, intent };
}

module.exports = {
  EXPLICIT_WEB_PATTERN,
  PRIVATE_LITERAL_PATTERN,
  TIME_SENSITIVE_PATTERN,
  researchIntent,
  webResearchPolicy
};
