// Pedif Migration Service Worker
// Automatically claims clients, clears legacy static caches, and unregisters itself
// so coi-serviceworker handles Cross-Origin Isolation cleanly without conflicting cache loops.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key.startsWith('pedif-cache'))
            .map((key) => caches.delete(key))
        );
      })
      .then(() => self.registration.unregister())
      .then(() => self.clients.claim())
  );
});
