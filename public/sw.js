const CACHE_NAME = "nexusnxs-operational-v1";
const OFFLINE_RESOURCES = [
  "/offline.html",
  "/nexus-operational.css",
  "/nexus-presence.js",
  "/nexus-icon.png",
  "/fonts/inter-latin.woff2",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_RESOURCES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("nexusnxs-operational-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && OFFLINE_RESOURCES.includes(url.pathname)) {
    event.respondWith(caches.match(request, { ignoreSearch: true }).then((cached) => cached || fetch(request)));
    return;
  }
  if (request.mode !== "navigate") return;

  const offlineResponse = async () => {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match("/offline.html", { ignoreSearch: true });
    if (!fallback) return new Response("NexusNXS non è raggiungibile", { status: 503 });
    const headers = new Headers(fallback.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-NexusNXS-State", "offline");
    return new Response(fallback.body, { status: 503, statusText: "Service Unavailable", headers });
  };

  event.respondWith(
    fetch(request)
      .then((response) => {
        const isMaintenance = response.headers.get("X-NexusNXS-State") === "maintenance";
        return [502, 503, 504].includes(response.status) && !isMaintenance ? offlineResponse() : response;
      })
      .catch(offlineResponse),
  );
});
