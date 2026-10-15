// Arranque de la PWA: Configuración necesaria -> inicio de sesión con Google -> (primera vez) asistente de club -> shell.
// App de uso individual: todo se guarda en la carpeta 'cnl' del Drive del usuario (ver docs/ARCHITECTURE.md).
import { h, toast, isoDate } from './ui.js';
import * as ui from './ui.js';
import * as router from './router.js';
import { icon } from './icons.js';
import { t, tNav, langSelect, onLangChange, getLang, setLang } from './i18n.js';
import * as acceso from './views/acceso.js';

const DEFAULT_NAME = 'CNL Plataforma';
const DEFAULT_LEMA = '';
const TUTORIAL = 'tutorial';
const ELEGIR_CLUB = 'cnl:elegir'; // sessionStorage: forzar el selector de club tras "Cambiar de club"

// Menú: [ruta, etiqueta]. Usuario único: todos los módulos disponibles.
const MENU = [
  ['inicio', 'Inicio'],
  ['nadadores', 'Nadadores'],
  ['grupos', 'Grupos'],
  ['entrenamientos', 'Entrenamientos'],
  ['calendario', 'Calendario'],
  ['planificacion', 'Planificación'],
  ['asistencia', 'Asistencia'],
  ['cargas', 'Cargas'],
  ['marcas', 'Marcas'],
  ['banador', 'Bañador'],
  ['comunicaciones', 'Comunicaciones'],
  ['club', 'Configuración'],
  ['tutorial', 'Tutorial']
];

const $app = () => document.getElementById('app');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignorar */ } };

let store, auth, drive, config, prefs, CLAVES, fake;
let renderToken = 0;
let redraw = null; // repinta la pantalla previa al shell (login, asistente...) al cambiar de idioma
let langEl = null;
const langBox = () => (langEl ||= langSelect());

// ---------- Utilidades de color / tema ----------
function parseHex(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
const toHex = (a) => '#' + a.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

function applyTheme() {
  const club = store?.club || {};
  const p = parseHex(club.colorPrimario) || [26, 115, 232];
  const s = parseHex(club.colorSecundario) || [11, 61, 145];
  const root = document.documentElement.style;
  root.setProperty('--c-primary', toHex(p));
  root.setProperty('--c-secondary', toHex(s));
  root.setProperty('--c-primary-dark', toHex(mix(p, [0, 0, 0], 0.35)));
  root.setProperty('--c-primary-soft', toHex(mix(p, [255, 255, 255], 0.9)));
  root.setProperty('--c-primary-mid', toHex(mix(p, [255, 255, 255], 0.75)));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', toHex(p));
}

const clubName = () => (store?.club?.nombre || '').trim() || DEFAULT_NAME;
const clubLema = () => (store?.club?.lema || '').trim() || DEFAULT_LEMA;

function logoEl(size = 44) {
  const src = store?.club?.logo;
  if (src && /^data:image\//.test(src)) return h('img', { class: 'logo', src, alt: '', width: size, height: size });
  return h('img', { class: 'logo', src: './icons/icon.svg', alt: '', width: size, height: size });
}

// ---------- Módulos cargados dinámicamente ----------
const modoPruebas = () => {
  try { if (window.__CNL_TEST__) return true; } catch (e) { /* ignorar */ }
  return lsGet('cnl:test') === '1';
};

async function loadCore() {
  config = await import('./config.js');
  auth = (await import('./auth.js')).auth;
  store = (await import('./store.js')).store;
  drive = (await import('./drive.js')).drive;
  const p = await import('./preferencias.js');
  prefs = p.preferencias;
  CLAVES = p.CLAVES;
  // Herramienta de pruebas: sustituye a Google por un adaptador en memoria. Nunca se carga en uso normal.
  if (modoPruebas()) {
    const f = await import('./infrastructure/fakeGoogle.js');
    fake = f.instalarFakeGoogle({ auth, drive, config, opciones: f.leerOpciones() });
  }
}

// Idioma <-> preferencias del usuario (Drive). Antes de iniciar sesión el cambio queda en la caché y se sube al conectar.
function enlazarIdioma() {
  onLangChange((c) => { prefs.set(CLAVES.idioma, c); });
  prefs.on((e) => {
    if (e.tipo === 'cambio' && e.origen === 'remoto' && e.claves.includes(CLAVES.idioma)) {
      const l = prefs.get(CLAVES.idioma);
      if (l && l !== getLang()) setLang(l);
    }
  });
}

// ---------- Pantallas previas al shell ----------
function centerCard(...children) {
  const root = $app();
  root.replaceChildren(h('div', { class: 'auth-wrap' }, h('main', { class: 'card auth-card acc-card-wide' }, h('div', { class: 'auth-lang' }, langBox()), children)));
}

// Tutorial accesible sin sesión (el propietario lo necesita antes de poder iniciar sesión)
async function tutorialScreen() {
  redraw = tutorialScreen;
  const box = h('div', { class: 'card auth-card tutorial-standalone', style: { maxWidth: '860px' } });
  $app().replaceChildren(h('div', { class: 'auth-wrap' }, box));
  box.append(h('div', { class: 'auth-lang' }, langBox()),
    h('a', { class: 'btn btn-link', href: '#', onclick: (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); start(); } }, t('common.volver')));
  const holder = h('div');
  box.appendChild(holder);
  try {
    const mod = await import('./views/tutorial.js');
    await mod.render(holder, router.current().params, { store, auth, ui });
  } catch (e) { holder.replaceChildren(errorCard(e)); }
}
const wantsTutorialPreShell = () => router.current().name === TUTORIAL;

function configScreen() {
  redraw = configScreen;
  centerCard(acceso.configNecesaria({ auth, onListo: () => start() }));
}

function loginScreen() {
  redraw = loginScreen;
  centerCard(acceso.login({ auth, onSesion: () => start() }));
}

function errorScreen(tituloKey, e, { reintentar } = {}) {
  redraw = null;
  centerCard(h('h2', null, t(tituloKey)),
    e && (e.code || e.enlace) ? acceso.errorGoogle(e) : h('p', { class: 'form-error', role: 'alert' }, (e && e.message) || String(e)),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: reintentar || (() => start()) }, t('shell.club.reintentar')),
    h('button', { class: 'btn', type: 'button', onclick: doLogout }, t('shell.salir')));
}

// Cola de preferencias y cierre de sesión: intenta subir lo pendiente (máx. 1,5 s), revoca el token y limpia cachés.
async function doLogout() {
  try {
    if (prefs) await Promise.race([prefs.flush(), new Promise((r) => setTimeout(r, 1500))]);
  } catch (e) { /* sin red: la caché se descarta igualmente */ }
  try { prefs?.desconectar(); } catch (e) { /* ignorar */ }
  try { auth.signOut(); } catch (e) { /* ignorar */ }
  try { drive?.reset?.(); } catch (e) { /* ignorar */ }
  // Cachés de datos de clubes ya sincronizadas: fuera. Las que tienen cambios sin subir se conservan.
  try {
    for (const k of Object.keys(localStorage)) {
      if (!k.startsWith('cnl:club:')) continue;
      let dirty = false;
      try { dirty = !!JSON.parse(localStorage.getItem(k)).dirty; } catch (e) { /* corrupta */ }
      if (!dirty) localStorage.removeItem(k);
    }
    sessionStorage.removeItem(ELEGIR_CLUB);
  } catch (e) { /* ignorar */ }
  location.hash = '';
  location.reload();
}

// Primer arranque (o "Crear otro club"): asistente. -> {ref, club}
async function flujoCrearClub({ cancelar } = {}) {
  let creado = null;
  await acceso.asistente({
    mount: (kids) => centerCard(kids),
    redibujar: (fn) => { redraw = fn; },
    cancelar,
    crear: async (datos) => {
      const { crearClub } = await import('./application/asistenteClub.js');
      creado = await crearClub({ drive, datos });
    },
  });
  return creado;
}

function selectorClub(clubes) {
  return new Promise((resolve) => {
    const draw = () => centerCard(acceso.selector({
      clubes, email: auth.user?.email,
      onElegir: (c) => resolve({ ref: c }),
      onCrear: async () => { const r = await flujoCrearClub({ cancelar: () => { draw(); redraw = draw; } }); resolve(r); },
      onSalir: doLogout,
    }));
    redraw = draw;
    draw();
  });
}

// Con sesión: conecta las preferencias, localiza los clubes en Drive y decide qué mostrar. -> {ref, club?}
async function resolverClub() {
  redraw = null;
  centerCard(h('p', { class: 'muted', role: 'status' }, t('shell.club.cargando')));
  const conectando = prefs.conectar({ remoto: drive.preferencias, email: auth.user.email }).catch((e) => console.warn('Preferencias', e));
  let clubes;
  try {
    clubes = await drive.listClubs();
    prefs.set(CLAVES.clubes, clubes.map((c) => ({ id: c.id, name: c.name })));
  } catch (e) {
    const cache = prefs.get(CLAVES.clubes, []);
    if (e && e.offline && cache.length) clubes = cache.map((c) => ({ ...c, unverified: true })); // sin conexión: clubes conocidos
    else { await conectando; errorScreen('shell.club.error-lista', e); return null; }
  }
  await conectando;
  const forzar = (() => { try { return sessionStorage.getItem(ELEGIR_CLUB) === '1'; } catch (e) { return false; } })();
  if (!clubes.length) return flujoCrearClub(); // primera vez: asistente con el club vacío
  if (forzar) { try { sessionStorage.removeItem(ELEGIR_CLUB); } catch (e) { /* ignorar */ } return selectorClub(clubes); }
  const ultimo = prefs.get(CLAVES.ultimoClub);
  const hit = clubes.find((c) => c.id === ultimo);
  if (hit) return { ref: hit };
  if (clubes.length === 1) return { ref: clubes[0] };
  return selectorClub(clubes);
}

// ---------- Shell ----------
function navIcon(name) {
  return icon(name === 'club' ? 'ajustes' : name, { size: 22 });
}

function bellCount() {
  try {
    const lim = new Date(); lim.setDate(lim.getDate() - 7);
    const from = isoDate(lim);
    return store.list('Comunicaciones').filter((c) => String(c.fecha || '') >= from).length;
  } catch (e) { return 0; }
}

const statusLabel = (st) => (['sincronizado', 'pendiente', 'error', 'offline'].includes(st) ? t('shell.sync.' + st) : st);

function buildHeader() {
  const n = bellCount();
  const status = store.status || 'sincronizado';
  const email = auth.user?.email || '';
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, logoEl(48),
      h('div', { class: 'brand-text' }, h('div', { class: 'brand-name' }, clubName()), clubLema() ? h('div', { class: 'brand-lema' }, clubLema()) : null)),
    h('div', { class: 'top-actions' },
      langBox(),
      email ? h('div', { class: 'role-box', id: 'user-box' }, h('small', null, t('shell.sesion')), h('strong', { title: email }, email)) : null,
      h('button', {
        class: 'status-chip st-' + status, type: 'button', title: t('common.sincronizar'),
        onclick: async () => { try { await store.sync(); await prefs.flush(); toast(t('shell.sync-ok')); } catch (e) { toast(t('shell.sync-fallo')); } }
      }, h('span', { class: 'dot' }), h('span', { class: 'status-text' }, statusLabel(status))),
      h('button', { class: 'icon-btn bell', type: 'button', 'aria-label': t('shell.avisos', { n }), title: t('shell.avisos-titulo'), onclick: () => router.navigate('comunicaciones') },
        icon('campana', { size: 24 }),
        n > 0 ? h('span', { class: 'badge' }, n > 9 ? '9+' : n) : null),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('shell.salir'), title: email ? t('shell.salir-user', { email }) : t('shell.salir'), onclick: doLogout },
        icon('salir', { size: 24 }))));
}

function buildNav() {
  const cur = router.current().name;
  const links = MENU.map(([name]) =>
    h('a', { href: '#/' + name, class: 'nav-item' + (cur === name ? ' active' : ''), dataset: { route: name } }, navIcon(name), h('span', null, tNav(name))));
  return h('nav', { class: 'sidebar', 'aria-label': t('shell.menu') }, h('div', { class: 'nav-list' }, links));
}

function buildFooter() {
  return h('footer', { class: 'footer' }, t('shell.pie', { anio: new Date().getFullYear(), club: clubName(), lema: clubLema() }));
}

function renderShell() {
  redraw = null;
  applyTheme();
  const main = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  $app().replaceChildren(h('div', { class: 'shell' }, h('div', { id: 'slot-header' }), buildNav(), main, buildFooter()));
  refreshHeader();
  const { name } = router.current();
  if (!name || !MENU.some(([n]) => n === name)) history.replaceState(null, '', '#/inicio');
  showView(router.current());
}

function refreshHeader() {
  applyTheme();
  const slot = document.getElementById('slot-header');
  if (slot) slot.replaceChildren(buildHeader());
  const f = document.querySelector('.footer');
  if (f) f.replaceWith(buildFooter());
}

// ---------- Vistas ----------
async function showView({ name, params }) {
  const main = document.getElementById('view');
  if (!main) return;
  if (!MENU.some(([n]) => n === name)) { router.navigate('inicio'); return; }
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  const token = ++renderToken;
  main.replaceChildren(h('p', { class: 'muted loading' }, t('shell.cargando')));
  const url = `./views/${name}.js`;
  let mod;
  try {
    mod = await (router.getRoute(name)?.() ?? import(`./views/${name}.js`));
  } catch (e) {
    if (token !== renderToken) return;
    // Módulo inexistente -> Próximamente; otro fallo -> mensaje de error
    let missing = false;
    try { missing = !(await fetch(url, { method: 'HEAD' })).ok; } catch (e2) { missing = false; }
    main.replaceChildren(missing ? comingSoon(name) : errorCard(e));
    return;
  }
  if (token !== renderToken) return;
  try {
    const p = Object.assign([...params], { id: params[0] });
    main.replaceChildren();
    await mod.render(main, p, { store, auth, ui });
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (token === renderToken) main.replaceChildren(errorCard(e));
  }
}

function comingSoon(name) {
  const label = tNav(name);
  return h('div', { class: 'card soon' }, h('h2', null, label), h('p', null, t('common.proximamente')), h('p', { class: 'muted' }, t('shell.proximamente-desc')));
}
function errorCard(e) {
  return h('div', { class: 'card' }, h('h2', null, t('shell.error-vista')), h('p', { class: 'form-error' }, e?.message || String(e)));
}

// ---------- Instalación PWA ----------
function setupInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    // Preferencia sólo de este dispositivo (no es configuración del usuario): se queda en localStorage.
    if (lsGet('cnl:install-dismissed') === '1' || document.getElementById('install-banner')) return;
    const banner = h('div', { id: 'install-banner', class: 'install-banner' },
      h('span', null, t('shell.install.texto')),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: async () => { banner.remove(); deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; }
      }, t('shell.install.boton')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('shell.install.descartar'), onclick: () => { lsSet('cnl:install-dismissed', '1'); banner.remove(); } }, icon('cerrar', { size: 18 })));
    document.body.appendChild(banner);
  });
  window.addEventListener('appinstalled', () => document.getElementById('install-banner')?.remove());
}

function registerSW() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW', e));
  }
}

// ---------- Arranque ----------
let started = false;

async function abrirClub({ ref, club }) {
  redraw = null;
  centerCard(h('p', { class: 'muted', role: 'status' }, t('shell.club.abriendo')));
  try {
    await store.init(ref);
  } catch (e) {
    console.error(e);
    errorScreen('shell.club.error-abrir', e, { reintentar: () => location.reload() });
    return false;
  }
  if (club) store.setClub(club); // club recién creado con el asistente: identidad elegida
  prefs.set(CLAVES.ultimoClub, ref.id);
  if (club) prefs.set(CLAVES.clubes, [...prefs.get(CLAVES.clubes, []).filter((c) => c.id !== ref.id), { id: ref.id, name: ref.name }]); // espejo para abrirlo sin conexión
  fake?.despuesDeAbrirClub?.(store);
  renderShell();
  if (!started) {
    started = true;
    router.onChange(showView);
    store.on?.(() => { if (document.getElementById('slot-header')) refreshHeader(); });
    router.start({ silent: true });
  }
  return true;
}

async function start() {
  if (!auth.enabled) { // sin Client ID: pantalla de configuración (o tutorial)
    if (wantsTutorialPreShell()) tutorialScreen(); else configScreen();
    return;
  }
  if (!auth.user) { if (wantsTutorialPreShell()) tutorialScreen(); else loginScreen(); return; }
  const elegido = await resolverClub();
  if (!elegido) return;
  await abrirClub(elegido);
}

async function boot() {
  registerSW();
  setupInstall();
  onLangChange(() => {
    if (document.getElementById('slot-header')) renderShell(); // conserva la ruta actual
    else if (redraw) redraw();
  });
  window.addEventListener('hashchange', () => {
    if (document.getElementById('slot-header')) return;
    if (wantsTutorialPreShell()) { if (auth && !auth.user) tutorialScreen(); }
    else if (redraw === tutorialScreen) start();
  });
  try {
    await loadCore();
    enlazarIdioma();
    await auth.init();
  } catch (e) {
    console.error(e);
    $app().replaceChildren(h('div', { class: 'card auth-card' }, h('h2', null, t('shell.error-arranque')), h('p', { class: 'form-error' }, e.message || String(e))));
    return;
  }
  await start();
}

boot();
