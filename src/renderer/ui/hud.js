import { $, listen } from '../utils/dom.js';

export function createHud({ onSearch, onSettings, onReindex }) {
  const cleanups = [];
  listen($('#searchTrigger'), 'click', onSearch, undefined, cleanups); listen($('#settingsButton'), 'click', onSettings, undefined, cleanups); listen($('#reindex'), 'click', onReindex, undefined, cleanups);
  const updateClock = () => { $('#clock').textContent = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date()); };
  updateClock(); const clockTimer = setInterval(updateClock, 30000);
  const applyBootstrap = (data) => {
    $('#metricNotes').textContent = data.stats?.notes ?? '—'; $('#metricChunks').textContent = data.stats?.chunks ?? '—'; $('#vaultSource').textContent = data.vault?.source || 'LOCAL'; $('#systemHud').hidden = false;
    const model = data.settings?.model; if (model) { $('#modelStatus').textContent = model; $('#modelStatus').hidden = false; }
  };
  const updateStats = (stats) => { $('#metricNotes').textContent = stats.notes; $('#metricChunks').textContent = stats.chunks; };
  return { applyBootstrap, updateStats, destroy: () => { clearInterval(clockTimer); cleanups.forEach((cleanup) => cleanup()); } };
}
