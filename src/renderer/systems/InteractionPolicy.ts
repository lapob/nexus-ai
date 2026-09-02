/**
 * @module renderer/systems/InteractionPolicy
 * @description Regole deterministiche per evitare conflitti fra voce e generazione.
 */

// #region 01 — Turni concorrenti

export function canStartVoiceTurn(_generating: boolean): boolean {
  // La cattura audio è indipendente dallo stream AI. Se il modello sta ancora
  // rispondendo, la nuova frase viene accodata e non avvia una seconda inferenza.
  return true;
}

export function shouldQueueTurn(generating: boolean): boolean {
  // Testo e voce condividono la stessa politica: una sola inferenza attiva,
  // mentre il turno successivo resta disponibile nell'interfaccia.
  return generating;
}

export function canActivateVoiceShortcut(
  typing: boolean,
  composerVisible: boolean,
  modelSwitcherOpen: boolean,
  settingsOpen: boolean,
  historyOpen: boolean,
  repeated: boolean
): boolean {
  // La voce è una scorciatoia della superficie principale, mai del composer
  // o di un overlay. La regola resta pura per coprire anche il frame in cui
  // React ha aperto la chat ma Chromium non ha ancora assegnato il focus.
  return !typing
    && !composerVisible
    && !modelSwitcherOpen
    && !settingsOpen
    && !historyOpen
    && !repeated;
}

// #endregion
