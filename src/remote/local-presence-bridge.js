/**
 * @module remote/local-presence-bridge
 * @description Bridge IPC locale autenticato tra Core headless e shell Presence.
 *
 * Il trasporto non apre porte TCP: su Windows usa una named pipe locale e
 * sugli altri sistemi un Unix domain socket dentro i dati dell'app. Ogni
 * richiesta e risposta e autenticata con HMAC, ha scadenza breve e supporta
 * idempotenza per requestId. Il protocollo espone soltanto stato aggregato e
 * le sole azioni semantiche allowlist del contratto desktop-presence.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {
  PRESENCE_PROTOCOL_VERSION,
  PRESENCE_ACTIONS,
  normalizeDesktopPresenceStatus,
  normalizePresenceAction
} = require('./desktop-presence-contract');

const BRIDGE_PROTOCOL_VERSION = 1;
const MAX_FRAME_BYTES = 16 * 1024;
const DEFAULT_TIMEOUT_MS = 1_500;
const REQUEST_CLOCK_SKEW_MS = 30_000;
const REPLAY_TTL_MS = 60_000;
const IDEMPOTENCY_TTL_MS = 2 * 60_000;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_SECRET = /^[A-Za-z0-9_-]{40,64}$/;
const ACTIVATION_TICKET = /^[A-Za-z0-9_-]{80,2048}$/;
const ACTIVATION_NONCE = /^[A-Za-z0-9_-]{32,64}$/;
const ACTIVATION_TTL_MS = 8_000;
const PRESENCE_STATES = new Set([
  'booting', 'idle', 'listening', 'speaking', 'thinking', 'responding',
  'executing', 'permission', 'offline', 'error'
]);
const PRESENCE_MOTION = new Set(['system', 'reduced', 'full']);
const PRESENCE_QUALITY = new Set(['auto', 'efficient', 'balanced', 'ultra', 'super']);
const PRESENCE_APPEARANCE = new Set(['neural', 'saturn-experimental', 'jarvis-reactor']);

// #region 01 — Firma, percorsi e normalizzazione

function bridgeError(message, code, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function timingSafeText(left, right) {
  const a = Buffer.from(String(left || ''), 'utf8');
  const b = Buffer.from(String(right || ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requestSignature(secret, request) {
  return crypto.createHmac('sha256', secret).update(stableJson({
    version: request.version,
    requestId: request.requestId,
    timestamp: request.timestamp,
    nonce: request.nonce,
    operation: request.operation,
    payload: request.payload
  })).digest('base64url');
}

function responseSignature(secret, response) {
  return crypto.createHmac('sha256', secret).update(stableJson({
    version: response.version,
    requestId: response.requestId,
    timestamp: response.timestamp,
    serverInstanceId: response.serverInstanceId,
    ok: response.ok,
    result: response.result ?? null,
    error: response.error ?? null
  })).digest('base64url');
}

function activationSignature(secret, ticket) {
  return crypto.createHmac('sha256', secret).update(stableJson({
    version: ticket.version,
    instanceId: ticket.instanceId,
    kind: ticket.kind,
    nonce: ticket.nonce,
    issuedAt: ticket.issuedAt,
    expiresAt: ticket.expiresAt
  })).digest('base64url');
}

function encodeActivationTicket(ticket) {
  return Buffer.from(JSON.stringify(ticket), 'utf8').toString('base64url');
}

function decodeActivationTicket(value) {
  if (!ACTIVATION_TICKET.test(String(value || ''))) return null;
  try {
    const ticket = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    return ticket && typeof ticket === 'object' && !Array.isArray(ticket) ? ticket : null;
  } catch { return null; }
}

function bridgePaths(sharedDataRoot, { platform = process.platform, username = os.userInfo().username } = {}) {
  const requestedRoot = String(sharedDataRoot || '').trim();
  if (!requestedRoot) throw bridgeError('Directory dati condivisa mancante.', 'PRESENCE_BRIDGE_ROOT_MISSING');
  const root = path.resolve(requestedRoot);
  const runtimeDirectory = path.join(root, 'runtime');
  const identity = crypto.createHash('sha256')
    .update(`${root.toLowerCase()}\u0000${String(username || '').toLowerCase()}`)
    .digest('hex').slice(0, 24);
  return Object.freeze({
    runtimeDirectory,
    tokenPath: path.join(runtimeDirectory, 'presence-bridge.json'),
    endpoint: platform === 'win32'
      ? `\\\\.\\pipe\\nexusnxs-presence-${identity}`
      : path.join(runtimeDirectory, `presence-${identity}.sock`)
  });
}

function writeToken(paths, descriptor) {
  fs.mkdirSync(paths.runtimeDirectory, { recursive: true, mode: 0o700 });
  const temporary = `${paths.tokenPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(descriptor), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { fs.chmodSync(temporary, 0o600); } catch {}
  try { fs.rmSync(paths.tokenPath, { force: true }); } catch {}
  fs.renameSync(temporary, paths.tokenPath);
  try { fs.chmodSync(paths.tokenPath, 0o600); } catch {}
}

function readToken(paths, { unprotectSecret, serializedDescriptor } = {}) {
  let descriptor;
  try {
    descriptor = JSON.parse(
      serializedDescriptor === undefined
        ? fs.readFileSync(paths.tokenPath, 'utf8')
        : String(serializedDescriptor)
    );
  }
  catch { throw bridgeError('Shell Presence non disponibile.', 'PRESENCE_BRIDGE_OFFLINE'); }
  let secret = descriptor?.secret;
  if (descriptor?.protectedSecret !== undefined) {
    if (typeof descriptor.protectedSecret !== 'string' || descriptor.protectedSecret.length < 24
      || typeof unprotectSecret !== 'function' || descriptor.secret !== undefined) {
      throw bridgeError('Credenziale Presence protetta non valida.', 'PRESENCE_BRIDGE_TOKEN_INVALID');
    }
    try { secret = unprotectSecret(descriptor.protectedSecret); }
    catch { throw bridgeError('Credenziale Presence non decifrabile.', 'PRESENCE_BRIDGE_TOKEN_INVALID'); }
  }
  if (descriptor?.version !== BRIDGE_PROTOCOL_VERSION
    || !TOKEN_SECRET.test(String(secret || ''))
    || !REQUEST_ID.test(String(descriptor.instanceId || ''))) {
    throw bridgeError('Credenziale Presence non valida.', 'PRESENCE_BRIDGE_TOKEN_INVALID');
  }
  return Object.freeze({ ...descriptor, secret });
}

function removeOwnedToken(paths, instanceId) {
  try {
    const current = JSON.parse(fs.readFileSync(paths.tokenPath, 'utf8'));
    if (current?.instanceId === instanceId) fs.rmSync(paths.tokenPath, { force: true });
  } catch {}
}

function sanitizeStatus(value, { mutationsAvailable = true } = {}) {
  const normalized = normalizeDesktopPresenceStatus(value, { mutationsAvailable });
  return Object.freeze({
    available: normalized.available,
    nucleusVisible: normalized.nucleus === 'visible' ? true : normalized.nucleus === 'hidden' ? false : null,
    fullAppOpen: normalized.fullApp === 'open' ? true : normalized.fullApp === 'closed' ? false : null,
    chatGptOpen: normalized.chatGpt === 'open' ? true : normalized.chatGpt === 'closed' ? false : null,
    applications: Object.freeze(normalized.applications.map((entry) => Object.freeze({
      id: entry.id,
      label: entry.label,
      icon: entry.icon,
      available: entry.available,
      open: entry.state === 'open',
      canClose: entry.canClose
    }))),
    foregroundApplicationId: normalized.foregroundApplicationId,
    selectedDisplayId: normalized.selectedDisplayId,
    logicalDisplays: Object.freeze(normalized.logicalDisplays.map((entry) => Object.freeze({ id: entry.id }))),
    allowedActions: Object.freeze([...normalized.allowedActions])
  });
}

function normalizePresenceSync(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw bridgeError('Stato Presence non valido.', 'PRESENCE_SYNC_INVALID', 400);
  }
  const allowedKeys = new Set([
    'state', 'appearance', 'motion', 'quality',
    'wakeWordEnabled', 'wakeWordConfidence', 'wakeWordCooldownMs', 'wakeWordSuspended'
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw bridgeError('Stato Presence contiene campi non consentiti.', 'PRESENCE_SYNC_INVALID', 400);
  }
  const state = String(value.state || 'idle');
  const appearance = String(value.appearance || 'saturn-experimental');
  const motion = String(value.motion || 'system');
  const quality = String(value.quality || 'auto');
  if (!PRESENCE_STATES.has(state) || !PRESENCE_APPEARANCE.has(appearance)
    || !PRESENCE_MOTION.has(motion) || !PRESENCE_QUALITY.has(quality)) {
    throw bridgeError('Stato Presence fuori contratto.', 'PRESENCE_SYNC_INVALID', 400);
  }
  return Object.freeze({
    state,
    appearance,
    motion,
    quality,
    wakeWordEnabled: value.wakeWordEnabled === true,
    wakeWordConfidence: Math.min(0.95, Math.max(0.7, Number.isFinite(Number(value.wakeWordConfidence)) ? Number(value.wakeWordConfidence) : 0.84)),
    wakeWordCooldownMs: Math.round(Math.min(30_000, Math.max(2_000, Number.isFinite(Number(value.wakeWordCooldownMs)) ? Number(value.wakeWordCooldownMs) : 5_000))),
    wakeWordSuspended: value.wakeWordSuspended === true
  });
}

function pruneMap(map, now, maximum = 512) {
  for (const [key, value] of map) {
    if (value.expiresAt <= now) map.delete(key);
  }
  while (map.size > maximum) map.delete(map.keys().next().value);
}

// #endregion
// #region 02 — Server locale Presence

function createLocalPresenceBridgeServer({
  sharedDataRoot,
  statusProvider,
  actionExecutor,
  stateSynchronizer,
  protectSecret,
  logger = console,
  platform = process.platform,
  now = Date.now
} = {}) {
  if (typeof statusProvider !== 'function' || typeof actionExecutor !== 'function') {
    throw new TypeError('Provider stato ed esecutore Presence obbligatori.');
  }
  const paths = bridgePaths(sharedDataRoot, { platform });
  const instanceId = crypto.randomUUID();
  const secret = crypto.randomBytes(32).toString('base64url');
  const nonces = new Map();
  const requests = new Map();
  const sockets = new Set();
  let server = null;
  let startPromise = null;
  let stopPromise = null;
  let running = false;

  function signedResponse(requestId, ok, value) {
    const response = {
      version: BRIDGE_PROTOCOL_VERSION,
      requestId,
      timestamp: now(),
      serverInstanceId: instanceId,
      ok,
      ...(ok ? { result: value } : { error: value })
    };
    return Object.freeze({ ...response, mac: responseSignature(secret, response) });
  }

  function createActivationTicket(kind = 'voice') {
    if (!running || kind !== 'voice') throw bridgeError('Ticket Presence non disponibile.', 'PRESENCE_ACTIVATION_UNAVAILABLE');
    const issuedAt = now();
    const ticket = {
      version: BRIDGE_PROTOCOL_VERSION,
      instanceId,
      kind,
      nonce: crypto.randomBytes(24).toString('base64url'),
      issuedAt,
      expiresAt: issuedAt + ACTIVATION_TTL_MS
    };
    return encodeActivationTicket({ ...ticket, mac: activationSignature(secret, ticket) });
  }

  async function dispatch(request) {
    const currentTime = now();
    if (!request || request.version !== BRIDGE_PROTOCOL_VERSION || !REQUEST_ID.test(String(request.requestId || ''))
      || !Number.isFinite(Number(request.timestamp)) || Math.abs(currentTime - Number(request.timestamp)) > REQUEST_CLOCK_SKEW_MS
      || !TOKEN_SECRET.test(String(request.nonce || '')) || !['status', 'action', 'sync'].includes(request.operation)
      || !timingSafeText(request.mac, requestSignature(secret, request))) {
      throw bridgeError('Richiesta bridge non autenticata.', 'PRESENCE_BRIDGE_UNAUTHORIZED', 401);
    }

    pruneMap(nonces, currentTime);
    pruneMap(requests, currentTime);
    const fingerprint = crypto.createHash('sha256').update(stableJson({ operation: request.operation, payload: request.payload })).digest('hex');
    const known = requests.get(request.requestId);
    if (known) {
      if (known.fingerprint !== fingerprint) {
        return signedResponse(request.requestId, false, {
          code: 'PRESENCE_BRIDGE_IDEMPOTENCY_CONFLICT',
          message: 'RequestId gia usato per un comando diverso.'
        });
      }
      return known.response;
    }
    if (nonces.has(request.nonce)) {
      return signedResponse(request.requestId, false, {
        code: 'PRESENCE_BRIDGE_REPLAY', message: 'Richiesta gia osservata.'
      });
    }
    nonces.set(request.nonce, { expiresAt: currentTime + REPLAY_TTL_MS });

    let response;
    try {
      if (request.operation === 'status') {
        if (request.payload && (typeof request.payload !== 'object' || Array.isArray(request.payload)
          || Object.keys(request.payload).length)) {
          throw bridgeError('Payload stato non valido.', 'PRESENCE_BRIDGE_PAYLOAD_INVALID', 400);
        }
        response = signedResponse(request.requestId, true, sanitizeStatus(await statusProvider(), { mutationsAvailable: true }));
      } else if (request.operation === 'action') {
        const action = normalizePresenceAction(request.payload);
        const command = Object.freeze({ ...action, requestId: request.requestId });
        await actionExecutor(command, Object.freeze({
          protocol: BRIDGE_PROTOCOL_VERSION,
          transport: platform === 'win32' ? 'named-pipe' : 'unix-socket',
          requestId: request.requestId
        }));
        response = signedResponse(request.requestId, true, sanitizeStatus(await statusProvider(), { mutationsAvailable: true }));
      } else {
        if (typeof stateSynchronizer !== 'function') {
          throw bridgeError('Sincronizzazione Presence non disponibile.', 'PRESENCE_SYNC_UNAVAILABLE');
        }
        const snapshot = normalizePresenceSync(request.payload);
        await stateSynchronizer(snapshot, Object.freeze({
          protocol: BRIDGE_PROTOCOL_VERSION,
          transport: platform === 'win32' ? 'named-pipe' : 'unix-socket',
          requestId: request.requestId
        }));
        response = signedResponse(request.requestId, true, { synced: true });
      }
    } catch (error) {
      response = signedResponse(request.requestId, false, {
        code: String(error?.code || 'PRESENCE_BRIDGE_REJECTED').slice(0, 80),
        message: String(error?.message || 'Operazione Presence rifiutata.').slice(0, 240)
      });
    }
    requests.set(request.requestId, { fingerprint, response, expiresAt: currentTime + IDEMPOTENCY_TTL_MS });
    return response;
  }

  function handleSocket(socket) {
    sockets.add(socket);
    socket.setEncoding('utf8');
    socket.setTimeout(DEFAULT_TIMEOUT_MS, () => socket.destroy());
    let buffer = '';
    let handled = false;
    const finish = async () => {
      if (handled) return;
      const boundary = buffer.indexOf('\n');
      if (boundary < 0) return;
      handled = true;
      let request;
      try { request = JSON.parse(buffer.slice(0, boundary)); }
      catch { socket.destroy(); return; }
      try {
        const response = await dispatch(request);
        if (!socket.destroyed) socket.end(`${JSON.stringify(response)}\n`);
      } catch {
        // Le richieste non autenticate vengono chiuse senza un oracle di errore.
        socket.destroy();
      }
    };
    socket.on('data', (chunk) => {
      if (handled) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES) {
        handled = true;
        socket.destroy();
        return;
      }
      void finish();
    });
    socket.once('error', () => {});
    socket.once('close', () => sockets.delete(socket));
  }

  function start() {
    if (startPromise) return startPromise;
    startPromise = new Promise((resolve, reject) => {
      fs.mkdirSync(paths.runtimeDirectory, { recursive: true, mode: 0o700 });
      if (platform !== 'win32') {
        try { fs.rmSync(paths.endpoint, { force: true }); } catch {}
      }
      const protectedSecret = typeof protectSecret === 'function' ? String(protectSecret(secret) || '') : '';
      writeToken(paths, {
        version: BRIDGE_PROTOCOL_VERSION,
        instanceId,
        ...(protectedSecret ? { protectedSecret } : { secret }),
        createdAt: now()
      });
      server = net.createServer(handleSocket);
      server.once('error', (error) => {
        removeOwnedToken(paths, instanceId);
        reject(error);
      });
      server.listen(paths.endpoint, () => {
        running = true;
        server.removeAllListeners('error');
        server.on('error', (error) => logger.warn?.('Bridge Presence locale in errore.', { error }));
        resolve(Object.freeze({ running: true, transport: platform === 'win32' ? 'named-pipe' : 'unix-socket' }));
      });
    });
    return startPromise;
  }

  function stop() {
    if (stopPromise) return stopPromise;
    stopPromise = (async () => {
      running = false;
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      if (server) await new Promise((resolve) => server.close(() => resolve()));
      removeOwnedToken(paths, instanceId);
      if (platform !== 'win32') {
        try { fs.rmSync(paths.endpoint, { force: true }); } catch {}
      }
      nonces.clear();
      requests.clear();
    })();
    return stopPromise;
  }

  return {
    start,
    stop,
    createActivationTicket,
    get running() { return running; },
    get transport() { return platform === 'win32' ? 'named-pipe' : 'unix-socket'; }
  };
}

// #endregion
// #region 03 — Client Core fail-closed

function createLocalPresenceBridgeClient({
  sharedDataRoot,
  logger = console,
  platform = process.platform,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  unprotectSecret,
  now = Date.now
} = {}) {
  const paths = bridgePaths(sharedDataRoot, { platform });
  const sockets = new Set();
  const consumedActivations = new Map();
  let closed = false;
  let cachedSerializedDescriptor = null;
  let cachedToken = null;

  function currentToken() {
    let serializedDescriptor;
    try { serializedDescriptor = fs.readFileSync(paths.tokenPath, 'utf8'); }
    catch { throw bridgeError('Shell Presence non disponibile.', 'PRESENCE_BRIDGE_OFFLINE'); }
    if (cachedToken && serializedDescriptor === cachedSerializedDescriptor) return cachedToken;
    const token = readToken(paths, { unprotectSecret, serializedDescriptor });
    cachedSerializedDescriptor = serializedDescriptor;
    cachedToken = token;
    return token;
  }

  function verifyActivationTicket(encoded, expectedKind = 'voice') {
    const currentTime = now();
    pruneMap(consumedActivations, currentTime, 128);
    const ticket = decodeActivationTicket(encoded);
    if (!ticket || ticket.version !== BRIDGE_PROTOCOL_VERSION || ticket.kind !== expectedKind
      || !REQUEST_ID.test(String(ticket.instanceId || '')) || !ACTIVATION_NONCE.test(String(ticket.nonce || ''))
      || !Number.isFinite(Number(ticket.issuedAt)) || !Number.isFinite(Number(ticket.expiresAt))
      || Number(ticket.issuedAt) > currentTime + 1_000 || Number(ticket.expiresAt) < currentTime
      || Number(ticket.expiresAt) - Number(ticket.issuedAt) > ACTIVATION_TTL_MS
      || consumedActivations.has(ticket.nonce)) return false;
    let token;
    try { token = currentToken(); } catch { return false; }
    if (token.instanceId !== ticket.instanceId || !timingSafeText(ticket.mac, activationSignature(token.secret, ticket))) return false;
    consumedActivations.set(ticket.nonce, { expiresAt: Number(ticket.expiresAt) });
    return true;
  }

  function call(operation, payload = {}, requestId = crypto.randomUUID()) {
    if (closed) return Promise.reject(bridgeError('Bridge Presence chiuso.', 'PRESENCE_BRIDGE_CLOSED'));
    if (!REQUEST_ID.test(String(requestId || ''))) {
      return Promise.reject(bridgeError('RequestId Presence non valido.', 'PRESENCE_BRIDGE_REQUEST_ID_INVALID', 400));
    }
    let token;
    try { token = currentToken(); }
    catch (error) { return Promise.reject(error); }
    const request = {
      version: BRIDGE_PROTOCOL_VERSION,
      requestId,
      timestamp: now(),
      nonce: crypto.randomBytes(32).toString('base64url'),
      operation,
      payload
    };
    request.mac = requestSignature(token.secret, request);

    return new Promise((resolve, reject) => {
      let settled = false;
      let buffer = '';
      const socket = net.createConnection(paths.endpoint);
      sockets.add(socket);
      socket.setEncoding('utf8');
      const timer = setTimeout(() => complete(bridgeError('Shell Presence non risponde.', 'PRESENCE_BRIDGE_TIMEOUT')), Math.max(100, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));
      timer.unref?.();
      const complete = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        sockets.delete(socket);
        socket.destroy();
        if (error) reject(error);
        else resolve(value);
      };
      socket.once('connect', () => socket.write(`${JSON.stringify(request)}\n`));
      socket.on('data', (chunk) => {
        buffer += chunk;
        if (Buffer.byteLength(buffer, 'utf8') > MAX_FRAME_BYTES) {
          complete(bridgeError('Risposta Presence troppo grande.', 'PRESENCE_BRIDGE_FRAME_TOO_LARGE'));
          return;
        }
        const boundary = buffer.indexOf('\n');
        if (boundary < 0) return;
        let response;
        try { response = JSON.parse(buffer.slice(0, boundary)); }
        catch { complete(bridgeError('Risposta Presence non valida.', 'PRESENCE_BRIDGE_RESPONSE_INVALID')); return; }
        if (response?.version !== BRIDGE_PROTOCOL_VERSION
          || response.requestId !== requestId
          || response.serverInstanceId !== token.instanceId
          || !Number.isFinite(Number(response.timestamp))
          || Math.abs(now() - Number(response.timestamp)) > REQUEST_CLOCK_SKEW_MS
          || !timingSafeText(response.mac, responseSignature(token.secret, response))) {
          complete(bridgeError('Risposta Presence non autenticata.', 'PRESENCE_BRIDGE_RESPONSE_UNAUTHORIZED'));
          return;
        }
        if (!response.ok) {
          complete(bridgeError(
            String(response.error?.message || 'Operazione Presence rifiutata.'),
            String(response.error?.code || 'PRESENCE_BRIDGE_REJECTED'),
            400
          ));
          return;
        }
        complete(null, response.result);
      });
      socket.once('error', (error) => {
        logger.debug?.('Bridge Presence non disponibile.', { code: error?.code });
        complete(bridgeError('Shell Presence non disponibile.', 'PRESENCE_BRIDGE_OFFLINE'));
      });
      socket.once('end', () => {
        if (!settled) complete(bridgeError('Risposta Presence incompleta.', 'PRESENCE_BRIDGE_RESPONSE_INCOMPLETE'));
      });
      socket.once('close', () => {
        if (!settled) complete(bridgeError('Bridge Presence chiuso.', 'PRESENCE_BRIDGE_CLOSED'));
      });
    });
  }

  return {
    status: () => call('status'),
    sync: (snapshot) => call('sync', normalizePresenceSync(snapshot)),
    verifyActivationTicket,
    execute: async (command) => {
      const action = normalizePresenceAction(command);
      return await call('action', action, String(command?.requestId || crypto.randomUUID()));
    },
    close: () => {
      if (closed) return false;
      closed = true;
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      consumedActivations.clear();
      cachedSerializedDescriptor = null;
      cachedToken = null;
      return true;
    }
  };
}

// #endregion

module.exports = {
  BRIDGE_PROTOCOL_VERSION,
  bridgePaths,
  createLocalPresenceBridgeClient,
  createLocalPresenceBridgeServer,
  requestSignature,
  responseSignature,
  activationSignature,
  sanitizeStatus,
  normalizePresenceSync,
  stableJson
};
