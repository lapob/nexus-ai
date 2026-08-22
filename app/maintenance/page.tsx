import type { Metadata } from "next";
import { HardNavigationLink } from "../components/HardNavigationLink";
import { NexusOperationalState } from "../components/NexusOperationalState";

export const metadata: Metadata = {
  title: "NexusNXS — Manutenzione in corso",
  description: "NexusNXS sta completando un aggiornamento programmato.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/maintenance" },
  openGraph: { title: "NexusNXS — Manutenzione in corso", description: "Aggiornamento programmato NexusNXS.", images: [] },
  twitter: { title: "NexusNXS — Manutenzione in corso", description: "Aggiornamento programmato NexusNXS.", images: [] },
};

export default function Maintenance() {
  return (
    <main className="nexus-operational-page" id="main-content">
      <NexusOperationalState
        state="maintenance"
        eyebrow="NEXUSNXS · WORK IN CORSO"
        title="Sto lavorando"
        emphasis="all’aggiornamento."
        description="Manutenzione programmata in corso. Il sito tornerà disponibile automaticamente al termine della verifica."
      >
        <HardNavigationLink className="nexus-operational__primary" href="/">Riprova ora</HardNavigationLink>
        <HardNavigationLink className="nexus-operational__secondary" href="/status">Stato dei servizi</HardNavigationLink>
      </NexusOperationalState>
    </main>
  );
}
