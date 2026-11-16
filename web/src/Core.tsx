/**
 * @module web/Core
 * @description Nucleo di particelle NexusNXS. Il disegno (core-render) gira in un worker su OffscreenCanvas, con
 * un proprio ritmo di fotogrammi: render, layout e raster della pagina non lo fermano mai. Se il worker non è
 * disponibile (browser senza OffscreenCanvas, asset non raggiungibile dal guscio offline) lo stesso motore gira
 * sul thread principale. Qui restano solo misure del DOM, stato, movimento ridotto e il respiro della UI.
 */
import { useEffect, useRef } from 'react';
import { coreBreath } from './core-breath';
import { ENERGY, FEATHER, startCoreEngine, type Clip, type CoreInput, type CoreOutput, type CoreState } from './core-render';
import { NEXUS_CORE_VERSION, qaTime } from './nexus-core';

export type { CoreState } from './core-render';

/**
 * Il nucleo reagisce allo stato reale: energia dello stato (ascolto, pensiero, risposta, voce) interpolata, livello
 * della voce (`level`: microfono in ascolto, sintesi mentre parla), puntatore (s'inclina e si accende vicino alla
 * mano, poi torna composto) e stato del server (`offline`: più spento e freddo finché non risponde).
 */
export function Core({ state, className, level, offline = false }: { state: CoreState; className?: string; level?: { current: number }; offline?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const base = useRef(ENERGY[state]);
  base.current = ENERGY[state];
  const offlineRef = useRef(offline);
  offlineRef.current = offline;
  // L'entità respira con la voce: quella dell'utente in ascolto, la propria mentre parla.
  const target = { get current() { return Math.min(1, base.current + (level?.current ?? 0) * 0.6); } };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let frame = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const startedAt = performance.timeOrigin + performance.now();
    // Regressione visiva: `?nxs-qa-time=<s>` disegna un solo istante fisso (stesso aggancio del sito).
    const still = qaTime(window.location.search);
    const halted = () => reduced.matches || still !== null;
    canvas.dataset.coreVersion = NEXUS_CORE_VERSION;
    let send: (message: CoreInput) => void = () => {};
    let worker: Worker | null = null;
    let engine: ReturnType<typeof startCoreEngine> | null = null;
    const pendingStats: Array<(intervals: number[]) => void> = [];
    const receive = (message: CoreOutput) => {
      if (message.type === 'info') {
        if (message.backend) canvas.dataset.backend = message.backend;
        if (message.quality) canvas.dataset.quality = message.quality;
        if (message.qa) canvas.dataset.qa = message.qa;
      } else pendingStats.shift()?.(message.intervals);
    };

    // Dimensione di layout × scala CSS effettiva: il ResizeObserver non vede le trasformazioni
    // (hero 0.82 → ambiente 1.25) e senza questo il bitmap veniva ingrandito e sfocato.
    const resize = () => {
      const layoutWidth = canvas.clientWidth || 1;
      const layoutHeight = canvas.clientHeight || 1;
      const box = canvas.getBoundingClientRect();
      // Almeno la scala della posa ambiente (1.25): passando da hero ad ambiente il bitmap non si rialloca
      // (riconfigurare la superficie a metà transizione costava un fotogramma da 30 ms al nucleo).
      const scale = Math.max(1.25, box.width / layoutWidth, box.height / layoutHeight);
      send({ type: 'size', width: layoutWidth * scale, height: layoutHeight * scale, dpr: window.devicePixelRatio || 1 });
      measureClip();
    };
    // Contenitore che ritaglia il canvas (primo antenato con overflow non visibile), cercato una volta;
    // la sua area visibile, riportata in NDC del canvas, è dove le particelle sfumano invece di essere tagliate.
    let host: HTMLElement | null = canvas.parentElement;
    while (host && host !== document.body && getComputedStyle(host).overflowX === 'visible' && getComputedStyle(host).overflowY === 'visible') host = host.parentElement;
    let lastClip = '';
    const measureClip = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const view = host && host !== document.body ? host.getBoundingClientRect() : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const left = Math.max(view.left, 0), top = Math.max(view.top, 0);
      const right = Math.min(view.right, window.innerWidth), bottom = Math.min(view.bottom, window.innerHeight);
      const clip: Clip = {
        rect: [(left - box.left) / box.width * 2 - 1, 1 - (bottom - box.top) / box.height * 2, (right - box.left) / box.width * 2 - 1, 1 - (top - box.top) / box.height * 2],
        feather: [FEATHER * 2 / box.width, FEATHER * 2 / box.height]
      };
      const key = clip.rect.map((value) => value.toFixed(3)).join();
      if (key !== lastClip) { lastClip = key; send({ type: 'clip', clip }); }
    };

    // Il respiro della UI (--core-breath sugli elementi [data-core-breath]) è una funzione pura del tempo:
    // lo calcola la pagina con lo stesso istante di partenza del motore, quindi resta allineato al nucleo.
    let tick = 0;
    let breathing: NodeListOf<HTMLElement> | HTMLElement[] = [];
    let lastPulse = '';
    let lastTarget = -1;
    const loop = () => {
      if (disposed) return;
      tick += 1;
      const value = target.current;
      if (Math.abs(value - lastTarget) > 0.002) { lastTarget = value; send({ type: 'energy', target: value }); }
      if (pointerMoved) { pointerMoved = false; sendPointer(); }
      const time = still ?? (reduced.matches ? 0 : (performance.timeOrigin + performance.now() - startedAt) / 1000);
      const ramp = reduced.matches ? 0 : Math.min(1, Math.max(0, (time - 1.2) / 3));
      const pulse = (ramp * ramp * (3 - 2 * ramp) * coreBreath(time, 0)).toFixed(3);
      canvas.dataset.breath = pulse;
      // L'area visibile cambia con lo scorrimento e la posa hero/ambiente: rilettura ogni 10 fotogrammi
      // (a layout pulito getBoundingClientRect non forza ricalcoli). Elementi del respiro ricercati con lo stesso passo:
      // un elemento appena montato si aggancia in una frazione di secondo, mentre il respiro è ancora vicino a dove era.
      if (tick % 10 === 1) { measureClip(); breathing = document.querySelectorAll<HTMLElement>('[data-core-breath]'); lastPulse = ''; }
      if (pulse !== lastPulse) { lastPulse = pulse; breathing.forEach((element) => element.style.setProperty('--core-breath', pulse)); }
      if (!halted() && document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
    };
    // Puntatore: coordinate lette all'evento, inviate al motore una volta per fotogramma in NDC del canvas.
    let pointerX = 0, pointerY = 0, pointerMoved = false;
    const sendPointer = () => {
      const box = canvas.getBoundingClientRect();
      if (!box.width || !box.height) return;
      send({ type: 'pointer', x: (pointerX - box.left) / box.width * 2 - 1, y: 1 - (pointerY - box.top) / box.height * 2 });
    };
    const onPointer = (event: PointerEvent) => { if (halted()) return; pointerX = event.clientX; pointerY = event.clientY; pointerMoved = true; };
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    let lastOffline: boolean | null = null;
    const syncMood = () => { if (offlineRef.current !== lastOffline) { lastOffline = offlineRef.current; send({ type: 'mood', offline: lastOffline }); } };
    const wake = () => {
      cancelAnimationFrame(frame);
      lastOffline = null;
      syncMood();
      send({ type: 'reduced', reduced: reduced.matches });
      send({ type: 'visible', visible: document.visibilityState === 'visible' });
      if (document.visibilityState === 'visible') frame = requestAnimationFrame(loop);
    };

    const observer = new ResizeObserver(resize);
    const begin = (sender: (message: CoreInput) => void) => {
      if (disposed) return;
      send = sender;
      observer.observe(canvas);
      resize();
      wake();
    };
    const mainThread = () => {
      if (disposed) return;
      engine = startCoreEngine(canvas, startedAt, target.current, reduced.matches, receive, still);
      canvas.dataset.thread = 'main';
      begin((message) => engine?.send(message));
    };
    // Prima il worker: il canvas si trasferisce solo quando il modulo è caricato (trasferimento irreversibile).
    if (typeof canvas.transferControlToOffscreen === 'function' && typeof Worker === 'function') {
      try {
        const spawned = new Worker(new URL('./core-worker.ts', import.meta.url), { type: 'module', name: 'nexus-core' });
        worker = spawned;
        let loaded = false;
        const failed = () => { if (loaded || disposed) return; spawned.terminate(); worker = null; mainThread(); };
        spawned.addEventListener('error', failed, { once: true });
        spawned.addEventListener('message', (event: MessageEvent<CoreOutput | { type: 'loaded' }>) => {
          const message = event.data;
          if (message.type !== 'loaded') { receive(message); return; }
          if (loaded || disposed) return;
          loaded = true;
          const offscreen = canvas.transferControlToOffscreen();
          spawned.postMessage({ type: 'init', canvas: offscreen, startedAt, energy: target.current, reduced: reduced.matches, still }, [offscreen]);
          canvas.dataset.thread = 'worker';
          begin((input) => spawned.postMessage(input));
        });
      } catch { worker = null; mainThread(); }
    } else mainThread();

    // Misure (scripts/measure-*-motion): intervalli tra i fotogrammi del nucleo, nel thread dove disegna davvero.
    const stats = () => { pendingStats.push((intervals) => canvas.dispatchEvent(new CustomEvent('nxs-core-stats', { detail: intervals }))); send({ type: 'stats' }); };
    canvas.addEventListener('nxs-core-stats-request', stats);
    // A nucleo fermo il loop non gira: un cambio di stato o di server ridisegna un frame.
    const redraw = () => { lastTarget = -1; syncMood(); if (halted()) loop(); };
    document.addEventListener('visibilitychange', wake);
    reduced.addEventListener('change', wake);
    canvas.addEventListener('nxs-core-state', redraw);
    // Fine di una transizione di scala del contenitore: ricalcola il bitmap alla nuova dimensione reale.
    const layer = canvas.parentElement;
    const settle = (event: TransitionEvent) => { if (event.propertyName === 'transform' || event.propertyName === 'scale') resize(); };
    layer?.addEventListener('transitionend', settle);
    // Zoom del browser o finestra spostata su un monitor diverso: la densità cambia, il bitmap si rifà nitido.
    let density: MediaQueryList | null = null;
    const watchDensity = () => {
      density?.removeEventListener('change', onDensity);
      density = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      density.addEventListener('change', onDensity);
    };
    function onDensity() { resize(); watchDensity(); }
    watchDensity();
    return () => {
      density?.removeEventListener('change', onDensity);
      layer?.removeEventListener('transitionend', settle);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('pointerdown', onPointer);
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', wake);
      reduced.removeEventListener('change', wake);
      canvas.removeEventListener('nxs-core-state', redraw);
      canvas.removeEventListener('nxs-core-stats-request', stats);
      worker?.terminate();
      engine?.destroy();
    };
  }, []);

  useEffect(() => { canvasRef.current?.dispatchEvent(new Event('nxs-core-state')); }, [state, offline]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" data-state={state} />;
}
