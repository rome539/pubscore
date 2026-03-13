// sw.js — PubScore Service Worker

// Auto-version: update BUILD_TS at deploy time, or manually bump to bust cache
const BUILD_TS = '1741859679';
const CACHE_NAME = 'pubscore-' + BUILD_TS;

// App shell files to cache
const SHELL_FILES = [
  '/',
  '/index.html',
  '/apple-touch-icon.png',
  '/manifest.json'
];

// Google Fonts to cache on first use
const FONT_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

// ---------------------------------------------------------------
// Install — cache the app shell
// ---------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching app shell:', CACHE_NAME);
      return cache.addAll(SHELL_FILES);
    })
  );
  // Activate immediately, don't wait for old tabs to close
  self.skipWaiting();
});

// ---------------------------------------------------------------
// Activate — clean up ALL old caches
// ---------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME)
             .map((name) => {
               console.log('[SW] Deleting old cache:', name);
               return caches.delete(name);
             })
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ---------------------------------------------------------------
// Fetch — network first for app shell, cache first for fonts
// ---------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip WebSocket connections (relay traffic)
  if (url.protocol === 'wss:' || url.protocol === 'ws:') return;

  // API calls & CDN scripts — always network, never cache
  if (url.hostname === 'api.pubscore.space' ||
      url.hostname === 'esm.sh' ||
      url.hostname === 'unpkg.com' ||
      url.hostname === 'cdn.jsdelivr.net') {
    return;
  }

  // Google Fonts — cache first (they're immutable)
  if (FONT_ORIGINS.some(origin => event.request.url.startsWith(origin))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // App shell — network first, fall back to cache
  event.respondWith(
    fetch(event.request).then((response) => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // Offline — serve from cache
      return caches.match(event.request);
    })
  );
});
