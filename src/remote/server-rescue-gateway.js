/**
 * @module remote/server-rescue-gateway
 * @description Punto di ripristino privato del server NexusNXS, ospitato dal
 * Desktop Bridge che resta attivo nella sessione del proprietario anche quando
 * il Core è spento. Espone soltanto tre operazioni sotto `/rescue`:
 *   - stato del Core (acceso, in avvio, spento, spento di proposito);
 *   - challenge firmata per lo scopo `server-start`;
 *   - riaccensione tramite il gestore coordinato
 *     `scripts/manage-headless-server-task.ps1 -Action start`.
 * L'autorizzazione è la stessa dei comandi privati della Console: token del
 * dispositivo associato (scope Console) più prova firmata con la chiave
 * hardware iscritta. Il registro dei dispositivi è letto a ogni richiesta dal
 * file del Core, così una revoca vale subito anche qui. Ascolta solo su
 * loopback: dall'esterno è raggiungibile solo attraverso Tailscale Serve.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { DeviceIdentityChallengeStore, canonicalChallengePayload } = require('../security/device-identity');

// #region 01 — Costanti e utilità

const DEFAULT_RESCUE_PORT = 32149;
const CORE_PORT = 32145;
const START_PURPOSE = 'server-start';
const MAX_BODY_BYTES = 4096;
const START_COOLDOWN_MS = 60_000;
const START_SUPERVISION_MS = 8 * 60_000;

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function sameHash(left, right) {
  const a = Buffer.from(String(left || ''), 'hex');
  const b = Buffer.from(String(right || ''), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function isLoopback(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(request?.socket?.remoteAddress || ''));
}

function failure(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** Stessa verifica delle firme del gateway principale (Ed25519 o P-256). */
function verifyDeviceSignature(identity, payload, signature) {
  if (!identity || !Buffer.isBuffer(payload) || typeof signature !== 'string') return false;
  if (!/^[A-Za-z0-9_-]{43,700}$/.test(signature)) return false;
  try {
    const der = Buffer.from(String(identity.publicKey || ''), 'base64url');
    const publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' });
    // La chiave deve corrispondere all'identificativo iscritto: un record
    // manomesso con una chiave diversa non viene accettato.
    const canonical = publicKey.export({ format: 'der', type: 'spki' });
    const keyId = crypto.createHash('sha256').update('nexusnxs-device-public-key-v1\0').update(canonical).digest('hex');
    if (keyId !== identity.keyId) return false;
    const bytes = Buffer.from(signature, 'base64url');
    if (identity.algorithm === 'ed25519' && publicKey.asymmetricKeyType === 'ed25519') return crypto.verify(null, payload, publicKey, bytes);
    if (identity.algorithm === 'ecdsa-p256-sha256' && publicKey.asymmetricKeyType === 'ec') {
      if (crypto.verify('sha256', payload, publicKey, bytes)) return true;
      return crypto.verify('sha256', payload, { key: publicKey, dsaEncoding: 'ieee-p1363' }, bytes);
    }
  } catch { return false; }
  return false;
}

// #endregion

// #region 02 — Lettura del registro dispositivi del Core

function readDevices(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return Array.isArray(parsed?.devices) ? parsed.devices.filter((device) => device?.id && /^[a-f0-9]{64}$/.test(device.tokenHash || '')) : [];
  } catch { return []; }
}

function findDevice(statePath, request, now) {
  const token = String(request.headers.authorization || '').match(/^Bearer\s+([A-Za-z0-9_-]{16,256})$/)?.[1];
  if (!token) return null;
  const hash = tokenHash(token);
  return readDevices(statePath).find((entry) => sameHash(entry.tokenHash, hash)
    || (Number(entry.previousTokenExpiresAt) > now && sameHash(entry.previousTokenHash, hash))) || null;
}

function hasConsoleScope(device) {
  return device?.scope === 'console' || device?.scope === 'remote';
}

// #endregion

// #region 03 — Gateway

function createServerRescueGateway({
  sharedDataRoot,
  projectRoot,
  port = DEFAULT_RESCUE_PORT,
  host = '127.0.0.1',
  logger = console,
  now = () => Date.now(),
  probeCore = () => probeCoreHealth(CORE_PORT),
  launchStart = null,
  statePath = path.join(String(sharedDataRoot || ''), 'data', 'remote-access.json'),
  stopFlagPath = path.join(String(sharedDataRoot || ''), 'server-stopped.flag'),
  managerPath = path.join(String(projectRoot || ''), 'scripts', 'manage-headless-server-task.ps1'),
  logPath = path.join(String(sharedDataRoot || ''), 'logs', 'server-rescue.log')
} = {}) {
  const challenges = new DeviceIdentityChallengeStore({
    now,
    ttlMs: 60_000,
    verifySignature: ({ deviceId, keyId, payload, signature }) => {
      const device = readDevices(statePath).find((entry) => entry.id === deviceId);
      return Boolean(device?.identity?.keyId === keyId && verifyDeviceSignature(device.identity, payload, signature));
    }
  });
  let server = null;
  let starting = null; // { startedAt, child }
  let lastStartAt = 0;

  const launcher = typeof launchStart === 'function' ? launchStart : () => launchManagedStart({ managerPath, logPath });

  async function coreState() {
    if (await probeCore().catch(() => false)) { starting = null; return 'online'; }
    if (starting && now() - starting.startedAt < START_SUPERVISION_MS) return 'starting';
    starting = null;
    return 'offline';
  }

  function authorize(request) {
    if (!isLoopback(request)) throw failure(403, 'RESCUE_LOOPBACK_ONLY', 'Accesso consentito solo attraverso il collegamento privato.');
    const device = findDevice(statePath, request, now());
    if (!device) throw failure(401, 'DEVICE_SESSION_REVOKED', 'Sessione del dispositivo non valida.');
    if (!hasConsoleScope(device)) throw failure(403, 'CONSOLE_SCOPE_REQUIRED', 'Autorizzazione Console richiesta.');
    // Fallisce chiuso: la riaccensione richiede sempre una chiave iscritta.
    if (!device.identity?.keyId) throw failure(428, 'DEVICE_IDENTITY_ENROLLMENT_REQUIRED', 'Questo dispositivo deve essere associato nuovamente con una chiave protetta.');
    return device;
  }

  async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw failure(413, 'RESCUE_BODY_TOO_LARGE', 'Richiesta troppo grande.');
      chunks.push(chunk);
    }
    if (!size) return {};
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { throw failure(400, 'RESCUE_BODY_INVALID', 'Richiesta non valida.'); }
  }

  async function status() {
    const core = await coreState();
    const ownerStopped = fs.existsSync(stopFlagPath);
    const available = fs.existsSync(managerPath) || typeof launchStart === 'function';
    return {
      service: 'nexusnxs-rescue',
      version: 1,
      core,
      ownerStopped,
      canStart: available && core === 'offline' && now() - lastStartAt >= START_COOLDOWN_MS,
      retryAfterMs: Math.max(0, START_COOLDOWN_MS - (now() - lastStartAt))
    };
  }

  async function handle(request, response) {
    const url = new URL(request.url, 'http://rescue.local');
    const send = (code, value) => {
      response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(JSON.stringify(value));
    };
    try {
      if (!url.pathname.startsWith('/rescue/')) throw failure(404, 'NOT_FOUND', 'Risorsa non trovata.');
      const device = authorize(request);
      if (request.method === 'GET' && url.pathname === '/rescue/status') return send(200, await status());
      if (request.method === 'POST' && url.pathname === '/rescue/challenge') {
        const body = await readBody(request);
        if (String(body.purpose || '') !== START_PURPOSE) throw failure(400, 'DEVICE_CHALLENGE_PURPOSE_INVALID', 'Scopo della prova dispositivo non consentito.');
        let challenge;
        try { challenge = challenges.issue({ deviceId: device.id, keyId: device.identity.keyId, purpose: START_PURPOSE }); }
        catch (error) { throw failure(429, error.code || 'DEVICE_CHALLENGE_LIMIT', error.message); }
        return send(201, { ...challenge, algorithm: device.identity.algorithm, payload: canonicalChallengePayload(challenge).toString('base64url') });
      }
      if (request.method === 'POST' && url.pathname === '/rescue/start') {
        const body = await readBody(request);
        const proof = body.deviceProof;
        if (!proof || typeof proof !== 'object') throw failure(401, 'DEVICE_IDENTITY_PROOF_REQUIRED', 'Serve una prova firmata del dispositivo.');
        try {
          await challenges.verify({ challengeId: proof.challengeId, deviceId: device.id, keyId: device.identity.keyId, purpose: START_PURPOSE, signature: proof.signature });
        } catch (error) {
          logger.warn?.('Riaccensione server rifiutata: prova dispositivo non valida.', { deviceId: device.id, code: error?.code });
          throw failure(401, 'DEVICE_SIGNATURE_INVALID', 'La prova firmata del dispositivo non è valida o è scaduta.');
        }
        // Rilettura dopo la verifica: una revoca avvenuta nel frattempo prevale.
        authorize(request);
        const core = await coreState();
        if (core === 'online') return send(200, { accepted: false, core, reason: 'already-online' });
        if (core === 'starting') return send(202, { accepted: true, core, reason: 'already-starting' });
        if (now() - lastStartAt < START_COOLDOWN_MS) throw failure(429, 'RESCUE_COOLDOWN', 'Riaccensione già richiesta da poco: attendi.');
        const ownerStopped = fs.existsSync(stopFlagPath);
        lastStartAt = now();
        const child = launcher();
        starting = { startedAt: now(), child };
        child?.once?.('exit', (code) => {
          logger.info?.('Gestore server terminato dopo la riaccensione remota.', { code });
          // conhost può chiudersi subito con 0 mentre il gestore prosegue: lo stato
          // «in avvio» resta finché il Core risponde o scade la supervisione.
          // Solo un'uscita con errore lo azzera.
          if (code !== 0 && starting?.child === child) starting = null;
        });
        logger.info?.('Riaccensione server richiesta da Control.', { deviceId: device.id, deviceName: String(device.name || '').slice(0, 80), ownerStopped });
        return send(202, { accepted: true, core: 'starting', ownerStopped });
      }
      throw failure(404, 'NOT_FOUND', 'Risorsa non trovata.');
    } catch (error) {
      const code = Number(error?.status) || 500;
      if (code >= 500) logger.warn?.('Errore del punto di ripristino server.', { error });
      return send(code, { error: code >= 500 ? 'Ripristino non disponibile.' : error.message, code: error?.code || 'RESCUE_ERROR' });
    }
  }

  return {
    get port() { return server?.address()?.port || port; },
    handle,
    status,
    async start() {
      if (server) return this;
      server = http.createServer((request, response) => { void handle(request, response); });
      server.headersTimeout = 10_000;
      server.requestTimeout = 15_000;
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(); });
      });
      logger.info?.('Punto di ripristino server attivo.', { port: server.address().port });
      return this;
    },
    async stop() {
      const current = server;
      server = null;
      if (current) await new Promise((resolve) => current.close(() => resolve()));
    }
  };
}

/** Il Core risponde a /healthz anche durante il riscaldamento: basta per dirlo acceso. */
function probeCoreHealth(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: timeoutMs }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

/**
 * Avvia il gestore coordinato in una console senza finestra (come i task del
 * server): `start` rimuove anche il flag di arresto voluto dal proprietario.
 */
function launchManagedStart({ managerPath, logPath, spawnImpl = spawn, env = process.env }) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, 'a');
  const systemRoot = env.SystemRoot || 'C:\\Windows';
  const pwsh = env.NEXUS_PWSH_EXECUTABLE || 'pwsh.exe';
  const args = ['--headless', pwsh, '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', managerPath, '-Action', 'start'];
  try {
    const child = spawnImpl(path.join(systemRoot, 'System32', 'conhost.exe'), args, {
      cwd: path.dirname(managerPath), detached: true, windowsHide: true, stdio: ['ignore', log, log], env
    });
    child.unref?.();
    return child;
  } finally { fs.closeSync(log); }
}

// #endregion

module.exports = { createServerRescueGateway, launchManagedStart, verifyDeviceSignature, DEFAULT_RESCUE_PORT, START_PURPOSE, START_COOLDOWN_MS };
