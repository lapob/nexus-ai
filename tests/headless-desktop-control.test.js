/**
 * @module tests/headless-desktop-control
 * @description Verifica gli avvii remoti consentiti quando la Presence non e attiva.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHeadlessDesktopControl } = require('../src/application/headless-desktop-control');

test('il Core headless espone solo controlli applicativi espliciti senza Presence', async () => {
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    bridgeClient: { status: async () => { throw new Error('offline'); } },
    desktopState: () => ({ running: false }),
    chatGptState: async () => false,
    now: () => 2_000
  });
  const status = await control.status();
  assert.equal(status.available, true);
  assert.equal(status.fullAppOpen, false);
  assert.deepEqual(status.allowedActions, ['open-full-app', 'close-full-app', 'open-chatgpt', 'close-chatgpt', 'open-application', 'close-application']);
  assert.deepEqual(status.logicalDisplays, []);
});

test('espone solo l identificatore allowlist dell applicazione Windows in primo piano', async () => {
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => false,
    applicationStatus: async () => [{ id: 'brave', label: 'Brave', icon: 'browser', available: true, open: true, canClose: true }],
    foregroundApplication: async () => ({ id: 'brave', label: 'Brave' }),
    now: () => 2_000
  });
  const status = await control.status();
  assert.equal(status.foregroundApplicationId, 'brave');
  assert.equal(JSON.stringify(status).includes('brave.exe'), false);
});

test('Apri NexusNXS avvia la UI e ne verifica il lock', async () => {
  let running = false;
  let launches = 0;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running }),
    chatGptState: async () => false,
    launchDesktop: async () => { launches += 1; running = true; },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'open-full-app' });
  assert.equal(launches, 1);
  assert.equal(result.fullAppOpen, true);
});

test('Apri ChatGPT usa il PC e aggiorna immediatamente lo stato', async () => {
  let launches = 0;
  let running = false;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => running,
    launchChatGpt: async () => { launches += 1; running = true; },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'open-chatgpt' });
  assert.equal(launches, 1);
  assert.equal(result.chatGptOpen, true);
});

test('Chiudi NexusNXS richiede lo shutdown autenticato e verifica la scomparsa del lock', async () => {
  let running = true;
  let shutdowns = 0;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running }),
    chatGptState: async () => false,
    closeDesktop: () => { shutdowns += 1; running = false; return true; },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'close-full-app' });
  assert.equal(shutdowns, 1);
  assert.equal(result.fullAppOpen, false);
});

test('Chiudi ChatGPT usa il terminatore dedicato e aggiorna immediatamente lo stato', async () => {
  let closes = 0;
  let running = true;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => running,
    closeChatGpt: async () => { closes += 1; running = false; },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'close-chatgpt' });
  assert.equal(closes, 1);
  assert.equal(result.chatGptOpen, false);
});

test('Chiudi ChatGPT usa il fallback forzato se il processo Store resta residente', async () => {
  const attempts = [];
  let running = true;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => running,
    closeChatGpt: async (options = {}) => {
      attempts.push(options);
      if (options.force === true) running = false;
    },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'close-chatgpt' });
  assert.deepEqual(attempts, [{}, { force: true }]);
  assert.equal(result.chatGptOpen, false);
});

test('i controlli del nucleo restano chiusi senza Presence', async () => {
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => false,
    now: () => 2_000
  });
  await assert.rejects(control.execute({ action: 'show-nucleus' }), { code: 'PRESENCE_UNAVAILABLE' });
});

test('apre soltanto una applicazione del catalogo e ne verifica lo stato', async () => {
  let open = false;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => false,
    applicationStatus: async () => [{ id: 'notepad', label: 'Note', icon: 'note', available: true, open, canClose: true }],
    launchApplication: async (id) => { assert.equal(id, 'notepad'); open = true; },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'open-application', applicationId: 'notepad' });
  assert.equal(result.applications[0].open, true);
});

test('attende il processo finale delle app Windows prima di confermare', async () => {
  let checks = 0;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => false,
    applicationStatus: async () => [{ id: 'terminal', label: 'Terminale', icon: 'terminal', available: true, open: ++checks >= 3, canClose: true }],
    launchApplication: async () => {},
    now: () => 2_000
  });
  const result = await control.execute({ action: 'open-application', applicationId: 'terminal' });
  assert.equal(result.applications[0].open, true);
  assert.ok(checks >= 3);
});

test('chiude soltanto una applicazione del catalogo e ne verifica lo stato', async () => {
  let open = true;
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    desktopState: () => ({ running: false }),
    chatGptState: async () => false,
    applicationStatus: async () => [{ id: 'notepad', label: 'Note', icon: 'note', available: true, open, canClose: true }],
    closeApplication: async (id) => { assert.equal(id, 'notepad'); open = false; },
    now: () => 2_000
  });
  const result = await control.execute({ action: 'close-application', applicationId: 'notepad' });
  assert.equal(result.applications[0].open, false);
});

test('la Presence manuale mantiene la precedenza sul controllo headless', async () => {
  const executed = [];
  const control = createHeadlessDesktopControl({
    appRoot: 'Z:\\NexusNXS\\.AI',
    sharedDataRoot: 'Z:\\NexusNXS\\.nexus-data',
    bridgeClient: {
      status: async () => ({ available: true, allowedActions: ['show-nucleus'] }),
      execute: async (command) => executed.push(command.action)
    },
    desktopState: () => ({ running: false }),
    chatGptState: async () => false
  });
  await control.execute({ action: 'show-nucleus' });
  assert.deepEqual(executed, ['show-nucleus']);
});
