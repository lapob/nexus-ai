/** @module scripts/verify-memory-editor Real renderer and IPC memory correction in a disposable profile. */
// #region Isolated fixture
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { _electron } = require('../../.SITE/node_modules/@playwright/test');
const { PersonalMemoryStore } = require('../src/infrastructure/storage/personal-memory-store');
const { ConversationStore } = require('../src/infrastructure/storage/conversation-store');
const { requestProcessShutdown } = require('../src/infrastructure/electron/process-lock');
const root = path.resolve(__dirname, '..');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-memory-ui-'));
const databasePath = path.join(profile, 'data/database/personal-memory.sqlite3');
const store = new PersonalMemoryStore({ filePath: databasePath });
store.remember({ content: 'Il progetto Aurora usa Java' }); store.close();
const conversations = new ConversationStore({ filePath: path.join(profile, 'data/database/conversations.sqlite3') });
conversations.save({ id: 'artifact-fixture', title: 'Documento Aurora', turns: [
  { role: 'user', content: 'Documento Aurora', createdAt: 100 },
  { role: 'assistant', content: 'Documento pronto.', createdAt: 123, artifacts: [{ id: 'aurora', kind: 'file', title: 'Aurora.md', language: 'markdown', content: '# Aurora originale' }] }
] }); conversations.close();
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
    await item.getByRole('button', { name: /Modifica ricordo|Edit memory/ }).waitFor();
    await item.locator('summary').click();
    assert.match(await item.locator('details').innerText(), /Confermato da te|Confirmed by you/);
    assert.match(await item.locator('details').innerText(), /Senza scadenza|No expiry/);
    assert.match(await item.locator('details').innerText(), /Memoria personale locale|Local personal memory/);
    await item.getByRole('button', { name: /Modifica ricordo|Edit memory/ }).click();
    await item.locator('textarea').fill('Il progetto Aurora usa Rust');
    await item.getByRole('button', { name: /^(Scade|Expires)$/ }).click();
    await item.getByRole('option', { name: /90 (giorni|days)/ }).click();
    await page.screenshot({ path: path.join(root, 'qa-artifacts/memory-editor.png') });
    await item.getByRole('button', { name: /^(Salva|Save)$/ }).click();
    await page.locator('.memory-list article strong').filter({ hasText: 'Il progetto Aurora usa Rust' }).waitFor();
    const memories = await page.evaluate(() => window.nexus.listMemories());
    assert.equal(memories.length, 1); assert.equal(memories[0].content, 'Il progetto Aurora usa Rust');
    assert.ok(memories[0].expiresAt > Date.now() + 89 * 86_400_000);
    const rejected = await page.evaluate(async () => {
      try { await window.nexus.updateMemory(-1, 'Invalid content'); return false; } catch { return true; }
    });
    assert.equal(rejected, true);
    for (const options of [{ expiresAt: Date.now() - 1000 }, { unknown: true }, []]) {
      assert.equal(await page.evaluate(async (options) => {
        const [memory] = await window.nexus.listMemories();
        try { await window.nexus.updateMemory(memory.id, 'Invalid change', options); return false; } catch { return true; }
      }, options), true);
    }
    const exportedPath = path.join(profile, 'memories-export.json');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async (_window, options) => {
        if (!options.title.includes('non cifrato')) throw new Error('Missing plaintext warning');
        return { canceled: false, filePath };
      };
    }, exportedPath);
    const exported = await page.evaluate(() => window.nexus.exportMemories());
    assert.equal(exported.status, 'saved'); assert.equal(exported.count, 1); assert.equal(exported.truncated, false);
    const portable = JSON.parse(fs.readFileSync(exportedPath, 'utf8'));
    assert.equal(portable.scope, 'local-personal'); assert.equal(portable.memories[0].content, 'Il progetto Aurora usa Rust');
    assert.equal(portable.memories[0].id, undefined); assert.equal(portable.memories[0].sourceId, undefined);
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true }); });
    assert.equal((await page.evaluate(() => window.nexus.exportMemories())).status, 'cancelled');
    await page.locator('.memory-list article').getByRole('button', { name: /Modifica ricordo|Edit memory/ }).click();
    await page.locator('.memory-list textarea').fill('Modifica da annullare');
    await page.locator('.memory-edit-actions').getByRole('button', { name: /^(Annulla|Cancel)$/ }).click();
    assert.equal((await page.evaluate(() => window.nexus.listMemories()))[0].content, 'Il progetto Aurora usa Rust');
    await page.locator('.memory-list article').getByRole('button', { name: /Dimentica ricordo|Forget memory/ }).click();
    await page.waitForFunction(async () => (await window.nexus.listMemories()).length === 0);
    console.log('PASS real renderer and IPC: scope, provenance, expiry, persist, invalid mutations rejected, plaintext export, export cancellation, edit cancellation, forget');
    await page.locator('.settings-close').click();
    await page.keyboard.press('Control+h');
    await page.locator('.conversation-history article > button').filter({ hasText: 'Documento Aurora' }).click();
    await page.locator('.artifact-item > button').click();
    const detail = page.getByRole('dialog', { name: 'Dettaglio Aurora.md', exact: true });
    await detail.getByRole('button', { name: 'Modifica una copia' }).click();
    await detail.getByRole('textbox', { name: 'Contenuto della copia' }).fill('# Aurora modificata');
    await detail.getByRole('button', { name: 'Salva copia', exact: true }).click();
    await detail.waitFor({ state: 'detached' });
    await page.locator('.artifact-item > button').click();
    assert.match(await detail.locator('pre').innerText(), /Aurora modificata/);
    await detail.getByRole('button', { name: 'Versione del risultato' }).click();
    await detail.getByRole('option', { name: 'Risultato AI', exact: true }).click();
    assert.match(await detail.locator('pre').innerText(), /Aurora originale/);
    await detail.getByRole('button', { name: 'Modifica una copia' }).click();
    await detail.getByRole('textbox', { name: 'Contenuto della copia' }).fill('Da annullare');
    await detail.getByRole('button', { name: 'Annulla modifica' }).click();
    assert.match(await detail.locator('pre').innerText(), /Aurora originale/);
    for (const [width, height] of [[1200, 800], [500, 800], [900, 500]]) {
      await app.evaluate(({ BrowserWindow }, size) => { const win = BrowserWindow.getAllWindows()[0]; win.setMinimumSize(320, 320); win.setContentSize(...size); }, [width, height]);
      await page.waitForTimeout(250);
      const bounds = await detail.boundingBox();
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      await page.screenshot({ path: path.join(root, `qa-artifacts/artifact-editor-${width}.png`) });
      assert.ok(bounds.x >= -1 && bounds.y >= -1 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, JSON.stringify({ bounds, viewport, requested: [width, height] }));
    }
    await page.reload();
    await page.keyboard.press('Control+h');
    await page.locator('.conversation-history article > button').filter({ hasText: 'Documento Aurora' }).click();
    await page.locator('.artifact-item > button').click();
    assert.match(await detail.locator('pre').innerText(), /Aurora modificata/);
    const persisted = (await page.evaluate(() => window.nexus.listConversationHistory()))[0].turns[1].artifacts[0];
    assert.equal(persisted.content, '# Aurora originale'); assert.equal(persisted.revisions.length, 1);
    await detail.getByRole('button', { name: 'Modifica una copia' }).click();
    await detail.getByRole('textbox', { name: 'Contenuto della copia' }).fill('Stale save');
    await page.evaluate(revisionId => window.nexus.reviseConversationArtifact({ conversationId: 'artifact-fixture', turnCreatedAt: 123, artifactId: 'aurora', expectedRevisionId: revisionId, content: 'Concurrent copy' }), persisted.revisions[0].id);
    await detail.getByRole('button', { name: 'Salva copia', exact: true }).click();
    await detail.getByRole('alert').waitFor();
    assert.equal((await page.evaluate(() => window.nexus.listConversationHistory()))[0].turns[1].artifacts[0].revisions.at(-1).content, 'Concurrent copy');
    console.log('PASS real artifacts: edit, cancel, AI original, retained copy, reload, three layouts and stale-save rejection');
    const documents = path.join(profile, 'documents-fixture'); fs.mkdirSync(documents);
    fs.writeFileSync(path.join(documents, 'source.md'), '# Originale della ricetta');
    await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, documents);
    await page.reload();
    await page.keyboard.press('Control+,');
    await page.locator('#settings-tab-permissions').click();
    const recipe = page.getByRole('region', { name: 'Ricetta documenti locale' });
    await recipe.getByRole('button', { name: 'Scegli cartella della ricetta' }).click();
    await recipe.getByRole('textbox', { name: 'Documento da copiare' }).fill('source.md');
    await recipe.getByRole('textbox', { name: 'Destinazione della copia' }).fill('copy.md');
    await recipe.getByRole('button', { name: 'Prepara ricetta documenti' }).click();
    await recipe.getByRole('button', { name: 'Approva questo passaggio' }).waitFor();
    assert.equal(fs.existsSync(path.join(documents, 'copy.md')), false);
    await recipe.getByRole('button', { name: 'Approva questo passaggio' }).click();
    await recipe.getByRole('button', { name: 'Anteprima prossimo passaggio' }).waitFor();
    assert.equal(fs.readFileSync(path.join(documents, 'copy.md'), 'utf8'), '# Originale della ricetta');
    await page.reload(); await page.keyboard.press('Control+,'); await page.locator('#settings-tab-permissions').click();
    await recipe.getByRole('button', { name: 'Anteprima prossimo passaggio' }).click();
    await recipe.getByRole('button', { name: 'Approva questo passaggio' }).click();
    await recipe.getByText('Completato', { exact: true }).waitFor();
    assert.match(await recipe.locator('pre').innerText(), /Originale della ricetta/);
    assert.equal(await recipe.getByRole('button', { name: 'Copia ID ricevuta', exact: true }).count(), 2);
    const receipts = await page.evaluate(async () => {
      const value = await window.nexus.workflowStatus(localStorage.getItem('nexus.document-workflow.v1'));
      return value.steps.map(step => step.result?.receipt?.outcome);
    });
    assert.deepEqual(receipts, ['completed', 'completed']);
    await recipe.getByText('Copia consultata', { exact: true }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    assert.equal(await recipe.getByRole('button', { name: 'Copia ID ricevuta', exact: true }).first().evaluate(button => getComputedStyle(button).backgroundColor), 'rgba(0, 0, 0, 0)');
    await page.screenshot({ path: path.join(root, 'qa-artifacts/local-workflow-recipe.png') });
    console.log('PASS real local recipe: preview without execution, separate approvals, source preserved, reload/checkpoint, copied text and two actual receipts');
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
