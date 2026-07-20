import { $, isTextInput, listen } from './utils/dom.js';
import { motionQuery } from './utils/motion.js';
import { graphEdges, graphNodes, nodeById } from './graph/graph-data.js';
import { GraphEngine } from './graph/graph-engine.js';
import { bindGraphInteractions } from './graph/graph-interactions.js';
import { SystemStatus } from './ui/system-status.js';
import { createContextPanel } from './ui/context-panel.js';
import { createDock } from './ui/dock.js';
import { createHud } from './ui/hud.js';
import { createSearchPalette } from './ui/search-palette.js';
import { createChatOverlay } from './ui/chat-overlay.js';

const REQUIRED_API = ['bootstrap', 'chat', 'reindex', 'listModels', 'cancel', 'copyText', 'saveSettings', 'openNote'];
const suggestedModels = ['qwen3:8b', 'qwen2.5:7b', 'llama3.2:3b', 'llama3.1:8b', 'mistral:7b', 'deepseek-r1:7b', 'gemma3:4b', 'phi4-mini'];
const cleanups = [];
let settings = null;
let palette;
let chat;
let contextPanel;
let dock;

function validateBridge(api) {
  if (!api || typeof api !== 'object') throw new Error('Nexus bridge unavailable: preload did not expose window.nexus.');
  const missing = REQUIRED_API.filter((method) => typeof api[method] !== 'function');
  if (missing.length) throw new Error(`Nexus bridge incomplete: ${missing.join(', ')}.`);
  return api;
}

const shell = $('#nexusShell');
const status = new SystemStatus(shell, $('#systemStatus'), $('#currentMode'));
const engine = new GraphEngine($('#knowledgeCanvas'));
engine.resize(); engine.start();
cleanups.push(() => engine.destroy(), bindGraphInteractions(engine));

function populateAccessibleNodes() {
  const list = $('#graphNodeList');
  list.replaceChildren(...graphNodes.map((node) => {
    const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'listitem'); button.textContent = `${node.label}: ${node.description}`;
    button.addEventListener('click', () => engine.select(node, { chatOpen: chat?.isOpen() }));
    return button;
  }));
}
populateAccessibleNodes();

function openSettings() { $('#settingsDialog').showModal(); }

function configureSettings(api) {
  listen($('#detectModels'), 'click', async () => {
    $('#settingsError').textContent = '';
    const installed = await api.listModels();
    $('#settingsError').textContent = installed.length ? `${installed.length} modelli locali rilevati.` : 'Nessun modello locale raggiungibile.';
  }, undefined, cleanups);
  listen($('#settingsForm'), 'submit', async (event) => {
    event.preventDefault(); $('#settingsError').textContent = '';
    try {
      settings = await api.saveSettings({ baseUrl: $('#baseUrl').value, model: $('#model').value, temperature: $('#temperature').value });
      await chat.configureModels(settings); $('#settingsDialog').close(); $('#modelStatus').textContent = settings.model;
    } catch (error) { $('#settingsError').textContent = error.message; }
  }, undefined, cleanups);
  listen($('#headerModel'), 'change', async () => {
    if (!settings) return;
    try { settings = await api.saveSettings({ ...settings, model: $('#headerModel').value }); $('#model').value = settings.model; $('#modelStatus').textContent = settings.model; }
    catch (error) { $('#fatalErrorRegion').textContent = `Model switch failed: ${error.message}`; $('#fatalErrorRegion').hidden = false; }
  }, undefined, cleanups);
}

function handleEscape() {
  if ($('#settingsDialog').open) return $('#settingsDialog').close();
  if (palette.isOpen()) return palette.close();
  if (chat.isOpen()) return chat.setOpen(false);
  if (contextPanel.isOpen()) return contextPanel.close();
  engine.clearSelection(); dock.setActive('core');
}

async function initialize() {
  let api;
  try { api = validateBridge(window.nexus); }
  catch (error) {
    status.setSystem('error', error.message); $('#fatalErrorRegion').textContent = error.message; $('#fatalErrorRegion').hidden = false; return;
  }

  contextPanel = createContextPanel({ onOpenNote: (path) => api.openNote(path) });
  chat = createChatOverlay({ api, status });
  palette = createSearchPalette({
    nodes: graphNodes,
    actions: [
      { id: 'search', label: 'Search graph', category: 'Action', type: 'action', available: true },
      { id: 'settings', label: 'Open settings', category: 'Action', type: 'action', available: true },
      { id: 'memory', label: 'Open memory', category: 'Future capability', type: 'action', available: false },
      { id: 'agents', label: 'Open agents', category: 'Future capability', type: 'action', available: false }
    ],
    onSelect: (item) => {
      if (item.type === 'node') { const node = nodeById.get(item.id); engine.select(node, { chatOpen: chat.isOpen() }); dock.setActive(node.id === 'models' ? 'models' : node.id === 'projects' ? 'projects' : 'core'); }
      else if (item.id === 'settings') openSettings();
    }
  });
  dock = createDock((action) => {
    if (action === 'search') return palette.open($('#floatingDock [data-action="search"]'));
    if (action === 'settings') return openSettings();
    const node = nodeById.get(action);
    if (node) { engine.select(node, { chatOpen: chat.isOpen() }); dock.setActive(action); }
  });
  const hud = createHud({
    onSearch: () => palette.open($('#searchTrigger')),
    onSettings: openSettings,
    onReindex: async () => {
      status.setActivity('indexing'); $('#reindex').disabled = true;
      try { hud.updateStats(await api.reindex()); }
      catch (error) { status.setSystem('degraded', error.message); }
      finally { status.setActivity('idle'); $('#reindex').disabled = false; }
    }
  });
  cleanups.push(() => contextPanel.destroy(), () => chat.destroy(), () => palette.destroy(), () => dock.destroy(), () => hud.destroy());

  engine.addEventListener('selectionchange', (event) => {
    const node = event.detail;
    if (!node) { contextPanel.close(); dock.setActive('core'); return; }
    const connections = graphEdges.filter((edge) => edge.includes(node.id)).length;
    contextPanel.open(node, connections);
  });
  listen(document, 'keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); handleEscape(); } }, undefined, cleanups);
  listen(motionQuery, 'change', () => engine.start(), undefined, cleanups);

  try {
    const data = await api.bootstrap();
    if (!data?.settings || !data?.stats) throw new Error('Bootstrap response is incomplete.');
    settings = data.settings;
    $('#baseUrl').value = settings.baseUrl; $('#model').value = settings.model; $('#temperature').value = settings.temperature;
    $('#modelCatalog').replaceChildren(...suggestedModels.map((name) => Object.assign(document.createElement('option'), { value: name })));
    hud.applyBootstrap(data);
    const installed = await chat.configureModels(settings);
    status.setSystem(installed.length ? 'ready' : 'offline', installed.length ? 'Bootstrap complete.' : 'Local model endpoint is not reachable.');
    $('#modelPicker').hidden = false;
    configureSettings(api);
  } catch (error) {
    status.setSystem('error', error.message); $('#fatalErrorRegion').textContent = `Initialization failed: ${error.message}`; $('#fatalErrorRegion').hidden = false;
  }
}

window.addEventListener('beforeunload', () => cleanups.splice(0).reverse().forEach((cleanup) => cleanup()), { once: true });
initialize();
