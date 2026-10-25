/** @module remote/public-artifacts Typed results with accessible, quiet copy/download actions. */
// #region Browser-only DOM renderer, serialized by the public shell
function createPublicArtifacts({ container, icons, copy = (it, en) => it }) {
  function safeUrl(value, image = false) {
    const text = typeof value === 'string' ? value : '';
    if (image) return text.length <= 2 * 1024 * 1024 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/i.test(text) ? text : '';
    try { const url = new URL(text); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  }
  function action(label, icon, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'response-action';
    button.setAttribute('aria-label', label); button.innerHTML = icon; button.addEventListener('click', handler); return button;
  }
  function download(item, imageUrl) {
    const stem = String(item.title || 'NexusNXS').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 80) || 'NexusNXS';
    const name = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem) ? 'NexusNXS-' + stem : stem;
    const url = imageUrl || URL.createObjectURL(new Blob([String(item.content || '').slice(0, 96 * 1024)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url;
    link.download = name + (imageUrl ? imageUrl.startsWith('data:image/jpeg') ? '.jpg' : imageUrl.startsWith('data:image/webp') ? '.webp' : '.png' : '.txt');
    link.click(); if (!imageUrl) setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function renderArtifacts(values) {
    container.replaceChildren();
    for (const item of (Array.isArray(values) ? values : []).slice(0, 12)) {
      if (!item || typeof item !== 'object' || item.kind === 'file-change') continue;
      const card = document.createElement('article'), title = document.createElement('strong'); card.className = 'artifact-card';
      title.textContent = String(item.title || copy('Risultato', 'Result')).slice(0, 180); card.append(title);
      const imageUrl = item.kind === 'image' ? safeUrl(item.url, true) : '';
      if (imageUrl) {
        card.dataset.kind = 'image'; const image = document.createElement('img');
        image.src = imageUrl; image.alt = title.textContent; image.loading = 'lazy'; image.decoding = 'async'; card.append(image);
      } else {
        const content = document.createElement(item.kind === 'code' ? 'pre' : 'p');
        content.textContent = String(item.content || '').slice(0, 96 * 1024); card.append(content);
      }
      const source = item.kind === 'link' ? safeUrl(item.url) : '';
      if (source) {
        const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer';
        link.textContent = copy('Apri fonte', 'Open source'); card.append(link);
      }
      const actions = document.createElement('div'); actions.className = 'artifact-actions';
      if (!imageUrl) actions.append(action(copy('Copia risultato', 'Copy result'), icons.copy, async event => {
        const button = event.currentTarget;
        try { await navigator.clipboard.writeText(String(item.content || '').slice(0, 96 * 1024)); button.innerHTML = icons.check; button.setAttribute('aria-label', copy('Copiato', 'Copied')); }
        catch { button.setAttribute('aria-label', copy('Copia non riuscita', 'Copy failed')); }
      }));
      actions.append(action(copy('Scarica risultato', 'Download result'), icons.download, () => download(item, imageUrl)));
      card.append(actions); container.append(card);
    }
  }
  return { renderArtifacts };
}
// #endregion
module.exports = { createPublicArtifacts };
