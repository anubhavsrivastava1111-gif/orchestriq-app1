/* OrchestrIQ service worker - makes the site installable as an Android app.
   SAFETY RULES (why this cannot leave users on an old version or leak data):
   1. Pages (navigations) are NETWORK-FIRST: online you always get the newest
      deployment; the cached copy is used only when offline.
   2. Only Vite's hashed build files (/assets/...) are cached long-term. Their
      names change on every deploy, so a stale file can never be served.
   3. Never touches /api/* (AI, NVIDIA, Jarvis), Supabase, or any other site:
      account data, keys and AI answers are never stored by this file.
   4. Bumping VERSION clears every older cache on the next visit.            */
const VERSION = "oiq-sw-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Supabase, fonts, AI providers: untouched
  if (url.pathname.startsWith("/api/")) return;              // AI and server functions: never cached

  if (req.mode === "navigate") {                             // pages: newest first, cache only offline
    event.respondWith(fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)).catch(() => {}); }
      return res;
    }).catch(() => caches.match("/").then((r) => r || new Response("You are offline. Reconnect and try again.", { status: 503, headers: { "Content-Type": "text/plain" } }))));
    return;
  }
  if (url.pathname.startsWith("/assets/")) {                 // hashed build files: cache-first, safe forever
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {}); }
      return res;
    })));
    return;
  }
  if (SHELL.includes(url.pathname)) {                        // icons and manifest: network, fall back to cache
    event.respondWith(fetch(req).catch(() => caches.match(req)));
  }
});
