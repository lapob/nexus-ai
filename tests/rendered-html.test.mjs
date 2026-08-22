import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function fetchWorker(url, { env = {}, headers = {} } = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${url}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(url, { headers: { accept: "text/html", ...headers } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, ...env },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

async function render(pathname = "/") {
  return fetchWorker(`http://localhost${pathname}`);
}

test("server-renders the NexusNXS public homepage", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="it">/i);
  assert.match(html, /NEXUSNXS/);
  assert.match(html, /La tua intelligenza/);
  assert.match(html, /AI PRIVATA, PROTETTA, CONNESSA/);
  assert.match(html, /STATI COMPRENSIBILI/);
  assert.match(html, /Trust Center/);
  assert.match(html, /NexusNXS per PC/);
  assert.match(html, /NexusNXS per Android/);
  assert.match(html, /application\/ld\+json/);
  assert.doesNotMatch(html, /codex-preview|starter loading skeleton|Your site is taking shape/i);
});

test("keeps production metadata and portable scripts", async () => {
  const [layout, packageJson, chrome] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/components/SiteChrome.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /NexusNXS — AI privata, protetta e connessa/);
  assert.match(layout, /https:\/\/nexusnxs\.com/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /<html lang="it">/);
  assert.match(packageJson, /cross-env WRANGLER_LOG_PATH=/);
  assert.match(chrome, /next\/image/);
  assert.match(chrome, /HardNavigationLink/);
  assert.doesNotMatch(`${layout}\n${chrome}`, /codex-preview|_sites-preview/i);
});

test("keeps public product claims aligned with the current client architecture", async () => {
  const [home, desktop, downloads, privacy, security] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/desktop/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/downloads/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/security/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(home, /AI PRIVATA, PROTETTA, CONNESSA/);
  assert.doesNotMatch(`${home}\n${desktop}`, /modelli eseguiti sulla tua macchina|AI locale completo/i);
  assert.match(downloads, /4 GB di spazio libero consigliati/);
  assert.match(privacy, /ultimi turni di contesto/);
  assert.match(privacy, /massimo di 24 ore/);
  assert.match(privacy, /non conserva il prompt completo/);
  assert.match(security, /Distribuzione controllata/);
  assert.doesNotMatch(security, /Artefatti firmati,[^\n]+con ogni release pubblica/);
});

test("redirects every known production alias to nexusnxs.com", async () => {
  for (const hostname of ["www.nexusnxs.com"]) {
    const response = await fetchWorker(`https://${hostname}/downloads?source=legacy`);
    assert.equal(response.status, 308);
    assert.equal(response.headers.get("location"), "https://nexusnxs.com/downloads?source=legacy");
  }
});

test("uses one semantic NexusNXS AI health check everywhere", async () => {
  const [endpoints, statusHelper, statusRoute, statusPage] = await Promise.all([
    readFile(new URL("../app/lib/service-endpoints.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/service-status.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/status/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/status/page.tsx", import.meta.url), "utf8"),
  ]);
  const publicStatusSources = `${endpoints}\n${statusHelper}\n${statusRoute}\n${statusPage}`;
  assert.match(endpoints, /https:\/\/ai\.nexusnxs\.com/);
  assert.match(endpoints, /\/healthz/);
  assert.doesNotMatch(publicStatusSources, /api\.nexusnxs\.com/i);
  assert.match(statusHelper, /NEXUSNXS_AI_HEALTH_URL/);
  assert.match(statusHelper, /STATUS_TTL_MS = 10_000/);
  assert.match(statusHelper, /if \(pendingCheck\) return pendingCheck/);
  assert.match(statusHelper, /data\.status === "ok"/);
  assert.match(statusRoute, /checkNexusNxsAi/);
  assert.match(statusPage, /checkNexusNxsAi/);
  assert.match(statusPage, /NON MONITORATO/);
});

test("renders every public route with one shared, complete navigation", async () => {
  const routes = ["/", "/desktop", "/android", "/downloads", "/security", "/status", "/privacy", "/terms"];
  const expectedNavigation = ["/desktop", "/android", "/security", "/status", "/downloads"];

  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, `${route} must render`);
    const html = await response.text();
    assert.equal((html.match(/id="main-navigation"/g) ?? []).length, 1, `${route} must have one navbar`);
    for (const href of expectedNavigation) {
      assert.match(html, new RegExp(`href="${href}"`), `${route} must link to ${href}`);
    }
  }
});

test("keeps the mobile navigation fullscreen, accessible, and tablet-safe", async () => {
  const [chrome, navigationStyles, layout, globalStyles] = await Promise.all([
    readFile(new URL("../app/components/SiteChrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(chrome, /aria-expanded=\{open\}/);
  assert.match(chrome, /aria-controls="main-navigation"/);
  assert.match(chrome, /aria-label=\{open \? "Chiudi navigazione" : "Apri navigazione"\}/);
  assert.match(chrome, /className="nxs-menu-glyph"/);
  assert.doesNotMatch(chrome, />\{open \? "CHIUDI" : "MENU"\}</);
  assert.match(chrome, /aria-busy=\{navigating\}/);
  assert.match(chrome, /event\.key === "Escape"/);
  assert.match(chrome, /setAttribute\("inert", ""\)/);
  assert.match(chrome, /const brand = document\.querySelector/);
  assert.match(chrome, /\[aria-current="page"\]/);
  assert.match(chrome, /matchMedia\("\(min-width: 1025px\)"\)/);
  assert.match(layout, /id="site-content"/);
  assert.match(layout, /href="#site-content"/);
  assert.match(layout, /id="site-content" tabIndex=\{-1\}/);
  assert.match(layout, /<noscript>/);
  assert.match(layout, /Navigazione principale senza JavaScript/);
  assert.match(layout, /href="\/noscript\.css"/);
  assert.doesNotMatch(layout, /<style>/);
  assert.match(navigationStyles, /@media \(max-width: 1024px\)/);
  assert.match(navigationStyles, /position: fixed;[\s\S]*inset: 0;[\s\S]*height: 100dvh/);
  assert.match(navigationStyles, /overflow-y: auto/);
  assert.match(navigationStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(navigationStyles, /width: 44px;[\s\S]*height: 44px;/);
  assert.match(navigationStyles, /\.nxs-menu-toggle\[aria-expanded="true"\]/);
  assert.match(navigationStyles, /font-size: clamp\(1\.3rem, 4\.8vw, 2\.1rem\)/);
  assert.match(navigationStyles, /prefers-reduced-motion: reduce/);
  assert.match(globalStyles, /--font-geist-mono:ui-monospace,SFMono-Regular,Consolas/);
  assert.match(globalStyles, /\.card-top,\.platform\{color:rgba\(176,210,214,\.60\)!important\}/);
  assert.match(globalStyles, /\.presence-grid small\{color:rgba\(176,210,214,\.60\)\}/);
  assert.match(globalStyles, /\.trust-hero > \*,[\s\S]*\.data-flow > \*[\s\S]*min-width: 0/);
  assert.match(globalStyles, /\.trust-hero h1,[\s\S]*\.data-flow h2[\s\S]*overflow-wrap: anywhere/);
  assert.match(globalStyles, /\.trust-seal \{[\s\S]*width: min\(100%, 18rem\)/);
});

test("renders NexusNXS-owned maintenance and not-found states", async () => {
  const [maintenance, missing] = await Promise.all([
    render("/maintenance"),
    render("/percorso-che-non-esiste"),
  ]);
  assert.equal(maintenance.status, 200);
  const maintenanceHtml = await maintenance.text();
  assert.match(maintenanceHtml, /data-nexus-state="maintenance"/);
  assert.match(maintenanceHtml, /aria-busy="false"/);
  assert.match(maintenanceHtml, /WORK IN CORSO/);
  assert.match(maintenanceHtml, /Sto lavorando/);

  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.match(missingHtml, /data-nexus-state="not-found"/);
  assert.match(missingHtml, /NEXUSNXS · 404/);
  assert.match(missingHtml, /<title>Pagina non trovata — NexusNXS<\/title>/);
  assert.match(missingHtml, /<meta name="robots" content="noindex"\s*\/?>/);
  assert.equal((missingHtml.match(/rel="canonical"/g) ?? []).length, 1);
  assert.match(missingHtml, /<link rel="canonical" href="https:\/\/nexusnxs\.com\/404"\s*\/?>/);
  assert.doesNotMatch(missingHtml, /<link rel="canonical" href="https:\/\/nexusnxs\.com\/"\s*\/?>/);
});

test("switches HTML navigations to maintenance without hiding operational routes", async () => {
  const maintenance = await fetchWorker("https://nexusnxs.com/downloads", {
    env: { NEXUSNXS_SITE_MODE: "maintenance" },
  });
  assert.equal(maintenance.status, 503);
  assert.equal(maintenance.headers.get("retry-after"), "300");
  assert.equal(maintenance.headers.get("cache-control"), "no-store");
  assert.equal(maintenance.headers.get("x-robots-tag"), "noindex, nofollow");
  assert.equal(maintenance.headers.get("x-nexusnxs-state"), "maintenance");
  assert.match(await maintenance.text(), /data-nexus-state="maintenance"/);

  const securityTxt = await fetchWorker("https://nexusnxs.com/.well-known/security.txt", {
    env: { NEXUSNXS_SITE_MODE: "maintenance" },
    headers: { accept: "text/plain" },
  });
  assert.equal(securityTxt.status, 200);

  const legacy = await fetchWorker("https://www.nexusnxs.com/downloads", {
    env: { NEXUSNXS_SITE_MODE: "maintenance" },
  });
  assert.equal(legacy.status, 308);
  assert.equal(legacy.headers.get("location"), "https://nexusnxs.com/downloads");
  assert.equal(legacy.headers.get("strict-transport-security"), "max-age=63072000; includeSubDomains; preload");
  assert.equal(legacy.headers.get("x-content-type-options"), "nosniff");
  assert.match(legacy.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

  const rscNavigation = await fetchWorker("https://nexusnxs.com/android?_rsc=maintenance-check", {
    env: { NEXUSNXS_SITE_MODE: "maintenance" },
    headers: { accept: "text/x-component", rsc: "1" },
  });
  assert.equal(rscNavigation.status, 503);
  assert.equal(rscNavigation.headers.get("x-nexusnxs-state"), "maintenance");
});

test("ports the deterministic NexusNXS presence and caches only its offline shell", async () => {
  const [presence, styles, offline, serviceWorker, component, runtime] = await Promise.all([
    readFile(new URL("../public/nexus-presence.js", import.meta.url), "utf8"),
    readFile(new URL("../public/nexus-operational.css", import.meta.url), "utf8"),
    readFile(new URL("../public/offline.html", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexusOperationalState.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/NexusPresenceRuntime.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(presence, /PARTICLE_COUNT = 104/);
  assert.match(presence, /javaRandom\(73\)/);
  assert.match(presence, /normalizedX \* 5\.2/);
  assert.match(presence, /particle\.y \* 7\.4/);
  for (const color of ["#4BE7E9", "#8EC8FF", "#F0CA68", "#657879", "#FF746C"]) {
    assert.match(presence, new RegExp(color, "i"));
  }
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /nexus-presence-orbit 5\.2s/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /font-size: clamp\(2rem, 10vw, 3\.25rem\)/);
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(component, /data-nexus-presence/);
  assert.match(runtime, /useEffect/);
  assert.match(offline, /Server NexusNXS[\s\S]*non raggiungibili/);
  assert.match(offline, /<body class="nexus-operational-body">/);
  assert.doesNotMatch(offline, /<body[^>]+style=/);
  assert.match(serviceWorker, /OFFLINE_RESOURCES/);
  assert.match(serviceWorker, /nexusnxs-operational-v2/);
  assert.match(serviceWorker, /request\.mode !== "navigate"/);
  assert.match(serviceWorker, /key\.startsWith\("nexusnxs-operational-"\)/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request/);
});

test("prevents service-worker staleness", async () => {
  const response = await fetchWorker("https://nexusnxs.com/sw.js", { headers: { accept: "text/javascript" } });
  assert.equal(response.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
  assert.equal(response.headers.get("service-worker-allowed"), "/");

  const registration = await readFile(new URL("../public/register-sw.js", import.meta.url), "utf8");
  assert.match(registration, /hostname === "nexusnxs\.com"/);
  assert.match(registration, /getRegistrations\(\)/);
  assert.match(registration, /key\.startsWith\("nexusnxs-operational-"\)/);
  assert.doesNotMatch(registration, /hostname === "localhost"/);
});

test("ships a restrictive content security policy", async () => {
  const response = await fetchWorker("https://nexusnxs.com/", { headers: { accept: "text/html" } });
  const policy = response.headers.get("content-security-policy") ?? "";
  for (const directive of [
    "script-src-attr 'none'",
    "style-src-attr 'none'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
  ]) {
    assert.match(policy, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(policy, /'unsafe-inline'/);
  const scriptNonce = policy.match(/script-src 'self' 'nonce-([^']+)'/)?.[1];
  const styleNonce = policy.match(/style-src 'self' 'nonce-([^']+)'/)?.[1];
  assert.ok(scriptNonce);
  assert.equal(styleNonce, scriptNonce);

  const html = await response.text();
  const executableTags = [...html.matchAll(/<(script|style)\b([^>]*)>/gi)];
  assert.ok(executableTags.length > 0);
  for (const [, tag, attributes] of executableTags) {
    assert.match(attributes, new RegExp(`\\bnonce="${scriptNonce}"`), `${tag} must carry the response nonce`);
  }
});

test("keeps Cloudflare previews out of search indexes", async () => {
  const response = await fetchWorker("https://candidate-nexusnxs-site.example.workers.dev/", {
    headers: { accept: "text/html" },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow");
});

test("proves the exact Cloudflare Worker version without claiming the AI hostname", async () => {
  const versionId = "01234567-89ab-cdef-0123-456789abcdef";
  const env = {
    CF_VERSION_METADATA: {
      id: versionId,
      tag: "site-test",
      timestamp: "2026-08-22T00:00:00.000Z",
    },
  };
  const apex = await fetchWorker("https://nexusnxs.com/", { env });
  assert.equal(apex.headers.get("x-nexusnxs-worker-version"), versionId);

  const www = await fetchWorker("https://www.nexusnxs.com/downloads", { env });
  assert.equal(www.status, 308);
  assert.equal(www.headers.get("x-nexusnxs-worker-version"), versionId);

  const ai = await fetchWorker("https://ai.nexusnxs.com/", { env });
  assert.notEqual(ai.status, 308);
  assert.equal(ai.headers.get("location"), null);
});
