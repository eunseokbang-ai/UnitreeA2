const CACHE_NAME = 'academy-app-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/db.js',
  './js/utils.js',
  './js/sms.js',
  './js/students.js',
  './js/attendance.js',
  './js/tuition.js',
  './js/progress.js',
  './js/dashboard.js',
  './js/settings.js',
  './js/router.js',
  './js/modal.js',
  './js/state.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// 네트워크 우선: 온라인이면 항상 최신 파일을 받아오고, 오프라인일 때만 캐시를 사용합니다.
// (배포한 새 버전이 기기에 바로 반영되도록 하기 위함)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
