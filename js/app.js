// Arranque de la PWA: login, selector de club, shell, tema y carga dinámica de vistas.
import { h, toast, isoDate } from './ui.js';
import * as ui from './ui.js';
import * as router from './router.js';

const LOCAL_KEY = 'cnl:local';
const CLUB_KEY = 'cnl:club';
const DEFAULT_NAME = 'Club Natación Lugones';
const DEFAULT_LEMA = 'Pequeño gran club';

const ROLE_LABEL = { admin: 'Administrador', entrenador: 'Entrenador', nadador: 'Nadador' };

// Iconos SVG (trazo) para el menú
const ICONS = {
  inicio: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  nadadores: 'M16 11a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 0112 0v1M18 14a5 5 0 014 5v2',
  grupos: 'M9 11a3 3 0 100-6 3 3 0 000 6zM17 11a3 3 0 100-6 3 3 0 000 6zM3 20v-1a5 5 0 0110 0v1M14 15a5 5 0 017 4v1',
  entrenamientos: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  asistencia: 'M9 12l2 2 4-4M5 4h14a1 1 0 011 1v15a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z',
  cargas: 'M3 20h18M6 20V12M11 20V6M16 20v-9M21 20V9',
  marcas: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3',
  banador: 'M7 3l-4 4 3 3 1-1v12h10V9l1 1 3-3-4-4a5 5 0 01-10 0z',
  comunicaciones: 'M4 5h16v11H9l-5 4V5z',
  club: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 00-2-1.2L14 3h-4l-.4 2.7a7 7 0 00-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 002 1.2L10 21h4l.4-2.7a7 7 0 002-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  'mi-espacio': 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0'
};

// Menú: [ruta, etiqueta, roles permitidos]
const MENU = [
  ['inicio', 'Inicio', ['admin', 'entrenador']],
  ['mi-espacio', 'Mi espacio', ['nadador']],
  ['nadadores', 'Nadadores', ['admin', 'entrenador']],
  ['grupos', 'Grupos', ['admin', 'entrenador']],
  ['entrenamientos', 'Entrenamientos', ['admin', 'entrenador']],
  ['asistencia', 'Asistencia', ['admin', 'entrenador']],
  ['cargas', 'Cargas', ['admin', 'entrenador']],
  ['marcas', 'Marcas', ['admin', 'entrenador']],
  ['banador', 'Bañador', ['admin', 'entrenador']],
  ['comunicaciones', 'Comunicaciones', ['admin', 'entrenador', 'nadador']],
  ['club', 'Configuración', ['admin']]
];

const $app = () => document.getElementById('app');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignorar */ } };

let store, auth, drive, config;
let realRole = 'admin';
let renderToken = 0;

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

// ---------- Módulos opcionales cargados dinámicamente ----------
async function loadCore() {
  try { config = await import('./config.js'); } catch (e) { config = {}; }
  const a = await import('./auth.js');
  auth = a.auth || a.default;
  const s = await import('./store.js');
  store = s.store || s.default;
  try { const d = await import('./drive.js'); drive = d.drive || d.default; } catch (e) { drive = null; }
}

// ---------- Pantallas previas al shell ----------
function centerCard(...children) {
  const root = $app();
  root.replaceChildren(h('div', { class: 'auth-wrap' }, h('div', { class: 'card auth-card' }, children)));
}

function loginScreen() {
  const enabled = !!auth.enabled;
  const err = h('p', { class: 'form-error', role: 'alert' });
  const btnLocal = h('button', {
    class: 'btn', type: 'button',
    onclick: () => { lsSet(LOCAL_KEY, '1'); start(); }
  }, 'Probar en modo local');
  const kids = [
    h('img', { class: 'logo-big', src: './icons/icon.svg', alt: '', width: 72, height: 72 }),
    h('h1', null, 'CNL Plataforma'),
    h('p', { class: 'muted' }, 'Gestión de tu club de natación')
  ];
  if (enabled) {
    kids.push(h('button', {
      class: 'btn btn-primary btn-lg', type: 'button',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        err.textContent = '';
        try { await auth.signIn(); lsSet(LOCAL_KEY, null); start(); }
        catch (ex) { err.textContent = 'No se pudo iniciar sesión: ' + (ex.message || ex); e.currentTarget.disabled = false; }
      }
    }, h('span', { class: 'g-mark' }, 'G'), 'Iniciar sesión con Google'));
  } else {
    kids.push(h('p', { class: 'hint' }, 'Google no está configurado (sin Client ID): puedes usar el modo local.'));
  }
  kids.push(btnLocal, err,
    h('p', { class: 'hint' }, 'El modo local guarda los datos sólo en este dispositivo; puedes importar y exportar Excel.'));
  centerCard(kids);
}

async function clubSelector() {
  centerCard(h('p', { class: 'muted' }, 'Cargando clubes…'));
  let clubs = [];
  try { clubs = await drive.listClubs(); }
  catch (e) {
    centerCard(h('h2', null, 'No se pudieron cargar los clubes'), h('p', { class: 'form-error' }, e.message || String(e)),
      h('button', { class: 'btn btn-primary', onclick: () => start() }, 'Reintentar'),
      h('button', { class: 'btn', onclick: doLogout }, 'Salir'));
    return new Promise(() => {});
  }
  // Auto-selección del último club usado
  const last = lsGet(CLUB_KEY);
  const hit = clubs.find((c) => c.id === last);
  if (hit && !clubSelector.forceChoose) return hit;

  return new Promise((resolve) => {
    const nameInput = h('input', { type: 'text', placeholder: 'Nombre del nuevo club', maxlength: 60 });
    const err = h('p', { class: 'form-error', role: 'alert' });
    const list = h('div', { class: 'club-list' }, clubs.length
      ? clubs.map((c) => h('button', { class: 'club-item', type: 'button', onclick: () => resolve(c) },
        h('strong', null, c.name), h('small', null, c.modified ? 'Modificado ' + ui.fmtDate(c.modified) : '')))
      : h('p', { class: 'muted' }, 'Aún no tienes ningún club. Crea el primero.'));
    centerCard(
      h('h2', null, 'Selecciona un club'),
      auth.user ? h('p', { class: 'muted' }, auth.user.email) : null,
      list,
      h('div', { class: 'new-club' }, nameInput,
        h('button', {
          class: 'btn btn-primary', type: 'button',
          onclick: async (e) => {
            const n = nameInput.value.trim();
            if (!n) { err.textContent = 'Escribe un nombre.'; return; }
            e.currentTarget.disabled = true;
            try { resolve({ ...(await drive.createClub(n)), isNew: true }); }
            catch (ex) { err.textContent = ex.message || String(ex); e.currentTarget.disabled = false; }
          }
        }, 'Crear club')),
      err,
      h('button', { class: 'btn btn-link', type: 'button', onclick: doLogout }, 'Cerrar sesión'));
  });
}
function doLogout() {
  try { auth.signOut(); } catch (e) { /* ignorar */ }
  lsSet(LOCAL_KEY, null);
  lsSet(CLUB_KEY, null);
  location.hash = '';
  location.reload();
}

// ---------- Shell ----------
const allowedMenu = () => {
  const role = auth.role();
  return MENU.filter(([, , roles]) => roles.includes(role));
};
const defaultRoute = () => (auth.role() === 'nadador' ? 'mi-espacio' : 'inicio');

function navIcon(name) {
  return h('svg', { viewBox: '0 0 24 24', width: 22, height: 22, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    h('path', { d: ICONS[name] || ICONS.inicio }));
}

function bellCount() {
  try {
    const lim = new Date(); lim.setDate(lim.getDate() - 7);
    const from = isoDate(lim);
    return store.list('Comunicaciones').filter((c) => String(c.fecha || '') >= from).length;
  } catch (e) { return 0; }
}

const STATUS_LABEL = { local: 'Modo local', sincronizado: 'Sincronizado', pendiente: 'Pendiente', error: 'Error de sincronización', offline: 'Sin conexión' };

function buildHeader() {
  const role = auth.role();
  const n = bellCount();
  const status = store.status || 'local';
  const canSync = status !== 'local';
  return h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, logoEl(48),
      h('div', { class: 'brand-text' }, h('div', { class: 'brand-name' }, clubName()), h('div', { class: 'brand-lema' }, clubLema()))),
    h('div', { class: 'top-actions' },
      h('div', { class: 'role-box' }, h('small', null, 'Rol actual:'), h('strong', null, ROLE_LABEL[role] || role)),
      h('button', {
        class: 'status-chip st-' + status, type: 'button', title: canSync ? 'Sincronizar ahora' : STATUS_LABEL[status],
        onclick: async () => { if (!canSync) return; try { await store.sync(); toast('Sincronizado'); } catch (e) { toast('Error al sincronizar'); } }
      }, h('span', { class: 'dot' }), h('span', { class: 'status-text' }, STATUS_LABEL[status] || status)),
      h('button', { class: 'icon-btn bell', type: 'button', 'aria-label': `Avisos: ${n}`, title: 'Comunicaciones recientes', onclick: () => router.navigate('comunicaciones') },
        h('svg', { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
          h('path', { d: 'M6 9a6 6 0 0112 0c0 5 2 6 2 7H4c0-1 2-2 2-7zM10 20a2 2 0 004 0' })),
        n > 0 ? h('span', { class: 'badge' }, n > 9 ? '9+' : n) : null),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Salir', title: auth.user ? `Salir (${auth.user.email})` : 'Salir', onclick: doLogout },
        h('svg', { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
          h('path', { d: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9' })))));
}

function buildNav() {
  const cur = router.current().name;
  const links = allowedMenu().map(([name, label]) =>
    h('a', { href: '#/' + name, class: 'nav-item' + (cur === name ? ' active' : ''), dataset: { route: name } }, navIcon(name), h('span', null, label)));
  const nav = h('nav', { class: 'sidebar', 'aria-label': 'Principal' }, h('div', { class: 'nav-list' }, links));
  if (realRole !== 'nadador') {
    const opts = [...new Set([realRole, 'entrenador', 'nadador'])];
    const sel = h('select', { id: 'role-select', 'aria-label': 'Cambiar a rol' },
      opts.map((r) => h('option', { value: r, selected: r === auth.role() }, ROLE_LABEL[r] + (r === realRole ? ' (real)' : ''))));
    sel.addEventListener('change', () => {
      auth.setDemoRole(sel.value === realRole ? null : sel.value);
      // El shell se reconstruye en el listener de auth
      const { name } = router.current();
      if (!allowedMenu().some(([n]) => n === name)) router.navigate(defaultRoute());
    });
    nav.appendChild(h('div', { class: 'role-switch' }, h('label', { for: 'role-select' }, 'Cambiar a rol'), sel, h('small', null, 'Vista demo')));
  }
  return nav;
}

function buildFooter() {
  return h('footer', { class: 'footer' }, `© ${new Date().getFullYear()} ${clubName()} | ${clubLema()}`);
}

function renderShell() {
  applyTheme();
  const main = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  $app().replaceChildren(h('div', { class: 'shell' }, h('div', { id: 'slot-header' }), buildNav(), main, buildFooter()));
  refreshHeader();
  const { name } = router.current();
  if (!name || !allowedMenu().some(([n]) => n === name)) history.replaceState(null, '', '#/' + defaultRoute());
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
  if (!allowedMenu().some(([n]) => n === name)) { router.navigate(defaultRoute()); return; }
  document.querySelectorAll('.nav-item').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  const token = ++renderToken;
  main.replaceChildren(h('p', { class: 'muted loading' }, 'Cargando…'));
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
  const label = (MENU.find((m) => m[0] === name) || [name, name])[1];
  return h('div', { class: 'card soon' }, h('h2', null, label), h('p', null, 'Próximamente'), h('p', { class: 'muted' }, 'Este módulo aún no está disponible.'));
}
function errorCard(e) {
  return h('div', { class: 'card' }, h('h2', null, 'Error al mostrar la vista'), h('p', { class: 'form-error' }, e?.message || String(e)));
}

// ---------- Instalación PWA ----------
function setupInstall() {
  let deferred = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    if (lsGet('cnl:install-dismissed') === '1' || document.getElementById('install-banner')) return;
    const banner = h('div', { id: 'install-banner', class: 'install-banner' },
      h('span', null, 'Instala CNL Plataforma en tu dispositivo'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onclick: async () => { banner.remove(); deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; }
      }, 'Instalar'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Descartar', onclick: () => { lsSet('cnl:install-dismissed', '1'); banner.remove(); } }, '✕'));
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
async function start() {
  const localMode = lsGet(LOCAL_KEY) === '1';
  let clubRef;
  if (localMode) {
    clubRef = { id: 'local', name: DEFAULT_NAME, local: true };
  } else {
    if (!auth.user) { loginScreen(); return; }
    clubSelector.forceChoose = false;
    const ref = await clubSelector();
    if (!ref) return;
    lsSet(CLUB_KEY, ref.id);
    clubRef = ref;
  }
  centerCard(h('p', { class: 'muted' }, 'Abriendo club…'));
  try {
    await store.init(clubRef);
  } catch (e) {
    console.error(e);
    centerCard(h('h2', null, 'No se pudo abrir el club'), h('p', { class: 'form-error' }, e.message || String(e)),
      h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'Reintentar'),
      h('button', { class: 'btn', onclick: doLogout }, 'Salir'));
    return;
  }
  auth.setDemoRole?.(null);
  realRole = auth.role();
  renderShell();
  if (!started) {
    started = true;
    router.onChange(showView);
    store.on?.(() => { if (document.getElementById('slot-header')) refreshHeader(); });
    auth.on?.(() => { if (document.getElementById('slot-header')) { renderShell(); } });
    router.start({ silent: true });
  }
}

async function boot() {
  registerSW();
  setupInstall();
  try {
    await loadCore();
    await auth.init();
  } catch (e) {
    console.error(e);
    $app().replaceChildren(h('div', { class: 'card auth-card' }, h('h2', null, 'Error de arranque'), h('p', { class: 'form-error' }, e.message || String(e))));
    return;
  }
  // Sesión de Google caducada pero guardado modo local no aplica
  if (auth.enabled && auth.user) lsSet(LOCAL_KEY, null);
  await start();
}

boot();
