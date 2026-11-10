/**
 * @module web/src/steps
 * @description Passaggi visibili del ragionamento: unisce le fasi che si ripetono o si estendono.
 */

const clean = (text: string) => text.replace(/[….\s]+$/u, '').toLocaleLowerCase('it');

/** "Comprendo la richiesta…" seguito da "Comprendo la richiesta e preparo…" diventa un solo passaggio. */
export function mergeStep(steps: string[] = [], label: string): string[] {
  const text = String(label || '').trim();
  if (!text) return steps;
  const last = steps.at(-1);
  if (last && clean(text).startsWith(clean(last))) return [...steps.slice(0, -1), text];
  if (steps.some((step) => clean(step) === clean(text) || clean(step).startsWith(clean(text)))) return steps;
  return [...steps, text].slice(-12);
}
