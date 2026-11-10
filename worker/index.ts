/** Cloudflare Worker entry point for the NexusNXS public site. */
import handler from "./site-handler";
import { publicAiShell, publicAiManifest, publicAiServiceWorker } from "./public-ai-shell";
import publicRelease from "../app/data/public-release.json";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  AI_UPSTREAM?: { fetch(request: Request): Promise<Response> };
  NEXUSNXS_SITE_MODE?: "live" | "maintenance";
  CF_VERSION_METADATA?: {
    id: string;
    tag: string;
    timestamp: string;
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// #region Feed aggiornamenti automatici Preview
// L'app desktop interroga https://nexusnxs.com/updates/preview/*: distinta firmata Ed25519, firma e latest.yml
// sono serviti direttamente (il client rifiuta i redirect sulla parte fiduciaria e verifica firma, dimensione e
// SHA-256); installer e blockmap reindirizzano agli asset GitHub della stessa release, verificati via SHA-512.
const UPDATE_PREFIX = "/updates/preview/";
const UPDATE_REPOSITORY = "lapob/nexus-ai";
const UPDATE_METADATA = new Map([
  ["release-manifest.json", "application/json; charset=utf-8"],
  ["release-manifest.sig.json", "application/json; charset=utf-8"],
  ["latest.yml", "text/yaml; charset=utf-8"],
]);
const UPDATE_BINARY = /^NexusNXS-\d+\.\d+\.\d+-Setup\.exe(?:\.blockmap)?$/;
const MAX_UPDATE_METADATA_BYTES = 512 * 1024;

async function updateFeed(request: Request, url: URL, versionId?: string): Promise<Response> {
  const name = url.pathname.slice(UPDATE_PREFIX.length);
  const headers = new Headers({ "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload" });
  if (versionId) headers.set("X-NexusNXS-Worker-Version", versionId);
  const tag = String(publicRelease.tag || "");
  if ((request.method !== "GET" && request.method !== "HEAD") || !/^v\d+\.\d+\.\d+-preview\.\d+$/.test(tag)
    || !(UPDATE_METADATA.has(name) || UPDATE_BINARY.test(name))) {
    headers.set("Cache-Control", "no-store");
    return new Response(null, { status: 404, headers });
  }
  const source = `https://github.com/${UPDATE_REPOSITORY}/releases/download/${encodeURIComponent(tag)}/${name}`;
  if (UPDATE_BINARY.test(name)) {
    headers.set("Location", source);
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(null, { status: 302, headers });
  }
  try {
    const upstream = await fetch(source, { redirect: "follow", headers: { "User-Agent": "NexusNXS-update-feed" } });
    const length = Number(upstream.headers.get("content-length") || 0);
    if (!upstream.ok || length > MAX_UPDATE_METADATA_BYTES) throw new Error("feed");
    const body = await upstream.arrayBuffer();
    if (body.byteLength > MAX_UPDATE_METADATA_BYTES) throw new Error("feed");
    headers.set("Content-Type", UPDATE_METADATA.get(name)!);
    headers.set("Cache-Control", "public, max-age=300");
    return new Response(request.method === "HEAD" ? null : body, { status: 200, headers });
  } catch {
    headers.set("Cache-Control", "no-store");
    headers.set("Retry-After", "600");
    return new Response(null, { status: 503, headers });
  }
}
// #endregion

// #region Ospite dell'anteprima HTML eseguibile (stessa pagina del desktop: src/shared/sandbox-host.js su main)
// Incorniciato con sandbox="allow-scripts" (origine opaca) dalla web app; la CSP non concede alcuna rete.
const SANDBOX_PATH = "/sandbox/v1";
const SANDBOX_HOST_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Anteprima</title>
<style>html,body{margin:0;background:#fff;color:#111;font:15px system-ui,sans-serif}</style></head><body><script>
(function(){var done=false;addEventListener('message',function(event){
if(done||event.source!==parent||!event.data||event.data.type!=='nexus-sandbox-render'||typeof event.data.html!=='string')return;
done=true;document.open();document.write(event.data.html);document.close();});
parent.postMessage({type:'nexus-sandbox-ready'},'*');})();
</script></body></html>`;
const SANDBOX_POLICY = ["default-src 'none'", "script-src 'unsafe-inline' 'unsafe-eval'", "style-src 'unsafe-inline'",
  "img-src data: blob:", "font-src data:", "media-src data: blob:", "connect-src 'none'", "worker-src 'none'",
  "form-action 'none'", "base-uri 'none'", "object-src 'none'",
  "frame-ancestors https://ai.nexusnxs.com http://127.0.0.1:* http://localhost:*"].join("; ");

function sandboxHost(request: Request, versionId?: string): Response {
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": SANDBOX_POLICY, "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer", "Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex, nofollow",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Resource-Policy": "cross-origin", "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  });
  if (versionId) headers.set("X-NexusNXS-Worker-Version", versionId);
  if (request.method !== "GET" && request.method !== "HEAD") return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  return new Response(request.method === "HEAD" ? null : SANDBOX_HOST_HTML, { status: 200, headers });
}
// #endregion

const CANONICAL_HOSTNAME = "nexusnxs.com";
const AI_HOSTNAME = "ai.nexusnxs.com";
const NON_CANONICAL_PRODUCTION_HOSTNAMES = new Set([
  "www.nexusnxs.com",
]);

function createCspNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function contentSecurityPolicy(nonce: string): string {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; script-src-attr 'none'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`;
}

function aiUiContentSecurityPolicy(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; script-src-attr 'none'; style-src 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; media-src 'self' blob:; frame-src https://nexusnxs.com/sandbox/; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

function aiOfflineHtml(nonce: string): string {
  return publicAiShell.replace(/<(script|style)(?=[\s>])/g, `<$1 nonce="${nonce}"`);
}

function isAiNavigation(request: Request): boolean {
  return request.method === "GET" && (request.headers.get("accept") ?? "").includes("text/html");
}

function isUnavailableUpstream(response: Response): boolean {
  return response.status === 530 || response.status === 502 || response.status === 504;
}

function secureAiResponse(response: Response, versionId?: string, state = "online"): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  secured.headers.set("X-NexusNXS-Edge-State", state);
  if (versionId) secured.headers.set("X-NexusNXS-Worker-Version", versionId);
  return secured;
}

function aiUnavailableResponse(request: Request, nonce: string, versionId?: string): Response {
  const headers = new Headers({
    "Cache-Control": "no-store, max-age=0",
    "Retry-After": "8",
    "X-NexusNXS-State": "offline",
    "X-Robots-Tag": "noindex, nofollow",
  });
  if (isAiNavigation(request)) {
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set("Content-Security-Policy", aiUiContentSecurityPolicy(nonce));
    return secureAiResponse(new Response(aiOfflineHtml(nonce), { status: 503, headers }), versionId, "offline");
  }
  headers.set("Content-Type", "application/json; charset=utf-8");
  return secureAiResponse(new Response(JSON.stringify({ status: "offline", retryAfter: 8 }), { status: 503, headers }), versionId, "offline");
}

async function aiAsset(request: Request, env: Env, pathname: string): Promise<Response> {
  const mapped = pathname === "/inter-latin.woff2" ? "/fonts/inter-latin.woff2" : pathname;
  const assetUrl = new URL(request.url);
  assetUrl.hostname = CANONICAL_HOSTNAME;
  assetUrl.pathname = mapped;
  return env.ASSETS.fetch(new Request(assetUrl, request));
}

async function proxyAi(request: Request, env: Env, nonce: string): Promise<Response> {
  const url = new URL(request.url);
  if ((request.method === "GET" || request.method === "HEAD") && ["/service-worker.js", "/manifest.webmanifest"].includes(url.pathname)) {
    const worker = url.pathname === "/service-worker.js";
    return secureAiResponse(new Response(request.method === "HEAD" ? null : worker ? publicAiServiceWorker : publicAiManifest, {
      headers: { "Content-Type": worker ? "application/javascript; charset=utf-8" : "application/manifest+json; charset=utf-8",
        "Cache-Control": "no-cache", ...(worker ? { "Service-Worker-Allowed": "/" } : {}) },
    }), env.CF_VERSION_METADATA?.id);
  }
  // One canonical UI for cold loads, reloads and offline recovery. The local
  // server still owns API readiness, authentication and every inference request.
  if ((request.method === "GET" || request.method === "HEAD") && (url.pathname === "/" || url.pathname === "/index.html")) {
    return secureAiResponse(new Response(request.method === "HEAD" ? null : aiOfflineHtml(nonce), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store",
        "Content-Security-Policy": aiUiContentSecurityPolicy(nonce),
        // Live voice needs the microphone on this origin only, after the browser prompt.
        "Permissions-Policy": "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
    }), env.CF_VERSION_METADATA?.id, "shell");
  }
  if (request.method === "GET" && (url.pathname === "/nexus-icon.png" || url.pathname === "/inter-latin.woff2")) {
    return secureAiResponse(await aiAsset(request, env, url.pathname), env.CF_VERSION_METADATA?.id);
  }
  try {
    const response = env.AI_UPSTREAM ? await env.AI_UPSTREAM.fetch(request) : await fetch(request);
    if (isUnavailableUpstream(response)) return aiUnavailableResponse(request, nonce, env.CF_VERSION_METADATA?.id);
    return secureAiResponse(response, env.CF_VERSION_METADATA?.id);
  } catch {
    return aiUnavailableResponse(request, nonce, env.CF_VERSION_METADATA?.id);
  }
}

function requestWithSecurityPolicy(request: Request, nonce: string): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  headers.set("X-NexusNXS-CSP-Nonce", nonce);
  return new Request(request, { headers });
}

function secureResponse(response: Response, url: URL, nonce: string, versionId?: string): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("X-Content-Type-Options", "nosniff");
  secured.headers.set("X-Frame-Options", "DENY");
  secured.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  secured.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  secured.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  secured.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  secured.headers.set("Origin-Agent-Cluster", "?1");
  secured.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  secured.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  if (versionId) {
    secured.headers.set("X-NexusNXS-Worker-Version", versionId);
  }
  secured.headers.set("Content-Security-Policy", contentSecurityPolicy(nonce));
  if (url.pathname === "/sw.js") {
    secured.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    secured.headers.set("Service-Worker-Allowed", "/");
  }
  if (url.hostname.endsWith(".workers.dev")) {
    secured.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return secured;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const nonce = createCspNonce();

    if (url.hostname === AI_HOSTNAME) {
      return proxyAi(request, env, nonce);
    }

    if (url.hostname === CANONICAL_HOSTNAME && url.pathname === SANDBOX_PATH) {
      return sandboxHost(request, env.CF_VERSION_METADATA?.id);
    }

    if (url.hostname === CANONICAL_HOSTNAME && url.pathname.startsWith(UPDATE_PREFIX)) {
      return updateFeed(request, url, env.CF_VERSION_METADATA?.id);
    }

    if (NON_CANONICAL_PRODUCTION_HOSTNAMES.has(url.hostname)) {
      url.hostname = CANONICAL_HOSTNAME;
      url.protocol = "https:";
      return secureResponse(Response.redirect(url, 308), url, nonce, env.CF_VERSION_METADATA?.id);
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/android") {
      url.pathname = "/desktop"; url.search = "";
      return secureResponse(Response.redirect(url, 308), url, nonce, env.CF_VERSION_METADATA?.id);
    }

    const securedRequest = requestWithSecurityPolicy(request, nonce);

    const accept = request.headers.get("accept") ?? "";
    const isHtmlNavigation = request.method === "GET" && accept.includes("text/html");
    const isRscNavigation = request.method === "GET" && (accept.includes("text/x-component") || request.headers.has("rsc") || url.searchParams.has("_rsc"));
    const isPageNavigation = isHtmlNavigation || isRscNavigation;
    const isOperationalPath = url.pathname === "/status" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/.well-known/");
    if (env.NEXUSNXS_SITE_MODE === "maintenance" && isPageNavigation && !isOperationalPath && url.pathname !== "/maintenance") {
      const maintenanceUrl = new URL("/maintenance", request.url);
      const rendered = await handler.fetch(new Request(maintenanceUrl, securedRequest), env, ctx);
      const maintenance = new Response(rendered.body, { status: 503, headers: rendered.headers });
      maintenance.headers.set("Cache-Control", "no-store");
      maintenance.headers.set("Retry-After", "300");
      maintenance.headers.set("X-NexusNXS-State", "maintenance");
      maintenance.headers.set("X-Robots-Tag", "noindex, nofollow");
      return secureResponse(maintenance, url, nonce, env.CF_VERSION_METADATA?.id);
    }

    return secureResponse(await handler.fetch(securedRequest, env, ctx), url, nonce, env.CF_VERSION_METADATA?.id);
  },
};

export default worker;
