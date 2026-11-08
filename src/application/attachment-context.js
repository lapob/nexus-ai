/**
 * @module application/attachment-context
 * @description Allegati di qualsiasi dimensione: se il testo supera lo spazio di contesto del modello, sceglie l'inizio di ogni file e i passaggi più pertinenti alla domanda, nell'ordine originale e dichiarando cosa è stato omesso.
 */

// #region 01 — Parametri

const FILE_SEPARATOR = '\n\n========\n\n';
const CHUNK = 2_400;
const OVERLAP = 300;
const STOPWORDS = new Set(('alla alle allo anche come con cosa dalla dalle degli della delle dello dove fare file hanno nella nelle nello nel per perché più quale quali quando quella quelle quello questa queste questo sono sulla sulle tra una uno che chi del dei gli non era essere fino ogni solo sui suo sua suoi tutto tutti '
  + 'about after also and are can for from have how into its more not that the their there these this what when where which with would your').split(/\s+/));

// #endregion

// #region 02 — Selezione

function terms(question) {
  return [...new Set(String(question || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .match(/[\p{L}\p{N}]{3,}/gu) || [])].filter((term) => !STOPWORDS.has(term)).slice(0, 40);
}

function chunks(text) {
  const parts = [];
  for (let start = 0; start < text.length; start += CHUNK - OVERLAP) {
    parts.push({ start, text: text.slice(start, start + CHUNK) });
    if (start + CHUNK >= text.length) break;
  }
  return parts;
}

function score(chunk, wanted) {
  if (!wanted.length) return 0;
  const haystack = chunk.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  let total = 0;
  for (const term of wanted) {
    let index = haystack.indexOf(term), hits = 0;
    while (index !== -1 && hits < 8) { hits += 1; index = haystack.indexOf(term, index + term.length); }
    // I termini rari della domanda pesano più di quelli ripetuti ovunque.
    total += hits ? 1 + Math.log2(1 + hits) : 0;
  }
  return total;
}

/**
 * Restituisce il contesto degli allegati entro `budget` caratteri. Sotto soglia
 * il testo resta intero; sopra, ogni file conserva l'intestazione e l'inizio, poi
 * entrano i passaggi con più termini della domanda.
 */
function fitAttachmentContext(text, question, budget) {
  const source = String(text || '');
  const limit = Math.max(4_000, Math.floor(Number(budget) || 0));
  if (source.length <= limit) return source;
  const wanted = terms(question);
  const files = source.split(FILE_SEPARATOR).map((body, file) => ({ file, header: body.split('\n', 1)[0], parts: chunks(body) }));
  const candidates = files.flatMap(({ file, parts }) => parts.map((part, index) => ({
    file, index, part, value: score(part.text, wanted) + (index === 0 ? 1_000 : 0)
  })));
  candidates.sort((left, right) => right.value - left.value || left.file - right.file || left.index - right.index);
  const chosen = new Set();
  let used = 0;
  const perFileOverhead = 160;
  for (const candidate of candidates) {
    const cost = candidate.part.text.length + perFileOverhead / 4;
    if (used + cost > limit - files.length * perFileOverhead) continue;
    chosen.add(`${candidate.file}:${candidate.index}`);
    used += cost;
  }
  return files.map(({ file, header, parts }) => {
    const kept = parts.map((part, index) => ({ part, index })).filter(({ index }) => chosen.has(`${file}:${index}`));
    if (!kept.length) return `${header}\n[file molto grande: nessun passaggio pertinente entra nel contesto; chiedi di una sezione specifica]`;
    const body = kept.map(({ part, index }, position) => {
      const gap = position > 0 && index - kept[position - 1].index > 1 ? '\n[…]\n' : '';
      return gap + (position > 0 && index === kept[position - 1].index + 1 ? part.text.slice(OVERLAP) : part.text);
    }).join('');
    const note = kept.length < parts.length ? `\n[estratti pertinenti: ${kept.length} sezioni su ${parts.length}; il resto del file è stato omesso per stare nel contesto del modello]` : '';
    return (body.startsWith(header) ? body : `${header}\n${body}`) + note;
  }).join(FILE_SEPARATOR);
}

// #endregion

module.exports = { fitAttachmentContext, FILE_SEPARATOR };
