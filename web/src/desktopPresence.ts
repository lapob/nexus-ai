/**
 * @module web/desktopPresence
 * @description Integrazioni Jarvis del desktop: stato condiviso con la Presence di sistema, parola di attivazione che apre la voce live e avvisi proattivi del PC.
 */
import { useEffect, useRef } from 'react';
import type { CoreState } from './Core';
import { desktopBridge } from './platform';

const WAKE_WORD_KEY = 'nxs.wakeword';
const WAKE_WORD_EVENT = 'nxs-wakeword-change';

/** Parola di attivazione: spenta finché non la attivi (il microfono resta tuo). */
export function wakeWordEnabled(): boolean {
  try { return localStorage.getItem(WAKE_WORD_KEY) === 'on'; } catch { return false; }
}

export function setWakeWordEnabled(enabled: boolean) {
  try { localStorage.setItem(WAKE_WORD_KEY, enabled ? 'on' : 'off'); } catch { /* archiviazione non disponibile */ }
  window.dispatchEvent(new Event(WAKE_WORD_EVENT));
}

const PROACTIVE_LABELS: Record<string, (metadata: Record<string, string>) => string> = {
  'system.resume': () => 'Sistema di nuovo disponibile',
  'system.suspend': () => 'Sistema in sospensione',
  'power.source': (metadata) => metadata.source === 'battery' ? 'Alimentazione a batteria' : 'Alimentazione collegata',
  'network.status': (metadata) => metadata.state === 'online' ? 'Connessione ripristinata' : 'Connessione non disponibile',
  'security.alert': () => 'Controllo di sicurezza richiesto',
  'update.available': () => 'Aggiornamento disponibile',
  'device.health': () => 'Stato del dispositivo aggiornato'
};

/**
 * Collega la UI al desktop. Non fa nulla sul web. `live` e `onWake` arrivano
 * dal ciclo voce: la parola di attivazione è sospesa mentre l'entità ascolta o parla.
 */
export function useDesktopPresence({ state, live, onWake, notify }: { state: CoreState; live: boolean; onWake: () => void; notify: (text: string) => void }) {
  const wake = useRef(onWake); wake.current = onWake;
  const say = useRef(notify); say.current = notify;
  const liveRef = useRef(live); liveRef.current = live;

  useEffect(() => {
    if (!desktopBridge?.syncPresence) return;
    const sync = () => void Promise.resolve(desktopBridge!.syncPresence({
      state, appearance: 'neural', motion: 'system', quality: 'auto',
      wakeWordEnabled: wakeWordEnabled(), wakeWordConfidence: 0.84, wakeWordCooldownMs: 5000,
      wakeWordSuspended: live || state === 'listening' || state === 'speaking'
    })).catch(() => {});
    sync();
    window.addEventListener(WAKE_WORD_EVENT, sync);
    return () => window.removeEventListener(WAKE_WORD_EVENT, sync);
  }, [state, live]);

  useEffect(() => {
    if (!desktopBridge) return;
    const offWake = desktopBridge.onWakeWordActivation?.(() => { if (!liveRef.current && wakeWordEnabled()) wake.current(); }) as (() => void) | undefined;
    const offProactive = desktopBridge.onProactiveEvent?.((event: { type: string; metadata?: Record<string, string> }) => {
      const metadata = event?.metadata ?? {};
      say.current(typeof metadata.summary === 'string' ? metadata.summary : PROACTIVE_LABELS[event?.type]?.(metadata) ?? 'Stato del PC aggiornato');
    }) as (() => void) | undefined;
    return () => { offWake?.(); offProactive?.(); };
  }, []);
}
