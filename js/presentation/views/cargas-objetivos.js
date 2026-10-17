// Weekly targets table: ONE save button for all the contents (all or nothing), inline validation per row.
import { h, fieldError, clearFieldError, toast } from '../ui.js';
import { t, tContenido } from '../i18n/i18n.js';
import { chip } from './cargas-contenidos.js';

// -> <section>. onGuardado() runs after a save that changed something.
export function tablaObjetivos({ svc, onGuardado }) {
  const filas = svc.activos().map((tipo) => {
    const nombre = tContenido(tipo);
    const min = h('input', { type: 'number', min: 0, inputmode: 'numeric', 'aria-label': `${t('cargas.th-min')}: ${nombre}`, value: tipo.min || '' });
    const max = h('input', { type: 'number', min: 0, inputmode: 'numeric', 'aria-label': `${t('cargas.th-max')}: ${nombre}`, value: tipo.max || '' });
    return { tipo, min, max };
  });
  const guardar = () => {
    filas.forEach((f) => { clearFieldError(f.min); clearFieldError(f.max); });
    const r = svc.guardarObjetivos(filas.map((f) => ({ id: f.tipo.id, min: f.min.value, max: f.max.value })));
    if (!r.ok) {
      r.errores.forEach((e, i) => {
        const fila = filas.find((f) => f.tipo.id === e.id);
        fieldError(e.campo === 'min' ? fila.min : fila.max, t('tc.err.' + e.codigo), { focus: i === 0 });
      });
      return;
    }
    toast(t(r.guardados ? 'cargas.objetivos-guardados' : 'cargas.objetivos-sin-cambios'));
    if (r.guardados) onGuardado();
  };
  return h('form', { class: 'cg-obj', novalidate: true, onsubmit: (e) => { e.preventDefault(); guardar(); } },
    h('p', { class: 'cg-help' }, t('cargas.objetivos-ayuda')),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards cg-obj-table' },
      h('thead', null, h('tr', null, h('th', null, t('cargas.th-tipo')), h('th', null, t('cargas.th-min')), h('th', null, t('cargas.th-max')))),
      h('tbody', null, filas.map((f) => h('tr', null,
        h('td', { 'data-label': t('cargas.th-tipo') }, chip(h, f.tipo)),
        h('td', { 'data-label': t('cargas.th-min') }, f.min),
        h('td', { 'data-label': t('cargas.th-max') }, f.max)))))),
    h('div', { class: 'cg-obj-foot' }, h('button', { type: 'submit', class: 'btn btn--primary' }, t('cargas.guardar-objetivos'))));
}
