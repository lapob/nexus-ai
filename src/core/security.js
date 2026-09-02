/**
 * @module core/security
 * @description Applica i confini per endpoint locali, renderer trusted e percorsi della vault.
 */
const path = require('node:path');
const fs = require('node:fs');

function isPrivateIpv4(hostname) {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  return octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

// L'accesso LAN è disabilitato per default. Quando viene autorizzato sono
// accettati solo indirizzi IP RFC1918: niente DNS, Internet o credenziali URL.
function assertOllamaUrl(value, { allowLan = false } = {}) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('Endpoint Ollama non valido.'); }

  const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  const isLocal = localHosts.has(url.hostname);
  const isPrivateLan = allowLan && isPrivateIpv4(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || (!isLocal && !isPrivateLan)) {
    throw new Error(allowLan
      ? 'Sono consentiti soltanto localhost o indirizzi IPv4 privati RFC1918.'
      : 'Per privacy sono consentiti soltanto endpoint locali; abilita esplicitamente la LAN per un altro PC.');
  }
  // Le versioni precedenti suggerivano /v1. Lo accettiamo come migrazione, ma
  // restituiamo sempre origin perché Ollama espone gli endpoint sotto /api.
  if (url.username || url.password || url.search || url.hash || !['', '/', '/v1', '/v1/'].includes(url.pathname)) {
    throw new Error('L’endpoint Ollama deve contenere soltanto protocollo, host e porta.');
  }
  return url.origin;
}

function assertLocalUrl(value) {
  return assertOllamaUrl(value);
}

// Impedisce a un renderer compromesso di usare "../" per aprire file esterni
// alla vault. Accettiamo esclusivamente note Markdown già recuperate dal RAG.
function resolveVaultNotePath(vaultPath, relativePath) {
  const requested = String(relativePath);
  const segments = requested.replaceAll('\\', '/').split('/');
  const target = path.resolve(vaultPath, requested);
  if (segments.some((segment) => segment.startsWith('.') || segment === 'NexusAI') || !target.startsWith(`${vaultPath}${path.sep}`) || path.extname(target).toLowerCase() !== '.md') {
    throw new Error('Percorso nota non valido.');
  }
  // realpath risolve anche i symlink: una nota collegata fuori dalla vault non
  // può aggirare il controllo lessicale precedente.
  const realVault = fs.realpathSync(vaultPath);
  const realTarget = fs.realpathSync(target);
  if (!realTarget.startsWith(`${realVault}${path.sep}`)) throw new Error('Percorso nota non valido.');
  return realTarget;
}

module.exports = { assertLocalUrl, assertOllamaUrl, isPrivateIpv4, resolveVaultNotePath };
