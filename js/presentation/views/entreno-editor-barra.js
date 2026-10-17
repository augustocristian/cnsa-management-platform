// Sticky bottom bar of the plan editor: live total, unsaved-changes indicator, the primary "Save" button and the "more"
// menu (PDF, preview, print, save to Drive, register loads, copy summary).
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/entreno.js';
import { menuAcciones } from './entreno-menu.js';
import { etiquetaPdf, esMovil } from './entreno-acciones.js';
import { fmt } from './entreno-editor-util.js';

// env: { borrador, guardar() }
// acciones: { pdf(), previa(), imprimir(), drive(), driveDisponible, registrar(), copiar() }
export function crearBarra(env, acciones) {
  const totEl = h('div', { class: 'enp-tot', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const estadoEl = h('div', { class: 'enp-estado', role: 'status' });
  const menu = menuAcciones({
    etiqueta: t('entreno.barra.mas'),
    clase: 'enp-barra-mas',
    items: () => [
      { id: 'pdf', label: etiquetaPdf(), icono: 'descargar', onClick: acciones.pdf },
      { id: 'previa', label: t('entreno.vista-previa'), icono: 'ojo', onClick: acciones.previa },
      {
        id: 'imprimir',
        label: t('entreno.imprimir'),
        icono: 'imprimir',
        onClick: acciones.imprimir,
        oculto: esMovil(),
      },
      {
        id: 'drive',
        label: t('entreno.guardar-drive'),
        icono: 'nube',
        onClick: acciones.drive,
        deshabilitado: !acciones.driveDisponible,
        ayuda: acciones.driveDisponible ? null : t('entreno.drive-demo'),
      },
      { id: 'registrar', label: t('entreno.res.registrar'), icono: 'cargas', onClick: acciones.registrar },
      { id: 'copiar', label: t('entreno.res.copiar'), icono: 'copiar', onClick: acciones.copiar },
    ],
  });
  const el = h(
    'div',
    { class: 'enp-foot' },
    h('div', { class: 'enp-foot-info' }, totEl, estadoEl),
    h(
      'div',
      { class: 'enp-acts' },
      h(
        'button',
        { type: 'button', class: 'btn btn--primary enp-guardar', onclick: () => env.guardar() },
        icon('check', { size: 18 }),
        h('span', null, t('common.guardar')),
      ),
      menu,
    ),
  );

  // Redraws total and state; called on every change of the draft.
  function actualizar() {
    const tot = D.totales(env.borrador.estado.lineas);
    totEl.textContent = t('entreno.total-linea', { m: fmt(tot.metros), min: fmt(tot.tiempoMin), sets: tot.sets });
    const sucio = env.borrador.sucio();
    estadoEl.textContent = t(sucio ? 'entreno.estado.sin-guardar' : 'entreno.estado.guardado');
    estadoEl.classList.toggle('enp-estado--sucio', sucio);
    el.dataset.sucio = sucio ? 'true' : 'false';
  }
  return { el, actualizar };
}
