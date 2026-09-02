/**
 * @module application/instant-utility
 * @description Risposte locali istantanee per richieste temporali semplici.
 */

const TIME_CUE = /^(?:jarvis[,.]?\s*)?(?:che\s+ore\s+sono|dimmi\s+l['’]?ora|ora\s+attuale|what\s+time\s+is\s+it|current\s+time)[?!.\s]*$/iu;
const DATE_CUE = /^(?:jarvis[,.]?\s*)?(?:che\s+(?:giorno|data)\s+[èe]|data\s+di\s+oggi|oggi\s+che\s+giorno\s+[èe]|what(?:'s|\s+is)\s+(?:today['’]?s\s+)?date|what\s+day\s+is\s+it|today['’]?s\s+date)[?!.\s]*$/iu;
const CONVERSION_CUE = /^(?:converti|convert|quanto(?:\s+fanno|\s+sono)?|how\s+much\s+is)\s+([+-]?\d+(?:[.,]\d+)?)\s*(km|chilometri?|mi|miglia|kg|chilogrammi?|lb|libbre?|°?c|celsius|°?f|fahrenheit)\s+(?:in|to)\s+(km|chilometri?|mi|miglia|kg|chilogrammi?|lb|libbre?|°?c|celsius|°?f|fahrenheit)[?!.\s]*$/iu;

const UNIT_GROUPS = Object.freeze({
  km: { group: 'length', toBase: (value) => value, fromBase: (value) => value, label: 'km' },
  mi: { group: 'length', toBase: (value) => value * 1.609344, fromBase: (value) => value / 1.609344, label: 'mi' },
  kg: { group: 'mass', toBase: (value) => value, fromBase: (value) => value, label: 'kg' },
  lb: { group: 'mass', toBase: (value) => value * 0.45359237, fromBase: (value) => value / 0.45359237, label: 'lb' },
  c: { group: 'temperature', toBase: (value) => value, fromBase: (value) => value, label: '°C' },
  f: { group: 'temperature', toBase: (value) => (value - 32) * 5 / 9, fromBase: (value) => value * 9 / 5 + 32, label: '°F' }
});

function normalizedUnit(value = '') {
  const unit = String(value).toLocaleLowerCase().replace('°', '');
  if (/^(?:km|chilometr)/u.test(unit)) return 'km';
  if (/^(?:mi|migli)/u.test(unit)) return 'mi';
  if (/^(?:kg|chilogram)/u.test(unit)) return 'kg';
  if (/^(?:lb|libr)/u.test(unit)) return 'lb';
  if (/^(?:c|celsius)$/u.test(unit)) return 'c';
  if (/^(?:f|fahrenheit)$/u.test(unit)) return 'f';
  return '';
}

function deterministicConversionReply(text) {
  const match = text.match(CONVERSION_CUE);
  if (!match) return null;
  const source = UNIT_GROUPS[normalizedUnit(match[2])];
  const target = UNIT_GROUPS[normalizedUnit(match[3])];
  const input = Number(match[1].replace(',', '.'));
  if (!source || !target || source.group !== target.group || !Number.isFinite(input)) return null;
  const converted = target.fromBase(source.toBase(input));
  const value = Number.parseFloat(converted.toPrecision(8));
  const italian = /^(?:converti|quanto)/iu.test(text);
  const formatted = new Intl.NumberFormat(italian ? 'it-IT' : 'en-US', { maximumFractionDigits: 6 }).format(value);
  return italian ? `${formatted} ${target.label}.` : `${formatted} ${target.label}.`;
}

function deterministicUtilityReply(question = '', now = new Date()) {
  const text = String(question || '').normalize('NFKC').trim();
  if (!text || text.length > 160 || Number.isNaN(now?.getTime?.())) return null;
  const conversion = deterministicConversionReply(text);
  if (conversion) return conversion;
  if (TIME_CUE.test(text)) {
    const italian = /\b(?:che|dimmi|ora)\b/iu.test(text);
    const value = new Intl.DateTimeFormat(italian ? 'it-IT' : 'en-US', {
      hour: '2-digit', minute: '2-digit'
    }).format(now);
    return italian ? `Sono le ${value}.` : `It is ${value}.`;
  }
  if (DATE_CUE.test(text)) {
    const italian = /\b(?:che|data|oggi|giorno)\b/iu.test(text);
    const value = new Intl.DateTimeFormat(italian ? 'it-IT' : 'en-US', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(now);
    return italian ? `Oggi è ${value}.` : `Today is ${value}.`;
  }
  return null;
}

module.exports = { deterministicConversionReply, deterministicUtilityReply, normalizedUnit };
