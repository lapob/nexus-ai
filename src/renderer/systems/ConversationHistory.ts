/**
 * @module renderer/systems/ConversationHistory
 * @description Cronologia conversazioni locale, limitata e resiliente.
 */

// #region 01 — Contratti e normalizzazione

export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  artifacts?: import('../types/nexus').OperationalArtifact[];
}

function normalizeArtifacts(value: unknown): import('../types/nexus').OperationalArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).filter((item) => item && typeof item === 'object').map((item: any) => ({
    id: String(item.id || crypto.randomUUID()).slice(0, 160),
    kind: ['file-change', 'command', 'file', 'result'].includes(item.kind) ? item.kind : 'result',
    title: String(item.title || 'Dettaglio').slice(0, 260),
    subtitle: String(item.subtitle || '').slice(0, 160),
    language: String(item.language || 'text').slice(0, 40),
    content: String(item.content || '').slice(0, 48_000),
    previousContent: String(item.previousContent || '').slice(0, 48_000),
    diff: String(item.diff || '').slice(0, 48_000),
    added: Math.max(0, Number(item.added) || 0),
    removed: Math.max(0, Number(item.removed) || 0),
    truncated: item.truncated === true
    , events: Array.isArray(item.events) ? item.events.slice(0, 12).map((event: any) => ({ label: String(event?.label || '').slice(0, 160), status: event?.status === 'warning' ? 'warning' : 'complete' })) : []
    , diagnostics: Array.isArray(item.diagnostics) ? item.diagnostics.slice(0, 12).map((entry: any) => ({ file: String(entry?.file || '').slice(0, 300), line: Math.max(0, Number(entry?.line) || 0), column: Math.max(0, Number(entry?.column) || 0), message: String(entry?.message || '').slice(0, 300) })) : []
  }));
}

export interface ConversationRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  turns: ConversationTurn[];
  incomplete?: boolean;
  workspace?: { path: string; name: string };
}

const STORAGE_NAMESPACE = 'nexus.conversations.v1';
const MAX_CONVERSATIONS = 40;
const MAX_TURNS = 24;
const STORAGE_CHARACTER_BUDGET = 4_500_000;

function appearsTruncated(turns: ConversationTurn[]): boolean {
  const lastAnswer = [...turns].reverse().find((turn) => turn.role === 'assistant')?.content || '';
  const fences = lastAnswer.match(/^```/gm)?.length || 0;
  return fences % 2 !== 0;
}

// #endregion

// #region 02 — Persistenza locale

export function loadConversationHistory(): ConversationRecord[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_NAMESPACE) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((record) => record && typeof record.id === 'string' && Array.isArray(record.turns))
      .map((record) => {
        const turns = record.turns
          .filter((turn: ConversationTurn) => turn && ['user', 'assistant'].includes(turn.role) && turn.content)
          .slice(-MAX_TURNS)
          .map((turn: ConversationTurn) => ({
            role: turn.role,
            content: String(turn.content).slice(0, 30_000),
            createdAt: Number(turn.createdAt) || Date.now(),
            ...(normalizeArtifacts(turn.artifacts).length ? { artifacts: normalizeArtifacts(turn.artifacts) } : {})
          }));
        return {
          id: String(record.id),
          title: String(record.title || 'Conversazione').slice(0, 90),
          createdAt: Number(record.createdAt) || Date.now(),
          updatedAt: Number(record.updatedAt) || Date.now(),
          incomplete: record.incomplete === true || appearsTruncated(turns),
          ...(record.workspace?.path ? { workspace: { path: String(record.workspace.path), name: String(record.workspace.name || '') } } : {}),
          turns
        };
      })
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, MAX_CONVERSATIONS);
  } catch {
    return [];
  }
}

export async function hydrateConversationHistory(): Promise<ConversationRecord[]> {
  const legacy = loadConversationHistory();
  try {
    const persisted = await window.nexus.listConversationHistory();
    if (persisted.length) return persisted;
    if (legacy.length) return await window.nexus.importConversationHistory(legacy);
  } catch { /* Il cache legacy mantiene utilizzabile la cronologia. */ }
  return legacy;
}

export function fitConversationBudget(
  records: ConversationRecord[],
  budget = STORAGE_CHARACTER_BUDGET
): ConversationRecord[] {
  const retained: ConversationRecord[] = [];
  let used = 2;
  for (const record of records.slice(0, MAX_CONVERSATIONS)) {
    const encoded = JSON.stringify(record);
    if (used + encoded.length <= budget) {
      retained.push(record);
      used += encoded.length + 1;
      continue;
    }
    if (retained.length === 0) {
      retained.push({
        ...record,
        turns: record.turns.slice(-6).map((turn) => ({
          ...turn,
          content: turn.content.slice(0, 12_000)
        }))
      });
    }
    break;
  }
  return retained;
}

export function saveConversation(record: ConversationRecord): ConversationRecord[] {
  const current = loadConversationHistory().filter((item) => item.id !== record.id);
  const firstQuestion = record.turns.find((turn) => turn.role === 'user')?.content || 'Conversazione';
  const normalized: ConversationRecord = {
    ...record,
    title: firstQuestion.replace(/\s+/g, ' ').trim().slice(0, 72) || 'Conversazione',
    incomplete: record.incomplete === true,
    turns: record.turns.slice(-MAX_TURNS)
  };
  const next = fitConversationBudget([normalized, ...current]);
  try { window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(next)); } catch {}
  void window.nexus.saveConversationHistory(normalized).catch(() => {});
  return next;
}

export function removeConversation(id: string): ConversationRecord[] {
  const next = fitConversationBudget(loadConversationHistory().filter((record) => record.id !== id));
  try { window.localStorage.setItem(STORAGE_NAMESPACE, JSON.stringify(next)); } catch {}
  void window.nexus.removeConversationHistory(id).catch(() => {});
  return next;
}

// #endregion
