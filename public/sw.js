/**
 * Pedif 2.0 Unified Sovereign Service Worker
 * Handles:
 * 1. Cache-First static asset caching (app shell, WASM, fonts, CMaps)
 * 2. Dedicated permanent model cache for ONNX WebGPU/WASM weights
 * 3. Transparent Cross-Origin-Isolation (COOP/COEP) header injection
 * 4. 100% Sovereign Offline operation with zero external CDN dependency
 */

const CACHE_NAME = 'pedif-v2.0-core';
const MODEL_CACHE_NAME = 'pedif-v2.0-models';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './pedif-logo.svg',
  './coi-serviceworker.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Precache non-fatal warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME && key !== MODEL_CACHE_NAME && key.startsWith('pedif-')) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;

  const url = new URL(req.url);

  // 1. Permanent Model Cache for ONNX weights
  if (url.pathname.includes('/models/') || url.pathname.endsWith('.onnx')) {
    event.respondWith(
      caches.open(MODEL_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const netRes = await fetch(req);
        if (netRes.ok) cache.put(req, netRes.clone());
        return netRes;
      })
    );
    return;
  }

  // 2. Cache-First for static assets, WASM, CMaps, and Fonts
  const isStaticAsset = url.origin === self.location.origin && (
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/cmaps/') ||
    url.pathname.includes('/standard_fonts/') ||
    url.pathname.endsWith('.wasm') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  );

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      if (cachedResponse && isStaticAsset) {
        return addCoiHeaders(cachedResponse);
      }

      return fetch(req).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return addCoiHeaders(networkResponse);
        }

        const toCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(req, toCache);
        });

        return addCoiHeaders(networkResponse);
      }).catch(async () => {
        if (cachedResponse) return addCoiHeaders(cachedResponse);
        if (req.mode === 'navigate') {
          const fallback = await caches.match('./index.html');
          if (fallback) return addCoiHeaders(fallback);
        }
      });
    })
  );
});

function addCoiHeaders(response) {
  if (!response || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
