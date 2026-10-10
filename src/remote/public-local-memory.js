/**
 * @module remote/public-local-memory
 * @description Account-free browser history with transactionally invalidated writes.
 */
// #region Browser-owned conversation database
function createPublicLocalMemory(onReset = () => {}) {
  const resetKey = 'nexusnxs.memory-reset.v1';
  let epoch = null, queue = Promise.resolve();
  const normalize = value => (Array.isArray(value) ? value : []).slice(-24)
    .filter(turn => turn && ['user', 'assistant'].includes(turn.role) && typeof turn.content === 'string')
    .map(turn => ({ role: turn.role, content: turn.content.slice(0, 4000) }));
  const open = () => new Promise((resolve, reject) => {
    const request = indexedDB.open('nexusnxs-demo', 1);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(new Error('Local storage unavailable')); }, 3000);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('state')) request.result.createObjectStore('state');
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (expired) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => { clearTimeout(timer); reject(request.error); };
  });
  const transaction = async (mode, action) => {
    const db = await open();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('state', mode);
        let result;
        const timer = setTimeout(() => { try { tx.abort(); } catch {} reject(new Error('Local storage timeout')); }, 3000);
        tx.oncomplete = () => { clearTimeout(timer); resolve(result); };
        tx.onabort = tx.onerror = () => { clearTimeout(timer); reject(tx.error || new Error('Local storage failed')); };
        action(tx.objectStore('state'), value => { result = value; });
      });
    } finally { db.close(); }
  };
  // #endregion
  // #region Serialized operations and cross-tab invalidation
  const serial = action => {
    const pending = queue.then(action);
    queue = pending.catch(() => {});
    return pending;
  };
  const read = () => serial(() => transaction('readwrite', (store, done) => {
    const marker = store.get('epoch');
    marker.onsuccess = () => {
      epoch = marker.result || crypto.randomUUID();
      if (!marker.result) store.put(epoch, 'epoch');
      const request = store.get('turns');
      request.onsuccess = () => done(normalize(request.result));
    };
  }));
  const write = value => {
    const snapshot = normalize(value), expected = epoch;
    return serial(() => transaction('readwrite', (store, done) => {
      const marker = store.get('epoch');
      marker.onsuccess = () => {
        if (!expected || marker.result !== expected) { done(false); return; }
        store.put(snapshot, 'turns'); done(true);
      };
    }));
  };
  const clear = () => {
    const next = crypto.randomUUID();
    // Invalidate queued writes immediately, before acquiring the database lock.
    epoch = next;
    return serial(async () => {
      await transaction('readwrite', (store, done) => { store.clear(); store.put(next, 'epoch'); done(true); });
      try {
        for (const key of ['nxs.demo.memory', 'nxs.demo.installation', 'nexusnxs.conversation.preferences.v1', 'nexusnxs.slash-commands.v1', 'nexusnxs.core-hint.v1']) localStorage.removeItem(key);
        sessionStorage.removeItem('nxs.tab-draft.v1');
        localStorage.setItem(resetKey, next);
      } catch { /* IndexedDB deletion remains effective without Web Storage. */ }
      return true;
    });
  };
  addEventListener('storage', event => {
    if (event.key !== resetKey && event.key !== null) return;
    epoch = null;
    onReset();
    // Adopt the new epoch only after old UI/request state has been invalidated.
    void read().catch(() => {});
  });
  return { read, write, clear };
  // #endregion
}
module.exports = { createPublicLocalMemory };
