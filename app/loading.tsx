import { NexusOperationalState } from "./components/NexusOperationalState";

export default function Loading() {
  return (
    <main className="nexus-operational-page" id="main-content">
      <NexusOperationalState
        state="loading"
        eyebrow="NEXUSNXS · AVVIO"
        title="Mi sto"
        emphasis="preparando."
        description="La presenza NexusNXS sta caricando il contesto richiesto."
      />
    </main>
  );
}
