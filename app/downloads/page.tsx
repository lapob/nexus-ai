import type { Metadata } from "next";
import release from "../data/public-release.json";
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

const releaseDate = new Date(release.date + "T12:00:00Z").toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const sizeLabel = (bytes: number) => `${(bytes / 1048576).toLocaleString("it-IT", { maximumFractionDigits: 2 })} MiB · ${bytes.toLocaleString("it-IT")} byte`;
const releases = [
  {
    Icon: Laptop,
    name: "NexusNXS per PC",
    version: release.windows.version,
    platform: "Windows 11 · x64",
    size: sizeLabel(release.windows.bytes),
    date: releaseDate,
    state: "PREVIEW · NON FIRMATA",
    text: "Assistente AI connesso per Windows con voce e strumenti locali.",
    requirements: "Windows 11 x64, connessione Internet e 4 GB di spazio libero consigliati.",
    warning: "Authenticode non presente. Microsoft Defender SmartScreen può mostrare ‘Autore sconosciuto’: verifica SHA-256 e non disattivare le protezioni.",
    action: "Scarica per Windows",
    sha256: release.windows.sha256,
    url: release.windows.url,
  },
  {
    Icon: Smartphone,
    name: "NexusNXS per Android",
    version: release.android.version,
    platform: "Android 8+",
    size: sizeLabel(release.android.bytes),
    date: releaseDate,
    state: "PREVIEW · FIRMA DEBUG",
    text: "Esperienza mobile nativa per conversazioni e continuità.",
    requirements: "Android 8 o successivo, installazione APK consentita e connessione ai servizi NexusNXS.",
    warning: "Firma APK v2 valida con certificato Android Debug; non è una firma Play Store.",
    action: "Scarica per Android",
    sha256: release.android.sha256,
    url: release.android.url,
  },
];

export default function Downloads() {
  return <main className="inner-page" id="main-content">
    <section className="download-hero">
      <div className="download-brand"><Image src="/nexus-icon.png" alt="Logo NexusNXS" width={92} height={92} priority unoptimized /><span>NEXUSNXS</span></div>
      <p className="eyebrow"><Download size={14} /> DOWNLOAD CENTER</p>
      <h1>Software autentico.<br /><em>Origine verificabile.</em></h1>
      <p>Ogni file pubblico espone versione, dimensione, stato della firma e impronta crittografica. Queste build sono anteprime autorizzate e non vengono presentate come release firmate.</p>
      <div className="release-policy"><ShieldAlert size={18} /><span><strong>Preview non firmate</strong> — verifica sempre l’impronta SHA-256 prima dell’installazione. Le firme di produzione arriveranno in una release successiva.</span></div>
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
        <p className="release-hash"><span>SHA-256</span><code>{release.sha256}</code></p>
        <div className="release-actions">
          <a className="release-download" href={release.url} rel="noreferrer" aria-describedby={`${release.version}-reason`}>{release.action} <Download size={15} /></a>
          <small id={`${release.version}-reason`}>{release.warning}</small>
        </div>
      </article>)}
    </section>
    <section className="verify-guide">
      <div><FileCheck2 /><h2>Come verificare una release</h2></div>
      <ol><li><span>01</span>Avvia il download da <strong>nexusnxs.com</strong>; il file è ospitato nella release GitHub ufficiale.</li><li><span>02</span>Leggi lo stato della firma e gli avvisi della piattaforma.</li><li><span>03</span>Confronta l’impronta SHA-256 completa prima di eseguire il file.</li></ol>
      <div className="hash-preview"><Copy size={16} /><code>{`Get-FileHash .\\NexusNXS-${release.windows.version}-Setup.exe -Algorithm SHA256`}</code></div>
      <p><BadgeCheck /> Versioni, avvisi e impronte sono pubblicati insieme ai file.</p>
    </section>
    <section className="release-notes"><div><CalendarDays /><p className="section-label">CRONOLOGIA RELEASE</p><h2>Versioni documentate,<br /><em>senza sorprese.</em></h2></div><p>La prima Preview pubblica rende disponibili i client PC e Android con impronte verificabili. Firma di produzione, aggiornamenti automatici e distribuzione tramite store restano passaggi successivi esplicitamente separati.</p></section>
    <SiteFooter ctaHref="/#apps" ctaLabel="Scopri le applicazioni" />
  </main>;
}
