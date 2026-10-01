import { checkNexusNxsAi } from "../../lib/service-status";

export async function GET() {
  const status = await checkNexusNxsAi();
  return Response.json(
    { online: status.online, checkedAt: status.checkedAt.toISOString(), latencyMs: status.latencyMs },
    // This query succeeded even when AI is offline; readiness keeps its own 503.
    { headers: { "Cache-Control": "no-store" } },
  );
}
