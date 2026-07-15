const path = require('node:path');
const fs = require('node:fs');

// Il modello deve essere raggiungibile soltanto dal computer locale.
// Questa validazione viene ripetuta immediatamente prima di ogni fetch:
// non ci affidiamo al solo valore salvato nell'interfaccia.
function assertLocalUrl(value) {
  let url;
  try { url = new URL(value); }
  catch { throw new Error('Endpoint locale non valido.'); }

  const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (!['http:', 'https:'].includes(url.protocol) || !allowedHosts.has(url.hostname)) {
    throw new Error('Per privacy sono consentiti soltanto endpoint locali (localhost/127.0.0.1/::1).');
  }
  return value.replace(/\/$/, '');
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

module.exports = { assertLocalUrl, resolveVaultNotePath };
