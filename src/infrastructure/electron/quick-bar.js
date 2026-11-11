/**
 * @module infrastructure/electron/quick-bar
 * @description Barra rapida sopra qualsiasi programma (Ctrl+Maiusc+Spazio): un campo in vetro al centro dello
 * schermo attivo. Invio passa la domanda alla UI principale e la apre; Esc o un clic altrove la chiude.
 */
const path = require('node:path');
const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');

// #region 01 — Documento (CSP chiusa, nessuna risorsa esterna)

const DOCUMENT = `<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>NexusNXS</title><style>
:root{color-scheme:dark;--cyan:#4be6e8}
*{box-sizing:border-box}html,body{margin:0;height:100%;background:transparent;overflow:hidden;font:15px/1.4 "Segoe UI Variable Text","Segoe UI",system-ui,sans-serif}
.bar{position:absolute;inset:10px;display:flex;align-items:center;gap:12px;padding:0 10px 0 16px;border-radius:20px;
 background:rgba(12,17,18,.86);border:1px solid rgba(75,230,232,.28);backdrop-filter:blur(24px) saturate(1.4);
 box-shadow:0 18px 50px -12px rgba(0,0,0,.75),0 0 0 1px rgba(255,255,255,.04) inset,0 0 36px rgba(75,230,232,.14);
 animation:in .26s cubic-bezier(.2,.9,.2,1) both}
@keyframes in{from{opacity:0;transform:translateY(-8px) scale(.98)}}
.orb{flex:none;width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#e9ffff,var(--cyan) 45%,#0b5d63 100%);box-shadow:0 0 16px rgba(75,230,232,.6);animation:pulse 2.4s ease-in-out infinite}
@keyframes pulse{50%{box-shadow:0 0 26px rgba(75,230,232,.85);transform:scale(1.06)}}
input{flex:1;min-width:0;height:100%;border:0;outline:0;background:transparent;color:#f7fbfb;font:inherit;font-size:17px}
input::placeholder{color:#8fa3a4}
kbd{flex:none;font:600 11px ui-monospace,monospace;color:#9fb3b4;padding:3px 7px;border-radius:7px;border:1px solid rgba(171,186,187,.25)}
.send{flex:none;width:38px;height:38px;border:0;border-radius:12px;display:grid;place-items:center;color:#020405;background:linear-gradient(100deg,var(--cyan),#8ff0c8);cursor:pointer;opacity:.35;transition:opacity .15s,transform .15s}
.send.ready{opacity:1}.send.ready:hover{transform:translateY(-1px)}
.screen{flex:none;height:34px;display:flex;align-items:center;gap:7px;padding:0 11px 0 9px;border-radius:11px;cursor:pointer;
 color:#a9bcbd;background:rgba(255,255,255,.035);border:1px solid rgba(171,186,187,.2);font-family:inherit;font-size:12.5px;font-weight:600;
 transition:color .18s,background .18s,border-color .18s,box-shadow .25s}
.screen:hover{color:#e8f6f6;border-color:rgba(171,186,187,.38)}
.screen[aria-pressed=true]{color:#dffcfc;background:rgba(75,230,232,.13);border-color:rgba(75,230,232,.55);box-shadow:0 0 18px rgba(75,230,232,.22)}
.screen svg{transition:transform .25s cubic-bezier(.2,.9,.2,1)}.screen[aria-pressed=true] svg{transform:scale(1.08)}
.screen:focus-visible,.send:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.bar,.orb{animation:none}.screen,.screen svg{transition:none}}
</style></head><body><form class="bar" autocomplete="off">
<span class="orb" aria-hidden="true"></span>
<input id="q" aria-label="Chiedi a NexusNXS" placeholder="Chiedi a NexusNXS…" maxlength="4000" spellcheck="true">
<button type="button" class="screen" aria-pressed="false" title="Allega una cattura dello schermo (Alt+S)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg><span>Schermo</span></button>
<kbd>Esc</kbd>
<button type="submit" class="send" aria-label="Invia"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
</form><script>
const form=document.querySelector('form'),input=document.getElementById('q'),send=document.querySelector('.send'),screenToggle=document.querySelector('.screen');
const sync=()=>send.classList.toggle('ready',input.value.trim().length>0);
const setScreen=(on)=>{screenToggle.setAttribute('aria-pressed',String(on));screenToggle.lastElementChild.textContent=on?'Schermo allegato':'Schermo';input.placeholder=on?'Chiedi qualcosa su ciò che vedi…':'Chiedi a NexusNXS…';};
screenToggle.addEventListener('click',()=>{setScreen(screenToggle.getAttribute('aria-pressed')!=='true');input.focus();});
input.addEventListener('input',sync);
form.addEventListener('submit',(event)=>{event.preventDefault();const text=input.value.trim();if(!text)return;window.nexusQuickBar.submit(text,{screen:screenToggle.getAttribute('aria-pressed')==='true'});input.value='';sync();setScreen(false);});
document.addEventListener('keydown',(event)=>{if(event.key==='Escape'){event.preventDefault();input.value='';sync();setScreen(false);window.nexusQuickBar.close();}
 else if(event.altKey&&(event.key==='s'||event.key==='S')){event.preventDefault();screenToggle.click();}});
// Ogni apertura riparte con lo schermo NON allegato: il consenso vale per una sola domanda.
window.nexusQuickBar.onShow(()=>{const bar=form;setScreen(false);bar.style.animation='none';void bar.offsetWidth;bar.style.animation='';input.focus();input.select();});
input.focus();
</script></body></html>`;

// #endregion

// #region 02 — Finestra

const WIDTH = 780;
const HEIGHT = 84;

/** Lato lungo e peso massimi della cattura: leggibile dal modello visivo, testo dello schermo ancora nitido. */
const CAPTURE_MAX_SIDE = 1920;
const CAPTURE_MAX_BYTES = 1_450_000;

/**
 * Cattura in memoria lo schermo indicato (quello dove era aperta la barra) come JPEG base64, oppure null.
 * Avviene solo dopo il gesto esplicito «Schermo» dell'utente e non viene mai scritta su disco altrove.
 */
async function captureDisplay(displayId) {
  try {
    const display = screen.getAllDisplays().find((item) => item.id === displayId) || screen.getPrimaryDisplay();
    const scale = display.scaleFactor || 1;
    const native = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) };
    const fit = Math.min(1, CAPTURE_MAX_SIDE / Math.max(native.width, native.height));
    const thumbnailSize = { width: Math.round(native.width * fit), height: Math.round(native.height * fit) };
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize, fetchWindowIcons: false });
    const source = sources.find((item) => String(item.display_id) === String(display.id)) || sources[0];
    if (!source || source.thumbnail.isEmpty()) return null;
    let image = source.thumbnail;
    for (const [quality, side] of [[84, CAPTURE_MAX_SIDE], [74, 1600], [66, 1280]]) {
      const size = image.getSize();
      if (Math.max(size.width, size.height) > side) image = image.resize({ width: Math.round(size.width * side / Math.max(size.width, size.height)), quality: 'best' });
      const jpeg = image.toJPEG(quality);
      if (jpeg.length <= CAPTURE_MAX_BYTES) return jpeg.toString('base64');
    }
    return null;
  } catch {
    return null;
  }
}

function createQuickBar({ onSubmit, logger }) {
  let window = null;
  let shownOn = null;
  const position = () => {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    shownOn = display.id;
    const area = display.workArea;
    return { x: Math.round(area.x + (area.width - Math.min(WIDTH, area.width - 32)) / 2), y: Math.round(area.y + area.height * 0.24), width: Math.min(WIDTH, area.width - 32), height: HEIGHT };
  };
  const hide = () => { if (window && !window.isDestroyed() && window.isVisible()) window.hide(); };
  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    window = new BrowserWindow({
      ...position(), frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false, fullscreenable: false, minimizable: false, maximizable: false,
      title: 'NexusNXS',
      webPreferences: {
        preload: path.join(__dirname, 'quick-bar-preload.js'), contextIsolation: true, nodeIntegration: false,
        sandbox: true, devTools: false, webSecurity: true, spellcheck: true
      }
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.on('blur', hide);
    window.on('closed', () => { window = null; });
    window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(DOCUMENT)}`);
    return window;
  };
  const fromBar = (event) => window && !window.isDestroyed() && event.sender === window.webContents;
  const submit = (event, text, options) => {
    if (!fromBar(event)) return;
    const displayId = shownOn;
    hide();
    const run = async () => {
      // La barra deve sparire dalla cattura: si attende un fotogramma del compositore.
      const image = options?.screen === true ? await new Promise((resolve) => setTimeout(resolve, 180)).then(() => captureDisplay(displayId)) : null;
      if (options?.screen === true && !image) logger?.warn?.('Barra rapida: cattura dello schermo non riuscita, invio solo il testo.');
      return onSubmit(String(text || ''), { image });
    };
    run().catch((error) => logger?.warn?.('Barra rapida: invio non riuscito.', { error }));
  };
  const close = (event) => { if (fromBar(event)) hide(); };
  ipcMain.on('nexus:quick-bar-submit', submit);
  ipcMain.on('nexus:quick-bar-close', close);
  return {
    toggle() {
      const bar = ensure();
      if (bar.isVisible() && bar.isFocused()) { hide(); return; }
      bar.setBounds(position());
      const reveal = () => { bar.show(); bar.focus(); bar.webContents.send('nexus:quick-bar-show'); };
      if (bar.webContents.isLoadingMainFrame()) bar.webContents.once('did-finish-load', reveal); else reveal();
    },
    hide,
    dispose() {
      ipcMain.removeListener('nexus:quick-bar-submit', submit);
      ipcMain.removeListener('nexus:quick-bar-close', close);
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    }
  };
}

module.exports = { createQuickBar };

// #endregion
