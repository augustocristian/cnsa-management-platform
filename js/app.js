// Arranque de la PWA: Configuración necesaria -> inicio de sesión con Google -> (primera vez) asistente de club -> shell.
// App de uso individual: todo se guarda en la carpeta 'cnl' del Drive del usuario (ver docs/ARCHITECTURE.md).
import { h, toast, isoDate } from './ui.js';
import * as ui from './ui.js';
import * as router from './router.js';
import { icon } from './icons.js';
import { t, tNav, langSelect, onLangChange, getLang, setLang } from './i18n.js';
import * as acceso from './views/acceso.js';
import { limpiarDatosLocales } from './cache.js';
import { pruebasPermitidas } from './infrastructure/entornoPruebas.js';
import * as theme from './theme.js';
import { variablesTema } from './domain/tema.js';

const DEFAULT_NAME = 'CNL Plataforma';
const DEFAULT_LEMA = '';
const TUTORIAL = 'tutorial';
const ELEGIR_CLUB = 'cnl:elegir'; // sessionStorage: forzar el selector de club tras "Cambiar de club"

// Menu: [route, label]. Individual use: every module is always available.
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

// ---------- Theme (club colour + light/dark) ----------
// The variables (--c-primary, --c-secondary, --c-action, --c-on-primary, --c-accent, --c-heading) are derived in
// domain/tema.js, which validates the colour and guarantees contrast >= 4.5:1. Recomputed when light/dark changes.
function applyTheme() {
  const club = store?.club || {};
  const modo = theme.effectiveTheme();
  const vars = variablesTema({ primario: club.colorPrimario, secundario: club.colorSecundario }, modo);
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', modo === 'dark' ? '#172233' : vars['--c-action']);
}

// The name and the motto may arrive with any type (number, object...) from a hand-edited file: they are always treated as text.
const texto = (x) => String(x ?? '').trim();
const clubName = () => texto(store?.club?.nombre) || DEFAULT_NAME;
const clubLema = () => texto(store?.club?.lema) || DEFAULT_LEMA;

function logoEl(size = 44) {
  const src = store?.club?.logo;
  if (src && /^data:image\//.test(src)) {
    // corrupt data: URL -> fall back to the default icon instead of showing a broken image
    return h('img', { class: 'logo', src, alt: '', width: size, height: size, onerror: (e) => { e.target.onerror = null; e.target.src = './icons/icon.svg'; } });
  }
  return h('img', { class: 'logo', src: './icons/icon.svg', alt: '', width: size, height: size });
}

// ---------- Módulos cargados dinámicamente ----------
// The Google simulator is only activated on localhost/127.0.0.1 (localStorage flag) or if the test runner injects
// window.__CNL_TEST__ (Playwright addInitScript): on a real domain a stale localStorage value never replaces Google.
const modoPruebas = () => pruebasPermitidas(window);

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

// Tutorial available without a session (the deployment owner needs it before being able to sign in)
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
    e && e.code === 'sesion-caducada' ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => reconectar().then((ok) => { if (ok) start(); }) }, t('dat.reconectar')) : null,
    h('button', { class: e && e.code === 'sesion-caducada' ? 'btn' : 'btn btn-primary', type: 'button', onclick: reintentar || (() => start()) }, t('shell.club.reintentar')),
    h('button', { class: 'btn', type: 'button', onclick: doLogout }, t('shell.salir')));
}

// Renews the Google session (MUST be called from a click: the browser blocks windows not opened from one). -> true if ok
async function reconectar() {
  try {
    await auth.reconectar();
    toast(t('dat.reconectado'));
    pintarAvisos();
    if (store?.clubRef) { store.sync().catch(() => {}); prefs?.flush().catch(() => {}); }
    return true;
  } catch (e) {
    toast.error(t('dat.reconectar-error', { msg: (e && e.message) || '' }));
    return false;
  }
}

const SALIDA_ESPERA_MS = 10000;
const espera = (ms) => new Promise((r) => { const id = setTimeout(r, ms); if (id && id.unref) id.unref(); });

// Unsynced changes: "download copy / discard / cancel". -> 'salir' | 'cancelar'
function dialogoSalidaConPendientes() {
  return new Promise((resolve) => {
    let decision = 'cancelar';
    ui.sheet({
      title: t('dat.logout.titulo'),
      body: h('p', null, t('dat.logout.texto')),
      onClose: () => resolve(decision),
      actions: [
        { label: t('dat.logout.cancelar'), autofocus: true },
        { label: t('dat.logout.descargar'), onClick: async () => { try { await store.exportXlsx(); } catch (e) { store.descargarCopia(); } return false; } },
        { label: t('dat.logout.descartar'), danger: true, onClick: () => { decision = 'salir'; } },
      ],
    });
  });
}

// Sign-out: uploads what is pending (with a deadline), warns if it could not, revokes the token and erases EVERY local mirror of personal data.
async function doLogout() {
  try {
    if (store?.clubRef && !store.soloLectura) {
      await Promise.race([store.sync().catch(() => {}), espera(SALIDA_ESPERA_MS)]);
      if (store.pendiente) {
        if ((await dialogoSalidaConPendientes()) !== 'salir') return;
      }
    }
  } catch (e) { console.warn('Cierre de sesión', e); }
  try {
    if (prefs) await Promise.race([prefs.flush(), espera(1500)]);
  } catch (e) { /* sin red: la caché se descarta igualmente */ }
  try { prefs?.desconectar(); } catch (e) { /* ignorar */ }
  try { auth.signOut(); } catch (e) { /* ignorar */ }
  try { drive?.reset?.(); } catch (e) { /* ignorar */ }
  try { store?.cerrar(); } catch (e) { /* ignorar */ }
  try { await limpiarDatosLocales(); } catch (e) { /* ignorar */ }
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
    if (e && (e.offline || e.code === 'sesion-caducada') && cache.length) clubes = cache.map((c) => ({ ...c, unverified: true })); // offline or expired session: known clubs
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
      theme.themeSelect(),
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
  pintarAvisos();
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
  if (store.problema) await pantallaProblema(); // damaged / emptied file: a decision is needed before continuing
  if (club && !store.soloLectura) store.setClub(club); // club recién creado con el asistente: identidad elegida
  try { (await import('./application/categoriasService.js')).crearCategoriasService(store).alAbrirClub(); } catch (e) { console.warn('Categorías', e); } // si cambió la temporada, recalcula las categorías
  prefs.set(CLAVES.ultimoClub, ref.id);
  if (club) prefs.set(CLAVES.clubes, [...prefs.get(CLAVES.clubes, []).filter((c) => c.id !== ref.id), { id: ref.id, name: ref.name }]); // espejo para abrirlo sin conexión
  fake?.despuesDeAbrirClub?.(store);
  try {
    renderShell();
    if (!started) {
      started = true;
      router.onChange(showView);
      store.on?.((evt) => {
        if (evt && ['solo-lectura', 'cache-error', 'cache-ok'].includes(evt.type)) pintarAvisos();
        if (evt && evt.type === 'cache-error') toast.error(t('dat.cache-llena'), 9000);
        if (evt && evt.type === 'problema') pantallaProblema().then(() => renderShell());
        if (document.getElementById('slot-header')) refreshHeader();
      });
      auth.onExpired?.(() => pintarAvisos());
      router.start({ silent: true });
    }
  } catch (e) {
    console.error(e);
    pantallaErrorShell(e);
    return false;
  }
  return true;
}

// ---------- Integrity notices (above the shell) ----------
const PRIVACIDAD = 'privacidadAceptada';
function injectAvisosStyle() {
  if (document.getElementById('cnl-avisos-style')) return;
  document.head.appendChild(h('style', { id: 'cnl-avisos-style' }, `
.cnl-avisos{display:grid;gap:8px;padding:8px 16px 0}
.cnl-aviso{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:10px 14px;border-radius:var(--r-md,12px);border:1px solid var(--border);background:var(--info-bg);color:var(--text)}
.cnl-aviso--warn{background:var(--warn-bg)}
.cnl-aviso--error{background:var(--danger-bg)}
.cnl-aviso p{margin:0;flex:1 1 260px}
.cnl-aviso .btn{min-height:40px}`));
}

function avisosActuales() {
  const out = [];
  if (store?.soloLectura) out.push({ tono: 'error', texto: t('dat.solo-lectura', { version: store.soloLectura.version }), boton: [t('dat.recargar'), () => location.reload()], id: 'solo-lectura' });
  if (auth?.caducada) out.push({ tono: 'warn', texto: t('dat.sesion-caducada'), boton: [t('dat.reconectar'), () => reconectar()], id: 'sesion-caducada' });
  if (store?.status === 'error' && store.lastError && store.lastError.code === 'cache-llena') out.push({ tono: 'error', texto: t('dat.cache-llena'), id: 'cache-llena' });
  const dup = store?.avisos?.length || 0;
  if (dup) out.push({ tono: 'warn', texto: t('dat.avisos-lectura', { n: dup }), id: 'avisos-lectura' });
  if (prefs && !prefs.get(PRIVACIDAD)) out.push({ tono: 'info', texto: t('dat.privacidad'), boton: [t('dat.entendido'), () => { prefs.set(PRIVACIDAD, true); pintarAvisos(); }], id: 'privacidad' });
  return out;
}

function pintarAvisos() {
  const root = $app();
  if (!root) return;
  root.querySelector(':scope > .cnl-avisos')?.remove();
  if (!document.getElementById('slot-header')) return; // only while the shell is open
  const lista = avisosActuales();
  if (!lista.length) return;
  injectAvisosStyle();
  root.prepend(h('div', { class: 'cnl-avisos', id: 'cnl-avisos' }, lista.map((a) =>
    h('div', { class: 'cnl-aviso cnl-aviso--' + a.tono, role: a.tono === 'info' ? 'status' : 'alert', dataset: { aviso: a.id } },
      h('p', null, a.texto),
      a.boton ? h('button', { type: 'button', class: 'btn', onclick: a.boton[1] }, a.boton[0]) : null))));
}

// ---------- Recovery screens ----------
// Failure while drawing the shell: nothing was touched; the user can retry or take a copy.
function pantallaErrorShell(e) {
  redraw = null;
  centerCard(h('h2', null, t('dat.error-shell-titulo')), h('p', null, t('dat.error-shell-texto')),
    h('p', { class: 'form-error', role: 'alert' }, (e && e.message) || String(e)),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => location.reload() }, t('dat.reintentar')),
    h('button', { class: 'btn', type: 'button', onclick: () => { try { store.descargarCopia(); } catch (err) { toast.error(err.message); } } }, t('dat.descargar-copia')),
    h('button', { class: 'btn', type: 'button', onclick: doLogout }, t('shell.salir')));
}

// Damaged or emptied club file: restore local copy / latest backup / open in Drive / start from scratch. -> resolves once fixed
function pantallaProblema() {
  return new Promise((resolve) => {
    const dibujar = () => {
      const p = store.problema;
      if (!p) { resolve(); return; }
      const ref = store.clubRef;
      const accion = async (nombre, confirmKey) => {
        if (nombre === 'copia-local' && !p.tieneCopiaLocal) { toast.error(t('dat.sin-local')); return; }
        if (nombre === 'backup' && !(await store.listarBackups().catch(() => [])).length) { toast.error(t('dat.sin-backup')); return; }
        if (!(await ui.confirmDialog(t(confirmKey), { okLabel: t('common.aceptar') }))) return;
        try { await store.resolverProblema(nombre); } catch (e) { toast.error((e && e.message) || String(e)); }
        dibujar();
      };
      centerCard(h('h2', null, t(p.tipo === 'danado' ? 'dat.danado.titulo' : 'dat.vacio.titulo')),
        h('p', { role: 'alert' }, t(p.tipo === 'danado' ? 'dat.danado.texto' : 'dat.vacio.texto')),
        p.mensaje && p.tipo === 'danado' ? h('p', { class: 'muted' }, p.mensaje) : null,
        h('button', { class: 'btn btn-primary', type: 'button', id: 'prob-local', onclick: () => accion('copia-local', 'dat.confirmar-local') }, t('dat.restaurar-local')),
        h('button', { class: 'btn', type: 'button', id: 'prob-backup', onclick: () => accion('backup', 'dat.confirmar-backup') }, t('dat.restaurar-backup')),
        h('a', { class: 'btn', id: 'prob-drive', href: drive.fileUrl(ref.id), target: '_blank', rel: 'noopener noreferrer' }, t('dat.abrir-drive')),
        h('button', { class: 'btn', type: 'button', id: 'prob-vacio', onclick: () => accion('vacio', 'dat.confirmar-vacio') }, t('dat.empezar-vacio')),
        p.tieneCopiaLocal ? h('button', { class: 'btn', type: 'button', onclick: () => store.descargarCopia() }, t('dat.descargar-copia')) : null,
        h('button', { class: 'btn', type: 'button', onclick: doLogout }, t('shell.salir')));
    };
    dibujar();
  });
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

// Skip link (index.html): moves focus to #view without touching the hash (the router uses the hash for routes)
function enlazarSaltar() {
  const a = document.querySelector('.skip-link');
  if (!a) return;
  const pintar = () => { a.textContent = t('ui.saltar'); };
  pintar();
  onLangChange(pintar);
  a.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('view')?.focus(); });
}

async function boot() {
  registerSW();
  enlazarSaltar();
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
    theme.enlazar(prefs, CLAVES);
    theme.onThemeChange(() => applyTheme());
    await auth.init();
  } catch (e) {
    console.error(e);
    $app().replaceChildren(h('div', { class: 'card auth-card' }, h('h2', null, t('shell.error-arranque')), h('p', { class: 'form-error' }, e.message || String(e))));
    return;
  }
  await start();
}

boot();
