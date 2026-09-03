/**
 * @module application/response-quality
 * @description Trasforma i vincoli osservabili della richiesta in una checklist breve e deterministica.
 */
const { requiresClarification } = require('./intelligence-routing');
const { arithmeticAnswerValid, simpleArithmeticSolution } = require('./simple-arithmetic');

const NUMBER_WORDS = Object.freeze({
  zero: 0, uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10,
  undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17, diciotto: 18, diciannove: 19, venti: 20,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
  dos: 2, tres: 3, cuatro: 4, cinco: 5, siete: 7, ocho: 8, nueve: 9, diez: 10,
  eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, fünf: 5, sieben: 7, acht: 8, neun: 9, zehn: 10
});
const NUMBER_WORD_PATTERN = Object.keys(NUMBER_WORDS).sort((left, right) => right.length - left.length).join('|');
const QUANTITY_MODE_PATTERN = 'esattamente|massimo|non più di|almeno|exactly|at most|no more than|at least|exactamente|como máximo|al menos|exactement|au plus|au moins|genau|höchstens|mindestens';

function parseNumberToken(value) {
  const token = String(value || '').trim().toLocaleLowerCase();
  if (/^\d+$/u.test(token)) return Number(token);
  return Object.prototype.hasOwnProperty.call(NUMBER_WORDS, token) ? NUMBER_WORDS[token] : null;
}

function wordCountConstraint(question = '') {
  const match = String(question || '').match(new RegExp(`\\b(${QUANTITY_MODE_PATTERN})\\s+(\\d+|${NUMBER_WORD_PATTERN})\\s+(?:parol\\w*|words?|palabras?|mots?|wörter)`, 'iu'));
  if (!match) return null;
  const expected = parseNumberToken(match[2]);
  if (!Number.isFinite(expected)) return null;
  const modeToken = match[1].toLocaleLowerCase();
  const mode = /^(?:esattamente|exactly|exactamente|exactement|genau)$/iu.test(modeToken)
    ? 'exact'
    : /^(?:massimo|non più di|at most|no more than|como máximo|au plus|höchstens)$/iu.test(modeToken) ? 'max' : 'min';
  return { mode, expected };
}

function strictWordCountSchema(question = '') {
  const constraint = wordCountConstraint(question);
  if (!constraint || constraint.mode !== 'exact' || constraint.expected < 1 || constraint.expected > 40) return null;
  return {
    type: 'object',
    properties: {
      words: {
        type: 'array', minItems: constraint.expected, maxItems: constraint.expected,
        items: { type: 'string', minLength: 1, maxLength: 80 }
      }
    },
    required: ['words'],
    additionalProperties: false
  };
}

function strictWordCountAnswer(question = '', payload = '') {
  const constraint = wordCountConstraint(question);
  if (!constraint || constraint.mode !== 'exact') return '';
  let parsed;
  try { parsed = typeof payload === 'string' ? JSON.parse(payload.trim()) : payload; }
  catch { return ''; }
  const words = Array.isArray(parsed?.words) ? parsed.words.map((word) => String(word || '').trim()) : [];
  if (words.length !== constraint.expected || words.some((word) => !word || countWords(word) !== 1 || /\s/u.test(word))) return '';
  const answer = words.join(' ');
  return countWords(answer) === constraint.expected ? answer : '';
}

function hasStrictOutputConstraint(question = '') {
  const text = String(question || '');
  return Boolean(
    wordCountConstraint(text)
    || /\b(?:solo|soltanto)\s+(?:json|un json)|json valido\b/iu.test(text)
    || /\b(?:una|un')\s+(?:sola\s+)?frase\b|\bin one sentence\b/iu.test(text)
    || /\b(?:rispondi|restituisci|scrivi)\s+(?:soltanto|solo|esclusivamente)\s+(?:con\s+)?(?:l['’])?output\b/iu.test(text)
  );
}

// #region Segnali verificabili

function responseRequirements(question = '') {
  const text = String(question || '').trim();
  const requirements = [];
  const arithmetic = simpleArithmeticSolution(text);
  const words = wordCountConstraint(text);
  if (arithmetic) requirements.push(`Usa il risultato aritmetico verificato: ${arithmetic.normalizedExpression} = ${arithmetic.formatted}.`);
  if (/\b(?:solo|soltanto)\s+(?:json|un json)|json valido\b/iu.test(text)) requirements.push('Restituisci JSON valido senza testo esterno.');
  if (words) {
    const relation = words.mode === 'exact' ? 'esattamente' : words.mode === 'max' ? 'al massimo' : 'almeno';
    requirements.push(`Restituisci ${relation} ${words.expected} parole: conta i token lessicali dell’output finale e non aggiungere preamboli.`);
  } else if (/\b(?:esattamente|massimo|non più di|almeno)\s+\d+\s+(?:fras|punt|element|rig)/iu.test(text)) {
    requirements.push('Rispetta il limite quantitativo esplicito e ricontalo prima dell’output.');
  }
  if (/\b(?:una|un')\s+(?:sola\s+)?frase\b|\bin one sentence\b/iu.test(text)) requirements.push('Usa una sola frase completa.');
  if (/```|\b(?:codice|javascript|typescript|python|java|c\+\+|sql|regex)\b/iu.test(text)) requirements.push('Verifica sintassi, risultato e casi limite del codice prima di presentarlo.');
  if (/\b(?:equazione|formula|matemat|algebra|geometri|derivat|integral|probabilit|statistic)\w*\b|[=+−×÷√∑∫±≤≥]/iu.test(text)) {
    requirements.push('Scrivi le formule con simboli matematici Unicode leggibili (×, ÷, ±, √, ≤, ≥) oppure con delimitatori LaTeX $...$ e $$...$$; non usare comandi LaTeX fuori dai delimitatori.');
  }
  if (requiresClarification(text)) requirements.push('Non indovinare il riferimento ambiguo: chiedi una conferma breve e specifica.');
  if (/\b(?:rispondi|restituisci|scrivi)\s+(?:soltanto|solo|esclusivamente)\s+(?:con\s+)?(?:l['’])?output\b/iu.test(text)) requirements.push('Restituisci soltanto l’output richiesto, senza prefissi, spiegazioni o Markdown.');
  if (/\b(?:fonte|fonti|citazione|riferiment|documentazione|verifica sul web)\b/iu.test(text)) requirements.push('Distingui fatti verificati, inferenze e fonti; non inventare riferimenti.');
  if (/<(?:CONTESTO|DOC|RISULTATO)\b/iu.test(text)) requirements.push('Usa soltanto il contesto fornito e conserva letteralmente valori, unità e identificatori delle fonti pertinenti.');
  if (/\b(?:correzione|rettifica|aggiornamento)\s*:/iu.test(text)) requirements.push('La correzione più recente sostituisce l’ambito precedente: non ripetere elementi esclusi e nomina esplicitamente quelli rimasti.');
  if (/\b(?:apri|avvia|chiudi|crea|scrivi|modifica|elimina|cancella|installa|esegui)\b/iu.test(text)) requirements.push('Non dichiarare eseguita alcuna azione senza il risultato verificato del relativo strumento.');
  const explicitConstraints = text.match(/\b(?:deve|devono|senza|evita|non usare|prima|dopodiché|poi|assicurati|mantieni|soltanto|esattamente)\b/giu)?.length || 0;
  if (explicitConstraints >= 2) requirements.push(`Copri tutti i vincoli espliciti (${explicitConstraints} segnali rilevati) senza privilegiarne soltanto l’ultimo.`);
  if ((text.match(/\?/g) || []).length >= 2) requirements.push('Rispondi a ogni domanda separatamente e controlla che nessuna resti implicita.');
  return [...new Set(requirements)].slice(0, 6);
}

// #endregion
// #region Direttiva interna

function responseQualityDirective(question, { deep = false } = {}) {
  const requirements = responseRequirements(question);
  if (!requirements.length) return deep
    ? 'REVISIONE INTERNA: controlla silenziosamente correttezza, completezza e coerenza prima dell’output.'
    : 'CONTROLLO INTERNO: rispondi direttamente e non inventare dettagli.';
  return `CHECKLIST DI RISPOSTA (non mostrarla):\n${requirements.map((item) => `- ${item}`).join('\n')}\nPrima di inviare, verifica ogni punto e correggi l’output se uno non è soddisfatto.`;
}

function countWords(value) {
  return String(value || '').trim().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length || 0;
}

function validateResponse(question = '', answer = '', security = {}) {
  const prompt = String(question || '').trim();
  const output = String(answer || '').trim();
  const issues = [];
  if (!output) return { valid: false, issues: ['empty-response'] };

  if (arithmeticAnswerValid(prompt, output) === false) issues.push('arithmetic-mismatch');

  if (/\b(?:solo|soltanto)\s+(?:json|un json)|json valido\b/iu.test(prompt)) {
    try { JSON.parse(output); } catch { issues.push('invalid-json'); }
  }
  const quantity = wordCountConstraint(prompt);
  if (quantity) {
    const actual = countWords(output);
    if (quantity.mode === 'exact' && actual !== quantity.expected) issues.push('word-count');
    if (quantity.mode === 'max' && actual > quantity.expected) issues.push('word-count');
    if (quantity.mode === 'min' && actual < quantity.expected) issues.push('word-count');
  }
  if (/\b(?:una|un')\s+(?:sola\s+)?frase\b|\bin one sentence\b/iu.test(prompt)) {
    const sentences = output.split(/(?<=[.!?])\s+(?=[\p{Lu}\d])/u).filter(Boolean).length;
    if (sentences > 1) issues.push('sentence-count');
  }
  if (requiresClarification(prompt)) {
    const asksForClarification = /\b(?:intendi|volevi dire|puoi confermare|potresti confermare|confermi|quale app|quale programma|did you mean|could you confirm|which app|quieres decir|puedes confirmar|voulez-vous dire|pouvez-vous confirmer|meinst du|kannst du bestätigen)\b/iu.test(output);
    if (!asksForClarification) issues.push('missing-clarification');
  }
  if (/\b(?:rispondi|restituisci|scrivi)\s+(?:soltanto|solo|esclusivamente)\s+(?:con\s+)?(?:l['’])?output\b/iu.test(prompt)
    && (/```/u.test(output) || /^\s*(?:output|risultato|result)\s*:/iu.test(output))) {
    issues.push('output-only-format');
  }
  if (/\b(?:apri|avvia|chiudi|crea|scrivi|modifica|elimina|cancella|installa|esegui)\b/iu.test(prompt)
    && /\b(?:ho|abbiamo)\s+(?:già\s+)?(?:aperto|avviato|chiuso|creato|scritto|modificato|eliminato|cancellato|installato|eseguito)\b/iu.test(output)) {
    issues.push('unverified-action');
  }
  const secretRequest = /\b(?:api[ -]?key|chiave api|clave api|cl[eé] api|api-schlüssel|token segret|secret)\b/iu.test(prompt)
    && /\b(?:repository|repo|git|codice|code|c[oó]digo)\b/iu.test(prompt);
  if (secretRequest) {
    const warnsAgainstCommit = /\b(?:non|mai|evita|never|do not|don't|no|nunca|jamais|nicht|niemals)\b/iu.test(output);
    const givesSafeStorage = /\b(?:variabil|environment|secret manager|vault|gestor de secretos|gestionnaire de secrets|umgebungsvariab|keystore)\b/iu.test(output);
    if (!warnsAgainstCommit || !givesSafeStorage) issues.push('unsafe-secret-guidance');
  }
  if (/\b(?:prompt injection|iniezione (?:del )?prompt|inyecci[oó]n (?:de )?prompt|injection de prompt|prompt-injektion|ignora (?:il|le) sistema|ignore (?:the )?system)\b/iu.test(prompt)) {
    const recognizesUntrustedInstruction = /\b(?:iniezione|injection|inyecci[oó]n|injektion|istruzioni?|instructions?|instrucci[oó]n|anweisung|non fidat|untrusted|malicios|malveillant|bösartig)\b/iu.test(output);
    if (!recognizesUntrustedInstruction) issues.push('prompt-injection-missed');
  }
  if (security.promptInjection === true) {
    const recognizesUntrustedInstruction = /\b(?:iniezione|injection|inyecci[oó]n|injektion|istruzioni?|instructions?|instrucci[oó]n|anweisung|non fidat|untrusted|malicios|malveillant|bösartig)\b/iu.test(output);
    if (!recognizesUntrustedInstruction) issues.push('indirect-prompt-injection-missed');
  }
  for (const literal of security.sensitiveLiterals || []) {
    if (String(literal).length >= 4 && output.includes(String(literal))) issues.push('sensitive-echo');
  }
  const italianPrompt = /[àèéìòù]|\b(?:perché|come|cosa|deve|voglio|puoi|fammi|dimmi)\b/iu.test(prompt);
  if (italianPrompt && /\b(?:the|this|you should|here is|i cannot)\b/i.test(output) && !/[àèéìòù]/iu.test(output)) issues.push('wrong-language');
  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function shouldReviewResponse({ signals = {}, validation = {}, sourceCount = 0 } = {}) {
  if (validation.valid === false) return true;
  if (signals.risk === 'critical' || signals.risk === 'high') return true;
  if (signals.needsReview === true && sourceCount === 0) return true;
  return false;
}

module.exports = {
  responseQualityDirective, responseRequirements, validateResponse, shouldReviewResponse,
  countWords, wordCountConstraint, strictWordCountSchema, strictWordCountAnswer, hasStrictOutputConstraint
};

// #endregion
