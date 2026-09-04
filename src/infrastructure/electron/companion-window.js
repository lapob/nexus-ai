/**
 * @module infrastructure/electron/companion-window
 * @description Presenza desktop leggera, trascinabile e coerente su tutti i display.
 */
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { interactionStatePalette } = require('../../core/interaction-state-protocol');

const PRESENCE_SIZE = 168;
const DISPLAY_MARGIN = 18;
const PRESENCE_POINTER_CHANNEL = 'nexus:system-presence-pointer';
const PRESENCE_OPEN_CHANNEL = 'nexus:system-presence-open';
const PRESENCE_VOICE_CHANNEL = 'nexus:system-presence-voice';
const PRESENCE_STATE_CHANNEL = 'nexus:system-presence-state';
const PRESENCE_CONFIG_CHANNEL = 'nexus:system-presence-config';
const PRESENCE_MENU_CHANNEL = 'nexus:system-presence-menu';
const PRESENCE_MENU_ACTIONS = new Set(['open-main', 'minimize-main', 'hide-presence', 'quit-desktop']);
const PRESENCE_STATES = new Set([
  'booting', 'idle', 'listening', 'speaking', 'thinking', 'responding',
  'executing', 'permission', 'offline', 'error'
]);
const PRESENCE_APPEARANCES = new Set(['neural', 'saturn-experimental', 'jarvis-reactor']);
const PRESENCE_STATE_PALETTE = interactionStatePalette({ rgb: true });
const PRESENCE_STATE_PRIORITY = Object.freeze({
  booting: 2, idle: 0, listening: 5, speaking: 4, thinking: 3,
  responding: 3, executing: 6, permission: 8, offline: 7, error: 9
});

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(value, maximum));
}

function finiteBounds(bounds) {
  return bounds && Number.isFinite(bounds.x) && Number.isFinite(bounds.y);
}

function normalizePresenceConfiguration(value = {}) {
  const state = PRESENCE_STATES.has(String(value.state)) ? String(value.state) : 'idle';
  const motion = ['system', 'reduced', 'full'].includes(String(value.motion)) ? String(value.motion) : 'system';
  const quality = ['auto', 'efficient', 'balanced', 'ultra', 'super'].includes(String(value.quality))
    ? String(value.quality)
    : 'auto';
  const appearance = PRESENCE_APPEARANCES.has(String(value.appearance))
    ? String(value.appearance)
    : 'saturn-experimental';
  return Object.freeze({
    state,
    appearance,
    motion,
    quality,
    wakeWordEnabled: value.wakeWordEnabled === true,
    wakeWordConfidence: clamp(Number.isFinite(Number(value.wakeWordConfidence)) ? Number(value.wakeWordConfidence) : 0.84, 0.7, 0.95),
    wakeWordCooldownMs: Math.round(clamp(Number.isFinite(Number(value.wakeWordCooldownMs)) ? Number(value.wakeWordCooldownMs) : 5_000, 2_000, 30_000)),
    wakeWordSuspended: value.wakeWordSuspended === true,
    wakeWordListening: value.wakeWordListening === true
  });
}

function presenceTransitionDelay(current, next) {
  const from = PRESENCE_STATES.has(String(current)) ? String(current) : 'idle';
  const to = PRESENCE_STATES.has(String(next)) ? String(next) : 'idle';
  if (from === to || PRESENCE_STATE_PRIORITY[to] >= PRESENCE_STATE_PRIORITY[from]) return 0;
  if (to === 'idle') return 420;
  return 140;
}

// #region 01 - Posizione sicura multi-monitor

function serializeDisplayPosition(bounds, display) {
  const area = display?.workArea;
  if (!finiteBounds(bounds) || !area) return null;
  const travelX = Math.max(1, area.width - (bounds.width || PRESENCE_SIZE) - (DISPLAY_MARGIN * 2));
  const travelY = Math.max(1, area.height - (bounds.height || PRESENCE_SIZE) - (DISPLAY_MARGIN * 2));
  return {
    x: clamp((bounds.x - area.x - DISPLAY_MARGIN) / travelX, 0, 1),
    y: clamp((bounds.y - area.y - DISPLAY_MARGIN) / travelY, 0, 1)
  };
}

function systemPresenceBounds(display, savedPosition, size = PRESENCE_SIZE) {
  const area = display?.workArea;
  if (!area) return { x: DISPLAY_MARGIN, y: DISPLAY_MARGIN, width: PRESENCE_SIZE, height: PRESENCE_SIZE };
  const travelX = Math.max(0, area.width - size - (DISPLAY_MARGIN * 2));
  const travelY = Math.max(0, area.height - size - (DISPLAY_MARGIN * 2));
  const relativeX = Number.isFinite(savedPosition?.x) ? clamp(savedPosition.x, 0, 1) : 1;
  const relativeY = Number.isFinite(savedPosition?.y) ? clamp(savedPosition.y, 0, 1) : 1;
  return {
    x: Math.round(area.x + DISPLAY_MARGIN + (travelX * relativeX)),
    y: Math.round(area.y + DISPLAY_MARGIN + (travelY * relativeY)),
    width: size,
    height: size
  };
}

function automaticPresenceDisplayId(descriptors = []) {
  if (!Array.isArray(descriptors) || descriptors.length === 0) return 'primary';
  if (descriptors.length === 2) {
    return descriptors.find((entry) => entry?.logicalId !== 'primary')?.logicalId
      || descriptors[1]?.logicalId
      || descriptors[0]?.logicalId
      || 'primary';
  }
  return descriptors.find((entry) => entry?.logicalId === 'primary')?.logicalId
    || descriptors[0]?.logicalId
    || 'primary';
}

function ambientPresenceBounds(display, size = PRESENCE_SIZE) {
  const area = display?.workArea;
  if (!area) return { x: DISPLAY_MARGIN, y: DISPLAY_MARGIN, width: PRESENCE_SIZE, height: PRESENCE_SIZE };
  return {
    x: Math.round(area.x + ((area.width - size) / 2)),
    y: Math.round(area.y + ((area.height - size) / 2)),
    width: size,
    height: size
  };
}

// #endregion
// #region 02 - Documento CSS-only derivato dai tre visualizer

function systemPresenceDocument({ interactive = false, locale = 'en', configuration = {} } = {}) {
  const language = /^it(?:-|$)/i.test(String(locale || '')) ? 'it' : 'en';
  const copy = language === 'it' ? {
    open: 'Apri NexusNXS', talk: 'Parla con NexusNXS', idle: 'NexusNXS', booting: 'Avvio', listening: 'In ascolto',
    speaking: 'Sto parlando', thinking: 'Sto pensando', responding: 'Sto rispondendo',
    executing: 'Sto lavorando', permission: 'Conferma richiesta', offline: 'Non raggiungibile',
    error: 'Attenzione', wake: 'Richiamo vocale locale attivo',
    menuOpen: 'Apri NexusNXS', menuMinimize: 'Riduci al tray', menuHide: 'Nascondi Presence', menuQuit: 'Esci da NexusNXS'
  } : {
    open: 'Open NexusNXS', talk: 'Talk to NexusNXS', idle: 'NexusNXS', booting: 'Starting', listening: 'Listening',
    speaking: 'Speaking', thinking: 'Thinking', responding: 'Responding',
    executing: 'Working', permission: 'Confirmation required', offline: 'Unavailable',
    error: 'Attention', wake: 'Local wake word active',
    menuOpen: 'Open NexusNXS', menuMinimize: 'Minimize to tray', menuHide: 'Hide Presence', menuQuit: 'Quit NexusNXS'
  };
  const initial = normalizePresenceConfiguration(configuration);
  const interactiveAttribute = interactive ? 'true' : 'false';
  const presenceParticles = Array.from({ length: 18 }, (_, index) => {
    const angle = (index / 18) * Math.PI * 2;
    const radius = 34 + ((index * 17) % 15);
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    const driftX = Math.cos(angle + 0.7) * (4 + (index % 4));
    const driftY = Math.sin(angle + 0.7) * (4 + (index % 3));
    return `<i style="--x:${x.toFixed(2)}%;--y:${y.toFixed(2)}%;--dx:${driftX.toFixed(2)}px;--dy:${driftY.toFixed(2)}px;--delay:${(-index * 0.23).toFixed(2)}s;--size:${index % 5 === 0 ? 2.4 : index % 3 === 0 ? 1.8 : 1.2}px"></i>`;
  }).join('');
  const stateColorStyles = Object.entries(PRESENCE_STATE_PALETTE)
    .map(([state, rgb]) => `html .presence[data-state=${state}]{--accent:${rgb.join(',')}}`)
    .join('');
  const contextualStateStyles = `
${stateColorStyles}
html .presence{width:168px;height:168px;transform:scale(var(--presence-scale,1));transform-origin:top left}
.presence[data-state=listening] .aura{animation:listen-wave 1.35s ease-out infinite}
.presence[data-state=listening] .presence-particles i{animation-duration:2.6s;opacity:.72}
.presence[data-state=thinking] .reactor{animation-duration:5.4s}
.presence[data-state=thinking] .presence-particles{animation-duration:9s}
.presence[data-state=responding] .core,.presence[data-state=speaking] .core{animation:voice-core .82s ease-in-out infinite}
.presence[data-state=responding] .presence-particles i,.presence[data-state=speaking] .presence-particles i{animation-duration:2.2s}
.presence[data-state=executing] .reactor{animation-duration:2.8s}
.presence[data-state=permission] .state,.presence[data-state=offline] .state,.presence[data-state=error] .state{opacity:1;transform:none}
.presence[data-state=error] .drag-ring{animation:error-attention 2.4s ease-in-out 2}
@keyframes listen-wave{0%{opacity:.68;transform:scale(.78)}72%,100%{opacity:0;transform:scale(1.05)}}
@keyframes voice-core{50%{filter:brightness(1.25);transform:translate(-50%,-50%) scale(1.08)}}
@keyframes error-attention{20%,60%{filter:brightness(1.22) drop-shadow(0 0 18px rgba(var(--accent),.32))}40%,80%{filter:brightness(.9)}}
.presence-particles{position:absolute;inset:12px;border-radius:50%;pointer-events:none;animation:presence-materialize .72s cubic-bezier(.16,1,.3,1) both,particle-orbit 18s linear infinite}
.presence-particles i{position:absolute;left:var(--x);top:var(--y);width:var(--size);height:var(--size);border-radius:50%;background:rgba(var(--accent),.86);box-shadow:0 0 7px rgba(var(--accent),.48);opacity:.42;transform:translate(-50%,-50%);animation:particle-breathe 4.6s ease-in-out var(--delay) infinite}
.presence[data-quality=efficient] .presence-particles i:nth-child(even){display:none}
@keyframes presence-materialize{from{opacity:0;filter:blur(8px);transform:scale(1.28)}to{opacity:1;filter:blur(0);transform:scale(1)}}
@keyframes particle-orbit{to{transform:rotate(360deg)}}
@keyframes particle-breathe{50%{opacity:.84;transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(1.22)}}`;
  return `<!doctype html>
<html lang="${language}"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${contextualStateStyles}</style>
<script>addEventListener('DOMContentLoaded',()=>{const fit=()=>document.documentElement.style.setProperty('--presence-scale',String(innerWidth/168));fit();addEventListener('resize',fit);});</script>
<style>
:root{color-scheme:dark;--accent:86,222,224}*{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:transparent!important;font-family:Inter,system-ui,sans-serif;user-select:none}.presence{position:relative;display:grid;width:100%;height:100%;place-items:center;isolation:isolate;opacity:.72;transition:opacity .28s ease;background:transparent}.presence:hover,.presence:focus-within,.presence:not([data-state=idle]){opacity:1}.aura{position:absolute;width:128px;height:128px;border-radius:50%;background:radial-gradient(circle,rgba(var(--accent),.09),rgba(var(--accent),.018) 48%,transparent 70%);filter:blur(1.5px);animation:breathe 6s ease-in-out infinite;pointer-events:none}.drag-ring{position:relative;width:118px;height:118px;border-radius:50%;transform:translateZ(0);filter:drop-shadow(0 15px 26px rgba(0,0,0,.34));transition:filter .2s ease,transform .2s ease}.drag-ring[data-interactive=true]{-webkit-app-region:drag;cursor:grab}.drag-ring[data-interactive=true]:active{cursor:grabbing}.visual{position:absolute;inset:0;border-radius:50%;transition:opacity .26s ease,transform .26s ease}.neural{opacity:0;background:radial-gradient(circle at 43% 38%,rgba(237,255,255,.96) 0 2%,rgba(var(--accent),.82) 5%,rgba(35,134,143,.62) 25%,rgba(4,23,26,.94) 61%,rgba(0,4,5,.76) 72%);box-shadow:inset 0 0 0 1px rgba(var(--accent),.18),inset 0 0 28px rgba(var(--accent),.16),0 0 22px rgba(var(--accent),.16)}.neural:before,.neural:after{content:'';position:absolute;inset:12px;border-radius:47% 53% 42% 58%;border:1px solid rgba(218,255,255,.22);animation:neural-flow 9s linear infinite}.neural:after{inset:25px;border-color:rgba(var(--accent),.28);animation-direction:reverse;animation-duration:6.5s}.saturn{opacity:0;transform:rotate(-13deg);background:radial-gradient(circle,rgba(226,255,255,.96) 0 2%,rgba(var(--accent),.72) 5%,rgba(15,69,74,.85) 18%,rgba(1,10,12,.97) 34%,transparent 36%)}.saturn:before,.saturn:after{content:'';position:absolute;left:2px;right:2px;top:42px;height:31px;border:2px solid rgba(var(--accent),.62);border-left-color:rgba(225,255,255,.9);border-radius:50%;box-shadow:0 0 10px rgba(var(--accent),.28),inset 0 0 9px rgba(var(--accent),.12);animation:orbit-pulse 4.8s ease-in-out infinite}.saturn:after{left:17px;right:17px;top:48px;height:20px;border-width:1px;border-color:rgba(207,252,253,.36);animation-delay:-1.4s}.reactor{opacity:0;background:repeating-conic-gradient(from 4deg,rgba(var(--accent),.8) 0 5deg,transparent 5deg 19deg);mask:radial-gradient(circle,transparent 0 24%,#000 25% 37%,transparent 38% 50%,#000 51% 54%,transparent 55%);filter:drop-shadow(0 0 7px rgba(var(--accent),.34));animation:reactor-spin 18s linear infinite}.reactor:before,.reactor:after{content:'';position:absolute;inset:17px;border-radius:50%;border:1px solid rgba(218,255,255,.34);border-left-color:transparent;border-bottom-color:transparent;animation:reactor-spin 7s linear infinite reverse}.reactor:after{inset:35px;border-color:rgba(var(--accent),.58);border-right-color:transparent;animation-duration:4.8s;animation-direction:normal}.presence[data-appearance=neural] .neural,.presence[data-appearance=saturn-experimental] .saturn,.presence[data-appearance=jarvis-reactor] .reactor{opacity:1}.core{position:absolute;z-index:5;left:50%;top:50%;width:48px;height:48px;border:0;border-radius:50%;padding:0;background:radial-gradient(circle,rgba(236,255,255,.98) 0 5%,rgba(var(--accent),.9) 9%,rgba(8,42,45,.96) 49%,rgba(1,8,9,.98) 72%);box-shadow:0 0 0 1px rgba(var(--accent),.22),0 0 17px rgba(var(--accent),.27);outline:0;transform:translate(-50%,-50%);cursor:default;-webkit-app-region:no-drag;-webkit-tap-highlight-color:transparent;transition:transform .18s ease,filter .18s ease}.core[data-interactive=true]{cursor:pointer}.core[data-interactive=true]:hover,.core[data-interactive=true]:focus-visible{filter:brightness(1.18);transform:translate(-50%,-50%) scale(1.07)}.core[data-interactive=true]:focus-visible{outline:2px solid rgba(var(--accent),.62);outline-offset:5px}.state{position:absolute;z-index:6;bottom:3px;max-width:156px;padding:5px 9px;border-radius:999px;color:rgba(215,239,240,.82);background:rgba(3,12,13,.72);font-size:9px;letter-spacing:.075em;text-transform:uppercase;white-space:nowrap;opacity:0;transform:translateY(3px);transition:opacity .18s ease,transform .18s ease;backdrop-filter:blur(9px);pointer-events:none}.presence:hover .state,.presence:focus-within .state{opacity:1;transform:none}.wake-indicator{position:absolute;z-index:7;right:21px;top:21px;width:8px;height:8px;border-radius:50%;background:rgb(var(--accent));box-shadow:0 0 0 3px rgba(var(--accent),.11),0 0 10px rgba(var(--accent),.52);opacity:0;transform:scale(.72);pointer-events:none}.presence[data-interactive=true][data-wake-listening=true] .wake-indicator{opacity:.92;transform:scale(1);animation:wake-pulse 2.2s ease-in-out infinite}.presence:is([data-state=thinking],[data-state=responding],[data-state=executing]) .drag-ring{animation:work 1.45s ease-in-out infinite}.presence[data-state=listening] .visual{filter:brightness(1.15) saturate(1.08)}.presence[data-state=speaking] .visual{animation-duration:.72s}.presence[data-state=permission]{--accent:255,195,93}.presence[data-state=offline] .drag-ring{filter:saturate(.18);opacity:.55}.presence[data-state=error]{--accent:235,112,103}.presence-menu{position:absolute;z-index:20;inset:7px;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:8px;border:1px solid rgba(var(--accent),.16);border-radius:22px;background:rgba(2,10,12,.92);box-shadow:0 18px 44px rgba(0,0,0,.44),inset 0 1px rgba(255,255,255,.035);backdrop-filter:blur(18px);-webkit-app-region:no-drag;animation:menu-in .2s cubic-bezier(.16,1,.3,1) both}.presence-menu[hidden]{display:none}.presence-menu button{min-height:31px;border:0;border-radius:12px;padding:6px 10px;color:rgba(226,244,244,.9);background:transparent;font:600 10px/1.15 Inter,system-ui,sans-serif;text-align:left;letter-spacing:.01em;cursor:pointer}.presence-menu button:hover,.presence-menu button:focus-visible{color:#fff;background:rgba(var(--accent),.105);outline:1px solid rgba(var(--accent),.18)}.presence-menu button[data-action=quit-desktop]{color:rgba(255,152,143,.92)}.presence[data-menu-open=true] :is(.aura,.presence-particles,.drag-ring,.state,.wake-indicator){opacity:0!important;pointer-events:none}.presence[data-quality=efficient] .aura,.presence[data-quality=efficient] .visual:after{display:none}.presence[data-motion=reduced] *{animation:none!important;transition:none!important}@keyframes menu-in{from{opacity:0;transform:scale(.94);filter:blur(6px)}to{opacity:1;transform:scale(1);filter:blur(0)}}@keyframes breathe{50%{opacity:.58;transform:scale(.94)}}@keyframes neural-flow{to{transform:rotate(360deg)}}@keyframes orbit-pulse{50%{transform:scaleX(.95);opacity:.68}}@keyframes reactor-spin{to{transform:rotate(360deg)}}@keyframes work{50%{filter:brightness(1.18) drop-shadow(0 15px 26px rgba(0,0,0,.34));transform:scale(1.025)}}@keyframes wake-pulse{50%{opacity:.5;transform:scale(.78)}}@media(prefers-reduced-motion:reduce){.presence[data-motion=system] *{animation:none!important;transition:none!important}}
</style></head><body><main class="presence" data-interactive="${interactiveAttribute}" data-state="${initial.state}" data-appearance="${initial.appearance}" data-motion="${initial.motion}" data-quality="${initial.quality}" data-wake-listening="${initial.wakeWordListening}" data-menu-open="false"><div class="aura" aria-hidden="true"></div><span class="presence-particles" aria-hidden="true">${presenceParticles}</span><span class="wake-indicator" role="status" aria-label="${copy.wake}" title="${copy.wake}"></span><div class="drag-ring" data-interactive="${interactiveAttribute}" ${interactive ? `title="${copy.open}"` : 'aria-hidden="true"'}><span class="visual neural" aria-hidden="true"></span><span class="visual saturn" aria-hidden="true"></span><span class="visual reactor" aria-hidden="true"></span><button class="core" data-interactive="${interactiveAttribute}" ${interactive ? `aria-label="${copy.talk}" title="${copy.talk}"` : 'aria-hidden="true" tabindex="-1"'}></button></div><span class="state" role="status">${copy[initial.state] || copy.idle}</span><section class="presence-menu" aria-label="NexusNXS" hidden><button data-action="open-main">${copy.menuOpen}</button><button data-action="minimize-main">${copy.menuMinimize}</button><button data-action="hide-presence">${copy.menuHide}</button><button data-action="quit-desktop">${copy.menuQuit}</button></section></main>
<script>(()=>{const copy=${JSON.stringify(copy)};const bridge=window.nexusPresence;const root=document.querySelector('.presence');const core=document.querySelector('.core');const ring=document.querySelector('.drag-ring');const menu=document.querySelector('.presence-menu');if(!bridge)return;const closeMenu=()=>{menu.hidden=true;root.dataset.menuOpen='false'};const openMenu=()=>{menu.hidden=false;root.dataset.menuOpen='true';bridge.setInteractive(true);menu.querySelector('button')?.focus()};bridge.onState((value)=>{const state=String(value||'idle');root.dataset.state=state;document.querySelector('.state').textContent=copy[state]||copy.idle});bridge.onConfiguration((value)=>{const next=value&&typeof value==='object'?value:{};root.dataset.appearance=['neural','saturn-experimental','jarvis-reactor'].includes(String(next.appearance))?String(next.appearance):'saturn-experimental';root.dataset.motion=['system','reduced','full'].includes(String(next.motion))?String(next.motion):'system';root.dataset.quality=['auto','efficient','balanced','ultra','super'].includes(String(next.quality))?String(next.quality):'auto';root.dataset.wakeListening=String(next.wakeWordListening===true)});if(core.dataset.interactive==='true'){let active=false;let clickTimer=null;const update=(event)=>{if(root.dataset.menuOpen==='true')return;const box=ring.getBoundingClientRect();const dx=event.clientX-(box.left+box.width/2),dy=event.clientY-(box.top+box.height/2);const inside=Math.hypot(dx,dy)<=box.width*.58;if(inside!==active){active=inside;bridge.setInteractive(inside)}};addEventListener('mousemove',update,{passive:true});addEventListener('mouseleave',()=>{if(root.dataset.menuOpen!=='true'){active=false;bridge.setInteractive(false)}});addEventListener('contextmenu',(event)=>{event.preventDefault();openMenu()});addEventListener('keydown',(event)=>{if(event.key==='Escape'&&root.dataset.menuOpen==='true'){closeMenu();bridge.setInteractive(false)}});menu.addEventListener('click',(event)=>{const action=event.target.closest('button')?.dataset.action;if(!action)return;closeMenu();bridge.menu(action)});core.addEventListener('click',()=>{clearTimeout(clickTimer);clickTimer=setTimeout(()=>bridge.startVoice(),210)});core.addEventListener('dblclick',()=>{clearTimeout(clickTimer);bridge.openMain()});core.addEventListener('keydown',(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();bridge.startVoice()}else if(event.key==='ArrowUp'){event.preventDefault();bridge.openMain()}})}})()</script></body></html>`;
}

// #endregion
// #region 03 - Ciclo di vita deterministico della Presence

function createSystemPresenceManager({ logger, openPrimaryWindow, closePrimaryWindow, quitApplication, activateVoice, defaultSystemPresence = false }) {
  const presenceStatePath = path.join(app.getPath('userData'), 'system-presence.json');
  const presencePreload = path.join(__dirname, 'system-presence-preload.js');
  let displayListenersAttached = false;
  let applicationVisible = false;
  let presenceState = readJson(presenceStatePath, { version: 4, positions: {} });
  let systemPresenceEnabled = typeof presenceState.enabled === 'boolean'
    ? presenceState.enabled
    : defaultSystemPresence === true;
  let presenceConfiguration = normalizePresenceConfiguration({
    appearance: presenceState.appearance,
    motion: presenceState.motion,
    quality: presenceState.quality,
    wakeWordEnabled: presenceState.wakeWordEnabled,
    wakeWordConfidence: presenceState.wakeWordConfidence,
    wakeWordCooldownMs: presenceState.wakeWordCooldownMs
  });
  let currentPresenceState = 'idle';
  let selectedLogicalDisplayId = typeof presenceState.selectedDisplayId === 'string'
    ? presenceState.selectedDisplayId
    : 'primary';
  let displaySelectionMode = presenceState.displaySelectionMode === 'manual'
    || (Number(presenceState.version || 0) < 4 && selectedLogicalDisplayId !== 'primary')
    ? 'manual'
    : 'automatic';
  let openingPromise = null;
  let presenceStateTimer = null;
  const presenceWindows = new Map();
  const presenceMoveTimers = new Map();

  function readJson(filePath, fallback) {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return value && typeof value === 'object' ? value : fallback;
    } catch { return fallback; }
  }

  function writeJson(filePath, value, warning) {
    try { fs.writeFileSync(filePath, JSON.stringify(value)); }
    catch (error) { logger?.warn?.(warning, { error }); }
  }

  function persistentPresenceState() {
    return {
      version: 4,
      enabled: systemPresenceEnabled,
      selectedDisplayId: selectedLogicalDisplayId,
      displaySelectionMode,
      positions: { ...(presenceState.positions || {}) },
      appearance: presenceConfiguration.appearance,
      motion: presenceConfiguration.motion,
      quality: presenceConfiguration.quality,
      wakeWordEnabled: presenceConfiguration.wakeWordEnabled,
      wakeWordConfidence: presenceConfiguration.wakeWordConfidence,
      wakeWordCooldownMs: presenceConfiguration.wakeWordCooldownMs
    };
  }

  function persistPresenceState(warning) {
    presenceState = persistentPresenceState();
    writeJson(presenceStatePath, presenceState, warning);
  }

  function attachDisplayListeners() {
    if (displayListenersAttached) return;
    screen.on('display-added', handleDisplayChange);
    screen.on('display-removed', handleDisplayChange);
    screen.on('display-metrics-changed', handleDisplayChange);
    displayListenersAttached = true;
  }

  function detachDisplayListeners() {
    if (!displayListenersAttached) return;
    screen.removeListener('display-added', handleDisplayChange);
    screen.removeListener('display-removed', handleDisplayChange);
    screen.removeListener('display-metrics-changed', handleDisplayChange);
    displayListenersAttached = false;
  }

  function presenceSender(event) {
    for (const entry of presenceWindows.values()) {
      if (!entry.window.isDestroyed() && entry.window.webContents.id === event.sender.id) return entry;
    }
    return null;
  }

  function onPresencePointer(event, enabled) {
    const entry = presenceSender(event);
    if (!entry) return;
    entry.pointerActive = enabled === true;
    entry.window.setIgnoreMouseEvents(enabled !== true, enabled === true ? undefined : { forward: true });
    applyPresenceOpacity(entry);
  }

  function applyPresenceOpacity(entry) {
    if (!entry?.window || entry.window.isDestroyed() || typeof entry.window.setOpacity !== 'function') return;
    const activeState = currentPresenceState !== 'idle';
    const opacity = entry.menuOpen || entry.pointerActive || entry.window.isFocused?.()
      ? 1
      : activeState ? 0.9 : applicationVisible ? 0.48 : 0.66;
    entry.window.setOpacity(opacity);
  }

  function onPresenceMenu(event, requestedAction) {
    const entry = presenceSender(event);
    const action = String(requestedAction || '');
    if (!entry || !PRESENCE_MENU_ACTIONS.has(action)) return;
    entry.menuOpen = false;
    entry.pointerActive = false;
    entry.window.setIgnoreMouseEvents(true, { forward: true });
    applyPresenceOpacity(entry);
    Promise.resolve(action === 'open-main' ? openPrimaryWindow?.()
      : action === 'minimize-main' ? closePrimaryWindow?.()
        : action === 'hide-presence' ? setSystemPresenceEnabled(false)
          : quitApplication?.())
      .catch((error) => logger?.warn?.('Azione menu Presence non riuscita.', { action, error }));
  }

  function onPresenceOpen(event) {
    if (!presenceSender(event) || openingPromise) return;
    openingPromise = Promise.resolve()
      .then(() => openPrimaryWindow?.())
      .then((result) => {
        if (result?.error || result?.launched === false) {
          logger?.warn?.('Apertura di NexusNXS dalla Presence non riuscita.', { code: result?.error?.code });
          return false;
        }
        setApplicationVisible(true);
        return true;
      })
      .catch((error) => {
        logger?.warn?.('Apertura di NexusNXS dalla Presence non riuscita.', { error });
        return false;
      })
      .finally(() => { openingPromise = null; });
  }

  function onPresenceVoice(event) {
    if (!presenceSender(event) || openingPromise) return;
    openingPromise = Promise.resolve()
      .then(() => activateVoice?.())
      .then((result) => {
        if (result?.error || result?.launched === false) {
          schedulePresenceState('idle');
          logger?.warn?.('Attivazione vocale dalla Presence non riuscita.', { code: result?.error?.code, reason: result?.reason });
          return false;
        }
        return true;
      })
      .catch((error) => {
        schedulePresenceState('idle');
        logger?.warn?.('Attivazione vocale dalla Presence non riuscita.', { error });
        return false;
      })
      .finally(() => { openingPromise = null; });
  }

  ipcMain.on(PRESENCE_POINTER_CHANNEL, onPresencePointer);
  ipcMain.on(PRESENCE_OPEN_CHANNEL, onPresenceOpen);
  ipcMain.on(PRESENCE_VOICE_CHANNEL, onPresenceVoice);
  ipcMain.on(PRESENCE_MENU_CHANNEL, onPresenceMenu);

  function savePresencePosition(entry) {
    if (!entry || entry.window.isDestroyed() || entry.animation) return;
    const display = screen.getDisplayMatching(entry.window.getBounds());
    const serialized = serializeDisplayPosition(entry.window.getBounds(), display);
    if (!serialized) return;
    presenceState = {
      ...persistentPresenceState(),
      positions: { ...(presenceState.positions || {}), [String(display.id)]: serialized }
    };
    const descriptor = displayDescriptors().find((item) => item.displayId === String(display.id));
    if (descriptor) {
      presenceWindows.delete(entry.displayId);
      entry.displayId = descriptor.displayId;
      presenceWindows.set(entry.displayId, entry);
      selectedLogicalDisplayId = descriptor.logicalId;
      displaySelectionMode = 'manual';
    }
    entry.detached = true;
    presenceState = { ...presenceState, ...persistentPresenceState() };
    writeJson(presenceStatePath, presenceState, 'Posizione Presence non salvata.');
    syncDisplays();
  }

  function animatePresenceBounds(entry, target, display) {
    if (JSON.stringify(entry.targetBounds) === JSON.stringify(target)) return;
    clearTimeout(entry.animation);
    const from = entry.window.getBounds();
    entry.targetBounds = target;
    const reduced = presenceConfiguration.motion === 'reduced' || (presenceConfiguration.motion !== 'full' && require('electron').systemPreferences?.getAnimationSettings?.().prefersReducedMotion);
    const duration = reduced || !entry.window.isVisible() ? 0 : 440;
    const started = Date.now();
    const tick = () => {
      if (entry.window.isDestroyed()) return;
      const progress = duration ? Math.min(1, (Date.now() - started) / duration) : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      entry.window.setBounds(Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, Math.round(from[key] + (target[key] - from[key]) * eased)])), false);
      entry.animation = progress < 1 ? setTimeout(tick, 1000 / Math.min(120, Math.max(60, display.displayFrequency || 60))) : null;
    };
    tick();
  }

  function closePresenceWindow(displayId) {
    const entry = presenceWindows.get(displayId);
    clearTimeout(entry?.animation);
    const timer = presenceMoveTimers.get(displayId);
    if (timer) clearTimeout(timer);
    presenceMoveTimers.delete(displayId);
    if (entry?.window && !entry.window.isDestroyed()) entry.window.destroy();
    presenceWindows.delete(displayId);
  }

  function createPresenceWindow(display, primary) {
    const displayId = String(display.id);
    const bounds = systemPresenceBounds(display, presenceState.positions?.[displayId]);
    const presenceWindow = new BrowserWindow({
      ...bounds,
      minWidth: 96, minHeight: 96,
      maxWidth: 384, maxHeight: 384,
      frame: false, transparent: true, backgroundColor: '#00000000', resizable: false,
      movable: true, alwaysOnTop: true, skipTaskbar: true, hasShadow: false, show: false,
      focusable: true, fullscreenable: false, minimizable: false, maximizable: false,
      title: primary ? 'NexusNXS' : 'NexusNXS Presence',
      webPreferences: {
        preload: presencePreload, contextIsolation: true, nodeIntegration: false,
        sandbox: true, devTools: false, webSecurity: true, backgroundThrottling: true
      }
    });
    const entry = { displayId, primary, ambientCentered: false, pointerActive: false, menuOpen: false, window: presenceWindow };
    presenceWindows.set(displayId, entry);
    presenceWindow.setAlwaysOnTop(true, 'floating');
    presenceWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    presenceWindow.setIgnoreMouseEvents(true, { forward: true });
    presenceWindow.setBackgroundColor?.('#00000000');
    presenceWindow.setOpacity?.(applicationVisible ? 0.48 : 0.66);
    presenceWindow.on('focus', () => applyPresenceOpacity(entry));
    presenceWindow.on('blur', () => applyPresenceOpacity(entry));
    presenceWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    presenceWindow.webContents.on('will-navigate', (navigationEvent) => navigationEvent.preventDefault());
    presenceWindow.on('move', () => {
      if (entry.animation || JSON.stringify(presenceWindow.getBounds()) === JSON.stringify(entry.targetBounds)) return;
      const current = presenceMoveTimers.get(displayId);
      if (current) clearTimeout(current);
      const timer = setTimeout(() => {
        presenceMoveTimers.delete(displayId);
        savePresencePosition(entry);
      }, 220);
      timer.unref?.();
      presenceMoveTimers.set(displayId, timer);
    });
    presenceWindow.on('closed', () => {
      clearTimeout(entry.animation);
      const timer = presenceMoveTimers.get(displayId);
      if (timer) clearTimeout(timer);
      presenceMoveTimers.delete(displayId);
      if (presenceWindows.get(entry.displayId)?.window === presenceWindow) presenceWindows.delete(entry.displayId);
    });
    const document = systemPresenceDocument({
      interactive: true,
      locale: app.getLocale?.() || 'en',
      configuration: { ...presenceConfiguration, state: currentPresenceState }
    });
    presenceWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
    presenceWindow.once('ready-to-show', () => {
      if (!presenceWindow.isDestroyed()) {
        presenceWindow.webContents.send(PRESENCE_CONFIG_CHANNEL, presenceConfiguration);
        presenceWindow.webContents.send(PRESENCE_STATE_CHANNEL, currentPresenceState);
      }
      if (systemPresenceEnabled && !presenceWindow.isDestroyed()) { syncDisplays(); presenceWindow.showInactive(); }
    });
    return entry;
  }

  function displayDescriptors() {
    const displays = screen.getAllDisplays();
    const osPrimaryId = String(screen.getPrimaryDisplay().id);
    const ordered = [
      ...displays.filter((display) => String(display.id) === osPrimaryId),
      ...displays.filter((display) => String(display.id) !== osPrimaryId)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))
    ];
    return ordered.map((display, index) => ({
      display,
      displayId: String(display.id),
      logicalId: index === 0 ? 'primary' : `display-${index + 1}`
    }));
  }

  function syncDisplays() {
    if (!systemPresenceEnabled) return;
    const descriptors = displayDescriptors();
    const automaticLogicalDisplayId = automaticPresenceDisplayId(descriptors);
    const previousLogicalDisplayId = selectedLogicalDisplayId;
    const previousSelectionMode = displaySelectionMode;
    if (displaySelectionMode === 'automatic') {
      selectedLogicalDisplayId = automaticLogicalDisplayId;
    } else if (!descriptors.some((entry) => entry.logicalId === selectedLogicalDisplayId)) {
      displaySelectionMode = 'automatic';
      selectedLogicalDisplayId = automaticLogicalDisplayId;
    }
    const selectedDescriptor = descriptors.find((entry) => entry.logicalId === selectedLogicalDisplayId)
      || descriptors[0];
    const activeIds = new Set(selectedDescriptor ? [selectedDescriptor.displayId] : []);
    const prunedPositions = Object.fromEntries(Object.entries(presenceState.positions || {})
      .filter(([displayId]) => descriptors.some((entry) => entry.displayId === displayId)));
    if (Object.keys(prunedPositions).length !== Object.keys(presenceState.positions || {}).length
      || selectedLogicalDisplayId !== previousLogicalDisplayId
      || displaySelectionMode !== previousSelectionMode) {
      presenceState = { ...presenceState, positions: prunedPositions };
      persistPresenceState('Posizioni Presence obsolete non ripulite.');
    }
    for (const displayId of presenceWindows.keys()) {
      if (!activeIds.has(displayId)) closePresenceWindow(displayId);
    }
    if (!selectedDescriptor) return;
    const { display, displayId } = selectedDescriptor;
    let entry = presenceWindows.get(displayId);
    if (!entry) entry = createPresenceWindow(display, true);
    entry.ambientCentered = !applicationVisible;
    const size = Math.min(applicationVisible ? (entry.detached ? 240 : 128) : 300, display.workArea.width - 36, display.workArea.height - 36);
    const targetBounds = entry.ambientCentered
      ? ambientPresenceBounds(display, size)
      : systemPresenceBounds(display, entry.detached ? presenceState.positions?.[displayId] : undefined, size);
    animatePresenceBounds(entry, targetBounds, display);
    applyPresenceOpacity(entry);
    if (!entry.window.isDestroyed() && entry.window.webContents.getURL()) entry.window.showInactive();
  }

  function handleDisplayChange() {
    if (systemPresenceEnabled) syncDisplays();
  }

  function setSystemPresenceEnabled(enabled) {
    systemPresenceEnabled = enabled === true;
    persistPresenceState('Preferenza Presence non salvata.');
    if (systemPresenceEnabled) {
      attachDisplayListeners();
      syncDisplays();
    } else {
      for (const displayId of [...presenceWindows.keys()]) closePresenceWindow(displayId);
      detachDisplayListeners();
    }
    return { enabled: systemPresenceEnabled, displays: presenceWindows.size };
  }

  function setSystemPresenceConfiguration(snapshot) {
    const normalized = normalizePresenceConfiguration(snapshot);
    const persistentChanged = normalized.appearance !== presenceConfiguration.appearance
      || normalized.motion !== presenceConfiguration.motion
      || normalized.quality !== presenceConfiguration.quality
      || normalized.wakeWordEnabled !== presenceConfiguration.wakeWordEnabled
      || normalized.wakeWordConfidence !== presenceConfiguration.wakeWordConfidence
      || normalized.wakeWordCooldownMs !== presenceConfiguration.wakeWordCooldownMs;
    const configurationChanged = persistentChanged
      || normalized.wakeWordSuspended !== presenceConfiguration.wakeWordSuspended;
    presenceConfiguration = Object.freeze({
      appearance: normalized.appearance,
      motion: normalized.motion,
      quality: normalized.quality,
      wakeWordEnabled: normalized.wakeWordEnabled,
      wakeWordConfidence: normalized.wakeWordConfidence,
      wakeWordCooldownMs: normalized.wakeWordCooldownMs,
      wakeWordSuspended: normalized.wakeWordSuspended,
      wakeWordListening: presenceConfiguration.wakeWordListening === true
    });
    schedulePresenceState(normalized.state);
    if (persistentChanged) persistPresenceState('Preferenze Presence non salvate.');
    for (const entry of presenceWindows.values()) {
      if (entry.window.isDestroyed()) continue;
      if (configurationChanged) entry.window.webContents.send(PRESENCE_CONFIG_CHANNEL, presenceConfiguration);
    }
    return { synced: true, appearance: presenceConfiguration.appearance };
  }

  function broadcastPresenceState() {
    for (const entry of presenceWindows.values()) {
      if (!entry.window.isDestroyed()) entry.window.webContents.send(PRESENCE_STATE_CHANNEL, currentPresenceState);
    }
  }

  function applyPresenceState(next) {
    currentPresenceState = next;
    broadcastPresenceState();
    if (systemPresenceEnabled) syncDisplays();
    return currentPresenceState;
  }

  function schedulePresenceState(state) {
    const next = PRESENCE_STATES.has(String(state)) ? String(state) : 'idle';
    if (presenceStateTimer) {
      clearTimeout(presenceStateTimer);
      presenceStateTimer = null;
    }
    const delay = presenceTransitionDelay(currentPresenceState, next);
    if (delay === 0) {
      return applyPresenceState(next);
    }
    presenceStateTimer = setTimeout(() => {
      presenceStateTimer = null;
      applyPresenceState(next);
    }, delay);
    presenceStateTimer.unref?.();
    return currentPresenceState;
  }

  function startSystemPresence() {
    if (systemPresenceEnabled) {
      attachDisplayListeners();
      syncDisplays();
    }
    return getSystemPresenceStatus();
  }

  function getSystemPresenceStatus() {
    const descriptors = displayDescriptors();
    const automaticDisplayId = automaticPresenceDisplayId(descriptors);
    const selected = displaySelectionMode === 'automatic'
      ? automaticDisplayId
      : descriptors.some((entry) => entry.logicalId === selectedLogicalDisplayId)
        ? selectedLogicalDisplayId
        : automaticDisplayId;
    return {
      available: true,
      nucleusVisible: systemPresenceEnabled && presenceWindows.size > 0,
      fullAppOpen: applicationVisible,
      selectedDisplayId: selected,
      displaySelectionMode,
      automaticDisplayId,
      logicalDisplays: descriptors.map((entry) => ({ id: entry.logicalId, primary: entry.logicalId === 'primary' })),
      allowedActions: ['show-nucleus', 'hide-nucleus', 'open-full-app', 'close-full-app', 'open-chatgpt', 'close-chatgpt', 'open-application', 'select-display']
    };
  }

  function getSystemPresenceConfiguration() {
    return Object.freeze({ ...presenceConfiguration, state: currentPresenceState });
  }

  function setWakeWordListening(active) {
    const next = active === true;
    if (presenceConfiguration.wakeWordListening === next) return getSystemPresenceConfiguration();
    presenceConfiguration = Object.freeze({ ...presenceConfiguration, wakeWordListening: next });
    for (const entry of presenceWindows.values()) {
      if (!entry.window.isDestroyed()) entry.window.webContents.send(PRESENCE_CONFIG_CHANNEL, presenceConfiguration);
    }
    return getSystemPresenceConfiguration();
  }

  function selectSystemPresenceDisplay(logicalId) {
    const candidate = String(logicalId || '');
    if (candidate === 'automatic') {
      displaySelectionMode = 'automatic';
      selectedLogicalDisplayId = automaticPresenceDisplayId(displayDescriptors());
      persistPresenceState('Selezione automatica del display Presence non salvata.');
      if (systemPresenceEnabled) syncDisplays();
      return true;
    }
    if (!displayDescriptors().some((entry) => entry.logicalId === candidate)) return false;
    displaySelectionMode = 'manual';
    selectedLogicalDisplayId = candidate;
    persistPresenceState('Display Presence non salvato.');
    if (systemPresenceEnabled) syncDisplays();
    return true;
  }

  function setApplicationVisible(visible) {
    if (applicationVisible === (visible === true)) return { visible: applicationVisible };
    applicationVisible = visible === true;
    for (const entry of presenceWindows.values()) entry.detached = false;
    if (systemPresenceEnabled) syncDisplays();
    return { visible: applicationVisible };
  }

  function dispose() {
    openingPromise = null;
    if (presenceStateTimer) clearTimeout(presenceStateTimer);
    presenceStateTimer = null;
    systemPresenceEnabled = false;
    for (const displayId of [...presenceWindows.keys()]) closePresenceWindow(displayId);
    detachDisplayListeners();
    ipcMain.removeListener(PRESENCE_POINTER_CHANNEL, onPresencePointer);
    ipcMain.removeListener(PRESENCE_OPEN_CHANNEL, onPresenceOpen);
    ipcMain.removeListener(PRESENCE_VOICE_CHANNEL, onPresenceVoice);
    ipcMain.removeListener(PRESENCE_MENU_CHANNEL, onPresenceMenu);
    return { enabled: false };
  }

  return {
    startSystemPresence,
    setSystemPresenceEnabled,
    getSystemPresenceStatus,
    getSystemPresenceConfiguration,
    setWakeWordListening,
    setSystemPresenceConfiguration,
    selectSystemPresenceDisplay,
    setApplicationVisible,
    updateState: schedulePresenceState,
    dispose
  };
}

module.exports = {
  createSystemPresenceManager,
  normalizePresenceConfiguration,
  automaticPresenceDisplayId,
  ambientPresenceBounds,
  presenceTransitionDelay,
  serializeDisplayPosition,
  systemPresenceBounds,
  systemPresenceDocument
};

// #endregion
