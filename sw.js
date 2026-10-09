// Офлайн-режим: оболочка приложения кладётся в кэш при установке,
// модели и остальное — при первом обращении.
const VERSION = 'v1';
const SHELL = `garderob-shell-${VERSION}`;
const HEAVY = 'garderob-models-v1';

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/catalog.js',
  'js/db.js',
  'js/ml.js',
  'js/ml-worker.js',
  'js/pipeline.js',
  'js/store.js',
  'js/ui.js',
  'js/views/add.js',
  'js/views/builder.js',
  'js/views/insights.js',
  'js/views/item.js',
  'js/views/outfits.js',
  'js/views/settings.js',
  'js/views/wardrobe.js',
  'fonts/sofia-sans-condensed-cyrillic-wght-normal.woff2',
  'fonts/sofia-sans-condensed-latin-wght-normal.woff2',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

// Большие файлы, которые не меняются между версиями приложения.
const isHeavy = (url) => url.pathname.includes('/models/') || url.pathname.includes('/vendor/');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('garderob-') && k !== SHELL && k !== HEAVY).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(HEAVY);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok && res.status === 200) cache.put(request, res.clone()).catch(() => {});
  return res;
}

// Сначала сеть (чтобы обновления приходили сразу), без сети — из кэша.
async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(request);
    if (res.ok && res.status === 200) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = (await cache.match(request, { ignoreSearch: true })) || (request.mode === 'navigate' ? await cache.match('index.html') : null);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(isHeavy(url) ? cacheFirst(request) : networkFirst(request));
});
