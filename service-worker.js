const CACHE_NAME = "comptainf-pwa-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (url.pathname === "/share" && event.request.method === "POST") {
    event.respondWith((async () => {
      const request = event.request.clone();

      try {
        const formData = await request.formData();

        console.log("=== SHARE DEBUG SERVICE WORKER ===");

        for (const [key, value] of formData.entries()) {
          if (value instanceof File) {
            console.log(
              "FILE:",
              key,
              value.name,
              value.type,
              value.size
            );
          } else {
            console.log("FIELD:", key, value);
          }
        }
      } catch (err) {
        console.error("SHARE DEBUG ERROR:", err);
      }

      return fetch(event.request);
    })());

    return;
  }

  event.respondWith(fetch(event.request));
});