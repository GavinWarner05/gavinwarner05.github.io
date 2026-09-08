const CACHE_NAME = "nfl-sports-center-v2";
const APP_HOME = "/sports/";
const APP_SHELL = [
  APP_HOME,
  "/sports/scores/",
  "/sports/teams/",
  "/sports/manifest.webmanifest",
  "/sports/icons/icon.svg",
  "/sports/icons/icon-192.png",
  "/sports/icons/icon-512.png",
  "/sports/icons/apple-touch-icon.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(APP_SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key.startsWith("nfl-sports-center-") && key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(request, fallbackUrl) {
  return fetch(request).then(function (response) {
    if (response && response.ok) caches.open(CACHE_NAME).then(function (cache) { cache.put(request, response.clone()); });
    return response;
  }).catch(function () { return caches.match(request).then(function (cached) { return cached || (fallbackUrl ? caches.match(fallbackUrl) : Promise.reject(new Error("Offline"))); }); });
}

self.addEventListener("fetch", function (event) {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith("/sports/")) return;

  if (event.request.mode === "navigate" || url.pathname.endsWith(".json")) {
    event.respondWith(networkFirst(event.request, event.request.mode === "navigate" ? APP_HOME : null));
    return;
  }

  event.respondWith(caches.match(event.request).then(function (cached) {
    const update = fetch(event.request).then(function (response) {
      if (response && response.ok) caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, response.clone()); });
      return response;
    });
    return cached || update;
  }));
});

self.addEventListener("push", function (event) {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = { notification: { title: "NFL Sports Center", body: event.data ? event.data.text() : "You have a new update." } }; }
  const notification = payload.notification || payload;
  if (!notification.title) notification.title = "NFL Sports Center";
  const target = notification.navigate || notification.data?.url || APP_HOME;
  event.waitUntil(self.registration.showNotification(notification.title, {
    body: notification.body || "",
    icon: notification.icon || "/sports/icons/icon-192.png",
    badge: notification.badge || "/sports/icons/icon-192.png",
    tag: notification.tag,
    data: { url: target }
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const target = new URL(event.notification.data?.url || APP_HOME, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clients) {
    const existing = clients.find(function (client) { return client.url.startsWith(self.location.origin + APP_HOME); });
    if (existing) return existing.focus().then(function () { return existing.navigate(target); });
    return self.clients.openWindow(target);
  }));
});
