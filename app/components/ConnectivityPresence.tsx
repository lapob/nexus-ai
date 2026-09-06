"use client";

import { useEffect, useState } from "react";
import { NexusPresence } from "./NexusOperationalState";

export function ConnectivityPresence() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!offline) return null;

  return (
    <aside className="nexus-connectivity" data-visible="true" aria-live="polite">
      <NexusPresence state="offline" compact />
      <div>
        <strong>Connessione Internet assente</strong>
        <p>Controlla la rete e riprova quando sei online.</p>
      </div>
      <button type="button" onClick={() => location.reload()} aria-label="Riprova la connessione">↻</button>
    </aside>
  );
}
