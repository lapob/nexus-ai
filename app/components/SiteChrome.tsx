"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    fetch("/api/status", { cache: "no-store" }).then((r) => r.json()).then((v) => setOnline(v.online === true)).catch(() => setOnline(false));
  }, []);
  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const nav = navRef.current;
    const links = Array.from(nav?.querySelectorAll<HTMLElement>("a") ?? []);
    links[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [toggleRef.current, ...links].filter(Boolean) as HTMLElement[];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);
  const navItems = [
    ["/desktop", "PC"], ["/android", "Android"], ["/security", "Sicurezza"], ["/status", "Stato"],
  ] as const;
  return <header className="site-header">
    <Link className="brand" href="/" aria-label="NexusNXS, homepage"><Image className="brand-icon" src="/nexus-icon.png" alt="Logo NexusNXS" width={48} height={48} priority /><span>NEXUSNXS</span></Link>
    <button ref={toggleRef} className="mobile-toggle" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="main-navigation" aria-label={open ? "Chiudi menu" : "Apri menu"}>{open ? <X /> : <Menu />}</button>
    <nav ref={navRef} id="main-navigation" className={open ? "chrome-nav open" : "chrome-nav"} aria-label="Navigazione principale">
      {navItems.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)} aria-current={pathname===href?"page":undefined}>{label}</Link>)}
      <Link className="chrome-download" href="/downloads" onClick={()=>setOpen(false)} aria-current={pathname==="/downloads"?"page":undefined}>Download</Link>
    </nav>
    <Link className={`network-pill ${online === false ? "offline" : ""}`} href="/status"><i /> {online === null ? "VERIFICA RETE" : online ? "NEXUSNXS · ONLINE" : "STATO RETE"}</Link>
  </header>;
}

export function SiteFooter() {
  return <footer className="premium-footer">
    <div className="footer-callout"><Image src="/nexus-icon.png" alt="Logo NexusNXS" width={72} height={72} /><h2>Un solo NexusNXS.<br /><em>Ovunque tu sia.</em></h2><a className="primary-button" href="/downloads">Esplora NexusNXS <ArrowUpRight size={15} /></a></div>
    <div className="footer-links"><div><strong>Prodotti</strong><Link href="/desktop">NexusNXS per PC</Link><Link href="/android">NexusNXS per Android</Link><Link href="/downloads">Download verificati</Link></div><div><strong>Fiducia</strong><Link href="/security">Trust Center</Link><Link href="/status">Stato servizi</Link><a href="mailto:security@nexusnxs.com">Segnala una vulnerabilità</a></div><div><strong>Informazioni</strong><Link href="/privacy">Privacy</Link><Link href="/terms">Termini d’uso</Link><a href="mailto:hello@nexusnxs.com">Contatti</a></div></div>
    <div className="footer-bottom"><span>© 2026 NEXUSNXS</span><span>PRIVACY-FIRST · MADE IN ITALY</span></div>
  </footer>;
}

export function ProductMockup({ type }: { type: "desktop" | "android" }) {
  return <div className={`product-mockup ${type}`} aria-hidden="true"><div className="mockup-glow" /><div className="device-frame"><div className="device-bar"><i /><i /><i /><span>NEXUSNXS / {type.toUpperCase()}</span></div><div className="device-content"><div className="mini-sidebar"><b>N</b><i /><i /><i /></div><div className="mini-main"><div className="mini-orb"><i/><i/><i/><span/></div><small>NEXUSNXS CORE · PRONTO</small><p>Come posso aiutarti?</p><span>AI locale, privata e connessa alla tua istanza.</span><div className="mini-input"><span>Chiedi a NexusNXS</span><i/></div></div></div></div></div>;
}
