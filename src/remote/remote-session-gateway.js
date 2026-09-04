/**
 * @module remote/remote-session-gateway
 * @description Gateway HTTP locale per riprendere sessioni NexusNXS da dispositivi associati.
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const { isIP } = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const parsePdf = require('pdf-parse');
const { SecurityEventStore } = require('../security/security-event-store');
const { PersistentQuotaStore, extractionRisk } = require('../security/abuse-guard');
const { profileSafetyLimit, resolveAccessProfile } = require('../security/access-profile-policy');
const { createActionReceipt } = require('../security/action-receipt');
const {
  DeviceIdentityChallengeStore,
  canonicalChallengePayload
} = require('../security/device-identity');
const {
  PRESENCE_PROTOCOL_VERSION,
  PRESENCE_ACTIONS,
  normalizeDesktopPresenceStatus,
  normalizePresenceAction,
  assertPresenceActionAuthorized,
  presenceActionChangesState,
  presencePostconditionSatisfied,
  presenceActionPreview
} = require('./desktop-presence-contract');
const { PersistentRequestLedger } = require('./persistent-request-ledger');
const { interactionClientContract } = require('../core/interaction-state-protocol');
const { createCapabilityManifest } = require('../core/capability-registry');
const { ToolBus } = require('../agents/tool-bus');
const { normalizeArtifacts } = require('../application/artifact-stream');
const { deviceGraph } = require('./device-graph');
const { enhancePublicAiHtml, publicAiCosmicCoreScript } = require('./public-demo');

const execFileAsync = promisify(execFile);

const DEFAULT_PORT = 32145;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PRIVATE_VOICE_BYTES = 512 * 1024;
const PRIVATE_VOICE_SAMPLE_RATE = 16_000;
const PRIVATE_VOICE_MAX_SECONDS = 12;
const PAIRING_TTL_MS = 5 * 60 * 1000;
const REQUEST_WINDOW_MS = 60 * 1000;
const REQUEST_LIMIT = 180;
const ADMIN_TICKET_TTL_MS = 60 * 1000;
const GUEST_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const GUEST_REQUEST_LIMIT = 24;
const GUEST_BOOTSTRAP_WINDOW_MS = 60 * 60 * 1000;
const MAX_QUEUED_GUEST_REQUESTS = 24;
const GUEST_QUEUE_TIMEOUT_MS = 90 * 1000;
const FAST_QUEUE_PRIORITY = 1;
const DEEP_QUEUE_PRIORITY = 0;
const DEEP_QUEUE_MAX_WAIT_MS = 12 * 1000;
const SESSION_ROTATION_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SESSION_ROTATION_GRACE_MS = 10 * 60 * 1000;
const READINESS_CACHE_TTL_MS = 2_000;
const READINESS_PROBE_TIMEOUT_MS = 1_000;
const STREAM_HEARTBEAT_MS = 10_000;
const GUEST_RECONNECT_GRACE_MS = 15_000;
const POWER_ACTION_DELAY_SECONDS = 15;
const MAX_ADMIN_TICKETS = 64;
const MAX_GUEST_SESSIONS = 5_000;
const MAX_RATE_LIMIT_BUCKETS = 5_000;
const MAX_PAIRING_BUCKETS = 2_000;
const MAX_PRIVATE_ACTION_TICKETS = 256;
const MAX_PRESENCE_TICKETS = 64;
const DEVICE_IDENTITY_ALGORITHMS = Object.freeze(['ed25519', 'ecdsa-p256-sha256']);
const SENSITIVE_DEVICE_PURPOSES = new Set([
  'action-plan', 'action-execute', 'power-plan', 'power-execute', 'presence-plan', 'presence-execute',
  'service-plan', 'service-execute',
  'workflow-create', 'workflow-next', 'workflow-decide', 'workflow-cancel', 'voice-transcribe'
]);

const AUTHENTICATED_ROUTE_LIMITS = Object.freeze([
  Object.freeze({ id: 'power', method: 'POST', pattern: /^\/api\/system\/power\/(?:plan|execute)$/, limit: 6 }),
  Object.freeze({ id: 'service', method: 'POST', pattern: /^\/api\/system\/service\/(?:plan|execute)$/, limit: 4 }),
  Object.freeze({ id: 'device-challenge', method: 'POST', pattern: /^\/api\/device\/challenge$/, limit: 30 }),
  Object.freeze({ id: 'action-plan', method: 'POST', pattern: /^\/api\/actions\/plan$/, limit: 12 }),
  Object.freeze({ id: 'action-execute', method: 'POST', pattern: /^\/api\/actions\/execute$/, limit: 24 }),
  Object.freeze({ id: 'workflow-write', method: 'POST', pattern: /^\/api\/workflows\/(?:create|[0-9a-f-]{36}\/(?:next|decide|cancel))$/i, limit: 24 }),
  Object.freeze({ id: 'presence-plan', method: 'POST', pattern: /^\/api\/presence\/plan$/, limit: 12 }),
  Object.freeze({ id: 'presence-execute', method: 'POST', pattern: /^\/api\/presence\/execute$/, limit: 24 }),
  Object.freeze({ id: 'voice-transcribe', method: 'POST', pattern: /^\/api\/voice\/transcribe$/, limit: 8 }),
  Object.freeze({ id: 'conversation-write', method: 'POST', pattern: /^\/api\/conversations(?:\/[^/]+\/messages)?$/, limit: 30 })
]);

function authenticatedRouteLimit(method, pathname) {
  return AUTHENTICATED_ROUTE_LIMITS.find((rule) => rule.method === method && rule.pattern.test(pathname)) || null;
}

function slidingWindowAllowed(buckets, key, { limit, windowMs, maximumBuckets = MAX_RATE_LIMIT_BUCKETS, now = Date.now() }) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  if (!buckets.has(key) && buckets.size >= maximumBuckets) {
    for (const [bucketKey, values] of buckets) {
      const active = values.filter((time) => now - time < windowMs);
      if (active.length) buckets.set(bucketKey, active.slice(-safeLimit));
      else buckets.delete(bucketKey);
    }
    if (buckets.size >= maximumBuckets) return false;
  }
  const recent = (buckets.get(key) || []).filter((time) => now - time < windowMs).slice(-safeLimit);
  if (recent.length >= safeLimit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}
let previousCpuTimes = null;

function runtimeGuestConcurrency(value = process.env.NEXUS_INFERENCE_CONCURRENCY || process.env.OLLAMA_NUM_PARALLEL || 1) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(8, parsed)) : 1;
}

function publicModelEntries(models) {
  const available = (Array.isArray(models) ? models : [])
    .some((model) => model?.capabilities?.chat !== false && model?.available !== false);
  if (!available) return [];
  // I client pubblici scelgono un profilo di risposta, non un artefatto della
  // workstation. Il router interno resta libero di selezionare il modello
  // migliore per qualita, latenza e carico senza rivelarne identita o taglia.
  return [
    { internalId: 'automatic', public: { id: 'nexus-fast', name: 'NexusNXS Rapido', mode: 'fast', available: true } },
    { internalId: 'automatic', public: { id: 'nexus-deep', name: 'NexusNXS Pro', mode: 'deep', available: true } }
  ];
}

function requestFailure(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function privateVoiceWaveInfo(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.length > MAX_PRIVATE_VOICE_BYTES
    || buffer.subarray(0, 4).toString('ascii') !== 'RIFF'
    || buffer.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw requestFailure('Registrazione WAV non valida.', 'VOICE_INVALID_AUDIO', 400);
  }
  let format = null; let dataBytes = 0; let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (size > buffer.length - start) throw requestFailure('Registrazione WAV incompleta.', 'VOICE_INVALID_AUDIO', 400);
    if (id === 'fmt ' && size >= 16) {
      format = {
        encoding: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4), bitsPerSample: buffer.readUInt16LE(start + 14)
      };
    } else if (id === 'data') dataBytes += size;
    offset = start + size + (size % 2);
  }
  if (!format || format.encoding !== 1 || format.channels !== 1
    || format.sampleRate !== PRIVATE_VOICE_SAMPLE_RATE || format.bitsPerSample !== 16 || dataBytes < 6_400) {
    throw requestFailure('La registrazione deve essere PCM mono a 16 kHz e 16 bit.', 'VOICE_FORMAT_UNSUPPORTED', 415);
  }
  const durationSeconds = dataBytes / (format.sampleRate * format.channels * (format.bitsPerSample / 8));
  if (durationSeconds > PRIVATE_VOICE_MAX_SECONDS + 0.1) {
    throw requestFailure('La registrazione supera la durata consentita.', 'VOICE_AUDIO_TOO_LONG', 413);
  }
  return { durationSeconds, dataBytes };
}

function operationIdentifier(value) {
  const candidate = String(value || '').trim().toLowerCase();
  if (!candidate) return crypto.randomUUID();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw requestFailure('Identificatore operazione non valido.', 'INVALID_OPERATION_ID');
  }
  return candidate;
}

async function guestAttachments(value) {
  if (!Array.isArray(value)) return { context: '', images: [] };
  const contexts = []; const images = [];
  for (const item of value.slice(0, 2)) {
    const name = path.basename(String(item?.name || 'allegato')).replace(/[\r\n]/g, ' ').slice(0, 120);
    const mime = String(item?.mime || 'application/octet-stream').toLowerCase().slice(0, 80);
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) throw new Error('Tipo allegato non valido.');
    const encoded = String(item?.data || '');
    if (!encoded || encoded.length > 2_050_000 || !/^[A-Za-z0-9+/]+=*$/.test(encoded)) throw new Error('Allegato non valido o troppo grande.');
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > 1_500_000) throw new Error('Allegato non valido o troppo grande.');
    if (mime.startsWith('image/')) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('Formato immagine non supportato.');
      images.push(encoded); contexts.push(`IMMAGINE: ${name}`); continue;
    }
    if (mime.startsWith('text/') || ['application/json', 'application/xml'].includes(mime)) {
      const text = bytes.toString('utf8').replace(/\u0000/g, '').trim().slice(0, 120_000);
      contexts.push(`FILE: ${name}\n${text}`); continue;
    }
    if (mime === 'application/pdf') {
      const extracted = await parsePdf(bytes, { max: 80 }).catch(() => null);
      const text = String(extracted?.text || '').replace(/\u0000/g, '').trim().slice(0, 120_000);
      contexts.push(text ? `PDF: ${name}\n${text}` : `PDF: ${name}\nTesto non estraibile; il documento potrebbe contenere soltanto immagini.`);
    }
    else throw new Error('Formato allegato non supportato.');
  }
  return { context: contexts.join('\n\n'), images };
}

function cpuUtilization() {
  const current = os.cpus().reduce((sum, cpu) => {
    const total = Object.values(cpu.times).reduce((value, time) => value + time, 0);
    return { total: sum.total + total, idle: sum.idle + cpu.times.idle };
  }, { total: 0, idle: 0 });
  if (!previousCpuTimes) {
    previousCpuTimes = current;
    return 0;
  }
  const totalDelta = current.total - previousCpuTimes.total;
  const idleDelta = current.idle - previousCpuTimes.idle;
  previousCpuTimes = current;
  return totalDelta > 0 ? Math.max(0, Math.min(100, Math.round((1 - idleDelta / totalDelta) * 100))) : 0;
}

async function systemSnapshot() {
  const total = os.totalmem();
  const free = os.freemem();
  const network = Object.values(os.networkInterfaces()).flat().filter((entry) => entry && !entry.internal && entry.family === 'IPv4');
  let gpus = [];
  let storage = [];
  let physicalDisks = [];
  let windows = {};
  let activity = { gpuPercent: 0, diskPercent: 0, networkBytesPerSecond: 0 };
  if (process.platform === 'win32') {
    try {
      const script = "$v=@(Get-ChildItem 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video' -Recurse -ErrorAction SilentlyContinue|Where-Object {$_.PSChildName -eq '0000'}|ForEach-Object {$p=Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue;if($p.'HardwareInformation.AdapterString'){$n=if($p.'HardwareInformation.AdapterString' -is [byte[]]){[Text.Encoding]::Unicode.GetString($p.'HardwareInformation.AdapterString')}else{[string]$p.'HardwareInformation.AdapterString'};[pscustomobject]@{Name=($n -replace '[\\x00\\uFFFD]','');Memory=[long]$p.'HardwareInformation.qwMemorySize'}}});$g=@(Get-CimInstance Win32_VideoController|Where-Object {$_.Name -notmatch 'Remote|Basic'}|ForEach-Object {$gpu=$_;$m=$v|Where-Object {$_.Name -eq $gpu.Name}|Select-Object -First 1;[pscustomobject]@{Name=$gpu.Name;AdapterRAM=if($m){$m.Memory}else{$gpu.AdapterRAM};DriverVersion=$gpu.DriverVersion}});$d=@(Get-CimInstance Win32_LogicalDisk|Where-Object {$_.DriveType -eq 3}|Select-Object DeviceID,Size,FreeSpace);$pd=@(Get-PhysicalDisk -ErrorAction SilentlyContinue|ForEach-Object {$disk=$_;$temp=$null;try{$temp=($disk|Get-StorageReliabilityCounter -ErrorAction Stop).Temperature}catch{};[pscustomobject]@{Name=$disk.FriendlyName;MediaType=[string]$disk.MediaType;HealthStatus=[string]$disk.HealthStatus;OperationalStatus=[string]($disk.OperationalStatus -join ', ');Size=[long]$disk.Size;Temperature=if($temp){[int]$temp}else{$null}}});$o=Get-CimInstance Win32_OperatingSystem|Select-Object Caption,Version,BuildNumber;$du=(Get-CimInstance Win32_PerfFormattedData_PerfDisk_PhysicalDisk -ErrorAction SilentlyContinue|Where-Object {$_.Name -eq '_Total'}|Select-Object -First 1).PercentDiskTime;$nu=(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface -ErrorAction SilentlyContinue|Measure-Object BytesTotalPersec -Sum).Sum;$gu=(Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction SilentlyContinue|Measure-Object UtilizationPercentage -Sum).Sum;@{gpus=$g;storage=$d;physicalDisks=$pd;windows=$o;activity=@{gpuPercent=[math]::Min(100,[int]$gu);diskPercent=[math]::Min(100,[int]$du);networkBytesPerSecond=[long]$nu}}|ConvertTo-Json -Compress -Depth 5";
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 10_000, maxBuffer: 128 * 1024 });
      const value = JSON.parse(stdout || '{}');
      gpus = (Array.isArray(value?.gpus) ? value.gpus : value?.gpus ? [value.gpus] : []).map((item) => ({
        available: true,
        name: String(item.Name || 'GPU').slice(0, 100),
        memoryBytes: Number(item.AdapterRAM || 0),
        driverVersion: String(item.DriverVersion || '').slice(0, 40)
      }));
      storage = (Array.isArray(value?.storage) ? value.storage : value?.storage ? [value.storage] : []).map((item) => ({
        name: String(item.DeviceID || '').slice(0, 8),
        totalBytes: Number(item.Size || 0),
        freeBytes: Number(item.FreeSpace || 0)
      }));
      physicalDisks = (Array.isArray(value?.physicalDisks) ? value.physicalDisks : value?.physicalDisks ? [value.physicalDisks] : []).map((item) => ({
        name: String(item.Name || 'Unità').slice(0, 100),
        mediaType: String(item.MediaType || '').slice(0, 30),
        health: String(item.HealthStatus || 'Unknown').slice(0, 30),
        operationalStatus: String(item.OperationalStatus || '').slice(0, 50),
        sizeBytes: Number(item.Size || 0),
        temperatureCelsius: item.Temperature === null || item.Temperature === undefined || Number(item.Temperature) <= 0
          ? null
          : Number(item.Temperature)
      }));
      windows = {
        caption: String(value?.windows?.Caption || '').replace(/^Microsoft\s+/i, '').slice(0, 80),
        version: String(value?.windows?.Version || '').slice(0, 32),
        build: String(value?.windows?.BuildNumber || '').slice(0, 20)
      };
      activity = {
        gpuPercent: Number(value?.activity?.gpuPercent || 0),
        diskPercent: Number(value?.activity?.diskPercent || 0),
        networkBytesPerSecond: Number(value?.activity?.networkBytesPerSecond || 0)
      };
    } catch { /* Telemetry remains useful even when WMI is unavailable. */ }
  }
  const gpu = gpus[0] || { available: false };
  return {
    displayName: os.hostname(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    windows,
    uptimeSeconds: Math.floor(os.uptime()),
    cpu: { model: os.cpus()[0]?.model?.trim() || 'CPU', logicalCores: os.cpus().length, speedMhz: os.cpus()[0]?.speed || 0, percent: cpuUtilization() },
    memory: { usedBytes: total - free, freeBytes: free, totalBytes: total, percent: total ? Math.round(((total - free) / total) * 100) : 0 },
    gpu,
    gpus,
    storage,
    physicalDisks,
    activity,
    network: { online: network.length > 0, interfaces: network.length, addresses: network.map((entry) => entry.address).slice(0, 4) },
    updatedAt: Date.now()
  };
}

async function windowsProcesses() {
  if (process.platform !== 'win32') return [];
  const script = "Get-Process | Sort-Object CPU -Descending | Select-Object -First 24 Id,ProcessName,CPU,WorkingSet64 | ConvertTo-Json -Compress";
  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000, maxBuffer: 512 * 1024 });
  const parsed = JSON.parse(stdout || '[]');
  return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({ id: item.Id, name: item.ProcessName, cpuSeconds: Math.round(Number(item.CPU || 0)), memoryBytes: Number(item.WorkingSet64 || 0) }));
}

async function executePowerAction(action) {
  if (process.platform !== 'win32') throw new Error('Comando di alimentazione disponibile soltanto su Windows.');
  const delay = String(POWER_ACTION_DELAY_SECONDS);
  const args = action === 'shutdown' ? ['/s', '/t', delay, '/c', 'Operazione autorizzata da NexusNXS Console'] : ['/r', '/t', delay, '/c', 'Operazione autorizzata da NexusNXS Console'];
  await execFileAsync('shutdown.exe', args, { windowsHide: true, timeout: 5000 });
  return { message: action === 'shutdown' ? 'Spegnimento programmato tra 15 secondi.' : 'Riavvio programmato tra 15 secondi.' };
}

// #region Stato, persistenza e sicurezza

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function sameHash(left, right) {
  const a = Buffer.from(String(left), 'hex');
  const b = Buffer.from(String(right), 'hex');
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function cleanDeviceName(value) {
  return String(value || 'Dispositivo remoto').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Dispositivo remoto';
}

function deviceIdentityFailure(message, code, status = 400) {
  return Object.assign(new Error(message), { code, status });
}

function decodeBase64Url(value, { name, minimumBytes = 1, maximumBytes = 4096 } = {}) {
  const encoded = String(value || '').trim();
  if (!encoded || encoded.length > maximumBytes * 2 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw deviceIdentityFailure(`${name || 'Il valore'} non e valido.`, 'DEVICE_IDENTITY_INVALID');
  }
  const bytes = Buffer.from(encoded, 'base64url');
  if (bytes.length < minimumBytes || bytes.length > maximumBytes || bytes.toString('base64url') !== encoded) {
    throw deviceIdentityFailure(`${name || 'Il valore'} non e valido.`, 'DEVICE_IDENTITY_INVALID');
  }
  return bytes;
}

function parseDeviceIdentityEnrollment(value, enrolledAt = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw deviceIdentityFailure('La chiave pubblica del dispositivo non e valida.', 'DEVICE_IDENTITY_INVALID');
  }
  const der = decodeBase64Url(value.publicKey, { name: 'La chiave pubblica', minimumBytes: 32, maximumBytes: 1024 });
  let publicKey;
  try { publicKey = crypto.createPublicKey({ key: der, format: 'der', type: 'spki' }); }
  catch { throw deviceIdentityFailure('La chiave pubblica del dispositivo non e valida.', 'DEVICE_IDENTITY_INVALID'); }
  let algorithm = '';
  if (publicKey.asymmetricKeyType === 'ed25519') algorithm = 'ed25519';
  else if (publicKey.asymmetricKeyType === 'ec' && ['prime256v1', 'secp256r1'].includes(publicKey.asymmetricKeyDetails?.namedCurve)) {
    algorithm = 'ecdsa-p256-sha256';
  }
  if (!algorithm || (value.algorithm && String(value.algorithm) !== algorithm)) {
    throw deviceIdentityFailure('Algoritmo della chiave dispositivo non supportato.', 'DEVICE_IDENTITY_ALGORITHM_UNSUPPORTED');
  }
  const canonicalDer = publicKey.export({ format: 'der', type: 'spki' });
  const keyId = crypto.createHash('sha256').update('nexusnxs-device-public-key-v1\0').update(canonicalDer).digest('hex');
  return {
    version: 1,
    algorithm,
    publicKey: canonicalDer.toString('base64url'),
    keyId,
    enrolledAt: Number(enrolledAt) > 0 ? Number(enrolledAt) : Date.now()
  };
}

function normalizeStoredDeviceIdentity(value) {
  if (!value) return undefined;
  try {
    const identity = parseDeviceIdentityEnrollment(value, value.enrolledAt);
    if (value.keyId && value.keyId !== identity.keyId) return undefined;
    return identity;
  } catch { return undefined; }
}

function verifyDevicePublicKeySignature(identity, payload, signature) {
  if (!identity || !Buffer.isBuffer(payload)) return false;
  let bytes;
  try { bytes = decodeBase64Url(signature, { name: 'La firma dispositivo', minimumBytes: 32, maximumBytes: 512 }); }
  catch { return false; }
  let publicKey;
  try {
    publicKey = crypto.createPublicKey({
      key: Buffer.from(identity.publicKey, 'base64url'),
      format: 'der',
      type: 'spki'
    });
    if (identity.algorithm === 'ed25519') return crypto.verify(null, payload, publicKey, bytes);
    if (identity.algorithm === 'ecdsa-p256-sha256') {
      if (crypto.verify('sha256', payload, publicKey, bytes)) return true;
      return crypto.verify('sha256', payload, { key: publicKey, dsaEncoding: 'ieee-p1363' }, bytes);
    }
  } catch { return false; }
  return false;
}

function legacyDeviceSubject(deviceId) {
  return crypto.createHash('sha256')
    .update('nexusnxs-legacy-device-subject-v1\0')
    .update(String(deviceId || ''))
    .digest('hex');
}

function deviceActionBinding(device, identity = null) {
  return identity
    ? { subjectId: identity.subjectId, keyFingerprint: identity.keyFingerprint, verified: true }
    : { subjectId: legacyDeviceSubject(device?.id), keyFingerprint: '', verified: false };
}

function privateAddresses(port, networkInterfaces = os.networkInterfaces()) {
  const lan = [];
  const fallbackLan = [];
  const mesh = [];
  const virtualAdapter = /(?:virtualbox|vbox|vmware|hyper-v|vethernet|wsl|docker|podman|nordlynx|wireguard|vpn|tunnel|loopback|\btun\d*\b|\btap\d*\b)/i;
  for (const [interfaceName, interfaces] of Object.entries(networkInterfaces)) {
    for (const entry of interfaces || []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      const url = `http://${entry.address}:${port}`;
      // Tailscale e diverse VPN mesh usano 100.64.0.0/10. Questi indirizzi
      // non sono pubblicamente instradabili e permettono di raggiungere NexusNXS
      // dall'estero senza aprire la porta sul router.
      if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(entry.address)) mesh.push(url);
      else if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) {
        // Gli adattatori host-only e i tunnel VPN espongono IP privati ma non
        // sono raggiungibili dal telefono sulla Wi-Fi di casa. Restano come
        // fallback soltanto se il sistema non espone una scheda fisica.
        (virtualAdapter.test(interfaceName) ? fallbackLan : lan).push(url);
      }
    }
  }
  return [...new Set([...mesh, ...lan, ...fallbackLan])];
}

function defaultState() {
  return { schemaVersion: 5, enabled: false, allowLan: false, port: DEFAULT_PORT, publicUrl: '', preferences: {}, devices: [] };
}

function normalizeSyncedPreferences(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const output = {};
  if (['auto', 'it', 'en', 'es', 'fr', 'de'].includes(input.language)) output.language = input.language;
  if (['fast', 'deep'].includes(input.responseMode)) output.responseMode = input.responseMode;
  if (['automatic', 'saturn', 'jarvis', 'neural'].includes(input.visualizer)) output.visualizer = input.visualizer;
  if (['system', 'dark'].includes(input.theme)) output.theme = input.theme;
  if (typeof input.voiceEnabled === 'boolean') output.voiceEnabled = input.voiceEnabled;
  return output;
}

function cleanPublicUrl(value, configuredUrl = process.env.NEXUS_PUBLIC_URL) {
  const text = String(value || '').trim().replace(/\/$/, '');
  try {
    const parsed = new URL(text);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return '';
    if (parsed.port && parsed.port !== '8443' && parsed.port !== '10000') return '';
    if (/^[a-z0-9.-]+\.ts\.net$/i.test(parsed.hostname)) return parsed.origin;
    const configured = configuredUrl ? new URL(String(configuredUrl).trim()) : null;
    return configured?.protocol === 'https:' && configured.hostname === parsed.hostname ? parsed.origin : '';
  } catch { return ''; }
}

function requestAddress(request, { trustedCloudflare = false } = {}) {
  const peer = String(request.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
  // Only the explicitly configured public loopback listener trusts cloudflared.
  // Never use forwarded headers to authorize private console access.
  if (trustedCloudflare && isLoopbackRequest(request)) {
    const visitor = request.headers?.['cf-connecting-ip'];
    if (typeof visitor === 'string' && isIP(visitor)) return visitor.replace(/^::ffff:/, '').toLowerCase();
  }
  return peer;
}

function isLoopbackRequest(request) {
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(String(request?.socket?.remoteAddress || ''));
}

function pseudonymousAccessId(address, secret) {
  const normalized = String(address || '').replace(/^::ffff:/, '').trim();
  if (!normalized) return '';
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex').slice(0, 12);
}

function isTailscalePeer(request) {
  const peer = String(request.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(peer);
}

function isTrustedConsoleBootstrap(request, publicIngress = false) {
  if (publicIngress) return false;
  const peer = String(request?.socket?.remoteAddress || '');
  const login = String(request?.headers?.['tailscale-user-login'] || '').trim();
  const host = String(request?.headers?.host || '').trim();
  const publicProxy = ['cf-ray', 'cf-connecting-ip', 'cf-visitor', 'cdn-loop']
    .some((header) => request?.headers?.[header] !== undefined);
  const trustedHost = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+ts\.net(?::\d{1,5})?$/i.test(host)
    || /^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/i.test(host)
    || /^\[::1\](?::\d{1,5})?$/.test(host);
  // Tailscale Serve injects an authenticated identity while proxying to the
  // loopback backend. Il dominio Serve e l'assenza di marcatori CDN evitano
  // che un tunnel pubblico configurato per errore sul listener privato possa
  // trasformare un header fornito dal client in un bootstrap Console.
  // Un direct mesh peer o un client loopback senza Serve deve usare pairing.
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(peer)
    && trustedHost
    && !publicProxy
    && login.length > 2
    && login.length <= 320
    && !/[\u0000-\u001f\u007f]/.test(login);
}

function readState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return {
      ...defaultState(),
      enabled: parsed.enabled === true,
      allowLan: parsed.allowLan === true,
      port: Number.isInteger(parsed.port) && parsed.port >= 1024 && parsed.port <= 65535 ? parsed.port : DEFAULT_PORT,
      publicUrl: cleanPublicUrl(parsed.publicUrl),
      preferences: normalizeSyncedPreferences(parsed.preferences),
      devices: Array.isArray(parsed.devices) ? parsed.devices
        .filter((device) => device?.id && /^[a-f0-9]{64}$/.test(device.tokenHash || ''))
        .map((device) => ({
          id: String(device.id).slice(0, 128),
          name: cleanDeviceName(device.name),
          // A display name is never an authorization signal. Legacy records
          // without an explicit scope migrate fail-closed to chat.
          scope: device.scope === 'remote' ? 'remote' : device.scope === 'console' ? 'console' : 'chat',
          tokenHash: device.tokenHash,
          createdAt: Number(device.createdAt || Date.now()),
          lastSeenAt: Number(device.lastSeenAt || device.createdAt || Date.now()),
          rotatedAt: Number(device.rotatedAt || device.createdAt || Date.now()),
          previousTokenHash: /^[a-f0-9]{64}$/.test(device.previousTokenHash || '') ? device.previousTokenHash : undefined,
          previousTokenExpiresAt: Number(device.previousTokenExpiresAt || 0),
          identity: normalizeStoredDeviceIdentity(device.identity)
        }))
        .slice(-20) : []
    };
  } catch { return defaultState(); }
}

// #endregion

// #region Client remoto incorporato

const PUBLIC_BRAND_ICON_PNG = fs.readFileSync(path.resolve(__dirname, '../../build/icon.png'));
const PUBLIC_AI_FONT_WOFF2 = fs.readFileSync(path.resolve(__dirname, './assets/inter-latin.woff2'));
const PUBLIC_AI_MANIFEST = JSON.stringify({
  id: '/',
  name: 'NexusNXS AI',
  short_name: 'NexusNXS AI',
  description: 'Assistente AI vocale, rapido e operativo.',
  lang: 'it',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  background_color: '#020607',
  theme_color: '#020607',
  icons: [{ src: '/nexus-icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' }]
});
const PUBLIC_AI_SERVICE_WORKER = `'use strict';
const CACHE='nexusnxs-ai-shell-v4';
const SHELL=['/','/manifest.webmanifest','/nexus-icon.png','/inter-latin.woff2'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const request=event.request,url=new URL(request.url);if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;if(request.mode==='navigate'){event.respondWith(fetch(request).then(async response=>{if(!response.ok)return(await caches.match('/'))||response;const type=response.headers.get('content-type')||'';if(type.includes('text/html'))caches.open(CACHE).then(cache=>cache.put('/',response.clone()));return response}).catch(async()=>await caches.match('/')||Response.error()));return}if(SHELL.includes(url.pathname))event.respondWith(caches.match(request).then(cached=>cached||fetch(request).then(response=>response.ok?response:Promise.reject(new Error('shell unavailable')))));});`;
const PUBLIC_AI_HTML_BASE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#020607"><meta name="description" content="NexusNXS AI, assistente rapido, vocale e operativo."><meta name="application-name" content="NexusNXS AI"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><link rel="manifest" href="/manifest.webmanifest"><link rel="preload" href="/inter-latin.woff2" as="font" type="font/woff2" crossorigin><link rel="icon" href="/nexus-icon.png" type="image/png" sizes="1024x1024"><link rel="apple-touch-icon" href="/nexus-icon.png"><title>NexusNXS AI</title><style>
@font-face{font-family:"NexusNXS Inter";src:url("/inter-latin.woff2") format("woff2");font-style:normal;font-weight:100 900;font-display:swap}:root{color-scheme:dark;font:15px "NexusNXS Inter",Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#020607;color:#dce8e8}*{box-sizing:border-box}html,body{min-height:100%;margin:0;background:#020607}body{min-height:100dvh;overflow-x:hidden;background:radial-gradient(circle at 50% 34%,rgba(48,177,179,.075),transparent 31%),linear-gradient(180deg,#020607,#030708)}button,textarea{font:inherit}.shell{position:relative;isolation:isolate;width:min(860px,100%);min-height:100dvh;margin:auto;padding:max(18px,env(safe-area-inset-top)) clamp(18px,5vw,44px) max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column}.ambient{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}.ambient i{position:absolute;width:3px;height:3px;border-radius:50%;background:#6de5df;opacity:.16;animation:drift var(--d) ease-in-out infinite alternate}.identity{display:flex;align-items:center;justify-content:space-between;min-height:44px;color:#82999a}.wordmark{font-size:.72rem;font-weight:700;letter-spacing:.23em;text-transform:uppercase}.state{display:flex;align-items:center;gap:.48rem;font-size:.7rem}.state:before{content:"";width:.38rem;height:.38rem;border-radius:50%;background:#5cdeb1;box-shadow:0 0 12px rgba(92,222,177,.52);animation:breathe 1.8s ease-in-out infinite}.stage{display:grid;place-items:center;align-content:center;flex:1;min-height:0;padding:clamp(22px,5vh,48px) 0 20px}.core{position:relative;width:clamp(132px,28vw,186px);aspect-ratio:1;display:grid;place-items:center;margin-bottom:clamp(26px,5vh,46px)}.ring{position:absolute;inset:8%;border:1px solid rgba(99,226,221,.22);border-radius:50%;box-shadow:inset 0 0 42px rgba(63,200,201,.08),0 0 48px rgba(32,161,164,.07);animation:spin 15s linear infinite}.ring:before,.ring:after{content:"";position:absolute;inset:-8%;border-radius:50%;border:1px dashed rgba(112,226,222,.15);animation:spin 11s linear infinite reverse}.ring:after{inset:15%;border-style:solid;border-color:rgba(126,240,235,.2);animation-duration:7s}.node{width:19%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 36% 30%,#e6ffff 0 5%,#6be2df 14%,#15969b 55%,rgba(6,40,42,.2) 72%);box-shadow:0 0 22px #4ce0dc,0 0 65px rgba(44,205,205,.34);animation:core 2.4s ease-in-out infinite}.copy{text-align:center;max-width:650px}h1{margin:0;color:#edf5f5;font-size:clamp(2rem,7.4vw,4.15rem);font-weight:410;letter-spacing:-.055em;line-height:.98}.gradient{color:#6edbd7}.lede{max-width:520px;margin:1.15rem auto 0;color:#718889;font-size:clamp(.94rem,2.2vw,1.05rem);line-height:1.65}.exchange{width:min(660px,100%);min-height:92px;margin:clamp(24px,5vh,46px) auto 0;display:grid;align-content:center}.prompt-copy{margin:0 0 12px;color:#8ba1a2;font-size:.78rem;text-align:right;animation:turn-up .28s cubic-bezier(.2,.8,.2,1)}.answer{margin:0;color:#d6e2e2;font-size:clamp(1rem,2.8vw,1.18rem);line-height:1.68;white-space:pre-wrap;overflow-wrap:anywhere}.answer.streaming:after{content:"";display:inline-block;width:.42rem;height:1.05em;margin-left:.2rem;border-radius:2px;background:#70dcd7;vertical-align:-.18em;animation:cursor .75s steps(2) infinite}.phase{min-height:18px;margin:0 0 10px;color:#679091;font:600 .67rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase}.phase:not(:empty):before{content:"";display:inline-block;width:1.35rem;height:.34rem;margin-right:.55rem;background:radial-gradient(circle,#61d9d4 1.4px,transparent 2px) 0 50%/6px 6px repeat-x;animation:flow .95s steps(3) infinite}.phase.error{color:#d78e8e}.composer{position:sticky;bottom:max(0px,env(safe-area-inset-bottom));display:grid;grid-template-columns:minmax(0,1fr) 48px;gap:9px;align-items:end;width:min(680px,100%);margin:auto;padding:16px 0 2px;background:linear-gradient(transparent,#020607 30%)}.composer-box{min-height:54px;border:1px solid rgba(126,203,204,.15);border-radius:22px;padding:14px 17px;background:rgba(10,23,24,.9);box-shadow:0 18px 48px rgba(0,0,0,.28);backdrop-filter:blur(18px)}textarea{display:block;width:100%;max-height:126px;min-height:24px;padding:0;border:0;outline:0;resize:none;color:#e6eeee;background:transparent;line-height:1.55}textarea::placeholder{color:#607879}.send{width:48px;height:48px;margin-bottom:3px;border:1px solid rgba(102,217,215,.17);border-radius:50%;color:#9be6e2;background:rgba(71,191,191,.14);cursor:pointer;transition:transform .16s ease,background .16s ease,opacity .16s ease}.send:hover,.send:focus-visible{background:rgba(71,191,191,.22);outline:0;transform:translateY(-1px)}.send:active{transform:scale(.96)}.send:disabled{opacity:.35;cursor:default}.privacy{margin:10px auto 0;color:#485c5d;font-size:.66rem;text-align:center}.privacy a{color:#678788;text-decoration:none}.privacy a:hover{text-decoration:underline}@keyframes breathe{50%{opacity:.42;transform:scale(.82)}}@keyframes spin{to{transform:rotate(1turn)}}@keyframes core{50%{transform:scale(.91);filter:brightness(1.18)}}@keyframes drift{to{transform:translate3d(var(--x),var(--y),0);opacity:.36}}@keyframes flow{50%{opacity:.34;transform:translateX(3px)}}@keyframes cursor{50%{opacity:0}}@keyframes turn-up{from{opacity:0;filter:blur(3px);transform:translateY(12px)}}@media(max-height:700px){.core{width:112px;margin-bottom:20px}.stage{padding-block:14px}.lede{margin-top:.75rem}.exchange{margin-top:18px}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
</style></head><body><div class="ambient" aria-hidden="true"><i style="left:8%;top:19%;--d:8s;--x:24px;--y:-19px"></i><i style="left:23%;top:72%;--d:11s;--x:-18px;--y:26px"></i><i style="left:78%;top:22%;--d:9s;--x:-28px;--y:18px"></i><i style="left:91%;top:64%;--d:12s;--x:-22px;--y:-30px"></i><i style="left:57%;top:9%;--d:10s;--x:16px;--y:23px"></i></div><main class="shell"><div class="identity"><span class="wordmark">NexusNXS</span><span class="state">Operativo</span></div><section class="stage"><div class="core" aria-hidden="true"><span class="ring"></span><span class="node"></span></div><div class="copy"><h1>Chiedi. <span class="gradient">NexusNXS agisce.</span></h1><p class="lede">Una sessione essenziale per provare risposte rapide, ragionamento guidato e continuità naturale.</p></div><div class="exchange" aria-live="polite"><p id="userPrompt" class="prompt-copy"></p><p id="phase" class="phase"></p><p id="answer" class="answer"></p></div></section><div class="composer"><div class="composer-box"><textarea id="prompt" rows="1" maxlength="12000" aria-label="Scrivi a NexusNXS" placeholder="Scrivi a NexusNXS…"></textarea></div><button id="send" class="send" type="button" aria-label="Invia">↑</button></div><p class="privacy">Nessun account. La sessione è temporanea e riparte pulita alla visita successiva. · <a href="https://nexusnxs.com/">Scopri NexusNXS</a></p></main><script>
const prompt=document.getElementById('prompt'),userPrompt=document.getElementById('userPrompt'),answer=document.getElementById('answer'),phase=document.getElementById('phase'),send=document.getElementById('send');let token='',busy=false;const installation=()=>{let id=sessionStorage.getItem('nxs.demo.id');if(!id){id=globalThis.crypto?.randomUUID?.()||('019fa53a-'+Date.now().toString(16)+'-'+Math.random().toString(16).slice(2));sessionStorage.setItem('nxs.demo.id',id)}return id};const setPhase=(value,error=false)=>{phase.textContent=value;phase.className=error?'phase error':'phase'};async function session(){if(token)return token;setPhase('Preparo la sessione…');const response=await fetch('/api/guest/bootstrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installationId:installation()})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Servizio momentaneamente non disponibile');token=data.token;return token}async function ask(){const text=prompt.value.trim();if(!text||busy)return;busy=true;send.disabled=true;userPrompt.textContent=text;answer.textContent='';answer.classList.add('streaming');prompt.value='';prompt.style.height='auto';setPhase('Comprendo la richiesta…');try{const credential=await session();const response=await fetch('/api/guest/messages/stream',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({text,history:[],model:'nexus-fast'})});if(!response.ok){const data=await response.json().catch(()=>({}));if(response.status===401)token='';throw new Error(data.error||'Servizio momentaneamente non disponibile')}if(!response.body)throw new Error('Streaming non disponibile');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});const lines=buffer.split('\\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;const frame=JSON.parse(line);if(frame.type==='phase')setPhase(frame.activity?.text||'NexusNXS sta lavorando…');if(frame.type==='token'){answer.textContent+=frame.token||'';answer.scrollIntoView({behavior:'smooth',block:'nearest'})}if(frame.type==='complete'&&!answer.textContent)answer.textContent=frame.message||'';if(frame.type==='error')throw new Error(frame.error||'Risposta non completata')}}setPhase('Risposta pronta');setTimeout(()=>{if(!busy)setPhase('')},1300)}catch(error){setPhase(error.message||'Servizio momentaneamente non disponibile',true)}finally{answer.classList.remove('streaming');busy=false;send.disabled=false;prompt.focus()}}send.addEventListener('click',ask);prompt.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();ask()}});prompt.addEventListener('input',()=>{prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,126)+'px'});</script></body></html>`;

const PUBLIC_AI_CORE_STYLE = `<style>
.core{position:relative;width:clamp(182px,35vw,252px);aspect-ratio:1;border:0;padding:0;color:inherit;background:transparent;cursor:pointer;isolation:isolate;transition:width .34s cubic-bezier(.2,0,0,1),margin .34s cubic-bezier(.2,0,0,1),filter .22s ease,transform .22s cubic-bezier(.2,0,0,1)}.core:focus-visible{outline:1px solid rgba(111,245,241,.72);outline-offset:11px;border-radius:50%}.core canvas{position:absolute;inset:-28%;width:156%;height:156%;filter:drop-shadow(0 0 23px rgba(75,231,233,.23));transition:filter .24s ease,opacity .24s ease}.core:hover{transform:scale(1.018)}.core:hover canvas{filter:drop-shadow(0 0 34px rgba(75,231,233,.34))}.core:active{transform:scale(.975)}.core-glyph{position:relative;z-index:2;width:13%;aspect-ratio:1;border:1px solid rgba(218,255,255,.62);border-radius:50%;background:radial-gradient(circle at 38% 32%,#efffff 0 8%,#8ff7f1 16%,#2cced0 46%,rgba(7,69,72,.16) 72%);box-shadow:0 0 11px rgba(169,255,252,.86),0 0 34px rgba(75,231,233,.62),0 0 88px rgba(44,205,205,.27);opacity:.96;animation:core-mystic-breathe 3.2s cubic-bezier(.4,0,.2,1) infinite}.core-glyph::before,.core-glyph::after{content:"";position:absolute;inset:-118%;border:1px solid rgba(111,239,236,.25);border-radius:50%;box-shadow:inset 0 0 26px rgba(77,224,223,.1),0 0 22px rgba(42,200,202,.1);animation:core-mystic-spin 17s linear infinite}.core-glyph::after{inset:-235%;border-style:dashed;border-color:rgba(111,239,236,.17);animation-duration:29s;animation-direction:reverse}.core-caption{position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);color:#668889;font:600 .58rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.15em;text-transform:uppercase;white-space:nowrap;transition:opacity .18s ease,transform .22s ease}.core[data-state=listening] .core-glyph{animation-duration:1.15s;box-shadow:0 0 13px rgba(210,255,240,.92),0 0 42px rgba(99,235,199,.72),0 0 100px rgba(69,218,182,.34)}.core[data-state=thinking] .core-glyph{animation-duration:.82s}.core[data-state=responding] .core-glyph,.core[data-state=speaking] .core-glyph{animation-duration:1.35s}.core[data-state=error] .core-glyph{animation-duration:.48s}.has-response .stage{align-content:start;padding-top:clamp(30px,6vh,60px)}.has-response .core{width:clamp(106px,19vw,138px);margin-bottom:18px}.has-response .core-caption{opacity:0;transform:translate(-50%,-3px)}.has-response .copy{max-height:0;margin:0;opacity:0;overflow:hidden;transform:translateY(-10px);transition:max-height .24s ease,opacity .18s ease,transform .24s ease}.copy{max-height:180px;transition:max-height .3s ease,opacity .24s ease,transform .3s cubic-bezier(.2,0,0,1)}.has-response .exchange{margin-top:14px}.exchange{transition:margin .3s cubic-bezier(.2,0,0,1)}@keyframes core-mystic-spin{to{transform:rotate(1turn)}}@keyframes core-mystic-breathe{0%,100%{transform:scale(.94);filter:brightness(.92)}50%{transform:scale(1.07);filter:brightness(1.18)}}@media(max-width:560px){.core{width:clamp(184px,52vw,232px)}}@media(prefers-reduced-motion:reduce){.core,.core canvas,.core-caption,.copy,.exchange{transition:none}.core-glyph,.core-glyph::before,.core-glyph::after{animation:none}}
</style>`;

const PUBLIC_AI_CSP_STYLE = `<style>
.ambient i:nth-child(1){left:8%;top:19%;--d:8s;--x:24px;--y:-19px}.ambient i:nth-child(2){left:23%;top:72%;--d:11s;--x:-18px;--y:26px}.ambient i:nth-child(3){left:78%;top:22%;--d:9s;--x:-28px;--y:18px}.ambient i:nth-child(4){left:91%;top:64%;--d:12s;--x:-22px;--y:-30px}.ambient i:nth-child(5){left:57%;top:9%;--d:10s;--x:16px;--y:23px}textarea{field-sizing:content}
</style>`;

const PUBLIC_AI_CORE_CONTRACT = interactionClientContract({ rgb: true });
const PUBLIC_AI_STATE_PALETTE = Object.freeze({
  ...Object.fromEntries(Object.entries(PUBLIC_AI_CORE_CONTRACT.states).map(([state, value]) => [state, value.color])),
  ready: PUBLIC_AI_CORE_CONTRACT.states.listening.color
});
const PUBLIC_AI_CORE_SCRIPT = publicAiCosmicCoreScript({
  palette: PUBLIC_AI_STATE_PALETTE,
  presentation: PUBLIC_AI_CORE_CONTRACT.presentation
});

const PUBLIC_AI_HTML = enhancePublicAiHtml({
  base: PUBLIC_AI_HTML_BASE,
  coreStyle: PUBLIC_AI_CORE_STYLE,
  coreScript: PUBLIC_AI_CORE_SCRIPT
})
  .replace('</head>', `${PUBLIC_AI_CSP_STYLE}</head>`)
  .replace(/ style="[^"]+"/g, '')
  .replaceAll("prompt.style.height='auto';", '')
  .replaceAll("prompt.style.height=Math.min(prompt.scrollHeight,126)+'px';", '');

const CLIENT_HTML_BASE = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#020607"><title>NexusNXS</title><style>
:root{color-scheme:dark;font:15px Inter,system-ui,-apple-system,sans-serif;background:#020607;color:#dce7e7}*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:radial-gradient(circle at 50% -15%,rgba(43,126,128,.12),transparent 38%),#020607}button,input,textarea{font:inherit}button{border:0;color:inherit;background:transparent;cursor:pointer}.app{width:min(760px,100%);min-height:100dvh;margin:auto;padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column}.top{display:grid;grid-template-columns:42px 1fr 42px;align-items:center;gap:8px;min-height:48px}.icon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;color:#9eb0b1;font-size:1.35rem}.icon:hover,.icon:focus-visible{background:rgba(112,186,188,.07);outline:0}.identity{min-width:0;text-align:center}.brand{color:#b9c8c8;font-size:.82rem;font-weight:620;letter-spacing:.02em}.connection{margin:.2rem 0 0;color:#637b7c;font-size:.68rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.connection:before{content:'';display:inline-block;width:.32rem;height:.32rem;margin-right:.38rem;border-radius:50%;background:#52d4cf;box-shadow:0 0 8px rgba(82,212,207,.45);vertical-align:.08rem}.connection[data-offline=true]:before{background:#4b5b5c;box-shadow:none}.workspace{align-self:center;margin:10px 0 0;padding:.42rem .7rem;border-radius:999px;background:rgba(112,176,178,.055);color:#6f898a;font-size:.7rem}.activity{position:sticky;z-index:8;top:max(12px,env(safe-area-inset-top));align-self:center;max-width:min(92%,560px);margin:10px auto 0;padding:.62rem .88rem;border:1px solid rgba(104,190,191,.12);border-radius:999px;background:rgba(8,20,21,.84);color:#a8bcbc;font-size:.72rem;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;box-shadow:0 12px 34px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.025);backdrop-filter:blur(18px);animation:activity-in .24s ease-out}.activity:before{content:'';display:inline-block;width:.4rem;height:.4rem;margin-right:.52rem;border-radius:50%;background:#55d7d2;box-shadow:0 0 10px rgba(85,215,210,.45);animation:pulse 1.3s ease-in-out infinite}.activity[data-phase=done]:before{animation:none;background:#78c9a9;box-shadow:0 0 8px rgba(120,201,169,.3)}.hero{padding:clamp(28px,7vh,64px) 4px 18px}.eyebrow{color:#527879;font:600 .65rem ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}h1{margin:.55rem 0 0;color:#e1eaea;font-size:clamp(1.65rem,6vw,2.45rem);font-weight:430;letter-spacing:-.04em;line-height:1.08}.pair{width:min(480px,100%);margin:auto;padding-top:5vh}.pair p{color:#718687;line-height:1.55}.pair-fields{display:grid;gap:10px;margin-top:24px}.field{width:100%;min-height:48px;border:1px solid rgba(123,184,186,.12);border-radius:14px;padding:0 14px;color:#e5eeee;background:rgba(12,27,28,.48);outline:0}.field:focus{border-color:rgba(85,212,211,.38)}.primary{min-height:48px;border-radius:14px;background:rgba(79,190,191,.14);color:#bfe8e7;font-weight:560}.chat{display:flex;min-height:0;flex:1;flex-direction:column}.list{display:grid;gap:3px}.item{width:100%;padding:14px 12px;border-radius:12px;text-align:left}.item:hover,.item:focus-visible{background:rgba(87,165,167,.055);outline:0}.item strong,.item small{display:block}.item strong{color:#cbd9d9;font-weight:520}.item p{margin:.35rem 0 0;color:#718485;font-size:.78rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.item small{margin-top:.38rem;color:#4d6566;font-size:.66rem}.conversation{display:flex;min-height:0;flex:1;flex-direction:column}.turns{min-height:0;flex:1;overflow:auto;display:grid;align-content:start;gap:26px;padding:10px 4px 132px;scrollbar-width:thin;scrollbar-color:#173536 transparent}.turn{max-width:92%;white-space:pre-wrap;line-height:1.65;overflow-wrap:anywhere}.turn:before{display:block;margin-bottom:.38rem;color:#477273;font:600 .62rem ui-monospace,monospace;letter-spacing:.1em}.turn.user{margin-left:auto;color:#e5eeee}.turn.user:before{content:'TU';text-align:right}.turn.assistant{color:#b9c9c9}.turn.assistant:before{content:'NEXUSNXS'}.composer{position:sticky;bottom:max(0px,env(safe-area-inset-bottom));display:grid;grid-template-columns:42px 1fr 44px;gap:8px;align-items:end;padding:10px 0 0;background:linear-gradient(transparent,#020607 28%)}.composer-box{min-height:50px;border:1px solid rgba(122,181,183,.13);border-radius:20px;padding:10px 13px;background:rgba(11,24,25,.96)}.composer textarea{display:block;width:100%;max-height:130px;border:0;resize:none;color:#e3ecec;background:transparent;line-height:1.4;outline:0}.mode{margin-top:.25rem;color:#587475;font-size:.65rem}.send{width:44px;height:44px;margin-bottom:3px;border-radius:50%;background:rgba(75,183,185,.14);color:#8ed5d4;font-size:1.1rem}.send:disabled{opacity:.35}.hidden{display:none!important}@keyframes pulse{50%{opacity:.4;transform:scale(.8)}}@keyframes activity-in{from{opacity:0;transform:translateY(-6px) scale(.98)}}@media(min-width:700px){.app{padding-inline:28px}.turns{padding-inline:18px}.composer{padding-inline:14px}.hero{padding-inline:14px}}@media(prefers-reduced-motion:reduce){.activity,.activity:before{animation:none}}</style></head><body><main class="app"><div class="top"><button id="back" class="icon hidden" aria-label="Torna alle conversazioni">←</button><div class="identity"><div class="brand">NexusNXS</div><p class="connection" id="status" aria-live="polite">Associa questo dispositivo</p></div><button id="newChat" class="icon hidden" aria-label="Nuova conversazione">＋</button></div><div id="workspace" class="workspace hidden">Connesso alla workstation</div><div id="activity" class="activity hidden" role="status" aria-live="polite">NexusNXS sta comprendendo la richiesta…</div><section class="hero"><div class="eyebrow" id="context">Continuità personale</div><h1 id="title">NexusNXS, ovunque tu sia.</h1></section><section id="pair" class="pair"><p>Inserisci il codice mostrato sul computer. Il collegamento resta privato e può essere revocato in qualsiasi momento.</p><div class="pair-fields"><input class="field" id="code" inputmode="numeric" maxlength="6" placeholder="Codice di collegamento"><input class="field" id="name" maxlength="80" placeholder="Nome di questo dispositivo"><button class="primary" id="pairButton">Collega dispositivo</button></div></section><section id="sessions" class="chat hidden"><div id="list" class="list"></div><div id="conversation" class="conversation hidden"><div id="turns" class="turns"></div><div class="composer"><button id="mode" class="icon" aria-label="Cambia profondità">≈</button><div class="composer-box"><textarea id="message" rows="1" maxlength="12000" placeholder="Scrivi a NexusNXS…"></textarea><div class="mode" id="modeLabel">Risposta rapida</div></div><button id="send" class="send" aria-label="Invia">↑</button></div></div></section></main><script>
const $=id=>document.getElementById(id);let token=localStorage.getItem('nexus.remote.token')||'',active='',retry,activityTimer,mode='fast';const setConnection=(text,offline=false)=>{$('status').textContent=text;$('status').dataset.offline=String(offline)};const setActivity=(text,phase='work')=>{clearTimeout(activityTimer);if(text){$('activity').textContent=text;$('activity').dataset.phase=phase;$('activity').classList.remove('hidden')}else $('activity').classList.add('hidden')};const completeActivity=()=>{setActivity('Risposta pronta','done');activityTimer=setTimeout(()=>setActivity(''),1600)};async function api(url,options={}){const headers={'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})};const r=await fetch(url,{...options,headers});const data=await r.json().catch(()=>({error:'Risposta non valida'}));if(!r.ok){const e=new Error(data.error||'Richiesta non riuscita');e.status=r.status;throw e}return data}function scheduleReconnect(){clearTimeout(retry);setConnection('Riconnessione automatica…',true);setActivity('Riconnessione sicura in corso…');retry=setTimeout(()=>token&&load(),4000)}function appendTurn(turn){const d=document.createElement('div');d.className='turn '+turn.role;d.textContent=turn.content;$('turns').append(d);$('turns').scrollTop=$('turns').scrollHeight}async function load(){try{const rows=await api('/api/conversations');clearTimeout(retry);$('pair').classList.add('hidden');$('sessions').classList.remove('hidden');$('workspace').classList.remove('hidden');$('newChat').classList.remove('hidden');setConnection('Workstation disponibile');setActivity('');$('title').textContent='Le tue conversazioni';$('context').textContent='Continua dal computer';$('list').innerHTML='';rows.forEach(row=>{const b=document.createElement('button');b.className='item';const strong=document.createElement('strong');strong.textContent=row.title||'Conversazione';const p=document.createElement('p');p.textContent=row.preview||'Apri la conversazione';const s=document.createElement('small');s.textContent=new Date(row.updatedAt).toLocaleString();b.append(strong,p,s);b.onclick=()=>openChat(row.id);$('list').append(b)})}catch(e){if(e.status===401){token='';localStorage.removeItem('nexus.remote.token');setConnection('Collegamento scaduto',true);$('pair').classList.remove('hidden')}else scheduleReconnect()}}async function openChat(id,{keepActivity=false}={}){try{const row=await api('/api/conversations/'+encodeURIComponent(id));active=id;localStorage.setItem('nexus.remote.active',id);$('title').textContent=row.title||'Conversazione';$('context').textContent='Stessa conversazione';$('list').classList.add('hidden');$('newChat').classList.remove('hidden');$('conversation').classList.remove('hidden');$('back').classList.remove('hidden');$('turns').innerHTML='';row.turns.forEach(appendTurn);setConnection('Sincronizzato con il computer');if(!keepActivity)setActivity('')}catch{scheduleReconnect()}}async function pairDevice(){try{setConnection('Collegamento in corso…');setActivity('Associazione sicura del dispositivo…');const r=await api('/api/pair',{method:'POST',body:JSON.stringify({code:$('code').value,deviceName:$('name').value||'Telefono'})});token=r.token;localStorage.setItem('nexus.remote.token',token);history.replaceState(null,'',location.pathname);await load()}catch(e){setActivity('');setConnection(e.message,true)}}$('message').value=localStorage.getItem('nexus.remote.draft')||'';$('message').oninput=()=>localStorage.setItem('nexus.remote.draft',$('message').value);$('message').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('send').click()}};$('pairButton').onclick=pairDevice;$('mode').onclick=()=>{mode=mode==='fast'?'deep':'fast';$('modeLabel').textContent=mode==='deep'?'Risposta approfondita':'Risposta rapida';$('mode').textContent=mode==='deep'?'✦':'≈'};$('newChat').onclick=async()=>{try{setActivity('Creo una nuova conversazione…');const row=await api('/api/conversations',{method:'POST',body:'{}'});await openChat(row.id)}catch{scheduleReconnect()}};$('send').onclick=async()=>{const text=$('message').value.trim();if(!text||!active)return;$('send').disabled=true;appendTurn({role:'user',content:text});$('message').value='';localStorage.removeItem('nexus.remote.draft');setActivity(mode==='deep'?'Analizzo, collego i dettagli e preparo la risposta…':'Comprendo la richiesta e preparo la risposta…');setConnection('NexusNXS è al lavoro');try{await api('/api/conversations/'+encodeURIComponent(active)+'/messages',{method:'POST',body:JSON.stringify({text,mode})});setActivity('Controllo gli ultimi dettagli…');await openChat(active,{keepActivity:true});completeActivity()}catch{scheduleReconnect()}finally{$('send').disabled=false}};$('back').onclick=()=>{active='';localStorage.removeItem('nexus.remote.active');$('conversation').classList.add('hidden');$('back').classList.add('hidden');$('list').classList.remove('hidden');load()};addEventListener('online',()=>token&&load());addEventListener('offline',scheduleReconnect);const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.get('pair')){$('code').value=fragment.get('pair');$('name').value=fragment.get('device')||'Telefono';pairDevice()}else if(token){const previous=localStorage.getItem('nexus.remote.active');previous?openChat(previous):load()}
</script></body></html>`;
const CLIENT_ACTIVITY_BRIDGE = `<script>
let nexusActivityPoll=null;
let nexusConversationPoll=null,nexusConversationBusy=false;
let nexusPushAbort=null,nexusPushRetry=null;
const rotateSessionIfDue=async()=>{const last=Number(localStorage.getItem('nexus.remote.rotatedAt')||0);if(!token||Date.now()-last<86400000)return;try{const result=await api('/api/session/rotate',{method:'POST',body:'{}'});if(result.token){token=result.token;localStorage.setItem('nexus.remote.token',token);localStorage.setItem('nexus.remote.rotatedAt',String(result.rotatedAt||Date.now()))}}catch{}};
const renderConnectionState=()=>{const node=$('status');if(!token)return;const offline=node.dataset.offline==='true';const clean=node.textContent.replace(/^(Online|Offline) · /,'');const next=(offline?'Offline':'Online')+' · '+clean;if(node.textContent!==next)node.textContent=next};
const connectionStateObserver=new MutationObserver(renderConnectionState);
connectionStateObserver.observe($('status'),{attributes:true,childList:true,subtree:true});
renderConnectionState();
const stopActivityTracking=()=>{clearInterval(nexusActivityPoll);nexusActivityPoll=null};
const refreshActivity=async()=>{if(!active||!token)return;try{const state=await api('/api/activity?conversation='+encodeURIComponent(active));if(state.text&&state.phase!=='idle')setActivity(state.text,state.phase)}catch{}};
const sendStateObserver=new MutationObserver(()=>{if($('send').disabled){stopActivityTracking();refreshActivity();nexusActivityPoll=setInterval(refreshActivity,650)}else stopActivityTracking()});
sendStateObserver.observe($('send'),{attributes:true,attributeFilter:['disabled']});
const renderSyncedConversation=async()=>{if(!active||!token||nexusConversationBusy)return;nexusConversationBusy=true;try{const row=await api('/api/conversations/'+encodeURIComponent(active));const nodes=[...$('turns').children];if(nodes.length>row.turns.length){$('turns').innerHTML='';row.turns.forEach(appendTurn);return}for(let index=0;index<row.turns.length;index++){const turn=row.turns[index],node=nodes[index];if(!node){appendTurn(turn);const incoming=$('turns').lastElementChild;if(incoming&&turn.role==='assistant')incoming.classList.add('arriving')}else if(node.textContent!==turn.content){node.textContent=turn.content;node.className='turn '+turn.role+' arriving'}}}catch{if(navigator.onLine)scheduleReconnect()}finally{nexusConversationBusy=false}};
const startConversationSync=()=>{clearInterval(nexusConversationPoll);nexusConversationPoll=setInterval(renderSyncedConversation,900)};
const activeObserver=new MutationObserver(()=>{if(!$('conversation').classList.contains('hidden')&&active)startConversationSync();else clearInterval(nexusConversationPoll)});
activeObserver.observe($('conversation'),{attributes:true,attributeFilter:['class']});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearInterval(nexusConversationPoll);else{rotateSessionIfDue();if(active){renderSyncedConversation();startConversationSync()}}});
const startRealtime=async()=>{clearTimeout(nexusPushRetry);if(!token)return;nexusPushAbort?.abort();nexusPushAbort=new AbortController();try{const response=await fetch('/api/events',{headers:{Authorization:'Bearer '+token},signal:nexusPushAbort.signal});if(!response.ok||!response.body)throw new Error('push unavailable');stopActivityTracking();const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const data=frame.split('\n').find(line=>line.startsWith('data:'))?.slice(5).trim();if(!data)continue;const event=JSON.parse(data);if(event.type==='activity'&&event.conversationId===active)setActivity(event.activity.text,event.activity.phase);if(event.type==='conversation'&&event.conversationId===active)renderSyncedConversation()}}}catch(error){if(error.name!=='AbortError'){nexusPushRetry=setTimeout(startRealtime,2500);if($('send').disabled&&!nexusActivityPoll)nexusActivityPoll=setInterval(refreshActivity,900)}}};
rotateSessionIfDue();startRealtime();
const nexusAppendTurn=appendTurn;
appendTurn=(turn)=>{nexusAppendTurn(turn);const node=$('turns').lastElementChild,index=$('turns').children.length-1;if(!node)return;const actions=document.createElement('span');actions.className='turn-actions';const steer=document.createElement('button');steer.type='button';steer.setAttribute('aria-label','Intervieni da questo punto');steer.onclick=async()=>{const text=prompt('Aggiungi una direzione da questo punto','');if(!text?.trim())return;setActivity('Riorganizzo la conversazione…');await api('/api/conversations/'+encodeURIComponent(active)+'/messages',{method:'POST',body:JSON.stringify({text:text.trim(),mode,afterTurnIndex:index})});await openChat(active,{keepActivity:true});completeActivity()};const remove=document.createElement('button');remove.type='button';remove.setAttribute('aria-label','Elimina da questo punto');remove.onclick=async()=>{if(!confirm('Eliminare questo passaggio e quelli successivi?'))return;await api('/api/conversations/'+encodeURIComponent(active)+'/turns/'+index,{method:'DELETE'});await openChat(active)};actions.append(steer,remove);node.append(actions)};
</script>`;
const CLIENT_HTML = CLIENT_HTML_BASE
  .replace('<input class="field" id="code"', '<button id="nexusNativeQr" class="secondary" type="button" onclick="globalThis.NexusAndroid?.scanQr()">Inquadra QR</button><input class="field" id="code"')
  .replace('</head>', '<style>html,body{max-width:100%;overflow-x:hidden}.top{position:sticky;z-index:20;top:0;padding:4px 0;background:linear-gradient(#020607 72%,transparent);backdrop-filter:blur(14px)}.top .icon.hidden{display:grid!important;visibility:hidden;pointer-events:none}#back{font-size:0;background:rgba(91,156,158,.055);border:1px solid rgba(120,190,192,.08);transition:background .18s ease,transform .18s ease,color .18s ease}#back:before{content:\'‹\';font-size:2rem;font-weight:260;line-height:1;transform:translateY(-1px)}#back:hover,#back:focus-visible{background:rgba(91,176,178,.12);color:#d7eeee;transform:translateX(-1px)}.connection{color:#789394}.connection[data-offline=true]{color:#657576}.connection:before{width:.38rem;height:.38rem;background:#58d5a7;box-shadow:0 0 9px rgba(88,213,167,.42)}.activity:not(.hidden):after{content:\'\';display:inline-block;width:1.1rem;height:.35rem;margin-left:.42rem;background:radial-gradient(circle,#71d8d4 1.5px,transparent 2px) 0 50%/6px 6px repeat-x;animation:activity-flow 1s steps(3) infinite}.activity[data-phase=done]:after,.activity[data-phase=error]:after{display:none}.turn.arriving{animation:turn-arrive .42s cubic-bezier(.2,.8,.2,1)}.pair{margin:0 auto;padding-top:clamp(12px,3vh,28px)}.list{width:100%;min-width:0;grid-template-columns:minmax(0,1fr)}.item{width:100%;min-width:0;overflow:hidden}.item>*{max-width:100%;overflow:hidden;text-overflow:ellipsis}@keyframes activity-flow{50%{opacity:.35;transform:translateX(2px)}}@keyframes turn-arrive{from{opacity:0;filter:blur(3px);transform:translateY(7px)}to{opacity:1;filter:blur(0);transform:none}}</style></head>')
  .replace('</head>', '<style>.secondary{min-height:44px;border-radius:13px;color:#789c9d}.secondary:active,.primary:active,.send:active,.icon:active{transform:scale(.98);filter:brightness(1.35);box-shadow:0 0 0 3px rgba(81,208,208,.07)}button{transition:transform .12s ease,filter .12s ease,background .12s ease}</style></head>')
  .replace('</head>', '<style>.turn{position:relative}.turn-actions{display:flex;gap:2px;margin-top:5px;opacity:.48}.turn.user .turn-actions{justify-content:flex-end}.turn-actions button{min-width:34px;height:26px;border-radius:8px;color:#78999a}.turn-actions button:first-child:before{content:\'↳\'}.turn-actions button:last-child:before{content:\'×\'}.turn-actions button:active{background:rgba(76,181,182,.12);color:#c7e9e8;transform:scale(.94)}</style></head>')
  .replace('</body>', `${CLIENT_ACTIVITY_BRIDGE}</body>`);

const CONSOLE_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#020607"><title>NexusNXS Console</title><style>
:root{color-scheme:dark;font:15px Inter,system-ui,-apple-system,sans-serif;background:#020607;color:#dce8e8}*{box-sizing:border-box}body{margin:0;min-height:100dvh;background:radial-gradient(circle at 50% -20%,rgba(31,115,117,.13),transparent 40%),#020607}.shell{width:min(780px,100%);min-height:100dvh;margin:auto;padding:max(18px,env(safe-area-inset-top)) 18px max(18px,env(safe-area-inset-bottom));display:flex;flex-direction:column}.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;padding:8px 0 16px;background:linear-gradient(#020607 72%,transparent)}.brand{font-weight:650;letter-spacing:.03em}.state{color:#718a8b;font-size:.72rem}.state:before{content:'';display:inline-block;width:.38rem;height:.38rem;margin-right:.4rem;border-radius:50%;background:#58d5a7;box-shadow:0 0 9px rgba(88,213,167,.4)}.state[data-offline=true]:before{background:#536364;box-shadow:none}.intro{padding:clamp(28px,8vh,68px) 2px 26px}.eyebrow{color:#527879;font:600 .65rem ui-monospace,monospace;letter-spacing:.15em;text-transform:uppercase}h1{margin:.55rem 0;color:#e3ecec;font-size:clamp(1.8rem,7vw,2.7rem);font-weight:420;letter-spacing:-.045em}.muted{color:#75898a;line-height:1.55}.pair{display:grid;gap:10px;margin:auto;width:min(470px,100%)}input,textarea,button{font:inherit}.field,.command{width:100%;border:1px solid rgba(120,184,186,.13);border-radius:16px;color:#e4eeee;background:rgba(10,25,26,.9);outline:0}.field{height:50px;padding:0 14px}.primary{height:50px;border:0;border-radius:16px;color:#bce9e7;background:rgba(74,184,185,.14)}.terminal{display:flex;min-height:0;flex:1;flex-direction:column}.feed{min-height:0;flex:1;overflow:auto;padding:4px 2px 126px}.entry{padding:14px 0;border-bottom:1px solid rgba(117,176,178,.065)}.entry small{display:block;margin-bottom:.45rem;color:#527879;font:600 .62rem ui-monospace,monospace;letter-spacing:.12em}.entry pre{margin:0;color:#b9caca;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.62 ui-monospace,SFMono-Regular,Consolas,monospace}.entry[data-phase=work] small:after{content:' ···';animation:pulse 1s steps(3) infinite}.proposal{margin-top:.75rem;padding:12px;border-radius:14px;background:rgba(74,151,153,.06);color:#9fb7b8}.actions{display:flex;gap:8px;margin-top:10px}.actions button{padding:.65rem .8rem;border:0;border-radius:12px;color:#aee0de;background:rgba(75,177,178,.12)}.composer{position:sticky;bottom:0;display:grid;grid-template-columns:1fr 46px;gap:8px;align-items:end;padding-top:26px;background:linear-gradient(transparent,#020607 28%)}.command{min-height:52px;max-height:140px;padding:14px;resize:none}.send{width:46px;height:46px;margin-bottom:3px;border:0;border-radius:50%;color:#9be0dd;background:rgba(75,183,185,.15)}.hidden{display:none!important}@keyframes pulse{50%{opacity:.35}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}</style></head><body><main class="shell"><header class="top"><span class="brand">NexusNXS Console</span><span id="state" class="state" data-offline="false">Workstation</span></header><section id="intro" class="intro"><div class="eyebrow">Sessione operativa</div><h1>Lavora sul tuo computer, ovunque.</h1><p class="muted">Ogni operazione viene prima preparata, mostrata e autorizzata. Nessuna shell viene esposta direttamente alla rete.</p></section><section id="pair" class="pair"><input id="code" class="field" inputmode="numeric" maxlength="6" placeholder="Codice di collegamento"><input id="name" class="field" maxlength="80" placeholder="Nome di questo dispositivo"><button id="pairButton" class="primary">Collega dispositivo</button></section><section id="terminal" class="terminal hidden"><div id="feed" class="feed"></div><div class="composer"><textarea id="command" class="command" rows="1" maxlength="4000" placeholder="Descrivi cosa deve fare NexusNXS…"></textarea><button id="send" class="send" aria-label="Prepara operazione">↑</button></div></section></main><script>
const $=id=>document.getElementById(id);let token=localStorage.getItem('nexus.remote.token')||'',pending=null;const state=(text,offline=false)=>{$('state').textContent=text;$('state').dataset.offline=String(offline)};async function api(url,options={}){const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})}});const data=await r.json().catch(()=>({error:'Risposta non valida'}));if(!r.ok)throw new Error(data.error||'Richiesta non riuscita');return data}function entry(label,text,phase='done'){const node=document.createElement('article');node.className='entry';node.dataset.phase=phase;const small=document.createElement('small');small.textContent=label;const pre=document.createElement('pre');pre.textContent=text;node.append(small,pre);$('feed').append(node);node.scrollIntoView({behavior:'smooth',block:'end'});return node}function ready(){state('Online');$('intro').classList.add('hidden');$('pair').classList.add('hidden');$('terminal').classList.remove('hidden')}$('pairButton').onclick=async()=>{try{state('Collegamento…');const result=await api('/api/pair',{method:'POST',body:JSON.stringify({code:$('code').value,deviceName:$('name').value||'Console mobile'})});token=result.token;localStorage.setItem('nexus.remote.token',token);ready()}catch(error){state(error.message,true)}};$('send').onclick=async()=>{const text=$('command').value.trim();if(!text||pending)return;$('command').value='';const work=entry('NEXUSNXS','Comprendo l’operazione e preparo un piano verificabile…','work');try{const result=await api('/api/actions/plan',{method:'POST',body:JSON.stringify({instruction:text})});work.remove();entry('TU',text);if(!result.proposal){entry('NEXUSNXS',result.message||'Serve una richiesta più precisa.');return}pending=result.proposal;const node=entry('PROPOSTA',pending.preview||pending.summary);const box=document.createElement('div');box.className='actions';const approve=document.createElement('button');approve.textContent='Autorizza';const cancel=document.createElement('button');cancel.textContent='Annulla';box.append(approve,cancel);node.append(box);cancel.onclick=()=>{pending=null;node.remove()};approve.onclick=async()=>{box.remove();node.dataset.phase='work';const proposal=pending;pending=null;try{const output=await api('/api/actions/execute',{method:'POST',body:JSON.stringify({ticketId:proposal.id,approved:true})});node.dataset.phase='done';entry('RISULTATO',[output.message,output.stdout,output.stderr].filter(Boolean).join('\\n\\n')||'Operazione completata.')}catch(error){node.dataset.phase='error';entry('ERRORE',error.message)}}}catch(error){work.dataset.phase='error';work.querySelector('pre').textContent=error.message;state('Riconnessione necessaria',true)}};$('command').onkeydown=event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();$('send').click()}};addEventListener('online',()=>{state('Online');if(token)ready()});addEventListener('offline',()=>state('Riconnessione…',true));const fragment=new URLSearchParams(location.hash.slice(1));if(fragment.get('pair')){$('code').value=fragment.get('pair');$('name').value='Console mobile';$('pairButton').click()}else if(token)ready();
</script></body></html>`;

const CONSOLE_STREAM_BRIDGE = `<script>
let nexusConsoleAbort=null,nexusConsoleRetry=null,nexusConsoleEntry=null;
function startConsoleStream(){clearTimeout(nexusConsoleRetry);if(!token)return;nexusConsoleAbort?.abort();nexusConsoleAbort=new AbortController();fetch('/api/events',{headers:{Authorization:'Bearer '+token},signal:nexusConsoleAbort.signal}).then(async response=>{if(!response.ok||!response.body)throw new Error('stream unavailable');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';for(;;){const part=await reader.read();if(part.done)break;buffer+=decoder.decode(part.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\\n\\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const raw=frame.split('\\n').find(line=>line.startsWith('data:'))?.slice(5).trim();if(!raw)continue;const event=JSON.parse(raw);if(event.type!=='console-output')continue;if(!nexusConsoleEntry||nexusConsoleEntry.dataset.operation!==event.operationId){nexusConsoleEntry=entry('OUTPUT','',event.phase);nexusConsoleEntry.dataset.operation=event.operationId}const pre=nexusConsoleEntry.querySelector('pre');if(event.stream==='status'&&pre.textContent)pre.textContent+='\\n';pre.textContent+=event.text;nexusConsoleEntry.dataset.phase=event.phase;nexusConsoleEntry.scrollIntoView({behavior:'smooth',block:'end'})}}}).catch(error=>{if(error.name!=='AbortError')nexusConsoleRetry=setTimeout(startConsoleStream,2500)})}
const nexusConsoleReady=ready;ready=()=>{nexusConsoleReady();startConsoleStream()};if(token)startConsoleStream();
</script>`;
const CONSOLE_STREAM_HTML = CONSOLE_HTML.replace('</body>', `${CONSOLE_STREAM_BRIDGE}</body>`);

// #endregion

// #region Gateway e API

class RemoteSessionGateway {
  constructor({ statePath, conversationStore, performanceStore = null, telemetry = null, communityFeedbackStore = null, securityEventStore = null, requestLedger = null, deviceChallengeStore = null, receiptSigner = null, logger = console, onMessage = null, onActionPlan = null, onActionExecute = null, onWorkflowCreate = null, onWorkflowNext = null, onWorkflowDecide = null, onWorkflowCancel = null, onWorkflowStatus = null, voiceTranscriber = null, voiceSynthesizer = null, imageGenerationService = null, modelProvider = null, readinessProvider = null, researchAvailable = false, researchCapabilityProvider = null, systemSnapshotProvider = systemSnapshot, processProvider = windowsProcesses, powerExecutor = executePowerAction, serviceControlExecutor = null, presenceStatusProvider = null, presenceActionExecutor = null, publicPort = 0, guestConcurrency, qaSecret = process.env.NEXUS_QA_SECRET, readinessProbeTimeoutMs = READINESS_PROBE_TIMEOUT_MS, streamHeartbeatMs = STREAM_HEARTBEAT_MS } = {}) {
    this.statePath = statePath;
    this.conversationStore = conversationStore;
    this.logger = logger;
    this.onMessage = onMessage;
    this.onActionPlan = onActionPlan;
    this.onActionExecute = onActionExecute;
    this.toolBus = new ToolBus({ audience: 'private' })
      .register({
        id: 'device-action-plan', risk: 'medium',
        invoke: (input) => {
          if (typeof this.onActionPlan !== 'function') throw Object.assign(new Error('Il controllo operativo non è pronto.'), { code: 'TOOL_UNAVAILABLE' });
          return this.onActionPlan(input);
        }
      })
      .register({
        id: 'device-action-execute', risk: 'critical', requiresConsent: true,
        invoke: (input) => {
          if (typeof this.onActionExecute !== 'function') throw Object.assign(new Error('Il controllo operativo non è pronto.'), { code: 'TOOL_UNAVAILABLE' });
          return this.onActionExecute(input);
        }
      });
    this.onWorkflowCreate = onWorkflowCreate;
    this.onWorkflowNext = onWorkflowNext;
    this.onWorkflowDecide = onWorkflowDecide;
    this.onWorkflowCancel = onWorkflowCancel;
    this.onWorkflowStatus = onWorkflowStatus;
    this.voiceTranscriber = typeof voiceTranscriber === 'function' ? voiceTranscriber : null;
    this.voiceSynthesizer = typeof voiceSynthesizer === 'function' ? voiceSynthesizer : null;
    this.imageGenerationService = imageGenerationService && typeof imageGenerationService.generate === 'function'
      ? imageGenerationService
      : null;
    this.modelProvider = modelProvider;
    this.readinessProvider = typeof readinessProvider === 'function' ? readinessProvider : null;
    this.researchAvailable = researchAvailable === true;
    this.researchCapabilityProvider = typeof researchCapabilityProvider === 'function' ? researchCapabilityProvider : null;
    this.performanceStore = performanceStore;
    this.telemetry = telemetry && typeof telemetry.emit === 'function' ? telemetry : null;
    this.communityFeedbackStore = communityFeedbackStore;
    this.systemSnapshotProvider = systemSnapshotProvider;
    this.processProvider = processProvider;
    this.powerExecutor = powerExecutor;
    this.serviceControlExecutor = typeof serviceControlExecutor === 'function' ? serviceControlExecutor : null;
    // Il Core conosce solo questo contratto. L'implementazione concreta puo
    // usare un bridge locale autenticato verso il processo --presence, ma non
    // viene importata qui e non puo ricevere comandi shell arbitrari.
    this.presenceStatusProvider = typeof presenceStatusProvider === 'function' ? presenceStatusProvider : null;
    this.presenceActionExecutor = typeof presenceActionExecutor === 'function' ? presenceActionExecutor : null;
    this.securityEvents = securityEventStore || new SecurityEventStore({ filePath: path.join(path.dirname(statePath), 'logs', 'security-audit.jsonl') });
    this.adminTickets = new Map();
    this.privateActionTickets = new Map();
    this.presenceTickets = new Map();
    this.receiptSigner = typeof receiptSigner === 'function' ? receiptSigner : null;
    this.remoteReceiptPath = path.join(path.dirname(statePath), 'logs', 'remote-action-receipts.jsonl');
    this.completedRemoteMessages = new Map();
    this.guestSessions = new Map();
    this.guestBootstrapBuckets = new Map();
    this.guestConcurrency = runtimeGuestConcurrency(guestConcurrency);
    this.guestQueueLimit = Math.min(MAX_QUEUED_GUEST_REQUESTS, this.guestConcurrency * 6);
    this.activeGuestRequests = 0;
    this.activeGuests = new Set();
    this.guestQueue = [];
    this.activeGuestExecutions = new Map();
    this.activeConsoleOperations = new Map();
    this.state = readState(statePath);
    this.deviceChallenges = deviceChallengeStore || new DeviceIdentityChallengeStore({
      verifySignature: ({ deviceId, keyId, payload, signature }) => {
        const device = this.state.devices.find((entry) => entry.id === deviceId);
        return Boolean(device?.identity?.keyId === keyId
          && verifyDevicePublicKeySignature(device.identity, payload, signature));
      }
    });
    this.server = null;
    this.publicServer = null;
    this.publicPort = Number.isInteger(Number(publicPort)) && Number(publicPort) >= 1024 && Number(publicPort) <= 65535
      ? Number(publicPort)
      : 0;
    this.qaSecret = String(qaSecret || '').length >= 32 ? String(qaSecret) : '';
    this.trustPublicCloudflare = process.env.NEXUS_TRUST_PUBLIC_CLOUDFLARE === '1';
    this.pairing = null;
    this.failedPairings = new Map();
    this.requestBuckets = new Map();
    this.persistentQuotas = new PersistentQuotaStore({ filePath: `${statePath}.quotas` });
    this.requestLedger = requestLedger || new PersistentRequestLedger({ filePath: `${statePath}.requests` });
    this.activities = new Map();
    this.eventStreams = new Set();
    this.telemetryStreams = new Set();
    this.telemetryCache = { expiresAt: 0, value: null };
    this.telemetryProbe = null;
    // Chiave soltanto in memoria: consente di correlare gli accessi nella
    // sessione corrente senza conservare o mostrare l'indirizzo originale.
    this.observabilitySecret = crypto.randomBytes(32);
    this.connections = new Set();
    this.stopping = false;
    this.disposed = false;
    this.lifecyclePromise = Promise.resolve();
    this.stopPromise = null;
    this.readinessCache = { expiresAt: 0, ready: false };
    this.readinessProbe = null;
    const requestedReadinessTimeout = Number(readinessProbeTimeoutMs);
    this.readinessProbeTimeoutMs = Number.isFinite(requestedReadinessTimeout)
      ? Math.max(25, Math.min(5_000, requestedReadinessTimeout))
      : READINESS_PROBE_TIMEOUT_MS;
    const requestedHeartbeat = Number(streamHeartbeatMs);
    this.streamHeartbeatMs = Number.isFinite(requestedHeartbeat)
      ? Math.max(25, Math.min(30_000, requestedHeartbeat))
      : STREAM_HEARTBEAT_MS;
  }

  lifecycle(operation) {
    const pending = this.lifecyclePromise.then(operation, operation);
    this.lifecyclePromise = pending.catch(() => {});
    return pending;
  }

  assertNotDisposed() {
    if (!this.disposed) return;
    throw Object.assign(new Error('Sessione remota arrestata definitivamente.'), { code: 'GATEWAY_DISPOSED' });
  }

  assertServing() {
    if (!this.disposed && !this.stopping) return;
    throw Object.assign(new Error('Servizio in arresto.'), { code: 'GATEWAY_STOPPED' });
  }

  guestCapacity() { return { active: this.activeGuestRequests, queued: this.guestQueue.length, concurrency: this.guestConcurrency, queueLimit: this.guestQueueLimit }; }

  invalidateReadiness() {
    this.readinessCache = { expiresAt: 0, ready: false };
  }

  notifyGuestQueue() {
    const now = Date.now();
    const ordered = [...this.guestQueue].sort((left, right) => {
      const leftOverdue = left.priority === DEEP_QUEUE_PRIORITY && now - left.queuedAt >= DEEP_QUEUE_MAX_WAIT_MS;
      const rightOverdue = right.priority === DEEP_QUEUE_PRIORITY && now - right.queuedAt >= DEEP_QUEUE_MAX_WAIT_MS;
      if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
      if (left.priority !== right.priority) return right.priority - left.priority;
      return left.queuedAt - right.queuedAt;
    });
    for (let index = 0; index < ordered.length; index += 1) {
      const entry = ordered[index];
      const position = index + 1;
      if (entry.lastPosition === position) continue;
      entry.lastPosition = position;
      try { entry.onQueued?.(position); } catch { /* il client può essersi disconnesso */ }
    }
  }

  nextGuestQueueIndex(now = Date.now()) {
    if (!this.guestQueue.length) return -1;
    // I turni rapidi non devono restare dietro a un ragionamento lungo, ma un
    // turno approfondito già in attesa ottiene precedenza dopo una soglia
    // breve. In questo modo la UI resta reattiva senza affamare il lavoro Pro.
    const overdueDeep = this.guestQueue.findIndex((entry) => entry.priority === DEEP_QUEUE_PRIORITY
      && now - entry.queuedAt >= DEEP_QUEUE_MAX_WAIT_MS);
    if (overdueDeep >= 0) return overdueDeep;
    const fast = this.guestQueue.findIndex((entry) => entry.priority === FAST_QUEUE_PRIORITY);
    return fast >= 0 ? fast : 0;
  }

  async isReady() {
    const now = Date.now();
    const canServe = typeof this.onMessage === 'function' && !this.stopping && !this.disposed;
    if (!canServe) {
      this.readinessCache = { expiresAt: now + READINESS_CACHE_TTL_MS, ready: false };
      return false;
    }
    if (this.readinessCache.expiresAt > now) return this.readinessCache.ready;
    if (!this.readinessProbe) {
      const probe = Promise.resolve()
        .then(() => this.readinessProvider ? this.readinessProvider() : true)
        .then(async (runtimeReady) => {
          const ready = runtimeReady === true || runtimeReady?.ready === true;
          if (!ready) return false;
          if (!this.modelProvider) return true;
          const models = await this.modelProvider();
          return Array.isArray(models) && models.some((model) => model?.capabilities?.chat !== false);
        })
        .catch(() => false);
      this.readinessProbe = probe;
      probe.then((ready) => {
        this.readinessCache = { expiresAt: Date.now() + READINESS_CACHE_TTL_MS, ready };
      }).finally(() => {
        if (this.readinessProbe === probe) this.readinessProbe = null;
      });
    }

    let timeout;
    const timedOut = new Promise((resolve) => {
      timeout = setTimeout(() => resolve(false), this.readinessProbeTimeoutMs);
      timeout.unref?.();
    });
    const ready = await Promise.race([this.readinessProbe, timedOut]);
    clearTimeout(timeout);
    if (!ready && this.readinessProbe) {
      // Il probe sottostante resta singleflight: le richieste successive non
      // ne accumulano altri mentre il provider e ancora bloccato.
      this.readinessCache = { expiresAt: Date.now() + Math.min(250, READINESS_CACHE_TTL_MS), ready: false };
    }
    return ready;
  }

  async resolvePublicModel(value) {
    const requested = String(value || 'automatic');
    if (requested === 'automatic' || !this.modelProvider) return requested;
    try {
      const entry = publicModelEntries(await this.modelProvider()).find((candidate) => candidate.public.id === requested);
      return entry?.internalId || 'automatic';
    } catch {
      return 'automatic';
    }
  }

  guestRelease(guest) {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      guest.inFlight = false;
      this.activeGuests.delete(guest);
      this.activeGuestRequests = Math.max(0, this.activeGuestRequests - 1);
      const nextIndex = this.nextGuestQueueIndex();
      const next = nextIndex >= 0 ? this.guestQueue.splice(nextIndex, 1)[0] : null;
      this.notifyGuestQueue();
      if (!next) return;
      clearTimeout(next.timer);
      next.signal?.removeEventListener('abort', next.onAbort);
      this.activeGuestRequests += 1;
      this.activeGuests.add(next.guest);
      next.resolve(this.guestRelease(next.guest));
    };
  }

  acquireGuestSlot(guest, onQueued = null, signal = null, priority = DEEP_QUEUE_PRIORITY) {
    if (this.disposed || this.stopping) {
      return Promise.reject(Object.assign(new Error('Servizio in arresto.'), { code: 'GUEST_STOPPED' }));
    }
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Richiesta annullata.'), { name: 'AbortError', code: 'ABORT_ERR' }));
    if (guest.inFlight) return Promise.reject(Object.assign(new Error('Una richiesta è già attiva per questa sessione.'), { code: 'GUEST_BUSY' }));
    guest.inFlight = true;
    if (this.activeGuestRequests < this.guestConcurrency) {
      this.activeGuestRequests += 1;
      this.activeGuests.add(guest);
      return Promise.resolve(this.guestRelease(guest));
    }
    if (this.guestQueue.length >= this.guestQueueLimit) {
      guest.inFlight = false;
      return Promise.reject(Object.assign(new Error('Il servizio è temporaneamente pieno.'), { code: 'GUEST_QUEUE_FULL' }));
    }
    return new Promise((resolve, reject) => {
      const entry = {
        guest, resolve, reject, timer: null, signal, onAbort: null,
        priority: priority === FAST_QUEUE_PRIORITY ? FAST_QUEUE_PRIORITY : DEEP_QUEUE_PRIORITY,
        queuedAt: Date.now(), onQueued, lastPosition: 0
      };
      entry.onAbort = () => {
        const index = this.guestQueue.indexOf(entry);
        if (index >= 0) this.guestQueue.splice(index, 1);
        this.notifyGuestQueue();
        clearTimeout(entry.timer);
        guest.inFlight = false;
        reject(Object.assign(new Error('Richiesta annullata.'), { name: 'AbortError', code: 'ABORT_ERR' }));
      };
      entry.timer = setTimeout(() => {
        const index = this.guestQueue.indexOf(entry);
        if (index >= 0) this.guestQueue.splice(index, 1);
        this.notifyGuestQueue();
        signal?.removeEventListener('abort', entry.onAbort);
        guest.inFlight = false;
        reject(Object.assign(new Error('Attesa troppo lunga.'), { code: 'GUEST_QUEUE_TIMEOUT' }));
      }, GUEST_QUEUE_TIMEOUT_MS);
      entry.timer.unref?.();
      signal?.addEventListener('abort', entry.onAbort, { once: true });
      this.guestQueue.push(entry);
      this.notifyGuestQueue();
    });
  }

  guestRequestIdentity(guest, body) {
    const clientMessageId = String(body.clientMessageId || '');
    if (clientMessageId && !/^[a-f0-9-]{20,80}$/i.test(clientMessageId)) {
      throw requestFailure('Identificativo messaggio non valido.', 'GUEST_INVALID_ID');
    }
    const text = String(body.text || '').trim();
    if (!text || text.length > 12_000) throw requestFailure('Messaggio non valido.', 'GUEST_INVALID_MESSAGE');
    const history = Array.isArray(body.history)
      ? body.history.slice(-24).map((turn) => ({ role: turn?.role === 'assistant' ? 'assistant' : 'user', content: String(turn?.content || '').slice(0, 4_000) }))
      : [];
    const mode = body.mode === 'deep' ? 'deep' : 'fast';
    const requestedModel = /^[a-z0-9._:/-]{1,128}$/i.test(String(body.model || '')) ? String(body.model) : 'automatic';
    const attachmentDigest = crypto.createHash('sha256').update(JSON.stringify(Array.isArray(body.attachments) ? body.attachments : [])).digest('hex');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ text, history, mode, requestedModel, attachmentDigest })).digest('hex');
    const logicalId = clientMessageId || crypto.randomUUID();
    const key = crypto.createHash('sha256').update(`${guest.installationHash}:${logicalId}`).digest('hex');
    return { key, fingerprint, clientMessageId, text, history, mode, requestedModel };
  }

  prepareGuestExecution(guest, body) {
    const descriptor = this.guestRequestIdentity(guest, body);
    const known = this.requestLedger.inspect(descriptor.key, descriptor.fingerprint);
    if (known.state === 'conflict') throw requestFailure('Identificativo già usato per una richiesta diversa.', 'GUEST_IDEMPOTENCY_CONFLICT', 409);
    if (known.state === 'complete' || known.state === 'interrupted') return { descriptor, state: known.state, entry: known.entry, execution: null };
    const active = this.activeGuestExecutions.get(descriptor.key);
    if (active) return { descriptor, state: 'running', entry: known.entry, execution: active };
    if (known.state === 'running') throw requestFailure('La richiesta è ancora in elaborazione.', 'GUEST_IN_FLIGHT', 409);
    if (!this.guestAllowed(`guest:${guest.id}`)) throw requestFailure('Troppe richieste. Attendi qualche secondo.', 'GUEST_RATE_LIMITED', 429);
    const risk = extractionRisk(descriptor.text);
    guest.extractionWarnings = Math.max(0, Number(guest.extractionWarnings || 0) + risk - (risk === 0 ? 1 : 0));
    if (risk >= 2 || guest.extractionWarnings >= 3) {
      this.securityEvents.append('knowledge.extraction.blocked', { severity: 'critical', detail: 'Pattern di estrazione progressiva', sessionId: guest.id });
      throw requestFailure('Questa richiesta non può accedere alla struttura interna del servizio.', 'GUEST_EXTRACTION_BLOCKED', 403);
    }
    const requestCost = descriptor.mode === 'deep' ? 4 : 2;
    if (!this.guestDailyAllowed(guest, 'message', requestCost, 240)) {
      throw requestFailure('Limite giornaliero raggiunto. Riprova più tardi.', 'GUEST_DAILY_LIMIT', 429);
    }
    this.requestLedger.begin(descriptor.key, descriptor.fingerprint);
    const execution = this.startGuestExecution(guest, body, descriptor);
    return { descriptor, state: 'started', entry: null, execution };
  }

  startGuestExecution(guest, body, descriptor) {
    const controller = new AbortController();
    const execution = {
      key: descriptor.key,
      controller,
      listeners: new Set(),
      subscribers: 0,
      settled: false,
      disconnectTimer: null,
      promise: null
    };
    execution.emit = (event) => {
      for (const listener of [...execution.listeners]) {
        try { listener(event); } catch { execution.listeners.delete(listener); }
      }
    };
    execution.promise = (async () => {
      const startedAt = Date.now();
      let release;
      try {
        release = await this.acquireGuestSlot(guest, (position) => {
          const activity = { text: `In attesa · posizione ${position}`, phase: 'queued', updatedAt: Date.now() };
          guest.activity = activity;
          execution.emit({ type: 'phase', activity });
        }, controller.signal, descriptor.mode === 'fast' ? FAST_QUEUE_PRIORITY : DEEP_QUEUE_PRIORITY);
        this.assertServing();
        const report = (message, phase = 'work') => {
          guest.activity = { text: String(message || '').slice(0, 160), phase, updatedAt: Date.now() };
          execution.emit({ type: 'phase', activity: guest.activity });
        };
        report('Comprendo la richiesta…');
        const attachments = await guestAttachments(body.attachments);
        this.assertServing();
        if (controller.signal.aborted) throw Object.assign(new Error('Richiesta annullata.'), { name: 'AbortError', code: 'ABORT_ERR' });
        const now = Date.now();
        const conversation = { id: `guest-${guest.id}`, title: 'Chat locale', createdAt: now, updatedAt: now, incomplete: false, turns: descriptor.history };
        const updated = await this.onMessage({
          conversation,
          text: descriptor.text,
          mode: descriptor.mode,
          requestedModel: await this.resolvePublicModel(descriptor.requestedModel),
          ephemeral: true,
          signal: controller.signal,
          report,
          onToken: (token) => {
            if (controller.signal.aborted) return;
            const text = String(token || '');
            const cursor = this.requestLedger.append(descriptor.key, text);
            if (text) execution.emit({ type: 'token', token: text, cursor });
          },
          attachments
        });
        const finalTurn = updated.turns.at(-1) || {};
        const artifacts = normalizeArtifacts(finalTurn.artifacts, { publicAudience: true });
        const result = {
          message: finalTurn.content || '',
          completedAt: updated.updatedAt,
          ...(artifacts.length ? { artifacts } : {})
        };
        this.requestLedger.complete(descriptor.key, result);
        report('Risposta pronta', 'done');
        execution.emit({ type: 'complete', ...result, cursor: result.message.length });
        this.telemetry?.emit({ name: 'guest.response', startedAt, endedAt: Date.now(), attributes: { component: 'gateway', operation: 'message', outcome: 'success', transport: 'ndjson', tier: descriptor.mode, artifactCount: artifacts.length } });
        return result;
      } catch (error) {
        this.requestLedger.fail(descriptor.key);
        this.logger?.warn?.('Risposta pubblica non completata.', {
          code: String(error?.code || 'UNEXPECTED_ERROR').slice(0, 80),
          name: String(error?.name || 'Error').slice(0, 80),
          detail: String(error?.message || 'Errore senza dettaglio.').slice(0, 240),
          mode: descriptor.mode
        });
        execution.emit({ type: 'error', error: error?.name === 'AbortError' || error?.code === 'ABORT_ERR' ? 'Richiesta annullata.' : 'La risposta non è stata completata.' });
        this.telemetry?.emit({ name: 'guest.response', startedAt, endedAt: Date.now(), attributes: { component: 'gateway', operation: 'message', outcome: error?.name === 'AbortError' ? 'cancelled' : 'failure', transport: 'ndjson', tier: descriptor.mode } });
        throw error;
      } finally {
        execution.settled = true;
        clearTimeout(execution.disconnectTimer);
        execution.disconnectTimer = null;
        release?.();
        this.activeGuestExecutions.delete(descriptor.key);
      }
    })();
    // Evita una rejection non osservata se il client sparisce nello stesso tick.
    execution.promise.catch(() => {});
    this.activeGuestExecutions.set(descriptor.key, execution);
    return execution;
  }

  subscribeGuestExecution(execution, response, listener = null) {
    clearTimeout(execution.disconnectTimer);
    execution.disconnectTimer = null;
    execution.subscribers += 1;
    if (listener) execution.listeners.add(listener);
    let active = true;
    const detach = () => {
      if (!active) return;
      active = false;
      if (listener) execution.listeners.delete(listener);
      execution.subscribers = Math.max(0, execution.subscribers - 1);
      if (!execution.settled && execution.subscribers === 0 && !execution.disconnectTimer) {
        execution.disconnectTimer = setTimeout(() => {
          execution.disconnectTimer = null;
          if (!execution.settled && execution.subscribers === 0) execution.controller.abort();
        }, GUEST_RECONNECT_GRACE_MS);
        execution.disconnectTimer.unref?.();
      }
    };
    const disconnected = () => { if (!response.writableEnded) detach(); };
    response.once('close', disconnected);
    return () => { response.off('close', disconnected); detach(); };
  }

  guestError(response, error) {
    if (response.destroyed || response.writableEnded) return;
    const status = Number(error?.status) || (['GUEST_QUEUE_FULL', 'GUEST_QUEUE_TIMEOUT', 'GUEST_BUSY', 'GUEST_RATE_LIMITED', 'GUEST_DAILY_LIMIT'].includes(error?.code) ? 429 : 400);
    return this.json(response, status, { error: error?.message || 'La richiesta non è valida.' });
  }

  deviceCapabilities(device) {
    const privateScope = this.hasScope(device, 'console');
    return {
      version: 1,
      scope: device?.scope || 'none',
      chat: this.hasScope(device, 'chat'),
      console: privateScope,
      deviceIdentity: {
        supported: privateScope,
        enrolled: Boolean(device?.identity),
        requiredForSensitiveActions: privateScope && Boolean(device?.identity),
        mode: device?.identity ? 'signed-challenge-v1' : privateScope ? 'legacy-token-bound' : 'not-applicable',
        upgradeRecommended: privateScope && !device?.identity,
        enrollment: 'private-pairing-only',
        publicKeyFormat: 'spki-base64url',
        algorithms: [...DEVICE_IDENTITY_ALGORITHMS],
        signatureFormats: ['der', 'ieee-p1363']
      },
      actionReceipts: {
        supported: privateScope,
        contents: 'metadata-only',
        integrity: this.receiptSigner ? 'signed-digest' : 'digest'
      },
      workflows: {
        supported: privateScope && [
          this.onWorkflowCreate, this.onWorkflowNext, this.onWorkflowDecide,
          this.onWorkflowCancel, this.onWorkflowStatus
        ].every((handler) => typeof handler === 'function'),
        maximumSteps: 8,
        consent: 'every-step',
        tickets: 'single-use-device-bound',
        receipts: 'metadata-only'
      },
      desktopPresence: {
        supported: privateScope && Boolean(this.presenceStatusProvider),
        mutations: privateScope && Boolean(this.presenceStatusProvider && this.presenceActionExecutor),
        protocolVersion: PRESENCE_PROTOCOL_VERSION,
        status: 'aggregate-v1',
        workflow: 'plan-approval-execute-receipt-v1',
        actions: privateScope && this.presenceStatusProvider && this.presenceActionExecutor
          ? [...PRESENCE_ACTIONS]
          : []
      }
    };
  }

  capabilityManifest({ publicIngress = false, device = null } = {}) {
    const privateScope = !publicIngress && this.hasScope(device, 'console');
    const workflowsAvailable = privateScope && [
      this.onWorkflowCreate, this.onWorkflowNext, this.onWorkflowDecide,
      this.onWorkflowCancel, this.onWorkflowStatus
    ].every((handler) => typeof handler === 'function');
    let researchCapability = this.researchAvailable ? 'available' : 'unavailable';
    try {
      if (this.researchCapabilityProvider) researchCapability = this.researchCapabilityProvider();
    } catch {
      researchCapability = 'unavailable';
    }
    return createCapabilityManifest({
      audience: publicIngress ? 'public' : 'private',
      features: {
        chat: Boolean(this.onMessage),
        attachments: true,
        'voice-input': this.voiceTranscriber ? 'available' : 'degraded',
        'voice-output': this.voiceSynthesizer ? 'available' : 'degraded',
        'web-research': researchCapability,
        'image-generation': Boolean(this.imageGenerationService?.available),
        artifacts: Boolean(this.onMessage),
        continuity: publicIngress ? 'degraded' : 'available',
        'device-actions': { state: privateScope && Boolean(this.onActionPlan && this.onActionExecute) ? 'available' : 'unavailable', requiresConsent: true },
        workflows: { state: workflowsAvailable ? 'available' : 'unavailable', requiresConsent: true },
        plugins: 'unavailable'
      }
    });
  }

  async desktopPresenceStatus(device) {
    if (!this.presenceStatusProvider) {
      return normalizeDesktopPresenceStatus({ available: false }, { mutationsAvailable: false });
    }
    const context = Object.freeze({
      version: PRESENCE_PROTOCOL_VERSION,
      device: Object.freeze({ id: String(device?.id || ''), scope: String(device?.scope || '') })
    });
    try {
      const value = await this.presenceStatusProvider(context);
      return normalizeDesktopPresenceStatus(value, {
        mutationsAvailable: Boolean(this.presenceActionExecutor)
      });
    } catch (error) {
      this.logger.warn?.('Presenza desktop non raggiungibile.', { error });
      return normalizeDesktopPresenceStatus({ available: false }, { mutationsAvailable: false });
    }
  }

  rememberPresenceTicket(request, device, identity) {
    const now = Date.now();
    for (const [ticketId, ticket] of this.presenceTickets) {
      if (ticket.expiresAt <= now) this.presenceTickets.delete(ticketId);
    }
    if (this.presenceTickets.size >= MAX_PRESENCE_TICKETS) {
      throw requestFailure('Troppe modifiche della presenza in attesa.', 'PRESENCE_TICKET_LIMIT', 429);
    }
    const binding = deviceActionBinding(device, identity);
    const ticket = Object.freeze({
      id: crypto.randomUUID(),
      action: request.action,
      displayId: request.displayId || '',
      applicationId: request.applicationId || '',
      deviceId: device.id,
      subjectId: binding.subjectId,
      keyFingerprint: binding.keyFingerprint,
      identityBound: binding.verified,
      createdAt: now,
      expiresAt: now + ADMIN_TICKET_TTL_MS
    });
    this.presenceTickets.set(ticket.id, ticket);
    return ticket;
  }

  consumePresenceTicket(ticketId, device, identity) {
    const id = String(ticketId || '').trim();
    const ticket = this.presenceTickets.get(id);
    this.presenceTickets.delete(id);
    const binding = deviceActionBinding(device, identity);
    if (!ticket || ticket.expiresAt <= Date.now()
      || ticket.deviceId !== device.id
      || ticket.subjectId !== binding.subjectId
      || ticket.keyFingerprint !== binding.keyFingerprint
      || ticket.identityBound !== binding.verified) {
      throw requestFailure('La modifica della presenza non appartiene a questo dispositivo o e scaduta.', 'PRESENCE_TICKET_IDENTITY_MISMATCH', 400);
    }
    return { ticket, binding };
  }

  async verifySensitiveDevice(device, purpose, proof) {
    if (!SENSITIVE_DEVICE_PURPOSES.has(purpose)) {
      throw deviceIdentityFailure('Scopo della prova dispositivo non consentito.', 'DEVICE_CHALLENGE_PURPOSE_INVALID');
    }
    if (!device?.identity) {
      // Migrazione compatibile: i dispositivi già associati conservano scope,
      // token, consenso esplicito e binding al device preesistenti. Soltanto un
      // device che si è iscritto con una chiave può entrare nel percorso forte;
      // per quel percorso una prova mancante o errata fallisce sempre chiusa.
      return null;
    }
    if (!proof || typeof proof !== 'object' || Array.isArray(proof)) {
      throw deviceIdentityFailure('Serve una prova firmata del dispositivo.', 'DEVICE_IDENTITY_PROOF_REQUIRED', 401);
    }
    try {
      const identity = await this.deviceChallenges.verify({
        challengeId: proof.challengeId,
        deviceId: device.id,
        keyId: device.identity.keyId,
        purpose,
        signature: proof.signature
      });
      this.securityEvents.append('device.identity.verified', {
        deviceId: device.id,
        deviceName: device.name,
        detail: purpose
      });
      return identity;
    } catch (error) {
      this.securityEvents.append('device.identity.denied', {
        severity: 'critical',
        deviceId: device.id,
        deviceName: device.name,
        detail: purpose
      });
      throw deviceIdentityFailure('La prova firmata del dispositivo non e valida o e scaduta.', error?.code || 'DEVICE_SIGNATURE_INVALID', 401);
    }
  }

  rememberPrivateActionTicket(proposal, device, identity) {
    const id = String(proposal?.id || '').trim();
    if (!id || id.length > 128) return;
    const now = Date.now();
    for (const [ticketId, ticket] of this.privateActionTickets) {
      if (ticket.expiresAt <= now) this.privateActionTickets.delete(ticketId);
    }
    if (this.privateActionTickets.size >= MAX_PRIVATE_ACTION_TICKETS) {
      throw requestFailure('Troppe proposte operative in attesa.', 'ACTION_TICKET_LIMIT', 429);
    }
    const proposalExpiry = Number(proposal.expiresAt);
    const binding = deviceActionBinding(device, identity);
    this.privateActionTickets.set(id, {
      deviceId: device.id,
      subjectId: binding.subjectId,
      keyFingerprint: binding.keyFingerprint,
      identityBound: binding.verified,
      expiresAt: Number.isFinite(proposalExpiry)
        ? Math.min(proposalExpiry, now + 5 * 60 * 1000)
        : now + 5 * 60 * 1000
    });
  }

  consumePrivateActionTicket(ticketId, device, identity) {
    const id = String(ticketId || '').trim();
    const ticket = this.privateActionTickets.get(id);
    this.privateActionTickets.delete(id);
    const binding = deviceActionBinding(device, identity);
    if (!ticket || ticket.expiresAt <= Date.now()
      || ticket.deviceId !== device.id
      || ticket.subjectId !== binding.subjectId
      || ticket.keyFingerprint !== binding.keyFingerprint
      || ticket.identityBound !== binding.verified) {
      throw requestFailure('La proposta non appartiene a questo dispositivo o non e piu valida.', 'ACTION_TICKET_IDENTITY_MISMATCH', 400);
    }
  }

  recordRemoteReceipt(input) {
    const receipt = createActionReceipt(input, { signer: this.receiptSigner });
    let persisted = true;
    try {
      fs.mkdirSync(path.dirname(this.remoteReceiptPath), { recursive: true });
      fs.appendFileSync(this.remoteReceiptPath, `${JSON.stringify(receipt)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      persisted = false;
      this.logger.warn?.('Ricevuta remota non persistita.', { error });
    }
    return { receipt, receiptPersisted: persisted };
  }

  persist() {
    fs.mkdirSync(path.dirname(this.statePath), { recursive: true });
    const temporary = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.state, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.copyFileSync(temporary, this.statePath);
    fs.chmodSync(this.statePath, 0o600);
    fs.rmSync(temporary, { force: true });
  }

  reportActivity(conversationId, text, phase = 'work') {
    const key = String(conversationId || '');
    if (!key) return;
    const activity = { text: String(text || '').slice(0, 160), phase, updatedAt: Date.now() };
    this.activities.set(key, activity);
    this.broadcast({ type: 'activity', conversationId: key, activity });
  }

  broadcast(event, audience = 'chat', deviceId = '') {
    const frame = `data: ${JSON.stringify(event)}\n\n`;
    for (const stream of [...this.eventStreams]) {
      if (!stream.scopes.has(audience)) continue;
      if (deviceId && stream.deviceId !== deviceId) continue;
      try { stream.response.write(frame); } catch { this.eventStreams.delete(stream); }
    }
  }

  async telemetrySnapshot() {
    const now = Date.now();
    if (this.telemetryCache.value && this.telemetryCache.expiresAt > now) return this.telemetryCache.value;
    if (this.telemetryProbe) return this.telemetryProbe;
    this.telemetryProbe = Promise.resolve().then(async () => {
      const value = {
        ...await this.systemSnapshotProvider(),
        nexusService: {
          status: 'online',
          uptimeSeconds: Math.round(process.uptime()),
          requests: this.guestCapacity(),
          anonymousSessions: this.guestSessions.size,
          connectedStreams: this.eventStreams.size + this.telemetryStreams.size
        },
        performance: this.performanceStore?.summary?.() || null
      };
      this.telemetryCache = { expiresAt: Date.now() + 1_000, value };
      return value;
    }).finally(() => { this.telemetryProbe = null; });
    return this.telemetryProbe;
  }

  openEventStream(request, response, scope, deviceId = '') {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Accel-Buffering': 'no'
    });
    response.write(`data: ${JSON.stringify({ type: 'ready', at: Date.now() })}\n\n`);
    const scopes = new Set(scope === 'remote' ? ['chat', 'console'] : [scope]);
    const stream = { response, scopes, deviceId, heartbeat: null };
    this.eventStreams.add(stream);
    const heartbeat = setInterval(() => response.write(': keepalive\n\n'), 20_000);
    stream.heartbeat = heartbeat;
    heartbeat.unref?.();
    request.once('close', () => {
      clearInterval(heartbeat);
      this.eventStreams.delete(stream);
    });
  }

  openTelemetryStream(request, response, deviceId) {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'Content-Security-Policy': "default-src 'none'",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-Accel-Buffering': 'no'
    });
    const stream = { response, deviceId, heartbeat: null, telemetry: null, inFlight: false };
    this.telemetryStreams.add(stream);
    const push = async () => {
      if (stream.inFlight || response.destroyed || response.writableEnded) return;
      stream.inFlight = true;
      try {
        const snapshot = await this.telemetrySnapshot();
        if (!response.destroyed && !response.writableEnded) {
          response.write(`data: ${JSON.stringify({ type: 'telemetry', snapshot })}\n\n`);
        }
      } catch (error) {
        this.logger.warn?.('Telemetria live non disponibile.', { error: error?.message || String(error) });
      } finally { stream.inFlight = false; }
    };
    void push();
    stream.telemetry = setInterval(push, 1_000);
    stream.telemetry.unref?.();
    stream.heartbeat = setInterval(() => response.write(': keepalive\n\n'), 20_000);
    stream.heartbeat.unref?.();
    request.once('close', () => {
      clearInterval(stream.heartbeat);
      clearInterval(stream.telemetry);
      this.telemetryStreams.delete(stream);
    });
  }

  status() {
    return {
      enabled: this.state.enabled,
      running: Boolean(this.server?.listening),
      publicRunning: Boolean(this.publicServer?.listening),
      publicPort: this.publicPort,
      allowLan: this.state.allowLan,
      port: this.state.port,
      localUrl: `http://127.0.0.1:${this.state.port}`,
      publicUrl: this.state.publicUrl || '',
      addresses: this.state.allowLan ? privateAddresses(this.state.port) : [],
      devices: this.state.devices.map(({ id, name, createdAt, lastSeenAt }) => ({ id, name, createdAt, lastSeenAt }))
    };
  }

  async configure({ enabled, allowLan = false, port = DEFAULT_PORT } = {}) {
    const nextPort = Number(port);
    if (!Number.isInteger(nextPort) || nextPort < 1024 || nextPort > 65535) throw new Error('Porta remota non valida.');
    return this.lifecycle(async () => {
      this.assertNotDisposed();
      await this.stopOwned({ final: false });
      this.assertNotDisposed();
      this.state.enabled = enabled === true;
      this.state.allowLan = allowLan === true;
      this.state.port = nextPort;
      this.persist();
      if (this.state.enabled) return this.startOwned();
      this.stopping = false;
      return this.status();
    });
  }

  setPublicUrl(url) {
    this.assertNotDisposed();
    this.state.publicUrl = cleanPublicUrl(url);
    this.persist();
    return this.status();
  }

  createPairingCode({ scope = 'chat' } = {}) {
    if (!this.server?.listening) throw new Error('Attiva prima la sessione remota.');
    const pairingScope = ['chat', 'console', 'remote'].includes(scope) ? scope : 'chat';
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    this.pairing = { hash: tokenHash(code), scope: pairingScope, expiresAt: Date.now() + PAIRING_TTL_MS };
    const bases = [
      ...(this.state.publicUrl ? [this.state.publicUrl] : []),
      ...(this.state.allowLan ? privateAddresses(this.state.port) : [`http://127.0.0.1:${this.state.port}`])
    ];
    return {
      code,
      scope: pairingScope,
      expiresAt: this.pairing.expiresAt,
      deviceIdentity: {
        supported: pairingScope !== 'chat',
        requiredForSensitiveActions: pairingScope !== 'chat',
        enrollment: 'pairing-only',
        publicKeyFormat: 'spki-base64url',
        algorithms: [...DEVICE_IDENTITY_ALGORITHMS]
      },
      urls: bases.map((base) => `${base}/#pair=${code}&device=Telefono`)
    };
  }

  revokeDevice(id) {
    const revoked = this.state.devices.find((device) => device.id === String(id));
    const before = this.state.devices.length;
    this.state.devices = this.state.devices.filter((device) => device.id !== String(id));
    if (before !== this.state.devices.length) {
      this.cancelConsoleOperationsForDevice(String(id), 'Sessione del dispositivo revocata.');
      for (const [ticketId, ticket] of this.presenceTickets) {
        if (ticket.deviceId === String(id)) this.presenceTickets.delete(ticketId);
      }
      this.persist();
      this.securityEvents.append('device.revoked', { severity: 'warning', deviceId: revoked?.id, deviceName: revoked?.name });
    }
    return this.status();
  }

  start() {
    return this.lifecycle(() => this.startOwned());
  }

  async startOwned() {
    this.assertNotDisposed();
    if (!this.state.enabled || this.server?.listening) return this.status();
    this.stopping = false;
    const host = this.state.allowLan ? '0.0.0.0' : '127.0.0.1';
    try {
      this.server = http.createServer((request, response) => this.handle(request, response));
      this.server.on('connection', (socket) => {
        this.connections.add(socket);
        socket.once('close', () => this.connections.delete(socket));
      });
      this.server.requestTimeout = 300_000;
      this.server.headersTimeout = 10_000;
      await new Promise((resolve, reject) => {
        this.server.once('error', reject);
        this.server.listen(this.state.port, host, () => { this.server.off('error', reject); resolve(); });
      });
      this.assertNotDisposed();
      if (this.publicPort && this.publicPort !== this.state.port) {
        this.publicServer = http.createServer((request, response) => this.handle(request, response, { publicIngress: true }));
        this.publicServer.on('connection', (socket) => {
          this.connections.add(socket);
          socket.once('close', () => this.connections.delete(socket));
        });
        this.publicServer.requestTimeout = 300_000;
        this.publicServer.headersTimeout = 10_000;
        await new Promise((resolve, reject) => {
          this.publicServer.once('error', reject);
          this.publicServer.listen(this.publicPort, '127.0.0.1', () => { this.publicServer.off('error', reject); resolve(); });
        });
        this.assertNotDisposed();
      }
    } catch (error) {
      await this.stopOwned({ final: this.disposed });
      throw error;
    }
    this.logger.info?.('Sessione remota NexusNXS disponibile.', { host, port: this.state.port });
    return this.status();
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    this.disposed = true;
    this.stopping = true;
    this.stopPromise = this.lifecycle(() => this.stopOwned({ final: true }));
    return this.stopPromise;
  }

  dispose() { return this.stop(); }

  async stopOwned({ final = this.disposed } = {}) {
    this.stopping = true;
    this.pairing = null;
    const server = this.server;
    const publicServer = this.publicServer;
    this.server = null;
    this.publicServer = null;
    for (const stream of this.eventStreams) {
      clearInterval(stream.heartbeat);
      try { stream.response.end(); } catch {}
    }
    this.eventStreams.clear();
    for (const stream of this.telemetryStreams) {
      clearInterval(stream.heartbeat);
      clearInterval(stream.telemetry);
      try { stream.response.end(); } catch {}
    }
    this.telemetryStreams.clear();
    this.telemetryCache = { expiresAt: 0, value: null };
    this.telemetryProbe = null;
    for (const queued of this.guestQueue.splice(0)) {
      clearTimeout(queued.timer);
      queued.signal?.removeEventListener('abort', queued.onAbort);
      queued.guest.inFlight = false;
      queued.reject(Object.assign(new Error('Servizio in arresto.'), { code: 'GUEST_STOPPED' }));
    }
    for (const execution of this.activeGuestExecutions.values()) execution.controller.abort();
    for (const operation of this.activeConsoleOperations.values()) {
      if (!operation.settled) operation.controller.abort(Object.assign(new Error('Servizio in arresto.'), { name: 'AbortError', code: 'ACTION_CANCELLED' }));
    }
    this.activeConsoleOperations.clear();
    this.adminTickets.clear();
    this.privateActionTickets.clear();
    this.presenceTickets.clear();
    for (const guest of this.activeGuests) guest.inFlight = false;
    this.activeGuests.clear();
    for (const guest of this.guestSessions.values()) guest.inFlight = false;
    this.activeGuestRequests = 0;
    const closeServer = (instance) => new Promise((resolve) => {
      if (!instance?.listening) { instance?.closeAllConnections?.(); resolve(); return; }
      instance.close(() => resolve());
      // close() da solo attende le richieste lunghe; alla chiusura esplicita
      // dell'app nessuna risposta remota deve proseguire in background.
      instance.closeAllConnections?.();
    });
    for (const socket of [...this.connections]) socket.destroy();
    this.connections.clear();
    await Promise.all([closeServer(server), closeServer(publicServer)]);
    this.requestLedger.close();
    if (!final && !this.disposed) this.stopping = false;
  }

  json(response, status, payload) {
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-DNS-Prefetch-Control': 'off',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY'
    });
    response.end(JSON.stringify(payload));
  }

  async body(request) {
    this.assertServing();
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      this.assertServing();
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new Error('Richiesta troppo grande.');
      chunks.push(chunk);
    }
    this.assertServing();
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
  }

  async rawBody(request, maximumBytes = MAX_BODY_BYTES) {
    this.assertServing();
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      this.assertServing();
      size += chunk.length;
      if (size > maximumBytes) throw requestFailure('Richiesta troppo grande.', 'REQUEST_TOO_LARGE', 413);
      chunks.push(chunk);
    }
    this.assertServing();
    return Buffer.concat(chunks);
  }

  authenticate(request) {
    const token = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;
    const hash = tokenHash(token);
    const now = Date.now();
    const device = this.state.devices.find((entry) => sameHash(entry.tokenHash, hash)
      || (entry.previousTokenExpiresAt > now && sameHash(entry.previousTokenHash, hash)));
    if (device) device.lastSeenAt = Date.now();
    return device || null;
  }

  rotateDeviceToken(device) {
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    device.previousTokenHash = device.tokenHash;
    device.previousTokenExpiresAt = now + SESSION_ROTATION_GRACE_MS;
    device.tokenHash = tokenHash(token);
    device.rotatedAt = now;
    this.persist();
    this.securityEvents.append('session.rotated', { deviceId: device.id, deviceName: device.name });
    return { token, rotatedAt: now, rotateAfter: now + SESSION_ROTATION_INTERVAL_MS };
  }

  hasScope(device, required) {
    return device?.scope === required || (device?.scope === 'remote' && ['chat', 'console'].includes(required));
  }

  cancelConsoleOperation(operationId, deviceId, reason = 'Annullamento richiesto dal dispositivo.') {
    const operation = this.activeConsoleOperations.get(String(operationId || ''));
    if (!operation || operation.deviceId !== String(deviceId || '') || operation.settled) return false;
    if (!operation.cancelRequestedAt) {
      operation.cancelRequestedAt = Date.now();
      operation.controller.abort(Object.assign(new Error(reason), { name: 'AbortError', code: 'ACTION_CANCELLED' }));
      this.securityEvents.append('action.cancel.requested', {
        severity: 'warning', deviceId: operation.deviceId, deviceName: operation.deviceName, detail: operation.operationId
      });
      this.broadcast({
        type: 'console-output', operationId: operation.operationId, phase: 'cancelling', stream: 'status', text: 'Annullamento richiesto.'
      }, 'console', operation.deviceId);
    }
    return true;
  }

  cancelConsoleOperationsForDevice(deviceId, reason) {
    let cancelled = 0;
    for (const operation of this.activeConsoleOperations.values()) {
      if (operation.deviceId === String(deviceId || '') && this.cancelConsoleOperation(operation.operationId, operation.deviceId, reason)) cancelled += 1;
    }
    return cancelled;
  }

  guestSession(request) {
    const token = String(request.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return null;
    const hash = tokenHash(token);
    const session = this.guestSessions.get(hash);
    if (!session || session.expiresAt < Date.now()) { if (session) this.guestSessions.delete(hash); return null; }
    return session;
  }

  guestAllowed(key, limit = GUEST_REQUEST_LIMIT, windowMs = REQUEST_WINDOW_MS) {
    return slidingWindowAllowed(this.guestBootstrapBuckets, key, { limit, windowMs });
  }

  guestDailyAllowed(guest, capability, cost, baseLimit) {
    if (guest?.qa === true) return true;
    const limit = profileSafetyLimit(guest?.accessProfile, baseLimit);
    return limit === null || this.persistentQuotas.allow(
      `${String(capability || 'request')}:${guest.installationHash}`,
      { cost, limit }
    );
  }

  pairingAllowed(address) {
    const now = Date.now();
    if (!this.failedPairings.has(address) && this.failedPairings.size >= MAX_PAIRING_BUCKETS) {
      for (const [key, values] of this.failedPairings) if (!values.some((time) => now - time < 60_000)) this.failedPairings.delete(key);
      if (this.failedPairings.size >= MAX_PAIRING_BUCKETS) return false;
    }
    const attempts = (this.failedPairings.get(address) || []).filter((time) => now - time < 60_000);
    this.failedPairings.set(address, attempts);
    return attempts.length < 5;
  }

  requestAllowed(key, limit = REQUEST_LIMIT, windowMs = REQUEST_WINDOW_MS) {
    return slidingWindowAllowed(this.requestBuckets, key, { limit, windowMs });
  }

  hasTrustedOrigin(request) {
    const origin = String(request.headers.origin || '');
    if (!origin) return true;
    try {
      const parsed = new URL(origin);
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === String(request.headers.host || '');
    } catch { return false; }
  }

  isQaRequest(request, publicIngress) {
    if (!publicIngress || !this.qaSecret) return false;
    const supplied = String(request.headers['x-nexus-qa-key'] || '');
    if (!supplied || supplied.length > 512) return false;
    const expectedHash = crypto.createHash('sha256').update(this.qaSecret).digest();
    const suppliedHash = crypto.createHash('sha256').update(supplied).digest();
    return crypto.timingSafeEqual(expectedHash, suppliedHash);
  }

  async handle(request, response, { publicIngress: forcedPublicIngress = false } = {}) {
    try {
      if (this.disposed || this.stopping) return this.json(response, 503, { error: 'Servizio in arresto.' });
      const url = new URL(request.url, 'http://nexus.local');
      const publicIngress = forcedPublicIngress;
      const isReadRequest = request.method === 'GET' || request.method === 'HEAD';
      const isHeadRequest = request.method === 'HEAD';
      if (!this.hasTrustedOrigin(request)) return this.json(response, 403, { error: 'Origine della richiesta non autorizzata.' });
      if (publicIngress && (url.pathname === '/console' || url.pathname.startsWith('/api/system/') || url.pathname.startsWith('/api/actions/') || url.pathname.startsWith('/api/workflows/') || url.pathname.startsWith('/api/security/') || url.pathname.startsWith('/api/device/') || url.pathname.startsWith('/api/presence/') || url.pathname.startsWith('/api/voice/'))) {
        return this.json(response, 404, { error: 'Risorsa non disponibile.' });
      }
      if (request.method === 'GET' && url.pathname === '/.well-known/assetlinks.json') {
        const fingerprints = ['C1:C2:C1:BD:C3:22:BD:BF:B2:B7:32:6F:BF:F6:4F:4E:5F:EB:E8:7D:3D:CA:1B:F8:0B:3E:88:66:E2:D2:78:C2'];
        const packages = publicIngress ? ['local.nexus.remote'] : ['local.nexus.remote', 'local.nexus.console'];
        return this.json(response, 200, packages.map((packageName) => ({ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints } })));
      }
      if (request.method === 'GET' && url.pathname === '/favicon.svg') {
        response.writeHead(308, {
          Location: '/nexus-icon.png',
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end();
        return;
      }
      if (request.method === 'GET' && ['/nexus-icon.png', '/favicon.ico'].includes(url.pathname)) {
        response.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': PUBLIC_BRAND_ICON_PNG.length,
          'Cache-Control': 'public, max-age=604800, immutable',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(PUBLIC_BRAND_ICON_PNG);
        return;
      }
      if (publicIngress && request.method === 'GET' && url.pathname === '/inter-latin.woff2') {
        response.writeHead(200, {
          'Content-Type': 'font/woff2',
          'Content-Length': PUBLIC_AI_FONT_WOFF2.length,
          'Cache-Control': 'public, max-age=604800, immutable',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(PUBLIC_AI_FONT_WOFF2);
        return;
      }
      if (publicIngress && request.method === 'GET' && url.pathname === '/manifest.webmanifest') {
        response.writeHead(200, {
          'Content-Type': 'application/manifest+json; charset=utf-8',
          'Content-Length': Buffer.byteLength(PUBLIC_AI_MANIFEST),
          'Cache-Control': 'public, max-age=3600',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(PUBLIC_AI_MANIFEST);
        return;
      }
      if (publicIngress && request.method === 'GET' && url.pathname === '/service-worker.js') {
        response.writeHead(200, {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Content-Length': Buffer.byteLength(PUBLIC_AI_SERVICE_WORKER),
          'Cache-Control': 'no-cache',
          'Service-Worker-Allowed': '/',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-Content-Type-Options': 'nosniff'
        });
        response.end(PUBLIC_AI_SERVICE_WORKER);
        return;
      }
      if (isReadRequest && ['/', '/console'].includes(url.pathname)) {
        const nonce = crypto.randomBytes(18).toString('base64');
        response.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; worker-src 'self'; style-src 'nonce-${nonce}'; style-src-attr 'none'; font-src 'self'; connect-src 'self'; img-src 'self' blob:; media-src 'self' blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`,
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Permissions-Policy': publicIngress && url.pathname === '/'
            ? 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()'
            : 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          'Referrer-Policy': 'no-referrer',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'X-DNS-Prefetch-Control': 'off',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        });
        const client = url.pathname === '/console'
          ? CONSOLE_STREAM_HTML
          : publicIngress ? PUBLIC_AI_HTML : CLIENT_HTML;
        response.end(isHeadRequest ? undefined : client
          .replace(/<style>/g, `<style nonce="${nonce}">`)
          .replace(/<script>/g, `<script nonce="${nonce}">`));
        return;
      }
      if (isReadRequest && url.pathname === '/livez') return this.json(response, 200, { status: 'alive' });
      if (isReadRequest && url.pathname === '/readyz') {
        const ready = await this.isReady();
        return this.json(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' });
      }
      // Endpoint storico mantenuto per Android e client desktop non ancora
      // aggiornati. Esprime soltanto liveness; i client nuovi usano /readyz.
      if (isReadRequest && url.pathname === '/healthz') return this.json(response, 200, { status: 'ok' });
      if (request.method === 'GET' && url.pathname === '/internal/observability') {
        if (publicIngress || !isLoopbackRequest(request)) return this.json(response, 404, { error: 'Risorsa non disponibile.' });
        const telemetry = await this.telemetrySnapshot();
        const security = this.securityEvents.summary({ devices: this.state.devices });
        const accesses = security.events
          .filter((event) => event.address)
          .slice(0, 24)
          .map((event) => ({
            at: event.at,
            event: event.type,
            severity: event.severity,
            client: pseudonymousAccessId(event.address, this.observabilitySecret)
          }));
        return this.json(response, 200, {
          generatedAt: Date.now(),
          requests: this.guestCapacity(),
          performance: telemetry.performance,
          system: {
            cpuPercent: telemetry.cpu?.percent ?? 0,
            memoryPercent: telemetry.memory?.percent ?? 0,
            gpuPercent: telemetry.activity?.gpuPercent ?? telemetry.gpuPercent ?? 0
          },
          security: {
            status: security.status,
            integrity: security.integrity,
            counts: security.counts,
            accesses
          }
        });
      }
      if (request.method === 'GET' && url.pathname === '/api/status') {
        return this.json(response, 200, publicIngress
          ? { product: 'NexusNXS', anonymousAvailable: true, imageGeneration: Boolean(this.imageGenerationService?.available) }
          : { product: 'NexusNXS', anonymousAvailable: true, pairingOptional: true, imageGeneration: Boolean(this.imageGenerationService?.available) });
      }
      if (publicIngress && request.method === 'GET' && url.pathname === '/api/capabilities') {
        return this.json(response, 200, this.capabilityManifest({ publicIngress }));
      }
      if (request.method === 'GET' && url.pathname === '/api/models') {
        const models = this.modelProvider ? await this.modelProvider() : [];
        return this.json(response, 200, { models: publicModelEntries(models).map((entry) => entry.public) });
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/bootstrap') {
        const address = requestAddress(request, { trustedCloudflare: publicIngress && this.trustPublicCloudflare });
        const qaRequest = this.isQaRequest(request, publicIngress);
        if (!qaRequest && !this.persistentQuotas.allow(`bootstrap:${address}`, { limit: 80 })) {
          this.securityEvents.append('guest.bootstrap.blocked', { severity: 'warning', address, detail: 'Quota giornaliera superata' });
          return this.json(response, 429, { error: 'Limite giornaliero raggiunto. Riprova più tardi.' });
        }
        if (!this.guestAllowed(`bootstrap:${address}`, 20, GUEST_BOOTSTRAP_WINDOW_MS)) {
          this.securityEvents.append('guest.bootstrap.blocked', { severity: 'warning', address, detail: 'Limite orario superato' });
          return this.json(response, 429, { error: 'Attendi prima di creare una nuova sessione.' });
        }
        const body = await this.body(request);
        const installationId = String(body.installationId || '');
        if (!/^[a-f0-9-]{20,80}$/i.test(installationId)) return this.json(response, 400, { error: 'Installazione non valida.' });
        const token = crypto.randomBytes(32).toString('base64url');
        const accessProfile = resolveAccessProfile({
          installationId,
          secret: process.env.NEXUS_ACCESS_PROFILE_SECRET,
          bindings: process.env.NEXUS_ACCESS_PROFILE_BINDINGS
        });
        const session = { id: crypto.randomUUID(), installationHash: tokenHash(installationId), accessProfile, qa: qaRequest, expiresAt: Date.now() + GUEST_TOKEN_TTL_MS, extractionWarnings: 0 };
        if (this.guestSessions.size >= MAX_GUEST_SESSIONS) {
          for (const [hash, candidate] of this.guestSessions) if (candidate.expiresAt < Date.now()) this.guestSessions.delete(hash);
        }
        if (this.guestSessions.size >= MAX_GUEST_SESSIONS) {
          this.securityEvents.append('guest.bootstrap.blocked', { severity: 'warning', address, detail: 'Capacità sessioni raggiunta' });
          return this.json(response, 429, { error: 'Capacità temporaneamente raggiunta. Riprova più tardi.' });
        }
        this.guestSessions.set(tokenHash(token), session);
        this.securityEvents.append('guest.session.created', { address });
        return this.json(response, 201, {
          token,
          expiresAt: session.expiresAt,
          mode: 'public-beta',
          capabilities: this.capabilityManifest({ publicIngress: true })
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/messages') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        if (!this.onMessage) return this.json(response, 503, { error: 'Il motore conversazionale non è pronto.' });
        if (!await this.isReady()) return this.json(response, 503, { error: 'Il servizio AI si sta preparando.', status: 'not_ready' });
        const body = await this.body(request);
        try {
          const prepared = this.prepareGuestExecution(guest, body);
          if (prepared.state === 'complete') return this.json(response, 200, prepared.entry.result);
          if (prepared.state === 'interrupted') return this.json(response, 409, { error: 'La risposta precedente è stata interrotta dopo l’inizio. Avvia un nuovo messaggio per continuare.', cursor: prepared.entry.content.length });
          const detach = this.subscribeGuestExecution(prepared.execution, response);
          let result;
          try { result = await prepared.execution.promise; }
          finally { detach(); }
          return this.json(response, 200, result);
        } catch (error) { return this.guestError(response, error); }
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/voice/transcribe') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        if (!this.voiceTranscriber) return this.json(response, 503, { error: 'Il riconoscimento vocale NexusNXS non è pronto.', code: 'VOICE_BACKEND_UNAVAILABLE' });
        const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'audio/wav') return this.json(response, 415, { error: 'Formato audio non supportato.', code: 'VOICE_FORMAT_UNSUPPORTED' });
        const address = requestAddress(request, { trustedCloudflare: publicIngress && this.trustPublicCloudflare });
        const voiceAllowed = this.guestAllowed(`voice-input:${guest.id}`, 8, REQUEST_WINDOW_MS)
          && this.guestDailyAllowed(guest, 'voice-input', 2, 120)
          && this.persistentQuotas.allow(`voice-input-ip:${address}`, { cost: 2, limit: 240 });
        if (!voiceAllowed) {
          this.securityEvents.append('guest.voice-input.blocked', { severity: 'warning', address, detail: 'Quota trascrizione superata' });
          return this.json(response, 429, { error: 'Limite voce raggiunto. Riprova più tardi.' });
        }
        const audio = await this.rawBody(request, MAX_PRIVATE_VOICE_BYTES);
        privateVoiceWaveInfo(audio);
        try {
          const result = await this.voiceTranscriber({ audio, language: 'auto', timeoutSeconds: 20 });
          this.assertServing();
          const text = String(result?.text || '').trim().slice(0, 4_000);
          if (!text) return this.json(response, 422, { error: 'Nessuna frase riconosciuta.', code: 'VOICE_NO_SPEECH' });
          return this.json(response, 200, {
            text,
            language: String(result?.language || 'und').slice(0, 16),
            confidence: Number.isFinite(Number(result?.confidence)) ? Math.max(0, Math.min(1, Number(result.confidence))) : null
          });
        } catch (error) {
          if (error?.code === 'VOICE_NO_SPEECH') return this.json(response, 422, { error: 'Nessuna frase riconosciuta.', code: error.code });
          if (error?.code === 'VOICE_BUSY') return this.json(response, 409, { error: 'Il riconoscimento vocale è già in uso.', code: error.code });
          if (error?.code === 'VOICE_BACKEND_UNAVAILABLE') return this.json(response, 503, { error: 'Il riconoscimento vocale NexusNXS non è pronto.', code: error.code });
          throw error;
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/voice/synthesize') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        if (!this.voiceSynthesizer) return this.json(response, 503, { error: 'La voce NexusNXS non è disponibile.' });
        const address = requestAddress(request, { trustedCloudflare: publicIngress && this.trustPublicCloudflare });
        const voiceAllowed = this.guestAllowed(`voice:${guest.id}`, 8, REQUEST_WINDOW_MS)
          && this.guestDailyAllowed(guest, 'voice', 2, 120)
          && this.persistentQuotas.allow(`voice-ip:${address}`, { cost: 2, limit: 240 });
        if (!voiceAllowed) {
          this.securityEvents.append('guest.voice.blocked', { severity: 'warning', address, detail: 'Quota voce superata' });
          return this.json(response, 429, { error: 'Limite voce raggiunto. Riprova più tardi.' });
        }
        const body = await this.body(request);
        const text = String(body.text || '').trim().slice(0, 4_000);
        const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(String(body.language || '')) ? String(body.language) : 'it';
        if (!text) return this.json(response, 400, { error: 'Testo vocale mancante.' });
        try {
          const result = await this.voiceSynthesizer({ text, language, gender: body.gender === 'female' ? 'female' : 'male' });
          const audio = Buffer.from(result?.audio || []);
          if (!audio.length || audio.length > 16 * 1024 * 1024) throw new Error('Audio non valido.');
          response.writeHead(200, {
            'Content-Type': String(result?.mimeType || 'audio/wav'),
            'Content-Length': audio.length,
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'",
            'Cross-Origin-Resource-Policy': 'same-origin',
            'X-Content-Type-Options': 'nosniff'
          });
          response.end(audio);
          return;
        } catch {
          return this.json(response, 503, { error: 'La voce NexusNXS non è pronta.' });
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/images/generate') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        if (!this.imageGenerationService?.available) return this.json(response, 503, { error: 'La generazione immagini NexusNXS non è disponibile.', code: 'IMAGE_BACKEND_UNAVAILABLE' });
        const address = requestAddress(request, { trustedCloudflare: publicIngress && this.trustPublicCloudflare });
        const allowed = this.guestAllowed(`image:${guest.id}`, 4, REQUEST_WINDOW_MS)
          && this.guestDailyAllowed(guest, 'image', 10, 40)
          && this.persistentQuotas.allow(`image-ip:${address}`, { cost: 10, limit: 120 });
        if (!allowed) {
          this.securityEvents.append('guest.image.blocked', { severity: 'warning', address, detail: 'Quota immagini superata' });
          return this.json(response, 429, { error: 'Limite immagini raggiunto. Riprova più tardi.' });
        }
        const body = await this.body(request);
        const prompt = String(body.prompt || '').trim();
        const size = String(body.size || '1024x1024');
        if (!prompt || prompt.length > 2_000) return this.json(response, 400, { error: 'Descrizione immagine non valida.', code: 'IMAGE_PROMPT_INVALID' });
        try {
          const result = await this.imageGenerationService.generate({ prompt, size });
          this.assertServing();
          response.writeHead(200, {
            'Content-Type': result.mimeType,
            'Content-Length': result.image.length,
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'",
            'Cross-Origin-Resource-Policy': 'same-origin',
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
          });
          response.end(result.image);
          this.securityEvents.append('guest.image.generated', { address, detail: `Formato ${size}` });
          return;
        } catch (error) {
          this.logger.warn?.('Generazione immagine non completata.', { code: error?.code });
          return this.json(response, error?.code === 'IMAGE_PROMPT_INVALID' || error?.code === 'IMAGE_SIZE_INVALID' ? 400 : 503, {
            error: error?.code === 'IMAGE_SIZE_INVALID' ? 'Formato immagine non supportato.' : 'La generazione immagini NexusNXS non è pronta.',
            code: error?.code || 'IMAGE_PROVIDER_ERROR'
          });
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/messages/cancel') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        const body = await this.body(request);
        const clientMessageId = String(body.clientMessageId || '');
        if (!/^[a-f0-9-]{20,80}$/i.test(clientMessageId)) {
          return this.json(response, 400, { error: 'Identificativo messaggio non valido.' });
        }
        const key = crypto.createHash('sha256').update(`${guest.installationHash}:${clientMessageId}`).digest('hex');
        const execution = this.activeGuestExecutions.get(key);
        if (execution && !execution.settled) execution.controller.abort();
        return this.json(response, 200, { cancelled: Boolean(execution && !execution.settled) });
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/messages/stream') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        if (!this.onMessage) return this.json(response, 503, { error: 'Il motore conversazionale non è pronto.' });
        if (!await this.isReady()) return this.json(response, 503, { error: 'Il servizio AI si sta preparando.', status: 'not_ready' });
        const body = await this.body(request);
        let prepared;
        try { prepared = this.prepareGuestExecution(guest, body); }
        catch (error) { return this.guestError(response, error); }
        const cursor = Math.max(0, Number(body.cursor) || 0);
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform',
          'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'same-origin',
          'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY'
        });
        const send = (event) => { if (!response.destroyed) response.write(`${JSON.stringify(event)}\n`); };
        const replay = this.requestLedger.replay(prepared.descriptor.key, cursor);
        if (replay.token) send({ type: 'token', token: replay.token, cursor: replay.cursor, replay: true });
        if (prepared.state === 'complete') {
          send({ type: 'complete', ...prepared.entry.result, cursor: replay.cursor });
          response.end(); return;
        }
        if (prepared.state === 'interrupted') {
          send({ type: 'error', error: 'La risposta è stata interrotta dopo l’inizio.', cursor: replay.cursor, resumable: false });
          response.end(); return;
        }
        let lastCursor = replay.cursor;
        let terminal = false;
        const listener = (event) => {
          if (event.type === 'token') {
            const start = Math.max(0, Number(event.cursor || 0) - String(event.token || '').length);
            if (Number(event.cursor || 0) <= lastCursor) return;
            const token = String(event.token || '').slice(Math.max(0, lastCursor - start));
            lastCursor = Number(event.cursor || lastCursor);
            if (token) send({ ...event, token });
            return;
          }
          if (event.type === 'complete' || event.type === 'error') terminal = true;
          send(event);
        };
        const detach = this.subscribeGuestExecution(prepared.execution, response, listener);
        // Alcuni reverse proxy chiudono gli stream durante ragionamenti lunghi
        // senza token visibili. Un frame neutro mantiene vivo il trasporto e
        // non espone modello, prompt, percorsi o telemetria della workstation.
        const heartbeat = setInterval(() => send({ type: 'heartbeat' }), this.streamHeartbeatMs);
        heartbeat.unref?.();
        try {
          const result = await prepared.execution.promise;
          if (!terminal) send({ type: 'complete', ...result, cursor: result.message.length });
        } catch (error) {
          if (!terminal && !response.destroyed) send({ type: 'error', error: error?.message || 'La risposta non è stata completata.', cursor: lastCursor, resumable: false });
        } finally { clearInterval(heartbeat); detach(); if (!response.destroyed) response.end(); }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/guest/activity') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        return this.json(response, 200, guest.activity || { text: '', phase: 'idle', updatedAt: 0 });
      }
      if (request.method === 'POST' && url.pathname === '/api/guest/feedback') {
        const guest = this.guestSession(request);
        if (!guest) return this.json(response, 401, { error: 'Sessione anonima scaduta.' });
        if (!this.communityFeedbackStore) return this.json(response, 503, { error: 'Raccolta contributi non disponibile.' });
        if (!this.persistentQuotas.allow(`feedback:${guest.installationHash}`, { cost: 8, limit: 40 })) return this.json(response, 429, { error: 'Limite contributi raggiunto.' });
        const body = await this.body(request);
        if (body.consent !== true) return this.json(response, 400, { error: 'Consenso esplicito richiesto.' });
        const prompt = String(body.prompt || '').trim().slice(0, 12_000);
        const answer = String(body.response || '').trim().slice(0, 20_000);
        if (!prompt || !answer) return this.json(response, 400, { error: 'Contributo incompleto.' });
        try {
          const saved = this.communityFeedbackStore.append({
            requestId: String(body.requestId || crypto.randomUUID()).slice(0, 128), prompt, response: answer,
            originalResponse: String(body.originalResponse || '').trim().slice(0, 20_000) || undefined,
            model: String(body.model || 'automatic').slice(0, 128), mode: body.mode === 'deep' ? 'deep' : 'fast',
            provenance: 'community-opt-in-quarantine', reviewStatus: 'quarantine', license: 'pending-review', consent: true,
            expiresAt: Date.now() + 90 * 24 * 60 * 60 * 1000
          });
          this.securityEvents.append('feedback.received', { address: requestAddress(request), detail: 'Contributo volontario in quarantena' });
          return this.json(response, 202, { status: 'received', id: saved.id });
        } catch { return this.json(response, 400, { error: 'Il contenuto non può essere raccolto.' }); }
      }
      if (request.method === 'POST' && url.pathname === '/api/console/bootstrap') {
        if (!isTrustedConsoleBootstrap(request, publicIngress)) {
          this.securityEvents.append('console.bootstrap.denied', { severity: 'critical', address: requestAddress(request), detail: 'Ingresso non Tailscale' });
          return this.json(response, 404, { error: 'Risorsa non disponibile.' });
        }
        const body = await this.body(request);
        let identity;
        if (body.deviceIdentity !== undefined) {
          try { identity = parseDeviceIdentityEnrollment(body.deviceIdentity); }
          catch (error) { return this.json(response, error.status || 400, { error: error.message, code: error.code }); }
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const device = {
          id: crypto.randomUUID(),
          name: cleanDeviceName(body.deviceName || 'NexusNXS per PC privato'),
          scope: 'console',
          tokenHash: tokenHash(token),
          createdAt: Date.now(),
          lastSeenAt: Date.now(),
          rotatedAt: Date.now(),
          identity
        };
        this.state.devices.push(device);
        this.state.devices = this.state.devices.slice(-20);
        this.persist();
        this.securityEvents.append('device.paired', { address: requestAddress(request), deviceId: device.id, deviceName: device.name, detail: identity ? 'Console privata con identita dispositivo' : 'Console privata legacy' });
        return this.json(response, 201, {
          token,
          device: { id: device.id, name: device.name },
          identity: { enrolled: Boolean(identity), ...(identity ? { keyId: identity.keyId, algorithm: identity.algorithm } : {}) },
          capabilities: this.deviceCapabilities(device)
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/pair') {
        const address = requestAddress(request);
        if (!this.pairingAllowed(address)) return this.json(response, 429, { error: 'Troppi tentativi. Riprova tra un minuto.' });
        const body = await this.body(request);
        if (publicIngress && (['console', 'remote'].includes(body.scope) || ['console', 'remote'].includes(this.pairing?.scope))) {
          return this.json(response, 404, { error: 'Risorsa non disponibile.' });
        }
        const valid = this.pairing && this.pairing.expiresAt > Date.now() && sameHash(tokenHash(String(body.code || '')), this.pairing.hash);
        if (!valid) {
          this.failedPairings.set(address, [...(this.failedPairings.get(address) || []), Date.now()].slice(-5));
          this.securityEvents.append('pairing.failed', { severity: 'warning', address, detail: 'Codice non valido o scaduto' });
          return this.json(response, 403, { error: 'Codice non valido o scaduto.' });
        }
        const requestedScope = ['chat', 'console', 'remote'].includes(body.scope) ? body.scope : 'chat';
        const scope = this.pairing.scope || 'chat';
        if (body.scope && requestedScope !== scope) {
          this.pairing = null;
          this.securityEvents.append('pairing.scope_denied', { severity: 'critical', address, detail: `${requestedScope}->${scope}` });
          return this.json(response, 403, { error: 'Il collegamento non autorizza questa modalità.' });
        }
        let identity;
        if (scope !== 'chat' && body.deviceIdentity !== undefined) {
          try { identity = parseDeviceIdentityEnrollment(body.deviceIdentity); }
          catch (error) { return this.json(response, error.status || 400, { error: error.message, code: error.code }); }
        }
        if (scope === 'chat' && body.deviceIdentity !== undefined) {
          return this.json(response, 400, { error: 'Le chiavi dispositivo sono accettate soltanto nel pairing privato.', code: 'DEVICE_IDENTITY_SCOPE_INVALID' });
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const device = { id: crypto.randomUUID(), name: cleanDeviceName(body.deviceName), scope, tokenHash: tokenHash(token), createdAt: Date.now(), lastSeenAt: Date.now(), rotatedAt: Date.now(), identity };
        this.state.devices.push(device);
        this.state.devices = this.state.devices.slice(-20);
        this.pairing = null;
        this.persist();
        this.securityEvents.append('device.paired', { address, deviceId: device.id, deviceName: device.name, detail: `${scope}:${identity ? 'verified-capable' : 'legacy'}` });
        return this.json(response, 201, {
          token,
          device: { id: device.id, name: device.name },
          identity: { enrolled: Boolean(identity), ...(identity ? { keyId: identity.keyId, algorithm: identity.algorithm } : {}) },
          capabilities: this.deviceCapabilities(device)
        });
      }
      const device = this.authenticate(request);
      if (!device) {
        this.securityEvents.append('authentication.denied', { severity: 'warning', address: requestAddress(request), detail: url.pathname });
        return this.json(response, 401, { error: 'Dispositivo non associato.' });
      }
      if (publicIngress && device.scope !== 'chat') {
        this.securityEvents.append('scope.ingress_denied', {
          severity: 'critical', address: requestAddress(request), deviceId: device.id,
          deviceName: device.name, detail: device.scope
        });
        return this.json(response, 404, { error: 'Risorsa non disponibile.' });
      }
      const requestKey = `${device.id}:${requestAddress(request)}`;
      if (!this.requestAllowed(requestKey)) {
        this.securityEvents.append('request.rate_limited', { severity: 'warning', address: requestAddress(request), deviceId: device.id, deviceName: device.name });
        return this.json(response, 429, { error: 'Troppe richieste. Attendi qualche secondo.' });
      }
      const routeLimit = authenticatedRouteLimit(request.method, url.pathname);
      if (routeLimit && !this.requestAllowed(`${requestKey}:${routeLimit.id}`, routeLimit.limit)) {
        this.securityEvents.append('request.rate_limited', {
          severity: 'warning', address: requestAddress(request), deviceId: device.id,
          deviceName: device.name, detail: routeLimit.id
        });
        return this.json(response, 429, { error: 'Troppe operazioni sensibili. Attendi prima di riprovare.' });
      }
      if (request.method === 'GET' && url.pathname === '/api/capabilities') {
        return this.json(response, 200, {
          ...this.deviceCapabilities(device),
          manifest: this.capabilityManifest({ publicIngress: false, device })
        });
      }
      if (request.method === 'GET' && url.pathname === '/api/presence/status') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        return this.json(response, 200, await this.desktopPresenceStatus(device));
      }
      if (request.method === 'POST' && url.pathname === '/api/device/challenge') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!device.identity) {
          return this.json(response, 428, {
            error: 'Questo dispositivo deve essere associato nuovamente con una chiave protetta.',
            code: 'DEVICE_IDENTITY_ENROLLMENT_REQUIRED'
          });
        }
        const body = await this.body(request);
        const purpose = String(body.purpose || '');
        if (!SENSITIVE_DEVICE_PURPOSES.has(purpose)) {
          return this.json(response, 400, { error: 'Scopo della prova dispositivo non consentito.', code: 'DEVICE_CHALLENGE_PURPOSE_INVALID' });
        }
        try {
          const challenge = this.deviceChallenges.issue({ deviceId: device.id, keyId: device.identity.keyId, purpose });
          return this.json(response, 201, {
            ...challenge,
            algorithm: device.identity.algorithm,
            payload: canonicalChallengePayload(challenge).toString('base64url')
          });
        } catch (error) {
          const status = error?.code === 'DEVICE_CHALLENGE_LIMIT' ? 429 : 400;
          return this.json(response, status, { error: error.message, code: error.code });
        }
      }
      if (request.method === 'GET' && url.pathname === '/api/events') {
        this.openEventStream(request, response, device.scope, device.id);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/voice/transcribe') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!device.identity) return this.json(response, 428, {
          error: 'Questo dispositivo deve essere associato nuovamente con una chiave protetta.',
          code: 'DEVICE_IDENTITY_ENROLLMENT_REQUIRED'
        });
        if (!this.voiceTranscriber) return this.json(response, 503, { error: 'Il riconoscimento vocale NexusNXS non è pronto.', code: 'VOICE_BACKEND_UNAVAILABLE' });
        const contentType = String(request.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase();
        if (contentType !== 'audio/wav') return this.json(response, 415, { error: 'Formato audio non supportato.', code: 'VOICE_FORMAT_UNSUPPORTED' });
        await this.verifySensitiveDevice(device, 'voice-transcribe', {
          challengeId: request.headers['x-nexus-device-challenge'],
          signature: request.headers['x-nexus-device-signature']
        });
        const audio = await this.rawBody(request, MAX_PRIVATE_VOICE_BYTES);
        privateVoiceWaveInfo(audio);
        const controller = new AbortController();
        const cancel = () => controller.abort(Object.assign(new Error('Trascrizione annullata.'), { name: 'AbortError', code: 'VOICE_CANCELLED' }));
        request.once('aborted', cancel);
        response.once('close', cancel);
        try {
          const result = await this.voiceTranscriber({ audio, language: 'auto', timeoutSeconds: 20, signal: controller.signal });
          this.assertServing();
          if (controller.signal.aborted || response.destroyed) return;
          const text = String(result?.text || '').trim().slice(0, 4_000);
          if (!text) return this.json(response, 422, { error: 'Nessuna frase riconosciuta.', code: 'VOICE_NO_SPEECH' });
          return this.json(response, 200, {
            text,
            language: String(result?.language || 'und').slice(0, 16),
            confidence: Number.isFinite(Number(result?.confidence)) ? Math.max(0, Math.min(1, Number(result.confidence))) : null
          });
        } catch (error) {
          if (controller.signal.aborted || error?.name === 'AbortError' || error?.code === 'VOICE_CANCELLED') {
            if (response.destroyed || response.writableEnded) return;
            return this.json(response, 408, { error: 'Trascrizione annullata.', code: 'VOICE_CANCELLED' });
          }
          if (error?.code === 'VOICE_NO_SPEECH') return this.json(response, 422, { error: 'Nessuna frase riconosciuta.', code: error.code });
          if (error?.code === 'VOICE_BUSY') return this.json(response, 409, { error: 'Il riconoscimento vocale è già in uso.', code: error.code });
          if (error?.code === 'VOICE_BACKEND_UNAVAILABLE') return this.json(response, 503, { error: 'Il riconoscimento vocale NexusNXS non è pronto.', code: error.code });
          throw error;
        } finally {
          request.off('aborted', cancel);
          response.off('close', cancel);
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/session/rotate') {
        return this.json(response, 200, this.rotateDeviceToken(device));
      }
      if (request.method === 'GET' && url.pathname === '/api/devices') {
        if (device.scope !== 'remote') return this.json(response, 403, { error: 'Autorizzazione Remote richiesta.' });
        const graph = deviceGraph(this.state.devices, {
          currentDeviceId: device.id,
          capabilityResolver: (entry) => this.deviceCapabilities(entry)
        });
        return this.json(response, 200, {
          currentDeviceId: device.id,
          devices: this.state.devices.map(({ id, name, scope, createdAt, lastSeenAt }) => ({
            id, name, scope, createdAt, lastSeenAt, current: id === device.id
          })),
          graph
        });
      }
      if (request.method === 'GET' && url.pathname === '/api/system/telemetry/stream') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        this.openTelemetryStream(request, response, device.id);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/system/telemetry') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        return this.json(response, 200, await this.telemetrySnapshot());
      }
      if (request.method === 'GET' && url.pathname === '/api/system/processes') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        return this.json(response, 200, { processes: await this.processProvider(), updatedAt: Date.now() });
      }
      if (request.method === 'GET' && url.pathname === '/api/system/service') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        return this.json(response, 200, {
          status: 'online',
          uptimeSeconds: Math.round(process.uptime()),
          requests: this.guestCapacity(),
          anonymousSessions: this.guestSessions.size,
          connectedStreams: this.eventStreams.size + this.telemetryStreams.size,
          performance: this.performanceStore?.summary?.() || null,
          updatedAt: Date.now()
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/system/service/plan') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.serviceControlExecutor) return this.json(response, 503, { error: 'Controllo servizio non disponibile.' });
        const body = await this.body(request);
        const identity = await this.verifySensitiveDevice(device, 'service-plan', body.deviceProof);
        const binding = deviceActionBinding(device, identity);
        const action = String(body.action || '');
        if (action !== 'stop') return this.json(response, 400, { error: 'Azione servizio non consentita.' });
        for (const [id, candidate] of this.adminTickets) if (candidate.expiresAt < Date.now()) this.adminTickets.delete(id);
        if (this.adminTickets.size >= MAX_ADMIN_TICKETS) return this.json(response, 429, { error: 'Troppe conferme amministrative in attesa.' });
        const ticket = {
          id: crypto.randomUUID(), kind: 'service', action, deviceId: device.id,
          subjectId: binding.subjectId, keyFingerprint: binding.keyFingerprint, identityBound: binding.verified,
          createdAt: Date.now(), expiresAt: Date.now() + ADMIN_TICKET_TTL_MS
        };
        this.adminTickets.set(ticket.id, ticket);
        return this.json(response, 200, {
          proposal: {
            id: ticket.id, action, risk: 'critical', expiresAt: ticket.expiresAt,
            preview: 'Arresta il server NexusNXS. Le connessioni resteranno offline fino al prossimo avvio manuale o accesso a Windows.'
          }
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/system/service/execute') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.serviceControlExecutor) return this.json(response, 503, { error: 'Controllo servizio non disponibile.' });
        const body = await this.body(request);
        this.assertServing();
        if (body.approved !== true) return this.json(response, 400, { error: 'Conferma esplicita richiesta.' });
        const identity = await this.verifySensitiveDevice(device, 'service-execute', body.deviceProof);
        const binding = deviceActionBinding(device, identity);
        const ticket = this.adminTickets.get(String(body.ticketId || ''));
        this.adminTickets.delete(String(body.ticketId || ''));
        if (!ticket || ticket.kind !== 'service' || ticket.action !== 'stop'
          || ticket.deviceId !== device.id || ticket.subjectId !== binding.subjectId
          || ticket.keyFingerprint !== binding.keyFingerprint || ticket.identityBound !== binding.verified
          || ticket.expiresAt < Date.now()) {
          return this.json(response, 400, { error: 'Conferma scaduta o non valida.' });
        }
        this.securityEvents.append('service.stopped', {
          severity: 'critical', address: requestAddress(request), deviceId: device.id,
          deviceName: device.name, detail: ticket.action
        });
        const result = await this.serviceControlExecutor(ticket.action);
        const receipt = this.recordRemoteReceipt({
          actionId: ticket.id,
          outcome: 'completed',
          tool: 'nexus_service',
          effect: 'stop',
          verification: 'shutdown-scheduled',
          subjectId: binding.subjectId,
          subjectKind: binding.verified ? 'verified-device' : 'opaque-session',
          keyFingerprint: binding.keyFingerprint,
          rollbackPolicy: 'manual-start-required',
          transactionId: ticket.id,
          startedAt: ticket.createdAt,
          completedAt: Date.now()
        });
        return this.json(response, 200, { ...result, ...receipt });
      }
      if (request.method === 'GET' && url.pathname === '/api/security/summary') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        return this.json(response, 200, { ...this.securityEvents.summary({ devices: this.state.devices }), currentDeviceId: device.id });
      }
      const revokeMatch = url.pathname.match(/^\/api\/security\/devices\/([^/]+)$/);
      if (request.method === 'DELETE' && revokeMatch) {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        const targetId = decodeURIComponent(revokeMatch[1]);
        if (targetId === device.id) return this.json(response, 400, { error: 'Non puoi revocare la sessione in uso.' });
        const existed = this.state.devices.some((entry) => entry.id === targetId);
        if (!existed) return this.json(response, 404, { error: 'Dispositivo non trovato.' });
        this.revokeDevice(targetId);
        return this.json(response, 200, this.securityEvents.summary({ devices: this.state.devices }));
      }
      if (request.method === 'POST' && url.pathname === '/api/presence/plan') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.presenceStatusProvider || !this.presenceActionExecutor) {
          return this.json(response, 503, { error: 'La presenza desktop non e pronta.', code: 'PRESENCE_NOT_CONFIGURED' });
        }
        const body = await this.body(request);
        this.assertServing();
        const identity = await this.verifySensitiveDevice(device, 'presence-plan', body.deviceProof);
        const presenceRequest = normalizePresenceAction(body);
        const status = await this.desktopPresenceStatus(device);
        if (!presenceActionChangesState(status, presenceRequest)) {
          return this.json(response, 200, {
            changed: false,
            message: 'Lo stato richiesto e gia attivo.',
            proposal: null,
            status
          });
        }
        const ticket = this.rememberPresenceTicket(presenceRequest, device, identity);
        return this.json(response, 200, {
          changed: true,
          status,
          proposal: {
            id: ticket.id,
            action: ticket.action,
            risk: ['open-full-app', 'open-application', 'close-application'].includes(ticket.action) ? 'medium' : 'low',
            requiresApproval: true,
            expiresAt: ticket.expiresAt,
            preview: presenceActionPreview(presenceRequest)
          }
        });
      }
      if (request.method === 'POST' && url.pathname === '/api/presence/execute') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.presenceStatusProvider || !this.presenceActionExecutor) {
          return this.json(response, 503, { error: 'La presenza desktop non e pronta.', code: 'PRESENCE_NOT_CONFIGURED' });
        }
        const body = await this.body(request);
        this.assertServing();
        if (body.approved !== true) return this.json(response, 400, { error: 'Autorizzazione esplicita richiesta.' });
        const identity = await this.verifySensitiveDevice(device, 'presence-execute', body.deviceProof);
        const { ticket, binding } = this.consumePresenceTicket(body.ticketId, device, identity);
        const presenceRequest = Object.freeze({
          version: PRESENCE_PROTOCOL_VERSION,
          action: ticket.action,
          ...(ticket.displayId ? { displayId: ticket.displayId } : {}),
          ...(ticket.applicationId ? { applicationId: ticket.applicationId } : {})
        });
        const before = await this.desktopPresenceStatus(device);
        assertPresenceActionAuthorized(before, presenceRequest);
        const receiptInput = (outcome, verification, completedAt = Date.now()) => ({
          actionId: ticket.id,
          outcome,
          tool: 'desktop_presence',
          effect: outcome === 'skipped' ? 'no-change' : 'desktop-state',
          verification,
          subjectId: binding.subjectId,
          subjectKind: binding.verified ? 'verified-device' : 'opaque-session',
          keyFingerprint: binding.keyFingerprint,
          rollbackPolicy: 'new-approval-required',
          transactionId: ticket.id,
          startedAt: ticket.createdAt,
          completedAt
        });
        if (!presenceActionChangesState(before, presenceRequest)) {
          const receipt = this.recordRemoteReceipt(receiptInput('skipped', 'state-already-matched'));
          return this.json(response, 200, { changed: false, status: before, ...receipt });
        }
        const command = Object.freeze({
          version: PRESENCE_PROTOCOL_VERSION,
          requestId: ticket.id,
          action: ticket.action,
          ...(ticket.displayId ? { displayId: ticket.displayId } : {}),
          ...(ticket.applicationId ? { applicationId: ticket.applicationId } : {})
        });
        const context = Object.freeze({
          device: Object.freeze({ id: device.id, scope: device.scope }),
          approvedAt: Date.now()
        });
        try {
          await this.presenceActionExecutor(command, context);
        } catch (error) {
          this.logger.warn?.('Comando presenza desktop non applicato.', { error });
          const receipt = this.recordRemoteReceipt(receiptInput('failed', 'adapter-rejected'));
          return this.json(response, 502, {
            error: 'La presenza desktop non ha applicato il comando.',
            code: 'PRESENCE_ADAPTER_REJECTED',
            ...receipt
          });
        }
        let after = await this.desktopPresenceStatus(device);
        // Le app Windows moderne possono creare un processo broker prima della
        // finestra finale. Verifichiamo per un intervallo bounded anziche
        // trasformare quella latenza in un falso errore sul telefono.
        const verificationDeadline = Date.now() + 4_500;
        while (!presencePostconditionSatisfied(after, presenceRequest) && Date.now() < verificationDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 180));
          after = await this.desktopPresenceStatus(device);
        }
        if (!presencePostconditionSatisfied(after, presenceRequest)) {
          const receipt = this.recordRemoteReceipt(receiptInput('failed', 'postcondition-failed'));
          return this.json(response, 409, {
            error: 'Lo stato della presenza desktop non e stato verificato.',
            code: 'PRESENCE_POSTCONDITION_FAILED',
            status: after,
            ...receipt
          });
        }
        this.securityEvents.append('presence.executed', {
          deviceId: device.id,
          deviceName: device.name,
          detail: ticket.action
        });
        const receipt = this.recordRemoteReceipt(receiptInput('completed', 'postcondition-verified'));
        return this.json(response, 200, { changed: true, status: after, ...receipt });
      }
      if (request.method === 'POST' && url.pathname === '/api/system/power/plan') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        const body = await this.body(request);
        const identity = await this.verifySensitiveDevice(device, 'power-plan', body.deviceProof);
        const binding = deviceActionBinding(device, identity);
        const action = String(body.action || '');
        if (!['shutdown', 'restart'].includes(action)) return this.json(response, 400, { error: 'Azione di alimentazione non consentita.' });
        for (const [id, candidate] of this.adminTickets) if (candidate.expiresAt < Date.now()) this.adminTickets.delete(id);
        if (this.adminTickets.size >= MAX_ADMIN_TICKETS) return this.json(response, 429, { error: 'Troppe conferme amministrative in attesa.' });
        const ticket = {
          id: crypto.randomUUID(), kind: 'power', action, deviceId: device.id,
          subjectId: binding.subjectId, keyFingerprint: binding.keyFingerprint, identityBound: binding.verified,
          createdAt: Date.now(), expiresAt: Date.now() + ADMIN_TICKET_TTL_MS
        };
        this.adminTickets.set(ticket.id, ticket);
        return this.json(response, 200, { proposal: { id: ticket.id, action, risk: 'critical', expiresAt: ticket.expiresAt, preview: action === 'shutdown' ? 'Spegni il computer tra 15 secondi' : 'Riavvia il computer tra 15 secondi' } });
      }
      if (request.method === 'POST' && url.pathname === '/api/system/power/execute') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        const body = await this.body(request);
        this.assertServing();
        if (body.approved !== true) return this.json(response, 400, { error: 'Conferma esplicita richiesta.' });
        const identity = await this.verifySensitiveDevice(device, 'power-execute', body.deviceProof);
        const binding = deviceActionBinding(device, identity);
        const ticket = this.adminTickets.get(String(body.ticketId || ''));
        this.adminTickets.delete(String(body.ticketId || ''));
        if (!ticket || ticket.kind !== 'power' || ticket.deviceId !== device.id || ticket.subjectId !== binding.subjectId
          || ticket.keyFingerprint !== binding.keyFingerprint || ticket.identityBound !== binding.verified
          || ticket.expiresAt < Date.now()) {
          return this.json(response, 400, { error: 'Conferma scaduta o non valida.' });
        }
        this.securityEvents.append('power.executed', { severity: 'critical', address: requestAddress(request), deviceId: device.id, deviceName: device.name, detail: ticket.action });
        const result = await this.powerExecutor(ticket.action);
        const receipt = this.recordRemoteReceipt({
          actionId: ticket.id,
          outcome: 'completed',
          tool: 'system_power',
          effect: 'execute',
          verification: 'executor-accepted',
          subjectId: binding.subjectId,
          subjectKind: binding.verified ? 'verified-device' : 'opaque-session',
          keyFingerprint: binding.keyFingerprint,
          rollbackPolicy: 'not-guaranteed',
          transactionId: ticket.id,
          startedAt: ticket.createdAt,
          completedAt: Date.now()
        });
        return this.json(response, 200, { ...result, ...receipt });
      }
      if (request.method === 'POST' && url.pathname === '/api/workflows/create') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.onWorkflowCreate) return this.json(response, 503, { error: 'I workflow non sono pronti.' });
        const body = await this.body(request);
        this.assertServing();
        const identity = await this.verifySensitiveDevice(device, 'workflow-create', body.deviceProof);
        const result = await this.onWorkflowCreate({
          summary: body.summary,
          steps: body.steps,
          device: { id: device.id, name: device.name },
          deviceIdentity: identity
        });
        this.securityEvents.append('workflow.created', { address: requestAddress(request), deviceId: device.id, deviceName: device.name, detail: result?.id });
        return this.json(response, 201, result);
      }
      const workflowRoute = url.pathname.match(/^\/api\/workflows\/([0-9a-f-]{36})\/(next|decide|cancel|status)$/i);
      if (workflowRoute) {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        const workflowId = workflowRoute[1];
        const operation = workflowRoute[2].toLowerCase();
        if (operation === 'status') {
          if (request.method !== 'GET' || !this.onWorkflowStatus) return this.json(response, 404, { error: 'Risorsa non disponibile.' });
          return this.json(response, 200, await this.onWorkflowStatus({ workflowId, device: { id: device.id, name: device.name } }));
        }
        if (request.method !== 'POST') return this.json(response, 404, { error: 'Risorsa non disponibile.' });
        const callback = operation === 'next' ? this.onWorkflowNext
          : operation === 'decide' ? this.onWorkflowDecide
            : this.onWorkflowCancel;
        if (!callback) return this.json(response, 503, { error: 'I workflow non sono pronti.' });
        const body = await this.body(request);
        this.assertServing();
        const purpose = `workflow-${operation}`;
        const identity = await this.verifySensitiveDevice(device, purpose, body.deviceProof);
        if (operation === 'decide' && typeof body.approved !== 'boolean') {
          return this.json(response, 400, { error: 'Decisione esplicita richiesta.' });
        }
        let result;
        try {
          result = await callback({
            workflowId,
            ticketId: body.ticketId,
            approved: body.approved,
            device: { id: device.id, name: device.name },
            deviceIdentity: identity
          });
        } catch (error) {
          if (!error?.actionReceipt) throw error;
          return this.json(response, Number(error.status) || 409, {
            error: 'Il passaggio workflow non è stato completato.',
            code: error.code || 'WORKFLOW_STEP_FAILED',
            workflow: error.workflow,
            receipt: error.actionReceipt
          });
        }
        this.securityEvents.append(`workflow.${operation}`, {
          severity: operation === 'cancel' || (operation === 'decide' && body.approved === false) ? 'warning' : 'info',
          address: requestAddress(request), deviceId: device.id, deviceName: device.name, detail: workflowId
        });
        return this.json(response, operation === 'cancel' ? 202 : 200, result);
      }
      if (request.method === 'POST' && url.pathname === '/api/actions/plan') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.onActionPlan) return this.json(response, 503, { error: 'Il controllo operativo non è pronto.' });
        const body = await this.body(request);
        this.assertServing();
        const identity = await this.verifySensitiveDevice(device, 'action-plan', body.deviceProof);
        const instruction = String(body.instruction || '').trim();
        if (!instruction || instruction.length > 4_000) return this.json(response, 400, { error: 'Operazione non valida.' });
        const result = await this.toolBus.invoke('device-action-plan', { instruction, device: { id: device.id, name: device.name }, deviceIdentity: identity });
        if (result?.proposal) this.rememberPrivateActionTicket(result.proposal, device, identity);
        return this.json(response, 200, result);
      }
      if (request.method === 'POST' && url.pathname === '/api/actions/execute') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        if (!this.onActionExecute) return this.json(response, 503, { error: 'Il controllo operativo non è pronto.' });
        const body = await this.body(request);
        this.assertServing();
        if (body.approved !== true) return this.json(response, 400, { error: 'Autorizzazione esplicita richiesta.' });
        const identity = await this.verifySensitiveDevice(device, 'action-execute', body.deviceProof);
        this.consumePrivateActionTicket(body.ticketId, device, identity);
        let operationId;
        try { operationId = operationIdentifier(body.operationId); }
        catch (error) { return this.json(response, error.status || 400, { error: error.message, code: error.code }); }
        if (this.activeConsoleOperations.has(operationId)) return this.json(response, 409, { error: 'Identificatore operazione già in uso.' });
        const controller = new AbortController();
        const operation = {
          operationId, deviceId: device.id, deviceName: device.name, controller,
          startedAt: Date.now(), cancelRequestedAt: 0, settled: false
        };
        this.activeConsoleOperations.set(operationId, operation);
        response.setHeader('X-Nexus-Operation-Id', operationId);
        const cancelOnDisconnect = () => {
          if (!response.writableEnded) this.cancelConsoleOperation(operationId, device.id, 'Il client che ha avviato l’operazione si è disconnesso.');
        };
        request.once('aborted', cancelOnDisconnect);
        response.once('close', cancelOnDisconnect);
        this.broadcast({ type: 'console-output', operationId, phase: 'running', stream: 'status', text: 'Operazione avviata.' }, 'console', device.id);
        const onOutput = ({ stream, text }) => {
          if (!controller.signal.aborted) this.broadcast({ type: 'console-output', operationId, phase: 'running', stream, text: String(text || '').slice(0, 8_192) }, 'console', device.id);
        };
        try {
          const result = await this.toolBus.invoke('device-action-execute', {
            ticketId: String(body.ticketId || ''), approved: true, operationId, signal: controller.signal,
            onOutput, device: { id: device.id, name: device.name }, deviceIdentity: identity
          }, { approved: true, signal: controller.signal });
          if (controller.signal.aborted) throw Object.assign(new Error('Operazione annullata.'), { name: 'AbortError', code: 'ACTION_CANCELLED' });
          this.broadcast({ type: 'console-output', operationId, phase: 'done', stream: 'status', text: result.message || 'Operazione completata.' }, 'console', device.id);
          return this.json(response, 200, { ...result, operationId });
        } catch (error) {
          const cancelled = controller.signal.aborted || error?.code === 'ACTION_CANCELLED' || error?.name === 'AbortError';
          this.broadcast({
            type: 'console-output', operationId, phase: cancelled ? 'cancelled' : 'error', stream: cancelled ? 'status' : 'stderr',
            text: cancelled ? 'Operazione annullata.' : error.message
          }, 'console', device.id);
          if (cancelled) {
            if (response.destroyed || response.writableEnded) return;
            return this.json(response, 409, { error: 'Operazione annullata.', code: 'ACTION_CANCELLED', operationId });
          }
          if (error?.actionReceipt) {
            return this.json(response, Number(error.status) || 400, {
              error: 'Operazione non completata.',
              code: error.code || 'ACTION_FAILED',
              operationId,
              receipt: error.actionReceipt
            });
          }
          throw error;
        } finally {
          operation.settled = true;
          request.off('aborted', cancelOnDisconnect);
          response.off('close', cancelOnDisconnect);
          if (this.activeConsoleOperations.get(operationId) === operation) this.activeConsoleOperations.delete(operationId);
        }
      }
      if (request.method === 'POST' && url.pathname === '/api/actions/cancel') {
        if (!this.hasScope(device, 'console')) return this.json(response, 403, { error: 'Autorizzazione Console richiesta.' });
        const body = await this.body(request);
        if (!body.operationId) return this.json(response, 400, { error: 'Identificatore operazione richiesto.' });
        let operationId;
        try { operationId = operationIdentifier(body.operationId); }
        catch (error) { return this.json(response, error.status || 400, { error: error.message, code: error.code }); }
        if (!this.cancelConsoleOperation(operationId, device.id)) return this.json(response, 404, { error: 'Operazione non attiva.' });
        return this.json(response, 202, { status: 'cancellation-requested', operationId });
      }
      if (request.method === 'GET' && url.pathname === '/api/activity') {
        if (!this.hasScope(device, 'chat')) return this.json(response, 403, { error: 'Questa sessione non può accedere alle conversazioni.' });
        const conversationId = String(url.searchParams.get('conversation') || '');
        return this.json(response, 200, this.activities.get(conversationId) || { text: '', phase: 'idle', updatedAt: 0 });
      }
      if (url.pathname === '/api/preferences' && !this.hasScope(device, 'chat')) return this.json(response, 403, { error: 'Questa sessione non può sincronizzare le impostazioni AI.' });
      if (request.method === 'GET' && url.pathname === '/api/preferences') return this.json(response, 200, this.state.preferences);
      if (request.method === 'PUT' && url.pathname === '/api/preferences') {
        this.state.preferences = normalizeSyncedPreferences(await this.body(request));
        this.persist();
        this.broadcast({ type: 'preferences', preferences: this.state.preferences, updatedAt: Date.now() }, 'chat');
        return this.json(response, 200, this.state.preferences);
      }
      if (url.pathname.startsWith('/api/conversations') && !this.hasScope(device, 'chat')) return this.json(response, 403, { error: 'Questa sessione non può accedere alle conversazioni.' });
      if (request.method === 'GET' && url.pathname === '/api/conversations') return this.json(response, 200, this.conversationStore.list({ limit: 100 }).map(({ turns, ...record }) => ({ ...record, preview: turns.at(-1)?.content?.slice(0, 180) || '' })));
      if (request.method === 'POST' && url.pathname === '/api/conversations/import') {
        const body = await this.body(request);
        const sourceId = String(body.sourceId || '');
        if (!/^[a-f0-9-]{20,80}$/i.test(sourceId)) return this.json(response, 400, { error: 'Conversazione locale non valida.' });
        const turns = Array.isArray(body.turns) ? body.turns.slice(-100).map((turn) => ({ role: turn?.role === 'assistant' ? 'assistant' : 'user', content: String(turn?.content || '').slice(0, 12_000), createdAt: Number(turn?.createdAt || Date.now()) })).filter((turn) => turn.content) : [];
        const remoteSourceId = `${device.id}:${sourceId}`;
        const existing = this.conversationStore.list({ limit: 500 }).find((entry) => entry.remoteSourceId === remoteSourceId);
        const now = Date.now();
        const record = this.conversationStore.save({ id: existing?.id || crypto.randomUUID(), remoteSourceId, title: String(body.title || 'Conversazione mobile').slice(0, 120), createdAt: existing?.createdAt || now, updatedAt: now, incomplete: false, turns });
        this.broadcast({ type: 'conversation', conversationId: record.id, updatedAt: record.updatedAt }, 'chat');
        return this.json(response, existing ? 200 : 201, record);
      }
      if (request.method === 'POST' && url.pathname === '/api/conversations') {
        const now = Date.now();
        const record = this.conversationStore.save({ id: crypto.randomUUID(), title: 'Nuova conversazione', createdAt: now, updatedAt: now, incomplete: false, turns: [] });
        return this.json(response, 201, record);
      }
      const turnMatch = url.pathname.match(/^\/api\/conversations\/([^/]+)\/turns\/(\d+)$/);
      if (turnMatch && request.method === 'DELETE') {
        const id = decodeURIComponent(turnMatch[1]);
        const turnIndex = Number(turnMatch[2]);
        const record = this.conversationStore.list({ limit: 200 }).find((entry) => entry.id === id);
        if (!record || !Number.isSafeInteger(turnIndex) || turnIndex < 0 || turnIndex >= record.turns.length) {
          return this.json(response, 404, { error: 'Passaggio non trovato.' });
        }
        const updated = this.conversationStore.save({ ...record, turns: record.turns.slice(0, turnIndex), updatedAt: Date.now(), incomplete: false });
        this.broadcast({ type: 'conversation', conversationId: record.id, updatedAt: updated.updatedAt });
        return this.json(response, 200, updated);
      }
      const match = url.pathname.match(/^\/api\/conversations\/([^/]+)(?:\/messages)?$/);
      if (match) {
        const id = decodeURIComponent(match[1]);
        const record = this.conversationStore.list({ limit: 200 }).find((entry) => entry.id === id);
        if (!record) return this.json(response, 404, { error: 'Conversazione non trovata.' });
        if (request.method === 'GET' && !url.pathname.endsWith('/messages')) return this.json(response, 200, record);
        if (request.method === 'POST' && url.pathname.endsWith('/messages')) {
          if (!this.onMessage) return this.json(response, 503, { error: 'Il motore conversazionale non è pronto.' });
          const body = await this.body(request);
          this.assertServing();
          const text = String(body.text || '').trim();
          if (!text || text.length > 12_000) return this.json(response, 400, { error: 'Messaggio non valido.' });
          const clientMessageId = String(body.clientMessageId || '');
          const messageKey = clientMessageId && /^[a-f0-9-]{20,80}$/i.test(clientMessageId) ? `${device.id}:${clientMessageId}` : '';
          if (messageKey && this.completedRemoteMessages.has(messageKey)) {
            const latest = this.conversationStore.list({ limit: 200 }).find((entry) => entry.id === id) || record;
            return this.json(response, 200, latest);
          }
          const afterTurnIndex = Number(body.afterTurnIndex);
          const conversation = Number.isSafeInteger(afterTurnIndex) && afterTurnIndex >= 0 && afterTurnIndex < record.turns.length
            ? { ...record, turns: record.turns.slice(0, afterTurnIndex + 1), updatedAt: Date.now(), incomplete: false }
            : record;
          const report = (message, phase = 'work') => this.reportActivity(record.id, message, phase);
          report('Comprendo la richiesta e preparo il contesto…');
          try {
            const updated = await this.onMessage({ conversation, text, mode: body.mode === 'deep' ? 'deep' : 'fast', device: { id: device.id, name: device.name }, report });
            if (messageKey) {
              this.completedRemoteMessages.set(messageKey, Date.now());
              if (this.completedRemoteMessages.size > 2_000) {
                const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
                for (const [key, completedAt] of this.completedRemoteMessages) if (completedAt < cutoff) this.completedRemoteMessages.delete(key);
              }
            }
            report('Risposta pronta', 'done');
            this.broadcast({ type: 'conversation', conversationId: record.id, updatedAt: updated.updatedAt });
            return this.json(response, 200, updated);
          } catch (error) {
            report('Non sono riuscito a completare la risposta', 'error');
            throw error;
          }
        }
      }
      return this.json(response, 404, { error: 'Risorsa non disponibile.' });
    } catch (error) {
      this.logger.warn?.('Richiesta remota non completata.', { error });
      if (response.destroyed || response.writableEnded) return;
      if (error?.code === 'GATEWAY_STOPPED') return this.json(response, 503, { error: error.message });
      if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 499 && error?.code) {
        return this.json(response, error.status, { error: error.message, code: error.code });
      }
      return this.json(response, 400, { error: 'La richiesta remota non è valida.' });
    }
  }
}

// #endregion

module.exports = { RemoteSessionGateway, systemSnapshot, tokenHash, readState, privateAddresses, cleanPublicUrl, requestAddress, isLoopbackRequest, pseudonymousAccessId, isTailscalePeer, isTrustedConsoleBootstrap, normalizeSyncedPreferences, guestAttachments, authenticatedRouteLimit, slidingWindowAllowed, parseDeviceIdentityEnrollment, verifyDevicePublicKeySignature, privateVoiceWaveInfo, DEFAULT_PORT };
