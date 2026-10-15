// Service worker: cache-first del shell + vendor. Subir VERSION al cambiar ficheros.
const VERSION = 'v7';
const CACHE = 'cnl-shell-' + VERSION;
const SHELL = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/ui.js', './js/icons.js','./js/router.js', './js/config.js', './js/schema.js',
  './js/store.js', './js/auth.js', './js/drive.js', './js/sheetdata.js', './js/preferencias.js',
  './js/domain/preferencias.js', './js/domain/erroresGoogle.js', './js/application/preferenciasService.js', './js/application/asistenteClub.js', './js/views/acceso.js', './js/views/primerospasos.js',
  './js/locales/acceso.es.js', './js/locales/acceso.en.js', './js/locales/acceso.it.js',
  './js/i18n.js', './js/locales/es.js', './js/locales/en.js', './js/locales/it.js', './js/views/tutorial.js',
  './js/views/inicio.js', './js/views/nadadores.js', './js/views/grupos.js',
  './js/views/entrenamientos.js', './js/views/asistencia.js', './js/views/cargas.js',
  './js/views/marcas.js', './js/views/banador.js', './js/views/comunicaciones.js',
  './js/views/club.js', './js/views/planificacion.js',
  './js/domain/cargas.js', './js/application/cargasService.js', './js/views/cargas-contenidos.js',
  './js/locales/cargas-tipos.es.js', './js/locales/cargas-tipos.en.js', './js/locales/cargas-tipos.it.js',
  './js/domain/planificacion.js', './js/application/planificacionService.js',
  './js/views/calendario.js', './js/domain/calendario.js', './js/application/calendarioService.js', './js/infrastructure/googleCalendar.js',
  './js/locales/calendario.es.js', './js/locales/calendario.en.js', './js/locales/calendario.it.js',
  './js/locales/planificacion.es.js', './js/locales/planificacion.en.js', './js/locales/planificacion.it.js',
  './js/locales/vistas-a.es.js', './js/locales/vistas-a.en.js', './js/locales/vistas-a.it.js',
  './js/locales/vistas-b.es.js', './js/locales/vistas-b.en.js', './js/locales/vistas-b.it.js',
  './js/locales/vistas-c.es.js', './js/locales/vistas-c.en.js', './js/locales/vistas-c.it.js',
  './js/views/entreno-editor.js', './js/views/entreno-acciones.js', './js/domain/entreno.js', './js/application/entrenoService.js', './js/infrastructure/pdfEntreno.js', './js/infrastructure/driveEntrenos.js',
  './js/locales/entreno.es.js', './js/locales/entreno.en.js', './js/locales/entreno.it.js',
  './vendor/xlsx.full.min.js', './vendor/jspdf.umd.min.js', './vendor/jspdf.plugin.autotable.min.js',
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
