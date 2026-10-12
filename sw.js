/* Pokédex Mémoire hors connexion : tout est enregistré à la première ouverture, puis mis à jour en arrière-plan. */
const V = "pokedex-memoire-de12425fc6";
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./maskable-512.png", "./apple-touch-icon.png"];
const HDC = "pokedex-hd-b62f82d108"; // sprites HD : cache séparé, gardé d'une version à l'autre
const FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V)
    .then(c => Promise.all(CORE.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== HDC).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url), same = u.origin === location.origin;
  if (!same && !FONTS.test(r.url)) return;
  if (same && u.pathname.indexOf("/api/") === 0) return; // synchronisation : toujours le réseau, jamais le cache
  if (same && /\/(hd|sfx)\//.test(u.pathname)) { // sprites HD : cache d'abord, une seule fois
    e.respondWith(caches.open(HDC).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
    return;
  }
  // pages : on prend d'abord la version en ligne (mises à jour immédiates), la copie enregistrée sert hors connexion
  if (same && (r.mode === "navigate" || /\.html?$/.test(u.pathname) || u.pathname.endsWith("/"))) {
    e.respondWith(caches.open(V).then(async c => {
      try {
        const res = await Promise.race([fetch(r), new Promise((_, no) => setTimeout(no, 4000))]);
        if (res && res.ok && res.status === 200) c.put("./index.html", res.clone()); // une seule copie, quelle que soit l'adresse (?utm=…)
        return res;
      } catch (_) {
        return (await c.match(r, { ignoreSearch: true })) || (await c.match("./index.html")) || Response.error();
      }
    }));
    return;
  }
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(r, { ignoreSearch: same });
    const net = fetch(r).then(res => { if (res && (res.type === "opaque" || (res.ok && res.status === 200))) c.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (r.mode === "navigate") { const f = await c.match("./index.html"); if (f) return f; }
    return Response.error();
  }));
});
