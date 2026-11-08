const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { servePublicWebApp, resolveWebAppAsset, inlineWebApp, loadPublicWebApp, withNonce, webAppCsp } = require('../src/remote/public-web-app');
const { PUBLIC_AI_HTML, PUBLIC_AI_BUILT, PUBLIC_AI_SERVICE_WORKER } = require('../src/remote/remote-session-gateway');

function fakeResponse() {
  const state = { status: 0, headers: {}, body: null, headersSent: false };
  return { state, writeHead(status, headers) { state.status = status; state.headers = headers; state.headersSent = true; }, get headersSent() { return state.headersSent; }, end(body) { state.body = body; } };
}

const INDEX = '<!doctype html><html><head><title>NexusNXS AI</title><script type="module" crossorigin src="/assets/index-abc.js"></script><link rel="stylesheet" crossorigin href="/assets/style-abc.css"></head><body><div id="root"></div></body></html>';

function site(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-web-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'index.html'), INDEX);
  fs.writeFileSync(path.join(root, 'assets', 'index-abc.js'), 'const tag = "</script><!--"; console.log(tag);');
  fs.writeFileSync(path.join(root, 'assets', 'style-abc.css'), '@font-face{src:url(/assets/inter-abc.woff2)}body{color:red}');
  fs.writeFileSync(path.join(root, 'secret.txt'), 'no');
  return root;
}

async function serve(root, pathname, method = 'GET') {
  const response = fakeResponse();
  const handled = servePublicWebApp({ method }, response, new URL(`https://ai.example${pathname}`), { root });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { handled, ...response.state };
}

test('documento unico: bundle incorporato, chiusure di tag neutralizzate, font ancora come URL', (t) => {
  const html = loadPublicWebApp(site(t));
  assert.doesNotMatch(html, /src="\/assets\/[^"]+\.js"|href="\/assets\/[^"]+\.css"/);
  assert.match(html, /<script type="module">const tag = "<\\\/script><\\!--"/);
  assert.match(html, /<style>@font-face\{src:url\(\/assets\/inter-abc\.woff2\)\}/);
  // Lo script incorporato resta JavaScript valido dopo l'escape.
  const script = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1];
  assert.doesNotThrow(() => new vm.Script(script));
  assert.throws(() => inlineWebApp('<html><body></body></html>', () => ''), /un solo bundle/);
  assert.equal(loadPublicWebApp(path.join(os.tmpdir(), 'nexus-web-assente')), null);
});

test('nonce su ogni script e stile, CSP senza inline generico né origini esterne', () => {
  const html = withNonce('<style>a{}</style><script type="module">x()</script><script>y()</script>', 'n0nce');
  assert.equal(html, '<style nonce="n0nce">a{}</style><script nonce="n0nce" type="module">x()</script><script nonce="n0nce">y()</script>');
  const csp = webAppCsp('n0nce');
  assert.match(csp, /script-src 'nonce-n0nce'/);
  assert.match(csp, /style-src-attr 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
});

test('asset con hash: immutabili e con tipo corretto', async (t) => {
  const result = await serve(site(t), '/assets/index-abc.js');
  assert.equal(result.status, 200);
  assert.match(result.headers['Content-Type'], /javascript/);
  assert.match(result.headers['Cache-Control'], /immutable/);
});

test('traversal, encoding e file fuori da assets restano 404', async (t) => {
  const root = site(t);
  // L'URL normalizza ".." prima del routing: la richiesta esce da /assets e non viene servita da qui.
  assert.equal((await serve(root, '/assets/../secret.txt')).handled, false);
  for (const pathname of ['/assets/%2e%2e%2fsecret.txt', '/assets/x.exe', '/assets/%E0%A4%A']) {
    const result = await serve(root, pathname);
    assert.equal(result.handled, true, pathname);
    assert.equal(result.status, 404, pathname);
  }
  assert.equal(resolveWebAppAsset('/assets/a/b.js', root), null);
});

test('il vecchio /next porta alla web app unica; il resto non viene intercettato', async (t) => {
  const root = site(t);
  for (const pathname of ['/next', '/next/', '/next/assets/index-abc.js']) {
    const result = await serve(root, pathname);
    assert.equal(result.status, 308, pathname);
    assert.equal(result.headers.Location, '/');
  }
  assert.equal((await serve(root, '/')).handled, false);
  assert.equal((await serve(root, '/nextgen')).handled, false);
  assert.equal((await serve(root, '/api/guest/bootstrap', 'POST')).handled, false);
  assert.equal((await serve(root, '/assets/index-abc.js', 'POST')).handled, false);
});

test('il service worker residuo della vecchia interfaccia pulisce le sue cache e si disinstalla', async () => {
  const deleted = []; let unregistered = false; const navigated = []; const listeners = {};
  vm.runInNewContext(PUBLIC_AI_SERVICE_WORKER, {
    self: {
      addEventListener: (type, handler) => { listeners[type] = handler; }, skipWaiting() {},
      registration: { unregister: async () => { unregistered = true; } },
      clients: { matchAll: async () => [{ url: 'https://ai.example/', navigate: async (url) => { navigated.push(url); } }] }
    },
    caches: { keys: async () => ['nexusnxs-ai-shell-v6-abc', 'altra-app'], delete: async (key) => { deleted.push(key); } }
  });
  assert.equal(listeners.fetch, undefined, 'nessuna intercettazione delle richieste');
  let pending; listeners.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['nexusnxs-ai-shell-v6-abc']);
  assert.equal(unregistered, true);
  assert.deepEqual(navigated, ['https://ai.example/']);
});

test('la build attuale è la pagina pubblica: nessuna interfaccia classica', () => {
  assert.match(PUBLIC_AI_HTML, /<title>NexusNXS AI<\/title>/);
  assert.doesNotMatch(PUBLIC_AI_HTML, /NexusNXS agisce|coreCanvas|nexusCosmicMetrics/);
  if (!PUBLIC_AI_BUILT) return; // Ambiente senza build web: resta la pagina di aggiornamento.
  assert.match(PUBLIC_AI_HTML, /<div id="root"><\/div>/);
  assert.match(PUBLIC_AI_HTML, /<script type="module">/);
  assert.doesNotMatch(PUBLIC_AI_HTML, /\sstyle="/);
  assert.ok(PUBLIC_AI_HTML.length < 1_000_000, 'documento entro 1 MB');
});
