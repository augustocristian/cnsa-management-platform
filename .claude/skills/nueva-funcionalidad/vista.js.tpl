// <Module> view: presentation only. Logic lives in js/domain/<module>.js and orchestration in js/application/<module>Service.js.
// UI texts go through t('<pre>.key') (es/en/it in js/locales/<module>.*.js).
import { t, tDate } from '../i18n.js';
import { h, sheet, formFields, empty, badge, toast } from '../ui.js';
import { icon } from '../icons.js';
import * as D from '../domain/<module>.js';
import { crear<Module>Service } from '../application/<module>Service.js';

export async function render(container, params, ctx) {
  const { store } = ctx;
  const svc = crear<Module>Service(store);

  function pintar() {
    const filas = svc.listar();
    container.replaceChildren(
      // One h1 per view, inside .page-head
      h('header', { class: 'page-head' },
        h('h1', null, t('<pre>.titulo')),
        h('div', { class: 'page-head-actions' },
          h('button', { class: 'btn btn--primary', type: 'button', onclick: () => editar() }, icon('mas'), ' ', t('<pre>.nuevo')))),
      filas.length ? tabla(filas) : empty({
        icon: 'info', title: t('<pre>.vacio-titulo'), text: t('<pre>.vacio-texto'),
        action: h('button', { class: 'btn btn--primary', type: 'button', onclick: () => editar() }, t('<pre>.nuevo')),
      }));
  }

  function tabla(filas) {
    return h('div', { class: 'table-wrap' },
      h('table', { class: 'table table--cards' },
        h('thead', null, h('tr', null, h('th', null, t('<pre>.nombre')), h('th', null, t('<pre>.fecha')), h('th', null, t('<pre>.estado')), h('th', null))),
        h('tbody', null, filas.map((f) => h('tr', null,
          h('td', { 'data-label': t('<pre>.nombre') }, f.nombre), // h() escapes: never innerHTML with data
          h('td', { 'data-label': t('<pre>.fecha') }, tDate(f.fecha)),
          h('td', { 'data-label': t('<pre>.estado') }, badge(t('estado.' + f.estado), f.estado === 'activo' ? 'ok' : 'neutral')),
          h('td', { class: 'actions' },
            h('button', { class: 'btn btn-icon btn--ghost', type: 'button', 'aria-label': t('common.editar'), onclick: () => editar(f) }, icon('editar')),
            h('button', { class: 'btn btn-icon btn--ghost', type: 'button', 'aria-label': t('common.eliminar'), onclick: () => borrar(f) }, icon('borrar'))))))));
  }

  function editar(actual) {
    const form = formFields([
      { name: 'nombre', label: t('<pre>.nombre'), required: true, full: true },
      { name: 'fecha', label: t('<pre>.fecha'), type: 'date', required: true },
      { name: 'estado', label: t('<pre>.estado'), type: 'select', options: D.ESTADOS.map((v) => ({ value: v, label: t('estado.' + v) })) },
      { name: 'notas', label: t('<pre>.notas'), type: 'textarea' },
    ], actual || {});
    sheet({
      title: t(actual ? '<pre>.editar' : '<pre>.nuevo'),
      body: form.el,
      actions: [
        { label: t('common.cancelar') },
        { label: t('common.guardar'), primary: true, onClick: () => guardar(form, actual) },
      ],
    });
  }

  // onClick returning false keeps the dialog open
  function guardar(form, actual, forzar = false) {
    if (!form.validate()) return false;
    try {
      svc.guardar({ ...actual, ...form.values() }, { forzar });
    } catch (e) {
      if (e.codigo === 'validacion') { toast.error(e.errores.map((x) => t('<pre>.c.' + x.codigo, x.params)).join(' ')); return false; }
      if (e.codigo === 'avisos') { toast.error(e.avisos.map((x) => t('<pre>.c.' + x.codigo, x.params)).join(' ')); return false; }
      throw e;
    }
    toast(t('<pre>.guardado'));
    pintar();
  }

  function borrar(f) {
    const previa = svc.eliminar(f.id);
    pintar();
    toast.undo(t('<pre>.eliminado'), () => { store.upsert(D.HOJA, previa); pintar(); });
  }

  pintar();
  // Repaint when changes arrive (other device, sync); unsubscribe once the view is no longer in the DOM
  const off = store.on(() => { if (container.isConnected) pintar(); else off(); });
}
