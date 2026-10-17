// Navigation: the sidebar (desktop) / bottom bar (mobile) and the "More" bottom sheet.
// ONE <nav> serves both layouts: CSS hides what does not fit (see css/app.css). Every route keeps `.nav-item[data-route]`.
import { h, sheet } from '../ui.js';
import { icon } from '../icons.js';
import { t, tNav } from '../i18n/i18n.js';
import * as router from '../router.js';
import { GRUPOS, BARRA_MOVIL, ETIQUETA_CORTA, INICIO, gruposMas, iconoDe, enMas } from './navModel.js';

function etiqueta(ruta) {
  const corta = ETIQUETA_CORTA[ruta];
  if (!corta) return h('span', { class: 'nav-label' }, tNav(ruta));
  return h('span', { class: 'nav-label' },
    h('span', { class: 'nav-label-full' }, tNav(ruta)),
    h('span', { class: 'nav-label-short', 'aria-hidden': 'true' }, t(corta)));
}

function enlace(ruta, actual) {
  const activo = ruta === actual;
  return h('a', {
    href: '#/' + ruta,
    class: 'nav-item' + (activo ? ' active' : '') + (BARRA_MOVIL.includes(ruta) ? '' : ' nav-item--extra'),
    dataset: { route: ruta },
    ...(activo ? { 'aria-current': 'page' } : {}),
  }, icon(iconoDe(ruta), { size: 22 }), etiqueta(ruta));
}

// <nav class="sidebar">: Home + three groups with headers (desktop); on mobile the bar shows BARRA_MOVIL + the More button.
export function construirNav(rt, actual) {
  const grupos = GRUPOS.map((g) => {
    const idT = 'nav-g-' + g.id;
    return h('div', { class: 'nav-group', dataset: { group: g.id } },
      h('p', { class: 'nav-group-title', id: idT }, t(g.titulo)),
      h('ul', { class: 'nav-list', 'aria-labelledby': idT }, g.rutas.map((r) => h('li', null, enlace(r, actual)))));
  });
  const mas = h('button', {
    type: 'button', class: 'nav-item nav-more' + (enMas(actual) ? ' active' : ''), 'aria-haspopup': 'dialog',
    onclick: () => abrirMas(rt),
    ...(enMas(actual) ? { 'data-current': 'true' } : {}),
  }, icon('mas-opciones', { size: 22 }), h('span', { class: 'nav-label' }, t('nav.mas')));
  return h('nav', { class: 'sidebar', 'aria-label': t('shell.menu') },
    h('ul', { class: 'nav-list nav-list--top' }, h('li', null, enlace(INICIO, actual))),
    grupos,
    h('ul', { class: 'nav-list nav-list--more' }, h('li', null, mas)));
}

// Marks the active route in an already-built nav (no rebuild: keeps focus and scroll).
export function marcarActivo(actual) {
  document.querySelectorAll('nav.sidebar a.nav-item').forEach((a) => {
    const on = a.dataset.route === actual;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  const mas = document.querySelector('nav.sidebar .nav-more');
  if (mas) mas.classList.toggle('active', enMas(actual));
}

// "More" bottom sheet with the groups that do not fit in the bar.
export function abrirMas(rt) {
  const actual = router.current().name;
  let hoja = null;
  const grupos = gruposMas().map((g) => {
    const idT = 'mas-g-' + g.id;
    return h('section', { class: 'mas-group' },
      h('p', { class: 'nav-group-title', id: idT }, t(g.titulo)),
      h('ul', { class: 'mas-list', 'aria-labelledby': idT }, g.rutas.map((r) => h('li', null,
        h('a', {
          href: '#/' + r, class: 'mas-item' + (r === actual ? ' active' : ''), dataset: { route: r },
          ...(r === actual ? { 'aria-current': 'page' } : {}),
          onclick: () => { setTimeout(() => hoja?.close(), 0); },
        }, icon(iconoDe(r), { size: 22 }), h('span', null, tNav(r)))))));
  });
  hoja = sheet({
    title: t('nav.mas'), className: 'sheet--mas',
    body: h('nav', { class: 'mas-nav', 'aria-label': t('nav.mas') }, grupos),
    actions: [{ label: t('common.cerrar') }],
  });
  return hoja;
}
