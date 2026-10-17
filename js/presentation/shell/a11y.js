// Route-change accessibility: document title, polite announcement, focus management and the skip link.
import { t, onLangChange } from '../i18n/i18n.js';

export const TITULO_APP = 'CNL Plataforma';

// "Swimmers - Club name"; just the club (or app) name when there is no view title.
export function componerTitulo(vista, club) {
  const v = String(vista ?? '').trim();
  const c = String(club ?? '').trim() || TITULO_APP;
  return v ? `${v} · ${c}` : c;
}

export function ponerTitulo(vista, club) {
  document.title = componerTitulo(vista, club);
}

// Hidden polite live region (created once, outside #app so shell redraws do not recreate it).
export function anunciador() {
  let el = document.getElementById('route-announcer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'route-announcer';
    el.className = 'sr-only';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-atomic', 'true');
    document.body.appendChild(el);
  }
  return el;
}

export function anunciar(msg) {
  const el = anunciador();
  el.textContent = '';
  // A change of content (not only of text) is what screen readers announce: clear first, write on the next tick.
  setTimeout(() => {
    el.textContent = msg;
  }, 50);
}

// After a route change: focus the page heading (or #view). Leaves focus alone if the view already focused one of its own controls.
export function moverFoco(main) {
  if (!main) return;
  const activo = document.activeElement;
  if (activo && activo !== document.body && main.contains(activo)) return;
  const h1 = main.querySelector('h1');
  const destino = h1 || main;
  if (h1 && !h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
  try {
    destino.focus({ preventScroll: true });
  } catch (e) {
    /* ignore */
  }
}

// Skip link (index.html): moves focus to #view without touching the hash (the router uses the hash for routes).
export function enlazarSaltar() {
  const a = document.querySelector('.skip-link');
  if (!a) return;
  const pintar = () => {
    a.textContent = t('ui.saltar');
  };
  pintar();
  onLangChange(pintar);
  a.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('view')?.focus();
  });
}
