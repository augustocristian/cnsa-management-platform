// Training sessions view: weekly list, create/edit/duplicate/delete (with undo) and the entry to the plan editor and PDFs.
// Business rules live in domain/entrenamientos.js and application/entrenamientosService.js.
import { t, locale } from '../i18n.js';
import { h, toast, empty } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { servicios, pdfSesion, pdfSemana } from './entreno-acciones.js';
import { abrirEditor } from './entreno-editor.js';
import { abrirFormularioSesion } from './entrenamientos-form.js';
import { tarjetaSesion } from './entrenamientos-tarjeta.js';

const aFecha = (iso) => new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const corta = (iso) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(aFecha(iso));
const nombreDia = (iso) => new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(aFecha(iso));

export async function render(container, params, ctx) {
  useStyles('entrenamientos');
  const { svc } = servicios(ctx);
  const estado = { lunes: svc.lunesActual(), grupoId: '' };

  const acciones = {
    abrirPlan: (s) => abrirEditor({ ctx, sesionId: s.id }),
    editar: (s) => abrirFormularioSesion({ svc, fila: s }),
    duplicar: (s) => abrirFormularioSesion({ svc, fila: svc.borradorDuplicado(s.id) }),
    alternarEstado: (s) => svc.alternarEstado(s.id),
    pdf: (s) => pdfSesion(ctx, s.id),
    eliminar: (s) => {
      const snap = svc.eliminar(s.id);
      if (snap) toast.undo(t('entre.eliminada'), () => { svc.restaurar(snap); toast(t('entreno.lista.restaurada')); });
    },
  };
  const nueva = () => abrirFormularioSesion({ svc, fila: svc.borradorNuevo({ grupoId: estado.grupoId }) });
  const irA = (lunes) => { estado.lunes = lunes; dibujar(); };

  function barra(semana) {
    const sel = h('select', { 'aria-label': t('entre.f.grupo'), onchange: (e) => { estado.grupoId = e.target.value; dibujar(); } },
      h('option', { value: '' }, t('entre.todos-grupos')), svc.grupos().map((g) => h('option', { value: g.id }, g.nombre)));
    sel.value = estado.grupoId;
    return h('div', { class: 'ent-bar' },
      h('div', { class: 'ent-nav' },
        h('button', { type: 'button', class: 'btn btn--ghost btn-icon', 'aria-label': t('entre.semana-anterior'), onclick: () => irA(svc.semanaAnterior(estado.lunes)) }, icon('flecha-izq', { size: 20 })),
        h('div', { class: 'ent-week num', role: 'status', 'aria-label': t('entreno.lista.semana-aria', { desde: corta(semana.lunes), hasta: corta(semana.fin) }) },
          `${corta(semana.lunes)} – ${corta(semana.fin)} ${aFecha(semana.fin).getFullYear()}`),
        h('button', { type: 'button', class: 'btn btn--ghost btn-icon', 'aria-label': t('entre.semana-siguiente'), onclick: () => irA(svc.semanaSiguiente(estado.lunes)) }, icon('flecha-dcha', { size: 20 })),
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => irA(svc.lunesActual()) }, t('entre.hoy'))),
      h('div', { class: 'ent-filtros' }, sel,
        h('button', { type: 'button', class: 'btn btn-sm', onclick: () => pdfSemana(ctx, { lunes: estado.lunes, grupoId: estado.grupoId }) }, icon('descargar', { size: 16 }), h('span', null, t('entreno.pdf-semana')))));
  }

  function dia(d) {
    return h('section', { class: 'card ent-day' + (d.esHoy ? ' ent-today' : ''), 'aria-label': `${nombreDia(d.fecha)} ${corta(d.fecha)}` },
      h('h2', { class: 'ent-day-titulo' }, `${nombreDia(d.fecha)} ${corta(d.fecha)}`),
      d.sesiones.length
        ? d.sesiones.map((s) => tarjetaSesion(s, { nombreGrupo: svc.nombreGrupo, acciones }))
        : h('p', { class: 'ent-empty' }, t('entre.sin-sesiones')));
  }

  function dibujar() {
    const semana = svc.semana(estado.lunes, { grupoId: estado.grupoId });
    container.replaceChildren(
      h('header', { class: 'page-head' }, h('h1', null, t('entre.titulo')),
        h('div', { class: 'page-head-actions' }, h('button', { type: 'button', class: 'btn btn--primary', onclick: nueva }, icon('mas', { size: 16 }), h('span', null, t('entre.nueva'))))),
      barra(semana),
      h('p', { class: 'ent-total' }, t('entre.total-semana', { n: semana.total })),
      semana.total
        ? h('div', { class: 'ent-dias' }, semana.dias.map(dia))
        : empty({ icon: 'entrenamientos', title: t('entreno.lista.vacio-titulo'), text: t('entreno.lista.vacio-texto'), action: { label: t('entre.nueva'), onClick: nueva } }));
  }

  dibujar();
  if (ctx.store.on) {
    const off = ctx.store.on(() => { if (container.isConnected) dibujar(); else if (typeof off === 'function') off(); });
    return off;
  }
  return undefined;
}
