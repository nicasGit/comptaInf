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
      try {
        const request = event.request.clone();
        const formData = await request.formData();

        let debug = "SHARE DEBUG\n\n";

        for (const [key, value] of formData.entries()) {
          if (value instanceof File) {
            debug += `FILE\n`;
            debug += `champ: ${key}\n`;
            debug += `nom: ${value.name}\n`;
            debug += `type: ${value.type}\n`;
            debug += `taille: ${value.size} octets\n`;
          } else {
            debug += `FIELD ${key}: ${value}\n`;
          }
        }

        if ([...formData.entries()].length === 0) {
          debug += "AUCUN CHAMP / AUCUN FICHIER RECU";
        }

        return new Response(
          `<html><body><pre style="font-size:18px;white-space:pre-wrap">${debug}</pre></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );

      } catch (err) {
        return new Response(
          `<html><body><pre>ERREUR DEBUG: ${String(err)}</pre></body></html>`,
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    })());

    return;
  }

  event.respondWith(fetch(event.request));
});