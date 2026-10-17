// Pool configuration dialog (create / edit / delete a pool) and the "suggest distribution" dialog.
import { h, sheet, formFields, fieldError, confirmDialog, toast } from '../ui.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/planificacion.js';
import { piscinaPorDefecto } from '../../application/planificacionService.js';
import { nombreDia } from './formatos-fecha.js';
import { textoCalles, nombreGrupoDe } from './planificacion-textos.js';

// Which form field each validation code of the domain belongs to.
const CAMPO_DE_ERROR = { 'nombre-vacio': 'nombre', longitud: 'longitudM', calles: 'numCalles', intervalo: 'intervaloMin', 'max-por-calle': 'maxPorCalle' };

// opciones: {svc, base (pool to edit, null = new), onGuardada(piscinaId), onEliminada()}
export function abrirConfigPiscina({ svc, base, onGuardada, onEliminada }) {
  const p = base || piscinaPorDefecto();
  const esNueva = !p.id;
  const def = [
    { name: 'nombre', label: t('plan.cfg.nombre'), type: 'text', required: true, full: true },
    { name: 'longitudM', label: t('plan.cfg.longitud'), type: 'select', options: D.LONGITUDES.map((l) => ({ value: l, label: l + ' m' })) },
    { name: 'numCalles', label: t('plan.cfg.calles'), type: 'number', min: 1, max: D.MAX_CALLES, step: 1, required: true },
    { name: 'intervaloMin', label: t('plan.cfg.intervalo'), type: 'select', options: D.INTERVALOS.map((i) => ({ value: i, label: t('plan.cfg.min', { n: i }) })) },
    { name: 'maxPorCalle', label: t('plan.cfg.max'), type: 'number', min: 1, max: 99, step: 1, required: true },
  ];
  const form = formFields(def, p);
  form.el.classList.add('pl-form');
  const filas = D.DIAS.map((d) => {
    const x = p.horario[d];
    const abierto = h('input', { type: 'checkbox', checked: !!x });
    const abre = h('input', { type: 'time', value: x ? x.abre : '07:00', 'aria-label': `${t('plan.cfg.abre')}: ${nombreDia(d)}` });
    const cierra = h('input', { type: 'time', value: x ? x.cierra : '22:00', 'aria-label': `${t('plan.cfg.cierra')}: ${nombreDia(d)}` });
    const sync = () => { abre.disabled = cierra.disabled = !abierto.checked; };
    abierto.addEventListener('change', sync);
    sync();
    return { d, abierto, abre, cierra, nodos: [h('label', { class: 'check' }, abierto, nombreDia(d)), abre, cierra] };
  });
  const errorHorario = h('p', { class: 'field-error', role: 'alert', hidden: true });
  const bloqueHorario = h('fieldset', { class: 'full pl-horario' },
    h('legend', null, t('plan.cfg.horario')),
    h('div', { class: 'pl-hours', role: 'group' }, filas.flatMap((r) => r.nodos)),
    errorHorario);
  form.el.append(bloqueHorario);

  const datos = () => {
    const v = form.values();
    return {
      id: p.id, nombre: v.nombre, longitudM: Number(v.longitudM), numCalles: Number(v.numCalles), intervaloMin: Number(v.intervaloMin), maxPorCalle: Number(v.maxPorCalle),
      horario: Object.fromEntries(filas.map((r) => [r.d, r.abierto.checked ? { abre: r.abre.value, cierra: r.cierra.value } : null])),
    };
  };
  // Shows each domain error next to its field (the schedule ones under the schedule).
  function marcar(errs) {
    errorHorario.hidden = true;
    const rest = [];
    errs.forEach((e) => {
      const n = CAMPO_DE_ERROR[e];
      if (n) fieldError(form.inputs[n], t('plan.err.' + e), { focus: false });
      else rest.push(e);
    });
    if (rest.length) { errorHorario.textContent = rest.map((e) => t('plan.err.' + e)).join(' '); errorHorario.hidden = false; }
    const primero = errs.map((e) => CAMPO_DE_ERROR[e]).filter(Boolean)[0];
    (primero ? form.inputs[primero] : bloqueHorario.querySelector('input:not([disabled])'))?.focus();
  }

  const acciones = [{ label: t('common.cancelar') }];
  if (!esNueva) {
    acciones.push({
      label: t('plan.cfg.eliminar'), danger: true,
      onClick: async () => {
        const n = svc.asignaciones(p.id).length;
        if (!(await confirmDialog(t('plan.cfg.eliminar-confirm', { n }), { danger: true, okLabel: t('common.eliminar') }))) return false;
        const snap = svc.borrarPiscina(p.id);
        toast.undo(t('plan.cfg.eliminada'), () => { svc.restaurarPiscina(snap); onEliminada?.(); });
        onEliminada?.();
      },
    });
  }
  acciones.push({
    label: t('common.guardar'), primary: true,
    onClick: async () => {
      if (!form.validate()) return false;
      const d = datos();
      const errs = D.validarPiscina(d);
      if (errs.length) { marcar(errs); return false; }
      if (!esNueva && d.numCalles < p.numCalles) {
        const ef = svc.efectoReducir(p.id, d.numCalles);
        if ((ef.recortadas.length || ef.fuera.length) && !(await confirmDialog(t('plan.cfg.recorte-confirm', { recortadas: ef.recortadas.length, fuera: ef.fuera.length })))) return false;
      }
      const res = svc.guardarPiscina(d, { recortar: true });
      if (!res.ok) { marcar(res.errores); return false; }
      toast(res.recortadas || res.fuera ? t('plan.cfg.guardada-recorte', { recortadas: res.recortadas, fuera: res.fuera }) : t('plan.cfg.guardada'));
      onGuardada?.(res.piscina.id);
    },
  });
  return sheet({ title: esNueva ? t('plan.nueva-piscina') : t('plan.cfg.titulo'), body: form.el, actions: acciones, className: 'pl-sheet' });
}

// Suggest-distribution dialog: pick a day, a duration and the groups to place; preview the proposal and apply it.
// opciones: {svc, pool, dia, onAplicada(dia)}
export function abrirSugerencia({ svc, pool, dia, onAplicada }) {
  const grupos = svc.grupos();
  const diaSel = h('select', null, D.DIAS.map((d) => h('option', { value: d, selected: d === dia }, nombreDia(d))));
  const dur = h('input', { type: 'number', min: pool.intervaloMin, step: pool.intervaloMin, value: 60 });
  const lista = h('div', { class: 'pl-checks' });
  const vista = h('div', { 'aria-live': 'polite' });
  const checks = new Map();
  let propuestas = [];
  function pintarGrupos() {
    lista.replaceChildren();
    checks.clear();
    const ya = svc.asignaciones(pool.id).filter((a) => !a.fecha && a.dia === Number(diaSel.value)).map((a) => a.grupoId);
    grupos.forEach((g) => {
      const cb = h('input', { type: 'checkbox', checked: !ya.includes(g.id) });
      cb.addEventListener('change', calcular);
      checks.set(g.id, cb);
      lista.append(h('label', { class: 'check' }, cb, g.nombre));
    });
  }
  function calcular() {
    const sel = [...checks].filter(([, cb]) => cb.checked).map(([id]) => id);
    const r = svc.sugerir({ piscinaId: pool.id, dia: Number(diaSel.value), duracionMin: Number(dur.value) || 60, soloGrupos: sel, preferencias: svc.preferenciasHora() });
    propuestas = r.propuestas;
    vista.replaceChildren(
      propuestas.length
        ? h('ul', { class: 'pl-sug' }, propuestas.map((x) => h('li', null, h('strong', null, nombreGrupoDe(grupos, x.grupoId)), ` · ${x.horaInicio}–${x.horaFin} · ${textoCalles(x.calleDesde, x.calleHasta)}`, x.reducida ? ' · ' + t('plan.sug.reducida') : '')))
        : h('p', { class: 'hint' }, t('plan.sug.vacio')),
      ...r.sinHueco.map((s) => h('div', { class: 'alert alert--warn pl-note' }, h('p', null, t(s.motivo === 'cerrado' ? 'plan.sug.cerrado' : 'plan.sug.sin-hueco', { grupo: nombreGrupoDe(grupos, s.grupoId) })))));
  }
  diaSel.addEventListener('change', () => { pintarGrupos(); calcular(); });
  dur.addEventListener('input', calcular);
  pintarGrupos();
  calcular();
  const campo = (etiqueta, control) => h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, etiqueta), control);
  return sheet({
    title: t('plan.sugerir'),
    body: h('div', null, h('p', { class: 'hint' }, t('plan.sug.intro')),
      h('div', { class: 'pl-form' }, h('div', { class: 'field' }, campo(t('plan.sug.dia'), diaSel)), h('div', { class: 'field' }, campo(t('plan.sug.duracion'), dur)),
        h('fieldset', { class: 'full' }, h('legend', null, t('plan.sug.grupos')), lista)), vista),
    actions: [{ label: t('common.cancelar') }, {
      label: t('plan.sug.aplicar'), primary: true,
      onClick: () => {
        if (!propuestas.length) return false;
        const n = svc.aplicarSugerencia(propuestas);
        toast(t('plan.sug.aplicadas', { n }));
        onAplicada?.(Number(diaSel.value));
      },
    }],
    className: 'pl-sheet',
  });
}
