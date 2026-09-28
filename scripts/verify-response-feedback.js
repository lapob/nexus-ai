/**
 * @module scripts/verify-response-feedback
 * @description Exercises the real React response controls with synthetic data in an isolated browser.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { browserExecutable, Cdp, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');

// #region Isolated application fixture
async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'qa-artifacts/response-feedback');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  let child, client, server;
  try {
    const entry = `
      import React from 'react'; import {createRoot} from 'react-dom/client';
      import {ResponseSurface} from './src/renderer/components/ResponseSurface';
      import '@fontsource-variable/inter/wght.css';
      ${['app','design-tokens.generated','settings-minimal','surfaces-minimal','response-surface','unified-surfaces','adaptive-performance','final-polish'].map(name => `import './src/renderer/styles/${name}.css';`).join('\n')}
      window.qa={ratings:[],contributions:[],fail:false};
      window.nexus={copyText:async()=>{}};
      createRoot(document.getElementById('root')).render(<ResponseSurface response="Risposta sintetica di verifica." previousResponse="Risposta precedente sintetica." error="" active={false} artifacts={[]} trainingSaved={false}
        onRateResponse={async (...args)=>{if(window.qa.fail)throw Error('test');window.qa.ratings.push(args)}}
        onApproveTraining={(...args)=>window.qa.contributions.push(args)}
        onRegenerate={()=>{}} onContinue={()=>{}} onStop={()=>{}} onDismiss={()=>{}}/>);
    `;
    const { createServer } = await import('vite');
    const react = (await import('@vitejs/plugin-react')).default;
    server = await createServer({ configFile: false, root, cacheDir: path.join(profile, 'vite-cache'),
      server: { host: '127.0.0.1', port: await freePort(), strictPort: true,
        fs: { allow: [root, fs.realpathSync(path.join(root, 'node_modules'))] },
        watch: { ignored: ['**/qa-artifacts/**'] } }, plugins: [react(), {
        name: 'response-feedback-fixture',
        resolveId(id) { if (id === '/qa-response.tsx') return path.join(root, 'qa-response.tsx'); },
        load(id) { if (id.replaceAll('\\', '/') === path.join(root, 'qa-response.tsx').replaceAll('\\', '/')) return entry; },
        configureServer(vite) { vite.middlewares.use(async (req, res, next) => {
          if (req.url !== '/') return next();
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/', '<!doctype html><meta charset="utf-8"><div id="root"></div><script type="module" src="/qa-response.tsx"></script>'));
        }); }
      }] });
    await server.listen();
    const url = `http://127.0.0.1:${server.httpServer.address().port}/`, debugPort = await freePort();
    child = spawn(browserExecutable(), ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', url], { stdio: 'ignore', windowsHide: true });
    client = await new Cdp((await waitForTarget(debugPort, url)).webSocketDebuggerUrl).open();
    async function wait(expression) {
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) { if (await client.evaluate(expression)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
      throw Error(`UI timeout: ${expression}`);
    }
    await wait("!!document.querySelector('[aria-label^=\"Mi piace\"]')");
    await client.evaluate('document.fonts.ready.then(()=>true)');
    // #endregion
    // #region Real controls and viewport checks
    await client.evaluate(`document.querySelector('[aria-label^="Mi piace"]').click();true`);
    await wait('qa.ratings.length===1');
    assert.equal(await client.evaluate('qa.contributions.length'), 0);
    await client.evaluate(`qa.fail=true;document.querySelector('[aria-label^="Non mi piace"]').click();true`);
    await wait("!!document.querySelector('[role=alert]')");
    await client.evaluate(`qa.fail=false;document.querySelector('[aria-label^="Non mi piace"]').click();true`);
    await wait('qa.ratings.length===2');
    await client.evaluate(`document.querySelector('.answer-action-menu-trigger').click();true`);
    await wait("!!document.querySelector('[role=menu]')");
    await client.evaluate(`[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent==='Confronta').click();true`);
    await wait("!!document.querySelector('.response-comparison button')");
    await client.evaluate(`document.querySelector('.response-comparison button').click();true`);
    await wait('qa.ratings.length===3');
    assert.equal(await client.evaluate('qa.ratings[2][1]'), 'previous');
    assert.equal(await client.evaluate('qa.contributions.length'), 0);
    for (const [width, height] of [[1090, 700], [720, 560], [390, 844]]) {
      await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await new Promise(resolve => setTimeout(resolve, 300));
      const visible = await client.evaluate(`(()=>{const r=document.querySelector('.answer-actions').getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()`);
      assert.equal(visible, true, `Response actions outside ${width}x${height}`);
      const png = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${width}x${height}.png`), Buffer.from(png.data, 'base64'));
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, votesNeverSubmitText: true, retry: true, preference: true, viewports: 3 }, null, 2));
    console.log('PASS real response controls: votes, errors/retry, comparison, three viewports.');
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close(); if (child && child.exitCode === null) child.kill();
    if (server) await server.close();
    await removeTemporaryPath(profile);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
