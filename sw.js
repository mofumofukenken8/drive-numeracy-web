// オフラインでも開けるように、アプリ本体をキャッシュする(音声はIndexedDBに保存)
const CACHE = 'drive-drill-v2';
const FILES = [
  './', 'index.html', 'manifest.webmanifest', 'vendor/lame.min.js',
  'js/core.js', 'js/content-basic.js', 'js/content-biz.js', 'js/content-memory.js', 'js/content-listen-a.js', 'js/content-listen-b.js',
  'js/audio.js', 'js/gemini.js', 'js/store.js', 'js/compose.js', 'js/player.js', 'js/main.js',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// 同じサイトのファイルは「まずネット、だめならキャッシュ」。更新はすぐ届き、圏外でも開ける
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3500));
  e.respondWith(
    Promise.race([fetch(e.request), timeout])
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))),
  );
});
