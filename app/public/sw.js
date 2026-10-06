/* ServiceFlow service worker: app shell offline, network-first pages, cache-first assets, push. */
const VERSION = "sf-2.0.0";
const SHELL = ["/offline", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(caches.open(VERSION).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).then((r) => { caches.open(VERSION).then((c) => c.put(req, r.clone())); return r; }).catch(async () => (await caches.match(req)) ?? caches.match("/offline")));
  }
});
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "ServiceFlow", body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(data.title || "ServiceFlow", { body: data.body || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { href: data.href || "/" } }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => { const open = list.find((c) => "focus" in c); if (open) { open.navigate(href); return open.focus(); } return self.clients.openWindow(href); }));
});
