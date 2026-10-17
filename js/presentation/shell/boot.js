// Boot (composition of the shell): loads the core modules, wires the application services to the real adapters
// (localStorage/sessionStorage flags, clock, cache cleanup) and runs the start flow:
//   no Client ID -> "Configuration needed" | not connected -> start screen (connect Drive / try the demo)
//   | demo left open -> demo | connected -> preferences + clubs -> wizard / club picker / club -> shell.
import { h, toast } from '../../ui.js';
import * as ui from '../../ui.js';
import * as router from '../../router.js';
import { t, onLangChange, getLang, setLang } from '../../i18n.js';
import * as theme from '../../theme.js';
import { limpiarDatosLocales } from '../../cache.js';
import { pruebasPermitidas } from '../../infrastructure/entornoPruebas.js';
import { crearSesionService } from '../../application/sesionService.js';
import { crearAvisosService } from '../../application/avisosService.js';
import { aplicarTema } from './themeApply.js';
import { enlazarSaltar, ponerTitulo, anunciador } from './a11y.js';
import { configurarInstalacion, registrarServiceWorker } from './pwaInstall.js';
import { vigilarConexion, estaOffline } from './offline.js';
import { pintarBanners } from './banners.js';
import { renderShell, refrescarShell, mostrarVista, shellAbierto } from './shell.js';
import { crearConexion } from './conexion.js';
import {
  centerCard, tutorialScreen, configScreen, inicioScreen, errorScreen, flujoCrearClub, selectorClub,
  dialogoSalidaConPendientes, pantallaErrorShell, pantallaProblema,
} from './screens.js';

const TUTORIAL = 'tutorial';
const ELEGIR_CLUB = 'cnl:elegir'; // sessionStorage: force the club picker after "Switch club"
const DEMO_GUARDADA = 'cnl:mode'; // localStorage, device only: 'demo' = the demo was left open (owned by application/modoService.js)
const AVISOS_VISTO = 'cnl:avisos-visto'; // localStorage, device only: last day the notices view was opened

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};
const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
};

// Browser-side implementations of the ports the application services expect.
const banderas = {
  selectorForzado: () => ss.get(ELEGIR_CLUB) === '1',
  limpiarSelectorForzado: () => ss.del(ELEGIR_CLUB),
  demoGuardada: () => ls.get(DEMO_GUARDADA) === 'demo',
};

// The Google simulator is only activated on localhost/127.0.0.1 (localStorage flag) or if the test runner injects
// window.__CNL_TEST__ (Playwright addInitScript): on a real domain a stale localStorage value never replaces Google.
const modoPruebas = () => pruebasPermitidas(window);

// Runtime state shared by the shell modules (explicitly passed around; nothing global but this object).
export function crearRuntime() {
  const rt = {
    ui, banderas,
    ahora: () => new Date(),
    store: null, auth: null, drive: null, config: null, prefs: null, CLAVES: null, fake: null,
    sesion: null, avisos: null, conexion: null, modo: null,
    redraw: null,            // repaints the pre-shell screen when the language changes
    iniciado: false,         // listeners registered
    offline: estaOffline(),
    actualizarVersion: null, // set when a new service worker is waiting
    rutaMostrada: '', menu: null, ctxVista: {},
  };
  rt.conexion = crearConexion(rt);
  rt.start = () => start(rt);
  rt.logout = () => desconectar(rt);
  // Views (Settings) disconnect Drive through the view context; the shell owns the flow (pending-changes dialog, wipe, reload).
  rt.ctxVista.desconectar = () => rt.logout();
  rt.reconectar = () => reconectar(rt);
  rt.sincronizar = async () => { await rt.store.sync(); await rt.prefs.flush(); };
  return rt;
}

async function cargarNucleo(rt) {
  rt.config = await import('../../config.js');
  rt.auth = (await import('../../auth.js')).auth;
  rt.store = (await import('../../store.js')).store;
  rt.drive = (await import('../../drive.js')).drive;
  const p = await import('../../preferencias.js');
  rt.prefs = p.preferencias;
  rt.CLAVES = p.CLAVES;
  // Test tool: replaces Google with an in-memory adapter. Never loaded in normal use.
  if (modoPruebas()) {
    const f = await import('../../infrastructure/fakeGoogle.js');
    rt.fake = f.instalarFakeGoogle({ auth: rt.auth, drive: rt.drive, config: rt.config, opciones: f.leerOpciones() });
  }
  rt.modo = (await import('../../modo.js')).modo; // enter / exit the demo, connect Drive from the demo
  rt.sesion = crearSesionService({
    auth: rt.auth, drive: rt.drive, prefs: rt.prefs, CLAVES: rt.CLAVES, store: rt.store,
    banderas, limpiarDatosLocales,
  });
  rt.avisos = crearAvisosService({
    listar: () => rt.store.list('Comunicaciones'),
    ahora: rt.ahora,
    visto: { leer: () => ls.get(AVISOS_VISTO), escribir: (d) => ls.set(AVISOS_VISTO, d) },
  });
}

// Language <-> user preferences (Drive). Before connecting, a change stays in the cache and is uploaded on connect.
function enlazarIdioma(rt) {
  const { prefs, CLAVES } = rt;
  onLangChange((c) => { prefs.set(CLAVES.idioma, c); });
  prefs.on((e) => {
    if (e.tipo === 'cambio' && e.origen === 'remoto' && e.claves.includes(CLAVES.idioma)) {
      const l = prefs.get(CLAVES.idioma);
      if (l && l !== getLang()) setLang(l);
    }
  });
}

// ---------- Session actions ----------
async function desconectar(rt) {
  const r = await rt.sesion.cerrarSesion({ preguntarPendientes: () => dialogoSalidaConPendientes(rt) });
  if (!r.salio) return;
  location.hash = '';
  location.reload();
}

async function reconectar(rt) {
  const r = await rt.sesion.reconectar();
  if (r.ok) { toast(t('dat.reconectado')); refrescarShell(rt); return true; }
  toast.error(t('dat.reconectar-error', { msg: (r.error && r.error.message) || '' }));
  return false;
}

// ---------- Start flow ----------
const quiereTutorial = () => router.current().name === TUTORIAL;

async function start(rt) {
  const accion = rt.sesion.decidirArranque({ tutorial: quiereTutorial() });
  if (accion === 'tutorial') return tutorialScreen(rt);
  if (accion === 'config') return configScreen(rt);
  if (accion === 'inicio') return inicioScreen(rt);
  if (accion === 'demo') return abrirDemo(rt);
  const elegido = await resolverClub(rt);
  if (elegido) await abrirClub(rt, elegido);
}

// Connected: preferences + club list -> which club (or wizard / picker / error).
async function resolverClub(rt) {
  rt.redraw = null;
  centerCard(rt, h('p', { class: 'muted', role: 'status' }, t('shell.club.cargando')));
  const r = await rt.sesion.resolverClub();
  if (r.accion === 'error') { errorScreen(rt, 'shell.club.error-lista', r.error); return null; }
  if (r.accion === 'crear') return flujoCrearClub(rt); // first time: wizard with an empty club
  if (r.accion === 'elegir') return selectorClub(rt, r.clubes);
  return { ref: r.ref };
}

async function abrirDemo(rt) {
  rt.redraw = null;
  centerCard(rt, h('p', { class: 'muted', role: 'status' }, t('shell.club.abriendo')));
  try {
    await rt.conexion.abrirDemo();
  } catch (e) {
    console.error(e);
    errorScreen(rt, 'shell.club.error-abrir', e, { reintentar: () => location.reload() });
    return false;
  }
  return montarShell(rt);
}

async function abrirClub(rt, { ref, club }) {
  const { store, prefs, CLAVES } = rt;
  rt.redraw = null;
  centerCard(rt, h('p', { class: 'muted', role: 'status' }, t('shell.club.abriendo')));
  try {
    await store.init(ref);
  } catch (e) {
    console.error(e);
    errorScreen(rt, 'shell.club.error-abrir', e, { reintentar: () => location.reload() });
    return false;
  }
  if (store.problema) await pantallaProblema(rt); // damaged / emptied file: a decision is needed before continuing
  if (club && !store.soloLectura) store.setClub(club); // club just created with the wizard: chosen identity
  prefs.set(CLAVES.ultimoClub, ref.id);
  if (club) prefs.set(CLAVES.clubes, [...prefs.get(CLAVES.clubes, []).filter((c) => c.id !== ref.id), { id: ref.id, name: ref.name }]); // mirror to open it offline
  rt.fake?.despuesDeAbrirClub?.(store);
  return montarShell(rt);
}

async function montarShell(rt) {
  const { store, auth } = rt;
  try { (await import('../../application/categoriasService.js')).crearCategoriasService(store).alAbrirClub(); } catch (e) { console.warn('Categorías', e); } // season changed: recompute categories
  try {
    renderShell(rt);
    if (!rt.iniciado) {
      rt.iniciado = true;
      router.onChange((r) => mostrarVista(rt, r));
      store.on?.((evt) => {
        if (evt && evt.type === 'cache-error') toast.error(t('dat.cache-llena'), 9000);
        if (evt && evt.type === 'problema') { pantallaProblema(rt).then(() => renderShell(rt)); return; }
        refrescarShell(rt);
      });
      auth.onExpired?.(() => refrescarShell(rt));
      auth.onChange?.(() => refrescarShell(rt));
      router.start({ silent: true });
    }
  } catch (e) {
    console.error(e);
    pantallaErrorShell(rt, e);
    return false;
  }
  return true;
}

function alCambiarIdioma(rt) {
  if (shellAbierto()) {
    const reabrir = rt.menu?.estaAbierto();
    renderShell(rt); // keeps the current route
    if (reabrir) rt.menu?.abrir({ foco: 'idioma' });
  } else if (rt.redraw) rt.redraw();
}

export async function iniciar() {
  const rt = crearRuntime();
  anunciador();
  enlazarSaltar();
  configurarInstalacion();
  ponerTitulo('', '');
  registrarServiceWorker({ onActualizacion: (activar) => { rt.actualizarVersion = activar; if (shellAbierto()) pintarBanners(rt); } });
  vigilarConexion((off) => { rt.offline = off; if (shellAbierto()) { pintarBanners(rt); rt.menu?.actualizar(); } });
  onLangChange(() => alCambiarIdioma(rt));
  window.addEventListener('hashchange', () => {
    if (shellAbierto() || !rt.sesion) return;
    if (quiereTutorial()) { if (!rt.auth.isConnected()) tutorialScreen(rt); } else if (rt.redraw?.esTutorial) start(rt);
  });
  try {
    await cargarNucleo(rt);
    enlazarIdioma(rt);
    theme.enlazar(rt.prefs, rt.CLAVES);
    theme.onThemeChange(() => aplicarTema(rt.store));
    await rt.auth.init();
  } catch (e) {
    console.error(e);
    document.getElementById('app').replaceChildren(h('div', { class: 'card auth-card' }, h('h2', null, t('shell.error-arranque')), h('p', { class: 'form-error' }, e.message || String(e))));
    return;
  }
  await start(rt);
}
