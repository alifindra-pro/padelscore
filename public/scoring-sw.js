const CACHE = "padel-scoring-v2";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;
  if (
    !url.pathname.startsWith("/referee/v2/") &&
    !url.pathname.startsWith("/_next/static/") &&
    !url.pathname.startsWith("/fonts/")
  )
    return;
  // Only cache documents and static assets, never personalized API responses or RSC fetches.
  if (event.request.headers.get("RSC") === "1") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return (
          cached ||
          new Response(
            "Buka pertandingan ini sekali saat online sebelum menggunakannya offline.",
            { status: 503 },
          )
        );
      }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "CACHE_SCORING" || !Array.isArray(event.data.urls))
    return;
  const urls = event.data.urls.filter((value) => {
    try {
      const u = new URL(value, self.location.origin);
      return (
        u.origin === self.location.origin &&
        (u.pathname.startsWith("/referee/v2/") ||
          u.pathname.startsWith("/_next/static/"))
      );
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(urls.map((url) => cache.add(url)))),
  );
});
