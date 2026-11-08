/*! coi-serviceworker - Enhanced for Pedif 2.0 with Model Cache & Zero-Loop Guard */
const CACHE_NAME = 'pedif-cache-v2';
const MODEL_CACHE_NAME = 'pedif-models-v1';
let coepCredentialless = true;

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

    const url = new URL(r.url);

    // 1. Permanent offline caching for ONNX models
    if (url.pathname.includes('/models/') || url.pathname.endsWith('.onnx')) {
      event.respondWith(
        caches.open(MODEL_CACHE_NAME).then(async (cache) => {
          const cached = await cache.match(r);
          if (cached) return cached;
          const res = await fetch(r);
          if (res.ok) cache.put(r, res.clone());
          return res;
        })
      );
      return;
    }

    // 2. COOP/COEP headers for Cross-Origin Isolation (WebGPU / WASM SIMD / SharedArrayBuffer)
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
      }).catch((e) => {
        // Offline cache fallback for same-origin GET
        if (r.method === 'GET' && url.origin === self.location.origin) {
          return caches.match(r);
        }
      })
    );
  });
} else {
  (() => {
    // If already isolated, nothing to do!
    if (window.crossOriginIsolated) {
      window.sessionStorage.removeItem("coiReloadCount");
      return;
    }

    // Anti-loop protection: Never reload more than once
    const reloadCount = parseInt(window.sessionStorage.getItem("coiReloadCount") || "0", 10);
    if (reloadCount >= 1) {
      console.warn("[Pedif COI] Service worker already loaded once. Halting reload to avoid loop.");
      return;
    }

    const currentScript = document.currentScript;
    const n = navigator;
    if (n.serviceWorker) {
      const swUrl = currentScript ? currentScript.src : "coi-serviceworker.js";
      n.serviceWorker.register(swUrl).then(
        (registration) => {
          // If the registration is active and didn't control this page already, reload once
          if (registration.active && !n.serviceWorker.controller) {
            window.sessionStorage.setItem("coiReloadCount", "1");
            window.location.reload();
          } else {
            registration.addEventListener("updatefound", () => {
              const installing = registration.installing;
              if (installing) {
                installing.addEventListener("statechange", () => {
                  if (installing.state === "activated" && !window.crossOriginIsolated) {
                    window.sessionStorage.setItem("coiReloadCount", "1");
                    window.location.reload();
                  }
                });
              }
            });
          }
        },
        (err) => console.warn("[Pedif COI] Service Worker registration failed:", err)
      );
    }
  })();
}
