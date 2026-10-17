// Session data (type, material of the day, general notes) and plan tools (templates, copy from another session) of the
// plan editor. Both are collapsible so the rows stay near the top on a phone.
import { h, toast, confirmDialog } from '../ui.js';
import { t, tDate } from '../i18n/i18n.js';
import * as D from '../../domain/entreno.js';
import { fmt } from './entreno-editor-util.js';

const escritorio = () => typeof matchMedia === 'function' && matchMedia('(min-width: 1000px)').matches;

// env: { uid, svc, ctx, sesionId, borrador, repintar() } -> { metaEl, toolsEl }
export function crearDatos(env) {
  const est = env.borrador.estado;
  const CAMPOS = [
    ['tipoSesion', 'entreno.f.tipo-sesion'],
    ['materialDia', 'entreno.f.material-dia'],
    ['notasGenerales', 'entreno.f.notas-generales'],
  ];
  const inputs = CAMPOS.map(([k, clave]) => {
    const el = h('input', { type: 'text', value: est[k], autocomplete: 'off', 'data-campo': k });
    el.addEventListener('input', () => {
      est[k] = el.value;
      env.borrador.cambio();
    });
    return [k, h('label', null, t(clave), el), el];
  });
  const metaEl = h(
    'details',
    { class: 'enp-datos', open: escritorio() },
    h(
      'summary',
      null,
      t('entreno.f.datos-sesion'),
      est.tipoSesion ? h('span', { class: 'enp-datos-res' }, ' · ' + est.tipoSesion) : null,
    ),
    h(
      'div',
      { class: 'enp-meta' },
      inputs.map(([, label]) => label),
    ),
  );
  // keeps the summary text in sync with the type of session
  const resumen = () => {
    const sm = metaEl.querySelector('summary');
    sm.replaceChildren(
      t('entreno.f.datos-sesion'),
      est.tipoSesion ? h('span', { class: 'enp-datos-res' }, ' · ' + est.tipoSesion) : '',
    );
  };
  inputs[0][2].addEventListener('input', resumen);

  async function cargarPlan(plan) {
    if (!plan) return;
    const hayContenido = est.lineas.some((l) => !D.filaVacia(l));
    if (hayContenido && !(await confirmDialog(t('entreno.confirm-reemplazar')))) return;
    env.borrador.cargar(plan);
    inputs.forEach(([k, , el]) => {
      el.value = est[k] || '';
    });
    resumen();
    env.repintar();
    toast(t('entreno.plan-cargado'));
  }

  const plantillas = env.svc.plantillas();
  const selPl = h(
    'select',
    { id: env.uid + '-pl' },
    ...plantillas.map((p) => h('option', { value: p.id }, `${t('entreno.pl.' + p.id)} (${fmt(p.resumen.metros)} m)`)),
  );
  const otras = env.svc.sesionesConPlan({ salvo: env.sesionId });
  const selSes = h(
    'select',
    { id: env.uid + '-ses', disabled: !otras.length },
    ...(otras.length
      ? otras.map((s) => {
          const g = (env.ctx.store.get('Grupos', s.grupoId) || {}).nombre || '';
          return h(
            'option',
            { value: s.id },
            [tDate(String(s.fecha).slice(0, 10)), g, s.titulo].filter(Boolean).join(' · '),
          );
        })
      : [h('option', { value: '' }, t('entreno.sin-otras'))]),
  );
  const toolsEl = h(
    'details',
    { class: 'enp-tools-d' },
    h('summary', null, t('entreno.herramientas')),
    h(
      'div',
      { class: 'enp-tools' },
      h(
        'div',
        { class: 'enp-tool' },
        h('label', null, t('entreno.plantilla'), selPl),
        h(
          'button',
          { type: 'button', class: 'btn', onclick: () => cargarPlan(env.svc.planDesdePlantilla(selPl.value)) },
          t('entreno.usar-plantilla'),
        ),
      ),
      h(
        'div',
        { class: 'enp-tool' },
        h('label', null, t('entreno.copiar-de'), selSes),
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            disabled: !otras.length,
            onclick: () => cargarPlan(env.svc.planDesdeSesion(selSes.value)),
          },
          t('entreno.copiar'),
        ),
      ),
    ),
  );

  return { metaEl, toolsEl };
}
