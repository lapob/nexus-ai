/**
 * @module application/proactive-sensor-hub
 * @description Campiona segnali reali e pubblica soltanto variazioni metadata-only.
 */

// #region 01 — Normalizzazione dei segnali

function normalizedState(value, fallback = 'unknown') {
  return String(value || fallback).trim().toLowerCase().slice(0, 80) || fallback;
}

function eventsFromSecuritySnapshot(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  return Array.isArray(snapshot?.events) ? snapshot.events : [];
}

// #endregion

// #region 02 — Lifecycle dei sensori

class ProactiveSensorHub {
  constructor({
    eventBus,
    networkProvider,
    securityProvider,
    updateProvider,
    healthProvider,
    logger = console,
    now = Date.now,
    intervalMs = 15_000,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
  } = {}) {
    if (!eventBus || typeof eventBus.publish !== 'function') throw new TypeError('Il bus proattivo è obbligatorio.');
    this.eventBus = eventBus;
    this.networkProvider = typeof networkProvider === 'function' ? networkProvider : null;
    this.securityProvider = typeof securityProvider === 'function' ? securityProvider : null;
    this.updateProvider = typeof updateProvider === 'function' ? updateProvider : null;
    this.healthProvider = typeof healthProvider === 'function' ? healthProvider : null;
    this.logger = logger;
    this.now = now;
    this.intervalMs = Math.max(5_000, Number(intervalMs) || 15_000);
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.startedAt = this.now();
    this.lastNetwork = '';
    this.lastUpdate = '';
    this.lastHealth = 'healthy';
    this.seenSecurityEvents = new Set();
    this.timer = null;
    this.polling = false;
    this.closed = false;
  }

  async sampleNetwork() {
    if (!this.networkProvider) return;
    const value = await this.networkProvider();
    const state = typeof value === 'boolean' ? (value ? 'online' : 'offline') : normalizedState(value?.state);
    if (state === this.lastNetwork) return;
    this.lastNetwork = state;
    this.eventBus.publish('network.status', {
      state,
      source: 'system-network',
      summary: state === 'online' ? 'Connessione di rete disponibile' : 'Connessione di rete non disponibile'
    });
  }

  async sampleSecurity() {
    if (!this.securityProvider) return;
    const events = eventsFromSecuritySnapshot(await this.securityProvider())
      .filter((event) => event && ['warning', 'critical'].includes(event.severity))
      .sort((left, right) => Number(left.at || 0) - Number(right.at || 0));
    for (const event of events) {
      const id = String(event.id || `${event.at}:${event.type}:${event.detail}`).slice(0, 160);
      if (!id || this.seenSecurityEvents.has(id) || Number(event.at || 0) < this.startedAt) continue;
      this.seenSecurityEvents.add(id);
      this.eventBus.publish('security.alert', {
        state: event.severity,
        source: 'security-journal',
        category: event.type,
        code: event.severity,
        summary: event.detail || 'Evento di sicurezza rilevato'
      });
    }
    if (this.seenSecurityEvents.size > 512) {
      this.seenSecurityEvents = new Set([...this.seenSecurityEvents].slice(-256));
    }
  }

  async sampleUpdate() {
    if (!this.updateProvider) return;
    const update = await this.updateProvider();
    const status = normalizedState(update?.status);
    if (!['downloading', 'ready'].includes(status)) {
      this.lastUpdate = '';
      return;
    }
    const version = String(update?.version || '').trim().slice(0, 80);
    const key = `${status}:${version}`;
    if (key === this.lastUpdate) return;
    this.lastUpdate = key;
    this.eventBus.publish('update.available', {
      state: status,
      source: 'signed-update-manager',
      version,
      summary: status === 'ready' ? 'Aggiornamento pronto per l’installazione' : 'Aggiornamento disponibile'
    });
  }

  async sampleHealth() {
    if (!this.healthProvider) return;
    const health = await this.healthProvider();
    const state = normalizedState(health?.state, 'healthy');
    if (['healthy', 'ready', 'ok', 'warming'].includes(state)) {
      this.lastHealth = 'healthy';
      return;
    }
    const key = `${state}:${String(health?.code || '')}:${String(health?.category || '')}`;
    if (key === this.lastHealth) return;
    this.lastHealth = key;
    this.eventBus.publish('device.health', {
      state,
      source: health?.source || 'local-health',
      category: health?.category || 'runtime',
      code: health?.code || state,
      summary: health?.summary || 'Un componente locale richiede attenzione'
    });
  }

  async poll() {
    if (this.closed || this.polling) return false;
    this.polling = true;
    try {
      const samples = [
        ['rete', () => this.sampleNetwork()],
        ['sicurezza', () => this.sampleSecurity()],
        ['aggiornamenti', () => this.sampleUpdate()],
        ['salute', () => this.sampleHealth()]
      ];
      const results = await Promise.allSettled(samples.map(([, sample]) => sample()));
      results.forEach((result, index) => {
        if (result.status === 'rejected') this.logger.warn?.(`Sensore proattivo ${samples[index][0]} non disponibile.`, { error: result.reason });
      });
      return true;
    } finally {
      this.polling = false;
    }
  }

  start() {
    if (this.closed || this.timer) return false;
    void this.poll();
    this.timer = this.setIntervalFn(() => { void this.poll(); }, this.intervalMs);
    this.timer?.unref?.();
    return true;
  }

  stop() {
    this.closed = true;
    if (this.timer) this.clearIntervalFn(this.timer);
    this.timer = null;
    return true;
  }
}

module.exports = { ProactiveSensorHub, eventsFromSecuritySnapshot, normalizedState };

// #endregion
