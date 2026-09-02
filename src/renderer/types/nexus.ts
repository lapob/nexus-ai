/**
 * @module renderer/types/nexus
 * @description Contratti TypeScript tra l'entità visiva e il bridge Electron isolato.
 */

// #region 01 — Stato visuale, modelli e configurazione

export type EntityState =
  | 'booting'
  | 'idle'
  | 'listening'
  | 'speaking'
  | 'thinking'
  | 'responding'
  | 'executing'
  | 'permission'
  | 'offline'
  | 'error';

export interface AudioFrame {
  level: number;
  bass: number;
  mid: number;
  treble: number;
}

export interface AudioBus {
  current: AudioFrame;
}

export interface LiveLogEntry {
  id: number;
  time: string;
  message: string;
  createdAt: number;
}

export type VisualQuality = 'auto' | 'efficient' | 'balanced' | 'ultra' | 'super';
export type CoreAppearance = 'neural' | 'saturn-experimental' | 'jarvis-reactor';
export type MotionPreference = 'system' | 'reduced' | 'full';

export interface InterfacePreferences {
  locale: 'system' | 'it' | 'en';
  accent: 'cyan' | 'blue' | 'violet' | 'emerald';
  shortcuts: {
    voice: string;
    composer: string;
    history: string;
    models: string;
    settings: string;
    privacy: string;
  };
  microphoneId: string;
  microphoneCaptureId: number;
  audioSensitivity: number;
  voiceOutputEnabled: boolean;
  voiceName: string;
  voiceEngine: 'system' | 'neural' | 'expressive';
  voiceGender: 'male' | 'female';
  voiceVocabulary: string;
  wakeWordEnabled: boolean;
  wakeWordConfidence: number;
  wakeWordCooldownMs: number;
  coreAppearance: CoreAppearance;
  visualQuality: VisualQuality;
  hdr: 'auto' | 'on' | 'off';
  motion: MotionPreference;
  particleInteraction: 'auto' | 'gentle' | 'off';
}

export interface TaskStep {
  id: string;
  label: string;
  status: 'waiting' | 'active' | 'complete';
  startedAt?: number;
  completedAt?: number;
}

export interface LocalAttachment {
  id: string;
  name: string;
  kind: 'file';
  fileCount: number;
  size: number;
}

export interface WorkspaceContext { path: string; name: string; active: boolean; }

export interface ModelDescriptor {
  id: string;
  name: string;
  installed?: boolean;
  compatible?: boolean;
  recommended?: boolean;
  reason?: string;
  capabilities?: {
    chat?: boolean;
    embeddings?: boolean;
  };
}

export interface PersonalizationSettings {
  userName: string;
  assistantName: string;
  occupation: string;
  interests: string;
  responseStyle: 'concise' | 'natural' | 'detailed';
  customInstructions: string;
  attentiveFollowUp?: boolean;
}

export interface NexusSettings {
  baseUrl?: string;
  allowLan?: boolean;
  model: string;
  chatModel?: string | null;
  fastModel?: string | null;
  embeddingModel?: string | null;
  temperature: number;
  autoSelectModel?: boolean;
  actionApprovalMode?: 'always' | 'dangerous-only' | 'full-access';
  personalization?: PersonalizationSettings;
}

export interface RemoteSessionStatus {
  enabled: boolean;
  running: boolean;
  allowLan: boolean;
  port: number;
  localUrl: string;
  publicUrl?: string;
  addresses: string[];
  devices: Array<{ id: string; name: string; createdAt: number; lastSeenAt: number }>;
}


export interface HardwareProfile {
  tier: 'lite' | 'balanced' | 'performance';
  performanceLevel: 1 | 2 | 3 | 4 | 5;
  totalMemoryBytes: number;
  gpuMemoryBytes: number;
  cpuThreads: number;
  freeDiskBytes: number | null;
  accelerated: boolean;
  gpuName: string;
  platform: string;
}
export interface BootstrapData {
  settings: NexusSettings;
  ai: {
    health: {
      ok: boolean;
      status: string;
      error?: { message?: string };
    };
    models?: ModelDescriptor[];
  };
  hardware: HardwareProfile;
  runtime: { managed: boolean; remoteInference?: boolean; distributionMode?: 'public' | 'server' | 'developer'; available: boolean; reason?: string };
  stats: { notes: number; chunks: number; indexedAt?: string | null };
  vault: { name: string; source: string };
  workspace?: WorkspaceContext;
}

export interface ProvisioningProfile {
  id: 'lite' | 'essential' | 'complete' | 'ultra';
  label: string;
  description: string;
  main: string;
  fast: string;
  memory: string;
  required: string[];
  missing: string[];
  complete: boolean;
  compatible: boolean;
  downloadBytes: number;
}

export interface ProvisioningStatus {
  engineAvailable: boolean;
  active: boolean;
  recommended: 'lite' | 'essential' | 'complete' | 'ultra';
  profiles: ProvisioningProfile[];
  installed: string[];
  totalMemoryBytes: number;
  freeDiskBytes: number | null;
  hardware: HardwareProfile;
  error?: { message?: string };
}

export interface ProvisioningEvent {
  type: 'model-start' | 'progress' | 'model-complete' | 'complete' | 'cancelled' | 'error';
  profile?: string;
  model?: string;
  index?: number;
  count?: number;
  percent?: number;
  status?: string;
  error?: { message?: string };
}

export interface KnowledgeSource {
  title: string;
  heading?: string;
  relativePath?: string;
  url?: string;
  snippet?: string;
  status: string;
  sourceKind?: string;
  provider?: string;
  score?: number;
}

export interface StreamEvent {
  type: 'phase' | 'start' | 'token' | 'replace' | 'thinking' | 'sources' | 'complete' | 'error' | 'cancel';
  requestId: string;
  token?: string;
  /** Mai contenuto di chain-of-thought: il campo resta per compatibilità IPC. */
  chunk?: never;
  phase?: { step: 'understand' | 'plan' | 'execute' | 'verify'; label: string };
  sources?: KnowledgeSource[];
  error?: { message?: string } | string;
  result?: {
    finishReason?: string;
    incomplete?: boolean;
    sources?: KnowledgeSource[];
  };
}

export interface StartupCapability {
  available: boolean;
  enabled: boolean;
  mode: 'headless-core';
  coreRunsWhenUiClosed: true;
  fullUi: 'on-demand';
  presence: {
    enabled: boolean;
    lightweight: true;
    multiDisplay: true;
    ownsAiRuntime: false;
    ownsRemoteGateway: false;
  };
  activation: Array<'app-shortcut' | 'system-tray' | 'keyboard-shortcut' | 'approved-remote-action'>;
}

// #endregion

// #region 02 — Bridge IPC esposto dal preload

export interface NexusBridge {
  bootstrap(): Promise<BootstrapData>;
  health(): Promise<BootstrapData['ai']['health']>;
  diagnostics(): Promise<{
    ai: { ok?: boolean; status?: string };
    voice: { available?: boolean; devices?: number };
    runtime: { managed?: boolean; available?: boolean };
  }>;
  listModels(): Promise<ModelDescriptor[]>;
  benchmarkModels(): Promise<Array<{ model: string; latencyMs: number; generationMs: number; loadMs: number; promptMs: number; tokensPerSecond: number; recommended: boolean; score: number }>>;
  setModel(model: string): Promise<{ settings: NexusSettings }>;
  saveSettings(settings: Partial<NexusSettings>): Promise<NexusSettings>;
  streamChat(payload: {
    requestId: string;
    question: string;
    mode: 'fast' | 'deep';
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    attachmentIds?: string[];
  }): Promise<unknown>;
  onStreamEvent(listener: (event: StreamEvent) => void): () => void;
  cancel(requestId?: string): Promise<boolean>;
  copyText(text: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  listAgentCapabilities(): Promise<{
    tools: Array<{ name: string; label: string; risk: string; description: string }>;
    applications: Array<{ id: string; label: string }>;
    policy: { approval: string; ticketTtlMs: number; audit: string };
  }>;
  planAction(request: string | { instruction: string; observations?: string[] }): Promise<{
    message?: string;
    error?: string;
    proposal?: { id: string; tool: string; summary: string; preview: string; reason?: string; risk: string; expiresAt?: number } | null;
  }>;
  executeAction(ticketId: string, approved: boolean): Promise<{
    status: string;
    message?: string;
    stdout?: string;
    stderr?: string;
    verification?: 'os-accepted' | 'process-started' | 'exit-code-zero' | 'exit-code-failure' | 'read-complete' | 'write-complete';
    artifacts?: OperationalArtifact[];
  }>;
  voiceCapabilities(): Promise<{ available: boolean; backend?: string }>;
  voiceDevices(): Promise<Array<{ id: number; label: string }>>;
  transcribeVoice(options?: { captureDeviceId?: number }): Promise<{ text?: string; error?: string; language?: string }>;
  transcribeVoiceAudio(audio: Uint8Array): Promise<{ text?: string; error?: string; backend?: string; language?: string; confidence?: number | null }>;
  onVoiceActivity(listener: (activity: { active: boolean; level: number }) => void): () => void;
  onVoicePartial(listener: (partial: { text: string }) => void): () => void;
  stopVoice(): Promise<boolean>;
  finishVoice(): Promise<boolean>;
  neuralVoiceCapabilities(): Promise<{
    available: boolean;
    backend?: string;
    engines?: { neural?: { available: boolean }; expressive?: { available: boolean; recommended?: boolean } };
  }>;
  synthesizeVoice(options: { text: string; gender: 'male' | 'female'; language: string; engine?: 'neural' | 'expressive'; delivery?: 'neutral' | 'warm' | 'calm' | 'serious' | 'energetic' }): Promise<{ backend: string; mimeType: string; audio: Uint8Array }>;
  stopSpeaking(): Promise<boolean>;
  listKnowledgeNotes(): Promise<Array<{ title: string; relativePath: string }>>;
  readKnowledgeNote(path: string): Promise<{ title: string; content: string }>;
  openNote(path: string): Promise<string>;
  saveTrainingExample(example: { requestId: string; prompt: string; response: string; originalResponse?: string; model: string; mode: 'fast' | 'deep' }): Promise<{ status: 'saved'; id: string }>;
  trainingStats(): Promise<{ examples: number; approved: number; quarantined: number; corrected: number; preferencePairs: number; domains: Record<string, number>; evaluationExamples: number; evaluationReady: boolean; nextMilestone: number; memories?: number }>;
  trainingEvaluation(): Promise<{ examples: number; readiness: number; diversity: number; correctionCoverage: number; averagePromptTokens: number; status: 'ready' | 'growing' | 'early' }>;
  clearTrainingExamples(): Promise<{ removed: number }>;
  listMemories(): Promise<Array<{ id: number; type: string; content: string; updatedAt: number; expiresAt?: number | null }>>;
  forgetMemory(id: number): Promise<{ removed: number }>;
  responseCacheStats(): Promise<{ entries: number; hits: number }>;
  clearResponseCache(): Promise<{ removed: number }>;
  exportPersonalData(clientData: unknown, passphrase: string): Promise<{ status: 'saved' | 'cancelled'; path?: string }>;
  importPersonalData(passphrase: string): Promise<{ status: 'imported' | 'cancelled'; settings?: NexusSettings; clientData?: unknown; trainingExamples?: number }>;
  actionHistory(): Promise<Array<{ timestamp: string; event: string; tool: string; preview?: string; code?: number | null }>>;
  undoLastAction(): Promise<{ status: 'restored' | 'empty'; message: string; path?: string }>;
  setCompactWindow(enabled: boolean): Promise<{ compact: boolean }>;
  syncPresence(snapshot: {
    state: EntityState;
    appearance: InterfacePreferences['coreAppearance'];
    motion: InterfacePreferences['motion'];
    quality: InterfacePreferences['visualQuality'];
    wakeWordEnabled: boolean;
    wakeWordConfidence: number;
    wakeWordCooldownMs: number;
    wakeWordSuspended: boolean;
  }): Promise<{ synced: boolean }>;
  reindex(): Promise<{ notes: number; chunks: number }>;
  provisioningStatus(): Promise<ProvisioningStatus>;
  startProvisioning(profile: 'lite' | 'essential' | 'complete' | 'ultra'): Promise<{ status: string; settings: NexusSettings; provisioning: ProvisioningStatus }>;
  cancelProvisioning(): Promise<boolean>;
  onProvisioningEvent(listener: (event: ProvisioningEvent) => void): () => void;
  openEngineInstaller(): Promise<boolean>;
  openVoiceSettings(): Promise<boolean>;
  selectAttachments(): Promise<LocalAttachment[]>;
  getWorkspace(): Promise<WorkspaceContext>;
  selectWorkspace(): Promise<WorkspaceContext>;
  clearWorkspace(): Promise<WorkspaceContext>;
  listConversationHistory(): Promise<import('../systems/ConversationHistory').ConversationRecord[]>;
  saveConversationHistory(record: import('../systems/ConversationHistory').ConversationRecord): Promise<import('../systems/ConversationHistory').ConversationRecord>;
  removeConversationHistory(id: string): Promise<boolean>;
  importConversationHistory(records: import('../systems/ConversationHistory').ConversationRecord[]): Promise<import('../systems/ConversationHistory').ConversationRecord[]>;
  remoteStatus(): Promise<RemoteSessionStatus>;
  startupStatus(): Promise<StartupCapability>;
  configureStartup(enabled: boolean): Promise<StartupCapability>;
  updateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  installUpdate(): Promise<boolean>;
  onUpdateEvent(listener: (status: UpdateStatus) => void): () => void;
  onProactiveEvent(listener: (event: ProactiveSystemEvent) => void): () => void;
  onWakeWordActivation(listener: (event: { source: 'local-windows-sapi'; detectedAt: number }) => void): () => void;
  configureRemote(options: { enabled: boolean; allowLan: boolean; port?: number }): Promise<RemoteSessionStatus>;
  createRemotePairing(): Promise<{ code: string; expiresAt: number; urls?: string[] }>;
  revokeRemoteDevice(id: string): Promise<RemoteSessionStatus>;
      setupRemoteAccess(mode: 'home' | 'away'): Promise<{ status: 'ready' | 'install-required' | 'authorization-required' | 'cancelled'; url?: string }>;
}

export interface ProactiveSystemEvent {
  id: string;
  type: 'system.resume' | 'system.suspend' | 'power.source' | 'network.status' | 'security.alert' | 'update.available' | 'device.health';
  createdAt: number;
  severity: 'info' | 'warning';
  requiresApproval: boolean;
  metadata: { state?: string; source?: string; category?: string; code?: string; summary?: string };
}

export interface UpdateStatus {
  status: 'disabled' | 'checking' | 'current' | 'downloading' | 'ready' | 'error';
  version: string;
  progress: number;
  releaseName?: string;
  releaseNotes?: string;
  channel?: 'preview' | 'beta' | 'stable' | string;
  lastCheckedAt?: number;
  downloadedAt?: number;
}

export interface OperationalArtifact {
  id: string;
  kind: 'file-change' | 'command' | 'file' | 'result';
  title: string;
  subtitle?: string;
  language?: string;
  content?: string;
  previousContent?: string;
  diff?: string;
  added?: number;
  removed?: number;
  truncated?: boolean;
  events?: Array<{ label: string; status: 'complete' | 'warning' }>;
  diagnostics?: Array<{ file: string; line: number; column?: number; message: string }>;
}

declare global {
  interface Window {
    nexus: NexusBridge;
  }
}

// #endregion
