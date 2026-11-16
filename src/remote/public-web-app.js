/**
 * @module remote/public-web-app
 * @description Web app pubblica NexusNXS AI: incorpora la build web-dist in un unico documento (JS e CSS inline, firmati con nonce dal gateway e dall'edge), serve gli asset immutabili di /assets e reindirizza il vecchio /next.
 */
const fs = require('node:fs');
const path = require('node:path');

// #region 01 — Contratto HTTP

const WEB_ROOT = path.resolve(__dirname, '..', '..', 'web-dist');
const LEGACY_PREFIX = '/next';
const TYPES = Object.freeze({
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.json': 'application/json; charset=utf-8'
});

const COMMON = Object.freeze({
  'Cross-Origin-Resource-Policy': 'same-origin', 'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
});

/** CSP del documento: solo script e stili con il nonce della risposta, nessuna origine esterna. */
function webAppCsp(nonce) {
  return [
    // 'strict-dynamic': il modulo d'ingresso con nonce può caricare i propri chunk di /assets (import statici e import()).
    "default-src 'none'", `script-src 'nonce-${nonce}' 'strict-dynamic'`, "script-src-attr 'none'", `style-src 'nonce-${nonce}'`, "style-src-attr 'none'",
    "font-src 'self'", "img-src 'self' blob:", "connect-src 'self'", "worker-src 'self'", "manifest-src 'self'", "media-src 'self' blob:",
    "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "object-src 'none'"
  ].join('; ');
}

// #endregion

// #region 02 — Documento unico

/** Rende un sorgente sicuro dentro un elemento HTML grezzo (<script> o <style>). */
function rawText(source, tag) {
  return String(source).replace(new RegExp(`</(${tag})`, 'gi'), '<\\/$1').replace(/<!--/g, '<\\!--');
}

/**
 * Incorpora il CSS unico (primo disegno senza richieste) e lascia il modulo d'ingresso in /assets, con un
 * nonce aggiunto da withNonce: i chunk su richiesta lo importano per URL, quindi deve avere un URL suo.
 * Font e immagini restano URL /assets/…: la CSP non ammette data:.
 */
function inlineWebApp(indexHtml, readAsset) {
  let scripts = 0;
  let styles = 0;
  const html = String(indexHtml)
    .replace(/<link rel="modulepreload"[^>]*>/g, '')
    .replace(/<link rel="stylesheet"[^>]*href="\/(assets\/[A-Za-z0-9._-]+\.css)"[^>]*>/g, (_, file) => {
      styles += 1;
      return `<style>${rawText(readAsset(file), 'style')}</style>`;
    })
    .replace(/<script type="module"[^>]*src="\/(assets\/[A-Za-z0-9._-]+\.js)"[^>]*><\/script>/g, (_, file) => {
      scripts += 1;
      readAsset(file); // Il modulo d'ingresso deve esistere nella build servita.
      return `<script type="module" src="/${file}"></script>`;
    });
  const stray = html.replace(/<script type="module" src="\/assets\/[A-Za-z0-9._-]+\.js"><\/script>/g, '');
  if (scripts !== 1 || styles !== 1 || /\s(?:src|href)="\/assets\/[^"]+\.(?:js|css)"/.test(stray)) throw new Error('Build web non servibile: attesi un modulo d\'ingresso e un CSS.');
  return html;
}

/** Documento pubblico dalla build, oppure null se web-dist non è stato compilato. */
function loadPublicWebApp(root = WEB_ROOT) {
  const index = path.join(root, 'index.html');
  if (!fs.existsSync(index)) return null;
  return inlineWebApp(fs.readFileSync(index, 'utf8'), (file) => fs.readFileSync(path.join(root, file), 'utf8'));
}

/** Aggiunge il nonce a ogni <script> e <style>, con o senza attributi. */
function withNonce(html, nonce) {
  return html.replace(/<(script|style)(?=[\s>])/g, `<$1 nonce="${nonce}"`);
}

// #endregion

// #region 03 — Asset e compatibilità

/** Restituisce il file asset da servire oppure null; mai fuori da web-dist/assets. */
function resolveWebAppAsset(pathname, root = WEB_ROOT) {
  if (!pathname.startsWith('/assets/')) return null;
  let relative;
  try { relative = decodeURIComponent(pathname.slice(1)); } catch { return null; }
  if (!/^assets\/[A-Za-z0-9._-]+$/.test(relative)) return null;
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.join(root, 'assets') + path.sep)) return null;
  if (!TYPES[path.extname(file).toLowerCase()]) return null;
  return file;
}

/**
 * GET/HEAD per /assets/* e il vecchio /next. Restituisce true se la richiesta è
 * stata gestita (anche con 404 interno), false se non appartiene alla web app.
 */
function servePublicWebApp(request, response, url, { root = WEB_ROOT, readFile = fs.promises.readFile } = {}) {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  if (url.pathname === LEGACY_PREFIX || url.pathname.startsWith(`${LEGACY_PREFIX}/`)) {
    response.writeHead(308, { ...COMMON, Location: '/', 'Cache-Control': 'public, max-age=86400' });
    response.end();
    return true;
  }
  if (!url.pathname.startsWith('/assets/')) return false;
  const file = resolveWebAppAsset(url.pathname, root);
  const notFound = () => { response.writeHead(404, { ...COMMON, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }); response.end('Non trovato'); };
  if (!file) { notFound(); return true; }
  readFile(file).then((body) => {
    response.writeHead(200, {
      ...COMMON,
      'Content-Type': TYPES[path.extname(file).toLowerCase()],
      'Content-Length': body.length,
      // Nomi con hash: un aggiornamento cambia URL, quindi la cache è permanente.
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  }).catch(() => { if (!response.headersSent) notFound(); });
  return true;
}

// #endregion

module.exports = { servePublicWebApp, resolveWebAppAsset, inlineWebApp, loadPublicWebApp, withNonce, webAppCsp, WEB_ROOT };
