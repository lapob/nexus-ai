import type { Metadata } from "next";
import { BadgeCheck, CalendarDays, Copy, Download, FileCheck2, HardDrive, Laptop, ShieldAlert, Smartphone } from "lucide-react";
import Image from "next/image";
import { SiteFooter } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "Download NexusNXS — Release e verifiche",
  description: "Stato delle release NexusNXS per PC e Android, requisiti, firma e procedura di verifica.",
  alternates: { canonical: "/downloads" },
  openGraph: { title: "Download NexusNXS", description: "Release NexusNXS e controlli di integrità.", images: [] },
  twitter: { title: "Download NexusNXS", description: "Release NexusNXS e controlli di integrità.", images: [] },
};

const releases = [
  { Icon: Laptop, name: "NexusNXS per PC", version: "0.3.5", platform: "Windows 11 · x64", size: "CON LA RELEASE", date: "Release candidate", state: "FIRMA RICHIESTA", text: "Assistente AI connesso per Windows con voce e strumenti locali.", requirements: "Windows 11 x64, connessione Internet e 4 GB di spazio libero." },
  { Icon: Smartphone, name: "NexusNXS per Android", version: "5.24.0", platform: "Android 10+", size: "CON LA RELEASE", date: "Release candidate", state: "VALIDAZIONE IN CORSO", text: "Esperienza mobile nativa per conversazioni e continuità.", requirements: "Android 10 o successivo e connessione ai servizi NexusNXS." },
];

export default function Downloads() {
  return <main className="inner-page" id="main-content">
    <section className="download-hero">
      <div className="download-brand"><Image src="/nexus-icon.png" alt="Logo NexusNXS" width={92} height={92} priority unoptimized /><span>NEXUSNXS</span></div>
      <p className="eyebrow"><Download size={14} /> DOWNLOAD CENTER</p>
      <h1>Software autentico.<br /><em>Origine verificabile.</em></h1>
      <p>Ogni file pubblico dovrà superare firma, controllo dell’integrità e verifica del canale di distribuzione. Nessuna build interna viene presentata come release.</p>
      <div className="release-policy"><ShieldAlert size={18} /><span><strong>Canale pubblico protetto</strong> — i download restano disattivati finché firma e impronta non sono disponibili.</span></div>
    </section>
    <section className="release-list" aria-label="Release NexusNXS">
      {releases.map(({ Icon, ...release }) => <article key={release.name}>
        <div className="release-icon"><Icon aria-hidden="true" /></div>
        <div className="release-title"><span>{release.platform}</span><h2>{release.name}</h2><p>{release.text}</p></div>
        <dl>
          <div><dt>Versione</dt><dd>{release.version}</dd></div>
          <div><dt>Dimensione</dt><dd>{release.size}</dd></div>
          <div><dt>Stato</dt><dd className="release-state">{release.state}</dd></div>
          <div><dt>Build</dt><dd>{release.date}</dd></div>
        </dl>
        <p className="release-requirements"><HardDrive size={15} /> {release.requirements}</p>
        <button disabled aria-describedby={`${release.version}-reason`}>Download non ancora pubblico</button>
        <small id={`${release.version}-reason`}>Firma e SHA-256 saranno pubblicati insieme al file.</small>
      </article>)}
    </section>
    <section className="verify-guide">
      <div><FileCheck2 /><h2>Come verificare una release</h2></div>
      <ol><li><span>01</span>Scarica soltanto da <strong>nexusnxs.com</strong>.</li><li><span>02</span>Controlla editore e firma digitale.</li><li><span>03</span>Confronta l’impronta SHA-256 pubblicata.</li></ol>
      <div className="hash-preview"><Copy size={16} /><code>SHA-256 · PUBBLICATO CON LA RELEASE</code></div>
      <p><BadgeCheck /> Le release pubbliche non utilizzeranno certificati Debug.</p>
    </section>
    <section className="release-notes"><div><CalendarDays /><p className="section-label">CRONOLOGIA RELEASE</p><h2>Versioni documentate,<br /><em>senza sorprese.</em></h2></div><p>Changelog, problemi noti e versioni supportate compariranno qui insieme alla prima release pubblica verificata. Fino ad allora, lo stato resta deliberatamente trasparente.</p></section>
    <SiteFooter />
  </main>;
}
