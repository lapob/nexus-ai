/** @module remote/public-web-images Attributed web photographs using the existing artifact surface. */
// #region Browser image results
function createPublicWebImages({ target, queryFor, fetchAuthorized, phase, copy, signal }) {
  const urls = new Set();
  const clear = () => { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); target.querySelector('.web-image-gallery')?.remove(); };
  const search = async text => {
    const query = queryFor(text);
    if (!query) return null;
    clear();
    const requestSignal = signal();
    phase(copy('Cerco immagini sul web…', 'Searching for web images…'));
    const response = await fetchAuthorized('/api/guest/images/search', { method: 'POST', signal: requestSignal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || copy('Ricerca immagini non disponibile', 'Image search unavailable'));
    }
    const payload = await response.json();
    if (requestSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    target.replaceChildren();
    const gallery = document.createElement('div'); gallery.className = 'web-image-gallery';
    const sources = [];
    for (const item of (Array.isArray(payload.images) ? payload.images : []).slice(0, 3)) {
      let source;
      try { source = new URL(item.sourceUrl); } catch { continue; }
      if (source.protocol !== 'https:' || source.hostname !== 'commons.wikimedia.org' || source.port
        || source.username || source.password || !source.pathname.startsWith('/wiki/File:')) continue;
      if (typeof item.url !== 'string' || item.url.length > 350000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(item.url)) continue;
      const figure = document.createElement('figure'), image = document.createElement('img');
      const caption = document.createElement('figcaption'), link = document.createElement('a'), credit = document.createElement('small');
      const bytes = Uint8Array.from(atob(item.url.split(',')[1]), value => value.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: item.url.slice(5, item.url.indexOf(';')) })); urls.add(url);
      image.src = url; image.alt = String(item.alt || item.title || query).slice(0, 400); image.decoding = 'async';
      try { await image.decode(); } catch { URL.revokeObjectURL(url); urls.delete(url); continue; }
      if (requestSignal?.aborted) { clear(); throw new DOMException('Aborted', 'AbortError'); }
      if (image.naturalWidth > 2048 || image.naturalHeight > 4096) { URL.revokeObjectURL(url); urls.delete(url); continue; }
      link.href = source.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.textContent = String(item.title || query).slice(0, 180);
      credit.textContent = `${String(item.author || '').slice(0, 240)} · ${String(item.license || '').slice(0, 100)}`;
      caption.append(link, credit); figure.append(image, caption); gallery.append(figure);
      sources.push(`- [${link.textContent.replace(/[\[\]\\]/g, ' ')}](${source.href}) — ${credit.textContent}`);
    }
    if (!sources.length) return copy('Non ho trovato anteprime verificabili. Prova un soggetto più preciso.', 'No verified previews found. Try a more specific subject.');
    target.append(gallery);
    return `${copy('Immagini dal web · Wikimedia Commons', 'Web images · Wikimedia Commons')}\n\n${sources.join('\n')}`;
  };
  return { search, clear };
}
// #endregion
module.exports = { createPublicWebImages };
