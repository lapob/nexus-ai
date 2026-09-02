/**
 * @module application/strict-tool-routing
 * @description Risolve in modo deterministico i contratti JSON espliciti per azioni non ancora eseguite.
 */

const JSON_CONTRACT = /\b(?:json valido|valid json)\b/iu;
const EXECUTED_FIELD = /\bexecuted\b/iu;
const READ_INTENT = /\b(?:leggere|leggi|read)\b/iu;
const DELETE_INTENT = /\b(?:eliminare|elimina|cancellare|cancella|delete|remove)\b/iu;
const CONFIRMATION_REQUIRED = /\brequiresConfirmation\b|\b(?:non (?:ha|hai) (?:ancora )?confermat|without confirmation|not confirmed)/iu;
const AMBIGUOUS_APP = /\b(?:non esiste|inesistente|ambigu|sconosciut|unknown|does not exist)\b/iu;
const RELATIVE_PATH = /(?:^|[\s'"`])((?![a-z]+:\/\/)(?![a-z]:[\\/])(?:[\w.-]+[\\/])+[\w.-]+)(?=$|[\s'"`,.;:!?])/iu;
const NAMED_AMBIGUITY = /\b(?:dice|says?)\s+["'“”‘’]([^"'“”‘’]{2,80})["'“”‘’]/iu;

function strictToolRoutingReply(question = '') {
  const text = String(question || '').trim();
  if (!JSON_CONTRACT.test(text) || !EXECUTED_FIELD.test(text)) return null;

  if (READ_INTENT.test(text)) {
    const path = text.match(RELATIVE_PATH)?.[1]?.replace(/\\/g, '/');
    if (!path) return null;
    return JSON.stringify({ tool: 'read_file', arguments: { path }, executed: false });
  }

  if (DELETE_INTENT.test(text) && CONFIRMATION_REQUIRED.test(text)) {
    return JSON.stringify({ tool: 'request_confirmation', requiresConfirmation: true, executed: false });
  }

  if (AMBIGUOUS_APP.test(text)) {
    const term = text.match(NAMED_AMBIGUITY)?.[1]?.trim();
    const questionText = term ? `Quale applicazione intendi con “${term}”?` : 'Quale applicazione intendi?';
    return JSON.stringify({ tool: 'ask_clarification', question: questionText, executed: false });
  }

  return null;
}

module.exports = { strictToolRoutingReply };
