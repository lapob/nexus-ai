/**
 * @module renderer/systems/VoiceVocabulary
 * @description Correzione locale e prudente di nomi e termini tecnici trascritti.
 */

// #region 01 — Distanza conservativa e applicazione
function normalizeWord(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function distanceAtMostOne(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let edits = 0; let a = 0; let b = 0;
  while (a < left.length && b < right.length) {
    if (left[a] === right[b]) { a += 1; b += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) a += 1;
    else if (right.length > left.length) b += 1;
    else { a += 1; b += 1; }
  }
  return edits + Number(a < left.length || b < right.length) <= 1;
}

export function applyVoiceVocabulary(text: string, vocabulary: string): string {
  const terms = vocabulary.split(/[\n,;]/).map((term) => term.trim())
    .filter((term) => term.length >= 4 && term.length <= 64).slice(0, 100)
    .map((term) => ({ term, normalized: normalizeWord(term) }));
  if (!text || !terms.length) return text;
  return text.replace(/[\p{L}\p{N}][\p{L}\p{N}._+-]*/gu, (word) => {
    const normalized = normalizeWord(word);
    const candidate = terms.find(({ normalized: expected }) =>
      expected === normalized || (normalized.length >= 5 && distanceAtMostOne(normalized, expected)));
    return candidate?.term || word;
  });
}

// #endregion
