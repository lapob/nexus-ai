/**
 * @module infrastructure/electron/quick-bar-preload
 * @description Ponte minimo della barra rapida: invio del testo (con la sola scelta «allega lo schermo») e chiusura.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusQuickBar', Object.freeze({
  submit: (text, options = {}) => ipcRenderer.send('nexus:quick-bar-submit', String(text || '').slice(0, 4000), { screen: options?.screen === true }),
  close: () => ipcRenderer.send('nexus:quick-bar-close'),
  onShow: (listener) => {
    if (typeof listener !== 'function') return () => {};
    const handler = () => listener();
    ipcRenderer.on('nexus:quick-bar-show', handler);
    return () => ipcRenderer.removeListener('nexus:quick-bar-show', handler);
  }
}));
