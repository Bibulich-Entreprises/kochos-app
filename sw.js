// Guarda la puerta en el celular para que abra sin internet. Cambiá VERSION al publicar cambios.
const VERSION = "kochos-puerta-1";
const ARCHIVOS = ["./", "index.html", "estilo.css", "app.js", "kot.js", "manifest.webmanifest", "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-180.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(caches.keys().then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c)))).then(() => self.clients.claim()));
});

// Primero la red (para tener lo último); si no hay, lo guardado.
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    fetch(evento.request)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true })),
  );
});
