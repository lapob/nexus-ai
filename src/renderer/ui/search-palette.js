import { $, isTextInput, listen, setInteractive } from '../utils/dom.js';

export function createSearchPalette({ nodes, actions, onSelect }) {
  const palette = $('#commandPalette'); const input = $('#graphSearch'); const results = $('#searchResults'); const status = $('#searchStatus'); const shell = $('#nexusShell');
  const cleanups = []; let trigger = null; let matches = []; let activeIndex = 0;
  const render = () => {
    const query = input.value.trim().toLowerCase();
    matches = [...nodes.map((node) => ({ id: node.id, label: node.label, category: node.category, type: 'node', available: true })), ...actions]
      .filter((item) => !query || `${item.label} ${item.category}`.toLowerCase().includes(query));
    activeIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));
    results.replaceChildren(...matches.map((item, index) => {
      const option = document.createElement('button'); const label = document.createElement('span'); const category = document.createElement('small');
      option.id = `search-result-${index}`; option.className = 'search-result'; option.type = 'button'; option.role = 'option'; option.disabled = item.available === false;
      option.ariaSelected = String(index === activeIndex); label.textContent = item.label; category.textContent = item.available === false ? 'NOT AVAILABLE' : item.category;
      option.append(label, category); option.onclick = () => { if (item.available !== false) { onSelect(item); close(); } };
      return option;
    }));
    if (matches.length) input.setAttribute('aria-activedescendant', `search-result-${activeIndex}`);
    else input.removeAttribute('aria-activedescendant');
    status.textContent = matches.length ? `${matches.length} risultati` : 'Nessun risultato nel graph corrente.';
  };
  const open = (source = document.activeElement) => { trigger = source; activeIndex = 0; setInteractive(palette, true); shell.classList.add('palette-open'); input.value = ''; render(); requestAnimationFrame(() => input.focus()); };
  const close = () => { setInteractive(palette, false); shell.classList.remove('palette-open'); trigger?.focus?.(); };
  listen(input, 'input', () => { activeIndex = 0; render(); }, undefined, cleanups);
  listen(input, 'keydown', (event) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && matches.length) { event.preventDefault(); activeIndex = (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length; render(); results.children[activeIndex]?.scrollIntoView({ block: 'nearest' }); }
    else if (event.key === 'Enter' && matches[activeIndex]?.available !== false) { event.preventDefault(); onSelect(matches[activeIndex]); close(); }
  }, undefined, cleanups);
  listen(document, 'keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); palette.hidden ? open() : close(); }
    else if (event.key === '/' && palette.hidden && !isTextInput()) { event.preventDefault(); open(); }
  }, undefined, cleanups);
  return { open, close, isOpen: () => !palette.hidden, destroy: () => cleanups.forEach((cleanup) => cleanup()) };
}
