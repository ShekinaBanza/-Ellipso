// Ellipso service worker : jeu jouable hors connexion
const CACHE = "ellipso-v4";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/maskable-512.png", "./icons/favicon.svg"];
const FRESH = ["firebase-config.js", "admin.html"]; // toujours la dernière version quand on est en ligne
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
const netFirst = (req, key) => fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(key || req, cp)); } return r; }).catch(() => caches.match(key || req));
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  const fonts = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== self.location.origin && !fonts) return; // serveur Firebase et pubs : toujours le réseau
  if (req.mode === "navigate") { e.respondWith(netFirst(req, url.pathname.endsWith("admin.html") ? req : "./index.html")); return; }
  if (FRESH.some((f) => url.pathname.endsWith(f)) || url.pathname.includes("/ads/")) { e.respondWith(netFirst(req)); return; }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
    if (r.ok || r.type === "opaque") { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); }
    return r;
  })));
});
