/** @module shared/web-image-query Explicit public-image intent, without conversation context. */
// #region Public subject extraction
function webImageQuery(value = '') {
  const text = String(value).trim();
  if (text.length > 500 || /(?:\b[A-Z]:\\|\/(?:Users|home)\/|\b(?:password|secret|api[_ -]?key|token)\s*[:=]|\b(?:sk|pk|ghp|github_pat)_[A-Za-z0-9_-]{12,})/iu.test(text)) return '';
  const match = text.match(/^(?:cerca(?:mi)?|mostra(?:mi)?|trova(?:mi)?|search(?:\s+for)?|show(?:\s+me)?|find)\s+(?:(?:delle?|le|alcune|some)\s+)?(?:foto|immagini|fotografie|photos?|pictures?|images?)\s+(?:(?:dal\s+web|sul\s+web|online|from\s+the\s+web)\s+)?(?:di|del|della|dello|dei|degli|delle|of)\s+([^\n;]+?)[.!?]?$/iu);
  if (!match || /\b(?:miei?|mie|mio|mia|my|this\s+(?:file|folder)|quest[oa]\s+(?:file|cartella)|allegat\w*)\b/iu.test(match[1])) return '';
  return match[1].replace(/\s+/g, ' ').trim().slice(0, 160);
}
// #endregion
module.exports = { webImageQuery };
