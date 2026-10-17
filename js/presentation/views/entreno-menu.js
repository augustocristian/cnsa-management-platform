// Overflow ("more actions") menu shared by the sessions list, the plan editor rows/sets and its bottom bar.
// A button that opens a small menu: role="menu"/"menuitem", Arrow/Home/End keys, Escape and outside click close it
// and return focus to the button. The menu is fixed-positioned next to the button (it is never clipped by scroll areas)
// and flips upwards when there is no room below.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';

let secuencia = 0;

// opciones: { etiqueta (aria-label of the button), items | () => items, clase?, texto? (visible label instead of the dots icon),
//             primario? }
// item: { id? (data-accion, used by tests), label, icono?, onClick(), danger?, deshabilitado?, ayuda? (explains why it is disabled), oculto? }
export function menuAcciones({ etiqueta, items, clase = '', texto = null }) {
  useStyles('entreno-menu');
  const id = 'enp-mn-' + (++secuencia);
  let menu = null;
  const btn = h('button', {
    type: 'button', class: 'btn btn--ghost enp-mn-btn' + (texto ? '' : ' btn-icon') + (clase ? ' ' + clase : ''),
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': id, 'aria-label': etiqueta, title: etiqueta,
    onclick: () => (menu ? cerrar() : abrir()),
    onkeydown: (e) => { if (e.key === 'ArrowDown' && !menu) { e.preventDefault(); abrir(); } },
  }, icon('mas-opciones', { size: 20 }), texto ? h('span', null, texto) : null);
  const caja = h('span', { class: 'enp-mn-caja' }, btn);

  function cerrar({ foco = true } = {}) {
    if (!menu) return;
    menu.remove();
    menu = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', fuera, true);
    document.removeEventListener('keydown', teclas, true);
    window.removeEventListener('scroll', alMover, true);
    window.removeEventListener('resize', alMover);
    if (foco && btn.isConnected) btn.focus();
  }
  const fuera = (e) => { if (!caja.contains(e.target)) cerrar({ foco: false }); };
  // When something scrolls or the window resizes the menu follows its button; it closes only if the button leaves the screen.
  const alMover = (e) => {
    if (!menu || (e && e.target && menu.contains(e.target))) return;
    const r = btn.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) cerrar({ foco: false });
    else posicionar();
  };
  const botones = () => [...menu.querySelectorAll('[role="menuitem"]')];
  function teclas(e) {
    if (!menu) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar(); return; }
    if (e.key === 'Tab') { cerrar({ foco: false }); return; }
    const bs = botones();
    const i = bs.indexOf(document.activeElement);
    const ir = { ArrowDown: (i + 1) % bs.length, ArrowUp: (i - 1 + bs.length) % bs.length, Home: 0, End: bs.length - 1 }[e.key];
    if (ir !== undefined) { e.preventDefault(); bs[ir].focus(); }
  }

  function abrir() {
    const lista = (typeof items === 'function' ? items() : items).filter((it) => it && !it.oculto);
    menu = h('ul', { class: 'enp-mn', id, role: 'menu', 'aria-label': etiqueta }, lista.map((it, i) => {
      const ayudaId = it.ayuda ? `${id}-a${i}` : null;
      return h('li', { role: 'none' },
        h('button', {
          type: 'button', role: 'menuitem', 'data-accion': it.id || null, class: 'enp-mn-item' + (it.danger ? ' enp-mn-item--peligro' : ''),
          'aria-disabled': it.deshabilitado ? 'true' : null, 'aria-describedby': ayudaId,
          onclick: () => { if (it.deshabilitado) return; cerrar({ foco: false }); it.onClick(); },
        }, it.icono ? icon(it.icono, { size: 18 }) : null, h('span', null, it.label)),
        ayudaId ? h('span', { class: 'enp-mn-ayuda', id: ayudaId }, it.ayuda) : null);
    }));
    caja.appendChild(menu);
    btn.setAttribute('aria-expanded', 'true');
    posicionar();
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', teclas, true);
    window.addEventListener('scroll', alMover, true);
    window.addEventListener('resize', alMover);
    const primero = botones()[0];
    if (primero) primero.focus();
  }

  function posicionar() {
    menu.style.left = '0px'; // measure at the left edge so the width is not squeezed by the space to the right
    const r = btn.getBoundingClientRect();
    const ancho = Math.min(menu.offsetWidth || 240, window.innerWidth - 16);
    const izq = Math.max(8, Math.min(r.right - ancho, window.innerWidth - ancho - 8));
    menu.style.left = `${izq}px`;
    const alto = menu.offsetHeight || 0;
    const abajo = r.bottom + 4 + alto <= window.innerHeight - 8;
    if (abajo || r.top - 4 - alto < 8) { menu.style.top = `${r.bottom + 4}px`; menu.style.bottom = 'auto'; } else { menu.style.bottom = `${window.innerHeight - r.top + 4}px`; menu.style.top = 'auto'; }
  }

  caja.cerrar = cerrar;
  return caja;
}
