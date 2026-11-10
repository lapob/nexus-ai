/**
 * @module web/paired
 * @description Modalità associata della UI unica: il telefono (o un altro browser) collegato al PC con un codice usa le conversazioni del PC tramite l'ingresso privato. Il token resta su questo dispositivo e si rinnova ogni giorno.
 */
import type { Capabilities, StreamEvent } from './api';
import type { Conversation } from './store';
import type { Platform, SendRequest } from './platform';

/** Interpreta readyz: 200 pronto; un errore che dice offline (PC spento, gateway irraggiungibile) è offline, il resto è avvio. */
export async function readStatus(response: Response): Promise<'ready' | 'preparing' | 'offline'> {
  if (response.ok) return 'ready';
  if (response.status === 502 || response.status === 504) return 'offline';
  const body = await response.json().catch(() => null) as { status?: unknown } | null;
  return body?.status === 'offline' ? 'offline' : 'preparing';
}

// #region 01 — Sessione del dispositivo

const TOKEN_KEY = 'nexus.remote.token';
const ROTATED_KEY = 'nexus.remote.rotatedAt';
const MAP_KEY = 'nexus.remote.conversations';

const read = (key: string) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const write = (key: string, value: string) => { try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch { /* archiviazione non disponibile */ } };

/** La pagina è servita dall'ingresso privato del PC (Tailscale/LAN): il gateway lo dichiara con un meta tag. */
export function isPairedIngress(): boolean {
  return document.querySelector('meta[name="nxs-ingress"]')?.getAttribute('content') === 'private';
}

export function pairedToken(): string { return read(TOKEN_KEY); }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = pairedToken();
  const response = await fetch(path, {
    ...init, credentials: 'omit',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) }
  });
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (response.status === 401) { write(TOKEN_KEY, ''); window.dispatchEvent(new Event('nxs-paired-expired')); }
  if (!response.ok) throw Object.assign(new Error(body?.error || 'Richiesta non riuscita.'), { status: response.status });
  return body;
}

/** Associa questo dispositivo con il codice mostrato sul PC (anche da QR: #pair=CODICE&device=NOME). */
export async function pairDevice(code: string, deviceName: string): Promise<void> {
  const result = await request<{ token: string }>('/api/pair', { method: 'POST', body: JSON.stringify({ code: code.trim(), deviceName: deviceName.trim() || 'Telefono' }) });
  write(TOKEN_KEY, result.token);
  write(ROTATED_KEY, String(Date.now()));
}

async function rotateIfDue() {
  if (!pairedToken() || Date.now() - Number(read(ROTATED_KEY) || 0) < 86_400_000) return;
  try {
    const result = await request<{ token?: string; rotatedAt?: number }>('/api/session/rotate', { method: 'POST', body: '{}' });
    if (result.token) { write(TOKEN_KEY, result.token); write(ROTATED_KEY, String(result.rotatedAt || Date.now())); }
  } catch { /* si riprova al prossimo avvio */ }
}

// #endregion

// #region 02 — Conversazioni del PC

type Turn = { role: 'user' | 'assistant'; content: string; createdAt?: number };
type ServerConversation = { id: string; title: string; createdAt: number; updatedAt: number; turns: Turn[] };

/** Id locale → id della conversazione sul PC (le conversazioni nuove nascono in locale). */
const mapping = (): Record<string, string> => { try { return JSON.parse(read(MAP_KEY) || '{}'); } catch { return {}; } };
const remember = (local: string, remote: string) => write(MAP_KEY, JSON.stringify({ ...mapping(), [local]: remote }));

const toConversation = (record: ServerConversation): Conversation => ({
  id: record.id, title: record.title || 'Conversazione', createdAt: record.createdAt, updatedAt: record.updatedAt,
  messages: record.turns.map((turn, index) => ({ id: `${record.id}-${index}`, role: turn.role, content: turn.content, createdAt: Number(turn.createdAt) || record.updatedAt }))
});

async function serverId(localId: string): Promise<string> {
  const known = mapping()[localId];
  if (known) return known;
  if (/^[0-9a-f-]{36}$/i.test(localId)) {
    // Conversazione già del PC (caricata dalla lista): l'id locale coincide.
    const existing = await request<ServerConversation>(`/api/conversations/${encodeURIComponent(localId)}`).catch(() => null);
    if (existing) { remember(localId, existing.id); return existing.id; }
  }
  const created = await request<ServerConversation>('/api/conversations', { method: 'POST', body: '{}' });
  remember(localId, created.id);
  return created.id;
}

/** Il PC del proprietario legge il progetto intero: istruzioni e tutti i file (tetto dei progetti + margine). */
const OWNER_PROJECT_BUDGET = 610_000;

const utf8Base64 = (text: string) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};

const lastAnswer =(record: Partial<ServerConversation>) => [...(record.turns || [])].reverse().find((turn) => turn.role === 'assistant')?.content || '';

/**
 * Legge lo stream NDJSON del PC: token man mano che il modello scrive, fasi reali, evento finale.
 * Se la connessione cade senza evento finale, lo segnala: il messaggio resta sul PC e ricompare nella cronologia.
 */
export async function consumeStream(body: ReadableStream<BufferSource>, onEvent: (event: StreamEvent) => void): Promise<void> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '', text = '', terminal = false;
  const handle = (line: string) => {
    if (!line.trim()) return;
    let event: Record<string, unknown>;
    try { event = JSON.parse(line); } catch { return; }
    if (event.type === 'token' && typeof event.token === 'string') {
      text += event.token;
      onEvent({ type: 'token', token: event.token, cursor: Number(event.cursor) || text.length });
    } else if (event.type === 'phase') {
      const activity = event.activity as { text?: unknown; phase?: unknown } | undefined;
      if (typeof activity?.text === 'string' && activity.text && activity.phase !== 'done' && activity.phase !== 'error') onEvent({ type: 'phase', label: activity.text.slice(0, 160) });
    } else if (event.type === 'complete') {
      terminal = true;
      const conversation = event.conversation as Partial<ServerConversation> | undefined;
      const message = typeof event.message === 'string' && event.message ? event.message : (conversation ? lastAnswer(conversation) : '') || text;
      onEvent({ type: 'complete', message, sources: [] });
    } else if (event.type === 'error') {
      terminal = true;
      onEvent({ type: 'error', error: typeof event.error === 'string' ? event.error : 'La risposta non è stata completata.' });
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      lines.forEach(handle);
    }
    handle(buffer);
  } finally { reader.releaseLock(); }
  if (!terminal) onEvent({ type: 'error', error: 'Connessione con il PC interrotta. La risposta comparirà nella cronologia.' });
}

// #endregion

// #region 03 — Piattaforma

/** Allegati attivi: il PC li legge per intero (profilo proprietario). La voce resta sul PC. */
const NO_VOICE: Capabilities = { voiceInput: false, voiceOutput: false, attachments: true };

export function pairedPlatform(): Platform {
  void rotateIfDue();
  return {
    kind: 'paired',
    capabilities: async () => NO_VOICE,
    status: async () => {
      try { return await readStatus(await fetch('/readyz', { cache: 'no-store' })); } catch { return 'offline'; }
    },
    send: async (sendRequest: SendRequest) => {
      const conversationId = await serverId(sendRequest.conversationId || sendRequest.clientMessageId);
      const token = pairedToken();
      // Il PC legge gli allegati di testo per intero e non li salva nei turni: lì viaggia il contesto del progetto.
      const attachments = [
        ...(sendRequest.project ? [{ name: `Progetto ${sendRequest.project.name}.md`.replace(/[\\/:*?"<>|]+/g, ' '), mime: 'text/markdown', data: utf8Base64(sendRequest.project.context(OWNER_PROJECT_BUDGET)) }] : []),
        ...sendRequest.attachments.map(({ name, mime, data }) => ({ name, mime, data }))
      ];
      const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
        method: 'POST', signal: sendRequest.signal, credentials: 'omit',
        headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson, application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ text: sendRequest.text, mode: sendRequest.mode, clientMessageId: sendRequest.clientMessageId,
          ...(attachments.length ? { attachments } : {}) })
      });
      if (response.status === 401) { write(TOKEN_KEY, ''); window.dispatchEvent(new Event('nxs-paired-expired')); }
      const streamed = response.ok && response.body && (response.headers.get('content-type') || '').includes('application/x-ndjson');
      if (!streamed) {
        // PC meno recente o messaggio già completato (deduplicato): risposta JSON intera.
        const body = await response.json().catch(() => ({})) as ServerConversation & { error?: string };
        if (!response.ok) throw Object.assign(new Error(body?.error || 'Richiesta non riuscita.'), { status: response.status });
        sendRequest.onEvent({ type: 'complete', message: lastAnswer(body), sources: [] });
        return;
      }
      await consumeStream(response.body!, sendRequest.onEvent);
    },
    cancel: async () => {},
    transcribe: async () => { throw new Error('Voce non disponibile in modalità associata.'); },
    synthesize: async () => { throw new Error('Voce non disponibile in modalità associata.'); },
    pickAttachments: null,
    acceptsDroppedFiles: true,
    loadConversations: async () => {
      if (!pairedToken()) return [];
      const rows = await request<Array<{ id: string }>>('/api/conversations');
      const records = await Promise.all(rows.slice(0, 30).map((row) => request<ServerConversation>(`/api/conversations/${encodeURIComponent(row.id)}`).catch(() => null)));
      return records.filter((record): record is ServerConversation => Boolean(record)).map(toConversation);
    },
    // Il PC conserva la cronologia: qui non si salva né si elimina nulla.
    saveConversation: () => {},
    removeConversation: () => {},
    forgetRemote: async () => { write(TOKEN_KEY, ''); write(MAP_KEY, ''); },
    rate: async () => {}
  };
}

// #endregion
