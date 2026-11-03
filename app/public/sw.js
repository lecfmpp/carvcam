// Service worker for the installed build: caches every app file (list generated at build time,
// precache.json) so the app opens offline. The page (index.html) is network-first, so a new build
// shows up on the first reload; with no network it comes from the cache. The other files have a
// hash in their name and are served from the cache, with the network refreshing the copy behind the scenes.
const CACHE = "carvcam-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let files = ["./", "./index.html", "./carvcam-icon.svg"];
      try {
        files = await (await fetch("./precache.json", { cache: "no-store" })).json();
      } catch {
        /* in development there is no list: cache the basics */
      }
      await cache.addAll(files);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("./index.html", copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(req, { ignoreSearch: true })) || (await caches.match("./index.html")) || Response.error()),
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit || (req.mode === "navigate" ? cache.match("./index.html") : Response.error()));
      return hit || net;
    }),
  );
});
