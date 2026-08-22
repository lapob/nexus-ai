(() => {
  if (!("serviceWorker" in navigator)) return;
  const whenLoaded = (callback) => {
    if (document.readyState === "complete") callback();
    else window.addEventListener("load", callback, { once: true });
  };
  const isCanonicalProduction = location.protocol === "https:" && location.hostname === "nexusnxs.com";
  if (!isCanonicalProduction) {
    whenLoaded(async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const nexusRegistrations = registrations.filter((registration) =>
        [registration.active, registration.waiting, registration.installing]
          .some((worker) => worker?.scriptURL.endsWith("/sw.js")),
      );
      await Promise.all(nexusRegistrations.map((registration) => registration.unregister()));
      await globalThis.caches?.delete("nexusnxs-operational-v1");
    });
    return;
  }
  whenLoaded(() => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // The site remains fully usable when service workers are unavailable.
    });
  });
})();
