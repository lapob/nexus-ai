/**
 * @module remote/desktop-presence-contract
 * @description Contratto minimo e privo di dettagli hardware per la presenza desktop remota.
 *
 * Il Core non deve importare Electron, controllare BrowserWindow o avviare il
 * processo Presence. Un adapter iniettato puo tradurre questi messaggi verso
 * un bridge locale autenticato. Gli identificatori dei display sono logici e
 * opachi: handle, nomi, geometrie e risoluzioni non attraversano il gateway.
 */

const PRESENCE_PROTOCOL_VERSION = 1;
const PRESENCE_ACTIONS = Object.freeze([
  'show-nucleus',
  'hide-nucleus',
  'open-full-app',
  'close-full-app',
  'open-chatgpt',
  'close-chatgpt',
  'open-application',
  'close-application',
  'select-display'
]);
const PRESENCE_ACTION_SET = new Set(PRESENCE_ACTIONS);
const LOGICAL_DISPLAY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const APPLICATION_ID = /^(?:brave|terminal|supremo|notepad)$/;

// #region 01 — Normalizzazione metadata-only

function presenceFailure(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function logicalDisplayId(value) {
  const id = String(value || '').trim();
  return LOGICAL_DISPLAY_ID.test(id) ? id : '';
}

function normalizeAllowedActions(value) {
  const actions = Array.isArray(value) ? value : [];
  return PRESENCE_ACTIONS.filter((action) => actions.includes(action));
}

function normalizeLogicalDisplays(value, selectedDisplayId = '') {
  const displays = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value.slice(0, 16) : []) {
    const id = logicalDisplayId(typeof entry === 'string' ? entry : entry?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    displays.push(Object.freeze({ id, selected: id === selectedDisplayId }));
  }
  return Object.freeze(displays);
}

function normalizeApplications(value) {
  const applications = [];
  const seen = new Set();
  for (const entry of Array.isArray(value) ? value.slice(0, 12) : []) {
    const id = String(entry?.id || '').trim();
    if (!APPLICATION_ID.test(id) || seen.has(id)) continue;
    seen.add(id);
    applications.push(Object.freeze({
      id,
      label: String(entry?.label || id).trim().slice(0, 32),
      icon: String(entry?.icon || 'application').trim().slice(0, 24),
      available: entry?.available === true,
      state: entry?.open === true ? 'open' : 'closed',
      canClose: entry?.canClose === true,
      ...(id === 'supremo' ? { adminReady: entry?.adminReady === true } : {})
    }));
  }
  return Object.freeze(applications);
}

function normalizeDesktopPresenceStatus(value, { mutationsAvailable = true, now = Date.now() } = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const selectedCandidate = logicalDisplayId(source.selectedDisplayId);
  const logicalDisplays = normalizeLogicalDisplays(source.logicalDisplays, selectedCandidate);
  const selectedDisplayId = logicalDisplays.some((entry) => entry.id === selectedCandidate)
    ? selectedCandidate
    : '';
  const allowedActions = mutationsAvailable ? normalizeAllowedActions(source.allowedActions) : [];
  const available = source.available === true;
  const applications = normalizeApplications(source.applications);
  const foregroundCandidate = String(source.foregroundApplicationId || '').trim();
  const foregroundApplicationId = applications.some((entry) => entry.id === foregroundCandidate && entry.available && entry.canClose && entry.state === 'open')
    ? foregroundCandidate
    : '';
  return Object.freeze({
    version: PRESENCE_PROTOCOL_VERSION,
    available,
    nucleus: source.nucleusVisible === true ? 'visible' : source.nucleusVisible === false ? 'hidden' : 'unknown',
    fullApp: source.fullAppOpen === true ? 'open' : source.fullAppOpen === false ? 'closed' : 'unknown',
    chatGpt: source.chatGptOpen === true ? 'open' : source.chatGptOpen === false ? 'closed' : 'unknown',
    applications,
    foregroundApplicationId,
    selectedDisplayId,
    logicalDisplays,
    allowedActions: Object.freeze(available ? allowedActions : []),
    updatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now()
  });
}

function normalizePresenceAction(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const action = String(source.action || '').trim();
  if (!PRESENCE_ACTION_SET.has(action)) {
    throw presenceFailure('Azione di presenza non consentita.', 'PRESENCE_ACTION_NOT_ALLOWED');
  }
  const displayId = logicalDisplayId(source.displayId);
  const applicationId = String(source.applicationId || '').trim();
  if (action === 'select-display' && !displayId) {
    throw presenceFailure('Seleziona un display logico valido.', 'PRESENCE_DISPLAY_INVALID');
  }
  if (action !== 'select-display' && source.displayId != null) {
    throw presenceFailure('Questa azione non accetta un display.', 'PRESENCE_DISPLAY_UNEXPECTED');
  }
  if ((action === 'open-application' || action === 'close-application') && !APPLICATION_ID.test(applicationId)) {
    throw presenceFailure('Applicazione non consentita.', 'PRESENCE_APPLICATION_INVALID');
  }
  if (!['open-application', 'close-application'].includes(action) && source.applicationId != null) {
    throw presenceFailure('Questa azione non accetta una applicazione.', 'PRESENCE_APPLICATION_UNEXPECTED');
  }
  return Object.freeze({
    version: PRESENCE_PROTOCOL_VERSION,
    action,
    ...(displayId ? { displayId } : {}),
    ...(applicationId ? { applicationId } : {})
  });
}

// #endregion
// #region 02 — Autorizzazione e postcondizioni

function assertPresenceActionAuthorized(status, request) {
  if (!status?.available) {
    throw presenceFailure('La presenza desktop non e raggiungibile.', 'PRESENCE_UNAVAILABLE', 503);
  }
  if (!status.allowedActions.includes(request.action)) {
    throw presenceFailure('Azione non autorizzata dalla presenza desktop.', 'PRESENCE_ACTION_UNAUTHORIZED', 403);
  }
  if (request.action === 'select-display'
    && !status.logicalDisplays.some((entry) => entry.id === request.displayId)) {
    throw presenceFailure('Il display logico non e disponibile.', 'PRESENCE_DISPLAY_UNAVAILABLE', 409);
  }
  if (['open-application', 'close-application'].includes(request.action)
    && !status.applications.some((entry) => entry.id === request.applicationId && entry.available)) {
    throw presenceFailure('Applicazione non disponibile.', 'PRESENCE_APPLICATION_UNAVAILABLE', 409);
  }
  if (request.action === 'close-application'
    && !status.applications.some((entry) => entry.id === request.applicationId && entry.canClose)) {
    throw presenceFailure('Questa applicazione non può essere chiusa da remoto.', 'PRESENCE_APPLICATION_CLOSE_UNAVAILABLE', 409);
  }
}

function presenceActionChangesState(status, request) {
  assertPresenceActionAuthorized(status, request);
  if (request.action === 'show-nucleus') return status.nucleus !== 'visible';
  if (request.action === 'hide-nucleus') return status.nucleus !== 'hidden';
  if (request.action === 'open-full-app') return status.fullApp !== 'open';
  if (request.action === 'close-full-app') return status.fullApp !== 'closed';
  if (request.action === 'open-chatgpt') return status.chatGpt !== 'open';
  if (request.action === 'close-chatgpt') return status.chatGpt !== 'closed';
  if (request.action === 'open-application') {
    return status.applications.find((entry) => entry.id === request.applicationId)?.state !== 'open';
  }
  if (request.action === 'close-application') {
    return status.applications.find((entry) => entry.id === request.applicationId)?.state !== 'closed';
  }
  return status.selectedDisplayId !== request.displayId;
}

function presencePostconditionSatisfied(status, request) {
  if (!status?.available) return false;
  if (request.action === 'show-nucleus') return status.nucleus === 'visible';
  if (request.action === 'hide-nucleus') return status.nucleus === 'hidden';
  if (request.action === 'open-full-app') return status.fullApp === 'open';
  if (request.action === 'close-full-app') return status.fullApp === 'closed';
  if (request.action === 'open-chatgpt') return status.chatGpt === 'open';
  if (request.action === 'close-chatgpt') return status.chatGpt === 'closed';
  if (request.action === 'open-application') {
    return status.applications.some((entry) => entry.id === request.applicationId && entry.state === 'open');
  }
  if (request.action === 'close-application') {
    return status.applications.some((entry) => entry.id === request.applicationId && entry.state === 'closed');
  }
  return status.selectedDisplayId === request.displayId;
}

function presenceActionPreview(request) {
  if (request.action === 'show-nucleus') return 'Mostra il nucleo sul desktop.';
  if (request.action === 'hide-nucleus') return 'Nascondi il nucleo dal desktop.';
  if (request.action === 'open-full-app') return 'Apri l applicazione completa.';
  if (request.action === 'close-full-app') return 'Chiudi in modo ordinato l applicazione completa.';
  if (request.action === 'open-chatgpt') return 'Apri ChatGPT sul computer.';
  if (request.action === 'close-chatgpt') return 'Chiudi ChatGPT sul computer.';
  if (request.action === 'open-application') return 'Apri una applicazione autorizzata sul computer.';
  if (request.action === 'close-application') return 'Chiudi una applicazione autorizzata sul computer.';
  return 'Sposta il nucleo su un display autorizzato.';
}

// #endregion

module.exports = {
  PRESENCE_PROTOCOL_VERSION,
  PRESENCE_ACTIONS,
  logicalDisplayId,
  normalizeDesktopPresenceStatus,
  normalizePresenceAction,
  assertPresenceActionAuthorized,
  presenceActionChangesState,
  presencePostconditionSatisfied,
  presenceActionPreview
};
