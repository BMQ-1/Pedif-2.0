/*! coi-serviceworker v0.1.7 - Guido Zuidhof, licensed under MIT */
let coepCredentialless = false;
if (typeof window === 'undefined') {
  self.addEventListener("install", () => self.skipWaiting());
  self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

  self.addEventListener("message", (ev) => {
    if (!ev.data) return;
    if (ev.data.type === "deregister") {
      self.registration.unregister().then(() => self.clients.matchAll()).then(clients => {
        clients.forEach(client => client.navigate(client.url));
      });
    } else if (ev.data.type === "coepCredentialless") {
      coepCredentialless = ev.data.value;
    }
  });

  self.addEventListener("fetch", (event) => {
    const r = event.request;
    if (r.cache === "only-if-cached" && r.mode !== "same-origin") return;

    const request = (coepCredentialless && r.mode === "no-cors")
      ? new Request(r, { credentials: "omit" })
      : r;

    event.respondWith(
      fetch(request).then((response) => {
        if (response.status === 0) return response;

        const newHeaders = new Headers(response.headers);
        newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
        if (coepCredentialless) {
          newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
        } else {
          newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      }).catch((e) => console.error(e))
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
    window.sessionStorage.removeItem("coiReloadedBySelf");
    const coepDegrading = reloadedBySelf === "coepdegrade";

    // If already isolated, nothing to do!
    if (window.crossOriginIsolated) return;

    const currentScript = document.currentScript;
    const n = navigator;
    if (n.serviceWorker) {
      n.serviceWorker.register(currentScript ? currentScript.src : "coi-serviceworker.js").then(
        (registration) => {
          registration.addEventListener("updatefound", () => {
            window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
            window.location.reload();
          });

          // If the registration is active, reload if it didn't control this page already
          if (registration.active && !n.serviceWorker.controller) {
            window.sessionStorage.setItem("coiReloadedBySelf", "true");
            window.location.reload();
          }
        },
        (err) => console.error("COOP/COEP Service Worker failed to register:", err)
      );
    }
  })();
}
