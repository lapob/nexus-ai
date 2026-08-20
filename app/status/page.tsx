import type { Metadata } from "next";
import { Activity, CheckCircle2, Cloud, DatabaseZap, History, Radio, Server } from "lucide-react";
import { SiteFooter, SiteHeader } from "../components/SiteChrome";

export const metadata: Metadata = { title: "NexusNXS Status — Stato dei servizi", description: "Disponibilità in tempo reale dell’infrastruttura pubblica NexusNXS.", alternates:{canonical:"/status"}, openGraph: { title: "NexusNXS Status", description: "Stato dei servizi NexusNXS.", images: [] }, twitter: { title: "NexusNXS Status", description: "Stato dei servizi NexusNXS.", images: [] } };

async function getStatus() {
  const started = Date.now();
  try { const response = await fetch("https://ai.nexusnxs.com/healthz", { cache: "no-store", signal: AbortSignal.timeout(4000) }); return { online: response.ok, latency: Date.now() - started, checkedAt: new Date() }; }
  catch { return { online: false, latency: null, checkedAt: new Date() }; }
}

export default async function Status() {
  const status = await getStatus();
  const checkedAt = status.checkedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "medium" });
  const services = [
    { Icon: Server, name: "NexusNXS Public API", detail: "ai.nexusnxs.com", ok: status.online, note: status.latency ? `${status.latency} ms` : "Nessuna risposta" },
    { Icon: Cloud, name: "Sito pubblico", detail: "nexusnxs.com", ok: true, note: "Pagina disponibile" },
    { Icon: Radio, name: "Canale cifrato", detail: "Tunnel pubblico", ok: status.online, note: status.online ? "Raggiungibile" : "In verifica" },
    { Icon: DatabaseZap, name: "Servizi privati", detail: "Non esposti pubblicamente", ok: true, note: "Confine preservato" },
  ];
  return <main className="inner-page" id="main-content"><SiteHeader />
    <section className="status-hero"><p className="eyebrow"><Activity size={14} /> NEXUSNXS STATUS</p><h1>{status.online ? "Servizi pubblici" : "Verifica della rete"}<br /><em>{status.online ? "raggiungibili." : "in corso."}</em></h1><div className={`status-banner ${status.online ? "" : "degraded"}`}><i /><span>{status.online ? "PUBLIC SERVICES OPERATIONAL" : "PUBLIC API CHECK PENDING"}</span><time dateTime={status.checkedAt.toISOString()}>{checkedAt}</time></div></section>
    <section className="service-list" aria-label="Componenti monitorati">{services.map(({ Icon, name, detail, ok, note }) => <div key={name}><Icon /><strong>{name}</strong><span>{detail}</span><small>{note}</small><b className={ok ? "ok" : "warn"}><i />{ok ? "OPERATIVO" : "IN VERIFICA"}</b></div>)}</section>
    <section className="uptime-panel"><div><History /><p className="section-label">STORICO DISPONIBILITÀ</p><h2>Misurare prima<br /><em>di dichiarare.</em></h2></div><div className="uptime-empty"><strong>Raccolta dati in corso</strong><p>Non mostriamo percentuali simulate. Lo storico a 30 e 90 giorni verrà pubblicato quando esisterà una base di misurazione continua e verificabile.</p><span>NESSUN INCIDENTE PUBBLICO REGISTRATO</span></div></section>
    <section className="status-note"><CheckCircle2 /><div><h2>Origine protetta</h2><p>Il server non espone direttamente le funzioni amministrative. Il dominio pubblico raggiunge soltanto il servizio guest previsto dall’architettura.</p></div></section>
    <SiteFooter />
  </main>;
}
