"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ArrowDownToLine, ArrowUpRight, BrainCircuit, CircleDollarSign, House, Monitor, ShieldCheck, Smartphone } from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV_ITEMS } from "../lib/site-navigation";
import { HardNavigationLink } from "./HardNavigationLink";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [navigating, setNavigating] = useState(false);
  const [chromeAwake, setChromeAwake] = useState(true);
  const pathname = usePathname();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/status", { cache: "no-store", keepalive: true })
      .then((response) => response.json())
      .then((value) => active && setOnline(value.online === true))
      .catch(() => active && setOnline(false));

    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-open", open);
    return () => document.body.classList.remove("menu-open");
  }, [open]);

  useEffect(() => {
    let timer = 0;
    const wake = () => {
      setChromeAwake(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!open) setChromeAwake(false);
      }, 4_200);
    };
    const events: Array<keyof WindowEventMap> = ["pointermove", "pointerdown", "keydown", "scroll"];
    events.forEach((event) => window.addEventListener(event, wake, { passive: true }));
    wake();
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, wake));
    };
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
    if (!open) return;
    const nav = navRef.current;
    const brand = document.querySelector<HTMLElement>(".nxs-floating-brand");
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
    { href: "/", label: "Home" },
    { href: "https://ai.nexusnxs.com", label: "NexusNXS AI" },
    ...PRIMARY_NAV_ITEMS,
    { href: "/downloads", label: "Download" },
  ] as const;
  const iconByHref = {
    "/": House,
    "https://ai.nexusnxs.com": BrainCircuit,
    "/desktop": Monitor,
    "/android": Smartphone,
    "/pricing": CircleDollarSign,
    "/security": ShieldCheck,
    "/status": Activity,
    "/downloads": ArrowDownToLine,
  } as const;
  const networkLabel = online === null ? "VERIFICA RETE" : online ? "NEXUSNXS · ONLINE" : "STATO RETE";

  return <>
    <HardNavigationLink className="nxs-floating-brand" data-awake={open || chromeAwake} href="/" aria-label="NexusNXS, homepage" onClick={() => open && setNavigating(true)}>
      <Image className="nxs-brand__icon" src="/nexus-icon.png" alt="" width={48} height={48} priority unoptimized />
    </HardNavigationLink>
    <button
      ref={toggleRef}
      className="nxs-menu-toggle"
      data-awake={open || chromeAwake}
      type="button"
      onClick={() => {
        setNavigating(false);
        setOpen((current) => !current);
      }}
      aria-expanded={open}
      aria-controls="main-navigation"
      aria-label={open ? "Chiudi navigazione" : "Apri navigazione"}
    >
      <span className="nxs-menu-glyph" aria-hidden="true"><i /><i /><i /></span>
    </button>
    <nav
    ref={navRef}
    id="main-navigation"
    className={`nxs-nav${open ? " is-open" : ""}${navigating ? " is-navigating" : ""}`}
    aria-label="Navigazione principale"
    aria-busy={navigating}
  >
    <div className="nxs-nav__links">
      {navigationItems.map(({ href, label }, index) => {
        const Icon = iconByHref[href];
        return <HardNavigationLink
          className={href === "/downloads" ? "nxs-nav__link nxs-nav__link--download" : "nxs-nav__link"}
          key={href}
          href={href}
          onClick={() => setNavigating(true)}
          aria-current={pathname === href ? "page" : undefined}
        >
          <span className="nxs-nav__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="nxs-nav__icon" aria-hidden="true"><Icon size={18} strokeWidth={1.65} /></span>
          <span className="nxs-nav__label">{label}</span>
          <span className="nxs-nav__arrow" aria-hidden="true">↗</span>
        </HardNavigationLink>;
      })}
    </div>
    <span className="nxs-nav__progress" aria-hidden="true"><i /></span>
    <div className="nxs-nav__footer">
      <span className={online === false ? "nxs-nav__status is-offline" : "nxs-nav__status"} aria-live="polite"><i aria-hidden="true" />{navigating ? "APERTURA PAGINA" : networkLabel}</span>
      <span>AI PRIVATA · PROTETTA · CONNESSA</span>
    </div>
    </nav>
  </>;
}

export function SiteFooter({ ctaHref = "https://ai.nexusnxs.com", ctaLabel = "Apri NexusNXS AI" }: { ctaHref?: string; ctaLabel?: string } = {}) {
  return <footer className="premium-footer">
    <div className="footer-callout"><Image src="/nexus-icon.png" alt="" width={72} height={72} unoptimized /><h2>Un solo NexusNXS.<br /><em>Ovunque tu sia.</em></h2><HardNavigationLink className="primary-button" href={ctaHref}>{ctaLabel} <ArrowUpRight size={15} /></HardNavigationLink></div>
    <div className="footer-links"><div><strong>Prodotti</strong><HardNavigationLink href="https://ai.nexusnxs.com">NexusNXS AI</HardNavigationLink><HardNavigationLink href="/desktop">NexusNXS per PC</HardNavigationLink><HardNavigationLink href="/android">NexusNXS per Android</HardNavigationLink><HardNavigationLink href="/downloads">Download verificati</HardNavigationLink></div><div><strong>Fiducia</strong><HardNavigationLink href="/security">Trust Center</HardNavigationLink><HardNavigationLink href="/status">Stato servizi</HardNavigationLink><a href="mailto:security@nexusnxs.com">Segnala una vulnerabilità</a></div><div><strong>Informazioni</strong><HardNavigationLink href="/pricing">Piani e Founder Beta</HardNavigationLink><HardNavigationLink href="/privacy">Privacy</HardNavigationLink><HardNavigationLink href="/terms">Termini d’uso</HardNavigationLink><a href="mailto:hello@nexusnxs.com">Contatti</a></div></div>
    <div className="footer-bottom"><span>© 2026 NEXUSNXS</span><span>PRIVACY-FIRST · MADE IN ITALY</span></div>
  </footer>;
}

export function ProductMockup({ type }: { type: "desktop" | "android" }) {
  const product = type === "desktop"
    ? {
        src: "/products/desktop-conversation.png",
        alt: "Interfaccia reale di NexusNXS per PC con una conversazione aperta",
        label: "APP PC REALE",
      }
    : {
        src: "/products/android-home.png",
        alt: "Interfaccia reale di NexusNXS per Android pronta per una nuova richiesta",
        label: "APP ANDROID REALE",
      };

  return <figure className={`product-mockup product-mockup--real ${type}`}>
    <div className="mockup-glow" aria-hidden="true" />
    <div className="device-frame">
      <div className="device-bar" aria-hidden="true"><i /><i /><i /><span>NEXUSNXS / {type.toUpperCase()}</span></div>
      <div className="product-screen">
        <Image src={product.src} alt={product.alt} fill sizes={type === "desktop" ? "(max-width: 900px) 92vw, 620px" : "(max-width: 900px) 50vw, 245px"} unoptimized />
      </div>
      <figcaption><i aria-hidden="true" />{product.label}</figcaption>
    </div>
  </figure>;
}
