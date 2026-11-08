/**
 * @module web/Markdown
 * @description Markdown sicuro per lo streaming (web e desktop): solo elementi React (niente innerHTML), link solo https, codice copiabile, tabelle, callout, formule, liste numerate e checklist.
 */
import { memo, useState, type ReactNode } from 'react';

// #region 01 — Blocchi

type Callout = 'note' | 'tip' | 'warning' | 'result';
type Block =
  | { kind: 'code'; language: string; text: string; open: boolean }
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'list'; ordered: boolean; start: number; items: Array<{ text: string; checked: boolean | null }> }
  | { kind: 'quote'; text: string }
  | { kind: 'callout'; tone: Callout; lines: string[] }
  | { kind: 'table'; header: string[]; align: Array<'left' | 'center' | 'right'>; rows: string[][] }
  | { kind: 'formula'; text: string }
  | { kind: 'rule' }
  | { kind: 'paragraph'; text: string };

const CALLOUTS: Record<string, Callout> = { NOTE: 'note', TIP: 'tip', WARNING: 'warning', CAUTION: 'warning', IMPORTANT: 'warning', RESULT: 'result' };
const CALLOUT_LABEL: Record<Callout, string> = { note: 'Nota', tip: 'Suggerimento', warning: 'Attenzione', result: 'Risultato' };

const cells = (line: string) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
const isTableSeparator = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

/** Parser a righe tollerante: un fence o una formula non ancora chiusi durante lo streaming restano tali. */
export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => { if (paragraph.length) { blocks.push({ kind: 'paragraph', text: paragraph.join('\n') }); paragraph = []; } };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = /^\s*```\s*([\w+-]*)\s*$/.exec(line);
    if (fence) {
      flush();
      const code: string[] = [];
      let open = true;
      for (index += 1; index < lines.length; index += 1) {
        if (/^\s*```\s*$/.test(lines[index])) { open = false; break; }
        code.push(lines[index]);
      }
      blocks.push({ kind: 'code', language: fence[1] || 'text', text: code.join('\n'), open });
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      flush();
      const single = /^\s*\$\$(.+)\$\$\s*$/.exec(line);
      if (single) { blocks.push({ kind: 'formula', text: single[1].trim() }); continue; }
      const formula: string[] = [line.replace(/^\s*\$\$/, '')];
      for (index += 1; index < lines.length; index += 1) {
        if (/\$\$\s*$/.test(lines[index])) { formula.push(lines[index].replace(/\$\$\s*$/, '')); break; }
        formula.push(lines[index]);
      }
      blocks.push({ kind: 'formula', text: formula.join('\n').trim() });
      continue;
    }
    if (line.includes('|') && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      flush();
      const header = cells(line);
      const align = cells(lines[index + 1]).map((cell) => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') as Array<'left' | 'center' | 'right'>;
      const rows: string[][] = [];
      for (index += 2; index < lines.length && lines[index].includes('|') && lines[index].trim(); index += 1) rows.push(cells(lines[index]));
      index -= 1;
      blocks.push({ kind: 'table', header, align, rows });
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) { flush(); blocks.push({ kind: 'heading', level: Math.min(4, Math.max(2, heading[1].length + 1)) as 2 | 3 | 4, text: heading[2] }); continue; }
    if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) { flush(); blocks.push({ kind: 'rule' }); continue; }
    const item = /^\s*(?:([-*+])|(\d+)[.)])\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const ordered = Boolean(item[2]);
      const task = /^\[( |x|X)\]\s+(.*)$/.exec(item[3]);
      const entry = { text: task ? task[2] : item[3], checked: task ? task[1].toLowerCase() === 'x' : null };
      const last = blocks.at(-1);
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(entry);
      else blocks.push({ kind: 'list', ordered, start: ordered ? Number.parseInt(item[2], 10) || 1 : 1, items: [entry] });
      continue;
    }
    if (/^>\s?/.test(line)) {
      flush();
      const text = line.replace(/^>\s?/, '');
      const callout = /^\[!(\w+)\]\s*(.*)$/.exec(text);
      const last = blocks.at(-1);
      if (callout && CALLOUTS[callout[1].toUpperCase()]) blocks.push({ kind: 'callout', tone: CALLOUTS[callout[1].toUpperCase()], lines: callout[2] ? [callout[2]] : [] });
      else if (last?.kind === 'callout') last.lines.push(text);
      else blocks.push({ kind: 'quote', text });
      continue;
    }
    if (!line.trim()) { flush(); continue; }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

// #endregion

// #region 02 — Inline

function safeHref(value: string): string | null {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

const SUPERSCRIPTS: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', n: 'ⁿ' };
/** Formula leggibile senza motore TeX: potenze semplici, operatori e radice resi in Unicode. */
export function readableMath(source: string): string {
  return source
    .replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\\div/g, '÷').replace(/\\pm/g, '±')
    .replace(/\\leq?/g, '≤').replace(/\\geq?/g, '≥').replace(/\\neq/g, '≠').replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞').replace(/\\pi/g, 'π').replace(/\\sum/g, '∑').replace(/\\int/g, '∫')
    .replace(/\\sqrt\{([^}]+)\}/g, '√($1)').replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\^\{([^}]+)\}|\^(\w)/g, (_, group: string | undefined, single: string | undefined) => {
      const value = group ?? single ?? '';
      return [...value].every((char) => SUPERSCRIPTS[char]) ? [...value].map((char) => SUPERSCRIPTS[char]).join('') : `^(${value})`;
    })
    .replace(/[{}]/g, '');
}

/** Inline: `codice`, **grassetto**, *corsivo*, $formula$, [testo](https://…) e URL nudi https. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\n]+\*)|(\$[^$\n]{1,200}\$)|(\[[^\]\n]{1,200}\]\((https:\/\/[^)\s]+)\))|(https:\/\/[^\s<>()\]]+)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${keyPrefix}-${index++}`;
    const [token] = match;
    if (match[1]) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (match[2]) nodes.push(<strong key={key}>{renderInline(token.slice(2, -2), key)}</strong>);
    else if (match[3]) nodes.push(<em key={key}>{renderInline(token.slice(1, -1), key)}</em>);
    else if (match[4]) nodes.push(<span key={key} className="math-inline" role="math" aria-label={token.slice(1, -1)}>{readableMath(token.slice(1, -1))}</span>);
    else if (match[5]) {
      const label = token.slice(1, token.indexOf(']('));
      const href = safeHref(match[6]);
      nodes.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label);
    } else if (match[7]) {
      const href = safeHref(token.replace(/[.,;:!?]+$/, ''));
      nodes.push(href ? <a key={key} href={href} target="_blank" rel="noopener noreferrer">{new URL(href).hostname}</a> : token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// #endregion

// #region 03 — Rendering

function CodeBlock({ language, text, open }: { language: string; text: string; open: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="code">
      <figcaption>
        <span>{language}</span>
        <button type="button" disabled={open} aria-label={copied ? 'Copiato' : 'Copia codice'} onClick={async () => {
          try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 1400); } catch { /* clipboard negata */ }
        }}>{copied ? 'Copiato' : 'Copia'}</button>
      </figcaption>
      <pre><code>{text}</code></pre>
    </figure>
  );
}

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {parseBlocks(text).map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case 'code': return <CodeBlock key={key} {...block} />;
          case 'heading': { const Tag = `h${block.level}` as const; return <Tag key={key}>{renderInline(block.text, key)}</Tag>; }
          case 'list': {
            const items = block.items.map((item, itemIndex) => (
              <li key={`${key}-${itemIndex}`} className={item.checked === null ? undefined : 'task'}>
                {item.checked !== null && <input type="checkbox" checked={item.checked} readOnly aria-label={item.checked ? 'Completato' : 'Da fare'} />}
                {renderInline(item.text, `${key}-${itemIndex}`)}
              </li>
            ));
            return block.ordered ? <ol key={key} start={block.start}>{items}</ol> : <ul key={key}>{items}</ul>;
          }
          case 'quote': return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>;
          case 'callout': return (
            <aside key={key} className={`callout ${block.tone}`} role="note">
              <strong>{CALLOUT_LABEL[block.tone]}</strong>
              {block.lines.map((line, lineIndex) => <p key={`${key}-${lineIndex}`}>{renderInline(line, `${key}-${lineIndex}`)}</p>)}
            </aside>
          );
          case 'table': return (
            <div key={key} className="table-wrap" role="region" aria-label="Tabella" tabIndex={0}>
              <table>
                <thead><tr>{block.header.map((cell, cellIndex) => <th key={cellIndex} style={{ textAlign: block.align[cellIndex] }}>{renderInline(cell, `${key}-h${cellIndex}`)}</th>)}</tr></thead>
                <tbody>{block.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>{block.header.map((_, cellIndex) => <td key={cellIndex} style={{ textAlign: block.align[cellIndex] }}>{renderInline(row[cellIndex] ?? '', `${key}-${rowIndex}-${cellIndex}`)}</td>)}</tr>
                ))}</tbody>
              </table>
            </div>
          );
          case 'formula': return <div key={key} className="math-block" role="math" aria-label={block.text}>{readableMath(block.text)}</div>;
          case 'rule': return <hr key={key} />;
          default: return <p key={key}>{renderInline(block.text, key)}</p>;
        }
      })}
    </div>
  );
});

// #endregion
