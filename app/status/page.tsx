import type { Metadata } from "next";
import { Activity, CheckCircle2, Cloud, DatabaseZap, History, Radio, Server } from "lucide-react";
import { SiteFooter } from "../components/SiteChrome";
import { NexusPresence } from "../components/NexusOperationalState";
import { NEXUSNXS_AI_ORIGIN } from "../lib/service-endpoints";
import { checkNexusNxsAi } from "../lib/service-status";

export const metadata: Metadata = { title: "NexusNXS Status — Stato dei servizi", description: "Disponibilità in tempo reale dell’infrastruttura pubblica NexusNXS.", alternates:{canonical:"/status"}, openGraph: { title: "NexusNXS Status", description: "Stato dei servizi NexusNXS.", images: [] }, twitter: { title: "NexusNXS Status", description: "Stato dei servizi NexusNXS.", images: [] } };

export default async function Status() {
  const status = await checkNexusNxsAi();
  const checkedAt = status.checkedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "medium" });
  const services = [
    { Icon: Server, name: "NexusNXS AI", detail: new URL(NEXUSNXS_AI_ORIGIN).hostname, state: status.online ? "ok" : "warn", note: status.latencyMs !== null ? `${status.latencyMs} ms` : "Nessuna risposta" },
    { Icon: Cloud, name: "Sito pubblico", detail: "nexusnxs.com", state: "ok", note: "Questa pagina è raggiungibile" },
    { Icon: Radio, name: "Canale cifrato", detail: "Tunnel pubblico", state: status.online ? "ok" : "warn", note: status.online ? "Raggiungibile" : "In verifica" },
    { Icon: DatabaseZap, name: "Servizi privati", detail: "Non esposti pubblicamente", state: "neutral", note: "Fuori dal perimetro pubblico" },
  ];
  return <main className="inner-page" id="main-content">
    <section className="status-hero"><NexusPresence state={status.online ? "online" : "reconnecting"} compact className="status-presence" /><p className="eyebrow"><Activity size={14} /> NEXUSNXS STATUS</p><h1>{status.online ? "Servizi pubblici" : "Verifica della rete"}<br /><em>{status.online ? "raggiungibili." : "in corso."}</em></h1><div className={`status-banner ${status.online ? "" : "degraded"}`}><i /><span>{status.online ? "PUBLIC SERVICES OPERATIONAL" : "PUBLIC API CHECK PENDING"}</span><time dateTime={status.checkedAt.toISOString()}>{checkedAt}</time></div></section>
    <section className="service-list" aria-label="Componenti monitorati">{services.map(({ Icon, name, detail, state, note }) => <div key={name}><Icon /><strong>{name}</strong><span>{detail}</span><small>{note}</small><b className={state}><i />{state === "ok" ? "OPERATIVO" : state === "warn" ? "IN VERIFICA" : "PRIVATO"}</b></div>)}</section>
    <section className="uptime-panel"><div><History /><p className="section-label">STORICO DISPONIBILITÀ</p><h2>Misurare prima<br /><em>di dichiarare.</em></h2></div><div className="uptime-empty"><strong>Raccolta dati in corso</strong><p>Non mostriamo percentuali simulate. Lo storico a 30 e 90 giorni verrà pubblicato quando esisterà una base di misurazione continua e verificabile.</p><span>NESSUN INCIDENTE PUBBLICO REGISTRATO</span></div></section>
    <section className="status-note"><CheckCircle2 /><div><h2>Origine protetta</h2><p>Il server non espone direttamente le funzioni amministrative. Il dominio pubblico raggiunge soltanto il servizio guest previsto dall’architettura.</p></div></section>
    <SiteFooter />
  </main>;
}
