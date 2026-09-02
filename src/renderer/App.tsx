/**
 * @module renderer/App
 * @description Shell minimale dell'entità: presenza visiva al centro, contesto operativo sul margine.
 */
import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { CommandInput } from './components/CommandInput';
import { ConversationHistory } from './components/ConversationHistory';
import { ConversationTranscript } from './components/ConversationTranscript';
import { ModelSwitcher } from './components/ModelSwitcher';
import { Permissions } from './components/Permissions';
import { ResponseSurface } from './components/ResponseSurface';
import { SettingsOverlay } from './components/SettingsOverlay';
import { UIOverlay } from './components/UIOverlay';
import { UpdateNotice } from './components/UpdateNotice';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { useNexusController } from './hooks/useNexusController';
import { resolvedUiLocale } from './systems/Localization';
import { markStartup } from './systems/StartupMetrics';

// #region 01 — Shell e superfici persistenti

function interfaceDensity(): 'compact' | 'cozy' | 'comfortable' {
  if (window.devicePixelRatio >= 1.75 && window.innerWidth <= 1100) return 'compact';
  if (window.devicePixelRatio >= 1.25 && window.innerWidth <= 1280) return 'cozy';
  return 'comfortable';
}

export function App() {
  const nexus = useNexusController();
  const activeConversation = nexus.conversationHistory.find((record) => record.id === nexus.currentConversationId);
  const activeTitle = activeConversation?.title || nexus.transcript.replace(/\s+/g, ' ').trim().slice(0, 72);
  const continuingConversation = activeConversation && activeConversation.turns.length > 0
    ? { title: activeConversation.title, turns: activeConversation.turns.length }
    : undefined;
  // Mantiene stabile il callback: ModelSwitcher lo usa come dipendenza del
  // polling e una nuova funzione a ogni render riavvierebbe subito l'effetto.
  const refreshModels = useCallback(
    (quiet?: boolean) => nexus.detectModels(undefined, quiet),
    [nexus.detectModels]
  );
  const [windowActive, setWindowActive] = useState(document.hasFocus());
  const [density, setDensity] = useState(interfaceDensity);
  const [controlsAwake, setControlsAwake] = useState(true);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => markStartup('interactive'));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    document.documentElement.lang = resolvedUiLocale(nexus.interfacePreferences.locale);
  }, [nexus.interfacePreferences.locale]);
  useEffect(() => {
    void window.nexus.syncPresence({
      state: nexus.state,
      appearance: nexus.interfacePreferences.coreAppearance,
      motion: nexus.interfacePreferences.motion,
      quality: nexus.interfacePreferences.visualQuality,
      wakeWordEnabled: nexus.interfacePreferences.wakeWordEnabled,
      wakeWordConfidence: nexus.interfacePreferences.wakeWordConfidence,
      wakeWordCooldownMs: nexus.interfacePreferences.wakeWordCooldownMs,
      wakeWordSuspended: nexus.privacyMode || !nexus.voiceEnabled
        || nexus.state === 'listening' || nexus.state === 'speaking'
    });
  }, [
    nexus.interfacePreferences.coreAppearance,
    nexus.interfacePreferences.motion,
    nexus.interfacePreferences.visualQuality,
    nexus.interfacePreferences.wakeWordEnabled,
    nexus.interfacePreferences.wakeWordConfidence,
    nexus.interfacePreferences.wakeWordCooldownMs,
    nexus.privacyMode,
    nexus.state,
    nexus.voiceEnabled
  ]);
  useEffect(() => window.nexus.onWakeWordActivation(() => {
    if (nexus.privacyMode || !nexus.voiceEnabled || nexus.state === 'listening') return;
    nexus.setCommandOpen(false);
    nexus.setHistoryOpen(false);
    nexus.setModelSwitcherOpen(false);
    nexus.setSettingsOpen(false);
    window.requestAnimationFrame(() => void nexus.toggleVoice());
  }), [
    nexus.privacyMode,
    nexus.setCommandOpen,
    nexus.setHistoryOpen,
    nexus.setModelSwitcherOpen,
    nexus.setSettingsOpen,
    nexus.state,
    nexus.toggleVoice,
    nexus.voiceEnabled
  ]);
  useEffect(() => {
    const openCapability = (event: Event) => {
      const capability = String((event as CustomEvent<string>).detail || '');
      nexus.setCommandOpen(false);
      nexus.setHistoryOpen(capability === 'history');
      nexus.setModelSwitcherOpen(capability === 'models');
      nexus.setSettingsOpen(capability === 'settings' || capability === 'remote');
      if (capability === 'remote') {
        window.requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('nexus:open-settings-tab', { detail: 'remote' }));
          window.dispatchEvent(new CustomEvent('nexus:start-pairing'));
        });
      }
    };
    window.addEventListener('nexus:voice-command', openCapability);
    return () => window.removeEventListener('nexus:voice-command', openCapability);
  }, [nexus.setCommandOpen, nexus.setHistoryOpen, nexus.setModelSwitcherOpen, nexus.setSettingsOpen]);
  useEffect(() => {
    const activate = () => setWindowActive(true);
    const deactivate = () => setWindowActive(false);
    const resize = () => setDensity(interfaceDensity());
    window.addEventListener('focus', activate);
    window.addEventListener('blur', deactivate);
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('focus', activate); window.removeEventListener('blur', deactivate); window.removeEventListener('resize', resize); };
  }, []);
  useEffect(() => {
    let timer = window.setTimeout(() => setControlsAwake(false), 4_800);
    const wake = () => {
      setControlsAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setControlsAwake(false), 4_800);
    };
    window.addEventListener('pointermove', wake, { passive: true });
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', wake);
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
  }, []);

  const surfaceOpen = nexus.commandOpen || nexus.historyOpen || Boolean(nexus.viewedConversation)
    || nexus.modelSwitcherOpen || nexus.settingsOpen || Boolean(nexus.permission);
  return (
    <MotionConfig reducedMotion={nexus.interfacePreferences.motion === 'reduced'
      ? 'always'
      : nexus.interfacePreferences.motion === 'system' ? 'user' : 'never'}>
    <main
      id="nexusShell"
      className="entity-shell"
      data-system-state={nexus.state}
      data-motion={nexus.interfacePreferences.motion}
      data-hardware-tier={nexus.hardware?.tier || 'detecting'}
      data-performance-level={nexus.hardware?.performanceLevel || 1}
      data-hdr={nexus.interfacePreferences.hdr}
      data-accent={nexus.interfacePreferences.accent}
      data-core={nexus.interfacePreferences.coreAppearance}
      data-density={density}
      data-window-active={windowActive}
      data-focus={nexus.response.length > 260 || nexus.response.includes('```') || nexus.response.split('\n').length > 7}
      data-command-open={nexus.commandOpen}
      data-generating={nexus.generating}
      data-barge-in={nexus.bargeInListening || Boolean(nexus.queuedVoicePrompt)}
      data-next-turn={(nexus.generating && (nexus.commandOpen || nexus.bargeInListening)) || Boolean(nexus.queuedVoicePrompt)}
      data-privacy={nexus.privacyMode}
      data-conversation-active={Boolean(continuingConversation)}
      data-presence-quiet={!controlsAwake && nexus.state === 'idle' && !surfaceOpen && !nexus.generating}
      aria-label="NEXUSNXS voice interface"
    >
      <div className="window-drag-region" aria-hidden="true" />
      <UpdateNotice />
      {!nexus.viewedConversation && (continuingConversation || nexus.workspace.active) && (
        <div className="active-session-context" aria-label="Contesto conversazione attivo" data-continuing={Boolean(continuingConversation)}>
          <i className="session-continuity-signal" aria-hidden="true" />
          <span>{continuingConversation ? 'Stessa conversazione' : 'Spazio di lavoro'}</span>
          <strong>{continuingConversation ? activeTitle : nexus.workspace.name || 'Spazio autorizzato'}</strong>
          <small>
            {continuingConversation
              ? `${continuingConversation.turns} messaggi · puoi continuare da qui`
              : nexus.workspace.active ? `⌁ ${nexus.workspace.name}` : 'Pronta per iniziare'}
          </small>
        </div>
      )}
      <VoiceVisualizer
        state={nexus.state}
        audioBus={nexus.audioBus}
        preferences={nexus.interfacePreferences}
        hardware={nexus.hardware}
        suspended={surfaceOpen}
        interactionDisabled={nexus.commandOpen || nexus.historyOpen || Boolean(nexus.viewedConversation) || nexus.modelSwitcherOpen || nexus.settingsOpen}
        onActivate={nexus.privacyMode ? nexus.togglePrivacyMode : nexus.toggleVoice}
      />

      <UIOverlay
        state={nexus.state}
        logs={nexus.logs}
        steps={nexus.steps}
        transcript={nexus.transcript}
        voiceNotice={nexus.voiceNotice}
        voiceEnabled={nexus.voiceEnabled}
        audioLevel={nexus.audioLevel}
        generating={nexus.generating}
        bargeInListening={nexus.bargeInListening}
        queuedVoicePrompt={nexus.queuedVoicePrompt}
        runtimePreparing={nexus.runtimePreparing}
        fatalError={nexus.fatalError}
        onToggleVoiceAccess={nexus.toggleVoiceAccess}
        privacyMode={nexus.privacyMode}
        onTogglePrivacy={nexus.togglePrivacyMode}
        onToggleVoice={nexus.toggleVoice}
        shortcuts={nexus.interfacePreferences.shortcuts}
        onOpenCommand={() => {
          nexus.setHistoryOpen(false);
          nexus.setModelSwitcherOpen(false);
          nexus.setSettingsOpen(false);
          nexus.setCommandOpen(true);
        }}
      />

      {!nexus.privacyMode && !nexus.viewedConversation && (
        <ResponseSurface
          response={nexus.response}
          previousResponse={nexus.previousResponse}
          error=""
          active={nexus.generating}
          artifacts={nexus.artifacts}
          trainingSaved={nexus.trainingSaved}
          onApproveTraining={nexus.approveForTraining}
          onRegenerate={nexus.regenerateResponse}
          onContinue={nexus.continueResponse}
          onDismiss={nexus.dismissResponse}
        />
      )}

      <Permissions
        proposal={nexus.permission}
        onDecision={nexus.respondToPermission}
      />

      <CommandInput
        open={nexus.commandOpen}
        queueing={nexus.generating}
        onClose={() => nexus.setCommandOpen(false)}
        onSubmit={(value, attachments) => nexus.submit(value, 'fast', attachments)}
        workspace={nexus.workspace}
        approvalMode={nexus.settings?.actionApprovalMode || 'dangerous-only'}
        onSelectWorkspace={nexus.selectWorkspace}
        onClearWorkspace={nexus.clearWorkspace}
        onApprovalModeChange={nexus.setApprovalMode}
        conversation={continuingConversation}
      />

      <ConversationHistory
        open={nexus.historyOpen}
        records={nexus.conversationHistory}
        currentId={nexus.currentConversationId}
        onClose={() => nexus.setHistoryOpen(false)}
        onSelect={nexus.openConversation}
        onNew={nexus.startNewConversation}
        onDelete={nexus.deleteConversation}
      />

      <ConversationTranscript
        record={nexus.viewedConversation}
        onSteer={nexus.steerConversation}
        onDeleteFrom={nexus.deleteConversationFrom}
        onClose={() => {
          nexus.closeConversationView();
          nexus.setHistoryOpen(true);
        }}
      />

      <ModelSwitcher
        open={nexus.modelSwitcherOpen}
        settings={nexus.settings}
        models={nexus.models}
        hardware={nexus.hardware}
        remoteInference={nexus.remoteInference}
        onClose={() => nexus.setModelSwitcherOpen(false)}
        onSelect={nexus.selectActiveModel}
        onRefresh={refreshModels}
      />

      <SettingsOverlay
        open={nexus.settingsOpen}
        settings={nexus.settings}
        preferences={nexus.interfacePreferences}
        hardware={nexus.hardware}
        models={nexus.models}
        remoteInference={nexus.remoteInference}
        onClose={() => nexus.setSettingsOpen(false)}
        onSave={nexus.saveSettings}
        onSavePreferences={nexus.saveUiPreferences}
        onExportPersonalData={nexus.exportPersonalData}
        onImportPersonalData={nexus.importPersonalData}
      />

      {/* #region 02 — Annunci accessibili */}
      <div className="sr-only" aria-live="polite">
        {nexus.generating ? 'NexusNXS sta rispondendo.' : nexus.transcript}
      </div>
      {/* #endregion */}
    </main>
    </MotionConfig>
  );
}

// #endregion
