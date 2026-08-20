export async function GET() {
  const started = Date.now();
  try {
    const response = await fetch("https://ai.nexusnxs.com/healthz", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const data = response.ok ? await response.json() as { status?: string } : {};
    return Response.json({ online: response.ok && data.status === "ok", checkedAt: new Date().toISOString(), latencyMs: Date.now() - started }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ online: false, checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
