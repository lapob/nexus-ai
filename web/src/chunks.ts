/**
 * @module web/chunks
 * @description Chunk su richiesta resistenti ai rilasci: una scheda rimasta aperta durante una pubblicazione chiede
 * file della build precedente, ormai rimossi. Al primo errore, se la rete c'è, la pagina si ricarica una sola volta
 * per build (guardia in sessionStorage sull'URL del modulo d'ingresso) e ottiene la build corrente. Senza rete,
 * senza sessionStorage o al secondo errore l'errore resta normale: nessun ciclo di ricaricamenti.
 */
const RELOAD_MARKER = 'nxs-chunk-reload';

export function loadChunk<T>(loader: () => Promise<T>): () => Promise<T> {
  return () => loader().catch((error: unknown) => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw error;
    const build = import.meta.url;
    try {
      if (sessionStorage.getItem(RELOAD_MARKER) === build) throw error;
      sessionStorage.setItem(RELOAD_MARKER, build);
    } catch {
      throw error;
    }
    location.reload();
    return new Promise<T>(() => {});
  });
}
