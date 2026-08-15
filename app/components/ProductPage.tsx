import { ArrowRight, Check, Cpu, Fingerprint, Layers3, LockKeyhole, Radio, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { ProductMockup, SiteFooter, SiteHeader } from "./SiteChrome";

const featureIcons = [Sparkles, ShieldCheck, Workflow, Layers3];

export function ProductPage({ label, title, italic, description, type, platform, features }: { label: string; title: string; italic: string; description: string; type: "desktop" | "android"; platform: string; features: { title: string; text: string }[] }) {
  return <main className="inner-page"><SiteHeader />
    <section className="product-hero"><div className="product-copy"><p className="eyebrow"><Sparkles size={13} /> {label}</p><h1>{title}<br /><em>{italic}</em></h1><p>{description}</p><div className="hero-actions"><a className="primary-button" href="/downloads">Disponibilità <ArrowRight size={15} /></a><span className="platform-chip">{platform}</span></div></div><ProductMockup type={type} /></section>
    <section className="product-facts"><div><span>01</span><strong>Privato per impostazione</strong><p>I tuoi dati restano sotto il tuo controllo.</p></div><div><span>02</span><strong>Continuità reale</strong><p>Stessa sessione, contesto e progetti.</p></div><div><span>03</span><strong>Sicurezza verificabile</strong><p>Canali cifrati e accessi revocabili.</p></div></section>
    <section className="feature-section"><div className="section-heading"><div><p className="section-label">/ CAPACITÀ</p><h2>Potente.<br /><em>Senza rumore.</em></h2></div><p>Ogni funzione è progettata per ridurre attrito e distrazioni, con controlli comprensibili e risultati concreti.</p></div><div className="feature-grid">{features.map((f,i)=>{const Icon=featureIcons[i%featureIcons.length];return <article key={f.title}><Icon strokeWidth={1.25}/><span>0{i+1}</span><h3>{f.title}</h3><p>{f.text}</p></article>})}</div></section>
    <section className="architecture-band"><div><p className="section-label">/ NEXUS CORE</p><h2>Una sola intelligenza.<br />Molte superfici.</h2></div><div className="architecture-list"><p><Cpu/> Runtime locale controllato</p><p><LockKeyhole/> Accesso autenticato</p><p><Radio/> Sincronizzazione cifrata</p><p><Fingerprint/> Identità revocabile</p></div></section>
    <SiteFooter />
  </main>;
}
