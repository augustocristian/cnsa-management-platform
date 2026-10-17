// Groups view: cards with their members, create/edit in a sheet, delete with undo. Rules: domain/grupos.js + gruposService.js.
import { h, sheet, field, fieldError, toast, badge, empty } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tCat } from '../i18n/i18n.js';
import { crearGruposService } from '../../application/gruposService.js';
import { CATEGORIAS_ORDEN } from '../../domain/categorias.js';
import { nombreLista } from '../../domain/nadadores.js';

const enlaceNadador = (n) => h('li', null, h('a', { href: `#/nadadores/${n.id}` }, nombreLista(n)));

export async function render(container, params, ctx) {
  useStyles('grupos');
  const svc = crearGruposService(ctx.store);
  const refresh = () => render(container, params, ctx);

  function editar(g) {
    const grupo = g || {};
    const nombre = h('input', { type: 'text', value: grupo.nombre || '', autocomplete: 'off', autocapitalize: 'words', enterkeyhint: 'next' });
    const categoria = h('select', null, h('option', { value: '' }, t('grupos.sin-categoria')),
      CATEGORIAS_ORDEN.map((c) => h('option', { value: c, selected: c === grupo.categoria }, tCat(c))));
    const entrenador = h('input', { type: 'text', value: grupo.entrenador || '', autocomplete: 'off', autocapitalize: 'words' });
    const cuerpo = h('div', { class: 'form-grid grp-form' },
      field({ label: t('grupos.f-nombre'), input: nombre, required: true }),
      field({ label: t('grupos.f-categoria'), input: categoria }),
      field({ label: t('grupos.f-entrenador'), input: entrenador }));
    sheet({
      title: g ? t('grupos.editar') : t('grupos.nuevo'), body: cuerpo, className: 'grp-modal',
      actions: [{ label: t('common.cancelar') }, {
        label: t('common.guardar'), primary: true,
        onClick: () => {
          const r = svc.guardar({ ...grupo, nombre: nombre.value, categoria: categoria.value, entrenador: entrenador.value });
          if (!r.ok) { fieldError(nombre, t('grupos.err.' + r.errores[0].codigo)); return false; }
          toast(t('grupos.guardado'));
          refresh();
        },
      }],
    });
  }

  // Deleting is undoable: the swimmers lose the group now and get it back with the toast button.
  function eliminar(g) {
    const copia = svc.eliminar(g.id);
    refresh();
    toast.undo(t('grupos.eliminado'), () => { svc.restaurar(copia); toast(t('grupos.restaurado')); if (container.isConnected) refresh(); });
  }

  function tarjeta({ grupo, miembros, categoria }) {
    return h('article', { class: 'card grp-card' },
      h('div', { class: 'card-head' }, h('h2', null, grupo.nombre), categoria ? badge(tCat(categoria), 'info') : null),
      h('p', { class: 'muted grp-resumen' }, t(miembros.length === 1 ? 'grupos.resumen.uno' : 'grupos.resumen.otros', { entrenador: grupo.entrenador || '-', n: miembros.length })),
      miembros.length ? h('ul', { class: 'grp-list', 'aria-label': t('grupos.miembros-aria', { nombre: grupo.nombre }) }, miembros.map(enlaceNadador))
        : h('p', { class: 'muted' }, t('grupos.sin-nadadores')),
      h('div', { class: 'grp-actions' },
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => editar(grupo) }, icon('editar', { size: 16 }), t('common.editar')),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => eliminar(grupo) }, icon('borrar', { size: 16 }), t('common.eliminar'))));
  }

  const tarjetas = svc.tarjetas();
  const huerfanos = svc.sinGrupo();
  const cabecera = h('header', { class: 'page-head' }, h('h1', null, t('grupos.titulo')),
    h('div', { class: 'page-head-actions' }, h('button', { type: 'button', class: 'btn btn--primary', onclick: () => editar(null) }, icon('mas', { size: 16 }), t('grupos.nuevo'))));

  container.replaceChildren(...[
    cabecera,
    tarjetas.length ? h('div', { class: 'grp-grid' }, tarjetas.map(tarjeta))
      : h('div', { class: 'card' }, empty({ icon: 'grupos', title: t('grupos.vacio-titulo'), text: t('grupos.vacio-texto'), action: { label: t('grupos.nuevo'), onClick: () => editar(null) } })),
    huerfanos.length ? h('article', { class: 'card grp-card grp-sin' },
      h('div', { class: 'card-head' }, h('h2', null, t('grupos.sin-grupo'))),
      h('p', { class: 'muted' }, t('grupos.sin-grupo-texto')),
      h('ul', { class: 'grp-list' }, huerfanos.map(enlaceNadador))) : null,
  ].filter(Boolean));
}
