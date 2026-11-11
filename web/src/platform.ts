/**
 * @module web/platform
 * @description Una sola interfaccia cosmica, due trasporti: API pubbliche sul web, ponte IPC sicuro (motore locale, cronologia su disco, voce locale) nell'app desktop.
 */
import * as api from './api';
import type { Capabilities, ChatMode, Preferences, StreamEvent, Turn } from './api';
import type { Pending } from './attachments';
import type { Conversation } from './store';
import { isPairedIngress, pairedPlatform } from './paired';

/** Progetto visto dai trasporti: nome e contesto costruito entro il budget di ciascun canale. */
export interface ProjectRef { name: string; context: (budget: number) => string }

export interface SendRequest {
  text: string; history: Turn[]; mode: ChatMode; clientMessageId: string; preferences: Preferences;
  /** Conversazione locale di destinazione (usata dalla modalità associata). */
  conversationId?: string;
  /** Progetto della conversazione: istruzioni e file entrano come contesto, adattati al trasporto. */
  project?: ProjectRef | null;
  signal: AbortSignal; onEvent: (event: StreamEvent) => void; attachments: Pending[];
}

export interface Platform {
  kind: 'web' | 'desktop' | 'paired';
  capabilities(): Promise<Capabilities>;
  status(): Promise<'ready' | 'preparing' | 'offline'>;
  send(request: SendRequest): Promise<void>;
  cancel(clientMessageId: string): Promise<void>;
  transcribe(wav: Blob): Promise<string>;
  synthesize(text: string, options: { signal: AbortSignal; onSegment: (wav: ArrayBuffer) => Promise<void> | void }): Promise<void>;
  /** Desktop: selettore nativo (estrazione nel main process). Web: null → input file del browser. */
  pickAttachments: (() => Promise<Pending[]>) | null;
  /** File trascinati o incollati: solo dove il contenuto può essere letto nel renderer. */
  acceptsDroppedFiles: boolean;
  loadConversations(): Promise<Conversation[] | null>;
  saveConversation(conversation: Conversation): void;
  removeConversation(id: string): void;
  forgetRemote(): Promise<void>;
  /** Voto della risposta identificata dall'id della richiesta. */
  rate(requestId: string, rating: 'up' | 'down'): Promise<void>;
}

// #region Web

/** Il contesto del progetto apre la cronologia come scambio iniziale: resta anche nelle chat lunghe. */
export function withProject(history: Turn[], project: ProjectRef | null | undefined, budget: number, keep: number): Turn[] {
  if (!project) return history.slice(-keep);
  return [{ role: 'user', content: project.context(budget) }, { role: 'assistant', content: 'Va bene: seguo istruzioni e file del progetto.' }, ...history.slice(-(keep - 2))];
}

const webPlatform: Platform = {
  kind: 'web',
  capabilities: api.capabilities,
  status: api.serviceStatus,
  // Ospite pubblico: ogni turno della cronologia arriva al gateway fino a 4.000 caratteri.
  send: (request) => api.streamMessage({ ...request, history: withProject(request.history, request.project, 3_900, 24), conversationPreferences: request.preferences, attachments: request.attachments }),
  cancel: api.cancelMessage,
  transcribe: (wav) => api.transcribe(wav),
  synthesize: (text, options) => api.synthesize(text, options),
  pickAttachments: null,
  acceptsDroppedFiles: true,
  loadConversations: async () => null,
  saveConversation: () => {},
  removeConversation: () => {},
  forgetRemote: api.forgetServerMemory,
  rate: (requestId, rating) => api.rateMessage(requestId, rating === 'up' ? 1 : -1)
};

// #endregion

// #region Desktop (ponte IPC del preload)

/* eslint-disable @typescript-eslint/no-explicit-any */
type Bridge = Record<string, (...args: any[]) => any>;

/** Fonti del desktop: link solo https; le note locali restano titoli senza percorso. */
function desktopSources(items: Array<{ title?: unknown; url?: unknown; heading?: unknown }>) {
  return items.slice(0, 12).flatMap((item) => {
    const title = String(item?.title || item?.heading || '').slice(0, 200);
    let url = '';
    try { const parsed = new URL(String(item?.url || '')); if (parsed.protocol === 'https:') url = parsed.href; } catch { /* nota locale */ }
    return title || url ? [{ title: title || undefined, url }] : [];
  });
}

function desktopPlatform(bridge: Bridge): Platform {
  const requests = new Map<string, string>();
  const saveTimers = new Map<string, number>();

  const toRecord = (conversation: Conversation) => ({
    id: conversation.id, title: conversation.title, createdAt: conversation.createdAt, updatedAt: conversation.updatedAt, incomplete: false,
    turns: conversation.messages.filter((message) => message.content && !message.error)
      .map((message) => ({ role: message.role, content: message.content, createdAt: message.createdAt }))
  });

  return {
    kind: 'desktop',
    capabilities: async () => {
      const [input, output] = await Promise.all([
        Promise.resolve(bridge.voiceCapabilities?.()).catch(() => null),
        Promise.resolve(bridge.neuralVoiceCapabilities?.()).catch(() => null)
      ]);
      return { voiceInput: input?.available === true, voiceOutput: output?.available === true, attachments: true };
    },
    status: async () => {
      try { const health = await bridge.health(); return health?.ok ? 'ready' : health?.status === 'offline' ? 'offline' : 'preparing'; }
      catch { return 'offline'; }
    },
    send: (request) => new Promise<void>((resolve, reject) => {
      const requestId = request.clientMessageId;
      requests.set(request.clientMessageId, requestId);
      let content = '';
      let settled = false;
      const finish = (error?: Error) => { if (settled) return; settled = true; unsubscribe(); requests.delete(request.clientMessageId); if (error) reject(error); else resolve(); };
      // Eventi del main process: start, phase, thinking, token, replace, sources, complete, error, cancel.
      const unsubscribe = bridge.onStreamEvent((event: any) => {
        if (event?.requestId !== requestId) return;
        if (event.type === 'token' && typeof event.token === 'string') { content += event.token; request.onEvent({ type: 'token', token: event.token, cursor: content.length }); }
        else if (event.type === 'replace' && typeof event.token === 'string') { content = event.token; request.onEvent({ type: 'replace', text: content }); }
        else if (event.type === 'phase' && event.phase?.label) request.onEvent({ type: 'phase', label: String(event.phase.label).slice(0, 160) });
        else if (event.type === 'sources' && Array.isArray(event.sources)) request.onEvent({ type: 'sources', sources: desktopSources(event.sources) });
        else if (event.type === 'memory' && event.memory && ['remember', 'update', 'forget'].includes(event.memory.action)) {
          const id = Number(event.memory.id);
          request.onEvent({ type: 'memory', memory: { action: event.memory.action, id: Number.isInteger(id) && id > 0 ? id : null, content: String(event.memory.content || '').slice(0, 240), count: Math.max(0, Number(event.memory.count) || 0) } });
        }
        else if (event.type === 'plan' && Array.isArray(event.plan)) {
          const statuses = ['pending', 'in_progress', 'done', 'skipped'];
          const plan = event.plan.slice(0, 8).map((step: any) => ({ title: String(step?.title || '').slice(0, 90), status: statuses.includes(step?.status) ? step.status : 'pending' })).filter((step: { title: string }) => step.title);
          if (plan.length) request.onEvent({ type: 'plan', plan });
        }
        else if (event.type === 'complete') { request.onEvent({ type: 'complete', message: String(event.result?.message?.content || content), sources: [] }); finish(); }
        else if (event.type === 'error') { request.onEvent({ type: 'error', error: String(event.error?.message || event.error || 'Risposta non completata.') }); finish(); }
        else if (event.type === 'cancel') finish(Object.assign(new Error('Richiesta annullata.'), { name: 'AbortError' }));
      });
      request.signal.addEventListener('abort', () => { void bridge.cancel(requestId); }, { once: true });
      Promise.resolve(bridge.streamChat({
        question: request.text, mode: request.mode, requestId,
        history: withProject(request.history, request.project, 46_000, 16),
        attachmentIds: request.attachments.map((item) => item.id)
      })).catch((error: Error) => finish(error));
    }),
    cancel: async (clientMessageId) => { const id = requests.get(clientMessageId); if (id) await bridge.cancel(id); },
    transcribe: async (wav) => {
      const result = await bridge.transcribeVoiceAudio(new Uint8Array(await wav.arrayBuffer()));
      if (result?.error || !result?.text) throw new Error(result?.error || 'Nessuna frase riconosciuta.');
      return String(result.text);
    },
    // Il motore locale accetta fino a 900 caratteri: si legge frase per frase, in ordine.
    synthesize: async (text, { signal, onSegment }) => {
      const parts = text.match(/[^.!?]+[.!?]*\s*/g)?.reduce<string[]>((chunks, sentence) => {
        const last = chunks.at(-1);
        if (last && last.length + sentence.length <= 850) chunks[chunks.length - 1] = last + sentence; else chunks.push(sentence.slice(0, 850));
        return chunks;
      }, []) ?? [text.slice(0, 850)];
      const stop = () => { void bridge.stopSpeaking?.(); };
      signal.addEventListener('abort', stop, { once: true });
      try {
        for (const part of parts) {
          if (signal.aborted) return;
          const result = await bridge.synthesizeVoice({ text: part.trim(), gender: 'male', language: 'it', delivery: 'warm' });
          if (signal.aborted) return;
          const bytes = result?.audio instanceof Uint8Array ? result.audio : new Uint8Array(result?.audio || []);
          await onSegment(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
        }
      } finally { signal.removeEventListener('abort', stop); }
    },
    pickAttachments: async () => {
      const selected = await bridge.selectAttachments() as Array<{ id: string; name: string; kind?: string; size?: number }>;
      return selected.map((item) => ({ id: item.id, name: item.name, mime: item.kind === 'image' ? 'image/*' : 'application/octet-stream', size: Number(item.size) || 0, data: '' }));
    },
    acceptsDroppedFiles: false,
    loadConversations: async () => {
      const records = await bridge.listConversationHistory() as Array<{ id: string; title: string; createdAt: number; updatedAt: number; turns: Array<{ role: 'user' | 'assistant'; content: string; createdAt: number }> }>;
      return records.map((record) => ({ id: record.id, title: record.title, createdAt: record.createdAt, updatedAt: record.updatedAt,
        messages: record.turns.map((turn, index) => ({ id: `${record.id}-${index}`, role: turn.role, content: turn.content, createdAt: turn.createdAt })) }));
    },
    // Salvataggio differito: la cronologia su disco alimenta anche la memoria automatica.
    saveConversation: (conversation) => {
      window.clearTimeout(saveTimers.get(conversation.id));
      saveTimers.set(conversation.id, window.setTimeout(() => { saveTimers.delete(conversation.id); void bridge.saveConversationHistory(toRecord(conversation)); }, 600));
    },
    removeConversation: (id) => { void bridge.removeConversationHistory(id); },
    forgetRemote: async () => {},
    rate: async (requestId, rating) => { await bridge.rateResponse({ requestId, rating, target: 'current' }); }
  };
}

// #endregion

const bridge = (window as unknown as { nexus?: Bridge }).nexus;
/** Ponte IPC del desktop, null sul web: lo usano i pannelli del Centro di controllo. */
export const desktopBridge: Bridge | null = bridge && typeof bridge.streamChat === 'function' ? bridge : null;
export const platform: Platform = desktopBridge ? desktopPlatform(desktopBridge) : isPairedIngress() ? pairedPlatform() : webPlatform;
