/**
 * @module web/paired
 * @description Modalità associata della UI unica: il telefono (o un altro browser) collegato al PC con un codice usa le conversazioni del PC tramite l'ingresso privato. Il token resta su questo dispositivo e si rinnova ogni giorno.
 */
import type { Capabilities, StreamEvent } from './api';
import type { Conversation } from './store';
import type { Platform, SendRequest } from './platform';

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
      try { return (await fetch('/readyz', { cache: 'no-store' })).ok ? 'ready' : 'preparing'; } catch { return 'offline'; }
    },
    send: async (sendRequest: SendRequest) => {
      const conversationId = await serverId(sendRequest.conversationId || sendRequest.clientMessageId);
      // La risposta privata non è in streaming: si mostrano le fasi reali del PC finché arriva.
      let lastPhase = '';
      const poll = window.setInterval(async () => {
        try {
          const activity = await request<{ text?: string; phase?: string }>(`/api/activity?conversation=${encodeURIComponent(conversationId)}`);
          if (activity.text && activity.phase !== 'idle' && activity.phase !== 'done' && activity.text !== lastPhase) {
            lastPhase = activity.text;
            sendRequest.onEvent({ type: 'phase', label: activity.text.slice(0, 160) } as StreamEvent);
          }
        } catch { /* la risposta finale resta la fonte di verità */ }
      }, 700);
      try {
        const updated = await request<ServerConversation>(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
          method: 'POST', signal: sendRequest.signal,
          body: JSON.stringify({ text: sendRequest.text, mode: sendRequest.mode, clientMessageId: sendRequest.clientMessageId,
            ...(sendRequest.attachments.length ? { attachments: sendRequest.attachments.map(({ name, mime, data }) => ({ name, mime, data })) } : {}) })
        });
        const answer = [...updated.turns].reverse().find((turn) => turn.role === 'assistant')?.content || '';
        sendRequest.onEvent({ type: 'complete', message: answer, sources: [] });
      } finally { window.clearInterval(poll); }
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
