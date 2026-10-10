import type { Metadata } from "./lib/site-metadata";
import { NexusOperationalState } from "./components/NexusOperationalState";
import { HardNavigationLink } from "./components/HardNavigationLink";

export const metadata: Metadata = {
  title: "Pagina non trovata — NexusNXS",
  description: "La pagina richiesta non appartiene al percorso pubblico NexusNXS oppure è stata spostata.",
  alternates: { canonical: "/404" },
};

export default function NotFound() {
  return (
    <main className="nexus-operational-page" id="main-content">
      <NexusOperationalState
        state="not-found"
        eyebrow="NEXUSNXS · 404"
        title="Questo contesto"
        emphasis="non è qui."
        description="La pagina non appartiene al percorso pubblico NexusNXS oppure è stata spostata."
      >
        <HardNavigationLink className="nexus-operational__primary" href="/">Torna a NexusNXS</HardNavigationLink>
        <HardNavigationLink className="nexus-operational__secondary" href="/status">Controlla lo stato</HardNavigationLink>
      </NexusOperationalState>
    </main>
  );
}
