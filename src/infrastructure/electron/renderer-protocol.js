/**
 * @module infrastructure/electron/renderer-protocol
 * @description Serve il renderer tramite il protocollo interno sicuro nexus://app.
 */
// #region 01 — Risoluzione confinata delle risorse

const fs = require('node:fs');
const path = require('node:path');
const { protocol } = require('electron');

const RENDERER_ORIGIN = 'nexus://app';
const RENDERER_ENTRY_URL = `${RENDERER_ORIGIN}/index.html`;
const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self' data:; img-src 'self' data:; connect-src 'none'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const CONTENT_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
});

function resolveRendererAsset(rendererRoot, requestUrl) {
  const url = new URL(requestUrl);
  if (url.protocol !== 'nexus:' || url.hostname !== 'app' || url.username || url.password || url.search || url.hash) {
    throw new Error('Risorsa renderer non autorizzata.');
  }
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  if (!relativePath || relativePath.includes('\0')) throw new Error('Risorsa renderer non valida.');
  const lexicalRoot = path.resolve(rendererRoot);
  const insideAsar = lexicalRoot.toLowerCase().includes('.asar');
  // Electron espone i file ASAR tramite un filesystem virtuale: readFile/stat
  // funzionano, mentre realpath non rappresenta la directory virtuale. In
  // sviluppo manteniamo realpath per bloccare symlink; in produzione integrità
  // ASAR e OnlyLoadAppFromAsar rendono autoritativo il percorso lessicale.
  const root = insideAsar ? lexicalRoot : fs.realpathSync(lexicalRoot);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) {
    throw new Error('La risorsa renderer esce dalla directory autorizzata.');
  }
  const realTarget = insideAsar ? target : fs.realpathSync(target);
  if (!realTarget.startsWith(`${root}${path.sep}`) || !fs.statSync(realTarget).isFile()) {
    throw new Error('Risorsa renderer non autorizzata.');
  }
  return realTarget;
}

// #endregion

// #region 02 — Registrazione protocollo

function registerRendererProtocol(rendererRoot) {
  protocol.handle('nexus', (request) => {
    try {
      const target = resolveRendererAsset(rendererRoot, request.url);
      const contentType = CONTENT_TYPES[path.extname(target).toLowerCase()];
      if (!contentType) throw new Error('Tipo di risorsa renderer non consentito.');
      return new Response(fs.readFileSync(target), {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Security-Policy': CONTENT_SECURITY_POLICY,
          'X-Content-Type-Options': 'nosniff',
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Resource-Policy': 'same-origin',
          'Permissions-Policy': 'camera=(), geolocation=(), display-capture=(), usb=(), serial=(), bluetooth=()',
          'Referrer-Policy': 'no-referrer',
          'Cache-Control': 'no-store'
        }
      });
    } catch {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  });
}

module.exports = { CONTENT_SECURITY_POLICY, RENDERER_ENTRY_URL, registerRendererProtocol, resolveRendererAsset };

// #endregion
