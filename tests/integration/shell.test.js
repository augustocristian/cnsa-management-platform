// Shell integration (jsdom): header, settings/connection menu, navigation (bar + More sheet + groups), banners and route
// accessibility. The store, auth and views are stubs: only the shell modules under js/presentation/shell/ are real.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp, tick } from '../helpers/env.js';

let shell, nav, banners, menu, header, model, router, ui, a11y, i18n, avisosSvc;

before(async () => {
  // Reuse the jsdom of the other tests when they ran first in this process; create one when run alone.
  if (typeof globalThis.window === 'undefined') setupEnv();
  [shell, nav, banners, menu, header, model, router, ui, a11y, i18n, avisosSvc] = await Promise.all([
    importApp('js/presentation/shell/shell.js'), importApp('js/presentation/shell/nav.js'), importApp('js/presentation/shell/banners.js'),
    importApp('js/presentation/shell/accountMenu.js'), importApp('js/presentation/shell/header.js'), importApp('js/presentation/shell/navModel.js'),
    importApp('js/router.js'), importApp('js/ui.js'), importApp('js/presentation/shell/a11y.js'), importApp('js/i18n.js'),
    importApp('js/application/avisosService.js'),
  ]);
  for (const name of model.RUTAS) {
    router.registerRoute(name, async () => ({
      render: async (c) => { c.append(ui.h('header', { class: 'page-head' }, ui.h('h1', null, 'View ' + name))); },
    }));
  }
});

function crearRt({ demo = false, comunicaciones = [], offline = false, clientId = false } = {}) {
  const llamadas = { logout: 0, sync: 0, conectarDemo: 0, salirDemo: 0, configurarDrive: 0 };
  const store = {
    club: { nombre: 'Club Prueba', lema: 'Siempre adelante' }, status: 'sincronizado', mode: demo ? 'demo' : 'drive',
    list: (hoja) => (hoja === 'Comunicaciones' ? comunicaciones : []), on() {},
  };
  const rt = {
    ui, store, auth: {}, prefs: { get: () => true, set() {} }, offline, menu: null, rutaMostrada: '', actualizarVersion: null, ctxVista: {},
    ahora: () => new Date(2026, 9, 14, 10, 30),
    conexion: {
      esDemo: () => store.mode === 'demo',
      puedeConectar: () => clientId, // a Google Client ID exists
      configurarDrive: () => { llamadas.configurarDrive++; },
      conectarDesdeDemo: () => { llamadas.conectarDemo++; }, salirDeDemo: () => { llamadas.salirDemo++; },
    },
    logout: () => { llamadas.logout++; },
    sincronizar: async () => { llamadas.sync++; },
    reconectar: async () => true,
  };
  rt.avisos = avisosSvc.crearAvisosService({ listar: () => store.list('Comunicaciones'), ahora: rt.ahora });
  rt.llamadas = llamadas;
  return rt;
}

// Other test files may swap the global jsdom between tests: bind what the shell needs to the CURRENT window every time.
function enlazarGlobales() {
  for (const k of ['history', 'getComputedStyle']) {
    const v = typeof window[k] === 'function' ? window[k].bind(window) : window[k];
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  window.scrollTo = () => {};
}

beforeEach(() => {
  enlazarGlobales();
  document.body.replaceChildren(ui.h('div', { id: 'app' }));
  document.title = '';
  location.hash = '';
  i18n.setLang('es');
});

const abrirRuta = async (rt, name) => {
  location.hash = '#/' + name;
  await shell.mostrarVista(rt, router.current());
  await tick(80);
};

test('header: club name and motto, bell, and a settings/connection button with no user identity', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  const top = document.querySelector('.topbar');
  assert.equal(top.querySelector('.brand-name').textContent, 'Club Prueba');
  assert.equal(top.querySelector('.brand-lema').textContent, 'Siempre adelante');
  assert.ok(top.querySelector('.bell'), 'bell');
  const btn = top.querySelector('.account-btn');
  assert.match(btn.getAttribute('aria-label'), /^Ajustes y conexión: Drive conectado$/);
  assert.equal(btn.getAttribute('aria-expanded'), 'false');
  assert.equal(document.querySelectorAll('.avatar, #user-box, .role-box, .role-switch, .lang-select').length, 0);
  assert.ok(!/@/.test(top.textContent), 'no e-mail anywhere in the header');
});

test('settings menu: language flags, theme, Drive status, disconnect with confirmation; Escape closes it', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  const btn = document.querySelector('.account-btn');
  const panel = document.querySelector('.account-panel');
  assert.equal(panel.hidden, true);
  btn.click();
  assert.equal(panel.hidden, false);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.querySelectorAll('.lang-switch [data-lang]').length, 3);
  assert.ok(panel.querySelector('.theme-select'));
  assert.equal(panel.querySelector('.status-text').textContent, 'Drive conectado');
  assert.equal(panel.querySelector('button.status-row').getAttribute('title'), 'Sincronizar ahora');
  panel.querySelector('button.status-row').click();
  await tick();
  assert.equal(rt.llamadas.sync, 1);
  // disconnect asks first
  [...panel.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Desconectar Drive').click();
  await tick();
  const dialog = document.querySelector('.sheet');
  assert.ok(dialog, 'confirmation dialog');
  assert.equal(rt.llamadas.logout, 0);
  [...dialog.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Desconectar Drive').click();
  await tick();
  assert.equal(rt.llamadas.logout, 1);
  // Escape closes (after the dialog is gone) and returns focus to the button
  btn.click();
  if (panel.hidden) btn.click();
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(panel.hidden, true);
});

test('settings menu status follows the store: pending, offline and error', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  rt.store.status = 'pendiente'; shell.refrescarShell(rt);
  assert.equal(document.querySelector('.account-btn').getAttribute('aria-label'), 'Ajustes y conexión: Sincronizando…');
  rt.store.status = 'error'; shell.refrescarShell(rt);
  assert.match(document.querySelector('.account-btn').getAttribute('aria-label'), /Error de sincronización/);
  rt.offline = true; shell.refrescarShell(rt);
  assert.match(document.querySelector('.account-btn').getAttribute('aria-label'), /Sin conexión/);
});

test('navigation: Home plus three groups; no swimsuits entry; 4 bar items plus More', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  const items = [...document.querySelectorAll('nav.sidebar a.nav-item')].map((a) => a.dataset.route);
  assert.deepEqual(items, ['inicio', 'nadadores', 'grupos', 'entrenamientos', 'asistencia', 'calendario', 'planificacion', 'cargas', 'marcas', 'comunicaciones', 'club', 'tutorial']);
  assert.ok(!items.includes('banador'));
  const titulos = [...document.querySelectorAll('nav.sidebar .nav-group-title')].map((p) => p.textContent);
  assert.deepEqual(titulos, ['Personas', 'Entrenamiento', 'Club']);
  const barra = [...document.querySelectorAll('nav.sidebar a.nav-item:not(.nav-item--extra)')].map((a) => a.dataset.route);
  assert.deepEqual(barra, model.BARRA_MOVIL);
  assert.ok(document.querySelector('nav.sidebar .nav-more'));
  assert.equal(document.querySelectorAll('nav.sidebar h1, nav.sidebar h2, nav.sidebar h3').length, 0, 'group titles are not headings');
  // distinct Tutorial icon: not the Home fallback
  const icons = await importApp('js/icons.js');
  assert.notEqual(model.iconoDe('tutorial'), 'inicio');
  assert.ok(icons.ICONS[model.iconoDe('tutorial')]);
});

test('navigation model: the More groups hold what the bar does not show', () => {
  const mas = model.gruposMas().map((g) => [g.id, g.rutas]);
  assert.deepEqual(mas, [
    ['personas', ['nadadores', 'grupos']],
    ['entrenamiento', ['planificacion', 'cargas', 'marcas']],
    ['club', ['comunicaciones', 'club', 'tutorial']],
  ]);
  assert.equal(model.resolverRuta('banador'), 'marcas');
  assert.equal(model.enMas('club'), true);
  assert.equal(model.enMas('asistencia'), false);
});

test('More sheet: groups, active item, closes after choosing', async () => {
  const rt = crearRt();
  location.hash = '#/cargas';
  await shell.renderShell(rt);
  const mas = document.querySelector('nav.sidebar .nav-more');
  assert.ok(mas.classList.contains('active'), 'More is active when the route lives in it');
  mas.click();
  const hoja = document.querySelector('.sheet');
  assert.ok(hoja);
  assert.equal(hoja.querySelector('h2').textContent, 'Más');
  const grupos = [...hoja.querySelectorAll('.mas-group')].map((g) => [g.querySelector('.nav-group-title').textContent, [...g.querySelectorAll('.mas-item')].map((a) => a.dataset.route)]);
  assert.deepEqual(grupos, [['Personas', ['nadadores', 'grupos']], ['Entrenamiento', ['planificacion', 'cargas', 'marcas']], ['Club', ['comunicaciones', 'club', 'tutorial']]]);
  assert.equal(hoja.querySelector('.mas-item.active').dataset.route, 'cargas');
  assert.equal(hoja.querySelector('.mas-item.active').getAttribute('aria-current'), 'page');
  hoja.querySelector('.mas-item[data-route="marcas"]').click();
  await tick(20);
  assert.equal(document.querySelector('.sheet'), null, 'the sheet closes');
});

test('route change: document title, aria-current, announcement and focus on the heading', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  assert.equal(document.title, 'View inicio · Club Prueba');
  await abrirRuta(rt, 'nadadores');
  assert.equal(document.title, 'View nadadores · Club Prueba');
  assert.equal(document.querySelectorAll('nav.sidebar a[aria-current="page"]').length, 1);
  assert.equal(document.querySelector('nav.sidebar a[aria-current="page"]').dataset.route, 'nadadores');
  assert.equal(document.activeElement.tagName, 'H1');
  assert.equal(document.activeElement.closest('#view') !== null, true);
  const anunciador = document.getElementById('route-announcer');
  assert.equal(anunciador.getAttribute('aria-live'), 'polite');
  assert.equal(anunciador.textContent, 'View nadadores');
  // re-rendering the same route (e.g. language change) does not steal focus
  document.querySelector('.account-btn').focus();
  await shell.mostrarVista(rt, router.current());
  await tick(40);
  assert.equal(document.activeElement.className.includes('account-btn'), true);
});

test('old route #/banador resolves to Marks', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  location.hash = '#/banador';
  await shell.mostrarVista(rt, router.current());
  await tick(40);
  assert.equal(location.hash, '#/marcas');
  assert.equal(document.querySelector('nav.sidebar a[aria-current="page"]').dataset.route, 'marcas');
});

test('footer only appears in Settings', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  assert.equal(document.querySelector('footer.footer'), null);
  await abrirRuta(rt, 'club');
  const pie = document.querySelector('footer.footer');
  assert.ok(pie);
  assert.match(pie.textContent, /Club Prueba/);
  await abrirRuta(rt, 'grupos');
  assert.equal(document.querySelector('footer.footer'), null);
});

test('banners: demo mode, offline and update use the alert component and are repainted only on change', async () => {
  const rt = crearRt({ demo: true });
  await shell.renderShell(rt);
  const slot = document.getElementById('cnl-avisos');
  const demo = slot.querySelector('[data-aviso="demo"]');
  assert.ok(demo.classList.contains('alert'));
  assert.equal(demo.getAttribute('aria-label'), 'Modo demostración');
  assert.match(demo.textContent, /Modo demostración: tus datos no se guardan en Drive\./);
  const [configurar, salir] = demo.querySelectorAll('button');
  assert.equal(configurar.textContent, 'Configurar Google Drive', 'without a Client ID there is no Connect button yet');
  assert.equal(salir.textContent, 'Salir de la demo');
  configurar.click(); salir.click();
  assert.deepEqual([rt.llamadas.configurarDrive, rt.llamadas.conectarDemo, rt.llamadas.salirDemo], [1, 0, 1]);
  assert.equal(slot.querySelector('[data-aviso="sin-conexion"]'), null, 'no offline banner in demo');
  // the menu shows the demo status and "Exit demo" instead of "Disconnect"
  document.querySelector('.account-btn').click();
  assert.equal(document.querySelector('.account-panel .status-text').textContent, 'Modo demostración');
  assert.ok(![...document.querySelectorAll('.account-panel button')].some((b) => b.textContent.trim() === 'Desconectar Drive'));

  // same content -> same nodes (no re-announcement)
  const antes = slot.firstElementChild;
  banners.pintarBanners(rt);
  assert.equal(slot.firstElementChild, antes);

  const rt2 = crearRt({ offline: true });
  document.body.replaceChildren(ui.h('div', { id: 'app' }));
  await shell.renderShell(rt2);
  const off = document.querySelector('#cnl-avisos [data-aviso="sin-conexion"]');
  assert.ok(off && off.classList.contains('alert--warn'));
  assert.equal(off.getAttribute('role'), 'alert');
  let recargado = 0;
  rt2.actualizarVersion = () => { recargado++; };
  banners.pintarBanners(rt2);
  const up = document.querySelector('#cnl-avisos [data-aviso="actualizacion"]');
  assert.equal(up.textContent.includes('versión nueva'), true);
  up.querySelector('button').click();
  assert.equal(recargado, 1);
});

test('banner in demo mode: once a Client ID exists the action is Connect Google Drive', async () => {
  const rt = crearRt({ demo: true, clientId: true });
  await shell.renderShell(rt);
  const [conectar, salir] = document.querySelectorAll('#cnl-avisos [data-aviso="demo"] button');
  assert.equal(conectar.textContent, 'Conectar Google Drive');
  assert.equal(salir.textContent, 'Salir de la demo');
  conectar.click();
  assert.deepEqual([rt.llamadas.conectarDemo, rt.llamadas.configurarDrive], [1, 0]);
  document.querySelector('.account-btn').click();
  assert.ok([...document.querySelectorAll('.account-panel button')].some((b) => b.textContent.trim() === 'Conectar Google Drive'));
});

test('banner in demo mode without a Client ID: menu offers Set up Google Drive', async () => {
  const rt = crearRt({ demo: true });
  await shell.renderShell(rt);
  document.querySelector('.account-btn').click();
  const botones = [...document.querySelectorAll('.account-panel button')].map((b) => b.textContent.trim());
  assert.ok(botones.includes('Configurar Google Drive'));
  assert.ok(!botones.includes('Conectar Google Drive'));
});

test('bell: counts recent notices written after the last visit and resets when Notices opens', async () => {
  const hoy = '2026-10-14';
  const rt = crearRt({ comunicaciones: [{ fecha: hoy, titulo: 'a' }, { fecha: '2026-10-10', titulo: 'b' }, { fecha: '2026-09-01', titulo: 'vieja' }] });
  await shell.renderShell(rt);
  assert.equal(document.querySelector('.bell').getAttribute('aria-label'), 'Avisos: 2');
  assert.equal(document.querySelector('.bell-count').textContent, '2');
  let visto = null;
  rt.avisos = avisosSvc.crearAvisosService({ listar: () => rt.store.list('Comunicaciones'), ahora: rt.ahora, visto: { leer: () => visto, escribir: (d) => { visto = d; } } });
  await abrirRuta(rt, 'comunicaciones');
  assert.equal(visto, hoy);
  assert.equal(document.querySelector('.bell').getAttribute('aria-label'), 'Avisos: 0');
  assert.equal(document.querySelector('.bell-count'), null);
});

test('language change keeps the settings menu open on the language control', async () => {
  const rt = crearRt();
  await shell.renderShell(rt);
  document.querySelector('.account-btn').click();
  const abierto = rt.menu.estaAbierto();
  i18n.setLang('en');
  assert.equal(abierto, true);
  const rt2 = rt;
  await shell.renderShell(rt2);
  rt2.menu.abrir({ foco: 'idioma' });
  assert.equal(document.querySelector('.account-btn').getAttribute('aria-label'), 'Settings and connection: Drive connected');
  assert.equal(document.activeElement.dataset.lang, 'en');
  assert.equal(document.querySelector('nav.sidebar .nav-more .nav-label').textContent, 'More');
  assert.deepEqual([...document.querySelectorAll('nav.sidebar .nav-group-title')].map((p) => p.textContent), ['People', 'Training', 'Club']);
});

test('title helper composes "view · club" and falls back to the app name', () => {
  assert.equal(a11y.componerTitulo('Swimmers', 'CNL'), 'Swimmers · CNL');
  assert.equal(a11y.componerTitulo('', ''), 'CNL Plataforma');
  assert.equal(a11y.componerTitulo('  ', 'Club'), 'Club');
});
