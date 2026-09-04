/**
 * @module scripts/verify-web-bottom-bar
 * @description Isolated browser regression for long replies behind the mobile dock.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RemoteSessionGateway } = require('../src/remote/remote-session-gateway');
const { browserExecutable, Cdp, evaluateWhenReady, freePort, waitForTarget, removeTemporaryPath } = require('./web-visual-regression');

async function main() {
  const output = path.resolve(__dirname, '../qa-artifacts/web-bottom-bar');
  fs.mkdirSync(output, { recursive: true });
  const profile = fs.mkdtempSync(path.join(output, 'profile-'));
  const port = await freePort();
  const publicPort = await freePort();
  const debugPort = await freePort();
  const gateway = new RemoteSessionGateway({ statePath: path.join(profile, 'gateway.json'), publicPort,
    conversationStore: { list: () => [], save: (value) => value }, logger: { info() {}, warn() {} } });
  let child, client;
  try {
    await gateway.configure({ enabled: true, allowLan: false, port });
    const url = `http://127.0.0.1:${publicPort}/`;
    child = spawn(browserExecutable(), ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking', url], { stdio: 'ignore', windowsHide: true });
    client = await new Cdp((await waitForTarget(debugPort, url)).webSocketDebuggerUrl).open();
    const report = [];
    for (const [width, height] of [[390,844], [360,420], [1440,900]]) {
      await client.command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await client.command('Page.reload', { ignoreCache: true });
      const status = await evaluateWhenReady(client, `new Promise(resolve=>{
        document.body.classList.add('status-active');
        document.querySelector('#phase').textContent='La voce non è disponibile in questo browser: puoi scrivere.';
        setTimeout(()=>{const a=document.querySelector('.copy').getBoundingClientRect(),b=document.querySelector('#phase').getBoundingClientRect(),c=document.querySelector('.dock').getBoundingClientRect();resolve({titleGap:b.top-a.bottom,dockGap:c.top-b.bottom})},700);
      })`);
      const statusShot = await client.command('Page.captureScreenshot', { format:'png', captureBeyondViewport:false });
      fs.writeFileSync(path.join(output, `status-${width}x${height}.png`), Buffer.from(statusShot.data,'base64'));
      if (status.titleGap < 0 || status.dockGap < 0) throw new Error('Status collision: '+JSON.stringify({width,height,...status}));
      const result = await evaluateWhenReady(client, `new Promise(resolve => {
        document.body.classList.add('conversation-active','keyboard-open');
        document.querySelector('#answer').innerHTML = Array.from({length:30},(_,i)=>'<p>Paragrafo '+i+': una risposta lunga deve restare leggibile senza attraversare i comandi in fondo.</p>').join('');
        setTimeout(()=>{
          scrollTo(0,document.body.scrollHeight / 2);
          const dock=document.querySelector('.dock'), privacy=document.querySelector('.privacy');
          const backing=getComputedStyle(dock,'::before');
          resolve({ gap:privacy.getBoundingClientRect().top-dock.getBoundingClientRect().bottom,
            backing:backing.backgroundImage, backingWidth:parseFloat(backing.width), width:innerWidth,
            padding:parseFloat(getComputedStyle(document.querySelector('.shell')).paddingBottom),
            occupied:dock.offsetHeight+privacy.offsetHeight });
        },800);
      })`);
      if (result.gap < 0 || result.backingWidth < width || !result.backing.includes('rgb(0, 0, 0)') || result.padding < result.occupied) throw new Error(JSON.stringify(result));
      const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, `${width}x${height}.png`), Buffer.from(screenshot.data, 'base64'));
      report.push({ width, height, ...result });
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log('Bottom bar: sfondo nero continuo, note separate e spazio riservato verificati su tre viewport.');
  } finally {
    try { await client?.command('Browser.close'); } catch {}
    client?.close();
    if (child && child.exitCode === null) child.kill();
    await gateway.stop();
    await removeTemporaryPath(profile);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode=1; });
