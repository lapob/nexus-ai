import type { Metadata } from "next";
import { ArrowUpRight, Check, Gauge, ShieldCheck, Sparkles, Users } from "lucide-react";
import { HardNavigationLink } from "../components/HardNavigationLink";
import { SiteFooter } from "../components/SiteChrome";

export const metadata: Metadata = {
  title: "Piani e Founder Beta — NexusNXS",
  description: "Piani NexusNXS trasparenti, senza uso illimitato e con apertura subordinata ai controlli di capacità e sicurezza.",
  alternates: { canonical: "/pricing" },
  openGraph: { title: "Piani NexusNXS", description: "Una Founder Beta limitata, misurata e trasparente.", images: [] },
  twitter: { title: "Piani NexusNXS", description: "Una Founder Beta limitata, misurata e trasparente.", images: [] },
};

const plans = [
  { name: "Free", price: "€0", cadence: "per iniziare", description: "Per provare l’esperienza essenziale quando il servizio pubblico è disponibile.", features: ["Chat e voce con quota mensile", "Un dispositivo principale", "Controlli di privacy e cancellazione", "Accesso in base alla capacità del Core"] },
  { name: "Pro", price: "€12,99", cadence: "al mese · previsto", description: "Per usare Nexus ogni giorno tra PC e telefono.", features: ["Quote superiori pubblicate prima dell’acquisto", "Memoria personale controllabile", "Azioni approvate sul PC", "Priorità superiore nella coda"] },
  { name: "Power", price: "€24,99", cadence: "al mese · previsto", description: "Per workflow, progetti e attività più impegnative.", features: ["Più dispositivi associati", "Budget maggiore per ragionamento e voce", "Workflow con ricevute e annullamento", "Assistenza prioritaria"] },
] as const;

export default function PricingPage() {
  return <main className="inner-page pricing-page" id="main-content">
    <header className="pricing-hero"><p className="eyebrow"><Sparkles size={14} /> PIANI NEXUSNXS</p><h1>Semplice da provare.<br /><em>Sostenibile da usare.</em></h1><p>I prezzi sono una proposta di lancio, non un’offerta acquistabile oggi. La Founder Beta aprirà soltanto quando i gate tecnici e operativi saranno superati.</p></header>
    <section className="pricing-grid" aria-label="Piani previsti">{plans.map((plan, index) => <article className={index === 1 ? "is-featured" : ""} key={plan.name}><span className="plan-index">0{index + 1}</span><h2>{plan.name}</h2><p>{plan.description}</p><div className="plan-price"><strong>{plan.price}</strong><small>{plan.cadence}</small></div><ul>{plan.features.map((feature) => <li key={feature}><Check size={15} /> {feature}</li>)}</ul></article>)}</section>
    <section className="founder-program"><div><p className="section-label">/ FOUNDER BETA</p><h2>Massimo 50 persone.<br /><em>Obiettivo €69 il primo anno.</em></h2><p>Il prezzo definitivo, le quote e il rinnovo saranno confermati prima dell’apertura. La lista di interesse non comporta acquisti né rinnovi automatici.</p><a className="primary-button" href="mailto:hello@nexusnxs.com?subject=Interesse%20Founder%20Beta%20NexusNXS">Segnala interesse <ArrowUpRight size={15} /></a></div><div className="founder-rules"><p><Gauge /><span><strong>Capacità misurata</strong><small>Concorrenza, coda e latenza prima delle vendite.</small></span></p><p><ShieldCheck /><span><strong>Controlli prima del pagamento</strong><small>Privacy, sicurezza, assistenza e ripristino verificati.</small></span></p><p><Users /><span><strong>Crescita progressiva</strong><small>Nessun accesso pubblico illimitato da una singola workstation.</small></span></p></div></section>
    <section className="pricing-disclosure"><p><strong>Nessun checkout è attivo su questa pagina.</strong> Eventuali imposte, commissioni, limiti e condizioni verranno mostrati chiaramente prima dell’acquisto.</p><HardNavigationLink href="/terms">Leggi i termini <ArrowUpRight size={14} /></HardNavigationLink></section>
    <SiteFooter ctaHref="mailto:hello@nexusnxs.com?subject=Interesse%20Founder%20Beta%20NexusNXS" ctaLabel="Partecipa alla lista Founder" />
  </main>;
}
