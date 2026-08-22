import type { ReactNode } from "react";
import Image from "next/image";

export type NexusPresenceState =
  | "online"
  | "loading"
  | "reconnecting"
  | "maintenance"
  | "degraded"
  | "offline"
  | "error"
  | "not-found";

const presenceLabels: Record<NexusPresenceState, string> = {
  online: "Pronto",
  loading: "Mi sto preparando",
  reconnecting: "Connessione ai server NexusNXS",
  maintenance: "Sto lavorando",
  degraded: "Servizio parziale",
  offline: "NexusNXS non è raggiungibile",
  error: "Controlliamo insieme",
  "not-found": "Contesto non trovato",
};

export function NexusPresence({
  state,
  compact = false,
  className = "",
}: {
  state: NexusPresenceState;
  compact?: boolean;
  className?: string;
}) {
  const classes = ["nexus-presence", compact ? "nexus-presence--compact" : "", className]
    .filter(Boolean)
    .join(" ");
  const phaseActive = state === "loading" || state === "reconnecting" || state === "maintenance";

  return (
    <div
      className={classes}
      data-nexus-presence
      data-state={state}
      role="img"
      aria-label={`Presenza NexusNXS · ${presenceLabels[state]}`}
    >
      <canvas aria-hidden="true" />
      <span className="nexus-presence__core" aria-hidden="true">
        <Image src="/nexus-icon.png" alt="" width={88} height={88} priority={state !== "online"} unoptimized />
      </span>
      <span className="nexus-presence__phase" aria-hidden="true">
        <i data-status={phaseActive ? "active" : undefined} />
        <i />
        <i />
        <i />
      </span>
    </div>
  );
}

export function NexusOperationalState({
  state,
  eyebrow,
  title,
  emphasis,
  description,
  children,
  urgent = false,
}: {
  state: NexusPresenceState;
  eyebrow: string;
  title: string;
  emphasis: string;
  description: string;
  children?: ReactNode;
  urgent?: boolean;
}) {
  return (
    <section
      className="nexus-operational"
      data-nexus-state={state}
      role={urgent ? "alert" : "status"}
      aria-live={urgent ? "assertive" : "polite"}
      aria-busy={state === "loading" || state === "reconnecting"}
    >
      <NexusPresence state={state} />
      <div className="nexus-operational__copy">
        <p className="nexus-operational__eyebrow"><i aria-hidden="true" /> {eyebrow}</p>
        <h1>{title}<br /><em>{emphasis}</em></h1>
        <p>{description}</p>
        {children ? <div className="nexus-operational__actions">{children}</div> : null}
      </div>
    </section>
  );
}
