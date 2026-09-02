/**
 * @module renderer/components/ApplicationBoundary
 * @description Fallback pubblico che evita una schermata vuota in caso di errore React inatteso.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import nexusMark from '../assets/nexus-mark-ui.png';

interface ApplicationBoundaryState {
  failed: boolean;
}

export class ApplicationBoundary extends Component<{ children: ReactNode }, ApplicationBoundaryState> {
  state: ApplicationBoundaryState = { failed: false };

  static getDerivedStateFromError(): ApplicationBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Report locale minimale: niente contenuti di chat, stack completo o invio
    // remoto. Il codice consente di distinguere i crash ricorrenti dopo il riavvio.
    try {
      const signature = `${error.name}:${info.componentStack?.split('\n').find(Boolean)?.trim() || 'renderer'}`;
      let hash = 2166136261;
      for (const character of signature) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
      window.localStorage.setItem('nexus.last-ui-crash.v1', JSON.stringify({
        code: `UI-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`,
        occurredAt: new Date().toISOString()
      }));
    } catch { /* Il recupero dell'interfaccia non dipende dallo storage. */ }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="application-fallback" role="alert">
        <img src={nexusMark} alt="" />
        <span>NEXUSNXS</span>
        <strong>È necessario riavviare l’interfaccia</strong>
        <p>I dati locali non sono stati modificati.</p>
        <button type="button" onClick={() => window.location.reload()}>Riavvia NEXUSNXS</button>
      </main>
    );
  }
}
