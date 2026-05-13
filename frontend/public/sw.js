/* Smart WorkLog AI - Service Worker (offline-capable PWA)
   v3 - 2026-02: fixed stale-bundle issue after redeploy by using network-first
   for HTML navigations and skipping hashed static assets (they're already
   immutable / cache-busted by Webpack at the URL level). */
const CACHE = "worklog-cache-v3";
const CORE = ["/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Never cache hashed static bundles — webpack already cache-busts them by URL.
  // Letting them go straight to network prevents the "old bundle hash not found"
  // → SPA fallback → MIME type=text/html bug after a redeploy.
  if (url.pathname.startsWith("/static/")) return;

  // Network-first for /api/* (keep data fresh; fall back to cache when offline)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Network-first for HTML / navigation requests — guarantees the latest
  // index.html (with the latest bundle hashes) on every visit when online.
  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/") || caches.match("/index.html"))
    );
    return;
  }

  // Everything else (icons, manifest, fonts) — cache-first
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req)
          .then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            return res;
          })
          .catch(() => caches.match("/index.html"))
    )
  );
});
