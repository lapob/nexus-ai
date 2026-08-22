import { NEXUSNXS_AI_HEALTH_URL } from "./service-endpoints";

export async function checkNexusNxsAi() {
  const started = Date.now();
  const checkedAt = new Date();

  try {
    const response = await fetch(NEXUSNXS_AI_HEALTH_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const data = response.ok ? await response.json() as { status?: string } : {};
    return {
      online: response.ok && data.status === "ok",
      latencyMs: Date.now() - started,
      checkedAt,
    };
  } catch {
    return { online: false, latencyMs: null, checkedAt };
  }
}
