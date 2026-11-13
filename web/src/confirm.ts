/**
 * @module web/confirm
 * @description Conferme integrate al posto di window.confirm e dei dialoghi di sistema: una coda di richieste
 * che l'host (ConfirmDialog, caricato solo quando serve) mostra una alla volta. Leggero: resta nel bundle iniziale.
 */

export type ConfirmTone = 'default' | 'danger' | 'warning';

export interface ConfirmRequest {
  title: string;
  message?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export interface PendingConfirm extends ConfirmRequest { id: number; resolve: (approved: boolean) => void }

let queue: PendingConfirm[] = [];
let next = 1;
const listeners = new Set<() => void>();
const emit = () => { for (const listener of listeners) listener(); };

/** Chiede conferma con il dialogo integrato. Risolve `false` se annullata, chiusa o sostituita da una chiusura dell'app. */
export function confirmDialog(request: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...request, id: next++, resolve }];
    emit();
  });
}

/** Richiesta visibile ora (la prima in coda), oppure null. */
export function currentConfirm(): PendingConfirm | null { return queue[0] ?? null; }

/** Chiude la richiesta `id` con l'esito dato; le successive avanzano. Una seconda risposta è ignorata. */
export function settleConfirm(id: number, approved: boolean) {
  const item = queue.find((entry) => entry.id === id);
  if (!item) return;
  queue = queue.filter((entry) => entry.id !== id);
  item.resolve(approved);
  emit();
}

export function subscribeConfirm(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
