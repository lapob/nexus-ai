"use client";

import { useEffect } from "react";

export function NexusPresenceRuntime() {
  useEffect(() => {
    let mounted = false;
    const mount = () => {
      if (mounted || document.querySelector('script[data-nexus-presence-runtime="true"]')) return;
      mounted = true;
      const script = document.createElement("script");
      script.src = "/nexus-presence.js";
      script.async = true;
      script.dataset.nexusPresenceRuntime = "true";
      document.body.append(script);
    };
    const observer = new MutationObserver(() => {
      if (!document.querySelector("[data-nexus-presence]")) return;
      observer.disconnect();
      mount();
    });

    if (document.querySelector("[data-nexus-presence]")) mount();
    else observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("offline", mount, { once: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("offline", mount);
    };
  }, []);

  return null;
}
