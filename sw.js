// Service worker: cache-first del shell + vendor. Subir VERSION al cambiar ficheros.
const VERSION = 'v2';
const CACHE = 'cnl-shell-' + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/ui.js', './js/icons.js','./js/router.js', './js/config.js', './js/schema.js',
  './js/store.js', './js/auth.js', './js/drive.js', './js/sheetdata.js',
  './js/views/inicio.js', './js/views/nadadores.js', './js/views/grupos.js',
  './js/views/entrenamientos.js', './js/views/asistencia.js', './js/views/cargas.js',
  './js/views/marcas.js', './js/views/banador.js', './js/views/comunicaciones.js',
  './js/views/club.js', './js/views/mi-espacio.js',
  './vendor/xlsx.full.min.js',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  // Tolerante: un fichero que aún no exista no aborta la instalación
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.startsWith('cnl-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Google/Drive: siempre red
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    })
  );
});
