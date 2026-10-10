/** @module remote/public-conversation-preferences Minimal client-owned profile, shared by text and voice. */
// Present at response generation so the gateway adds its style-src nonce.
// Dynamically appended inline styles are rejected by the public CSP.
const PUBLIC_PROFILE_STYLE = `<style>
#profileSheet{width:min(440px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow-y:auto;color-scheme:dark}
.identity .profile-trigger{width:44px;height:44px;padding:0;display:grid;place-items:center;flex:0 0 44px}
.identity .profile-trigger svg{display:block;width:20px;height:20px}
#profileTitle{font-size:1.05rem;font-weight:650}
.profile-fields{display:grid;gap:20px;margin-block:24px}
.profile-fields label{display:grid;gap:8px;font-size:.85rem;font-weight:600;color:#c4d9d9}
.profile-fields select{box-sizing:border-box;width:100%;min-width:0;min-height:48px;padding:10px 14px;border:1px solid #345457;border-radius:14px;background:#102124;color:#e5f3f3;font:inherit;color-scheme:dark}
.profile-fields select:focus-visible{outline:2px solid #78deda;outline-offset:3px}
.profile-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:16px}
.profile-note{font-size:.8rem!important;color:#a6bbbb!important;line-height:1.6;overflow-wrap:anywhere}
</style>`;
// #region Browser profile editor
function createPublicConversationPreferences(normalize) {
  const namespace = 'nexusnxs.conversation.preferences.v1';
  const copy = (it, en) => /^it\b/i.test(document.documentElement.lang || navigator.language) ? it : en;
  let profile;
  try { profile = normalize(JSON.parse(localStorage.getItem(namespace) || '{}')); }
  catch { profile = normalize({}); }
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = 'profileSettings'; trigger.className = 'download-trigger profile-trigger';
  trigger.setAttribute('aria-label', copy('Personalizza NexusNXS', 'Personalize NexusNXS'));
  trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m10 3-.6 2.4-2 .9L5 5.7 3 9.2l1.8 1.7v2.2L3 14.8 5 18.3l2.4-.6 2 .9L10 21h4l.6-2.4 2-.9 2.4.6 2-3.5-1.8-1.7v-2.2L21 9.2 19 5.7l-2.4.6-2-.9L14 3Z"/><circle cx="12" cy="12" r="3"/></svg>';
  document.querySelector('.identity-actions')?.prepend(trigger);
  const dialog = document.createElement('dialog');
  dialog.id = 'profileSheet'; dialog.className = 'download-sheet';
  dialog.setAttribute('aria-labelledby', 'profileTitle');
  const body = document.createElement('div'); body.className = 'sheet-body';
  const top = document.createElement('div'); top.className = 'sheet-top';
  const title = document.createElement('strong'); title.id = 'profileTitle'; title.textContent = copy('Personalizzazione', 'Personalization');
  const close = document.createElement('button'); close.type = 'button'; close.className = 'sheet-close';
  close.setAttribute('aria-label', copy('Chiudi', 'Close'));
  close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';
  close.onclick = () => dialog.close(); top.append(title, close);
  const fields = document.createElement('div'); fields.className = 'profile-fields';
  const selects = new Map();
  const definitions = [
    ['responseStyle', copy('Dettaglio', 'Detail'), [['concise', copy('Conciso', 'Concise')], ['natural', copy('Naturale', 'Natural')], ['detailed', copy('Approfondito', 'Detailed')]]],
    ['tone', copy('Tono', 'Tone'), [['neutral', copy('Equilibrato', 'Balanced')], ['warm', copy('Caloroso', 'Warm')], ['direct', copy('Diretto', 'Direct')]]],
    ['responseLanguage', copy('Lingua delle risposte', 'Response language'), [['auto', copy('Automatico', 'Automatic')], ['it', 'Italiano'], ['en', 'English'], ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch']]]
  ];
  const save = () => { try { localStorage.setItem(namespace, JSON.stringify(profile)); } catch { /* Still usable without persistent storage. */ } };
  const refresh = () => { for (const [key, select] of selects) select.value = profile[key]; };
  for (const [key, labelText, options] of definitions) {
    const label = document.createElement('label'); label.textContent = labelText;
    const select = document.createElement('select'); select.id = `profile-${key}`;
    for (const [value, text] of options) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
    select.onchange = () => { profile = normalize({ ...profile, [key]: select.value }); save(); };
    selects.set(key, select); label.append(select); fields.append(label);
  }
  const note = document.createElement('p'); note.className = 'profile-note';
  note.textContent = copy('Salvate su questo dispositivo. Solo queste scelte accompagnano le richieste al servizio NexusNXS.', 'Saved on this device. Only these choices accompany requests to the NexusNXS service.');
  const actions = document.createElement('div'); actions.className = 'profile-actions';
  const reset = document.createElement('button'); reset.type = 'button'; reset.id = 'profileReset'; reset.className = 'sheet-close';
  reset.setAttribute('aria-label', copy('Ripristina preferenze', 'Reset preferences'));
  reset.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></svg>';
  reset.onclick = () => { profile = normalize({}); save(); refresh(); };
  actions.append(reset); body.append(top, fields, note, actions); dialog.append(body); document.body.append(dialog);
  trigger.onclick = () => { refresh(); dialog.showModal(); };
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => trigger.focus({ preventScroll: true }));
  return { value: () => normalize(profile), clear: () => { profile = normalize({}); refresh(); } };
}
// #endregion
module.exports = { createPublicConversationPreferences, PUBLIC_PROFILE_STYLE };
