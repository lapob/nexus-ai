"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = [
  ".product-hero",
  ".trust-hero",
  ".download-hero",
  ".status-hero",
  ".legal-hero",
  ".product-facts > div",
  ".feature-grid > article",
  ".control-grid > article",
  ".release-list > article",
  ".service-list > div",
  ".verify-guide",
  ".report-band",
  ".release-notes > article",
  ".uptime-panel",
  ".footer-links > div",
].join(",");

export function SiteMotionRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    const runtime = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean; effectiveType?: string };
    };
    const saveData = runtime.connection?.saveData === true;
    const constrained = (runtime.hardwareConcurrency ?? 8) <= 4
      || (runtime.deviceMemory ?? 8) <= 4
      || /(^|-)2g$/.test(runtime.connection?.effectiveType ?? "");
    const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    let scrollFrame = 0;

    root.classList.add("nxs-motion-ready");
    if (saveData || constrained) root.classList.add("nxs-motion-lite");

    const revealObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).classList.add("nxs-in-view");
        revealObserver.unobserve(entry.target);
      }
    }, { rootMargin: "80px 0px -8%", threshold: 0.04 });
    revealTargets.forEach((target) => {
      if (target.getBoundingClientRect().top <= window.innerHeight * 1.04) {
        target.classList.add("nxs-in-view");
        return;
      }
      target.classList.add("nxs-motion-candidate");
      revealObserver.observe(target);
    });

    const updateScroll = () => {
      scrollFrame = 0;
      const available = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      root.style.setProperty("--nxs-scroll", String(Math.min(1, Math.max(0, window.scrollY / available))));
    };
    const onScroll = () => {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
    };

    updateScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      revealObserver.disconnect();
      cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", onScroll);
      root.classList.remove("nxs-motion-ready", "nxs-motion-lite");
      root.style.removeProperty("--nxs-scroll");
    };
  }, []);

  return null;
}
