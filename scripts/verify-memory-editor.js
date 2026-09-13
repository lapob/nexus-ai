/** @module scripts/verify-memory-editor Real renderer and IPC memory correction in a disposable profile. */
// #region Isolated fixture
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron } = require('../../.SITE/node_modules/@playwright/test');
const { PersonalMemoryStore } = require('../src/infrastructure/storage/personal-memory-store');
const { requestProcessShutdown } = require('../src/infrastructure/electron/process-lock');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-ui-'));
const databasePath = path.join(profile, 'data/database/personal-memory.sqlite3');
const store = new PersonalMemoryStore({ filePath: databasePath });
store.remember({ content: 'Il progetto Aurora usa Java' }); store.close();
// #endregion
// #region Real UI and bridge
(async () => {
  let app;
  try {
    app = await _electron.launch({ executablePath: require('electron'), args: [root], timeout: 60000,
      env: { ...process.env, NEXUS_USER_DATA_ROOT: profile, NEXUS_SHARED_DATA_ROOT: profile,
        NEXUS_DISTRIBUTION_MODE: 'public', NEXUS_USE_SYSTEM_OLLAMA: '1', NEXUS_MANAGED_OLLAMA: '0', NEXUS_DISABLE_EXPRESSIVE_VOICE: '1' } });
    const page = await app.firstWindow(); page.setDefaultTimeout(15000); await page.waitForLoadState('domcontentloaded');
    await page.locator('.shortcut-item').filter({ hasText: 'IMPOSTAZIONI' }).click();
    await page.locator('#settings-tab-data').click();
    const item = page.locator('.memory-list article').first();
    await item.getByRole('button', { name: /Modifica ricordo|Edit memory/ }).click();
    await item.locator('textarea').fill('Il progetto Aurora usa Rust');
    await page.screenshot({ path: path.join(root, 'qa-artifacts/memory-editor.png') });
    await item.getByRole('button', { name: /^(Salva|Save)$/ }).click();
    await page.locator('.memory-list article strong').filter({ hasText: 'Il progetto Aurora usa Rust' }).waitFor();
    const memories = await page.evaluate(() => window.nexus.listMemories());
    assert.equal(memories.length, 1); assert.equal(memories[0].content, 'Il progetto Aurora usa Rust');
    const rejected = await page.evaluate(async () => {
      try { await window.nexus.updateMemory(-1, 'Invalid content'); return false; } catch { return true; }
    });
    assert.equal(rejected, true);
    await page.locator('.memory-list article').getByRole('button', { name: /Modifica ricordo|Edit memory/ }).click();
    await page.locator('.memory-list textarea').fill('Modifica da annullare');
    await page.locator('.memory-edit-actions').getByRole('button', { name: /^(Annulla|Cancel)$/ }).click();
    assert.equal((await page.evaluate(() => window.nexus.listMemories()))[0].content, 'Il progetto Aurora usa Rust');
    console.log('PASS real renderer: edit, persist, invalid ID rejected, cancel retains memory');
  } finally {
    requestProcessShutdown(path.join(profile, 'system-presence.lock'));
    if (app) await app.close();
    // The fixture is confined to the generated OS temporary directory.
    const relative = path.relative(os.tmpdir(), profile);
    if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
      try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* A closing process may retain the isolated fixture briefly. */ }
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
// #endregion
