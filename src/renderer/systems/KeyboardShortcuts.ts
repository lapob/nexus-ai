/**
 * @module renderer/systems/KeyboardShortcuts
 * @description Scorciatoie dichiarative condivise da impostazioni, suggerimenti e controller.
 */

// #region 01 — Confronto e presentazione
export function shortcutMatches(event: KeyboardEvent, shortcut: string): boolean {
  const parts = shortcut.toLowerCase().split('+').map((part) => part.trim());
  const key = parts.at(-1) || '';
  const expectedCtrl = parts.includes('ctrl');
  const expectedShift = parts.includes('shift');
  const expectedAlt = parts.includes('alt');
  if (Boolean(event.ctrlKey || event.metaKey) !== expectedCtrl) return false;
  if (event.shiftKey !== expectedShift || event.altKey !== expectedAlt) return false;
  if (key === 'space') return event.code === 'Space' || event.key === ' ';
  return event.key.toLowerCase() === key;
}

export function shortcutLabel(shortcut: string): string {
  return shortcut.replace('Ctrl', 'Ctrl ').replaceAll('+', ' + ').replace('Shift', '⇧').trim();
}

// #endregion
