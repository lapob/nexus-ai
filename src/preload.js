const { contextBridge, ipcRenderer } = require('electron');

// Un preload sandboxed dispone del require limitato di Electron e non può
// caricare moduli locali. Questi nomi rispecchiano il contratto autoritativo
// validato nel main process da application/ipc-contracts.js.
const CHANNELS = Object.freeze({
  bootstrap: 'nexus:bootstrap',
  settings: 'nexus:settings',
  reindex: 'nexus:reindex',
  listModels: 'nexus:list-models',
  cancel: 'nexus:cancel',
  copy: 'nexus:copy',
  openNote: 'nexus:open-note',
  chat: 'nexus:chat'
});

// API minima e intenzionale: il renderer non vede filesystem, shell o ipcRenderer.
// Ogni argomento sarà nuovamente validato nel processo principale.
contextBridge.exposeInMainWorld('nexus', {
  bootstrap: () => ipcRenderer.invoke(CHANNELS.bootstrap),
  chat: (payload) => ipcRenderer.invoke(CHANNELS.chat, payload),
  reindex: () => ipcRenderer.invoke(CHANNELS.reindex),
  listModels: () => ipcRenderer.invoke(CHANNELS.listModels),
  cancel: () => ipcRenderer.invoke(CHANNELS.cancel),
  copyText: (text) => ipcRenderer.invoke(CHANNELS.copy, text),
  saveSettings: (settings) => ipcRenderer.invoke(CHANNELS.settings, settings),
  openNote: (relativePath) => ipcRenderer.invoke(CHANNELS.openNote, relativePath)
});
