export async function GET() {
  try {
    const response = await fetch("https://api.nexusnxs.com/healthz", { cache: "no-store", signal: AbortSignal.timeout(4000) });
    const data = response.ok ? await response.json() as { status?: string } : {};
    return Response.json({ online: response.ok && data.status === "ok", checkedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ online: false, checkedAt: new Date().toISOString() }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
