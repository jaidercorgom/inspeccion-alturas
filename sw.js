/* Service worker de "Fichas de revisión de equipos de alturas".
   Cada vez que cambies archivos de la app, sube el número de VERSION para que los celulares se actualicen. */
const VERSION = "2";
const CACHE = "revision-alturas-v" + VERSION;

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];
const EXTERNOS = [
  "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
  "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600&family=Barlow+Semi+Condensed:wght@500;600;700&display=swap"
];
const HOSTS_EXTERNOS = ["cdnjs.cloudflare.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    // Los recursos externos no bloquean la instalación si no hay señal en ese momento.
    await Promise.all(EXTERNOS.map(async function (url) {
      try {
        const res = await fetch(url);
        if (!res || !res.ok) return;
        await cache.put(url, res.clone());
        if (url.indexOf("fonts.googleapis.com") >= 0) {
          const css = await res.text();
          const archivos = (css.match(/url\((https:[^)]+)\)/g) || []).map(function (m) { return m.slice(4, -1); });
          await Promise.all(archivos.map(async function (f) {
            try { const r = await fetch(f); if (r && r.ok) await cache.put(f, r); } catch (e) { /* se guardará al primer uso */ }
          }));
        }
      } catch (e) { /* se guardará al primer uso */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    const claves = await caches.keys();
    await Promise.all(claves
      .filter(function (k) { return k.indexOf("revision-alturas-") === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

// La página: primero la red (para tener siempre la última versión) y, si no hay señal o tarda, la copia guardada.
async function paginaRedPrimero(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error("timeout")); }, 4000); })
    ]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return (await cache.match(req, { ignoreSearch: true })) ||
      (await cache.match("./index.html")) ||
      (await cache.match("./")) ||
      new Response("Sin conexión", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

// Archivos propios (íconos, manifest): primero la copia guardada.
async function cachePrimero(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

// Recursos externos (generador de PDF y tipografías): primero la copia guardada.
async function externoCachePrimero(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req.url, { ignoreVary: true });
  if (hit) return hit;
  try {
    const res = await fetch(req.url);
    if (res && res.ok) cache.put(req.url, res.clone());
    return res;
  } catch (e) {
    return fetch(req);
  }
}

self.addEventListener("fetch", function (event) {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate") { event.respondWith(paginaRedPrimero(req)); return; }
  if (url.origin === self.location.origin) { event.respondWith(cachePrimero(req)); return; }
  if (HOSTS_EXTERNOS.indexOf(url.hostname) >= 0) { event.respondWith(externoCachePrimero(req)); return; }
});
