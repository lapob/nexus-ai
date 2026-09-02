/**
 * @module application/simple-arithmetic
 * @description Riconosce e verifica richieste aritmetiche elementari senza eseguire codice.
 */

const NUMBER_SOURCE = '[+-]?\\d+(?:[.,]\\d+)?';
const OPERATOR_SOURCE = [
  'alla\\s+potenza\\s+di', 'elevat[oa]\\s+a', 'to\\s+the\\s+power\\s+of', 'raised\\s+to',
  'moltiplicat[oa]\\s+per', 'multiplied\\s+by', 'divis[oa]\\s+per', 'divided\\s+by',
  'pi[uù]', 'plus', 'meno', 'minus', 'times', 'over', 'per', '\\*\\*', '[+*/^x×÷−-]'
].join('|');
const ARITHMETIC_CHAIN = new RegExp(`(${NUMBER_SOURCE}(?:\\s*(?:${OPERATOR_SOURCE})\\s*${NUMBER_SOURCE}){1,7})`, 'giu');
const ARITHMETIC_CONTINUATION = new RegExp(`^\\s*(?:${OPERATOR_SOURCE})\\s*${NUMBER_SOURCE}`, 'iu');
const MATH_CUE = /\b(?:quanto\s+(?:fa|fanno)|qual\s+[èe]\s+(?:il\s+)?(?:risultato|valore)|calcola|calcolare|trova\s+(?:il\s+)?risultato|dammi\s+(?:il\s+)?risultato|what(?:'s|\s+is)|calculate|compute|find\s+the\s+(?:result|answer)|give\s+me\s+the\s+(?:result|answer))\b/giu;
const EXPLANATION_CUE = /\b(?:spiega|explain)\b/iu;
const DETAILED_EXPLANATION_CUE = /\b(?:mostra\s+(?:i\s+)?passaggi|passo\s+passo|dimostra|show\s+(?:the\s+)?work|step\s+by\s+step|prove)\b/iu;
const CODE_CONTEXT = /```|\b(?:javascript|typescript|python|java|c\+\+|codice|code|script|regex)\b/iu;
const OUTPUT_NUMBER_ONLY = /\b(?:(?:rispondi|restituisci|scrivi)\s+(?:solo|soltanto|esclusivamente)\s+(?:con\s+)?(?:il\s+)?(?:numero|risultato)|(?:solo|soltanto|esclusivamente)\s+(?:il\s+)?(?:numero|risultato)|(?:reply|answer|return|write)\s+(?:only|just|exclusively)\s+(?:with\s+)?(?:the\s+)?(?:number|result)|(?:only|just)\s+(?:the\s+)?(?:number|result))\b/iu;
const OUTPUT_NUMBER_AND_UNIT = /\b(?:(?:rispondi|restituisci|scrivi)\s+(?:solo|soltanto)\s+con\s+(?:il\s+)?(?:numero|totale(?:\s+finale)?|risultato)\s+e\s+(?:l['’]\s*)?unit[aà]|(?:reply|answer)\s+(?:only|just)\s+with\s+(?:the\s+)?(?:number|final\s+total|result)\s+and\s+unit)(?=$|[^\p{L}])/iu;
const PERCENT_CHANGE_CUE = /\b(?:aument|increment|cres|miglior|riduc|ridott|dimin|cal|perd|fall|scart|scont|increase|grow|improv|reduce|decrease|drop|lose|lost|fail|discard|discount)/iu;
const PERCENT_INCREASE_CUE = /\b(?:aument|increment|cres|miglior|increase|grow|improv|gain)\p{L}*/iu;
const PERCENT_DECREASE_CUE = /\b(?:riduc|ridott|dimin|cal|perd|fall|scart|scont|reduce|decrease|drop|lose|lost|fail|discard|discount)\p{L}*/iu;

// #region 01 — Parsing ed esecuzione aritmetica sicura

function normalizeExpression(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('it-IT')
    .replace(/(\d),(\d)/gu, '$1.$2')
    .replace(/alla\s+potenza\s+di|elevat[oa]\s+a|to\s+the\s+power\s+of|raised\s+to/giu, '^')
    .replace(/divis[oa]\s+per|divided\s+by|over/giu, '/')
    .replace(/moltiplicat[oa]\s+per|multiplied\s+by|times|per/giu, '*')
    .replace(/pi[uù]|plus/giu, '+')
    .replace(/meno|minus/giu, '-')
    .replace(/\*\*/gu, '^')
    .replace(/[x×]/giu, '*')
    .replace(/÷/gu, '/')
    .replace(/−/gu, '-');
}

function tokenize(expression) {
  const normalized = normalizeExpression(expression);
  if (normalized.length > 160 || !/^[\d.e+\-*/^\s]+$/u.test(normalized)) return null;
  const tokens = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    const rest = normalized.slice(cursor);
    const spaces = rest.match(/^\s+/u);
    if (spaces) { cursor += spaces[0].length; continue; }
    const number = rest.match(/^(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/iu);
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value) || Math.abs(value) > 1e100) return null;
      tokens.push({ type: 'number', value });
      cursor += number[0].length;
      continue;
    }
    const operator = rest[0];
    if (!'+-*/^'.includes(operator)) return null;
    tokens.push({ type: 'operator', value: operator });
    cursor += 1;
  }
  return tokens.length <= 32 ? tokens : null;
}

function evaluateTokens(tokens) {
  if (!tokens?.length) return null;
  let position = 0;
  const peek = (value) => tokens[position]?.type === 'operator' && tokens[position].value === value;
  const consume = () => tokens[position++];

  const primary = () => {
    const token = consume();
    return token?.type === 'number' ? token.value : null;
  };
  let power;
  const unary = () => {
    if (peek('+')) { consume(); return unary(); }
    if (peek('-')) { consume(); const value = unary(); return value === null ? null : -value; }
    return power();
  };
  power = () => {
    const left = primary();
    if (left === null) return null;
    if (!peek('^')) return left;
    consume();
    const exponent = unary();
    if (exponent === null || Math.abs(exponent) > 100) return null;
    const value = left ** exponent;
    return Number.isFinite(value) && Math.abs(value) <= 1e100 ? value : null;
  };
  const product = () => {
    let value = unary();
    if (value === null) return null;
    while (peek('*') || peek('/')) {
      const operator = consume().value;
      const right = unary();
      if (right === null || (operator === '/' && right === 0)) return null;
      value = operator === '*' ? value * right : value / right;
      if (!Number.isFinite(value) || Math.abs(value) > 1e100) return null;
    }
    return value;
  };
  const sum = () => {
    let value = product();
    if (value === null) return null;
    while (peek('+') || peek('-')) {
      const operator = consume().value;
      const right = product();
      if (right === null) return null;
      value = operator === '+' ? value + right : value - right;
      if (!Number.isFinite(value) || Math.abs(value) > 1e100) return null;
    }
    return value;
  };

  const value = sum();
  return value !== null && position === tokens.length ? (Object.is(value, -0) ? 0 : value) : null;
}

function cueIsBoundToExpression(text, cue, expression) {
  if (!cue) return false;
  if (cue.index <= expression.index) {
    const gap = text.slice(cue.index + cue[0].length, expression.index);
    return /^\s*(?:(?:di|of|dell['’]?operazione|della\s+operazione)\s*)?[:=]?\s*$/iu.test(gap);
  }
  const gap = text.slice(expression.index + expression[0].length, cue.index);
  return /^\s*[:;,-]?\s*$/u.test(gap);
}

function detectLanguage(question) {
  const text = String(question || '');
  if (/\b(?:in\s+italiano|rispondi|quanto|qual\s+[èe]|calcola|risultato|pi[uù]|meno|per|divis[oa]|moltiplicat[oa]|elevat[oa])\b/iu.test(text)) return 'it';
  return 'en';
}

function formatNumber(value, language = 'it') {
  if (Number.isSafeInteger(value)) return String(value);
  const rounded = Number.parseFloat(Number(value).toPrecision(12));
  const plain = String(rounded);
  return language === 'it' ? plain.replace('.', ',') : plain;
}

/**
 * Risolve il caso strettamente confinato "N elementi da X unità ciascuno",
 * seguito da una sola variazione percentuale. Il parser resta intenzionalmente
 * ristretto: con più quantità, percentuali o verbi ambigui delega al modello.
 */
function percentageAggregateSolution(question = '') {
  const text = String(question || '').normalize('NFKC').trim();
  if (!text || text.length > 2_000 || CODE_CONTEXT.test(text)) return null;
  const countWords = {
    uno: 1, una: 1, due: 2, tre: 3, quattro: 4, cinque: 5,
    one: 1, two: 2, three: 3, four: 4, five: 5,
  };
  const match = text.match(/\b(uno|una|due|tre|quattro|cinque|one|two|three|four|five|\d+)\s+(?:file|element[oi]|document[oi]|archiv[io]|items?|files?|documents?)\b[\s\S]{0,96}?\b(\d+(?:[.,]\d+)?)\s*([\p{L}][\p{L}\d/-]{0,15})\s+(?:ciascun[oaie]?|ognuno|each)\b[\s\S]{0,120}?\b(\d+(?:[.,]\d+)?)\s*%/iu);
  if (!match) return null;
  const percentageMatches = [...text.matchAll(/\d+(?:[.,]\d+)?\s*%/gu)];
  if (percentageMatches.length !== 1) return null;
  const count = countWords[match[1].toLocaleLowerCase('it-IT')] || Number(match[1]);
  const each = Number(match[2].replace(',', '.'));
  const amount = Number(match[4].replace(',', '.'));
  if (!Number.isSafeInteger(count) || count < 1 || count > 1_000_000) return null;
  if (!Number.isFinite(each) || each < 0 || !Number.isFinite(amount) || amount < 0 || amount > 1000) return null;
  const hasIncrease = PERCENT_INCREASE_CUE.test(text);
  const hasDecrease = PERCENT_DECREASE_CUE.test(text);
  if (hasIncrease === hasDecrease) return null;
  const factor = hasIncrease ? 1 + (amount / 100) : 1 - (amount / 100);
  const value = count * each * factor;
  if (!Number.isFinite(value) || Math.abs(value) > 1e100) return null;
  const language = detectLanguage(text);
  return { value, formatted: formatNumber(value, language), language, unit: match[3] };
}

function percentageSequenceSolution(question = '') {
  const text = String(question || '').normalize('NFKC').trim();
  if (!text || text.length > 2_000 || CODE_CONTEXT.test(text) || !PERCENT_CHANGE_CUE.test(text)) return null;
  const numbers = [...text.matchAll(/[+-]?\d+(?:[.,]\d+)?(?:\s*%)?/gu)];
  const base = numbers.find((match) => !match[0].includes('%'));
  const percentages = numbers.filter((match) => match[0].includes('%'));
  if (!base || percentages.length < 1 || percentages.length > 3) return null;
  if (numbers.filter((match) => !match[0].includes('%')).length !== 1) return null;

  let value = Number(base[0].replace(',', '.'));
  if (!Number.isFinite(value) || Math.abs(value) > 1e100) return null;
  const operations = [];
  for (const percentage of percentages) {
    const amount = Number(percentage[0].replace('%', '').replace(',', '.').trim());
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000) return null;
    const start = Math.max(0, percentage.index - 72);
    const end = Math.min(text.length, percentage.index + percentage[0].length + 72);
    const context = text.slice(start, end);
    const center = percentage.index - start + (percentage[0].length / 2);
    const nearest = (pattern) => [...context.matchAll(new RegExp(pattern.source, 'giu'))]
      .reduce((distance, match) => {
        const cueStart = start + match.index;
        const cueEnd = cueStart + match[0].length;
        const between = cueEnd <= percentage.index
          ? text.slice(cueEnd, percentage.index)
          : text.slice(percentage.index + percentage[0].length, cueStart);
        // Un verbo non può governare una percentuale oltre un'altra variazione:
        // "aumenta del 25%, poi il 10% fallisce" contiene due clausole vicine,
        // ma ciascun verbo deve restare legato alla propria percentuale.
        if (/%/u.test(between)) return distance;
        return Math.min(distance, Math.abs((match.index + (match[0].length / 2)) - center));
      }, Infinity);
    const increaseDistance = nearest(PERCENT_INCREASE_CUE);
    const decreaseDistance = nearest(PERCENT_DECREASE_CUE);
    if (!Number.isFinite(increaseDistance) && !Number.isFinite(decreaseDistance)) return null;
    if (increaseDistance === decreaseDistance) return null;
    operations.push({ operator: increaseDistance < decreaseDistance ? '+' : '-', amount });
  }
  for (const operation of operations) {
    const factor = operation.operator === '+' ? 1 + (operation.amount / 100) : 1 - (operation.amount / 100);
    value *= factor;
    if (!Number.isFinite(value) || Math.abs(value) > 1e100) return null;
  }

  const unitMatch = text.slice(base.index + base[0].length).match(/^\s*([\p{L}][\p{L}/-]*(?:\s+(?:al|per|a|each)\s+[\p{L}][\p{L}/-]*)?)/iu);
  const language = detectLanguage(text);
  return {
    value,
    formatted: formatNumber(value, language),
    language,
    unit: String(unitMatch?.[1] || '').trim()
  };
}

// #endregion
// #region 02 — Risposta deterministica e verifica

function simpleArithmeticSolution(question = '') {
  const text = String(question || '').normalize('NFKC').trim();
  if (!text || text.length > 2_000 || CODE_CONTEXT.test(text)) return null;
  ARITHMETIC_CHAIN.lastIndex = 0;
  const expressions = [...text.matchAll(ARITHMETIC_CHAIN)];
  if (expressions.length !== 1) return null;
  const expression = expressions[0];
  // Il limite intenzionale della catena non deve trasformarsi in una risposta
  // parziale: se dopo il match continua un'altra operazione, delega al modello.
  const remainder = text.slice(expression.index + expression[0].length);
  if (ARITHMETIC_CONTINUATION.test(remainder)) return null;
  MATH_CUE.lastIndex = 0;
  const cues = [...text.matchAll(MATH_CUE)];
  const symbolicOnly = /^[\s\d.,+\-*/^x×÷−]+[?!.\s]*$/u.test(text);
  if (!symbolicOnly && !cues.some((cue) => cueIsBoundToExpression(text, cue, expression))) return null;
  const tokens = tokenize(expression[0]);
  const value = evaluateTokens(tokens);
  if (value === null) return null;
  const language = detectLanguage(text);
  return {
    expression: expression[0],
    normalizedExpression: normalizeExpression(expression[0]).replace(/\s+/gu, ''),
    value,
    formatted: formatNumber(value, language),
    language
  };
}

function deterministicArithmeticReply(question = '') {
  const prompt = String(question || '');
  if (DETAILED_EXPLANATION_CUE.test(prompt)) return null;
  const percentage = percentageAggregateSolution(question) || percentageSequenceSolution(question);
  if (percentage) {
    // Le catene percentuali richiedono una spiegazione semantica del contesto:
    // se l'utente la chiede, non ridurle a una formula potenzialmente ambigua.
    if (EXPLANATION_CUE.test(prompt)) return null;
    if (OUTPUT_NUMBER_AND_UNIT.test(String(question || '')) && percentage.unit) return `${percentage.formatted} ${percentage.unit}`;
    if (OUTPUT_NUMBER_ONLY.test(String(question || ''))) return percentage.formatted;
    return percentage.language === 'it'
      ? `Il risultato è ${percentage.formatted}${percentage.unit ? ` ${percentage.unit}` : ''}.`
      : `The result is ${percentage.formatted}${percentage.unit ? ` ${percentage.unit}` : ''}.`;
  }
  const solution = simpleArithmeticSolution(question);
  if (!solution) return null;
  if (EXPLANATION_CUE.test(prompt)) {
    const expression = solution.normalizedExpression
      .replace(/\*/gu, ' × ')
      .replace(/\//gu, ' ÷ ')
      .replace(/\^/gu, ' ^ ')
      .replace(/\+/gu, ' + ')
      .replace(/-/gu, ' − ')
      .replace(/\s+/gu, ' ')
      .trim();
    return solution.language === 'it'
      ? `Il calcolo è ${expression} = ${solution.formatted}.`
      : `The calculation is ${expression} = ${solution.formatted}.`;
  }
  if (OUTPUT_NUMBER_ONLY.test(String(question || ''))) return solution.formatted;
  return solution.language === 'it'
    ? `Il risultato è ${solution.formatted}.`
    : `The result is ${solution.formatted}.`;
}

function arithmeticAnswerValid(question = '', answer = '') {
  const solution = simpleArithmeticSolution(question);
  if (!solution) return null;
  const output = String(answer || '').normalize('NFKC').trim();
  if (!output) return false;
  const numeric = '[+-]?\\d+(?:[.,]\\d+)?(?:e[+-]?\\d+)?';
  const marker = `(?:risultato(?:\\s+(?:è|e'))?|result(?:\\s+is)?|answer(?:\\s+is)?|equals?|(?<![\\p{L}\\p{N}])(?:è|e')(?=\\s))`;
  const marked = [...output.matchAll(new RegExp(`${marker}\\s*(?:di\\s*)?[:=]?\\s*(${numeric})`, 'giu'))];
  const candidates = marked.length
    ? [marked.at(-1)[1]]
    : (/^\s*[+-]?\d+(?:[.,]\d+)?(?:e[+-]?\d+)?[.!?]?\s*$/iu.test(output) ? [output.replace(/[.!?\s]+$/gu, '')] : []);
  return candidates.some((candidate) => {
    const actual = Number(String(candidate).replace(',', '.'));
    const tolerance = Math.max(1e-12, Math.abs(solution.value) * 1e-10);
    return Number.isFinite(actual) && Math.abs(actual - solution.value) <= tolerance;
  });
}

// #endregion

module.exports = {
  arithmeticAnswerValid,
  deterministicArithmeticReply,
  evaluateTokens,
  formatNumber,
  normalizeExpression,
  percentageAggregateSolution,
  percentageSequenceSolution,
  simpleArithmeticSolution,
  tokenize
};
