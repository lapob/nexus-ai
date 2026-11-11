/**
 * @module web/search
 * @description Ricerca nelle conversazioni e nei file dei progetti: lessicale tollerante (accenti, maiuscole, desinenze
 * italiane, prefissi, frase esatta) e, sul PC, semantica con i vettori del modello di embedding locale. Tutto resta
 * sul dispositivo; i vettori vivono solo in memoria per la sessione.
 */

export interface SearchDoc { id: string; title: string; text: string; updatedAt: number }
export interface SearchHit { id: string; score: number; snippet: string; semantic: boolean }

const STOP = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'tra', 'fra', 'e', 'o', 'che', 'del', 'della', 'dei', 'delle', 'al', 'alla', 'ai', 'nel', 'nella', 'mi', 'ti', 'si', 'ci', 'the', 'and', 'of', 'to']);
const SUFFIX = /(?:azioni|azione|amente|mente|issim[aeio]|ando|endo|are|ere|ire|ato|ata|ati|ate|uto|uta|uti|ute|ito|ita|iti|ite|i|e|o|a)$/u;

/** Minuscole senza accenti, carattere per carattere: gli indici restano allineati al testo originale. */
export function fold(text: string): string {
  let out = '';
  for (const char of text) {
    const plain = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out += plain.length === char.length ? plain : char.toLowerCase().slice(0, char.length).padEnd(char.length, ' ');
  }
  return out;
}

/** Radice leggera per l'italiano: «viaggi», «viaggio», «viaggiare» → «viagg». */
export function stem(token: string): string {
  return token.length > 4 ? token.replace(SUFFIX, '') || token : token;
}

export function terms(text: string): string[] {
  return (fold(text).match(/[\p{L}\p{N}]+/gu) ?? []).filter((token) => token.length > 1 && !STOP.has(token)).map(stem);
}

/** Divide un estratto in pezzi, marcando le parole che corrispondono alla ricerca (stessa tolleranza della ricerca). */
export function highlight(text: string, query: string): Array<{ text: string; match: boolean }> {
  const wanted = [...new Set(terms(query))];
  if (!wanted.length || !text) return [{ text, match: false }];
  const parts: Array<{ text: string; match: boolean }> = [];
  let last = 0;
  for (const word of text.matchAll(/[\p{L}\p{N}]+/gu)) {
    const folded = fold(word[0]);
    const root = stem(folded);
    if (!wanted.some((needle) => root === needle || folded.startsWith(needle))) continue;
    const at = word.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), match: false });
    parts.push({ text: word[0], match: true });
    last = at + word[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), match: false });
  return parts;
}

function snippetFor(doc: SearchDoc, folded: string, needles: string[]): string {
  let at = -1;
  for (const needle of needles) { const index = folded.indexOf(needle); if (index >= 0 && (at < 0 || index < at)) at = index; }
  if (at < 0) return doc.text.slice(0, 90).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, at - 32);
  const raw = doc.text.slice(start, start + 110).replace(/\s+/g, ' ').trim();
  return `${start > 0 ? '…' : ''}${raw}${start + 110 < doc.text.length ? '…' : ''}`;
}

/** Punteggio lessicale: titolo ×3, corpo ×1, prefissi ×0,5, frase esatta +2; servono almeno il 60% dei termini. */
export function lexicalSearch(query: string, docs: SearchDoc[]): SearchHit[] {
  const wanted = [...new Set(terms(query))];
  const phrase = fold(query.trim());
  if (!wanted.length && phrase.length < 2) return [];
  const needed = Math.max(1, Math.ceil(wanted.length * 0.6));
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const foldedText = fold(doc.text);
    const titleTerms = new Set(terms(doc.title));
    const bodyTerms = new Set(terms(doc.text));
    let score = 0; let matched = 0;
    for (const term of wanted) {
      if (titleTerms.has(term)) { score += 3; matched += 1; }
      else if (bodyTerms.has(term)) { score += 1; matched += 1; }
      else if (term.length >= 3 && [...bodyTerms, ...titleTerms].some((token) => token.startsWith(term))) { score += 0.5; matched += 1; }
    }
    const exact = phrase.length >= 2 && (fold(doc.title).includes(phrase) || foldedText.includes(phrase));
    if (exact) score += 2;
    if (!exact && matched < needed) continue;
    const needles = [phrase, ...wanted].filter((needle) => needle.length >= 2);
    hits.push({ id: doc.id, score, snippet: snippetFor(doc, foldedText, needles), semantic: false });
  }
  return hits.sort((left, right) => right.score - left.score);
}

// #region Semantica (solo PC: vettori dal modello di embedding locale)

type Embed = (texts: string[]) => Promise<number[][]>;
const vectors = new Map<string, { at: number; vector: number[] }>();

function cosine(left: number[], right: number[]): number {
  let dot = 0; let a = 0; let b = 0;
  for (let index = 0; index < left.length; index += 1) { dot += left[index] * right[index]; a += left[index] ** 2; b += right[index] ** 2; }
  return a && b ? dot / Math.sqrt(a * b) : 0;
}

/**
 * Unisce ai risultati lessicali quelli semantici (parafrasi, sinonimi). I documenti si indicizzano una volta per
 * versione (`updatedAt`), a blocchi da 16, al massimo i 150 più recenti. Senza modello restituisce i lessicali.
 */
export async function semanticSearch(query: string, docs: SearchDoc[], lexical: SearchHit[], embed: Embed, signal?: AbortSignal): Promise<SearchHit[]> {
  const recent = [...docs].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 150);
  const missing = recent.filter((doc) => vectors.get(doc.id)?.at !== doc.updatedAt);
  for (let index = 0; index < missing.length; index += 16) {
    if (signal?.aborted) return lexical;
    const batch = missing.slice(index, index + 16);
    const result = await embed(batch.map((doc) => `${doc.title}\n${doc.text.slice(0, 1_500)}`));
    if (result.length !== batch.length) return lexical;
    batch.forEach((doc, position) => vectors.set(doc.id, { at: doc.updatedAt, vector: result[position] }));
  }
  if (signal?.aborted) return lexical;
  const [queryVector] = await embed([query]);
  if (!queryVector?.length) return lexical;
  const byId = new Map(lexical.map((hit) => [hit.id, hit]));
  const combined: SearchHit[] = [];
  for (const doc of recent) {
    const stored = vectors.get(doc.id);
    if (!stored || stored.vector.length !== queryVector.length) continue;
    const similarity = cosine(stored.vector, queryVector);
    const found = byId.get(doc.id);
    if (found) { combined.push({ ...found, score: found.score + Math.max(0, similarity - 0.3) * 6 }); byId.delete(doc.id); }
    else if (similarity >= 0.5) combined.push({ id: doc.id, score: (similarity - 0.3) * 6, snippet: doc.text.slice(0, 90).replace(/\s+/g, ' ').trim(), semantic: true });
  }
  return [...combined, ...byId.values()].sort((left, right) => right.score - left.score);
}

// #endregion
