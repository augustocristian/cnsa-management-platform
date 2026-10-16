// A set of the plan: header (title, live total, content summary, add-row button and a set menu) + its rows.
import { h } from '../ui.js';
import { t } from '../i18n.js';
import * as D from '../domain/entreno.js';
import { menuAcciones } from './entreno-menu.js';
import { ib } from './entreno-editor-util.js';
import { crearFila } from './entreno-editor-fila.js';

// -> element; registers the live-updated spans in env.setRefs / env.setCont
export function crearSet(env, s, { ultimo }) {
  const filas = env.borrador.estado.lineas.filter((l) => l.set === s);
  const totalEl = h('span', { class: 'enp-set-tot' });
  const contSet = h('span', { class: 'enp-set-cont' });
  env.setRefs.set(s, totalEl);
  env.setCont.set(s, contSet);
  const id = `${env.uid}-set-${s}`;
  const menu = menuAcciones({
    etiqueta: t('entreno.set.acciones', { n: s }),
    items: () => [
      { label: t('entreno.set-subir', { n: s }), icono: 'fila-arriba', deshabilitado: s === 1, onClick: () => env.op((ls) => D.moverSet(ls, s, -1)) },
      { label: t('entreno.set-bajar', { n: s }), icono: 'fila-abajo', deshabilitado: ultimo, onClick: () => env.op((ls) => D.moverSet(ls, s, 1)) },
      { label: t('entreno.set-duplicar', { n: s }), icono: 'copiar', onClick: () => env.op((ls) => D.duplicarSet(ls, s)) },
      { label: t('entreno.set-quitar', { n: s }), icono: 'borrar', danger: true, onClick: () => env.op((ls) => D.quitarSet(ls, s)) },
    ],
  });
  return h('section', { class: 'enp-set', 'aria-labelledby': id, 'data-set': s },
    h('div', { class: 'enp-set-head' },
      h('h3', { id }, t('entreno.set', { n: s })),
      totalEl,
      h('div', { class: 'enp-set-acts' },
        ib('mas', t('entreno.set-anadir-fila', { n: s }), () => env.op((ls) => D.anadirFila(ls, s), { set: s, orden: filas.length + 1 })),
        menu),
      contSet),
    filas.map((l) => crearFila(env, l, { ultimoSet: ultimo, nFilas: filas.length })));
}
