// Toolbar of the pool planning: ONE compact row (pool, view mode, week navigation, conflicts badge) plus the page-head actions
// (primary actions visible, the rest in an overflow menu). Presentation only; every action is a callback.
import { h } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { icon } from '../icons.js';
import { fmtCorta } from './formatos-fecha.js';
import { insigniaConflictos } from './planificacion-conflictos.js';
import { menuAcciones } from './entreno-menu.js';

const boton = (texto, ic, onclick, cls = 'btn') =>
  h('button', { type: 'button', class: cls, onclick }, ic ? icon(ic, { size: 16 }) : null, texto);

// v: {pools, pool, modo, semana, finSemana, resumen}, a: callbacks
//   {cambiarPiscina(id), cambiarModo(m), semana(n), hoy(), nueva(), sugerir(), configurar(), nuevaPiscina(), imprimir()}
export function barraPiscina(v, a) {
  const selector = h(
    'select',
    { 'aria-label': t('plan.piscina'), onchange: (e) => a.cambiarPiscina(e.target.value) },
    v.pools.map((p) => h('option', { value: p.id, selected: p.id === v.pool.id }, `${p.nombre} (${p.longitudM} m)`)),
  );
  const modo = (m, texto) =>
    h(
      'button',
      { type: 'button', 'aria-pressed': v.modo === m ? 'true' : 'false', onclick: () => a.cambiarModo(m) },
      texto,
    );
  const barra = h(
    'div',
    { class: 'pl-bar pl-screen', role: 'toolbar', 'aria-label': t('plan.barra') },
    selector,
    h(
      'div',
      { class: 'segmented', role: 'group', 'aria-label': t('plan.modo') },
      modo('dia', t('plan.modo.dia')),
      modo('semana', t('plan.modo.semana')),
    ),
    h(
      'div',
      { class: 'pl-nav' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-icon btn--ghost',
          'aria-label': t('plan.semana-anterior'),
          title: t('plan.semana-anterior'),
          onclick: () => a.semana(-1),
        },
        icon('flecha-izq', { size: 18 }),
      ),
      h(
        'strong',
        { 'aria-live': 'polite' },
        t('plan.semana-de', { desde: fmtCorta(v.semana), hasta: fmtCorta(v.finSemana) }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-icon btn--ghost',
          'aria-label': t('plan.semana-siguiente'),
          title: t('plan.semana-siguiente'),
          onclick: () => a.semana(1),
        },
        icon('flecha-dcha', { size: 18 }),
      ),
      boton(t('plan.hoy'), null, () => a.hoy(), 'btn btn-sm'),
    ),
    h('span', { class: 'grow' }),
    insigniaConflictos(v.resumen),
  );
  return barra;
}

// Actions for the page header: New assignment (primary), Suggest, and an overflow menu with the rarely used ones.
export function accionesPiscina(a, { conPiscina = true } = {}) {
  if (!conPiscina) return [boton(t('plan.crear-piscina'), 'mas', () => a.nuevaPiscina(), 'btn btn--primary')];
  return [
    boton(t('plan.nueva-asignacion'), 'mas', () => a.nueva(), 'btn btn--primary'),
    boton(t('plan.sugerir'), 'estrella', () => a.sugerir()),
    menuAcciones({
      etiqueta: t('plan.mas-acciones'),
      items: [
        { label: t('plan.configurar'), icono: 'ajustes', onClick: () => a.configurar() },
        { label: t('plan.nueva-piscina'), icono: 'mas', onClick: () => a.nuevaPiscina() },
        { label: t('plan.imprimir'), icono: 'imprimir', onClick: () => a.imprimir() },
      ],
    }),
  ];
}
