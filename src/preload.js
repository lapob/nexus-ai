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
  chat: 'nexus:chat',
  health: 'nexus:ai-health',
  setModel: 'nexus:set-model',
  streamChat: 'nexus:stream-chat',
  streamEvent: 'nexus:stream-event',
  embed: 'nexus:embed'
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
  openNote: (relativePath) => ipcRenderer.invoke(CHANNELS.openNote, relativePath),
  health: () => ipcRenderer.invoke(CHANNELS.health),
  setModel: (model) => ipcRenderer.invoke(CHANNELS.setModel, model),
  streamChat: (payload) => ipcRenderer.invoke(CHANNELS.streamChat, payload),
  onStreamEvent: (listener) => { const handler = (_event, payload) => listener(payload); ipcRenderer.on(CHANNELS.streamEvent, handler); return () => ipcRenderer.removeListener(CHANNELS.streamEvent, handler); },
  embed: (input, options) => ipcRenderer.invoke(CHANNELS.embed, { input, ...options })
});
