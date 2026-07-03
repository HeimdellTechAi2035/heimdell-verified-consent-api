// Heimdell service worker — static app-shell cache only.
//
// This product stores consent certificates, bank details, and audit
// evidence. Never cache anything under /api/, /dashboard/, /v/, or
// /embed/ — those responses are personalized, auth-scoped, or
// single-use, and caching them would risk leaking data across
// sessions/devices. Only the static shell (_next/static, icons,
// manifests) is safe to cache.

const CACHE_NAME = "heimdell-shell-v1";
const OFFLINE_URL = "/offline.html";

const CACHEABLE_PREFIXES = ["/_next/static/", "/icons/"];

function isCacheableStaticAsset(pathname) {
  if (CACHEABLE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return pathname.endsWith(".webmanifest");
}

function isExcludedFromCaching(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/dashboard/") ||
    pathname.startsWith("/v/") ||
    pathname.startsWith("/embed/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.add(OFFLINE_URL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isExcludedFromCaching(url.pathname)) {
    // Explicit pass-through — never intercept auth-scoped or
    // consent-evidence-bearing routes.
    return;
  }

  if (isCacheableStaticAsset(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.ok) {
                cache.put(request, response.clone());
              }
              return response;
            })
        )
      )
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.open(CACHE_NAME).then((cache) => cache.match(OFFLINE_URL))
      )
    );
  }
});
