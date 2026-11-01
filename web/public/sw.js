/* Proboss Ludo service worker — PWA install + offline app shell.
 *
 * Strategy: the app is an SPA served from Cloudflare Pages, so the hashed
 * /assets/* bundle can be cached long-term while navigations always check the
 * network first (fresh React build) and fall back to the cached shell when
 * offline. API and socket calls are never cached or intercepted.
 */
const VERSION = "proboss-v1";
const SHELL = [
  "/",
  "/index.html",
  "/logo.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // keep API/socket traffic untouched
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;

  // navigations: network-first, stale shell as offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // static assets: cache-first, then fetch + store
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && (response.type === "basic" || response.type === "cors")) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
    )
  );
});