/**
 * @module web/api
 * @description Client del contratto pubblico esistente (/api/guest/*): sessione anonima, streaming NDJSON con ripresa, annullamento e cancellazione.
 */

export type ChatMode = 'fast' | 'deep';
export interface Turn { role: 'user' | 'assistant'; content: string }
/** `url` vuoto: fonte locale (nota della knowledge sul PC), mostrata senza link. */
export interface Source { title?: string; url: string; snippet?: string }
export interface Preferences { responseStyle: 'concise' | 'natural' | 'detailed'; tone: 'neutral' | 'warm' | 'direct'; responseLanguage: 'auto' | 'it' | 'en' | 'es' | 'fr' | 'de' }

export type StreamEvent =
  | { type: 'token'; token: string; cursor: number }
  | { type: 'replace'; text: string }
  | { type: 'phase'; label: string }
  | { type: 'sources'; sources: Source[] }
  | { type: 'complete'; message: string; sources: Source[] }
  | { type: 'error'; error: string };

const INSTALLATION_KEY = 'nxs.next.installation';
const SESSION_KEY = 'nxs.next.session';

function safeStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** Identificativo anonimo dell'installazione: generato in locale, mai derivato da dati personali. */
export function installationId(): string {
  const storage = safeStorage();
  const existing = storage?.getItem(INSTALLATION_KEY);
  if (existing && /^[a-f0-9-]{20,80}$/i.test(existing)) return existing;
  const created = crypto.randomUUID();
  storage?.setItem(INSTALLATION_KEY, created);
  return created;
}

interface Session { token: string; expiresAt: number }

let pending: Promise<Session> | null = null;

async function bootstrap(): Promise<Session> {
  const response = await fetch('/api/guest/bootstrap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit',
    body: JSON.stringify({ installationId: installationId() })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.token !== 'string') throw new Error(body.error || 'Sessione non disponibile. Riprova tra poco.');
  const session = { token: body.token, expiresAt: Number(body.expiresAt) || Date.now() + 30 * 60_000 };
  try { window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* sessione solo in memoria */ }
  return session;
}

/** Riusa il token della scheda finché valido; un solo bootstrap concorrente. */
export async function session(force = false): Promise<Session> {
  if (!force) {
    try {
      const cached = JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || 'null') as Session | null;
      if (cached?.token && cached.expiresAt - 60_000 > Date.now()) return cached;
    } catch { /* storage non disponibile */ }
  }
  pending ??= bootstrap().finally(() => { pending = null; });
  return pending;
}

async function authorized(path: string, init: RequestInit, retried = false): Promise<Response> {
  const { token } = await session(retried);
  const response = await fetch(path, { ...init, credentials: 'omit', headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (response.status === 401 && !retried) return authorized(path, init, true);
  return response;
}

export interface Attachment { name: string; mime: string; data: string; size: number }

export interface StreamRequest {
  text: string; history: Turn[]; mode: ChatMode; clientMessageId: string;
  conversationPreferences: Preferences; signal: AbortSignal; onEvent: (event: StreamEvent) => void;
  attachments?: Attachment[];
}

/**
 * Invia un messaggio e consuma lo stream NDJSON. Se la connessione cade prima
 * dell'evento finale, riprende dallo stesso cursore con lo stesso
 * clientMessageId (il server deduplica): nessuna risposta duplicata.
 */
export async function streamMessage(request: StreamRequest): Promise<void> {
  let cursor = 0;
  let text = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await authorized('/api/guest/messages/stream', {
      method: 'POST', signal: request.signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: request.text, history: request.history.slice(-24), mode: request.mode, clientMessageId: request.clientMessageId, conversationPreferences: request.conversationPreferences, cursor,
        ...(request.attachments?.length ? { attachments: request.attachments.map(({ name, mime, data }) => ({ name, mime, data })) } : {}) })
    });
    if (!response.ok || !response.body) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || (response.status === 503 ? 'Il servizio AI si sta preparando. Riprova tra poco.' : 'Richiesta non riuscita.'));
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let terminal = false;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(line); } catch { continue; }
          if (event.type === 'heartbeat') continue;
          if (event.type === 'token' && typeof event.token === 'string') {
            text += event.token; cursor = Number(event.cursor) || text.length;
            request.onEvent({ type: 'token', token: event.token, cursor });
          } else if (event.type === 'phase') {
            // Contratto del gateway: { type: 'phase', activity: { text, phase, step } }.
            const activity = event.activity as { text?: unknown; phase?: unknown } | undefined;
            const label = typeof activity?.text === 'string' ? activity.text : '';
            if (label && activity?.phase !== 'done') request.onEvent({ type: 'phase', label: label.slice(0, 160) });
          } else if (event.type === 'sources' && Array.isArray(event.sources)) {
            request.onEvent({ type: 'sources', sources: normalizeSources(event.sources) });
          } else if (event.type === 'complete') {
            terminal = true;
            const message = typeof event.message === 'string' && event.message ? event.message : text;
            request.onEvent({ type: 'complete', message, sources: normalizeSources(event.sources) });
          } else if (event.type === 'error') {
            terminal = true;
            request.onEvent({ type: 'error', error: typeof event.error === 'string' ? event.error : 'La risposta non è stata completata.' });
          }
        }
      }
    } finally { reader.releaseLock(); }
    if (terminal || request.signal.aborted) return;
  }
  request.onEvent({ type: 'error', error: 'Connessione interrotta. Riprova.' });
}

function normalizeSources(value: unknown): Source[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const url = typeof item?.url === 'string' ? item.url : '';
    try { if (new URL(url).protocol !== 'https:') return []; } catch { return []; }
    return [{ url, title: typeof item.title === 'string' ? item.title.slice(0, 200) : undefined, snippet: typeof item.snippet === 'string' ? item.snippet.slice(0, 300) : undefined }];
  }).slice(0, 12);
}

export async function cancelMessage(clientMessageId: string): Promise<void> {
  await authorized('/api/guest/messages/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientMessageId }) }).catch(() => undefined);
}

/** Voto anonimo della risposta: solo il segno, mai il testo (non è consenso all'addestramento). */
export async function rateMessage(clientMessageId: string, rating: 1 | -1): Promise<void> {
  const response = await authorized('/api/guest/rating', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientMessageId, rating }) });
  if (!response.ok) throw new Error('Valutazione non registrata.');
}

/** Cancella sul server le risposte conservate per la ripresa (le chat restano solo locali). */
export async function forgetServerMemory(): Promise<void> {
  await authorized('/api/guest/memory', { method: 'DELETE' }).catch(() => undefined);
}

export interface Capabilities { voiceInput: boolean; voiceOutput: boolean; attachments: boolean }

/** Manifest pubblico: mostra solo le funzioni davvero disponibili ora. */
export async function capabilities(): Promise<Capabilities> {
  try {
    const response = await fetch('/api/capabilities', { cache: 'no-store', credentials: 'omit' });
    // Schema nexusnxs.capabilities.v1: capabilities: [{ id, state }].
    const body = await response.json() as { capabilities?: Array<{ id?: string; state?: string }> };
    const state = (id: string) => body.capabilities?.find((item) => item.id === id)?.state;
    return { voiceInput: state('voice-input') === 'available', voiceOutput: state('voice-output') === 'available', attachments: state('attachments') === 'available' };
  } catch { return { voiceInput: false, voiceOutput: false, attachments: true }; }
}

export async function transcribe(wav: Blob, signal?: AbortSignal): Promise<string> {
  const response = await authorized('/api/guest/voice/transcribe', { method: 'POST', signal, headers: { 'Content-Type': 'audio/wav', 'X-Nexus-Speech-Language': 'auto' }, body: wav });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.text !== 'string') throw new Error(body.error || 'Trascrizione non riuscita.');
  return body.text;
}

/** Sintesi progressiva: ogni segmento WAV arriva appena pronto. */
export async function synthesize(text: string, { signal, onSegment, language = 'it' }: { signal: AbortSignal; onSegment: (wav: ArrayBuffer) => Promise<void> | void; language?: string }): Promise<void> {
  const response = await authorized('/api/guest/voice/synthesize', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify({ text, language, delivery: 'warm' })
  });
  if (!response.ok || !response.body) { const body = await response.json().catch(() => ({})); throw new Error(body.error || 'Voce non disponibile.'); }
  if (!String(response.headers.get('content-type')).includes('ndjson')) { await onSegment(await response.arrayBuffer()); return; }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as { type?: string; audio?: string };
      if (event.type === 'error') throw new Error('Sintesi vocale interrotta.');
      if (event.type === 'audio' && event.audio) await onSegment(Uint8Array.from(atob(event.audio), (char) => char.charCodeAt(0)).buffer);
    }
  }
}

export async function serviceStatus(): Promise<'ready' | 'preparing' | 'offline'> {
  try {
    const response = await fetch('/readyz', { cache: 'no-store', credentials: 'omit' });
    return response.ok ? 'ready' : 'preparing';
  } catch { return 'offline'; }
}
