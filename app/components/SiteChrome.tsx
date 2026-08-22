"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV_ITEMS } from "../lib/site-navigation";
import { HardNavigationLink } from "./HardNavigationLink";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [navigating, setNavigating] = useState(false);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/status", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((value) => setOnline(value.online === true))
      .catch((error: Error) => {
        if (error.name !== "AbortError") setOnline(false);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const background = [
      document.querySelector<HTMLElement>(".skip-link"),
      document.getElementById("site-content"),
      document.querySelector<HTMLElement>(".nexus-connectivity"),
    ].filter(Boolean) as HTMLElement[];

    background.forEach((element) => {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    });

    return () => background.forEach((element) => {
      element.removeAttribute("inert");
      element.removeAttribute("aria-hidden");
    });
  }, [open]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1025px)");
    const closeWhenDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setNavigating(false);
        setOpen(false);
      }
    };

    desktop.addEventListener("change", closeWhenDesktop);
    return () => desktop.removeEventListener("change", closeWhenDesktop);
  }, []);

  useEffect(() => {
    if (!open) return;
    const nav = navRef.current;
    const brand = document.querySelector<HTMLElement>(".nxs-brand");
    const links = Array.from(nav?.querySelectorAll<HTMLElement>("a") ?? []);
    const initialFocus = nav?.querySelector<HTMLElement>('[aria-current="page"]') ?? links[0];
    const focusFrame = requestAnimationFrame(() => initialFocus?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavigating(false);
        setOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [brand, toggleRef.current, ...links].filter(Boolean) as HTMLElement[];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const navigationItems = [
    ...PRIMARY_NAV_ITEMS,
    { href: "/downloads", label: "Download" },
  ] as const;
  const networkLabel = online === null ? "VERIFICA RETE" : online ? "NEXUSNXS · ONLINE" : "STATO RETE";

  return <header className={open ? "nxs-header is-menu-open" : "nxs-header"}>
    <HardNavigationLink className="nxs-brand" href="/" aria-label="NexusNXS, homepage" onClick={() => open && setNavigating(true)}>
      <Image className="nxs-brand__icon" src="/nexus-icon.png" alt="" width={48} height={48} priority unoptimized />
      <span>NEXUSNXS</span>
    </HardNavigationLink>

    <button
      ref={toggleRef}
      className="nxs-menu-toggle"
      type="button"
      onClick={() => {
        setNavigating(false);
        setOpen((current) => !current);
      }}
      aria-expanded={open}
      aria-controls="main-navigation"
      aria-label={open ? "Chiudi menu" : "Apri menu"}
    >
      <span aria-hidden="true">{open ? "CHIUDI" : "MENU"}</span>
      {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
    </button>

    <nav
      ref={navRef}
      id="main-navigation"
      className={`nxs-nav${open ? " is-open" : ""}${navigating ? " is-navigating" : ""}`}
      aria-label="Navigazione principale"
      aria-busy={navigating}
    >
      <div className="nxs-nav__intro" aria-hidden="true">
        <span>NAVIGAZIONE</span>
        <span>05 SEZIONI</span>
      </div>
      <div className="nxs-nav__links">
        {navigationItems.map(({ href, label }, index) => <HardNavigationLink
          className={href === "/downloads" ? "nxs-nav__link nxs-nav__link--download" : "nxs-nav__link"}
          key={href}
          href={href}
          onClick={() => setNavigating(true)}
          aria-current={pathname === href ? "page" : undefined}
        >
          <span className="nxs-nav__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span>{label}</span>
          <span className="nxs-nav__arrow" aria-hidden="true">↗</span>
        </HardNavigationLink>)}
      </div>
      <div className="nxs-nav__footer">
        <span className={online === false ? "nxs-nav__status is-offline" : "nxs-nav__status"} aria-live="polite"><i aria-hidden="true" />{navigating ? "APERTURA PAGINA" : networkLabel}</span>
        <span>AI PRIVATA · PROTETTA · CONNESSA</span>
      </div>
    </nav>

    <HardNavigationLink className={online === false ? "nxs-network is-offline" : "nxs-network"} href="/status">
      <i aria-hidden="true" /> {networkLabel}
    </HardNavigationLink>
  </header>;
}

export function SiteFooter() {
  return <footer className="premium-footer">
    <div className="footer-callout"><Image src="/nexus-icon.png" alt="Logo NexusNXS" width={72} height={72} unoptimized /><h2>Un solo NexusNXS.<br /><em>Ovunque tu sia.</em></h2><HardNavigationLink className="primary-button" href="/downloads">Esplora NexusNXS <ArrowUpRight size={15} /></HardNavigationLink></div>
    <div className="footer-links"><div><strong>Prodotti</strong><HardNavigationLink href="/desktop">NexusNXS per PC</HardNavigationLink><HardNavigationLink href="/android">NexusNXS per Android</HardNavigationLink><HardNavigationLink href="/downloads">Download verificati</HardNavigationLink></div><div><strong>Fiducia</strong><HardNavigationLink href="/security">Trust Center</HardNavigationLink><HardNavigationLink href="/status">Stato servizi</HardNavigationLink><a href="mailto:security@nexusnxs.com">Segnala una vulnerabilità</a></div><div><strong>Informazioni</strong><HardNavigationLink href="/privacy">Privacy</HardNavigationLink><HardNavigationLink href="/terms">Termini d’uso</HardNavigationLink><a href="mailto:hello@nexusnxs.com">Contatti</a></div></div>
    <div className="footer-bottom"><span>© 2026 NEXUSNXS</span><span>PRIVACY-FIRST · MADE IN ITALY</span></div>
  </footer>;
}

export function ProductMockup({ type }: { type: "desktop" | "android" }) {
  return <div className={`product-mockup ${type}`} aria-hidden="true"><div className="mockup-glow" /><div className="device-frame"><div className="device-bar"><i /><i /><i /><span>NEXUSNXS / {type.toUpperCase()}</span></div><div className="device-content"><div className="mini-sidebar"><b>N</b><i /><i /><i /></div><div className="mini-main"><div className="mini-orb"><i/><i/><i/><span/></div><small>NEXUSNXS CORE · PRONTO</small><p>Come posso aiutarti?</p><span>AI privata, protetta e connessa al Core.</span><div className="mini-input"><span>Chiedi a NexusNXS</span><i/></div></div></div></div></div>;
}
