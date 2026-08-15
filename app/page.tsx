"use client";

import { useEffect } from "react";
import { ArrowUpRight, Blocks, Fingerprint, KeyRound, LockKeyhole, Orbit, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { ProductMockup, SiteFooter, SiteHeader } from "./components/SiteChrome";

const apps = [
  { index: "01", name: "Nexus Desktop", platform: "Windows · AI locale", description: "Un ambiente intelligente e privato che porta modelli, strumenti e automazioni dentro il tuo computer.", accent: "violet", href: "/desktop", Icon: Workflow },
  { index: "02", name: "Nexus AI", platform: "Android · Continuità", description: "La tua esperienza Nexus sempre con te, con conversazioni sincronizzate e controllo trasparente.", accent: "cyan", href: "/android", Icon: KeyRound },
  { index: "03", name: "Nexus Console", platform: "Android · Operations", description: "Controllo sicuro dell’istanza, stato dei servizi e accesso riservato alla tua rete privata.", accent: "coral", href: "/console", Icon: Orbit },
];

export default function Home() {
  useEffect(() => {
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")), { threshold: 0.16 });
    document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
    return () => reveal.disconnect();
  }, []);
  return (
    <main>
      <SiteHeader />
      <section className="hero" id="top">
        <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
        <p className="eyebrow"><Sparkles size={13} strokeWidth={1.5} /> Software indipendente. Idee senza confini.</p>
        <h1>Strumenti digitali<br />per menti <em>libere.</em></h1>
        <p className="hero-copy">App Android e desktop progettate per essere potenti, bellissime e rispettose. La tecnologia torna dalla tua parte.</p>
        <div className="hero-actions"><a className="primary-button" href="#apps">Scopri le app <ArrowUpRight size={15} /></a><a className="text-link" href="/security">Esplora il Trust Center <span>→</span></a></div>
        <div className="trust-line"><span><Fingerprint size={13} /> PRIVACY BY DESIGN</span><span><ShieldCheck size={13} /> FIRMA VERIFICABILE</span><span><Blocks size={13} /> NESSUN TRACKING INVASIVO</span></div>
        <div className="scroll-cue" aria-hidden="true">SCORRI <i /></div>
      </section>
      <section className="manifesto reveal" id="vision"><p className="section-label">/ 01 — La visione</p><p className="manifesto-text">Non costruiamo software che reclama la tua attenzione. Creiamo <strong>strumenti silenziosi</strong> che amplificano ciò che sai fare.</p></section>
      <section className="apps-section" id="apps">
        <div className="section-heading reveal"><div><p className="section-label">/ 02 — Le applicazioni</p><h2>Un ecosistema.<br />Il tuo ritmo.</h2></div><p>Ogni prodotto nasce per risolvere bene un problema reale. Insieme, diventano un ambiente senza attriti.</p></div>
        <div className="app-grid">{apps.map((app) => <article className={`app-card reveal ${app.accent}`} key={app.name}><div className="card-top"><span>{app.index}</span><span className="status"><i /> IN SVILUPPO</span></div><div className="app-orb" aria-hidden="true"><span><app.Icon size={46} strokeWidth={1.15} /></span></div><p className="platform">{app.platform}</p><h3>{app.name}</h3><p>{app.description}</p><a href={app.href} aria-label={`Scopri di più su ${app.name}`}>SCOPRI DI PIÙ <ArrowUpRight size={14} /></a></article>)}</div>
      </section>
      <section className="one-nexus reveal">
        <div className="one-nexus-copy"><p className="section-label">/ 03 — One Nexus</p><h2>Tre esperienze.<br /><em>Una sola istanza.</em></h2><p>Desktop, Android e web convergono sulla stessa infrastruttura privata. La continuità è reale, senza trasformare i tuoi dati in un prodotto.</p><a className="text-link" href="/status">VEDI LO STATO DELLA RETE <span>→</span></a></div>
        <div className="nexus-stage"><ProductMockup type="desktop"/><ProductMockup type="android"/><span className="orbit-line one"/><span className="orbit-line two"/></div>
      </section>
      <section className="security reveal" id="security">
        <div className="security-copy"><p className="section-label">/ 04 — Sicurezza radicale</p><h2>La fiducia non si chiede.<br /><em>Si dimostra.</em></h2><p>Riduciamo i dati raccolti, proteggiamo ogni distribuzione e rendiamo verificabile l’integrità del software. La sicurezza è un processo continuo, non un badge.</p><a className="primary-button light" href="/security">Apri il Trust Center <span>→</span></a></div>
        <div className="security-panel" id="principles"><div className="scanline" /><p>SECURITY STATUS <span>ALL SYSTEMS PROTECTED</span></p><div className="shield" aria-hidden="true"><ShieldCheck size={72} strokeWidth={1} /></div><dl><div><dt><LockKeyhole size={14} /> Distribuzione</dt><dd>Pacchetti firmati</dd></div><div><dt><Fingerprint size={14} /> Dati</dt><dd>Cifratura in transito</dd></div><div><dt><Orbit size={14} /> Telemetria</dt><dd>Minima &amp; trasparente</dd></div><div><dt><Blocks size={14} /> Aggiornamenti</dt><dd>Canale verificato</dd></div></dl></div>
      </section>
      <SiteFooter />
    </main>
  );
}
