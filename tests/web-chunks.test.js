const test = require('node:test');
const assert = require('node:assert/strict');

function browser({ online = true, storage = true } = {}) {
  const values = new Map();
  let reloads = 0;
  globalThis.navigator = { onLine: online };
  globalThis.location = { reload: () => { reloads += 1; } };
  globalThis.sessionStorage = storage
    ? { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }
    : { getItem: () => { throw new Error('bloccato'); }, setItem: () => { throw new Error('bloccato'); } };
  return { reloads: () => reloads };
}

test('un chunk di una build rimossa ricarica la pagina una sola volta, poi l errore resta', async (t) => {
  t.after(() => { delete globalThis.navigator; delete globalThis.location; delete globalThis.sessionStorage; });
  const { loadChunk } = await import('../web/src/chunks.ts');
  const page = browser();
  const failing = loadChunk(() => Promise.reject(new Error('chunk assente')));
  const pending = failing();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(page.reloads(), 1);
  void pending;
  await assert.rejects(failing(), /chunk assente/);
  assert.equal(page.reloads(), 1);
  assert.equal(await loadChunk(() => Promise.resolve('ok'))(), 'ok');
});

test('senza rete o senza sessionStorage nessun ricaricamento: solo l errore', async (t) => {
  t.after(() => { delete globalThis.navigator; delete globalThis.location; delete globalThis.sessionStorage; });
  const { loadChunk } = await import('../web/src/chunks.ts');
  for (const options of [{ online: false }, { storage: false }]) {
    const page = browser(options);
    await assert.rejects(loadChunk(() => Promise.reject(new Error('rete')))(), /rete/);
    assert.equal(page.reloads(), 0);
  }
});
