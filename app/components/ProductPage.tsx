import { ArrowRight, Cpu, Fingerprint, Layers3, LockKeyhole, Radio, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { ProductMockup, SiteFooter } from "./SiteChrome";
import { StructuredData } from "./StructuredData";
import { HardNavigationLink } from "./HardNavigationLink";

const featureIcons = [Sparkles, ShieldCheck, Workflow, Layers3];

export function ProductPage({ label, title, italic, description, type, platform, features }: { label: string; title: string; italic: string; description: string; type: "desktop" | "android"; platform: string; features: { title: string; text: string }[] }) {
  const appName = type === "desktop" ? "NexusNXS per PC" : "NexusNXS per Android";
  const operatingSystem = type === "desktop" ? "Windows 11" : "Android 10 e versioni successive";
  return <main className="inner-page product-narrative" id="main-content"><StructuredData data={{"@context":"https://schema.org","@type":"SoftwareApplication",name:appName,applicationCategory:"UtilitiesApplication",operatingSystem,description,url:`https://nexusnxs.com/${type === "desktop" ? "desktop" : "android"}`,offers:{"@type":"Offer",price:"0",priceCurrency:"EUR",availability:"https://schema.org/PreOrder"}}} />
    <section className="product-hero"><div className="product-copy"><p className="eyebrow"><Sparkles size={13} /> {label}</p><h1>{title}<br /><em>{italic}</em></h1><p>{description}</p><div className="hero-actions"><HardNavigationLink className="primary-button" href="/downloads">Scarica l’app <ArrowRight size={15} /></HardNavigationLink><span className="platform-chip">{platform}</span></div></div><ProductMockup type={type} /></section>
    <section className="product-facts"><div><span>01</span><strong>Permessi espliciti</strong><p>I tuoi dati restano sotto il tuo controllo.</p></div><div><span>02</span><strong>Servizio condiviso</strong><p>Lo stesso motore su PC, Android e Web.</p></div><div><span>03</span><strong>Connessione protetta</strong><p>Canali cifrati e accessi revocabili.</p></div></section>
    <section className="feature-section"><div className="section-heading"><div><p className="section-label">/ CAPACITÀ</p><h2>Potente.<br /><em>Senza rumore.</em></h2></div><p>Ogni funzione è progettata per ridurre attrito e distrazioni, con controlli comprensibili e risultati concreti.</p></div><div className="feature-grid">{features.map((f,i)=>{const Icon=featureIcons[i%featureIcons.length];return <article key={f.title}><Icon strokeWidth={1.25}/><span>0{i+1}</span><h3>{f.title}</h3><p>{f.text}</p></article>})}</div></section>
    <section className="architecture-band"><div><p className="section-label">/ NEXUSNXS CORE</p><h2>La stessa intelligenza.<br />Un’esperienza familiare.</h2></div><div className="architecture-list"><p><Cpu/> Modelli protetti sul Core</p><p><LockKeyhole/> Accesso autenticato</p><p><Radio/> Trasporto cifrato</p><p><Fingerprint/> Identità revocabile</p></div></section>
    <SiteFooter />
  </main>;
}
