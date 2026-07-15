const fs = require('node:fs');

const DEFAULT_STATE = { width: 1280, height: 820, isMaximized: false, isFullScreen: false };

// Una configurazione corrotta o appartenente a un monitor rimosso non deve
// rendere la finestra irraggiungibile. Manteniamo almeno 120x120 px visibili.
function sanitizeWindowState(value, workAreas) {
  const state = { ...DEFAULT_STATE, ...(value || {}) };
  state.width = Number.isFinite(state.width) ? Math.max(900, Math.round(state.width)) : DEFAULT_STATE.width;
  state.height = Number.isFinite(state.height) ? Math.max(620, Math.round(state.height)) : DEFAULT_STATE.height;
  state.isMaximized = state.isMaximized === true;
  state.isFullScreen = state.isFullScreen === true;
  if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
    delete state.x; delete state.y;
    return state;
  }
  const visible = workAreas.some((area) => state.x < area.x + area.width - 120 && state.x + state.width > area.x + 120 && state.y < area.y + area.height - 120 && state.y + state.height > area.y + 120);
  if (!visible) { delete state.x; delete state.y; }
  return state;
}

function loadWindowState(filePath, workAreas) {
  try { return sanitizeWindowState(JSON.parse(fs.readFileSync(filePath, 'utf8')), workAreas); }
  catch { return sanitizeWindowState(null, workAreas); }
}

function saveWindowState(filePath, win) {
  const state = { ...win.getNormalBounds(), isMaximized: win.isMaximized(), isFullScreen: win.isFullScreen() };
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

module.exports = { DEFAULT_STATE, sanitizeWindowState, loadWindowState, saveWindowState };
