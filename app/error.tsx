"use client";

import { useEffect } from "react";
import { HardNavigationLink } from "./components/HardNavigationLink";
import { NexusOperationalState } from "./components/NexusOperationalState";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="nexus-operational-page" id="main-content">
      <NexusOperationalState
        state="error"
        eyebrow="NEXUSNXS · ATTENZIONE"
        title="Controlliamo"
        emphasis="insieme."
        description="La pagina ha incontrato un problema temporaneo. Puoi riprovare senza cambiare percorso."
        urgent
      >
        <button className="nexus-operational__primary" type="button" onClick={reset}>Riprova</button>
        <HardNavigationLink className="nexus-operational__secondary" href="/status">Stato dei servizi</HardNavigationLink>
      </NexusOperationalState>
    </main>
  );
}
