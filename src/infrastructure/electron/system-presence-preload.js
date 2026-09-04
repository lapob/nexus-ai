/**
 * @module infrastructure/electron/system-presence-preload
 * @description Ponte minimale per il nucleo CSS-only: nessun accesso a file, rete o API applicative.
 */
const { contextBridge, ipcRenderer } = require('electron');

const POINTER_CHANNEL = 'nexus:system-presence-pointer';
const OPEN_CHANNEL = 'nexus:system-presence-open';
const VOICE_CHANNEL = 'nexus:system-presence-voice';
const STATE_CHANNEL = 'nexus:system-presence-state';
const CONFIG_CHANNEL = 'nexus:system-presence-config';
const MENU_CHANNEL = 'nexus:system-presence-menu';

contextBridge.exposeInMainWorld('nexusPresence', Object.freeze({
  setInteractive: (enabled) => ipcRenderer.send(POINTER_CHANNEL, enabled === true),
  openMain: () => ipcRenderer.send(OPEN_CHANNEL),
  startVoice: () => ipcRenderer.send(VOICE_CHANNEL),
  menu: (action) => ipcRenderer.send(MENU_CHANNEL, String(action || '')),
  onState: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, value) => listener(String(value || 'idle'));
    ipcRenderer.on(STATE_CHANNEL, handler);
    return () => ipcRenderer.removeListener(STATE_CHANNEL, handler);
  },
  onConfiguration: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = (_event, value) => listener(value && typeof value === 'object' ? { ...value } : {});
    ipcRenderer.on(CONFIG_CHANNEL, handler);
    return () => ipcRenderer.removeListener(CONFIG_CHANNEL, handler);
  }
}));
