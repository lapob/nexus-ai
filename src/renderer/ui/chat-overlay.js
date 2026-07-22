import { $, escapeHtml, listen } from '../utils/dom.js';

export function createChatOverlay({ api, status }) {
  const overlay = $('#chatOverlay'); const messagesElement = $('#messages'); const question = $('#question'); const send = $('#send'); const cleanups = [];
  const initialWelcome = messagesElement.innerHTML; const history = []; let generating = false; let lastQuestion = ''; let active = null;
  const isOpen = () => overlay.dataset.state === 'open';
  const setOpen = (open) => { overlay.dataset.state = open ? 'open' : 'closed'; $('#chatExpand').setAttribute('aria-expanded', String(open)); $('#chatExpand').textContent = open ? '⌄' : '⌃'; };
  const scroll = () => { messagesElement.scrollTop = messagesElement.scrollHeight; };
  const addMessage = (role, content) => { $('.welcome-message', messagesElement)?.remove(); const article = document.createElement('article'); article.className = `message ${role}`; article.innerHTML = `<div class="role">${role === 'user' ? 'YOU' : 'NEXUS'}</div><div class="bubble">${escapeHtml(content)}</div>`; messagesElement.append(article); scroll(); return article; };
  const addSources = (article, sources = []) => { if (!sources.length || $('.sources', article)) return; const row = document.createElement('div'); row.className = 'sources'; for (const [index, source] of sources.entries()) { const button = document.createElement('button'); button.type = 'button'; button.textContent = `Source ${index + 1} · ${source.title}`; button.addEventListener('click', () => api.openNote(source.relativePath)); row.append(button); } article.append(row); };
  const addActions = (article, content) => { if ($('.message-actions', article)) return; const actions = document.createElement('div'); actions.className = 'message-actions'; const copy = document.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy'; copy.onclick = async () => { await api.copyText(content); copy.textContent = 'Copied'; }; const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Regenerate'; retry.onclick = () => lastQuestion && !generating && ask(lastQuestion); actions.append(copy, retry); article.append(actions); };
  const setWorking = (working) => { generating = working; $('#thinkingIndicator').hidden = !working; $('#cognitiveState').textContent = working ? 'THINKING' : 'IDLE'; send.textContent = working ? '■' : '↑'; send.setAttribute('aria-label', working ? 'Interrompi elaborazione' : 'Invia messaggio'); status.setActivity(working ? 'thinking' : 'idle'); };
  const unsubscribe = api.onStreamEvent((event) => {
    if (!active || event?.requestId !== active.requestId) return;
    if (event.type === 'sources') active.sources = event.sources || [];
    else if (event.type === 'token') { active.content += String(event.token || ''); active.bubble.textContent = active.content; scroll(); }
    else if (event.type === 'thinking') $('#cognitiveState').textContent = 'REASONING';
    else if (event.type === 'complete') { const content = active.content || event.result?.message?.content || 'No response available.'; active.bubble.textContent = content; addSources(active.article, active.sources); addActions(active.article, content); history.push({ role: 'assistant', content }); }
    else if (event.type === 'error') { active.content = event.error?.message || 'Local AI runtime unavailable'; active.bubble.textContent = active.content; addActions(active.article, active.content); }
    else if (event.type === 'cancel') active.bubble.textContent = active.content || 'Generation stopped.';
  });
  cleanups.push(unsubscribe);
  const ask = async (text) => {
    if (generating) return api.cancel(active?.requestId); setOpen(true); setWorking(true); lastQuestion = text; addMessage('user', text); const requestHistory = history.slice(-8); history.push({ role: 'user', content: text }); const article = addMessage('assistant', 'Connecting to local AI runtime…'); const requestId = crypto.randomUUID(); active = { requestId, article, bubble: $('.bubble', article), content: '', sources: [] };
    try { await api.streamChat({ requestId, question: text, history: requestHistory, mode: $('#reasoningMode').value }); }
    catch (error) { if (!active.content) active.bubble.textContent = error.message || 'Local AI runtime unavailable'; }
    finally { active = null; setWorking(false); }
  };
  listen($('#composer'), 'submit', (event) => { event.preventDefault(); if (generating) return api.cancel(active?.requestId); const text = question.value.trim(); if (text) { question.value = ''; ask(text); } }, undefined, cleanups);
  listen(question, 'keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit(); } else if (event.key.length === 1 && !isOpen()) setOpen(true); }, undefined, cleanups);
  listen($('#chatExpand'), 'click', () => setOpen(!isOpen()), undefined, cleanups); listen($('#chatMinimize'), 'click', () => setOpen(false), undefined, cleanups);
  listen($('#newChat'), 'click', () => { if (generating) api.cancel(active?.requestId); history.length = 0; messagesElement.innerHTML = initialWelcome; }, undefined, cleanups);
  const configureModels = async (settings) => { const models = await api.listModels(); const selected = settings.chatModel || settings.model || ''; $('#headerModel').replaceChildren(Object.assign(document.createElement('option'), { value: '', textContent: models.length ? 'Select model' : 'No local models' }), ...models.map((model) => Object.assign(document.createElement('option'), { value: model.id, textContent: model.name }))); $('#headerModel').value = models.some((model) => model.id === selected) ? selected : ''; $('#modelPicker').hidden = false; return models; };
  return { ask, setOpen, isOpen, configureModels, destroy: () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()) };
}
