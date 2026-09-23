/**
 * @module scripts/verify-web-offline
 * @description Browser isolato: rete assente, bozza e allegati, rotazione e riconnessione.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const { browserExecutable, Cdp, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');

// #region 01 - Letture durante navigazione
async function waitFor(client, expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try { if (await client.evaluate(expression)) return; }
    catch (error) {
      if (!/execution context|context.*destroyed/i.test(error.message)) throw error;
    }
    // Only read-only predicates are retried across document replacement.
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`Stato atteso non raggiunto: ${expression}`);
}
// #endregion

// #region 02 - Scenario isolato senza inferenza
async function main() {
  const output = path.resolve(__dirname, '../qa-artifacts/web-offline');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  const port = await freePort(), publicPort = await freePort(), debugPort = await freePort();
  let messages = 0, child, client;
  const gateway = new RemoteSessionGateway({ statePath: path.join(profile, 'gateway.json'), publicPort,
    conversationStore: { list: () => [], save: value => value },
    onMessage: async () => { ++messages; throw new Error('Il collaudo non deve inviare messaggi'); },
    logger: { info() {}, warn() {} } });
  const network = offline => client.command('Network.emulateNetworkConditions', {
    offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  });
  try {
    await gateway.configure({ enabled: true, allowLan: false, port });
    const url = `http://127.0.0.1:${publicPort}/`;
    child = spawn(browserExecutable(), ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', url], { stdio: 'ignore', windowsHide: true });
    client = await new Cdp((await waitForTarget(debugPort, url)).webSocketDebuggerUrl).open();
    await client.command('Network.enable');
    await waitFor(client, "document.body?.dataset.serviceReadiness==='ready'");
    await client.evaluate(`document.querySelector('#prompt').value='Bozza sintetica offline';document.querySelector('#prompt').dispatchEvent(new Event('input',{bubbles:true}));true`);
    await network(true);
    await waitFor(client, "document.body?.dataset.serviceReadiness==='offline'");
    await client.evaluate(`const transfer=new DataTransfer();transfer.items.add(new File(['Contenuto sintetico'],'offline.txt',{type:'text/plain'}));const input=document.querySelector('#attachmentInput');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));true`);
    await waitFor(client, "document.querySelector('#attachment').dataset.count==='1'");
    const report = [];
    for (const [width, height] of [[390,844],[844,390],[1440,900]]) {
      await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 900 });
      const state = await client.evaluate(`({draft:document.querySelector('#prompt').value,attachments:document.querySelector('#attachment').dataset.count,sendDisabled:document.querySelector('#send').disabled,coreDisabled:document.querySelector('#core').disabled,readiness:document.body?.dataset.serviceReadiness})`);
      assert.equal(state.draft, 'Bozza sintetica offline');
      assert.equal(state.attachments, '1');
      assert.equal(state.readiness, 'offline');
      assert.equal(state.sendDisabled, true, 'Allegare un file offline non deve riabilitare invio');
      assert.equal(state.coreDisabled, true);
      report.push({ width, height, ...state });
    }
    await network(false);
    await waitFor(client, "document.body?.dataset.serviceReadiness==='ready'&&!document.querySelector('#send').disabled");
    assert.equal(await client.evaluate("document.querySelector('#prompt').value"), 'Bozza sintetica offline');
    assert.equal(await client.evaluate("document.querySelector('#attachment').dataset.count"), '1');
    assert.equal(messages, 0, 'La riconnessione non deve inviare automaticamente');
    const previousDocument = await client.evaluate('performance.timeOrigin');
    await client.command('Page.reload', { ignoreCache: true });
    await waitFor(client, `performance.timeOrigin!==${previousDocument}&&document.body?.dataset.serviceReadiness==='ready'&&document.querySelector('#prompt').value===''`);
    assert.equal(await client.evaluate("document.querySelectorAll('.attachment-chip').length"), 0);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, report, reconnectedWithoutSending: true, anonymousReloadCleared: true }, null, 2));
    console.log('PASS: bozza e allegati offline, tre orientamenti/dimensioni, riconnessione senza invio, reload anonimo senza persistenza.');
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close();
    if (child && child.exitCode === null) child.kill();
    await gateway.stop();
    await removeTemporaryPath(profile);
  }
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion

