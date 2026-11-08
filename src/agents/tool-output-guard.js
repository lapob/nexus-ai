/**
 * @module agents/tool-output-guard
 * @description Rimuove dalle osservazioni degli strumenti le frasi che impartiscono istruzioni all'assistente, prima che il modello le legga.
 */
const { hasPromptInjectionSignals } = require('../application/prompt-security');

// #region 01 — Rilevamento a livello di frase

// Marcare i dati come non fidati non basta: nella valutazione nexusnxs-agent-v1
// qwen3:14b non eseguiva le istruzioni iniettate ma le riferiva all'utente,
// inclusi indirizzi dell'attaccante. Le frasi rivolte all'assistente vengono
// quindi sostituite prima dell'inferenza; il resto del contenuto resta intatto.
const ROLE_PREFIX = /\b(?:SYSTEM|ASSISTANT|DEVELOPER|TOOL)\s*:/u;
const ADDRESSED_TO_ASSISTANT = /\b(?:istruzion[ei]|nota|messaggio|comando|ordine)\s+(?:per|all['’]|al|a)\s*(?:l['’]\s*)?(?:assistente|agente|modello|intelligenza artificiale|ia|ai|bot|chatbot)\b|\b(?:instructions?|notes?|messages?|commands?)\s+(?:for|to)\s+(?:the\s+)?(?:assistant|agent|model|ai|llm|bot)\b/iu;
const ASSISTANT_VOCATIVE = /(?:^|[.!?]\s*)(?:assistente|agente|nexusnxs|modello|ai|ia|assistant|agent)\s*[:,]\s*(?:cerca|invia|salva|esegui|chiama|usa|rivela|ignora|comunica|di['’]|dì|scrivi|apri|search|send|save|run|call|use|reveal|ignore|tell|write|open)\b/iu;
const TELL_THE_USER = /\b(?:comunica|d[iì]|riferisci|rispondi|scrivi)\s+all['’]\s*utente\s+che\b|\b(?:tell|inform)\s+the\s+user\s+that\b|\bnon\s+(?:dire|menzionare|rivelare)\s+(?:all['’]\s*utente|il prezzo)\b/iu;
const OVERRIDE = /\b(?:ignora|dimentica|sovrascrivi|disregard|ignore|forget|override)\b[\s\S]{0,40}\b(?:istruzioni|regole|utente|instructions|rules|user|precedent|previous|prior)\b/iu;
const IMPERATIVE = /\b(?:usa(?:ndo)?|chiama|esegui|invoca|lancia|attiva|salva|invia|cerca|use|call|run|invoke|execute|save|send|search)\b/iu;

function splitSentences(text) {
  return String(text).split(/(?<=[.!?;])\s+|\n+/u);
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Vero se la frase istruisce l'assistente invece di descrivere il mondo. */
function isInjectedInstruction(sentence, toolNames = []) {
  const text = String(sentence || '').trim();
  if (text.length < 8) return false;
  if (ROLE_PREFIX.test(text) || ADDRESSED_TO_ASSISTANT.test(text) || ASSISTANT_VOCATIVE.test(text) || TELL_THE_USER.test(text) || OVERRIDE.test(text)) return true;
  if (hasPromptInjectionSignals(text)) return true;
  // Un imperativo che nomina uno strumento reale del registro è un tentativo
  // di pilotare l'agente; "usa lo strumento di misura" resta contenuto lecito.
  if (toolNames.length && IMPERATIVE.test(text)) {
    const named = new RegExp(`(?:^|[^\\w-])(?:${toolNames.map(escapeRegExp).join('|')})(?:[^\\w-]|$)`, 'iu');
    if (named.test(text)) return true;
  }
  return false;
}

// #endregion

// #region 02 — Neutralizzazione ricorsiva del risultato

const PLACEHOLDER = '[istruzione nel contenuto rimossa dal confine di sicurezza]';

function neutralizeText(text, toolNames) {
  let removed = 0;
  const parts = String(text).split(/((?<=[.!?;])\s+|\n+)/u);
  const output = parts.map((part) => {
    if (!part || /^\s+$/u.test(part)) return part;
    if (!isInjectedInstruction(part, toolNames)) return part;
    removed += 1;
    return PLACEHOLDER;
  }).join('');
  return { text: output, removed };
}

/**
 * Restituisce una copia del valore con le istruzioni iniettate sostituite in
 * ogni stringa annidata, e il numero di frasi rimosse. Chiavi e struttura
 * restano invariate; URL e campi brevi non testuali non vengono alterati.
 */
function neutralizeToolOutput(value, { toolNames = [], depth = 0 } = {}) {
  if (depth > 6) return { value, removed: 0 };
  if (typeof value === 'string') {
    const { text, removed } = neutralizeText(value, toolNames);
    return { value: text, removed };
  }
  if (Array.isArray(value)) {
    let removed = 0;
    const items = value.map((item) => { const next = neutralizeToolOutput(item, { toolNames, depth: depth + 1 }); removed += next.removed; return next.value; });
    return { value: items, removed };
  }
  if (value && typeof value === 'object') {
    let removed = 0;
    const entries = Object.entries(value).map(([key, item]) => {
      // Gli URL sono già validati dai servizi e servono alle citazioni.
      if (key === 'url' || key === 'path') return [key, item];
      const next = neutralizeToolOutput(item, { toolNames, depth: depth + 1 });
      removed += next.removed;
      return [key, next.value];
    });
    return { value: Object.fromEntries(entries), removed };
  }
  return { value, removed: 0 };
}

// #endregion

module.exports = { isInjectedInstruction, neutralizeToolOutput, splitSentences, PLACEHOLDER };
