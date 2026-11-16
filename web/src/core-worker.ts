/**
 * @module web/core-worker
 * @description Worker del nucleo: riceve il canvas (OffscreenCanvas) e disegna con il proprio ritmo di
 * fotogrammi, separato dal thread della pagina. Render della lista, Markdown, layout o raster della UI non
 * fermano più il nucleo. Nessun accesso al DOM né alla rete.
 */
import { startCoreEngine, type CoreInput, type CoreOutput } from './core-render';

type Init = { type: 'init'; canvas: OffscreenCanvas; startedAt: number; energy: number; reduced: boolean; still: number | null };
const scope = self as unknown as { postMessage: (message: CoreOutput | { type: 'loaded' }) => void; onmessage: ((event: MessageEvent<Init | CoreInput>) => void) | null };
let engine: ReturnType<typeof startCoreEngine> | null = null;

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === 'init') engine = startCoreEngine(message.canvas, message.startedAt, message.energy, message.reduced, (output) => scope.postMessage(output), message.still);
  else engine?.send(message);
};
// Il modulo è stato scaricato e valutato: solo ora l'host trasferisce il canvas (il trasferimento è irreversibile).
scope.postMessage({ type: 'loaded' });
