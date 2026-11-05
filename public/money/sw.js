/* Lifeline service worker (scope /money/). Makes the app installable and usable offline.
   - Page: network-first, cached copy used only when offline.
   - Hashed build files (/assets/...): cache-first (names change every deploy, so never stale).
   - No user data is ever stored here; it lives in the page's localStorage only. */
const VERSION = "lifeline-sw-v1";
const PAGE = "/money/";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([PAGE, "/money/manifest.webmanifest", "/icon-192.png"])).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("lifeline-") && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(PAGE, copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match(PAGE).then((r) => r || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } }))));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
  }
});

// Tapping a reminder notification opens the app.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    const open = list.find((c) => c.url.includes("/money/"));
    return open ? open.focus() : self.clients.openWindow("/money/#today");
  }));
});
