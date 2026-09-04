import Image from "next/image";
import { ArrowUpRight, Blocks, BrainCircuit, Check, Fingerprint, LockKeyhole, MessageCircle, Mic2, Orbit, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { ProductMockup, SiteFooter } from "./components/SiteChrome";
import { StructuredData } from "./components/StructuredData";
import { HardNavigationLink } from "./components/HardNavigationLink";
import { VisualizerCollection } from "./components/InteractiveVisualizer";

const apps = [
  { index: "01", name: "NexusNXS per PC", platform: "Windows · NexusNXS Core", description: "Il centro intelligente della tua esperienza: AI connessa, voce locale, progetti e azioni approvate sul computer.", accent: "cyan", device: "desktop", image: "/products/desktop-core.png", alt: "Core particellare reale di NexusNXS per PC", href: "/desktop" },
  { index: "02", name: "NexusNXS per Android", platform: "Android · Core vocale", description: "Un Core neurale da toccare e una scrittura essenziale quando serve: il ragionamento resta sui servizi NexusNXS.", accent: "teal", device: "android", image: "/products/android-home.png", alt: "NexusNXS per Android pronto all'ascolto", href: "/android" },
];

const presenceStates = [
  { Icon: Mic2, label: "Ascolto", detail: "Input vocale attivo", state: "listening" },
  { Icon: BrainCircuit, label: "Pensiero", detail: "Elaborazione visibile", state: "thinking" },
  { Icon: MessageCircle, label: "Risposta", detail: "Output leggibile", state: "responding" },
  { Icon: Zap, label: "Azione", detail: "Consenso richiesto", state: "executing" },
];

export default function Home() {
  return (
    <main id="main-content" className="home-continuum">
      <StructuredData data={[{"@context":"https://schema.org","@type":"WebSite",name:"NexusNXS",url:"https://nexusnxs.com",inLanguage:"it-IT"},{"@context":"https://schema.org","@type":"Organization",name:"NexusNXS",url:"https://nexusnxs.com",logo:"https://nexusnxs.com/nexus-icon.png",email:"hello@nexusnxs.com"}]} />
      <section className="hero" id="top">
        <div className="aurora" aria-hidden="true">
          <i /><i /><i />
          <div className="home-neural-core">
            <span className="home-neural-core__nucleus" />
            {Array.from({ length: 18 }, (_, index) => <span className="home-neural-core__neuron" key={index} />)}
          </div>
        </div>
        <p className="eyebrow"><Sparkles size={13} strokeWidth={1.5} /> NEXUSNXS · AI PRIVATA, PROTETTA, CONNESSA</p>
        <h1>Chiedilo a Nexus.<br /><em>Fallo sul tuo PC.</em></h1>
        <p className="hero-copy">Un assistente personale che continua tra PC, Android e Web: comprende la richiesta, prepara il lavoro e agisce sul computer soltanto entro autorizzazioni chiare e revocabili.</p>
        <div className="hero-actions"><HardNavigationLink className="primary-button" href="https://ai.nexusnxs.com">Apri NexusNXS AI <ArrowUpRight size={15} /></HardNavigationLink><a className="text-link" href="#apps">Scopri le applicazioni <span>→</span></a></div>
        <div className="trust-line"><span><Fingerprint size={13} /> AI CONNESSA</span><span><ShieldCheck size={13} /> ACCESSI REVOCABILI</span><span><Blocks size={13} /> CONTINUITÀ PROTETTA</span></div>
        <div className="scroll-cue" aria-hidden="true">SCORRI <i /></div>
      </section>
      <section className="manifesto reveal" id="vision"><p className="section-label">/ 01 — LA PRESENZA</p><p className="manifesto-text">NexusNXS non è un insieme di app separate. È <strong>una sola intelligenza privata</strong> che continua tra i tuoi dispositivi.</p></section>
      <section className="apps-section" id="apps">
        <div className="section-heading reveal"><div><p className="section-label">/ 02 — Le applicazioni</p><h2>Un ecosistema.<br />Il tuo ritmo.</h2></div><p>Ogni prodotto nasce per risolvere bene un problema reale. Insieme, diventano un ambiente senza attriti.</p></div>
        <VisualizerCollection mode="all" compact />
        <div className="app-grid">{apps.map((app) => <article className={`app-card reveal ${app.accent}`} key={app.name}><div className="card-top"><span>{app.index}</span><span className="status"><i /> BUILD VERIFICATA</span></div><div className={`app-card-visual ${app.device}`}><div className="app-card-visual__screen"><Image src={app.image} alt={app.alt} width={app.device === "desktop" ? 1090 : 360} height={app.device === "desktop" ? 613 : 640} sizes={app.device === "desktop" ? "(max-width: 800px) 88vw, 540px" : "180px"} unoptimized /></div></div><p className="platform">{app.platform}</p><h3>{app.name}</h3><p>{app.description}</p><HardNavigationLink href={app.href} aria-label={`Scopri di più su ${app.name}`}>SCOPRI DI PIÙ <ArrowUpRight size={14} /></HardNavigationLink></article>)}</div>
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
      <section className="founder-preview reveal" aria-labelledby="founder-preview-title">
        <div><p className="section-label">/ 06 — FOUNDER BETA</p><h2 id="founder-preview-title">Prima misuriamo.<br /><em>Poi cresciamo.</em></h2><p>La beta a pagamento aprirà soltanto dopo i controlli su capacità, disponibilità, assistenza, privacy e pagamenti. Nessun piano illimitato e nessun addebito nascosto.</p></div>
        <ul><li><Check size={16} /> Numero iniziale di partecipanti limitato</li><li><Check size={16} /> Quote pubblicate prima dell’acquisto</li><li><Check size={16} /> Consenso separato per contribuire al miglioramento</li></ul>
        <HardNavigationLink className="primary-button" href="/pricing">Scopri i piani <ArrowUpRight size={15} /></HardNavigationLink>
      </section>
      <SiteFooter />
    </main>
  );
}
