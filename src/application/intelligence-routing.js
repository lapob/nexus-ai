/**
 * @module application/intelligence-routing
 * @description Seleziona una profondità proporzionata senza affidarsi al solo numero di caratteri.
 */
// #region Lessico di classificazione

const COMPLEX_INTENT = /\b(?:analizza|confronta|progetta|implementa|sviluppa|debug|correggi|refactor|architettura|audit|ottimizza|diagnostica|dimostra|valuta|strategia|piano|sicurezza|vulnerabilit[àa]|prestazioni|analy[sz]e|compare|design|implement|develop|debug|fix|architecture|optimi[sz]e|diagnose|evaluate|strategy|security|performance|analiza|compara|diseña|implementa|desarrolla|corrige|arquitectura|optimiza|diagnostica|evalúa|estrategia|seguridad|rendimiento|analyse|compare|conçois|implémente|développe|corrige|architecture|optimise|diagnostique|évalue|stratégie|sécurité|performances|analysiere|vergleiche|entwirf|implementiere|entwickle|korrigiere|architektur|optimiere|diagnostiziere|bewerte|strategie|sicherheit|leistung)\b/giu;
const ARTIFACT_INTENT = /\b(?:codice|sorgente|repository|cartell[ae]|file|database|api|applicazione|installer|modello|dataset|rete|server|code|source|folder|application|model|network|código|carpeta|aplicación|modelo|red|dossier|application|modèle|réseau|quellcode|ordner|anwendung|modell|netzwerk)\b/giu;
const SIMPLE_INTENT = /^\s*(?:ciao|grazie|ok|va bene|cos['’]?è|che cos['’]?è|chi è|quando|dove|quanto|traduci|definisci|riassumi|hello|thanks|what is|who is|when|where|translate|define|summari[sz]e|hola|gracias|qué es|quién es|bonjour|merci|qu['’]est-ce que|hallo|danke|was ist)\b/iu;
const HIGH_STAKES_INTENT = /\b(?:incident response|forensic|forense|malware|ransomware|credential|credenzial|segreti?|data breach|violazione dati|exploit|zero.?day|production|produzione|deploy|migrazione|rollback|disaster recovery|ripristino|compliance|privacy)\b/giu;
const VERIFICATION_INTENT = /\b(?:verifica|testa|riproduci|dimostra|evidenza|root cause|causa radice|regression|regressione|benchmark|misura|validate|verify|reproduce|prove|measure)\b/giu;
const AMBIGUITY_INTENT = /\b(?:non (?:sono|è) chiar[oa]|ambigu[oa]|incert[oa]|potrebbe|forse|dipende|interpreta|chiarisci|assunzion[ei]|trade.?off|unclear|ambiguous|uncertain|might|depends|clarify|assumptions?)\b/giu;
const CLARIFICATION_REQUIRED_INTENT = /\b(?:(?:chiedi|chiedere|richiedi|ask|request)\b[\s\S]{0,80}\b(?:conferma|confermare|chiarimento|confirmation|clarification)|(?:non|senza|do not|don['’]?t|without)\b[\s\S]{0,60}\b(?:inventare|indovinare|supporre|guess(?:ing)?|assum(?:e|ing))\b[\s\S]{0,60}\b(?:nome|app|programma|termine|name|application|word)|(?:refuso|typo|nome non riconosciuto|termine non riconosciuto|misheard|unrecognized (?:name|word)))\b/iu;
const SECURITY_CRITICAL_INTENT = /\b(?:api[ -]?key|token segret|secret handling|prompt injection|iniezione (?:del )?prompt|inyecci[oó]n (?:de )?prompt|injection de prompt|prompt-injektion|jailbreak|password (?:nel|en el|dans le|im) repository|chiave nel repository|clave api|cl[eé] api|api-schlüssel)\b/giu;
const CODE_EXECUTION_REASONING = /\b(?:risultato|output|restituisce|stampa|esegue|evaluate|result|prints?|returns?|resultado|devuelve|imprime|r[eé]sultat|renvoie|affiche|ergebnis|gibt aus)\b[\s\S]{0,100}\b(?:javascript|typescript|python|java|c\+\+|codice|code|c[oó]digo)\b|\b(?:javascript|typescript|python|java|c\+\+|codice|code|c[oó]digo)\b[\s\S]{0,100}\b(?:risultato|output|restituisce|stampa|esegue|evaluate|result|prints?|returns?|resultado|devuelve|imprime|r[eé]sultat|renvoie|affiche|ergebnis|gibt aus)\b/giu;
const CODE_CREATION_INTENT = /\b(?:scrivi|crea|genera|implementa|correggi|refactor(?:izza)?|write|create|generate|implement|fix|refactor|escribe|crea|genera|implementa|corrige|écris|crée|génère|implémente|corrige|schreibe|erstelle|generiere|implementiere|korrigiere)\b[\s\S]{0,100}\b(?:funzion[ei]|classe|script|query|regex|algoritm[oi]|api|javascript|typescript|python|java|c\+\+|rust|go|sql|codice|code|c[oó]digo)\b/giu;
const FORMAL_REASONING_INTENT = /\b(?:risolvi|calcola|dimostra|deriva|integrale|equazione|probabilit[àa]|statistica|ottimizzazione|complessit[àa]|crittografia|logica|solve|calculate|prove|derive|integral|equation|probability|statistics|optimization|complexity|cryptography|logic|resuelve|calcula|demuestra|résous|calcule|démontre|löse|berechne|beweise)\b/giu;
const CONSENT_BOUNDARY_INTENT = /\b(?:senza (?:aver )?(?:scelto|selezionato|autorizzato)|non (?:ho|hai|ha|abbiamo) (?:ancora )?(?:scelto|selezionato|autorizzato)|prima (?:di|che) (?:creare|modificare|eseguire)|chiedi(?:mi)? (?:il )?permesso|richiedi (?:il )?consenso|cartella (?:non )?(?:scelta|selezionata|autorizzata)|without (?:choosing|selecting|permission)|(?:have not|haven't|has not|hasn't) (?:yet )?(?:chosen|selected|authorized)|ask (?:for )?(?:permission|consent)|folder (?:is )?not selected)\b/giu;
const SOFTWARE_SECURITY_INTENT = /\b(?:sql injection|command injection|code injection|xss|cross[ -]?site scripting|csrf|ssrf|path traversal|directory traversal|deserializzazione non sicura|insecure deserialization|race condition|buffer overflow|use[ -]?after[ -]?free|vulnerabilit[àa]|security flaw|security bug)\b/giu;
const CONTEXT_REVISION_INTENT = /\b(?:correzione|rettifica|modifica dell['’]?ambito|aggiorna(?:to)?|sostituisci|rimuovi|escludi|considera soltanto|usa soltanto|rimasto|valore corretto|invece|come ho detto|nel messaggio precedente|correction|scope change|updated value|replace|remove|exclude|only consider|remaining|instead|as I said|previous message)\b/giu;

// #endregion

// #region Routing e risposte istantanee

function countMatches(text, pattern) { return [...text.matchAll(pattern)].length; }
function requiresClarification(question) { return CLARIFICATION_REQUIRED_INTENT.test(String(question || '').trim()); }

function intelligenceSignals({ question, requestedMode = 'fast', attachmentCount = 0, historyCount = 0 } = {}) {
  const text = String(question || '').trim();
  if (requestedMode === 'deep') return { mode: 'deep', score: 10, confidence: 1, risk: 'normal', needsReview: false, reasons: ['user-requested'] };
  if (attachmentCount > 0) return { mode: 'deep', score: 10, confidence: 1, risk: 'normal', needsReview: false, reasons: ['attachments'] };
  const clarificationRequired = requiresClarification(text);
  const shortSimpleEscalation = clarificationRequired
    || countMatches(text, SECURITY_CRITICAL_INTENT) > 0
    || countMatches(text, CODE_EXECUTION_REASONING) > 0
    || countMatches(text, CODE_CREATION_INTENT) > 0
    || countMatches(text, CONSENT_BOUNDARY_INTENT) > 0;
  if (!text || (text.length < 140 && SIMPLE_INTENT.test(text) && !shortSimpleEscalation)) return { mode: 'fast', score: 0, confidence: 0.99, risk: 'low', needsReview: false, reasons: ['simple-intent'] };
  let score = text.length >= 240 ? 2 : text.length >= 140 ? 1 : 0;
  const reasons = [];
  const add = (points, reason) => { if (points > 0) { score += points; reasons.push(reason); } };
  add(Math.min(3, countMatches(text, COMPLEX_INTENT)), 'complex-intent');
  add(Math.min(2, countMatches(text, ARTIFACT_INTENT)), 'artifact');
  add(Math.min(2, countMatches(text, HIGH_STAKES_INTENT)), 'high-stakes');
  add(Math.min(2, countMatches(text, VERIFICATION_INTENT)), 'verification');
  add(Math.min(2, countMatches(text, AMBIGUITY_INTENT)), 'ambiguity');
  add(clarificationRequired ? 3 : 0, 'clarification-required');
  add(countMatches(text, SECURITY_CRITICAL_INTENT) ? 3 : 0, 'security-critical');
  add(countMatches(text, CODE_EXECUTION_REASONING) ? 3 : 0, 'code-execution');
  add(countMatches(text, CODE_CREATION_INTENT) ? 3 : 0, 'code-creation');
  add(countMatches(text, FORMAL_REASONING_INTENT) ? 3 : 0, 'formal-reasoning');
  add(countMatches(text, CONSENT_BOUNDARY_INTENT) ? 3 : 0, 'consent-boundary');
  add(countMatches(text, SOFTWARE_SECURITY_INTENT) ? 4 : 0, 'software-security');
  add(historyCount > 0 && countMatches(text, CONTEXT_REVISION_INTENT) ? 3 : 0, 'context-revision');
  add((text.match(/\?/g) || []).length >= 2 ? 3 : 0, 'multiple-questions');
  add(/\b(?:poi|dopodiché|inoltre|anche|prima.+poi|passo\s+passo|then|afterwards|also|step\s+by\s+step|después|además|paso\s+a\s+paso|ensuite|également|étape\s+par\s+étape|danach|außerdem|schritt\s+für\s+schritt)\b/iu.test(text) ? 1 : 0, 'multi-step');
  add(/```|\b(?:errore|error|erreur|fehler|stack trace|traceback|exception|log|test fallit|failing test)\b/iu.test(text) ? 1 : 0, 'diagnostic-evidence');
  add((text.match(/(?:^|\s)(?:[-*]|\d+\.)\s+/gm) || []).length >= 3 ? 1 : 0, 'multiple-constraints');
  const securityCritical = reasons.includes('security-critical');
  const highStakes = reasons.includes('high-stakes') || reasons.includes('software-security');
  const ambiguous = reasons.includes('ambiguity') || reasons.includes('clarification-required');
  const mode = score >= 3 ? 'deep' : 'fast';
  const distance = Math.abs(score - 2.5);
  const confidence = Math.min(0.98, Math.max(0.55, 0.62 + distance * 0.12));
  const risk = securityCritical ? 'critical' : highStakes ? 'high' : ambiguous ? 'medium' : 'normal';
  return { mode, score, confidence: Number(confidence.toFixed(2)), risk, needsReview: securityCritical || highStakes || confidence < 0.7, reasons };
}

function resolveIntelligenceMode(options) { return intelligenceSignals(options).mode; }

function shouldUseDeliberateThinking({ question, requestedMode = 'fast' } = {}) {
  // Il modello principale è già più capace del fast model. Attivare una lunga
  // traccia di ragionamento per ogni codice, allegato o richiesta "Pro" può
  // moltiplicare il TTFT senza migliorare il risultato. La abilitiamo soltanto
  // quando i segnali richiedono davvero una catena formale o una verifica
  // complessa; tutti gli altri turni profondi usano il modello principale in
  // modalità diretta.
  const signals = intelligenceSignals({ question, requestedMode: 'fast', attachmentCount: 0 });
  const reasons = new Set(signals.reasons);
  // Prevedere l'output di codice esistente richiede simulazione; creare codice
  // ordinario viene gia protetto da checklist, validazione e review. Evitiamo
  // minuti di ragionamento nascosto per una funzione breve.
  if (reasons.has('code-execution')) return true;
  if (reasons.has('formal-reasoning') && signals.score >= 5) return true;
  if (reasons.has('high-stakes') && reasons.has('verification')) return true;
  if (reasons.has('complex-intent') && reasons.has('verification') && reasons.has('multi-step')) return true;
  if (requestedMode === 'deep' && signals.score >= 7) return true;
  return false;
}

function shouldPreferFastExecutionModel({ question, attachmentCount = 0, historyCount = 0 } = {}) {
  const text = String(question || '').trim();
  if (attachmentCount > 0) return false;
  const signals = intelligenceSignals({ question: text, requestedMode: 'fast', attachmentCount: 0, historyCount });
  const reasons = new Set(signals.reasons);
  const requiresPrimaryModel = reasons.has('code-execution')
    || reasons.has('verification')
    || reasons.has('high-stakes')
    || reasons.has('software-security')
    || reasons.has('context-revision')
    || reasons.has('security-critical')
    || (reasons.has('formal-reasoning') && !reasons.has('code-creation'))
    || reasons.has('clarification-required');
  if (requiresPrimaryModel) return false;
  // La classificazione "fast" deve avere un effetto reale sul modello scelto:
  // conversazione, definizioni, traduzioni e richieste ordinarie passano al
  // modello rapido. Le richieste profonde continuano sul modello principale.
  if (signals.mode === 'fast') return true;
  // La generazione di codice breve resta adatta al modello rapido quando non
  // richiede simulazione, verifica o ragionamento ad alto rischio.
  return text.length <= 1_200 && reasons.has('code-creation');
}

function instantConversationalReply(question, language = 'it') {
  const text = String(question || '').trim().toLocaleLowerCase(language);
  if (/^(?:chi\s+[èe]|who\s+is)\s+lapo\s+bardi[!.?\s]*$/u.test(text)) {
    return 'Lapo Bardi è l’inventore di questa bellissima AI: programmatore, informatico e, per sua stessa definizione, super sexy.';
  }
  if (/^(?:ciao|salve|buongiorno|buonasera)[!.?\s]*$/u.test(text)) return 'Ciao! Come posso aiutarti?';
  if (/^(?:grazie|grazie mille)[!.?\s]*$/u.test(text)) return 'Di nulla. Sono qui quando vuoi.';
  if (/^(?:hello|hi|hey)[!.?\s]*$/u.test(text)) return 'Hello! How can I help?';
  if (/^(?:thanks|thank you)[!.?\s]*$/u.test(text)) return 'You’re welcome. I’m here whenever you need me.';
  if (/^(?:hola|buenos días|buenas tardes|buenas noches)[!.?\s]*$/u.test(text)) return '¡Hola! ¿Cómo puedo ayudarte?';
  if (/^(?:gracias|muchas gracias)[!.?\s]*$/u.test(text)) return 'De nada. Estoy aquí cuando quieras.';
  if (/^(?:bonjour|bonsoir|salut)[!.?\s]*$/u.test(text)) return 'Bonjour ! Comment puis-je vous aider ?';
  if (/^(?:merci|merci beaucoup)[!.?\s]*$/u.test(text)) return 'Avec plaisir. Je suis là quand vous voulez.';
  if (/^(?:hallo|guten morgen|guten tag|guten abend)[!.?\s]*$/u.test(text)) return 'Hallo! Wie kann ich helfen?';
  if (/^(?:danke|vielen dank)[!.?\s]*$/u.test(text)) return 'Gern. Ich bin da, wenn du mich brauchst.';
  if (/^(?:olá|oi|bom dia|boa tarde|boa noite)[!.?\s]*$/u.test(text)) return 'Olá! Como posso ajudar?';
  if (/^(?:obrigado|obrigada|muito obrigado|muito obrigada)[!.?\s]*$/u.test(text)) return 'De nada. Estou aqui quando precisar.';
  if (/^(?:hallo|hoi)[!.?\s]*$/u.test(text)) return 'Hallo! Hoe kan ik helpen?';
  if (/^(?:bedankt|dank je|dank u)[!.?\s]*$/u.test(text)) return 'Graag gedaan. Ik ben er wanneer je me nodig hebt.';
  if (/^(?:cześć|dzień dobry)[!.?\s]*$/u.test(text)) return 'Cześć! Jak mogę pomóc?';
  if (/^(?:dziękuję|dzięki)[!.?\s]*$/u.test(text)) return 'Nie ma za co. Jestem tutaj, gdy mnie potrzebujesz.';
  if (/^(?:привет|здравствуйте)[!.?\s]*$/u.test(text)) return 'Здравствуйте! Чем я могу помочь?';
  if (/^(?:спасибо|большое спасибо)[!.?\s]*$/u.test(text)) return 'Пожалуйста. Я рядом, когда понадоблюсь.';
  if (/^(?:こんにちは|こんばんは|おはよう)[!.?。！？\s]*$/u.test(text)) return 'こんにちは。どのようにお手伝いできますか？';
  if (/^(?:ありがとう|ありがとうございます)[!.?。！？\s]*$/u.test(text)) return 'どういたしまして。必要なときはいつでもどうぞ。';
  if (/^(?:你好|您好)[!.?。！？\s]*$/u.test(text)) return '你好！我能帮你做什么？';
  if (/^(?:谢谢|多谢)[!.?。！？\s]*$/u.test(text)) return '不客气。需要时我随时在。';
  if (/^(?:안녕하세요|안녕)[!.?\s]*$/u.test(text)) return '안녕하세요! 무엇을 도와드릴까요?';
  if (/^(?:감사합니다|고마워요)[!.?\s]*$/u.test(text)) return '천만에요. 필요할 때 언제든 말씀하세요.';
  if (/^(?:مرحبا|السلام عليكم)[!.؟?\s]*$/u.test(text)) return 'مرحبًا! كيف يمكنني مساعدتك؟';
  if (/^(?:شكرا|شكرًا)[!.؟?\s]*$/u.test(text)) return 'على الرحب والسعة. أنا هنا عندما تحتاج إليّ.';
  return null;
}

// #endregion

module.exports = { intelligenceSignals, resolveIntelligenceMode, shouldUseDeliberateThinking, shouldPreferFastExecutionModel, instantConversationalReply, requiresClarification };
