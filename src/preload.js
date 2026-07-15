const { contextBridge, ipcRenderer } = require('electron');
const { CHANNELS } = require('./application/ipc-contracts');

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
