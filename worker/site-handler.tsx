import { renderToReadableStream } from "react-dom/server.edge";
import { SiteDocument, isPagePath } from "../app/site-document";
import { checkNexusNxsAi } from "../app/lib/service-status";
import { GET as statusResponse } from "../app/api/status/route";
import { GET as securityResponse } from "../app/.well-known/security.txt/route";
import manifest from "../app/manifest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import type { SiteDocumentData } from "../app/lib/site-metadata";

interface AssetEnv { ASSETS: { fetch(request: Request): Promise<Response> } }
const methodNotAllowed = () => new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });

async function dispatch(request: Request, env: AssetEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method !== "GET" && request.method !== "HEAD") return methodNotAllowed();
  if (path !== "/" && path.endsWith("/") && !path.startsWith("/api/")) {
    url.pathname = path.replace(/\/+$/, "");
    return Response.redirect(url, 308);
  }
  if (path === "/pricing") { url.pathname = "/downloads"; return Response.redirect(url, 308); }
  if (path === "/api/status") return statusResponse();
  if (path === "/.well-known/security.txt") return securityResponse();
  if (path === "/manifest.webmanifest") return Response.json(manifest(), { headers: { "Content-Type": "application/manifest+json" } });
  if (path === "/robots.txt") {
    const value = robots();
    return new Response(`User-agent: ${value.rules.userAgent}\nAllow: ${value.rules.allow}\n${value.rules.disallow.map((entry) => `Disallow: ${entry}`).join("\n")}\nSitemap: ${value.sitemap}\nHost: ${value.host}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (path === "/sitemap.xml") {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemap().map((entry) => `<url><loc>${entry.url}</loc><changefreq>${entry.changeFrequency}</changefreq><priority>${entry.priority}</priority></url>`).join("")}</urlset>`, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
  }
  if (!isPagePath(path)) {
    const assetUrl = new URL(url);
    if (path === "/icon.png" || path === "/apple-icon.png") assetUrl.pathname = "/nexus-icon.png";
    const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
    if (asset.status !== 404) return asset;
    if (path.startsWith("/api/") || /\.[^/]+$/.test(path)) return new Response("Not found", { status: 404 });
  }
  const data: SiteDocumentData = { pathname: path, nonce: request.headers.get("x-nexusnxs-csp-nonce") ?? undefined, assets: __NEXUS_SITE_ASSETS__ };
  if (path === "/status") {
    const snapshot = await checkNexusNxsAi();
    data.status = { ...snapshot, checkedAt: snapshot.checkedAt.toISOString(), checkedAtLabel: snapshot.checkedAt.toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "medium" }) };
  }
  let failed = false;
  const render = async () => {
    const stream = await renderToReadableStream(<SiteDocument data={data} />, { nonce: data.nonce, onError() { failed = true; } });
    await stream.allReady;
    return stream;
  };
  let stream: ReadableStream;
  try {
    stream = await render();
    if (failed) throw new Error("SSR failed");
  } catch {
    failed = true;
    data.failed = true;
    try { stream = await render(); }
    catch { data.globalFailed = true; stream = await render(); }
  }
  const code = failed ? 500 : isPagePath(path) ? 200 : 404;
  return new Response(stream, { status: code, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...(code !== 200 ? { "X-Robots-Tag": "noindex" } : {}) } });
}

export default {
  async fetch(request: Request, env: AssetEnv, _ctx?: unknown): Promise<Response> {
    void _ctx;
    const response = await dispatch(request, env);
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
};
