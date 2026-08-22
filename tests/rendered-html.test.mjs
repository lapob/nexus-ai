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
  assert.match(html, /AI LOCALE, PRIVATA, CONNESSA/);
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
  assert.match(layout, /NexusNXS — AI locale, privata e connessa/);
  assert.match(layout, /https:\/\/nexusnxs\.com/);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(layout, /<html lang="it">/);
  assert.match(packageJson, /cross-env WRANGLER_LOG_PATH=/);
  assert.match(chrome, /next\/image/);
  assert.match(chrome, /HardNavigationLink/);
  assert.doesNotMatch(`${layout}\n${chrome}`, /codex-preview|_sites-preview/i);
});

test("redirects every known production alias to nexusnxs.com", async () => {
  for (const hostname of [
    "www.nexusnxs.com",
    "nexus-software-studio.nexuspers.chatgpt.site",
    "nexus-ai-personale.nexuswork.chatgpt.site",
  ]) {
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
  const [chrome, navigationStyles, layout] = await Promise.all([
    readFile(new URL("../app/components/SiteChrome.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/navigation.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(chrome, /aria-expanded=\{open\}/);
  assert.match(chrome, /aria-controls="main-navigation"/);
  assert.match(chrome, /aria-busy=\{navigating\}/);
  assert.match(chrome, /event\.key === "Escape"/);
  assert.match(chrome, /setAttribute\("inert", ""\)/);
  assert.match(chrome, /const brand = document\.querySelector/);
  assert.match(chrome, /\[aria-current="page"\]/);
  assert.match(chrome, /matchMedia\("\(min-width: 1025px\)"\)/);
  assert.match(layout, /id="site-content"/);
  assert.match(layout, /<noscript>/);
  assert.match(layout, /Navigazione principale senza JavaScript/);
  assert.match(layout, /\.reveal\{opacity:1!important/);
  assert.match(navigationStyles, /@media \(max-width: 1024px\)/);
  assert.match(navigationStyles, /position: fixed;[\s\S]*inset: 0;[\s\S]*height: 100dvh/);
  assert.match(navigationStyles, /overflow-y: auto/);
  assert.match(navigationStyles, /env\(safe-area-inset-bottom\)/);
  assert.match(navigationStyles, /prefers-reduced-motion: reduce/);
});

test("renders NexusNXS-owned maintenance and not-found states", async () => {
  const [maintenance, missing] = await Promise.all([
    render("/maintenance"),
    render("/percorso-che-non-esiste"),
  ]);
  assert.equal(maintenance.status, 200);
  const maintenanceHtml = await maintenance.text();
  assert.match(maintenanceHtml, /data-nexus-state="maintenance"/);
  assert.match(maintenanceHtml, /WORK IN CORSO/);
  assert.match(maintenanceHtml, /Sto lavorando/);

  assert.equal(missing.status, 404);
  const missingHtml = await missing.text();
  assert.match(missingHtml, /data-nexus-state="not-found"/);
  assert.match(missingHtml, /NEXUSNXS · 404/);
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
  assert.match(component, /data-nexus-presence/);
  assert.match(runtime, /useEffect/);
  assert.match(offline, /Server NexusNXS[\s\S]*non raggiungibili/);
  assert.match(serviceWorker, /OFFLINE_RESOURCES/);
  assert.match(serviceWorker, /request\.mode !== "navigate"/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request/);
});

test("prevents service-worker staleness", async () => {
  const response = await fetchWorker("https://nexusnxs.com/sw.js", { headers: { accept: "text/javascript" } });
  assert.equal(response.headers.get("cache-control"), "no-cache, no-store, must-revalidate");
  assert.equal(response.headers.get("service-worker-allowed"), "/");

  const registration = await readFile(new URL("../public/register-sw.js", import.meta.url), "utf8");
  assert.match(registration, /hostname === "nexusnxs\.com"/);
  assert.match(registration, /getRegistrations\(\)/);
  assert.doesNotMatch(registration, /hostname === "localhost"/);
});
