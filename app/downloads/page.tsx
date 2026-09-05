import type { Metadata } from "next";
import { BadgeCheck, CalendarDays, Copy, Download, FileCheck2, HardDrive, Laptop, ShieldAlert, Smartphone } from "lucide-react";
import Image from "next/image";
import { SiteFooter } from "../components/SiteChrome";
import { VisualizerCollection } from "../components/InteractiveVisualizer";

export const metadata: Metadata = {
  title: "Download NexusNXS — Release e verifiche",
  description: "Stato delle release NexusNXS per PC e Android, requisiti, firma e procedura di verifica.",
  alternates: { canonical: "/downloads" },
  openGraph: { title: "Download NexusNXS", description: "Release NexusNXS e controlli di integrità.", images: [] },
  twitter: { title: "Download NexusNXS", description: "Release NexusNXS e controlli di integrità.", images: [] },
};

const releases = [
  {
    Icon: Laptop,
    name: "NexusNXS per PC",
    version: "0.3.14",
    platform: "Windows 11 · x64",
    size: "102,52 MiB · 107.497.836 byte",
    date: "5 settembre 2026",
    state: "PREVIEW · NON FIRMATA",
    text: "Assistente AI connesso per Windows con voce e strumenti locali.",
    requirements: "Windows 11 x64, connessione Internet e 4 GB di spazio libero consigliati.",
    warning: "Authenticode non presente. Microsoft Defender SmartScreen può mostrare ‘Autore sconosciuto’: verifica SHA-256 e non disattivare le protezioni.",
    action: "Scarica per Windows",
    sha256: "85B606CD390D7CB243986DD58427E05616B15C9630DC27400443BF129BA29C85",
    url: "https://github.com/lapob/nexus-ai/releases/download/v0.3.14-preview.1/NexusNXS-0.3.14-Setup.exe",
  },
  {
    Icon: Smartphone,
    name: "NexusNXS per Android",
    version: "6.4.9",
    platform: "Android 10+",
    size: "1,33 MiB · 1.390.768 byte",
    date: "5 settembre 2026",
    state: "PREVIEW · FIRMA DEBUG",
    text: "Esperienza mobile nativa per conversazioni e continuità.",
    requirements: "Android 10 o successivo, installazione APK consentita e connessione ai servizi NexusNXS.",
    warning: "Firma APK v2 valida con certificato Android Debug; non è una firma Play Store.",
    action: "Scarica per Android",
    sha256: "4A6A2EA6D66DDB51C9EAC9E7FE15F67A17EED0CCE1E9CD14AF66EBA764F48BF0",
    url: "https://github.com/lapob/nexus-ai/releases/download/v0.3.14-preview.1/NexusNXS-Android-6.4.9.apk",
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
    <section className="download-visualizers"><div><p className="section-label">/ UN SOLO CONTINUUM</p><h2>Ogni Core.<br /><em>La stessa presenza.</em></h2></div><VisualizerCollection mode="all" compact /></section>
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
      <div className="hash-preview"><Copy size={16} /><code>Get-FileHash .\NexusNXS-0.3.14-Setup.exe -Algorithm SHA256</code></div>
      <p><BadgeCheck /> Versioni, avvisi e impronte sono pubblicati insieme ai file.</p>
    </section>
    <section className="release-notes"><div><CalendarDays /><p className="section-label">CRONOLOGIA RELEASE</p><h2>Versioni documentate,<br /><em>senza sorprese.</em></h2></div><p>La prima Preview pubblica rende disponibili i client PC e Android con impronte verificabili. Firma di produzione, aggiornamenti automatici e distribuzione tramite store restano passaggi successivi esplicitamente separati.</p></section>
    <SiteFooter ctaHref="/#apps" ctaLabel="Scopri le applicazioni" />
  </main>;
}
