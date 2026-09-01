/** Cloudflare Worker entry point for the NexusNXS public site. */
import handler from "vinext/server/app-router-entry";

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

function aiOfflineContentSecurityPolicy(nonce: string): string {
  return `default-src 'none'; script-src 'nonce-${nonce}'; script-src-attr 'none'; style-src 'nonce-${nonce}'; style-src-attr 'none'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
}

function aiOfflineHtml(nonce: string): string {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#020607"><meta name="color-scheme" content="dark"><title>NexusNXS AI · Riconnessione</title><link rel="icon" href="/nexus-icon.png"><style nonce="${nonce}">
@font-face{font-family:Nexus;src:url('/inter-latin.woff2') format('woff2');font-display:swap}*{box-sizing:border-box}html{color-scheme:dark;background:#020607;font-family:Nexus,Inter,system-ui,sans-serif}body{margin:0;min-height:100dvh;overflow:hidden;color:#dceaea;background:radial-gradient(circle at 50% 40%,rgba(36,146,149,.11),transparent 34%),#020607}button,a{font:inherit}button{-webkit-tap-highlight-color:transparent}.nx-shell{width:min(1180px,100%);min-height:100dvh;margin:auto;padding:max(22px,env(safe-area-inset-top)) clamp(20px,5vw,58px) max(22px,env(safe-area-inset-bottom));display:flex;flex-direction:column}.nx-top{min-width:0;display:flex;align-items:center;justify-content:space-between;gap:20px}.nx-brand{min-width:0;display:flex;align-items:center;gap:11px;color:#b8cdcd;font-size:.72rem;font-weight:650;letter-spacing:.22em;text-transform:uppercase}.nx-brand img{width:38px;height:38px;border-radius:12px;box-shadow:0 0 0 1px rgba(102,228,224,.12),0 12px 34px rgba(32,182,183,.12)}.nx-state{flex:0 0 auto;display:flex;align-items:center;gap:8px;color:#738a8b;font-size:.7rem}.nx-state:before{content:'';width:6px;height:6px;border-radius:50%;background:#667879;box-shadow:0 0 14px rgba(118,152,153,.28)}.nx-center{min-width:0;flex:1;display:grid;place-items:center;text-align:center}.nx-content{width:100%;max-width:690px;min-width:0;transform:translateY(-1.5vh)}.nx-continuum{position:relative;width:clamp(184px,25vw,260px);aspect-ratio:1;margin:0 auto 28px;display:grid;place-items:center}.nx-continuum:before,.nx-continuum:after,.nx-orbit{content:'';position:absolute;inset:12%;border:1px solid rgba(91,223,219,.12);border-radius:50%;animation:orbit 12s linear infinite}.nx-continuum:after{inset:27%;border-style:dotted;border-color:rgba(97,226,222,.22);animation-duration:8s;animation-direction:reverse}.nx-orbit{inset:0;border-color:rgba(73,178,179,.07);box-shadow:inset 0 0 46px rgba(37,173,174,.045);animation-duration:18s}.nx-core{position:relative;width:54px;height:54px;border-radius:50%;background:radial-gradient(circle at 38% 32%,#e9ffff 0 5%,#67efea 18%,#19aeb1 48%,#05282a 72%);box-shadow:0 0 0 9px rgba(81,226,222,.035),0 0 30px rgba(68,224,219,.42),0 0 80px rgba(39,174,177,.18);animation:breathe 3.8s ease-in-out infinite}.nx-eyebrow{margin:0 0 12px;color:#5f8586;font:600 .65rem ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.18em;text-transform:uppercase}h1{margin:0;max-width:100%;overflow-wrap:anywhere;text-wrap:balance;color:#e7f0f0;font-size:clamp(2rem,6vw,4rem);font-weight:420;letter-spacing:-.055em;line-height:.98}h1 span{color:#69dcda}.nx-copy{max-width:590px;margin:22px auto 0;overflow-wrap:anywhere;color:#789091;font-size:clamp(.92rem,1.6vw,1.04rem);line-height:1.68}.nx-reconnect{display:flex;align-items:center;justify-content:center;gap:11px;margin:28px auto 0}.nx-retry{min-height:46px;padding:0 19px;border:1px solid rgba(101,215,212,.19);border-radius:999px;color:#bfe5e4;background:rgba(26,73,75,.24);cursor:pointer;transition:transform .2s ease,border-color .2s ease,background .2s ease}.nx-retry:hover,.nx-retry:focus-visible{outline:0;transform:translateY(-1px);border-color:rgba(101,225,221,.38);background:rgba(34,101,103,.3)}.nx-countdown{min-width:92px;color:#557172;font:500 .66rem ui-monospace,SFMono-Regular,Consolas,monospace}.nx-foot{display:flex;justify-content:center;gap:8px;color:#405a5b;font-size:.64rem;text-align:center}.nx-foot a{color:#638889;text-underline-offset:3px}@keyframes orbit{to{transform:rotate(360deg)}}@keyframes breathe{50%{transform:scale(1.075);filter:brightness(1.12)}}@media(max-width:560px){.nx-shell{padding-inline:18px}.nx-brand{font-size:.64rem}.nx-brand img{width:34px;height:34px}.nx-state{font-size:.64rem}.nx-content{transform:translateY(-2vh)}.nx-continuum{margin-bottom:22px}.nx-copy{max-width:330px}.nx-reconnect{flex-direction:column}.nx-foot{font-size:.6rem}}@media(prefers-reduced-motion:reduce){.nx-continuum:before,.nx-continuum:after,.nx-orbit,.nx-core{animation:none}.nx-retry{transition:none}}
</style></head><body><main class="nx-shell"><header class="nx-top"><div class="nx-brand"><img src="/nexus-icon.png" alt=""><span>NexusNXS AI</span></div><div class="nx-state" role="status">Core offline</div></header><section class="nx-center"><div class="nx-content"><div class="nx-continuum" aria-hidden="true"><i class="nx-orbit"></i><i class="nx-core"></i></div><p class="nx-eyebrow">Riconnessione automatica</p><h1>Il Core sta <span>tornando online.</span></h1><p class="nx-copy">NexusNXS AI non è disponibile in questo momento. La memoria resta sul tuo dispositivo e la sessione riprenderà automaticamente senza perdere il contesto.</p><div class="nx-reconnect"><button class="nx-retry" id="retry" type="button">Riprova ora</button><span class="nx-countdown" id="countdown" aria-live="polite">Nuovo tentativo</span></div></div></section><footer class="nx-foot"><span>Nessun dato è stato inviato.</span><a href="https://nexusnxs.com/status">Stato del servizio</a></footer></main><script nonce="${nonce}">
(()=>{const button=document.getElementById('retry'),label=document.getElementById('countdown');let left=8,busy=false;async function probe(){if(busy)return;busy=true;label.textContent='Controllo…';try{const response=await fetch('/readyz',{cache:'no-store',headers:{accept:'application/json'}});if(response.ok){const data=await response.json().catch(()=>({}));if(data.status==='ready'){label.textContent='Core disponibile';location.reload();return}}}catch{}left=8;label.textContent='Nuovo tentativo tra 8 s';busy=false}button.addEventListener('click',probe);addEventListener('online',probe);setInterval(()=>{if(busy)return;left-=1;if(left<=0)probe();else label.textContent='Nuovo tentativo tra '+left+' s'},1000)})();
</script></body></html>`;
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
    headers.set("Content-Security-Policy", aiOfflineContentSecurityPolicy(nonce));
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
