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
/** File di un progetto: solo testo estratto, conservato su questo dispositivo. */
export interface ProjectFile { id: string; name: string; size: number; text: string }
/** Progetto: cartella di conversazioni con istruzioni e file che diventano contesto di ogni risposta. */
export interface Project { id: string; name: string; instructions: string; files: ProjectFile[]; createdAt: number; updatedAt: number }
export interface State {
  conversations: Conversation[];
  /** Conversazioni fissate in cima (id): restano anche quando la cronologia arriva dal disco o dal PC. */
  pinned: string[];
  projects: Project[];
  /** Conversazione → progetto. Separato dalle conversazioni: sopravvive al ricaricamento dal disco o dal PC. */
  projectOf: Record<string, string>;
  /** Progetto aperto nella barra laterale (filtra la cronologia e accoglie le nuove chat). */
  projectView: string | null;
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
  conversations: [], pinned: [], projects: [], projectOf: {}, projectView: null, activeId: null, mode: 'fast',
  preferences: { responseStyle: 'natural', tone: 'neutral', responseLanguage: 'auto' },
  generating: false, phase: ''
};

function load(): State {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.conversations)) return DEFAULT_STATE;
    const projects = sanitizeProjects(parsed.projects);
    const known = new Set(projects.map((project) => project.id));
    const projectOf = Object.fromEntries(Object.entries(parsed.projectOf && typeof parsed.projectOf === 'object' ? parsed.projectOf : {})
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string' && known.has(entry[1])));
    return { ...DEFAULT_STATE, ...parsed, pinned: Array.isArray(parsed.pinned) ? parsed.pinned.filter((id: unknown) => typeof id === 'string') : [],
      projects, projectOf, projectView: known.has(parsed.projectView) ? parsed.projectView : null, generating: false, phase: '' };
  } catch { return DEFAULT_STATE; }
}

/** Limiti dei progetti: restano nell'archivio locale del browser (≈5 MB condivisi con la cronologia). */
export const PROJECT_LIMITS = { projects: 24, files: 20, fileChars: 200_000, totalChars: 600_000, instructions: 4_000, name: 60 };

function sanitizeProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, PROJECT_LIMITS.projects).flatMap((item) => {
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string') return [];
    const files = Array.isArray(item.files) ? item.files.filter((file: ProjectFile) => file && typeof file.id === 'string' && typeof file.name === 'string' && typeof file.text === 'string').slice(0, PROJECT_LIMITS.files) : [];
    return [{ id: item.id, name: item.name.slice(0, PROJECT_LIMITS.name), instructions: String(item.instructions || '').slice(0, PROJECT_LIMITS.instructions), files,
      createdAt: Number(item.createdAt) || Date.now(), updatedAt: Number(item.updatedAt) || Date.now() }];
  });
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
  // Una chat nuova aperta dentro un progetto ne eredita istruzioni e file.
  setState((current) => ({ ...current, activeId: id, conversations: [{ id, title: 'Nuova conversazione', createdAt: now, updatedAt: now, messages: [] }, ...current.conversations].slice(0, MAX_CONVERSATIONS),
    projectOf: current.projectView ? { ...current.projectOf, [id]: current.projectView } : current.projectOf }));
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
  setState((current) => {
    const { [id]: _removed, ...projectOf } = current.projectOf;
    return { ...current, projectOf, pinned: current.pinned.filter((item) => item !== id), conversations: current.conversations.filter((item) => item.id !== id), activeId: current.activeId === id ? null : current.activeId };
  });
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
    conversations: [{ id: fork, title: `${source.title.slice(0, 66)} · ramo`, createdAt: now, updatedAt: now, messages }, ...current.conversations].slice(0, MAX_CONVERSATIONS),
    projectOf: current.projectOf[id] ? { ...current.projectOf, [fork]: current.projectOf[id] } : current.projectOf }));
  return fork;
}

// #region Progetti

export function createProject(name = 'Nuovo progetto'): string {
  const id = uid();
  const now = Date.now();
  setState((current) => ({ ...current, projectView: id,
    projects: [{ id, name: name.trim().slice(0, PROJECT_LIMITS.name) || 'Nuovo progetto', instructions: '', files: [], createdAt: now, updatedAt: now }, ...current.projects].slice(0, PROJECT_LIMITS.projects) }));
  return id;
}

export function updateProject(id: string, update: (project: Project) => Partial<Project>) {
  setState((current) => ({ ...current, projects: current.projects.map((project) => project.id === id ? { ...project, ...update(project), updatedAt: Date.now() } : project) }));
}

/** Elimina il progetto, non le sue conversazioni: tornano nella cronologia generale. */
export function deleteProject(id: string) {
  setState((current) => ({ ...current, projects: current.projects.filter((project) => project.id !== id),
    projectOf: Object.fromEntries(Object.entries(current.projectOf).filter(([, project]) => project !== id)),
    projectView: current.projectView === id ? null : current.projectView }));
}

export function assignProject(conversationId: string, projectId: string | null) {
  setState((current) => {
    const { [conversationId]: _previous, ...rest } = current.projectOf;
    return { ...current, projectOf: projectId ? { ...rest, [conversationId]: projectId } : rest };
  });
}

export function openProject(projectId: string | null) {
  setState((current) => ({ ...current, projectView: projectId, activeId: projectId && current.activeId && current.projectOf[current.activeId] !== projectId ? null : current.activeId }));
}

export function projectFor(conversationId: string | null | undefined, current = state): Project | null {
  const id = conversationId ? current.projectOf[conversationId] : undefined;
  return id ? current.projects.find((project) => project.id === id) ?? null : null;
}

/**
 * Contesto del progetto per il modello: istruzioni, poi i file, entro un budget di caratteri.
 * I file oltre il budget vengono elencati per nome, così il modello sa che esistono.
 */
export function projectContext(project: Project, budget: number): string {
  const head = `Contesto del progetto «${project.name}». Seguilo in tutta la conversazione.`;
  const instructions = project.instructions.trim() ? `\n\nIstruzioni del progetto:\n${project.instructions.trim()}` : '';
  let body = `${head}${instructions}`.slice(0, budget);
  const omitted: string[] = [];
  for (const file of project.files) {
    const block = `\n\n### File: ${file.name}\n${file.text.trim()}`;
    const room = budget - body.length - 200;
    if (room <= 400) { omitted.push(file.name); continue; }
    body += block.length <= room ? block : `${block.slice(0, room)}\n[…file troncato]`;
  }
  if (omitted.length) body += `\n\nAltri file del progetto non inclusi per spazio: ${omitted.join(', ')}.`;
  return body.slice(0, budget);
}

// #endregion

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
