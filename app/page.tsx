"use client";

import { useEffect, useState } from "react";

const features = [
  { n: "01", title: "Comprende il tuo ritmo", text: "Nexus impara come lavori, organizza il contesto e porta in superficie ciò che conta — prima ancora che tu lo chieda." },
  { n: "02", title: "Una voce, ogni dispositivo", text: "Inizia una conversazione sul telefono e riprendila sul desktop. Il tuo spazio resta sincronizzato e sempre tuo." },
  { n: "03", title: "Agisce, non risponde soltanto", text: "Dalle idee alle azioni: crea, riassume, pianifica e trasforma le tue intenzioni in risultati concreti." },
];

const stats = [
  ["< 320 ms", "latenza percepita"],
  ["24 / 7", "sempre al tuo fianco"],
  ["100%", "controllo personale"],
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [platform, setPlatform] = useState("Desktop");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setPlatform("Android");
    const move = (event: PointerEvent) => {
      document.documentElement.style.setProperty("--mx", `${event.clientX}px`);
      document.documentElement.style.setProperty("--my", `${event.clientY}px`);
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const requestDownload = (name: string) => {
    setNotice(`La build ${name} sarà disponibile qui appena colleghi il file di installazione.`);
    window.setTimeout(() => setNotice(""), 4200);
  };

  return (
    <main>
      <div className="noise" aria-hidden="true" />
      <nav className="nav shell" aria-label="Navigazione principale">
        <button className="brand" onClick={() => scrollTo("home")} aria-label="Nexus, torna all'inizio">
          <span className="brand-mark">N</span><span>NEXUS</span>
        </button>
        <div className={`nav-links ${menuOpen ? "open" : ""}`}>
          <button onClick={() => scrollTo("experience")}>Esperienza</button>
          <button onClick={() => scrollTo("features")}>Capacità</button>
          <button onClick={() => scrollTo("download")}>Download</button>
        </div>
        <button className="nav-cta" onClick={() => scrollTo("download")}>Ottieni Nexus <span>↗</span></button>
        <button className="menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Apri menu" aria-expanded={menuOpen}>{menuOpen ? "×" : "＝"}</button>
      </nav>

      <section className="hero shell" id="home">
        <div className="eyebrow reveal"><span /> INTELLIGENZA PERSONALE, EVOLUTA</div>
        <h1 className="reveal delay-1">Non è un assistente.<br /><em>È il tuo Nexus.</em></h1>
        <p className="hero-copy reveal delay-2">Una presenza intelligente che comprende il tuo mondo, connette le tue idee e lavora al tuo fianco. Ovunque tu sia.</p>
        <div className="hero-actions reveal delay-3">
          <button className="primary" onClick={() => scrollTo("download")}>Scarica per {platform}<span>↓</span></button>
          <button className="secondary" onClick={() => scrollTo("experience")}><span className="play">▶</span> Scopri Nexus</button>
        </div>

        <div className="core-wrap" aria-label="Rappresentazione animata del nucleo Nexus">
          <div className="core-glow" />
          <div className="orbit orbit-one"><i /><b>N</b></div>
          <div className="orbit orbit-two"><i /><i /><i /></div>
          <div className="orbit orbit-three" />
          <div className="core"><span>N</span></div>
          <span className="core-label label-a">CONTESTO <b>ATTIVO</b></span>
          <span className="core-label label-b">PRIVACY <b>PROTETTA</b></span>
        </div>
        <div className="scroll-cue">SCOPRI <span>↓</span></div>
      </section>

      <section className="statement shell" id="experience">
        <p className="section-kicker">02 — UNA NUOVA RELAZIONE</p>
        <h2>La tecnologia scompare.<br /><span>Resta l&apos;intesa.</span></h2>
        <div className="statement-grid">
          <p>Nexus non aspetta un comando perfetto. Ascolta, comprende il contesto e si adatta al tuo modo di pensare.</p>
          <div className="signal-card">
            <div className="signal-top"><span>SESSIONE LIVE</span><span className="live-dot" /> ONLINE</div>
            <div className="wave" aria-hidden="true">{Array.from({length: 34}).map((_, i) => <i key={i} style={{height: `${12 + ((i * 17) % 48)}px`}} />)}</div>
            <div className="transcript"><span>NEXUS / 09:41</span><p>Ho collegato le tue note al progetto. Vuoi che prepari la prossima mossa?</p></div>
          </div>
        </div>
      </section>

      <section className="feature-section shell" id="features">
        <div className="feature-head">
          <div><p className="section-kicker">03 — COSA SA FARE</p><h2>Pensata intorno<br /><span>a te.</span></h2></div>
          <p>Non un altro strumento da imparare. Un&apos;intelligenza che impara te.</p>
        </div>
        <div className="feature-list">
          {features.map((feature) => <article key={feature.n}>
            <span className="feature-number">{feature.n}</span>
            <div className="feature-icon" aria-hidden="true">{feature.n === "01" ? "◌" : feature.n === "02" ? "⌁" : "✦"}</div>
            <h3>{feature.title}</h3><p>{feature.text}</p><span className="arrow">↗</span>
          </article>)}
        </div>
        <div className="stats">{stats.map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      </section>

      <section className="download shell" id="download">
        <div className="download-orb" aria-hidden="true"><div className="core small"><span>N</span></div></div>
        <p className="section-kicker">04 — INIZIA ORA</p>
        <h2>Il futuro è personale.</h2>
        <p>Porta Nexus con te. Scegli il tuo dispositivo e comincia.</p>
        <div className="download-grid">
          <button type="button" onClick={() => requestDownload("Android")} className="download-card">
            <span className="platform-icon">A</span><div><small>DISPONIBILE PER</small><strong>Android</strong><span>Android 10 o superiore</span></div><b>↓</b>
          </button>
          <button type="button" onClick={() => requestDownload("Windows")} className="download-card">
            <span className="platform-icon">▦</span><div><small>DISPONIBILE PER</small><strong>Windows</strong><span>Windows 10 / 11 · 64 bit</span></div><b>↓</b>
          </button>
        </div>
        <div className={`notice ${notice ? "show" : ""}`} role="status">{notice}</div>
        <p className="build">NEXUS BUILD 1.0.0 <span>•</span> DOWNLOAD SICURO <span>•</span> AGGIORNAMENTI AUTOMATICI</p>
      </section>

      <footer className="shell">
        <div className="brand footer-brand"><span className="brand-mark">N</span><span>NEXUS</span></div>
        <p>La tua intelligenza.<br />Il tuo spazio. Il tuo futuro.</p>
        <div className="footer-links"><button onClick={() => scrollTo("home")}>Torna su ↑</button><a href="mailto:hello@nexus-ai.it">Contatti</a><a href="#privacy">Privacy</a></div>
        <div className="copyright">© 2026 NEXUS AI <span>PROGETTATA IN ITALIA</span></div>
      </footer>
    </main>
  );
}
