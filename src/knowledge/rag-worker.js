/**
 * @module knowledge/rag-worker
 * @description Indicizza la knowledge fuori dal main process Electron.
 */
const { parentPort, workerData } = require('node:worker_threads');
const { NexusIndex } = require('./rag');

try {
  const index = new NexusIndex(workerData.vaultPath, { cachePath: workerData.cachePath });
  index.rebuild();
  parentPort.postMessage({
    ok: true,
    chunks: index.chunks,
    fileCache: [...index.fileCache.entries()],
    indexedAt: index.indexedAt
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: error instanceof Error ? error.message : 'Indicizzazione locale non riuscita.'
  });
}
