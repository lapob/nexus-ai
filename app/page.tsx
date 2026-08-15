"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Blocks, Fingerprint, KeyRound, LockKeyhole, Orbit, ShieldCheck, Sparkles, Workflow } from "lucide-react";

const apps = [
  { index: "01", name: "Nexus Flow", platform: "Android · Windows · macOS", description: "Uno spazio di lavoro fluido che collega idee, file e dispositivi senza interrompere il tuo ritmo.", accent: "violet", Icon: Workflow },
  { index: "02", name: "Nexus Vault", platform: "Android · Desktop", description: "Documenti e credenziali protetti localmente, sincronizzati solo quando e come decidi tu.", accent: "cyan", Icon: KeyRound },
  { index: "03", name: "Nexus Pulse", platform: "Windows · macOS · Linux", description: "Automazioni intelligenti e discrete per trasformare attività ripetitive in tempo ritrovato.", accent: "coral", Icon: Orbit },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => entry.isIntersecting && entry.target.classList.add("is-visible")), { threshold: 0.16 });
    document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
    return () => reveal.disconnect();
  }, []);
  return (
    <main>
      <nav className="nav" aria-label="Navigazione principale">
        <a className="brand" href="#top" aria-label="Nexus, torna all'inizio"><img className="brand-icon" src="/nexus-icon.png" alt="" /><span>NEXUS</span></a>
        <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Apri il menu"><span /><span /></button>
        <div className={`nav-links ${menuOpen ? "open" : ""}`}>
          <a href="#apps" onClick={() => setMenuOpen(false)}>Apps</a><a href="#security" onClick={() => setMenuOpen(false)}>Sicurezza</a><a href="#vision" onClick={() => setMenuOpen(false)}>Visione</a><a className="nav-cta" href="#apps" onClick={() => setMenuOpen(false)}>Esplora</a>
        </div>
      </nav>
      <section className="hero" id="top">
        <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
        <p className="eyebrow"><Sparkles size={13} strokeWidth={1.5} /> Software indipendente. Idee senza confini.</p>
        <h1>Strumenti digitali<br />per menti <em>libere.</em></h1>
        <p className="hero-copy">App Android e desktop progettate per essere potenti, bellissime e rispettose. La tecnologia torna dalla tua parte.</p>
        <div className="hero-actions"><a className="primary-button" href="#apps">Scopri le app <ArrowUpRight size={15} /></a><a className="text-link" href="#security">Il nostro standard di sicurezza <span>→</span></a></div>
        <div className="trust-line"><span><Fingerprint size={13} /> PRIVACY BY DESIGN</span><span><ShieldCheck size={13} /> FIRMA VERIFICABILE</span><span><Blocks size={13} /> NESSUN TRACKING INVASIVO</span></div>
        <div className="scroll-cue" aria-hidden="true">SCORRI <i /></div>
      </section>
      <section className="manifesto reveal" id="vision"><p className="section-label">/ 01 — La visione</p><p className="manifesto-text">Non costruiamo software che reclama la tua attenzione. Creiamo <strong>strumenti silenziosi</strong> che amplificano ciò che sai fare.</p></section>
      <section className="apps-section" id="apps">
        <div className="section-heading reveal"><div><p className="section-label">/ 02 — Le applicazioni</p><h2>Un ecosistema.<br />Il tuo ritmo.</h2></div><p>Ogni prodotto nasce per risolvere bene un problema reale. Insieme, diventano un ambiente senza attriti.</p></div>
        <div className="app-grid">{apps.map((app) => <article className={`app-card reveal ${app.accent}`} key={app.name}><div className="card-top"><span>{app.index}</span><span className="status"><i /> IN SVILUPPO</span></div><div className="app-orb" aria-hidden="true"><span><app.Icon size={46} strokeWidth={1.15} /></span></div><p className="platform">{app.platform}</p><h3>{app.name}</h3><p>{app.description}</p><a href="#contact" aria-label={`Scopri di più su ${app.name}`}>SCOPRI DI PIÙ <ArrowUpRight size={14} /></a></article>)}</div>
      </section>
      <section className="security reveal" id="security">
        <div className="security-copy"><p className="section-label">/ 03 — Sicurezza radicale</p><h2>La fiducia non si chiede.<br /><em>Si dimostra.</em></h2><p>Riduciamo i dati raccolti, proteggiamo ogni distribuzione e rendiamo verificabile l’integrità del software. La sicurezza è un processo continuo, non un badge.</p><a className="primary-button light" href="#principles">Leggi i principi <span>→</span></a></div>
        <div className="security-panel" id="principles"><div className="scanline" /><p>SECURITY STATUS <span>ALL SYSTEMS PROTECTED</span></p><div className="shield" aria-hidden="true"><ShieldCheck size={72} strokeWidth={1} /></div><dl><div><dt><LockKeyhole size={14} /> Distribuzione</dt><dd>Pacchetti firmati</dd></div><div><dt><Fingerprint size={14} /> Dati</dt><dd>Cifratura in transito</dd></div><div><dt><Orbit size={14} /> Telemetria</dt><dd>Minima &amp; trasparente</dd></div><div><dt><Blocks size={14} /> Aggiornamenti</dt><dd>Canale verificato</dd></div></dl></div>
      </section>
      <footer id="contact"><div><img className="footer-icon" src="/nexus-icon.png" alt="" /><h2>Il futuro non si aspetta.<br /><em>Si costruisce.</em></h2></div><a className="primary-button" href="mailto:hello@nexus-apps.dev">Parliamone <ArrowUpRight size={15} /></a><p>© 2026 NEXUS SOFTWARE STUDIO</p><p>MADE WITH INTENT IN ITALY</p></footer>
    </main>
  );
}
