/**
 * @module web/store
 * @description Conversazioni solo locali (nessun account): stato esterno minimo con useSyncExternalStore e persistenza limitata.
 */
import { useSyncExternalStore } from 'react';
import type { ChatMode, Preferences, Source } from './api';

/** Degli allegati si conservano solo nome, tipo e dimensione: i contenuti non vengono salvati. */
export interface AttachmentMeta { name: string; mime: string; size: number }
/** `steps`: passaggi visibili dell'agente (mai ragionamento interno), `sources`: fonti citate. */
export interface Message { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; sources?: Source[]; steps?: string[]; error?: boolean; interrupted?: boolean; attachments?: AttachmentMeta[]; voice?: boolean; rating?: 'up' | 'down'; requestId?: string }
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number; messages: Message[] }
export interface State {
  conversations: Conversation[];
  /** Conversazioni fissate in cima (id): restano anche quando la cronologia arriva dal disco o dal PC. */
  pinned: string[];
  activeId: string | null;
  mode: ChatMode;
  preferences: Preferences;
  generating: boolean;
  phase: string;
}

const STORAGE_KEY = 'nxs.next.state.v1';
const MAX_CONVERSATIONS = 60;
const MAX_MESSAGES = 120;

const DEFAULT_STATE: State = {
  conversations: [], pinned: [], activeId: null, mode: 'fast',
  preferences: { responseStyle: 'natural', tone: 'neutral', responseLanguage: 'auto' },
  generating: false, phase: ''
};

function load(): State {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.conversations)) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...parsed, pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((id: unknown) => typeof id === 'string') : [], generating: false, phase: '' };
  } catch { return DEFAULT_STATE; }
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { generating: _generating, phase: _phase, ...durable } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(durable));
  } catch { /* storage pieno o negato: la sessione continua in memoria */ }
}

let persistTimer = 0;
export function setState(update: (current: State) => State, { durable = true } = {}) {
  state = update(state);
  for (const listener of listeners) listener();
  if (durable) { window.clearTimeout(persistTimer); persistTimer = window.setTimeout(persist, 250); }
}

export function getState() { return state; }

export function useStore<T>(select: (current: State) => T): T {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => select(state));
}

export const uid = () => crypto.randomUUID();

export function activeConversation(current = state): Conversation | null {
  return current.conversations.find((item) => item.id === current.activeId) ?? null;
}

export function newConversation(): string {
  const id = uid();
  const now = Date.now();
  setState((current) => ({ ...current, activeId: id, conversations: [{ id, title: 'Nuova conversazione', createdAt: now, updatedAt: now, messages: [] }, ...current.conversations].slice(0, MAX_CONVERSATIONS) }));
  return id;
}

export function updateConversation(id: string, update: (conversation: Conversation) => Conversation, options?: { durable?: boolean }) {
  setState((current) => ({
    ...current,
    conversations: current.conversations.map((item) => item.id === id ? { ...update(item), updatedAt: Date.now() } : item)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }), options);
}

export function appendMessage(conversationId: string, message: Message) {
  updateConversation(conversationId, (conversation) => ({
    ...conversation,
    title: conversation.messages.length === 0 && message.role === 'user' ? message.content.replace(/\s+/g, ' ').slice(0, 64) : conversation.title,
    messages: [...conversation.messages, message].slice(-MAX_MESSAGES)
  }));
}

export function deleteConversation(id: string) {
  setState((current) => ({ ...current, pinned: current.pinned.filter((item) => item !== id), conversations: current.conversations.filter((item) => item.id !== id), activeId: current.activeId === id ? null : current.activeId }));
}

export function togglePin(id: string) {
  setState((current) => ({ ...current, pinned: current.pinned.includes(id) ? current.pinned.filter((item) => item !== id) : [id, ...current.pinned] }));
}

/** Rinomina senza spostare la conversazione in cima: il titolo non è un'attività nuova. */
export function renameConversation(id: string, title: string) {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!clean) return;
  setState((current) => ({ ...current, conversations: current.conversations.map((item) => item.id === id ? { ...item, title: clean } : item) }));
}

/** Dirama: copia la conversazione fino al messaggio indicato (incluso) in una nuova, che diventa attiva. */
export function forkConversation(id: string, messageId: string): string | null {
  const source = state.conversations.find((item) => item.id === id);
  const index = source?.messages.findIndex((message) => message.id === messageId) ?? -1;
  if (!source || index < 0) return null;
  const fork = uid();
  const now = Date.now();
  const messages = source.messages.slice(0, index + 1).map((message) => ({ ...message, id: uid(), rating: undefined }));
  setState((current) => ({ ...current, activeId: fork,
    conversations: [{ id: fork, title: `${source.title.slice(0, 66)} · ramo`, createdAt: now, updatedAt: now, messages }, ...current.conversations].slice(0, MAX_CONVERSATIONS) }));
  return fork;
}

export function clearAll() {
  setState((current) => ({ ...DEFAULT_STATE, preferences: current.preferences, mode: current.mode }));
}

/** Gruppi della cronologia come nelle app di chat moderne: fissate, oggi, ieri, 7 e 30 giorni, prima. */
export function groupConversations(items: Conversation[], pinned: string[], now = Date.now()) {
  const day = new Date(now); day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  const groups: Array<{ label: string; items: Conversation[] }> = [
    { label: 'Fissate', items: [] }, { label: 'Oggi', items: [] }, { label: 'Ieri', items: [] },
    { label: 'Ultimi 7 giorni', items: [] }, { label: 'Ultimi 30 giorni', items: [] }, { label: 'Meno recenti', items: [] }
  ];
  for (const item of items) {
    const at = item.updatedAt;
    const index = pinned.includes(item.id) ? 0 : at >= today ? 1 : at >= today - 86_400_000 ? 2 : at >= today - 6 * 86_400_000 ? 3 : at >= today - 29 * 86_400_000 ? 4 : 5;
    groups[index].items.push(item);
  }
  return groups.filter((group) => group.items.length);
}
