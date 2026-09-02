/**
 * @module remote/wake-on-lan
 * @description Primitive Wake-on-LAN ristrette a target configurati localmente.
 */
const dgram = require('node:dgram');
const crypto = require('node:crypto');

const PLAN_TTL_MS = 60_000;
const MAX_PENDING_PLANS = 32;
const RATE_WINDOW_MS = 60_000;
const PLAN_LIMIT_PER_DEVICE = 3;
const EXECUTION_LIMIT_PER_DEVICE = 6;

// #region Validazione e pacchetto

function normalizeMac(value) {
  const compact = String(value || '').replace(/[^0-9a-f]/gi, '').toLowerCase();
  if (!/^[0-9a-f]{12}$/.test(compact)) throw new Error('Indirizzo MAC non valido.');
  if (compact === '000000000000' || compact === 'ffffffffffff') throw new Error('Indirizzo MAC non utilizzabile.');
  if ((Number.parseInt(compact.slice(0, 2), 16) & 1) !== 0) throw new Error('Wake-on-LAN richiede un indirizzo MAC unicast.');
  return compact.match(/.{2}/g).join(':');
}

function normalizeBroadcastAddress(value = '255.255.255.255') {
  const address = String(value || '').trim();
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) {
    throw new Error('Indirizzo broadcast IPv4 non valido.');
  }
  // Nessun hostname o IP pubblico: il relay può inviare pacchetti soltanto
  // nella LAN in cui è installato. La destinazione resta inoltre configurata
  // localmente e non viene mai accettata dal client remoto.
  const normalized = octets.map(Number).join('.');
  const privateAddress = normalized === '255.255.255.255'
    || normalized.startsWith('10.')
    || normalized.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
  if (!privateAddress) throw new Error('Wake-on-LAN richiede un broadcast LAN privato.');
  return normalized;
}

function normalizeWakeTarget(value) {
  const id = String(value?.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(id)) throw new Error('Identificatore Wake-on-LAN non valido.');
  const port = Number(value?.port ?? 9);
  if (![7, 9].includes(port)) throw new Error('Wake-on-LAN consente soltanto le porte UDP 7 o 9.');
  return Object.freeze({
    id,
    label: String(value?.label || id).trim().slice(0, 80) || id,
    mac: normalizeMac(value?.mac),
    address: normalizeBroadcastAddress(value?.address),
    port
  });
}

function magicPacket(mac) {
  const normalized = normalizeMac(mac).replaceAll(':', '');
  const hardwareAddress = Buffer.from(normalized, 'hex');
  return Buffer.concat([Buffer.alloc(6, 0xff), ...Array.from({ length: 16 }, () => hardwareAddress)]);
}

// #endregion
// #region Trasporto e autorizzazione

async function sendMagicPacket(target, {
  socketFactory = () => dgram.createSocket('udp4'),
  repetitions = 3,
  intervalMs = 100
} = {}) {
  const safe = normalizeWakeTarget(target);
  const packet = magicPacket(safe.mac);
  const burst = Math.max(1, Math.min(5, Number.isInteger(repetitions) ? repetitions : 3));
  const pause = Math.max(0, Math.min(500, Number.isFinite(intervalMs) ? intervalMs : 100));
  const socket = socketFactory();
  try {
    await new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        socket.off?.('error', finish);
        if (error) reject(error); else resolve();
      };
      socket.once('error', finish);
      socket.bind(0, () => {
        try { socket.setBroadcast(true); }
        catch (error) { finish(error); return; }
        const send = (index) => {
          socket.send(packet, safe.port, safe.address, (error) => {
            if (error) { finish(error); return; }
            if (index + 1 >= burst) { finish(); return; }
            const timer = setTimeout(() => send(index + 1), pause);
            timer.unref?.();
          });
        };
        send(0);
      });
    });
    return { targetId: safe.id, sentAt: Date.now(), packetsSent: burst };
  } finally {
    try { socket.close(); } catch { /* Socket già chiuso. */ }
  }
}

class WakeOnLanController {
  constructor({
    targets = [], sender = sendMagicPacket, audit = () => {}, now = () => Date.now(),
    rateWindowMs = RATE_WINDOW_MS, planLimit = PLAN_LIMIT_PER_DEVICE,
    executionLimit = EXECUTION_LIMIT_PER_DEVICE
  } = {}) {
    this.targets = new Map(targets.map((target) => {
      const normalized = normalizeWakeTarget(target);
      return [normalized.id, normalized];
    }));
    this.sender = sender;
    this.audit = audit;
    this.now = now;
    this.plans = new Map();
    this.rateWindowMs = Math.max(1_000, Number(rateWindowMs) || RATE_WINDOW_MS);
    this.planLimit = Math.max(1, Number(planLimit) || PLAN_LIMIT_PER_DEVICE);
    this.executionLimit = Math.max(1, Number(executionLimit) || EXECUTION_LIMIT_PER_DEVICE);
    this.rateBuckets = new Map();
  }

  capabilities() {
    return {
      available: this.targets.size > 0,
      targets: [...this.targets.values()].map(({ id, label }) => ({ id, label })),
      requiresConfirmation: true,
      arbitraryDestinations: false
    };
  }

  plan({ targetId, deviceId }) {
    const target = this.targets.get(String(targetId || '').toLowerCase());
    if (!target) throw new Error('Target Wake-on-LAN non autorizzato.');
    const subject = String(deviceId || '').trim();
    if (!subject) throw new Error('Dispositivo autorizzante richiesto.');
    if (!this.rateAllowed(`plan:${subject}`, this.planLimit)) {
      this.audit('wake.rate_limited', { deviceId: subject, detail: 'plan' });
      throw new Error('Troppe richieste Wake-on-LAN. Attendi prima di riprovare.');
    }
    this.prune();
    if (this.plans.size >= MAX_PENDING_PLANS) throw new Error('Troppe richieste Wake-on-LAN in attesa.');
    const ticket = {
      id: crypto.randomUUID(), targetId: target.id, deviceId: subject,
      expiresAt: this.now() + PLAN_TTL_MS
    };
    this.plans.set(ticket.id, ticket);
    this.audit('wake.planned', { deviceId: subject, targetId: target.id });
    return {
      id: ticket.id,
      targetId: target.id,
      preview: `Risveglia ${target.label}`,
      risk: 'high',
      expiresAt: ticket.expiresAt
    };
  }

  async execute({ ticketId, deviceId, approved }) {
    const id = String(ticketId || '');
    const ticket = this.plans.get(id);
    this.plans.delete(id); // Capacità monouso anche in caso di rifiuto o errore.
    if (approved !== true) throw new Error('Conferma esplicita richiesta.');
    const subject = String(deviceId || '').trim();
    if (!this.rateAllowed(`execute:${subject}`, this.executionLimit)) {
      this.audit('wake.rate_limited', { deviceId: subject, detail: 'execute' });
      throw new Error('Troppe esecuzioni Wake-on-LAN. Attendi prima di riprovare.');
    }
    if (!ticket || ticket.expiresAt < this.now() || ticket.deviceId !== subject) {
      throw new Error('Conferma Wake-on-LAN scaduta o non valida.');
    }
    const target = this.targets.get(ticket.targetId);
    if (!target) throw new Error('Target Wake-on-LAN non più disponibile.');
    const result = await this.sender(target);
    this.audit('wake.executed', { deviceId: ticket.deviceId, targetId: target.id });
    return { ...result, message: `Segnale di risveglio inviato a ${target.label}.` };
  }

  prune() {
    const current = this.now();
    for (const [id, ticket] of this.plans) if (ticket.expiresAt < current) this.plans.delete(id);
    for (const [key, values] of this.rateBuckets) {
      const active = values.filter((time) => current - time < this.rateWindowMs);
      if (active.length) this.rateBuckets.set(key, active);
      else this.rateBuckets.delete(key);
    }
  }

  rateAllowed(key, limit) {
    const current = this.now();
    const active = (this.rateBuckets.get(key) || []).filter((time) => current - time < this.rateWindowMs);
    if (active.length >= limit) {
      this.rateBuckets.set(key, active);
      return false;
    }
    active.push(current);
    this.rateBuckets.set(key, active);
    return true;
  }

  revokeDevice(deviceId) {
    const subject = String(deviceId || '').trim();
    for (const [id, ticket] of this.plans) if (ticket.deviceId === subject) this.plans.delete(id);
    for (const key of this.rateBuckets.keys()) if (key.endsWith(`:${subject}`)) this.rateBuckets.delete(key);
  }
}

// #endregion

module.exports = {
  PLAN_TTL_MS,
  RATE_WINDOW_MS,
  WakeOnLanController,
  magicPacket,
  normalizeBroadcastAddress,
  normalizeMac,
  normalizeWakeTarget,
  sendMagicPacket
};
