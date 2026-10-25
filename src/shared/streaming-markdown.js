/** @module shared/streaming-markdown Preserve fenced code verbatim while incomplete prose markers stream. */
function streamSafeMarkdown(value) {
  function inline(part) {
    let safe = part;
    for (const token of ['**', '`']) if ((safe.split(token).length - 1) % 2) {
      const at = safe.lastIndexOf(token); safe = safe.slice(0, at) + safe.slice(at + token.length);
    }
    const stars = [...safe.matchAll(/(?<!\*)\*(?!\*)/g)];
    if (stars.length % 2) { const at = stars.at(-1).index; safe = safe.slice(0, at) + safe.slice(at + 1); }
    return safe;
  }
  const output = [], prose = []; let fenced = false;
  const flush = () => { if (prose.length) { output.push(inline(prose.join('\n'))); prose.length = 0; } };
  for (const line of String(value || '').split('\n')) {
    if (line.trimStart().startsWith('```')) { flush(); fenced = !fenced; output.push(line); }
    else if (fenced) output.push(line); else prose.push(line);
  }
  flush(); return output.join('\n');
}
module.exports = { streamSafeMarkdown };
