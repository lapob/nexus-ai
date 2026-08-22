"use client";

import { useEffect } from "react";

export function NexusPresenceRuntime() {
  useEffect(() => {
    if (document.querySelector('script[data-nexus-presence-runtime="true"]')) return;
    const script = document.createElement("script");
    script.src = "/nexus-presence.js";
    script.async = true;
    script.dataset.nexusPresenceRuntime = "true";
    document.body.append(script);
  }, []);

  return null;
}
