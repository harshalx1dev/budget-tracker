// Service worker: installable app, an offline page, and offline quick-add.
// It only ever keeps (1) the offline page, (2) the quick-add page, which holds no personal data, and
// (3) hashed static assets. Account, ledger and plan pages are never cached.
const CACHE = "budget-v2";
const OFFLINE = "/offline.html";
const QUICK = "/app/quick";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(OFFLINE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build assets never change, so cache-first is safe and lets the quick-add page run offline.
  if (url.pathname.startsWith("/_next/static/")) {
    e.respondWith(caches.open(CACHE).then(async (c) => (await c.match(req)) ?? fetch(req).then((r) => { if (r.ok) c.put(req, r.clone()); return r; })));
    return;
  }

  if (req.mode === "navigate") {
    if (url.pathname === QUICK) {
      // Network first so it stays current; the last good copy opens when offline.
      e.respondWith(fetch(req).then((r) => { if (r.ok && !r.redirected) caches.open(CACHE).then((c) => c.put(QUICK, r.clone())); return r; }).catch(async () => (await caches.match(QUICK)) ?? caches.match(OFFLINE)));
    } else {
      e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    }
  }
});

// Bill reminders
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "budget", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(data.title || "budget", { body: data.body || "", icon: "/icon-192.png", badge: "/icon-192.png", data: { url: data.url || "/app/plan/commitments" }, tag: data.tag }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/app/plan/commitments", self.location.origin).pathname;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
