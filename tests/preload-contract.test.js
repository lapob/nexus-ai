const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CHANNELS } = require('../src/application/ipc-contracts');

function loadPreloadBridge() {
  const calls = [];
  let exposed;
  const electron = {
    contextBridge: { exposeInMainWorld: (name, value) => { exposed = { name, value }; } },
    ipcRenderer: { invoke: (channel, ...args) => { calls.push({ channel, args }); return Promise.resolve(); }, on: (channel, handler) => calls.push({ channel, handler, subscription: true }), removeListener: (channel, handler) => calls.push({ channel, handler, removal: true }) }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  vm.runInNewContext(source, { require: (name) => {
    assert.equal(name, 'electron', 'Il preload sandboxed non deve importare moduli locali');
    return electron;
  }, Object });
  return { ...exposed, calls };
}

test('il preload espone il bridge NexusNXS completo nel namespace ufficiale', () => {
  const { name, value } = loadPreloadBridge();
  assert.equal(name, 'nexus');
  const required = ['benchmarkModels', 'clearResponseCache', 'forgetMemory', 'listMemories', 'responseCacheStats', 'openExternal', 'onWakeWordActivation', 'createWorkflow', 'nextWorkflowStep', 'decideWorkflowStep', 'cancelWorkflow', 'workflowStatus'];
  for (const method of required) assert.equal(typeof value[method], 'function', `${method} deve essere esposto dal bridge.`);
  assert.ok(Object.keys(value).length >= 60, 'Il bridge NexusNXS non deve perdere funzioni esistenti.');
  for (const method of Object.values(value)) assert.equal(typeof method, 'function');
});

test('ogni metodo preload usa esattamente il canale IPC autoritativo', async () => {
  const { value, calls } = loadPreloadBridge();
  await value.bootstrap(); await value.saveSettings({}); await value.reindex(); await value.listModels();
  await value.getWorkspace(); await value.selectWorkspace(); await value.clearWorkspace();
  await value.cancel(); await value.copyText('test'); await value.openExternal('https://example.com'); await value.openNote('note.md'); await value.chat({ question: 'test' }); await value.health(); await value.diagnostics(); await value.setModel('model'); await value.streamChat({ requestId: 'x' }); await value.embed('text'); await value.listAgentCapabilities(); await value.planAction('apri'); await value.executeAction('ticket', true); await value.createWorkflow({ summary: 'test', steps: [{ tool: 'read_file' }] }); await value.nextWorkflowStep('workflow'); await value.decideWorkflowStep('workflow', 'ticket', true); await value.cancelWorkflow('workflow'); await value.workflowStatus('workflow'); await value.neuralVoiceCapabilities(); await value.synthesizeVoice({ text: 'ciao', gender: 'male', language: 'it' }); await value.stopSpeaking(); await value.voiceCapabilities(); await value.voiceDevices(); await value.transcribeVoice(); await value.transcribeVoiceAudio(new Uint8Array(44)); await value.stopVoice(); await value.finishVoice(); await value.listKnowledgeNotes(); await value.readKnowledgeNote('note.md'); await value.saveTrainingExample({ requestId: 'req-1', prompt: 'domanda', response: 'risposta', model: 'qwen3:8b', mode: 'fast' }); await value.trainingStats(); await value.trainingEvaluation(); await value.clearTrainingExamples(); await value.exportPersonalData({}, 'password-sicura'); await value.importPersonalData('password-sicura'); await value.actionHistory(); await value.undoLastAction(); await value.setCompactWindow(true); await value.provisioningStatus(); await value.startProvisioning('complete'); await value.cancelProvisioning(); await value.openEngineInstaller(); await value.openVoiceSettings(); await value.selectAttachments(); await value.listConversationHistory(); await value.saveConversationHistory({ id: 'x' }); await value.removeConversationHistory('x'); await value.importConversationHistory([]); await value.remoteStatus(); await value.configureRemote({ enabled: true, allowLan: false }); await value.createRemotePairing(); await value.revokeRemoteDevice('device'); await value.setupRemoteAccess('home'); await value.startupStatus(); await value.configureStartup(true);
  assert.deepEqual(calls.map(({ channel }) => channel), [
    CHANNELS.bootstrap, CHANNELS.settings, CHANNELS.reindex, CHANNELS.listModels,
    CHANNELS.workspaceGet, CHANNELS.workspaceSelect, CHANNELS.workspaceClear,
    CHANNELS.cancel, CHANNELS.copy, CHANNELS.openExternal, CHANNELS.openNote, CHANNELS.chat, CHANNELS.health, CHANNELS.diagnostics, CHANNELS.setModel, CHANNELS.streamChat, CHANNELS.embed,
    CHANNELS.agentCapabilities, CHANNELS.agentPlan, CHANNELS.agentExecute, CHANNELS.workflowCreate, CHANNELS.workflowNext, CHANNELS.workflowDecide, CHANNELS.workflowCancel, CHANNELS.workflowStatus, CHANNELS.neuralVoiceCapabilities, CHANNELS.neuralVoiceSpeak, CHANNELS.neuralVoiceStop, CHANNELS.voiceCapabilities, CHANNELS.voiceDevices, CHANNELS.voiceTranscribe, CHANNELS.voiceTranscribeAudio, CHANNELS.voiceStop, CHANNELS.voiceFinish, CHANNELS.knowledgeList, CHANNELS.knowledgeRead, CHANNELS.trainingExample, CHANNELS.trainingStats, CHANNELS.trainingEvaluation, CHANNELS.trainingClear, CHANNELS.backupExport, CHANNELS.backupImport, CHANNELS.actionHistory, CHANNELS.actionUndo, CHANNELS.windowCompact, CHANNELS.provisioningStatus, CHANNELS.provisioningStart, CHANNELS.provisioningCancel, CHANNELS.provisioningEngine, CHANNELS.voiceSettings, CHANNELS.selectAttachments, CHANNELS.historyList, CHANNELS.historySave, CHANNELS.historyRemove, CHANNELS.historyImport, CHANNELS.remoteStatus, CHANNELS.remoteConfigure, CHANNELS.remotePair, CHANNELS.remoteRevoke, CHANNELS.remoteSetup, CHANNELS.startupStatus, CHANNELS.startupConfigure
  ]);
  const unsubscribe = value.onStreamEvent(() => {}); unsubscribe();
  assert.equal(calls.at(-2).channel, CHANNELS.streamEvent); assert.equal(calls.at(-2).subscription, true); assert.equal(calls.at(-1).removal, true);
  const stopProvisioning = value.onProvisioningEvent(() => {}); stopProvisioning();
  assert.equal(calls.at(-2).channel, CHANNELS.provisioningEvent); assert.equal(calls.at(-1).removal, true);
  const stopVoiceActivity = value.onVoiceActivity(() => {}); stopVoiceActivity();
  assert.equal(calls.at(-2).channel, CHANNELS.voiceActivity); assert.equal(calls.at(-1).removal, true);
  const stopVoicePartial = value.onVoicePartial(() => {}); stopVoicePartial();
  assert.equal(calls.at(-2).channel, CHANNELS.voicePartial); assert.equal(calls.at(-1).removal, true);
});
