// Header (.topbar): logo + club name (+ motto on desktop), notices bell and the settings/connection menu.
// One 56 px row on mobile. `actualizarHeader` patches the pieces in place so a store event never steals focus.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n/i18n.js';
import * as router from '../router.js';
import { crearMenuCuenta } from './accountMenu.js';
import { logoEl, nombreClub, lemaClub } from './marca.js';

function campana(rt) {
  const n = rt.avisos.contarNoLeidos();
  return h(
    'button',
    {
      class: 'icon-btn bell',
      type: 'button',
      'aria-label': t('shell.avisos', { n }),
      title: t('shell.avisos-titulo'),
      onclick: () => router.navigate('comunicaciones'),
    },
    icon('campana', { size: 24 }),
    n > 0 ? h('span', { class: 'bell-count', 'aria-hidden': 'true' }, n > 9 ? '9+' : n) : null,
  );
}

export function construirHeader(rt) {
  rt.menu?.destruir();
  rt.menu = crearMenuCuenta(rt);
  const lema = lemaClub(rt.store);
  return h(
    'header',
    { class: 'topbar' },
    h(
      'div',
      { class: 'brand' },
      logoEl(rt.store, 44),
      h(
        'div',
        { class: 'brand-text' },
        h('div', { class: 'brand-name' }, nombreClub(rt.store)),
        h('div', { class: 'brand-lema', hidden: !lema }, lema),
      ),
    ),
    h('div', { class: 'top-actions' }, campana(rt), rt.menu.el),
  );
}

export function actualizarHeader(rt) {
  const top = document.querySelector('.topbar');
  if (!top) return;
  const nombre = top.querySelector('.brand-name');
  const nuevo = nombreClub(rt.store);
  if (nombre && nombre.textContent !== nuevo) nombre.textContent = nuevo;
  const lemaEl = top.querySelector('.brand-lema');
  if (lemaEl) {
    const l = lemaClub(rt.store);
    lemaEl.textContent = l;
    lemaEl.hidden = !l;
  }
  const logo = top.querySelector('img.logo');
  if (logo) {
    const nuevoLogo = logoEl(rt.store, 44);
    if (nuevoLogo.getAttribute('src') !== logo.getAttribute('src')) logo.replaceWith(nuevoLogo);
  }
  const bell = top.querySelector('.bell');
  if (bell) {
    const nueva = campana(rt);
    if (nueva.getAttribute('aria-label') !== bell.getAttribute('aria-label')) {
      bell.setAttribute('aria-label', nueva.getAttribute('aria-label'));
      bell.querySelector('.bell-count')?.remove();
      const c = nueva.querySelector('.bell-count');
      if (c) bell.appendChild(c);
    }
  }
  rt.menu?.actualizar();
}
