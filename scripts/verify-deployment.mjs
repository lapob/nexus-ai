import assert from "node:assert/strict";

const input = process.argv[2] ?? process.env.NEXUSNXS_VERIFY_URL ?? "https://nexusnxs.com";
const baseUrl = new URL(input);
if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(baseUrl.hostname)) {
  throw new Error("Deployment verification requires HTTPS outside localhost.");
}

const request = async (pathname, options = {}) => fetch(new URL(pathname, baseUrl), {
  redirect: "manual",
  signal: AbortSignal.timeout(15_000),
  ...options,
});

const routeChecks = [
  ["/", 200, /NEXUSNXS/],
  ["/desktop", 200, /NEXUSNXS/],
  ["/android", 200, /NEXUSNXS/],
  ["/downloads", 200, /NEXUSNXS/],
  ["/security", 200, /NEXUSNXS/],
  ["/status", 200, /NEXUSNXS/],
  ["/privacy", 200, /NEXUSNXS/],
  ["/terms", 200, /NEXUSNXS/],
  ["/maintenance", 200, /data-nexus-state="maintenance"/],
  ["/offline.html", 200, /Server NexusNXS/],
  ["/.well-known/security.txt", 200, /security@nexusnxs\.com/],
  ["/robots.txt", 200, /Sitemap:/],
  ["/sitemap.xml", 200, /<urlset/],
  ["/percorso-che-non-esiste", 404, /NEXUSNXS · 404/],
];

for (const [pathname, status, expected] of routeChecks) {
  const response = await request(pathname, { headers: { accept: "text/html" } });
  assert.equal(response.status, status, `${pathname} returned ${response.status}`);
  assert.match(await response.text(), expected, `${pathname} returned unexpected content`);
}

const home = await request("/", { headers: { accept: "text/html" } });
const homeHtml = await home.text();
for (const href of ["/desktop", "/android", "/security", "/status", "/downloads"]) {
  assert.match(homeHtml, new RegExp(`href=["']${href}["']`), `navbar is missing ${href}`);
}
assert.equal(home.headers.get("x-content-type-options"), "nosniff");
assert.equal(home.headers.get("x-frame-options"), "DENY");
assert.match(home.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
assert.match(home.headers.get("strict-transport-security") ?? "", /max-age=/);

const serviceWorker = await request("/sw.js", { headers: { accept: "text/javascript" } });
assert.equal(serviceWorker.status, 200);
assert.equal(serviceWorker.headers.get("service-worker-allowed"), "/");
assert.match(serviceWorker.headers.get("cache-control") ?? "", /no-store/);

if (baseUrl.hostname.endsWith(".workers.dev")) {
  assert.equal(home.headers.get("x-robots-tag"), "noindex, nofollow");
}

if (baseUrl.hostname === "nexusnxs.com") {
  assert.equal(home.headers.get("x-robots-tag"), null);
  const www = await fetch("https://www.nexusnxs.com/downloads?source=release-check", {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(www.status, 308);
  assert.equal(www.headers.get("location"), "https://nexusnxs.com/downloads?source=release-check");

  const http = await fetch("http://nexusnxs.com/", {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok([301, 302, 307, 308].includes(http.status), `HTTP redirect returned ${http.status}`);
  assert.match(http.headers.get("location") ?? "", /^https:\/\/nexusnxs\.com\/?/);
}

const apiStatus = await request("/api/status", { headers: { accept: "application/json" } });
assert.ok([200, 503].includes(apiStatus.status), `/api/status returned ${apiStatus.status}`);
const statusBody = await apiStatus.json();
assert.equal(typeof statusBody.online, "boolean");
assert.equal(typeof statusBody.checkedAt, "string");

const aiHealth = await fetch("https://ai.nexusnxs.com/healthz", {
  headers: { accept: "application/json" },
  signal: AbortSignal.timeout(15_000),
});
assert.equal(aiHealth.status, 200, `ai.nexusnxs.com health returned ${aiHealth.status}`);
assert.equal((await aiHealth.json()).status, "ok");

console.log(`Deployment verified: ${baseUrl.origin} (${routeChecks.length} routes, navbar, headers, AI health)`);
