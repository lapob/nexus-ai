/**
 * @module application/simple-code-output
 * @description Risolve pochi output JavaScript puri e verificabili senza eval, shell o modello.
 */

const OUTPUT_INTENT = /\b(?:output|risultat[oa]|stampa|stampato|prints?|result|resultado|résultat|ergebnis)\b/iu;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function javascriptNumber(value) {
  if (Object.is(value, -0)) return '0';
  return Number.isFinite(value) ? String(value) : null;
}

function deterministicCodeOutputReply(question = '') {
  const source = String(question || '');
  const validation = source.match(/\b(?:stringa|string)\s+(["'])([+-]?\d+(?:\.\d+)?[A-Za-z]{1,12})\1[\s\S]{0,120}?\b(?:NaN|valid|controll|finite)\b/iu);
  const multiplier = source.match(/(?:moltiplicat[ao]?\s+per|multiplied\s+by|\*)\s*([+-]?\d+(?:\.\d+)?)/iu);
  if (validation && multiplier && /\bjavascript\b/iu.test(source) && /\b(?:correzion|corregg|fix|valid)\p{L}*/iu.test(source)) {
    return `Usa \`const value = parseFloat('${validation[2]}'); if (!Number.isFinite(value)) throw new TypeError('Valore non valido'); const result = value * ${multiplier[1]};\` per separare conversione e validazione.`;
  }
  if (!OUTPUT_INTENT.test(source) || !/\b(?:javascript|console\.log|const)\b/iu.test(source)) return null;

  const declaration = source.match(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*\[([^\]]{1,400})\]\s*\.map\s*\(\s*([A-Za-z_$][\w$]*)\s*=>\s*([^;)\r\n]{1,120})\s*\)\s*;?/u);
  const inline = source.match(/\[([^\]]{1,400})\]\s*\.map\s*\(\s*([A-Za-z_$][\w$]*)\s*=>\s*([^;)\r\n]{1,120})\s*\)\s*\.join\s*\(\s*(["'])([^"'\r\n]{0,8})\4\s*\)/u);
  if (!declaration && !inline) return null;
  const variable = declaration?.[1] || '';
  const valuesSource = declaration?.[2] || inline[1];
  const parameter = declaration?.[3] || inline[2];
  const expressionSource = declaration?.[4] || inline[3];
  if ((declaration && !IDENTIFIER.test(variable)) || !IDENTIFIER.test(parameter)) return null;

  const values = valuesSource.split(',').map((value) => value.trim());
  if (!values.length || values.length > 64 || values.some((value) => !NUMBER.test(value))) return null;
  const expression = expressionSource.trim().match(/^([A-Za-z_$][\w$]*)\s*([+\-*/%])\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+))$/u);
  if (!expression || expression[1] !== parameter) return null;
  const operator = expression[2];
  const operand = Number(expression[3]);
  if (!Number.isFinite(operand) || ((operator === '/' || operator === '%') && operand === 0)) return null;

  const log = declaration
    ? source.match(/console\.log\s*\(\s*([A-Za-z_$][\w$]*)\.join\s*\(\s*(["'])([^"'\r\n]{0,8})\2\s*\)\s*\)/u)
    : null;
  if (declaration && (!log || log[1] !== variable)) return null;
  const separator = declaration ? log[3] : inline[5];
  const operation = {
    '+': (left) => left + operand,
    '-': (left) => left - operand,
    '*': (left) => left * operand,
    '/': (left) => left / operand,
    '%': (left) => left % operand
  }[operator];
  const output = values.map((value) => javascriptNumber(operation(Number(value))));
  return output.some((value) => value === null) ? null : output.join(separator);
}

module.exports = { deterministicCodeOutputReply };
