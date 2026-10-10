"use client";

import { useEffect } from "react";
import { HardNavigationLink } from "./components/HardNavigationLink";
import { NexusOperationalState } from "./components/NexusOperationalState";
import { NexusPresenceRuntime } from "./components/NexusPresenceRuntime";

export default function GlobalError({
  error,
  reset,
  head,
  tail,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  head?: React.ReactNode;
  tail?: React.ReactNode;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="it">
      <head>
        {head}
        <title>NexusNXS — Richiede attenzione</title>
        <meta name="robots" content="noindex, nofollow" />
        {/* Shared with the service-worker offline shell. */}
        <link rel="stylesheet" href="/nexus-operational.css" />
      </head>
      <body className="nexus-operational-body">
        <main className="nexus-operational-page" id="main-content">
          <NexusOperationalState
            state="error"
            eyebrow="NEXUSNXS · ATTENZIONE"
            title="NexusNXS richiede"
            emphasis="attenzione."
            description="L’interfaccia si è interrotta prima di completare il caricamento."
            urgent
          >
            <button className="nexus-operational__primary" type="button" onClick={reset}>Riprova</button>
            <HardNavigationLink className="nexus-operational__secondary" href="/">Torna alla home</HardNavigationLink>
          </NexusOperationalState>
        </main>
        <NexusPresenceRuntime />
        {tail}
      </body>
    </html>
  );
}
