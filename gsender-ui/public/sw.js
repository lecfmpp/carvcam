// Service worker da versão instalada: guarda todos os arquivos do app (lista gerada no build,
// precache.json) para abrir sem internet. A página (index.html) vem primeiro da rede, para um
// build novo aparecer no primeiro recarregamento; sem rede, vem do cache. Os demais arquivos têm
// hash no nome e saem do cache, com a rede atualizando a cópia por trás.
const CACHE = "carvcam-v3";

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      let files = ["./", "./index.html", "./carvcam-icon.svg"];
      try {
        files = await (await fetch("./precache.json", { cache: "no-store" })).json();
      } catch {
        /* em desenvolvimento não há lista: guarda o básico */
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
