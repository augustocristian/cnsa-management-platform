// Shell: header + navigation + banners + view container + (in Settings only) the footer, and route -> view loading.
import { h } from '../../ui.js';
import { t, tNav } from '../../i18n.js';
import * as router from '../../router.js';
import { construirHeader, actualizarHeader } from './header.js';
import { construirNav, marcarActivo } from './nav.js';
import { pintarBanners } from './banners.js';
import { aplicarTema } from './themeApply.js';
import { nombreClub, lemaClub } from './marca.js';
import { esRuta, resolverRuta } from './navModel.js';
import { ponerTitulo, anunciar, moverFoco } from './a11y.js';

let tokenVista = 0;

export const shellAbierto = () => !!document.getElementById('slot-header');

function pie(rt) {
  return h('footer', { class: 'footer' }, t('shell.pie', { anio: rt.ahora().getFullYear(), club: nombreClub(rt.store), lema: lemaClub(rt.store) }));
}

// The footer only appears at the end of the Settings page.
function actualizarPie(rt, name) {
  const shell = document.querySelector('.shell');
  if (!shell) return;
  const actual = shell.querySelector(':scope > .footer');
  if (name !== 'club') { actual?.remove(); return; }
  if (actual) actual.replaceWith(pie(rt)); else shell.appendChild(pie(rt));
}

// Old route names (e.g. #/banador) keep working: the URL is rewritten to their new home.
function normalizarRuta({ name, params }) {
  const destino = resolverRuta(name);
  if (destino !== name) history.replaceState(null, '', '#/' + [destino, ...params].join('/'));
  return { name: destino, params };
}

export function renderShell(rt) {
  rt.redraw = null;
  aplicarTema(rt.store);
  const actual = router.current();
  const main = h('main', { id: 'view', class: 'view', tabindex: '-1' });
  const raiz = document.getElementById('app');
  raiz.replaceChildren(h('div', { class: 'shell' },
    h('div', { id: 'slot-header' }, construirHeader(rt)),
    h('div', { id: 'cnl-avisos', class: 'banners', hidden: true }),
    construirNav(rt, resolverRuta(actual.name)),
    main));
  pintarBanners(rt, { forzar: true });
  if (!actual.name || !(esRuta(actual.name) || resolverRuta(actual.name) !== actual.name)) history.replaceState(null, '', '#/inicio');
  return mostrarVista(rt, router.current(), { primera: true });
}

// Repaints header pieces and banners after a store/auth event (no focus changes).
export function refrescarShell(rt) {
  if (!shellAbierto()) return;
  aplicarTema(rt.store);
  actualizarHeader(rt);
  pintarBanners(rt);
  actualizarPie(rt, resolverRuta(router.current().name));
}

export async function mostrarVista(rt, ruta, { primera = false } = {}) {
  const main = document.getElementById('view');
  if (!main) return;
  const { name, params } = normalizarRuta(ruta);
  if (!esRuta(name)) { router.navigate('inicio'); return; }
  marcarActivo(name);
  actualizarPie(rt, name);
  const clave = `${name}/${params.join('/')}`;
  const cambio = clave !== rt.rutaMostrada;
  rt.rutaMostrada = clave;
  const token = ++tokenVista;
  main.replaceChildren(h('p', { class: 'muted loading' }, t('shell.cargando')));
  let mod;
  try {
    mod = await (router.getRoute(name)?.() ?? import(`../../views/${name}.js`));
  } catch (e) {
    if (token !== tokenVista) return;
    let missing = false;
    try { missing = !(await fetch(`./js/views/${name}.js`, { method: 'HEAD' })).ok; } catch (e2) { missing = false; }
    main.replaceChildren(missing ? proximamente(name) : tarjetaError(e));
    finalizarRuta(rt, main, name, { cambio, primera });
    return;
  }
  if (token !== tokenVista) return;
  try {
    const p = Object.assign([...params], { id: params[0] });
    main.replaceChildren();
    await mod.render(main, p, { store: rt.store, auth: rt.auth, ui: rt.ui, ...rt.ctxVista });
    window.scrollTo(0, 0);
  } catch (e) {
    console.error(e);
    if (token === tokenVista) main.replaceChildren(tarjetaError(e));
  }
  if (token === tokenVista) finalizarRuta(rt, main, name, { cambio, primera });
}

// Title, announcement and focus once the view is on screen.
function finalizarRuta(rt, main, name, { cambio, primera }) {
  const titulo = main.querySelector('h1')?.textContent.trim() || tNav(name);
  ponerTitulo(titulo, nombreClub(rt.store));
  if (name === 'comunicaciones') { rt.avisos.marcarVistos(); actualizarHeader(rt); }
  if (cambio && !primera) { anunciar(titulo); moverFoco(main); }
}

function proximamente(name) {
  return h('div', { class: 'card soon' }, h('h2', null, tNav(name)), h('p', null, t('common.proximamente')), h('p', { class: 'muted' }, t('shell.proximamente-desc')));
}
export function tarjetaError(e) {
  return h('div', { class: 'alert alert--danger', role: 'alert' }, h('div', null, h('p', { class: 'alert-title' }, t('shell.error-vista')), h('p', null, e?.message || String(e))));
}
