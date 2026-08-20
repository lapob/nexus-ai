"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setOnline(v.online === true)).catch(() => setOnline(false));
  }, []);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  return <header className="site-header">
    <Link className="brand" href="/" aria-label="NexusNXS, homepage"><Image className="brand-icon" src="/nexus-icon.png" alt="Logo NexusNXS" width={48} height={48} priority /><span>NEXUSNXS</span></Link>
    <button className="mobile-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="main-navigation" aria-label={open ? "Chiudi menu" : "Apri menu"}>{open ? <X /> : <Menu />}</button>
    <nav id="main-navigation" className={open ? "chrome-nav open" : "chrome-nav"} aria-label="Navigazione principale">
      <a href="/desktop" onClick={()=>setOpen(false)}>PC</a><a href="/android" onClick={()=>setOpen(false)}>Android</a><a href="/security" onClick={()=>setOpen(false)}>Sicurezza</a><a href="/status" onClick={()=>setOpen(false)}>Stato</a><a className="chrome-download" href="/downloads" onClick={()=>setOpen(false)}>Download</a>
    </nav>
    <a className={`network-pill ${online === false ? "offline" : ""}`} href="/status"><i /> {online === null ? "VERIFICA RETE" : online ? "NEXUSNXS · ONLINE" : "STATO RETE"}</a>
  </header>;
}

export function SiteFooter() {
  return <footer className="premium-footer">
    <div className="footer-callout"><Image src="/nexus-icon.png" alt="Logo NexusNXS" width={72} height={72} /><h2>Un solo NexusNXS.<br /><em>Ovunque tu sia.</em></h2><a className="primary-button" href="/downloads">Esplora NexusNXS <ArrowUpRight size={15} /></a></div>
    <div className="footer-links"><div><strong>Prodotti</strong><a href="/desktop">NexusNXS per PC</a><a href="/android">NexusNXS per Android</a></div><div><strong>Fiducia</strong><a href="/security">Trust Center</a><a href="/status">Stato servizi</a><a href="/downloads">Download verificati</a></div><div><strong>NexusNXS</strong><a href="mailto:hello@nexusnxs.com">Contatti</a><a href="https://github.com/lapob/nexus-ai">GitHub</a><a href="/security#privacy">Privacy</a></div></div>
    <div className="footer-bottom"><span>© 2026 NEXUSNXS</span><span>PRIVACY-FIRST · MADE IN ITALY</span></div>
  </footer>;
}

export function ProductMockup({ type }: { type: "desktop" | "android" }) {
  return <div className={`product-mockup ${type}`} aria-hidden="true"><div className="mockup-glow" /><div className="device-frame"><div className="device-bar"><i /><i /><i /><span>NEXUSNXS / {type.toUpperCase()}</span></div><div className="device-content"><div className="mini-sidebar"><b>N</b><i /><i /><i /></div><div className="mini-main"><div className="mini-orb" /><p>Come posso aiutarti?</p><span>Il tuo spazio intelligente, privato e connesso.</span><div className="mini-input" /></div></div></div></div>;
}
