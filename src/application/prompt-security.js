/**
 * @module application/prompt-security
 * @description Delimita dati non fidati e impedisce che istruzioni indirette o segreti diventino output o azioni.
 */

// #region 01 — Rilevamento e delimitazione dei dati non fidati

const PROMPT_INJECTION_PATTERNS = Object.freeze([
  /\b(?:ignore|disregard|forget|override)\b.{0,80}\b(?:previous|prior|system|developer|security|safety)\b.{0,40}\b(?:instruction|message|prompt|rule)s?\b/isu,
  /\b(?:ignora|dimentica|sovrascrivi|aggira)\b.{0,80}\b(?:istruzioni|regole|prompt|messaggio)\b.{0,40}\b(?:precedent|sistema|sviluppatore|sicurezza)\b/isu,
  /\b(?:reveal|print|show|return|send|upload|exfiltrate|dump|display)\b.{0,100}\b(?:system prompt|developer message|password|secret|token|api[ -]?key|credential)s?\b/isu,
  /\b(?:rivela|stampa|mostra|restituisci|invia|carica|esfiltra)\b.{0,100}\b(?:prompt di sistema|messaggio dello sviluppatore|password|segreto|token|chiave api|credenziali)\b/isu,
  /\b(?:you are now|act as|new system message|developer mode|jailbreak|do not tell (?:the )?user)\b/isu,
  /\b(?:sei ora|fingi di essere|nuovo messaggio di sistema|modalit[aà] sviluppatore|non dirlo all['’]?utente)\b/isu,
  /(?:^|\n)\s*(?:system|developer|assistant|tool)\s*[:>]/imu,
  /<\/?(?:system|developer|assistant|tool|instructions?)\b[^>]*>/iu
]);

const SECRET_ASSIGNMENT = /\b(password|passwd|pwd|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|secret|client[ _-]?secret|private[ _-]?key)\b\s*[:=]\s*(["']?)([^\s"'`;,&<>]{4,512})\2/giu;
const PRIVATE_KEY_BLOCK = /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/giu;

const MUTATION_INTENT = /\b(?:crea|creare|scrivi|scrivere|modifica|modificare|aggiorna|aggiornare|correggi|correggere|sistema|sistemare|implementa|implementare|applica|applicare|sviluppa|sviluppare|costruisci|costruire|genera|generare|rifattorizza|refactor|create|write|edit|modify|update|fix|implement|apply|build|generate)\b/iu;
const FILESYSTEM_INTENT = /\b(?:file|cartella|cartelle|directory|progetto|progetti|repository|repo|codice|sito|app|applicazione|workspace|filesystem|disco|unit[aà]|readme|config|package|source|sorgente|sorgenti)\b|\bspazio di lavoro\b/iu;
const INSPECTION_INTENT = /\b(?:leggi|leggere|controlla|controllare|analizza|analizzare|ispeziona|ispezionare|verifica|verificare|elenca|elencare|cerca|cercare|trova|trovare|apri|aprire|read|inspect|review|check|list|search|find|open)\b/iu;
const EXECUTION_INTENT = /\b(?:esegui|eseguire|lancia|lanciare|avvia|avviare|testa|testare|compila|compilare|build|installa|installare|run|execute|launch|start|test)\b/iu;
const OPEN_INTENT = /\b(?:apri|aprire|avvia|avviare|lancia|lanciare|mostra|mostrare|open|launch|start|show)\b/iu;
const COPY_INTENT = /\b(?:copia|copiare|duplica|duplicare|copy|duplicate)\b/iu;
const MOVE_INTENT = /\b(?:sposta|spostare|rinomina|rinominare|move|rename)\b/iu;
const DELETE_INTENT = /\b(?:elimina|eliminare|cancella|cancellare|rimuovi|rimuovere|cestino|delete|remove|trash)\b/iu;
const DECLARED_UNTRUSTED_BLOCK = /<(DOCUMENTO|TOOL_OUTPUT|CONTESTO|DOC)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/giu;
const PRIVATE_WORKSTATION_REQUEST = /\b(?:elenca|mostra|rivela|stampa|restituisci|list|show|reveal|print|return)\b[\s\S]{0,180}\b(?:percorsi? locali?|hostname|nome (?:del )?computer|workstation|local paths?|computer name)\b/iu;

function cleanUntrustedText(value, max = 30_000) {
  return String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .slice(0, max);
}

function formatUntrustedData(label, value, max = 30_000) {
  const safeLabel = String(label || 'DATA').toUpperCase().replace(/[^A-Z0-9_-]/g, '_').slice(0, 48) || 'DATA';
  const escaped = cleanUntrustedText(value, max)
    .replace(/<\/?BEGIN_UNTRUSTED_[^>]*>/giu, '[MARCATORE DATI ESCAPED]')
    .replace(/<\/?END_UNTRUSTED_[^>]*>/giu, '[MARCATORE DATI ESCAPED]');
  const quoted = escaped.split('\n').map((line) => `DATA | ${line}`).join('\n');
  return `<BEGIN_UNTRUSTED_${safeLabel}>\n${quoted || 'DATA | (vuoto)'}\n<END_UNTRUSTED_${safeLabel}>`;
}

function hasPromptInjectionSignals(value) {
  const text = cleanUntrustedText(value, 200_000);
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

function declaredUntrustedContent(value) {
  const text = cleanUntrustedText(value, 200_000);
  return [...text.matchAll(DECLARED_UNTRUSTED_BLOCK)].map((match) => cleanUntrustedText(match[2], 100_000)).filter(Boolean);
}

/**
 * Fast path di sicurezza usato dalla chat reale prima dell'inferenza. Interviene
 * soltanto su blocchi che l'utente ha dichiarato come documento/output/contesto
 * oppure su richieste esplicite di metadati privati della workstation.
 */
function deterministicSecurityReply(value) {
  const text = cleanUntrustedText(value, 200_000);
  const blocks = declaredUntrustedContent(text);
  if (blocks.some(hasPromptInjectionSignals)) {
    return 'Il contenuto contiene una prompt injection: è un dato non fidato, quindi va ignorato senza esporre istruzioni interne o valori riservati.';
  }
  if (PRIVATE_WORKSTATION_REQUEST.test(text)) {
    return 'Non posso esporre percorsi locali o hostname della workstation: sono dati riservati.';
  }
  return null;
}

function extractSensitiveLiterals(value) {
  const text = cleanUntrustedText(value, 200_000);
  const literals = new Set();
  for (const match of text.matchAll(SECRET_ASSIGNMENT)) {
    const literal = String(match[3] || '').trim();
    if (literal.length >= 4) literals.add(literal);
  }
  for (const block of text.match(PRIVATE_KEY_BLOCK) || []) literals.add(block);
  return [...literals].slice(0, 32);
}

function analyzeUntrustedContent(values = []) {
  const items = (Array.isArray(values) ? values : [values]).map((value) => cleanUntrustedText(value, 100_000)).filter(Boolean);
  return {
    hasUntrustedContent: items.length > 0,
    promptInjection: items.some(hasPromptInjectionSignals),
    sensitiveLiterals: [...new Set(items.flatMap(extractSensitiveLiterals))].slice(0, 32)
  };
}

// #endregion

// #region 02 — Sanitizzazione dell'output del modello

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function secureModelOutput(answer, security = {}) {
  let text = String(answer ?? '');
  const issues = [];
  for (const literal of security.sensitiveLiterals || []) {
    if (!literal || literal.length < 4) continue;
    const pattern = new RegExp(escapeRegExp(literal), 'giu');
    if (pattern.test(text)) {
      text = text.replace(pattern, '[RISERVATO]');
      issues.push('sensitive-echo-redacted');
    }
  }
  if (security.hasUntrustedContent) {
    const before = text;
    text = text.replace(PRIVATE_KEY_BLOCK, '[RISERVATO]');
    text = text.replace(SECRET_ASSIGNMENT, (_match, name) => `${name}=[RISERVATO]`);
    if (text !== before) issues.push('sensitive-assignment-redacted');
  }
  return { text, changed: text !== String(answer ?? ''), issues: [...new Set(issues)] };
}

// #endregion

// #region 03 — Autorizzazione deterministica delle azioni

function planAuthorization(plan, originalInstruction) {
  if (!plan?.tool) return { allowed: true, reason: '' };
  const intent = String(originalInstruction || '');
  const fileWork = FILESYSTEM_INTENT.test(intent);
  const rules = {
    open_application: OPEN_INTENT.test(intent),
    open_path: OPEN_INTENT.test(intent) && fileWork,
    open_user_path: OPEN_INTENT.test(intent) && fileWork,
    run_script: EXECUTION_INTENT.test(intent) && fileWork,
    run_command: EXECUTION_INTENT.test(intent) && fileWork,
    list_directory: fileWork && (INSPECTION_INTENT.test(intent) || MUTATION_INTENT.test(intent)),
    read_file: fileWork && (INSPECTION_INTENT.test(intent) || MUTATION_INTENT.test(intent)),
    write_file: fileWork && MUTATION_INTENT.test(intent),
    write_files: fileWork && MUTATION_INTENT.test(intent),
    create_directory: fileWork && MUTATION_INTENT.test(intent),
    copy_path: fileWork && COPY_INTENT.test(intent),
    move_path: fileWork && MOVE_INTENT.test(intent),
    trash_path: fileWork && DELETE_INTENT.test(intent)
  };
  const allowed = rules[plan.tool] === true;
  return {
    allowed,
    reason: allowed ? '' : 'Il piano non è autorizzato dalla richiesta originale dell’utente.'
  };
}

// #endregion

module.exports = {
  analyzeUntrustedContent,
  declaredUntrustedContent,
  deterministicSecurityReply,
  extractSensitiveLiterals,
  formatUntrustedData,
  hasPromptInjectionSignals,
  planAuthorization,
  secureModelOutput
};
