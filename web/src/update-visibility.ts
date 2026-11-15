/**
 * @module web/update-visibility
 * @description Quando mostrare la scheda o il toast di aggiornamento del desktop. Modulo puro, senza
 * dipendenze, verificato anche dai test Node.
 */

export interface UpdateState {
  status: string; phase?: string; version?: string; currentVersion?: string; releaseNotes?: string;
  progress?: number; transferred?: number; total?: number; bytesPerSecond?: number;
  /** Trovato dal controllo in background: scaricato e verificato in silenzio, annunciato solo quando è pronto. */
  automatic?: boolean;
}

const UPDATE_VISIBLE = new Set(['available', 'downloading', 'ready', 'installing']);

/**
 * Gli aggiornamenti in background restano invisibili finché non sono pronti (poi un piccolo toast
 * "Aggiornamento pronto"); i loro errori non disturbano e si riprovano da soli. Un errore resta visibile
 * solo se interrompe un download o un riavvio chiesti dall'utente. "Più tardi" nasconde la versione.
 */
export function updateVisible(state: UpdateState | null, dismissed = ''): boolean {
  if (!state) return false;
  const status = state.status;
  if (state.automatic && (status === 'available' || status === 'downloading')) return false;
  const failedAction = status === 'error' && (state.phase === 'download' || state.phase === 'install') && Boolean(state.version);
  const inFlight = status === 'downloading' || status === 'installing';
  return (UPDATE_VISIBLE.has(status) || failedAction) && (inFlight || state.version !== dismissed);
}

/** Variante compatta: aggiornamento arrivato in background e pronto da installare. */
export function updateIsToast(state: UpdateState | null): boolean {
  return Boolean(state?.automatic) && state?.status === 'ready';
}
