"use client";

import { useEffect } from "react";
import { ArrowUpRight, Blocks, BrainCircuit, Fingerprint, KeyRound, LockKeyhole, MessageCircle, Mic2, Orbit, ShieldCheck, Sparkles, Workflow, Zap } from "lucide-react";
import { ProductMockup, SiteFooter } from "./components/SiteChrome";
import { StructuredData } from "./components/StructuredData";
import { HardNavigationLink } from "./components/HardNavigationLink";

const apps = [
  { index: "01", name: "NexusNXS per PC", platform: "Windows · NexusNXS Core", description: "Il centro intelligente della tua esperienza: AI connessa, voce locale, progetti e azioni approvate sul computer.", accent: "cyan", href: "/desktop", Icon: Workflow },
  { index: "02", name: "NexusNXS per Android", platform: "Android · Continuità cifrata", description: "La stessa presenza NexusNXS in movimento, con sessioni protette, pairing revocabile e continuità reale.", accent: "teal", href: "/android", Icon: KeyRound },
];

const presenceStates = [
  { Icon: Mic2, label: "Ascolto", detail: "Input vocale attivo", state: "listening" },
  { Icon: BrainCircuit, label: "Pensiero", detail: "Elaborazione visibile", state: "thinking" },
  { Icon: MessageCircle, label: "Risposta", detail: "Output leggibile", state: "responding" },
  { Icon: Zap, label: "Azione", detail: "Consenso richiesto", state: "executing" },
];

export default function Home() {
  useEffect(() => {
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")), { threshold: 0.16 });
    document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
    return () => reveal.disconnect();
  }, []);
  return (
    <main id="main-content">
      <StructuredData data={[{"@context":"https://schema.org","@type":"WebSite",name:"NexusNXS",url:"https://nexusnxs.com",inLanguage:"it-IT"},{"@context":"https://schema.org","@type":"Organization",name:"NexusNXS",url:"https://nexusnxs.com",logo:"https://nexusnxs.com/nexus-icon.png",email:"hello@nexusnxs.com"}]} />
      <section className="hero" id="top">
        <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
        <p className="eyebrow"><Sparkles size={13} strokeWidth={1.5} /> NEXUSNXS · AI PRIVATA, PROTETTA, CONNESSA</p>
        <h1>La tua intelligenza.<br /><em>Un solo NexusNXS.</em></h1>
        <p className="hero-copy">Un’unica intelligenza tra PC e Android. NexusNXS Core, voce, progetti e continuità protetta, con impostazioni e cronologia sotto il tuo controllo.</p>
        <div className="hero-actions"><a className="primary-button" href="#apps">Esplora NexusNXS <ArrowUpRight size={15} /></a><HardNavigationLink className="text-link" href="/security">Apri il Trust Center <span>→</span></HardNavigationLink></div>
        <div className="trust-line"><span><Fingerprint size={13} /> AI CONNESSA</span><span><ShieldCheck size={13} /> ACCESSI REVOCABILI</span><span><Blocks size={13} /> CONTINUITÀ PROTETTA</span></div>
        <div className="scroll-cue" aria-hidden="true">SCORRI <i /></div>
      </section>
      <section className="manifesto reveal" id="vision"><p className="section-label">/ 01 — LA PRESENZA</p><p className="manifesto-text">NexusNXS non è un insieme di app separate. È <strong>una sola intelligenza privata</strong> che continua tra i tuoi dispositivi.</p></section>
      <section className="apps-section" id="apps">
        <div className="section-heading reveal"><div><p className="section-label">/ 02 — Le applicazioni</p><h2>Un ecosistema.<br />Il tuo ritmo.</h2></div><p>Ogni prodotto nasce per risolvere bene un problema reale. Insieme, diventano un ambiente senza attriti.</p></div>
        <div className="app-grid">{apps.map((app) => <article className={`app-card reveal ${app.accent}`} key={app.name}><div className="card-top"><span>{app.index}</span><span className="status"><i /> IN SVILUPPO</span></div><div className="app-orb" aria-hidden="true"><span><app.Icon size={46} strokeWidth={1.15} /></span></div><p className="platform">{app.platform}</p><h3>{app.name}</h3><p>{app.description}</p><HardNavigationLink href={app.href} aria-label={`Scopri di più su ${app.name}`}>SCOPRI DI PIÙ <ArrowUpRight size={14} /></HardNavigationLink></article>)}</div>
      </section>
      <section className="presence-system reveal" aria-labelledby="presence-title">
        <div className="presence-copy"><p className="section-label">/ 03 — STATI COMPRENSIBILI</p><h2 id="presence-title">Sai sempre<br /><em>cosa sta facendo.</em></h2><p>Colori e movimento hanno un significato operativo, lo stesso sulle app e sul sito. Nessun indicatore puramente decorativo.</p></div>
        <div className="presence-grid">{presenceStates.map(({Icon,label,detail,state})=><article key={state} data-state={state}><span><Icon strokeWidth={1.4}/></span><div><strong>{label}</strong><small>{detail}</small></div><i aria-hidden="true"/></article>)}</div>
      </section>
      <section className="one-nexus reveal">
        <div className="one-nexus-copy"><p className="section-label">/ 04 — ECOSISTEMA NEXUSNXS</p><h2>Due applicazioni.<br /><em>Una sola istanza.</em></h2><p>NexusNXS per PC e Android condividono sessione, identità e infrastruttura senza trasformare i tuoi dati in un prodotto.</p><HardNavigationLink className="text-link" href="/status">VEDI LO STATO DELLA RETE <span>→</span></HardNavigationLink></div>
        <div className="nexus-stage"><ProductMockup type="desktop"/><ProductMockup type="android"/><span className="orbit-line one"/><span className="orbit-line two"/></div>
      </section>
      <section className="security reveal" id="security">
        <div className="security-copy"><p className="section-label">/ 05 — SICUREZZA NEXUSNXS</p><h2>La fiducia non si chiede.<br /><em>Si dimostra.</em></h2><p>Riduciamo i dati, separiamo il servizio pubblico dall’amministrazione privata e blocchiamo i download finché non sono verificabili.</p><HardNavigationLink className="primary-button light" href="/security">Apri il Trust Center <span>→</span></HardNavigationLink></div>
        <div className="security-panel" id="principles"><div className="scanline" /><p>SECURITY POSTURE <span>CONTROLLI DOCUMENTATI</span></p><div className="shield" aria-hidden="true"><ShieldCheck size={72} strokeWidth={1} /></div><dl><div><dt><LockKeyhole size={14} /> Distribuzione</dt><dd>Firma richiesta</dd></div><div><dt><Fingerprint size={14} /> Dati</dt><dd>Cifratura in transito</dd></div><div><dt><Orbit size={14} /> Telemetria</dt><dd>Minima &amp; trasparente</dd></div><div><dt><Blocks size={14} /> Aggiornamenti</dt><dd>Integrità verificabile</dd></div></dl></div>
      </section>
      <SiteFooter />
    </main>
  );
}
