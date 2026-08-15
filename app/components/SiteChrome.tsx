"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setOnline(v.online === true)).catch(() => setOnline(false));
  }, []);
  return <header className="site-header">
    <a className="brand" href="/"><img className="brand-icon" src="/nexus-icon.png" alt="" /><span>NEXUS</span></a>
    <button className="mobile-toggle" onClick={() => setOpen(!open)} aria-label={open ? "Chiudi menu" : "Apri menu"}>{open ? <X /> : <Menu />}</button>
    <nav className={open ? "chrome-nav open" : "chrome-nav"} aria-label="Navigazione principale">
      <a href="/desktop">Desktop</a><a href="/android">Android</a><a href="/console">Console</a><a href="/security">Sicurezza</a><a href="/downloads">Download</a>
    </nav>
    <a className={`network-pill ${online === false ? "offline" : ""}`} href="/status"><i /> {online === null ? "VERIFICA RETE" : online ? "NEXUS NETWORK · ONLINE" : "STATO RETE"}</a>
  </header>;
}

export function SiteFooter() {
  return <footer className="premium-footer">
    <div className="footer-callout"><img src="/nexus-icon.png" alt="" /><h2>Un solo Nexus.<br /><em>Ovunque tu sia.</em></h2><a className="primary-button" href="/downloads">Esplora Nexus <ArrowUpRight size={15} /></a></div>
    <div className="footer-links"><div><strong>Prodotti</strong><a href="/desktop">Desktop</a><a href="/android">Android</a><a href="/console">Console</a></div><div><strong>Fiducia</strong><a href="/security">Trust Center</a><a href="/status">Stato servizi</a><a href="/downloads">Download verificati</a></div><div><strong>Nexus</strong><a href="mailto:hello@nexusnxs.com">Contatti</a><a href="https://github.com/lapob/nexus-ai">GitHub</a><a href="/security#privacy">Privacy</a></div></div>
    <div className="footer-bottom"><span>© 2026 NEXUS SOFTWARE STUDIO</span><span>PRIVACY-FIRST · MADE IN ITALY</span></div>
  </footer>;
}

export function ProductMockup({ type }: { type: "desktop" | "android" | "console" }) {
  return <div className={`product-mockup ${type}`} aria-hidden="true"><div className="mockup-glow" /><div className="device-frame"><div className="device-bar"><i /><i /><i /><span>NEXUS / {type.toUpperCase()}</span></div><div className="device-content"><div className="mini-sidebar"><b>N</b><i /><i /><i /></div><div className="mini-main"><div className="mini-orb" /><p>Come posso aiutarti?</p><span>Il tuo spazio intelligente, privato e connesso.</span><div className="mini-input" /></div></div></div></div>;
}
