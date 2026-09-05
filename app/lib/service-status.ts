import { NEXUSNXS_AI_READINESS_URL } from "./service-endpoints";

type NexusNxsAiStatus = {
  online: boolean;
  latencyMs: number | null;
  checkedAt: Date;
};

const STATUS_TTL_MS = 10_000;
let cachedStatus: NexusNxsAiStatus | null = null;
let cachedUntil = 0;
let pendingCheck: Promise<NexusNxsAiStatus> | null = null;

async function probeNexusNxsAi(): Promise<NexusNxsAiStatus> {
  const started = Date.now();
  const checkedAt = new Date();

  try {
    const response = await fetch(NEXUSNXS_AI_READINESS_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const data = response.ok ? await response.json() as { status?: string } : {};
    if (!response.ok) console.warn("NEXUSNXS_AI_HEALTH_CHECK_UNAVAILABLE", response.status);
    return {
      online: response.ok && data.status === "ready",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  } catch {
    console.warn("NEXUSNXS_AI_HEALTH_CHECK_FAILED");
    return { online: false, latencyMs: null, checkedAt };
  }
}

export async function checkNexusNxsAi(): Promise<NexusNxsAiStatus> {
  if (cachedStatus && Date.now() < cachedUntil) return cachedStatus;
  if (pendingCheck) return pendingCheck;

  pendingCheck = probeNexusNxsAi()
    .then((status) => {
      cachedStatus = status;
      cachedUntil = Date.now() + STATUS_TTL_MS;
      return status;
    })
    .finally(() => {
      pendingCheck = null;
    });

  return pendingCheck;
}
