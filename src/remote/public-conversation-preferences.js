/** @module remote/public-conversation-preferences Minimal client-owned profile, shared by text and voice. */
const { colors, cosmicGlass, layout } = require('../../config/nexus-design-tokens.json');
// #region 01 — Shared settings surfaces
// Present at response generation so the gateway adds its style-src nonce.
// Dynamically appended inline styles are rejected by the public CSP.
const PUBLIC_PROFILE_STYLE = `<style>
#profileSheet{width:min(440px,calc(100% - 32px));max-height:calc(100dvh - 32px);overflow-y:auto;color-scheme:dark}
#profileSheet .sheet-body{padding:clamp(20px,4vw,28px)}
#profileSheet .sheet-top{position:sticky;top:0;z-index:2;isolation:isolate;padding-top:clamp(20px,4vw,28px);padding-bottom:12px;margin-top:calc(-1 * clamp(20px,4vw,28px))}
#profileSheet .sheet-top::before{content:'';position:absolute;z-index:-1;inset:0 calc(-1 * clamp(20px,4vw,28px)) -16px;background:${colors.surface};backdrop-filter:blur(${cosmicGlass.blurPx.preferred}px);-webkit-backdrop-filter:blur(${cosmicGlass.blurPx.preferred}px);mask-image:linear-gradient(#000 calc(100% - 16px),transparent);-webkit-mask-image:linear-gradient(#000 calc(100% - 16px),transparent);pointer-events:none}
#profileSheet .sheet-close:focus-visible{outline:2px solid ${colors.cyan};outline-offset:2px}
@media(hover:hover){#profileSheet .sheet-close:hover{background:${colors.surfaceRaised};color:${colors.ice}}}
.identity .profile-trigger{width:44px;height:44px;padding:0;display:grid;place-items:center;flex:0 0 44px}
.identity .profile-trigger svg{display:block;width:20px;height:20px}
#profileTitle{min-width:0;font-size:1.05rem;font-weight:650;line-height:1.3;overflow-wrap:anywhere}
.profile-fields{display:grid;gap:20px;margin-block:24px}
.profile-fields label{display:grid;gap:8px;font-size:.85rem;font-weight:600;color:${colors.ice}}
.profile-fields select{box-sizing:border-box;width:100%;min-width:0;min-height:${layout.touchTargetDp}px;padding:10px 14px;border:1px solid ${colors.hairline};border-radius:14px;background:${colors.surfaceRaised};color:${colors.ice};font:inherit;font-weight:450;color-scheme:dark}
.profile-fields select:focus-visible{outline:2px solid ${colors.cyan};outline-offset:3px}
.profile-fields option{background:${colors.surfaceRaised};color:${colors.ice}}
@supports(appearance:base-select){.profile-fields select,.profile-fields select::picker(select){appearance:base-select}.profile-fields select::picker(select){max-width:calc(100vw - 32px);max-height:min(320px,50dvh);padding:6px;border:1px solid ${colors.hairline};border-radius:14px;background:${colors.surfaceRaised};color:${colors.ice};font:inherit;box-shadow:0 18px 48px #0008}.profile-fields option{min-height:48px;padding:10px 12px;border-radius:9px;white-space:normal;overflow-wrap:anywhere}.profile-fields option:hover,.profile-fields option:focus{background:${colors.surface};color:${colors.ice}}.profile-fields option:focus{outline:none}.profile-fields option:focus-visible{outline:1px solid ${colors.cyan};outline-offset:-2px}.profile-fields option:checked{font-weight:650}.profile-fields option::checkmark{color:${colors.cyan}}.profile-fields select::picker-icon{content:"";width:7px;height:7px;flex:0 0 7px;margin-inline:auto 2px;border-right:1.5px solid ${colors.mist};border-bottom:1.5px solid ${colors.mist};transform:rotate(45deg)}.profile-fields select:open::picker-icon{transform:rotate(225deg)}}
.profile-section{border:1px solid ${colors.hairline}70;border-radius:18px;margin-top:14px;padding:0 16px;background:${colors.surfaceRaised}66}
.profile-section summary{display:grid;grid-template-columns:24px minmax(0,1fr) 12px;align-items:center;gap:12px;min-height:60px;padding:12px 0;cursor:pointer;font-weight:600;list-style:none;overflow-wrap:anywhere}
.profile-section summary>.nxs-symbol{width:22px;height:22px;color:${colors.mist}}
.profile-section summary::-webkit-details-marker{display:none}.profile-section summary::after{content:'';width:7px;height:7px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .17s ease}.profile-section[open] summary::after{transform:rotate(225deg)}
.profile-section summary:focus-visible{outline:2px solid ${colors.cyan};outline-offset:3px;border-radius:8px}
.profile-section .profile-fields{margin-block:12px 20px}
.profile-service-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;padding:10px 0;font-size:.85rem;line-height:1.5;overflow-wrap:anywhere}.profile-service-row output{text-align:right;color:${colors.mist}}
#profileSheet .profile-section p{font-size:.8rem;color:${colors.mist};line-height:1.6;overflow-wrap:anywhere}
.profile-confirm[hidden]{display:none}.profile-confirm{margin-top:12px;padding:12px;border:1px solid ${colors.hairline};border-radius:14px}
.profile-section[open]{padding-bottom:16px}.profile-section[open] summary{margin-bottom:4px}
#profileSheet[open]{animation:profile-reveal .2s cubic-bezier(.2,0,0,1)}
@keyframes profile-reveal{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media(max-width:380px){.profile-section{padding-inline:12px}.profile-section summary{gap:8px}}
@media(prefers-reduced-motion:reduce){.profile-section summary::after{transition:none}#profileSheet[open]{animation:none}}
.profile-actions{display:flex;gap:12px;justify-content:flex-end;margin-top:16px}
#profileSheet .profile-note{font-size:.8rem;color:${colors.mist};line-height:1.6;overflow-wrap:anywhere}
</style>`;
// #endregion
// #region 02 — Local preferences, service status and data actions
function createPublicConversationPreferences(normalize, { getHistory = () => [], clearHistory = () => {}, icons } = {}) {
  const namespace = 'nexusnxs.conversation.preferences.v1';
  const copy = (it, en) => /^it\b/i.test(document.documentElement.lang || navigator.language) ? it : en;
  let profile;
  try { profile = normalize(JSON.parse(localStorage.getItem(namespace) || '{}')); }
  catch { profile = normalize({}); }
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.id = 'profileSettings'; trigger.className = 'download-trigger profile-trigger';
  trigger.setAttribute('aria-label', copy('Impostazioni NexusNXS', 'NexusNXS settings'));
  trigger.innerHTML = icons.Settings;
  document.querySelector('#download')?.before(trigger);
  const dialog = document.createElement('dialog');
  dialog.id = 'profileSheet'; dialog.className = 'download-sheet';
  dialog.setAttribute('aria-labelledby', 'profileTitle');
  const body = document.createElement('div'); body.className = 'sheet-body';
  const top = document.createElement('div'); top.className = 'sheet-top';
  const title = document.createElement('strong'); title.id = 'profileTitle'; title.textContent = copy('Impostazioni', 'Settings');
  const close = document.createElement('button'); close.type = 'button'; close.className = 'sheet-close';
  close.setAttribute('aria-label', copy('Chiudi', 'Close'));
  close.innerHTML = icons.Close;
  close.onclick = () => dialog.close(); top.append(title, close);
  const section = (id, heading, icon, open = false) => {
    const element = document.createElement('details'); element.id = id; element.className = 'profile-section'; element.open = open;
    const summary = document.createElement('summary'), label = document.createElement('span');
    summary.innerHTML = icons[icon]; label.textContent = heading; summary.append(label); element.append(summary); return element;
  };
  const conversation = section('profileConversation', copy('Conversazione', 'Conversation'), 'Chat', true);
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
  reset.innerHTML = icons.Restore;
  reset.onclick = () => { profile = normalize({}); save(); refresh(); };
  actions.append(reset); conversation.append(fields, note, actions);
  const services = section('profileServices', copy('Voce e connessione', 'Voice and connection'), 'Mic');
  const serviceStates = new Map();
  for (const [id, label] of [['engine', copy('Motore AI', 'AI engine')], ['voice-input', copy('Riconoscimento vocale', 'Speech recognition')], ['voice-output', copy('Voce', 'Voice')]]) {
    const row = document.createElement('div'); row.className = 'profile-service-row';
    const name = document.createElement('span'); name.textContent = label;
    const value = document.createElement('output'); value.id = `profile-service-${id}`; value.textContent = copy('Da verificare', 'Unverified');
    row.append(name, value); services.append(row); serviceStates.set(id, value);
  }
  const voiceNote = document.createElement('p'); voiceNote.textContent = copy('Le risposte vocali richiedono anche il motore AI operativo.', 'Voice replies also require an available AI engine.'); services.append(voiceNote);
  const iconAction = (id, label, icon) => {
    const button = document.createElement('button'); button.id = id; button.type = 'button'; button.className = 'sheet-close'; button.setAttribute('aria-label', label);
    button.innerHTML = icons[icon]; return button;
  };
  const retry = iconAction('profileServiceRetry', copy('Ricontrolla servizi', 'Recheck services'), 'Restore');
  const serviceActions = document.createElement('div'); serviceActions.className = 'profile-actions'; serviceActions.append(retry); services.append(serviceActions);
  let statusController = null, statusEpoch = 0;
  const checkServices = async () => {
    statusController?.abort(); const controller = new AbortController(), epoch = ++statusEpoch; statusController = controller;
    const timer = setTimeout(() => controller.abort(), 6000); retry.disabled = true; services.setAttribute('aria-busy', 'true');
    try {
      const [ready, capabilities] = await Promise.allSettled([
        fetch('/readyz', { cache: 'no-store', signal: controller.signal }).then(async response => {
          let ready = false; if (response.status === 200) { try { ready = (await response.json())?.status === 'ready'; } catch { /* An HTML maintenance page is not AI readiness. */ } }
          return { status: response.status, ready };
        }),
        fetch('/api/capabilities', { cache: 'no-store', signal: controller.signal }).then(async response => { if (!response.ok) throw new Error('Unavailable'); return response.json(); })
      ]);
      if (epoch !== statusEpoch || !dialog.open || !services.open) return;
      serviceStates.get('engine').textContent = ready.status === 'fulfilled'
        ? ready.value.ready ? copy('Operativo', 'Ready') : [200, 404].includes(ready.value.status) ? copy('Da verificare', 'Unverified') : copy('Non disponibile', 'Unavailable')
        : copy('Non raggiungibile', 'Unreachable');
      const entries = capabilities.status === 'fulfilled' && Array.isArray(capabilities.value?.capabilities) ? capabilities.value.capabilities : [];
      for (const id of ['voice-input', 'voice-output']) serviceStates.get(id).textContent = entries.find(entry => entry.id === id)?.state === 'available'
        ? copy('Disponibile', 'Available') : copy('Non disponibile', 'Unavailable');
    } finally {
      clearTimeout(timer); if (epoch === statusEpoch) { retry.disabled = false; services.removeAttribute('aria-busy'); statusController = null; }
    }
  };
  retry.onclick = () => void checkServices(); services.addEventListener('toggle', () => { if (services.open && dialog.open) void checkServices(); else { ++statusEpoch; statusController?.abort(); retry.disabled = false; services.removeAttribute('aria-busy'); } });
  const data = section('profileData', copy('Dati sul dispositivo', 'Data on this device'), 'Lock');
  const dataNote = document.createElement('p'); dataNote.textContent = copy('La cronologia è salvata in questo browser. Il file esportato non è cifrato e resta separato dalla cancellazione.', 'History is saved in this browser. Exported files are not encrypted and remain separate from deletion.'); data.append(dataNote);
  dataNote.id = 'profileDataDisclosure';
  const dataActions = document.createElement('div'); dataActions.className = 'profile-actions';
  const exportData = iconAction('profileExport', copy('Esporta conversazione', 'Export conversation'), 'Download');
  exportData.setAttribute('aria-describedby', dataNote.id);
  const deleteData = iconAction('profileDelete', copy('Elimina cronologia e preferenze', 'Delete history and preferences'), 'DeleteOutline');
  const confirmation = document.createElement('div'); confirmation.className = 'profile-confirm'; confirmation.hidden = true;
  const warning = document.createElement('p'); warning.textContent = copy('Eliminare cronologia e preferenze da questo dispositivo? La generazione in corso verrà interrotta.', 'Delete history and preferences from this device? Any active response will be stopped.'); confirmation.append(warning);
  warning.id = 'profileDeleteWarning'; confirmation.setAttribute('role', 'group'); confirmation.setAttribute('aria-labelledby', warning.id);
  const confirmActions = document.createElement('div'); confirmActions.className = 'profile-actions';
  const confirmDelete = iconAction('profileDeleteConfirm', copy('Conferma eliminazione', 'Confirm deletion'), 'Check');
  const cancelDelete = iconAction('profileDeleteCancel', copy('Annulla eliminazione', 'Cancel deletion'), 'Close');
  confirmDelete.setAttribute('aria-describedby', warning.id); cancelDelete.setAttribute('aria-describedby', warning.id);
  confirmActions.append(cancelDelete, confirmDelete); confirmation.append(confirmActions); dataActions.append(exportData, deleteData); data.append(dataActions, confirmation);
  const history = () => {
    try { return (getHistory() || []).filter(turn => ['user', 'assistant'].includes(turn?.role) && typeof turn.content === 'string').map(({ role, content }) => ({ role, content })); } catch { return []; }
  };
  exportData.onclick = () => {
    const turns = history(); if (!turns.length) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: 'nexusnxs.conversation.export.v1', turns }, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'nexusnxs-conversazione.json'; document.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  };
  deleteData.onclick = () => { confirmation.hidden = false; cancelDelete.focus(); };
  cancelDelete.onclick = () => { confirmation.hidden = true; deleteData.focus(); };
  confirmDelete.onclick = () => { confirmation.hidden = true; dialog.close(); void clearHistory(); };
  data.addEventListener('toggle', () => { exportData.disabled = history().length === 0; });
  body.append(top, conversation, services, data); dialog.append(body); document.body.append(dialog);
  trigger.onclick = () => { refresh(); dialog.showModal(); };
  dialog.addEventListener('click', event => { if (event.target === dialog) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close(); } });
  dialog.addEventListener('close', () => { ++statusEpoch; statusController?.abort(); confirmation.hidden = true; retry.disabled = false; services.removeAttribute('aria-busy'); trigger.focus({ preventScroll: true }); });
  return { value: () => normalize(profile), clear: () => { profile = normalize({}); refresh(); } };
}
// #endregion
module.exports = { createPublicConversationPreferences, PUBLIC_PROFILE_STYLE };
