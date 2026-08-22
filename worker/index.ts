/** Cloudflare Worker entry point for the NexusNXS public site. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
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

const CANONICAL_HOSTNAME = "nexusnxs.com";
const NON_CANONICAL_PRODUCTION_HOSTNAMES = new Set([
  "www.nexusnxs.com",
]);

function createCspNonce(): string {
  return crypto.randomUUID().replaceAll("-", "");
}

function contentSecurityPolicy(nonce: string): string {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}'; script-src-attr 'none'; style-src 'self' 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`;
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

    if (NON_CANONICAL_PRODUCTION_HOSTNAMES.has(url.hostname)) {
      url.hostname = CANONICAL_HOSTNAME;
      url.protocol = "https:";
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
