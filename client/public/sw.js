/* Omni Reader offline app shell. User data itself stays in IndexedDB. */
const CACHE = "masar-shell-v8";
const APP_SHELL = new URL("./", self.registration.scope).href;
const SHELL = [APP_SHELL, new URL("manifest.webmanifest", self.registration.scope).href];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(Promise.all([
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  self.clients.claim(),
])));
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  const isAppShellNavigation = event.request.mode === "navigate" || url.href === APP_SHELL;
  if (isAppShellNavigation) {
    event.respondWith(fetch(event.request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(APP_SHELL, response.clone()));
      return response;
    }).catch(() => caches.match(APP_SHELL)));
    return;
  }
  const isSameOrigin = url.origin === location.origin;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && isSameOrigin) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => isSameOrigin ? caches.match(APP_SHELL) : Response.error()));
});
