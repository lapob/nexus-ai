/**
 * @module web/panel
 * @description Stato del pannello laterale (codice e documenti aperti dalle risposte): fuori dalla cronologia, non persistito.
 */
import { useSyncExternalStore } from 'react';

export interface PanelDocument { id: string; language: string; text: string; title: string }
export type PreviewKind = 'markdown' | 'svg' | 'csv' | 'html' | null;

let current: PanelDocument | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

export function openPanel(document: Omit<PanelDocument, 'id' | 'title'> & { title?: string }) {
  current = { id: crypto.randomUUID(), title: document.title || titleFor(document.language, document.text), language: document.language, text: document.text };
  emit();
}
export function closePanel() { if (current) { current = null; emit(); } }
export function usePanel(): PanelDocument | null {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => current);
}

const LANGUAGE_NAMES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript React', js: 'JavaScript', jsx: 'JavaScript React', py: 'Python', python: 'Python', html: 'HTML', css: 'CSS', json: 'JSON',
  md: 'Documento', markdown: 'Documento', svg: 'Immagine SVG', csv: 'Tabella CSV', sql: 'SQL', sh: 'Shell', bash: 'Shell', ps1: 'PowerShell', powershell: 'PowerShell',
  java: 'Java', cs: 'C#', cpp: 'C++', c: 'C', go: 'Go', rs: 'Rust', rust: 'Rust', yaml: 'YAML', yml: 'YAML', xml: 'XML', mermaid: 'Diagramma Mermaid', text: 'Testo'
};

/** Titolo leggibile: il primo titolo Markdown, altrimenti il linguaggio. */
export function titleFor(language: string, text: string): string {
  const heading = /^#{1,3}\s+(.+)$/m.exec(text)?.[1];
  if (heading && previewKind(language, text) === 'markdown') return heading.trim().slice(0, 80);
  return LANGUAGE_NAMES[language.toLowerCase()] || language.toUpperCase() || 'Testo';
}

/** Cosa si può mostrare in anteprima senza eseguire codice: documenti, SVG come immagine, CSV come tabella. */
export function previewKind(language: string, text: string): PreviewKind {
  const lang = language.toLowerCase();
  if (lang === 'md' || lang === 'markdown') return 'markdown';
  if ((lang === 'svg' || lang === 'xml') && /^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'svg';
  if (lang === 'csv' || lang === 'tsv') return 'csv';
  // Pagina HTML completa o frammento con markup: eseguita solo nella sandbox a origine separata (Panel.tsx).
  if ((lang === 'html' || lang === 'htm') && /<(?:!doctype|html|body|div|canvas|svg|script|style|main|section|button)[\s>]/i.test(text)) return 'html';
  return null;
}

const EXTENSIONS: Record<string, string> = { typescript: 'ts', javascript: 'js', python: 'py', markdown: 'md', bash: 'sh', shell: 'sh', powershell: 'ps1', rust: 'rs', text: 'txt', plaintext: 'txt', yml: 'yaml' };
export function fileName(document: PanelDocument): string {
  const lang = document.language.toLowerCase();
  const extension = EXTENSIONS[lang] || (/^[a-z0-9]{1,8}$/.test(lang) ? lang : 'txt');
  const base = document.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'documento';
  return `${base}.${extension}`;
}

/** CSV/TSV semplice (virgolette comprese) per l'anteprima: al massimo 200 righe e 24 colonne. */
export function parseDelimited(text: string, delimiter = text.includes('\t') && !text.includes(',') ? '\t' : ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let index = 0; index < text.length && rows.length < 200; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell) quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim())) rows.push(row.slice(0, 24));
      row = [];
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); if (row.some((value) => value.trim()) && rows.length < 200) rows.push(row.slice(0, 24)); }
  return rows;
}

/** Il pulsante «Apri nel pannello» compare per codice lungo o per ciò che ha un'anteprima. */
export const worthPanel = (language: string, text: string) => previewKind(language, text) !== null || text.split('\n').length >= 12;
