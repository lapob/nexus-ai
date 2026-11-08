/**
 * @module web/store
 * @description Conversazioni solo locali (nessun account): stato esterno minimo con useSyncExternalStore e persistenza limitata.
 */
import { useSyncExternalStore } from 'react';
import type { ChatMode, Preferences, Source } from './api';

/** Degli allegati si conservano solo nome, tipo e dimensione: i contenuti non vengono salvati. */
export interface AttachmentMeta { name: string; mime: string; size: number }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; createdAt: number; sources?: Source[]; error?: boolean; interrupted?: boolean; attachments?: AttachmentMeta[]; voice?: boolean }
export interface Conversation { id: string; title: string; createdAt: number; updatedAt: number; messages: Message[] }
export interface State {
  conversations: Conversation[];
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
  conversations: [], activeId: null, mode: 'fast',
  preferences: { responseStyle: 'natural', tone: 'neutral', responseLanguage: 'auto' },
  generating: false, phase: ''
};

function load(): State {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.conversations)) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...parsed, generating: false, phase: '' };
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
  setState((current) => ({ ...current, conversations: current.conversations.filter((item) => item.id !== id), activeId: current.activeId === id ? null : current.activeId }));
}

export function clearAll() {
  setState((current) => ({ ...DEFAULT_STATE, preferences: current.preferences, mode: current.mode }));
}
