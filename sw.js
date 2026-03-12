// sw.js — PubScore Service Worker
const CACHE_NAME = 'pubscore-v2';

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
      console.log('[SW] Caching app shell');
      return cache.addAll(SHELL_FILES);
    })
  );
  // Activate immediately, don't wait for old tabs to close
  self.skipWaiting();
});

// ---------------------------------------------------------------
// Activate — clean up old caches
// ---------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME)
             .map((name) => caches.delete(name))
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ---------------------------------------------------------------
// Fetch — serve from cache when possible
// ---------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip WebSocket connections (relay traffic)
  if (url.protocol === 'wss:' || url.protocol === 'ws:') return;

  // API calls — network first, no caching
  // We want fresh data from the PubScore API and relays
  if (url.hostname === 'api.pubscore.space' ||
      url.hostname === 'esm.sh' ||
      url.hostname === 'unpkg.com' ||
      url.hostname === 'cdn.jsdelivr.net') {
    return;
  }

  // Google Fonts — cache first (they never change)
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

  // App shell — cache first, fall back to network
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Serve from cache, but update in background
        fetch(event.request).then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      return fetch(event.request);
    })
  );
});
