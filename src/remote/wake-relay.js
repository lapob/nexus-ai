/**
 * @module remote/wake-relay
 * @description Relay Wake-on-LAN privato, destinato a un nodo sempre acceso nella LAN.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { SecurityEventStore } = require('../security/security-event-store');
const { WakeOnLanController, normalizeWakeTarget } = require('./wake-on-lan');

const DEFAULT_WAKE_RELAY_PORT = 32147;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const TOKEN_ROTATION_GRACE_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 16 * 1024;
const MAX_DEVICES = 12;
const MAX_RATE_BUCKETS = 256;

// #region 01 — Identità, configurazione e persistenza

function tokenHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sameHash(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function cleanText(value, length = 80) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, length);
}

function normalizeTailnetUser(value) {
  const user = cleanText(value, 320).toLowerCase();
  if (user.length < 3) throw new Error('Identità Tailscale non valida.');
  return user;
}

function tailnetIdentityFingerprint(value) {
  return crypto.createHash('sha256')
    .update('nexusnxs-tailnet-identity-v1\0')
    .update(normalizeTailnetUser(value))
    .digest('hex')
    .slice(0, 20);
}

function trustedTailscaleServeRequest(request) {
  const host = String(request?.headers?.host || '').trim();
  const publicProxy = ['cf-ray', 'cf-connecting-ip', 'cf-visitor', 'cdn-loop']
    .some((header) => request?.headers?.[header] !== undefined);
  const trustedHost = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net(?::\d{1,5})?$/i.test(host)
    || /^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/i.test(host)
    || /^\[::1\](?::\d{1,5})?$/.test(host);
  return loopbackPeer(request)
    && trustedHost
    && !publicProxy;
}

function loopbackPeer(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(request?.socket?.remoteAddress || ''));
}

function normalizeRelayConfig(value = {}) {
  const host = String(value?.listen?.host || value?.host || '127.0.0.1').trim();
  if (!['127.0.0.1', '::1'].includes(host)) {
    throw new Error('Il relay Wake-on-LAN deve ascoltare soltanto sul loopback.');
  }
  const port = Number(value?.listen?.port ?? value?.port ?? DEFAULT_WAKE_RELAY_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) throw new Error('Porta relay non valida.');
  const trustedTailnetUsers = [...new Set((Array.isArray(value.trustedTailnetUsers) ? value.trustedTailnetUsers : [])
    .map(normalizeTailnetUser))];
  if (!trustedTailnetUsers.length) throw new Error('Configura almeno un’identità Tailscale autorizzata.');
  const targets = (Array.isArray(value.targets) ? value.targets : []).map(normalizeWakeTarget);
  if (!targets.length) throw new Error('Configura almeno un target Wake-on-LAN locale.');
  return Object.freeze({ host, port, trustedTailnetUsers: Object.freeze(trustedTailnetUsers), targets: Object.freeze(targets) });
}

function defaultRelayState() {
  return { schemaVersion: 1, devices: [] };
}

function readRelayState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const devices = (Array.isArray(parsed.devices) ? parsed.devices : []).filter((device) => (
      /^[a-f0-9-]{20,80}$/i.test(String(device?.id || ''))
      && /^[a-f0-9]{64}$/.test(String(device?.tokenHash || ''))
    )).map((device) => ({
      id: String(device.id), name: cleanText(device.name) || 'Dispositivo Wake',
      tailnetUser: normalizeTailnetUser(device.tailnetUser), tokenHash: String(device.tokenHash),
      previousTokenHash: /^[a-f0-9]{64}$/.test(String(device.previousTokenHash || '')) ? String(device.previousTokenHash) : '',
      previousTokenExpiresAt: Number(device.previousTokenExpiresAt || 0),
      createdAt: Number(device.createdAt || Date.now()), lastSeenAt: Number(device.lastSeenAt || 0),
      rotatedAt: Number(device.rotatedAt || device.createdAt || Date.now())
    })).slice(-MAX_DEVICES);
    return { schemaVersion: 1, devices };
  } catch { return defaultRelayState(); }
}

function writeRelayState(filePath, state) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const output = `${JSON.stringify({ schemaVersion: 1, devices: state.devices }, null, 2)}\n`;
  fs.writeFileSync(temporary, output, { encoding: 'utf8', mode: 0o600 });
  try { fs.renameSync(temporary, filePath); }
  catch {
    fs.copyFileSync(temporary, filePath);
    fs.unlinkSync(temporary);
  }
  try { fs.chmodSync(filePath, 0o600); } catch { /* ACL gestite dal sistema host. */ }
}

// #endregion
// #region 02 — Gateway Wake-on-LAN privato

class WakeRelayServer {
  constructor({
    config, statePath, auditPath, securityEventStore = null, controller = null,
    sender, logger = console, now = () => Date.now()
  } = {}) {
    this.config = normalizeRelayConfig(config);
    if (!statePath) throw new Error('Percorso stato relay richiesto.');
    this.statePath = path.resolve(statePath);
    this.state = readRelayState(this.statePath);
    this.logger = logger;
    this.now = now;
    this.securityEvents = securityEventStore || new SecurityEventStore({
      filePath: path.resolve(auditPath || path.join(path.dirname(this.statePath), 'logs', 'wake-relay-audit.jsonl'))
    });
    this.controller = controller || new WakeOnLanController({
      targets: this.config.targets,
      sender,
      now,
      audit: (type, detail = {}) => this.securityEvents.append(type, {
        severity: type === 'wake.rate_limited' ? 'warning' : 'info',
        deviceId: detail.deviceId,
        detail: [detail.targetId, detail.detail].filter(Boolean).join(':')
      })
    });
    this.server = null;
    this.connections = new Set();
    this.pairing = null;
    this.rateBuckets = new Map();
    this.stopping = false;
  }

  persist() {
    writeRelayState(this.statePath, this.state);
  }

  trustedIdentity(request) {
    if (!trustedTailscaleServeRequest(request)) return '';
    let user;
    try { user = normalizeTailnetUser(request?.headers?.['tailscale-user-login']); }
    catch { return ''; }
    return this.config.trustedTailnetUsers.includes(user) ? user : '';
  }

  allowed(key, limit, windowMs) {
    const current = this.now();
    if (!this.rateBuckets.has(key) && this.rateBuckets.size >= MAX_RATE_BUCKETS) {
      for (const [candidate, values] of this.rateBuckets) {
        const active = values.filter((time) => current - time < windowMs);
        if (active.length) this.rateBuckets.set(candidate, active);
        else this.rateBuckets.delete(candidate);
      }
      if (this.rateBuckets.size >= MAX_RATE_BUCKETS) return false;
    }
    const active = (this.rateBuckets.get(key) || []).filter((time) => current - time < windowMs);
    if (active.length >= limit) {
      this.rateBuckets.set(key, active);
      return false;
    }
    active.push(current);
    this.rateBuckets.set(key, active);
    return true;
  }

  createPairingCode({ tailnetUser } = {}) {
    const user = normalizeTailnetUser(tailnetUser);
    if (!this.config.trustedTailnetUsers.includes(user)) throw new Error('Identità Tailscale non autorizzata.');
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    this.pairing = { hash: tokenHash(code), tailnetUser: user, expiresAt: this.now() + PAIRING_TTL_MS };
    this.securityEvents.append('wake.pairing_created', { detail: tailnetIdentityFingerprint(user) });
    return { code, scope: 'wake', expiresAt: this.pairing.expiresAt };
  }

  authenticate(request, identity) {
    const match = String(request.headers.authorization || '').match(/^Bearer ([A-Za-z0-9_-]{32,160})$/);
    if (!match) return null;
    const hash = tokenHash(match[1]);
    const now = this.now();
    const device = this.state.devices.find((candidate) => candidate.tailnetUser === identity && (
      sameHash(candidate.tokenHash, hash)
      || (candidate.previousTokenExpiresAt > now && sameHash(candidate.previousTokenHash, hash))
    ));
    if (!device) return null;
    if (now - device.lastSeenAt > 60_000) {
      device.lastSeenAt = now;
      this.persist();
    }
    return device;
  }

  rotateToken(device) {
    const token = crypto.randomBytes(32).toString('base64url');
    device.previousTokenHash = device.tokenHash;
    device.previousTokenExpiresAt = this.now() + TOKEN_ROTATION_GRACE_MS;
    device.tokenHash = tokenHash(token);
    device.rotatedAt = this.now();
    this.persist();
    this.controller.revokeDevice(device.id);
    this.securityEvents.append('wake.session_rotated', { deviceId: device.id, deviceName: device.name });
    return { token, rotatedAt: device.rotatedAt, rotateAfter: device.rotatedAt + 24 * 60 * 60 * 1000 };
  }

  revokeDevice(deviceId) {
    const id = String(deviceId || '');
    const previous = this.state.devices.length;
    this.state.devices = this.state.devices.filter((device) => device.id !== id);
    if (this.state.devices.length === previous) return false;
    this.controller.revokeDevice(id);
    this.persist();
    this.securityEvents.append('wake.device_revoked', { severity: 'warning', deviceId: id });
    return true;
  }

  async body(request) {
    request.setTimeout?.(5_000);
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Richiesta troppo grande.'), { status: 413 });
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw Object.assign(new Error('JSON non valido.'), { status: 400 }); }
  }

  json(response, status, value) {
    if (response.destroyed || response.writableEnded) return;
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    response.end(JSON.stringify(value));
  }

  async handle(request, response) {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const identity = this.trustedIdentity(request);
      if (!identity) {
        this.securityEvents.append('wake.ingress_denied', { severity: 'critical', address: String(request.socket.remoteAddress || ''), detail: url.pathname });
        return this.json(response, 404, { error: 'Risorsa non disponibile.' });
      }
      if (request.method === 'GET' && url.pathname === '/livez') {
        return this.json(response, 200, { status: 'alive' });
      }
      const identityId = tailnetIdentityFingerprint(identity);
      const rateKey = `identity:${identityId}`;
      if (!this.allowed(rateKey, 60, 60_000)) {
        this.securityEvents.append('wake.request_rate_limited', { severity: 'warning', detail: identityId });
        return this.json(response, 429, { error: 'Troppe richieste. Attendi prima di riprovare.' });
      }
      if (request.method === 'POST' && url.pathname === '/api/pair') {
        if (!this.allowed(`pair:${identityId}`, 5, 10 * 60_000)) return this.json(response, 429, { error: 'Troppi tentativi di associazione.' });
        const body = await this.body(request);
        const pairing = this.pairing;
        const valid = pairing && pairing.expiresAt > this.now() && pairing.tailnetUser === identity
          && sameHash(pairing.hash, tokenHash(String(body.code || '')));
        if (!valid) {
          this.securityEvents.append('wake.pairing_failed', { severity: 'warning', detail: identityId });
          return this.json(response, 403, { error: 'Codice non valido o scaduto.' });
        }
        this.pairing = null;
        if (body.scope && body.scope !== 'wake') {
          this.securityEvents.append('wake.pairing_scope_denied', { severity: 'critical', detail: cleanText(body.scope, 20) });
          return this.json(response, 403, { error: 'Il collegamento non autorizza questa modalità.' });
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const device = {
          id: crypto.randomUUID(), name: cleanText(body.deviceName) || 'Dispositivo Wake',
          tailnetUser: identity, tokenHash: tokenHash(token), previousTokenHash: '', previousTokenExpiresAt: 0,
          createdAt: this.now(), lastSeenAt: this.now(), rotatedAt: this.now()
        };
        this.state.devices.push(device);
        this.state.devices = this.state.devices.slice(-MAX_DEVICES);
        this.persist();
        this.securityEvents.append('wake.device_paired', { deviceId: device.id, deviceName: device.name, detail: identityId });
        return this.json(response, 201, { token, device: { id: device.id, name: device.name, scope: 'wake' } });
      }
      const device = this.authenticate(request, identity);
      if (!device) {
        this.securityEvents.append('wake.authentication_denied', { severity: 'warning', detail: identityId });
        return this.json(response, 401, { error: 'Dispositivo non associato.' });
      }
      if (request.method === 'GET' && url.pathname === '/api/wake/capabilities') {
        return this.json(response, 200, this.controller.capabilities());
      }
      if (request.method === 'POST' && url.pathname === '/api/session/rotate') {
        return this.json(response, 200, this.rotateToken(device));
      }
      if (request.method === 'POST' && url.pathname === '/api/wake/plan') {
        if (!this.allowed(`plan:${device.id}`, 3, 60_000)) return this.json(response, 429, { error: 'Troppe richieste di risveglio.' });
        const body = await this.body(request);
        return this.json(response, 200, { proposal: this.controller.plan({ targetId: body.targetId, deviceId: device.id }) });
      }
      if (request.method === 'POST' && url.pathname === '/api/wake/execute') {
        if (!this.allowed(`execute:${device.id}`, 6, 60_000)) return this.json(response, 429, { error: 'Troppe esecuzioni di risveglio.' });
        const body = await this.body(request);
        const result = await this.controller.execute({ ticketId: body.ticketId, deviceId: device.id, approved: body.approved === true });
        return this.json(response, 200, result);
      }
      return this.json(response, 404, { error: 'Risorsa non disponibile.' });
    } catch (error) {
      this.logger.warn?.('Richiesta Wake-on-LAN non completata.', { error });
      return this.json(response, error?.status || 400, { error: error?.message || 'Richiesta non valida.' });
    }
  }

  start() {
    if (this.server) return Promise.resolve(this.status());
    this.stopping = false;
    this.server = http.createServer((request, response) => this.handle(request, response));
    this.server.on('connection', (socket) => {
      this.connections.add(socket);
      socket.once('close', () => this.connections.delete(socket));
    });
    return new Promise((resolve, reject) => {
      const server = this.server;
      server.once('error', (error) => { this.server = null; reject(error); });
      server.listen(this.config.port, this.config.host, () => {
        server.removeAllListeners('error');
        server.on('error', (error) => this.logger.warn?.('Errore relay Wake-on-LAN.', { error }));
        resolve(this.status());
      });
    });
  }

  async stop() {
    if (!this.server) return;
    this.stopping = true;
    const server = this.server;
    this.server = null;
    for (const socket of this.connections) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
    this.connections.clear();
  }

  status() {
    return {
      running: Boolean(this.server?.listening), host: this.config.host, port: this.config.port,
      devices: this.state.devices.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt })),
      ...this.controller.capabilities()
    };
  }
}

// #endregion

module.exports = {
  DEFAULT_WAKE_RELAY_PORT,
  PAIRING_TTL_MS,
  WakeRelayServer,
  loopbackPeer,
  normalizeRelayConfig,
  normalizeTailnetUser,
  tailnetIdentityFingerprint,
  trustedTailscaleServeRequest,
  readRelayState,
  writeRelayState
};
