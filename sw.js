// Guarda la puerta en el celular para que abra sin internet. Cambiá VERSION al publicar cambios.
const VERSION = "kochos-puerta-16";
// El editor es el paso 2 de la puerta: sin estas piezas no puede armar el Kot sin internet.
// Las 446 miniaturas (16 MB) no se precargan: se guardan solas a medida que se miran (fetch de abajo).
const ARCHIVOS = ["./", "index.html", "estilo.css", "app.js", "kot.js", "kot-perfil.js", "kot-paquete.js", "manifest.webmanifest", "iconos/icono-192.png", "iconos/icono-512.png", "iconos/icono-180.png", "editor-kot/editor-kot.html", "editor-kot/kot-modelo.js", "editor-kot/kot.glb", "editor-kot/kot.json", "editor-kot/kot_animaciones.glb", "editor-kot/kot-trapo.js", "editor-kot/choques.js", "editor-kot/draco/draco_decoder.js", "editor-kot/draco/draco_wasm_wrapper.js", "editor-kot/draco/draco_decoder.wasm"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS.map((a) => new Request(a, { cache: "reload" })))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(caches.keys().then((claves) => Promise.all(claves.filter((c) => c !== VERSION).map((c) => caches.delete(c)))).then(() => self.clients.claim()));
});

// Primero la red (para tener lo último); si no hay, lo guardado.
// Lo propio se pide sin la caché del navegador: GitHub la deja 10 min y mezclaba archivos viejos con nuevos.
const propio = (pedido) => new URL(pedido.url).origin === self.location.origin;
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  const pedido = propio(evento.request) ? new Request(evento.request.url, { cache: "no-cache" }) : evento.request;
  evento.respondWith(
    fetch(pedido)
      .then((respuesta) => {
        const copia = respuesta.clone();
        caches.open(VERSION).then((cache) => cache.put(evento.request, copia));
        return respuesta;
      })
      .catch(() => caches.match(evento.request, { ignoreSearch: true })),
  );
});
