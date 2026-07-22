import { $, escapeHtml, listen } from '../utils/dom.js';
import { motionQuery } from '../utils/motion.js';

export function createChatOverlay({ api, status, onStateChange }) {
  const overlay = $('#chatOverlay'); const messagesElement = $('#messages'); const question = $('#question'); const send = $('#send'); const cleanups = [];
  const initialWelcome = messagesElement.innerHTML; const history = []; let generating = false; let lastQuestion = '';
  const isOpen = () => overlay.dataset.state === 'open';
  const setOpen = (open) => {
    const expand = $('#chatExpand'); const active = document.activeElement;
    overlay.dataset.state = open ? 'open' : 'closed'; expand.setAttribute('aria-expanded', String(open)); expand.textContent = open ? '⌄' : '⌃'; expand.title = open ? 'Riduci chat' : 'Espandi chat';
    onStateChange?.(open);
    if (!open && overlay.contains(active) && ![expand, question, send].includes(active)) requestAnimationFrame(() => expand.focus());
  };
  const scroll = () => { messagesElement.scrollTop = messagesElement.scrollHeight; };
  const addMessage = (role, content, sources = []) => {
    $('.welcome-message', messagesElement)?.remove(); const article = document.createElement('article'); article.className = `message ${role}`;
    article.innerHTML = `<div class="role">${role === 'user' ? 'YOU' : 'NEXUS'}</div><div class="bubble">${escapeHtml(content)}</div>`;
    if (sources.length) { const row = document.createElement('div'); row.className = 'sources'; for (const [index, source] of sources.entries()) { const button = document.createElement('button'); button.type = 'button'; button.textContent = `Source ${index + 1} · ${source.title}`; button.addEventListener('click', () => api.openNote(source.relativePath)); row.append(button); } article.append(row); }
    if (role === 'assistant') { const actions = document.createElement('div'); actions.className = 'message-actions'; const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy'; copy.onclick = async () => { await api.copyText(content); copy.textContent = 'Copied'; }; const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Regenerate'; retry.onclick = () => lastQuestion && !generating && ask(lastQuestion); actions.append(copy, retry); article.append(actions); }
    messagesElement.append(article); scroll(); return article;
  };
  const reveal = async (article, content) => { if (motionQuery.matches) return; const bubble = $('.bubble', article); const chars = [...content]; bubble.textContent = ''; const step = Math.max(5, Math.ceil(chars.length / 70)); for (let index = 0; index < chars.length; index += step) { bubble.textContent = chars.slice(0, index + step).join(''); scroll(); await new Promise((resolve) => setTimeout(resolve, 18)); } };
  const setWorking = (working) => { generating = working; $('#thinkingIndicator').hidden = !working; $('#cognitiveState').textContent = working ? 'THINKING' : 'IDLE'; send.textContent = working ? '■' : '↑'; send.setAttribute('aria-label', working ? 'Interrompi elaborazione' : 'Invia messaggio'); send.title = working ? 'Interrompi elaborazione' : 'Invia messaggio'; status.setActivity(working ? 'thinking' : 'idle'); };
  const ask = async (text) => {
    if (generating) return api.cancel(); setOpen(true); setWorking(true); lastQuestion = text; addMessage('user', text); const requestHistory = history.slice(-8); history.push({ role: 'user', content: text }); const pending = addMessage('assistant', 'Searching local knowledge…');
    try { const result = await api.chat({ question: text, history: requestHistory, mode: $('#reasoningMode').value }); pending.remove(); const content = result.answer || result.error || 'No response available.'; const article = addMessage('assistant', content, result.sources || []); await reveal(article, content); history.push({ role: 'assistant', content }); }
    catch (error) { pending.remove(); addMessage('assistant', `Error: ${error.message}`); }
    finally { setWorking(false); }
  };
  listen($('#composer'), 'submit', (event) => { event.preventDefault(); if (generating) return api.cancel(); const text = question.value.trim(); if (text) { question.value = ''; ask(text); } }, undefined, cleanups);
  listen(question, 'keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); } else if (event.key.length === 1 && !isOpen()) setOpen(true); }, undefined, cleanups);
  listen($('#chatExpand'), 'click', () => setOpen(!isOpen()), undefined, cleanups); listen($('#chatMinimize'), 'click', () => setOpen(false), undefined, cleanups);
  listen($('#newChat'), 'click', () => { history.length = 0; messagesElement.innerHTML = initialWelcome; }, undefined, cleanups);
  const configureModels = async (settings) => { const installed = await api.listModels(); const names = [...new Set([settings.model, ...installed].filter(Boolean))]; $('#headerModel').replaceChildren(...names.map((name) => Object.assign(document.createElement('option'), { value: name, textContent: name }))); $('#headerModel').value = settings.model; $('#modelPicker').hidden = names.length === 0; return installed; };
  return { ask, setOpen, isOpen, configureModels, destroy: () => cleanups.forEach((cleanup) => cleanup()) };
}
