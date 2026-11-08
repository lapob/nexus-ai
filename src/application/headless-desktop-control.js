/**
 * @module application/headless-desktop-control
 * @description Espone al Core headless i soli avvii desktop consentiti, senza richiedere la Presence.
 */
const path = require('node:path');
const { launchInteractiveDesktop, processLockState } = require('../infrastructure/electron/desktop-launcher');
const { requestProcessShutdown } = require('../infrastructure/electron/process-lock');
const { closeDesktopApplication, desktopApplicationStatus, foregroundDesktopApplication, openDesktopApplication } = require('../infrastructure/windows/desktop-application-catalog');
const { closeClaudeDesktop, isClaudeDesktopRunning, openClaudeDesktop } = require('./presence-bootstrap');

const DIRECT_ACTIONS = Object.freeze(['open-full-app', 'close-full-app', 'open-claude', 'close-claude', 'open-application', 'close-application']);
const STATUS_CACHE_MS = 750;
const APPLICATION_TRANSITION_TIMEOUT_MS = 8_000;

// #region 01 — Errori e attese bounded

function controlError(message, code, status = 503) {
  return Object.assign(new Error(message), { code, status });
}

function waitFor(predicate, { timeoutMs = 4_000, intervalMs = 80 } = {}) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const inspect = async () => {
      if (await predicate()) { resolve(true); return; }
      if (Date.now() >= deadline) { resolve(Boolean(await predicate())); return; }
      setTimeout(inspect, intervalMs);
    };
    inspect();
  });
}

// #endregion

// #region 02 — Controllo desktop headless

function createHeadlessDesktopControl({
  appRoot,
  sharedDataRoot,
  env = process.env,
  bridgeClient,
  launchDesktop = launchInteractiveDesktop,
  desktopState = processLockState,
  claudeState = isClaudeDesktopRunning,
  launchClaude = openClaudeDesktop,
  closeDesktop = requestProcessShutdown,
  closeClaude = closeClaudeDesktop,
  applicationStatus = desktopApplicationStatus,
  foregroundApplication = foregroundDesktopApplication,
  launchApplication = openDesktopApplication,
  closeApplication = closeDesktopApplication,
  now = Date.now
} = {}) {
  const uiLockPath = path.join(path.resolve(sharedDataRoot), 'desktop-ui.lock');
  let cachedClaudeOpen = false;
  let statusCheckedAt = 0;
  let cachedApplications = [];

  async function directStatus() {
    if (env.NEXUS_WINDOWS_NONINTERACTIVE === '1') {
      return Object.freeze({ available: false, fullAppOpen: false, claudeOpen: false,
        applications: [], allowedActions: Object.freeze([]), foregroundApplicationId: '',
        logicalDisplays: Object.freeze([]), selectedDisplayId: '', nucleusVisible: null });
    }
    if (now() - statusCheckedAt >= STATUS_CACHE_MS) {
      [cachedClaudeOpen, cachedApplications] = await Promise.all([
        claudeState(),
        applicationStatus({ env })
      ]);
      statusCheckedAt = now();
    }
    const foreground = await foregroundApplication({ env });
    return Object.freeze({
      available: true,
      nucleusVisible: null,
      fullAppOpen: desktopState(uiLockPath).running,
      claudeOpen: cachedClaudeOpen,
      applications: cachedApplications,
      foregroundApplicationId: foreground?.id || '',
      selectedDisplayId: '',
      logicalDisplays: Object.freeze([]),
      allowedActions: DIRECT_ACTIONS
    });
  }

  async function bridgeStatus() {
    if (!bridgeClient?.status) return null;
    try {
      const status = await bridgeClient.status();
      return status?.available === true ? status : null;
    } catch { return null; }
  }

  async function status() {
    return await bridgeStatus() || directStatus();
  }

  async function execute(command) {
    const action = String(command?.action || '');
    const currentBridge = await bridgeStatus();
    if (currentBridge?.allowedActions?.includes(action)) {
      return bridgeClient.execute(command);
    }
    if (env.NEXUS_WINDOWS_NONINTERACTIVE === '1') {
      throw controlError('Accedi a Windows per controllare le applicazioni del desktop.', 'DESKTOP_SESSION_UNAVAILABLE');
    }
    if (!DIRECT_ACTIONS.includes(action)) {
      throw controlError('Avvia manualmente la Presence per usare questa azione.', 'PRESENCE_UNAVAILABLE');
    }
    if (action === 'open-full-app') {
      await launchDesktop({ appRoot, env });
      if (!await waitFor(() => desktopState(uiLockPath).running)) {
        throw controlError('Interfaccia NexusNXS non avviata in tempo.', 'PRESENCE_UI_START_TIMEOUT');
      }
      return directStatus();
    }
    if (action === 'close-full-app') {
      if (desktopState(uiLockPath).running) closeDesktop(uiLockPath);
      if (!await waitFor(() => !desktopState(uiLockPath).running)) {
        throw controlError('Interfaccia NexusNXS non chiusa in tempo.', 'PRESENCE_UI_STOP_TIMEOUT');
      }
      return directStatus();
    }
    if (action === 'close-claude') {
      await closeClaude();
      let closed = await waitFor(async () => !await claudeState(), { timeoutMs: 1_500, intervalMs: 120 });
      if (!closed) {
        await closeClaude({ force: true });
        closed = await waitFor(async () => !await claudeState(), { timeoutMs: 4_000, intervalMs: 120 });
      }
      if (!closed) {
        throw controlError('Claude non si e chiusa in tempo.', 'CLAUDE_STOP_TIMEOUT');
      }
      cachedClaudeOpen = false;
      statusCheckedAt = now();
      return directStatus();
    }
    if (action === 'open-application' || action === 'close-application') {
      if (action === 'open-application') await launchApplication(command.applicationId, { env });
      else await closeApplication(command.applicationId, { env });
      statusCheckedAt = 0;
      const expectedOpen = action === 'open-application';
      const confirmed = await waitFor(async () => {
        cachedApplications = await applicationStatus({ env });
        return cachedApplications.some((entry) => entry.id === command.applicationId
          && entry.open === expectedOpen);
      }, { timeoutMs: APPLICATION_TRANSITION_TIMEOUT_MS, intervalMs: 160 });
      statusCheckedAt = now();
      if (!confirmed) {
        throw controlError(
          expectedOpen ? 'Applicazione non avviata in tempo.' : 'Applicazione non chiusa in tempo.',
          expectedOpen ? 'DESKTOP_APP_START_TIMEOUT' : 'DESKTOP_APP_STOP_TIMEOUT',
          409
        );
      }
      return directStatus();
    }
    await launchClaude();
    if (!await waitFor(claudeState, { timeoutMs: 4_000, intervalMs: 120 })) {
      throw controlError('Claude non si e aperta in tempo.', 'CLAUDE_START_TIMEOUT');
    }
    cachedClaudeOpen = true;
    statusCheckedAt = now();
    return directStatus();
  }

  return Object.freeze({ status, execute });
}

// #endregion

module.exports = { DIRECT_ACTIONS, createHeadlessDesktopControl, waitFor };
