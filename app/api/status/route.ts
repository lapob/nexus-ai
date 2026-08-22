import { checkNexusNxsAi } from "../../lib/service-status";

export async function GET() {
  const status = await checkNexusNxsAi();
  return Response.json(
    { online: status.online, checkedAt: status.checkedAt.toISOString(), latencyMs: status.latencyMs },
    { status: status.online ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
