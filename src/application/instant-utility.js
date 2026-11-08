/**
 * @module application/instant-utility
 * @description Risposte locali istantanee per richieste temporali semplici.
 */

// #region 01 — Ora, data e conversioni

const TIME_CUE = /^(?:jarvis[,.]?\s*)?(?:che\s+ore\s+sono|dimmi\s+l['’]?ora|ora\s+attuale|what\s+time\s+is\s+it|current\s+time)[?!.\s]*$/iu;
const DATE_CUE = /^(?:jarvis[,.]?\s*)?(?:che\s+(?:giorno|data)\s+[èe](?:\s+oggi)?|qual\s+[èe]\s+la\s+data(?:\s+di)?\s+oggi|data\s+di\s+oggi|oggi\s+che\s+giorno\s+[èe]|what(?:'s|\s+is)\s+(?:today['’]?s\s+)?date(?:\s+today)?|what\s+day\s+is\s+(?:it|today)|today['’]?s\s+date)[?!.\s]*$/iu;
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

// #endregion

// #region 02 — Conteggio dei giorni e risposta istantanea

// Una breve istruzione di forma prima della domanda («Rispondi in una frase:»)
// non cambia la richiesta: senza questo passo la risposta istantanea non scattava.
const FORMAT_PREFIX = /^(?:per\s+favore[,\s]+)?(?:rispondi|answer|dimmi|tell\s+me)(?:\s+[\p{L}\p{N}'’]+){0,5}\s*[:,]\s*/iu;

// Conteggio dei giorni calcolato, non stimato: dal vivo il modello rispondeva
// «79 giorni a Capodanno» il 7 novembre (corretto: 55).
const MONTHS = Object.freeze({ gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 });
const HOLIDAYS = Object.freeze({
  natale: [12, 25, 'Natale'], 'la vigilia di natale': [12, 24, 'la Vigilia di Natale'], 'vigilia di natale': [12, 24, 'la Vigilia di Natale'],
  capodanno: [1, 1, 'Capodanno'], "l'epifania": [1, 6, "l'Epifania"], epifania: [1, 6, "l'Epifania"], befana: [1, 6, 'la Befana'],
  'san valentino': [2, 14, 'San Valentino'], ferragosto: [8, 15, 'Ferragosto'], halloween: [10, 31, 'Halloween'], 'santo stefano': [12, 26, 'Santo Stefano']
});
const DAYS_UNTIL_CUE = /^(?:jarvis[,.]?\s*)?(?:e\s+)?(?:quanti\s+giorni\s+(?:mancano|ci\s+sono|restano)\s+(?:fino\s+)?(?:all['’]\s*|a(?:l(?:la|lo)?)?\s+)|tra\s+quanti\s+giorni\s+(?:è|e|sarà|cade|arriva)\s+)(?:il\s+|la\s+|lo\s+|l['’])?([\p{L}'’ ]+?|\d{1,2}\s+[\p{L}]+(?:\s+\d{4})?)[?!.\s]*$/iu;

function localDayNumber(date, timeZone) {
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date).split('-').map(Number);
  return { year, ordinal: Date.UTC(year, month - 1, day) / 86_400_000 };
}

function deterministicDaysUntilReply(text, now) {
  const match = text.match(DAYS_UNTIL_CUE);
  if (!match) return null;
  const target = match[1].trim().toLocaleLowerCase('it-IT').replace(/[’]/g, "'");
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = localDayNumber(now, timeZone);
  let month; let day; let label; let year = null;
  if (HOLIDAYS[target]) [month, day, label] = HOLIDAYS[target];
  else {
    const explicit = /^(\d{1,2})\s+(\p{L}+)(?:\s+(\d{4}))?$/u.exec(target);
    if (!explicit || !MONTHS[explicit[2]]) return null;
    day = Number(explicit[1]); month = MONTHS[explicit[2]]; year = explicit[3] ? Number(explicit[3]) : null;
    label = `il ${day} ${explicit[2]}${year ? ` ${year}` : ''}`;
  }
  const candidateYear = year ?? today.year;
  let ordinal = Date.UTC(candidateYear, month - 1, day) / 86_400_000;
  const check = new Date(ordinal * 86_400_000);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  if (year === null && ordinal < today.ordinal) ordinal = Date.UTC(candidateYear + 1, month - 1, day) / 86_400_000;
  const days = ordinal - today.ordinal;
  // Preposizione articolata: «al 15 marzo», «all'8 marzo», «alla Vigilia», «all'Epifania», «a Natale».
  const toward = /^il (?:8|11)\b/.test(label) ? `all'${label.slice(3)}` : label.startsWith('il ') ? `al ${label.slice(3)}`
    : label.startsWith('la ') ? `alla ${label.slice(3)}` : label.startsWith("l'") ? `all'${label.slice(2)}` : `a ${label}`;
  const subject = `${label[0].toUpperCase()}${label.slice(1)}`;
  if (days < 0) return `${subject} è già passato da ${-days} ${-days === 1 ? 'giorno' : 'giorni'}.`;
  if (days === 0) return `${subject} è oggi.`;
  return `Mancano ${days} ${days === 1 ? 'giorno' : 'giorni'} ${toward}.`;
}

function deterministicUtilityReply(question = '', now = new Date()) {
  const text = String(question || '').normalize('NFKC').trim().replace(FORMAT_PREFIX, '').trim();
  if (!text || text.length > 160 || Number.isNaN(now?.getTime?.())) return null;
  const conversion = deterministicConversionReply(text);
  if (conversion) return conversion;
  const daysUntil = deterministicDaysUntilReply(text, now);
  if (daysUntil) return daysUntil;
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

// #endregion

module.exports = { deterministicConversionReply, deterministicDaysUntilReply, deterministicUtilityReply, normalizedUnit, FORMAT_PREFIX };
