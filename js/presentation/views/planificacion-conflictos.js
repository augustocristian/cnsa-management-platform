// Conflict surfaces of the pool planning: the panel (alerts with counts) and the notes inside the assignment dialog.
import { h } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { icon } from '../icons.js';
import { agruparConflictos } from '../../domain/planificacion.js';
import { mensajeConflicto } from './planificacion-textos.js';

const iconoSev = (s) => icon(s === 'info' ? 'info' : 'aviso', { size: 16 });

// Notes shown in the assignment dialog for the conflicts of the assignment being edited.
// forzar = the user already tried to save: warnings explain they can still be saved anyway.
export function notasConflicto(conflictos, forzar) {
  const { errores, avisos } = agruparConflictos(conflictos);
  if (!errores.length && !avisos.length) {
    return [
      h(
        'div',
        { class: 'alert alert--ok pl-note' },
        icon('check', { size: 18 }),
        h('p', null, t('plan.sin-conflictos')),
      ),
    ];
  }
  const out = [];
  if (errores.length) {
    out.push(
      h(
        'div',
        { class: 'alert alert--danger pl-note', role: 'alert' },
        icon('aviso', { size: 18 }),
        h(
          'div',
          null,
          h('p', { class: 'alert-title' }, t('plan.bloqueado')),
          h(
            'ul',
            null,
            errores.map((c) => h('li', null, mensajeConflicto(c))),
          ),
        ),
      ),
    );
  }
  if (avisos.length) {
    out.push(
      h(
        'div',
        { class: 'alert alert--warn pl-note' },
        icon('aviso', { size: 18 }),
        h(
          'div',
          null,
          h('p', { class: 'alert-title' }, forzar && !errores.length ? t('plan.avisos-forzar') : t('plan.avisos')),
          h(
            'ul',
            null,
            avisos.map((c) => h('li', null, mensajeConflicto(c))),
          ),
        ),
      ),
    );
  }
  return out;
}

// Summary badge for the toolbar: links to the panel. resumen = {error, aviso}
export function insigniaConflictos(resumen) {
  const tono = resumen.error ? 'danger' : resumen.aviso ? 'warn' : 'ok';
  const texto =
    resumen.error || resumen.aviso
      ? t('plan.conflictos-resumen', { errores: resumen.error, avisos: resumen.aviso })
      : t('plan.sin-conflictos');
  return h(
    'a',
    {
      class: `badge badge--${tono} pl-chip`,
      href: '#pl-panel-h',
      onclick: (e) => {
        e.preventDefault();
        const el = document.getElementById('pl-panel-h');
        el?.scrollIntoView?.({ block: 'center' });
        el?.focus?.({ preventScroll: true });
      },
    },
    texto,
  );
}

// Panel: errors and warnings as alerts with their counts; free slots (info) folded away.
// opciones: {conflictos, asignaciones: [{id,...}], onAsignacion(a), onHueco(c)}
export function panelConflictos({ conflictos, asignaciones, onAsignacion, onHueco }) {
  const { errores, avisos, infos } = agruparConflictos(conflictos);
  const porId = new Map(asignaciones.map((a) => [a.id, a]));
  const item = (c) => {
    const cl = c.severidad === 'error' ? 'e' : c.severidad === 'aviso' ? 'a' : 'i';
    const accion =
      c.severidad === 'info'
        ? () => onHueco(c)
        : () => {
            const a = porId.get(c.asignaciones[0]);
            if (a) onAsignacion(a);
          };
    return h(
      'li',
      { class: cl },
      h('button', { type: 'button', onclick: accion }, iconoSev(c.severidad), h('span', null, mensajeConflicto(c))),
    );
  };
  const alerta = (tono, titulo, lista) =>
    h(
      'div',
      { class: `alert alert--${tono}`, role: tono === 'danger' ? 'alert' : null },
      icon('aviso', { size: 18 }),
      h(
        'div',
        null,
        h('p', { class: 'alert-title' }, `${titulo} (${lista.length})`),
        h('ul', { class: 'pl-clist' }, lista.map(item)),
      ),
    );
  return h(
    'section',
    { class: 'card pl-panel pl-screen', 'aria-labelledby': 'pl-panel-h' },
    h('div', { class: 'pl-panel-head' }, h('h2', { id: 'pl-panel-h', tabindex: -1 }, t('plan.panel.titulo'))),
    !errores.length && !avisos.length
      ? h('div', { class: 'alert alert--ok' }, icon('check', { size: 18 }), h('p', null, t('plan.panel.vacio')))
      : null,
    errores.length ? alerta('danger', t('plan.panel.errores'), errores) : null,
    avisos.length ? alerta('warn', t('plan.panel.avisos'), avisos) : null,
    infos.length
      ? h(
          'details',
          null,
          h('summary', null, `${t('plan.panel.huecos')} (${infos.length})`),
          h('ul', { class: 'pl-clist' }, infos.map(item)),
        )
      : null,
  );
}
