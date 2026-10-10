/**
 * @module scripts/verify-web-history-reset
 * @description Browser regression: clearing history cancels and rejects late responses.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const { createPublicLocalMemory } = require('../src/remote/public-local-memory');
const { browserExecutable, Cdp, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');
// #region Read-only browser predicates
async function waitFor(client, expression) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (await client.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timeout: ${expression}`);
}
// #endregion
// #region Isolated cancellation scenarios
async function main() {
  const output = path.resolve(__dirname, '../qa-artifacts/web-history-reset');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  const port = await freePort(), publicPort = await freePort(), debugPort = await freePort();
  let client, secondClient, child;
  const gateway = new RemoteSessionGateway({ statePath: path.join(profile, 'gateway.json'), publicPort,
    conversationStore: { list: () => [], save: value => value },
    onMessage: async () => { throw new Error('No real inference allowed'); }, logger: { info() {}, warn() {} } });
  try {
    await gateway.configure({ enabled: true, allowLan: false, port });
    const url = `http://127.0.0.1:${publicPort}/`;
    child = spawn(browserExecutable(), ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', url], { stdio: 'ignore', windowsHide: true });
    client = await new Cdp((await waitForTarget(debugPort, url)).webSocketDebuggerUrl).open();
    await waitFor(client, "document.body?.dataset.serviceReadiness==='ready'");
    await client.evaluate(`globalThis.qa={requests:[],cancels:[]};const originalFetch=fetch;globalThis.fetch=async(url,options={})=>{
      if(url==='/api/guest/messages/cancel'){qa.cancels.push(JSON.parse(options.body));return Response.json({status:'cancelled'})}
      if(url==='/api/guest/images/generate'){qa.imageSignal=options.signal;return new Promise(resolve=>qa.imageResponse=resolve)}
      if(url==='/api/guest/messages/stream'){qa.requests.push({body:JSON.parse(options.body),signal:options.signal});return new Response(new ReadableStream({start(controller){qa.controller=controller}}))}
      return originalFetch(url,options)
    };qa.frame=frame=>qa.controller.enqueue(new TextEncoder().encode(JSON.stringify(frame)+'\\n'));true`);
    const submit = text => client.evaluate(`document.querySelector('#prompt').value=${JSON.stringify(text)};document.querySelector('#prompt').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#send').click();true`);
    await submit('Prima richiesta sintetica');
    await waitFor(client, 'qa.requests.length===1');
    await client.evaluate(`qa.frame({type:'token',token:'Risposta parziale'});true`);
    await waitFor(client, "document.querySelector('#answer').textContent.includes('parziale')");
    await client.evaluate(`document.querySelector('#memoryClear').click();true`);
    await waitFor(client, "document.querySelector('#answer').textContent===''");
    assert.equal(await client.evaluate('qa.requests[0].signal.aborted'), true);
    await waitFor(client, 'qa.cancels.length===1');
    assert.equal(await client.evaluate('qa.cancels[0].clientMessageId===qa.requests[0].body.clientMessageId'), true);
    // Deliberately ignore AbortSignal in the mock: frames already in transit must be harmless.
    await client.evaluate(`qa.frame({type:'token',token:'CONTENUTO TARDIVO'});qa.frame({type:'complete',text:'CONTENUTO TARDIVO'});qa.controller.close();true`);
    await waitFor(client, "document.querySelector('#send').dataset.mode==='send'");
    assert.equal(await client.evaluate("document.querySelector('#answer').textContent"), '');
    await submit('Genera una immagine di stelle');
    await waitFor(client, "typeof qa.imageResponse==='function'");
    await client.evaluate(`document.querySelector('#memoryClear').click();true`);
    await waitFor(client, 'qa.imageSignal.aborted');
    await client.evaluate(`const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.toBlob(blob=>qa.imageResponse(new Response(blob)));true`);
    await waitFor(client, "document.querySelector('#send').dataset.mode==='send'");
    assert.equal(await client.evaluate("document.querySelector('#imageResult').hidden"), true);
    assert.equal(await client.evaluate("document.querySelector('#sessionHistory').textContent"), '');
    await submit('Seconda richiesta sintetica');
    await waitFor(client, 'qa.requests.length===2');
    assert.deepEqual(await client.evaluate('qa.requests[1].body.history'), []);
    await client.evaluate(`qa.frame({type:'token',token:'Nuova risposta'});qa.frame({type:'complete',text:'Nuova risposta'});qa.controller.close();true`);
    await waitFor(client, "document.querySelector('#send').dataset.mode==='send'");
    assert.match(await client.evaluate("document.querySelector('#answer').textContent"), /Nuova risposta/);
    // The same browser database survives reload, but reset in another tab must
    // invalidate both the displayed conversation and any pending write.
    const secondUrl = `${url}?memoryCheck=1`;
    const { targetId } = await client.command('Target.createTarget', { url: secondUrl });
    const targets = await fetch(`http://127.0.0.1:${debugPort}/json`).then(response => response.json());
    const secondTarget = targets.find(target => target.id === targetId);
    assert.ok(secondTarget, 'The second tab has a distinct target');
    secondClient = await new Cdp(secondTarget.webSocketDebuggerUrl).open();
    await waitFor(secondClient, "document.querySelector('#answer')?.textContent.includes('Nuova risposta')");
    await secondClient.command('Page.reload');
    await waitFor(secondClient, "document.querySelector('#answer')?.textContent.includes('Nuova risposta')");
    await client.evaluate(`document.querySelector('#keyboard').click();document.querySelector('#prompt').value='Bozza da cancellare';localStorage.setItem('nexusnxs.slash-commands.v1','[]');localStorage.setItem('unrelated-owner-data','preserve');true`);
    await secondClient.evaluate(`document.querySelector('#memoryClear').click();true`);
    await waitFor(client, "document.querySelector('#answer').textContent===''&&document.querySelector('#prompt').value===''");
    assert.equal(await client.evaluate("localStorage.getItem('unrelated-owner-data')"), 'preserve');
    assert.equal(await client.evaluate("localStorage.getItem('nexusnxs.slash-commands.v1')"), null);
    await secondClient.command('Page.reload');
    await secondClient.command('Page.bringToFront');
    await waitFor(secondClient, "document.body?.dataset.serviceReadiness==='ready'");
    assert.equal(await secondClient.evaluate("document.querySelector('#answer').textContent"), '');
    await client.command('Page.bringToFront');
    await client.evaluate(`qa.checkReadiness=globalThis.nexusCheckReadiness;globalThis.nexusCheckReadiness=()=>new Promise(resolve=>qa.ready=resolve);true`);
    await submit('Richiesta in preparazione');
    await waitFor(client, "typeof qa.ready==='function'");
    await client.evaluate(`document.querySelector('#memoryClear').click();true`);
    await waitFor(client, "document.querySelector('#answer').textContent===''");
    await client.evaluate(`qa.ready(true);globalThis.nexusCheckReadiness=qa.checkReadiness;true`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(await client.evaluate('qa.requests.length'), 2, 'A cleared request must not start after readiness resolves');
    assert.equal(await client.evaluate("document.querySelector('#answer').textContent"), '');
    await submit('Interruzione normale');
    await waitFor(client, 'qa.requests.length===3');
    await client.evaluate(`qa.frame({type:'token',token:'Parte da conservare'});true`);
    await waitFor(client, "document.querySelector('#answer').textContent.includes('conservare')");
    await client.evaluate(`document.querySelector('#send').click();qa.controller.error(new DOMException('Aborted','AbortError'));true`);
    await waitFor(client, "document.querySelector('#send').dataset.mode==='send'");
    assert.match(await client.evaluate("document.querySelector('#answer').textContent"), /Parte da conservare/);
    await client.evaluate(`qa.nativeReader=FileReader;globalThis.FileReader=class {readAsDataURL(){qa.lateReader=this}};const input=document.querySelector('#attachmentInput'),files=new DataTransfer();files.items.add(new File(['test'],'synthetic.txt',{type:'text/plain'}));input.files=files.files;input.dispatchEvent(new Event('change'));true`);
    await waitFor(client, 'Boolean(qa.lateReader)');
    await client.evaluate(`document.querySelector('#memoryClear').click();true`);
    await waitFor(client, "document.querySelector('#answer').textContent===''");
    await client.evaluate(`qa.lateReader.result='data:text/plain;base64,dGVzdA==';qa.lateReader.onload();globalThis.FileReader=qa.nativeReader;true`);
    await new Promise(resolve => setTimeout(resolve, 80));
    assert.equal(await client.evaluate("document.querySelector('#attachment').dataset.count"), '0');
    const staleWrite = await client.evaluate(`(async()=>{const first=(${createPublicLocalMemory.toString()})(),second=(${createPublicLocalMemory.toString()})();await first.read();await second.read();await first.write([{role:'user',content:'Synthetic old state'}]);await second.clear();const accepted=await first.write([{role:'user',content:'MUST_NOT_REAPPEAR'}]);return {accepted,turns:await second.read()}})()`);
    assert.equal(staleWrite.accepted, false);
    assert.deepEqual(staleWrite.turns, []);
    await secondClient.command('Page.addScriptToEvaluateOnNewDocument', { source: `IDBFactory.prototype.open=function(){throw new DOMException('Storage denied','SecurityError')}` });
    await secondClient.command('Page.reload');
    await secondClient.command('Page.bringToFront');
    await waitFor(secondClient, "document.body?.dataset.memoryStorage==='temporary'");
    assert.match(await secondClient.evaluate("document.querySelector('#memoryStorageNotice').textContent"), /temporanea/);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ passed: true, cancelled: true, lateFramesRejected: true, lateImagesRejected: true, pendingReadinessCancelled: true, nextHistoryEmpty: true, normalStopPreservesPartial: true, localReload: true, crossTabClear: true, draftCleared: true, unrelatedStoragePreserved: true }, null, 2));
    console.log('PASS: history reset aborts, cancels server request, discards late frames and starts with empty history.');
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    secondClient?.close();
    client?.close();
    if (child && child.exitCode === null) child.kill();
    await gateway.stop();
    await removeTemporaryPath(profile);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
