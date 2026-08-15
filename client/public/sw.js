/* Omni Reader offline app shell. User data itself stays in IndexedDB. */
const CACHE = "masar-shell-v4";
const APP_SHELL = new URL("./", self.registration.scope).href;
const SHELL = [APP_SHELL, new URL("manifest.webmanifest", self.registration.scope).href];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && new URL(event.request.url).origin === location.origin) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => caches.match(APP_SHELL))));
});
