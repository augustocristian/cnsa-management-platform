// Assignment dialog (create, edit, duplicate, move) of the pool planning. A sheet with the form, the live conflict notes and the
// "save anyway" confirmation for warnings. Presentation only: rules live in domain/planificacion.js, saving in the service.
import { h, sheet, formFields, fieldError, clearFieldError, toast } from '../ui.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/planificacion.js';
import { nombreDia } from './formatos-fecha.js';
import { mensajeConflicto } from './planificacion-textos.js';
import { notasConflicto } from './planificacion-conflictos.js';

// Which form field each conflict code points at (shown inline next to the field as well as in the notes).
const CAMPO_DE_CONFLICTO = { 'hora-invalida': 'horaFin', 'calle-fuera-rango': 'calleHasta', 'dia-invalido': 'dia', 'sin-grupo': 'grupoId', 'piscina-inexistente': 'piscinaId' };

// opciones: {svc, row (initial values; row.id => edit), piscinaId, dia, abrirOtro(row) (for "duplicate"), onCambio()}
export function abrirFormularioAsignacion({ svc, row, piscinaId, dia, abrirOtro, onCambio }) {
  const pools = svc.piscinas();
  if (!pools.length) return null;
  const grupos = svc.grupos();
  const esNueva = !row.id;
  const entrenadores = svc.entrenadores();
  const inicial = {
    piscinaId: row.piscinaId || piscinaId || pools[0].id, dia: row.dia || dia, fecha: row.fecha || '',
    horaInicio: row.horaInicio || '17:00', horaFin: row.horaFin || '18:00', calleDesde: row.calleDesde || 1, calleHasta: row.calleHasta || row.calleDesde || 1,
    grupoId: row.grupoId || '', entrenadorId: row.entrenadorId || '', notas: row.notas || '',
  };
  const piscina0 = pools.find((p) => p.id === inicial.piscinaId) || pools[0];
  const entOpts = [{ value: '', label: t('plan.sin-entrenador-opt') }, ...entrenadores.map((e) => ({ value: e, label: e }))];
  if (inicial.entrenadorId && !entrenadores.includes(inicial.entrenadorId)) entOpts.push({ value: inicial.entrenadorId, label: inicial.entrenadorId });
  const def = [
    { name: 'piscinaId', label: t('plan.f.piscina'), type: 'select', options: pools.map((p) => ({ value: p.id, label: p.nombre })), required: true },
    { name: 'dia', label: t('plan.f.dia'), type: 'select', options: D.DIAS.map((d) => ({ value: d, label: nombreDia(d) })) },
    { name: 'horaInicio', label: t('plan.f.inicio'), type: 'time', step: piscina0.intervaloMin * 60, required: true },
    { name: 'horaFin', label: t('plan.f.fin'), type: 'time', step: piscina0.intervaloMin * 60, required: true },
    { name: 'calleDesde', label: t('plan.f.desde'), type: 'number', min: 1, step: 1, required: true },
    { name: 'calleHasta', label: t('plan.f.hasta'), type: 'number', min: 1, step: 1, required: true },
    { name: 'grupoId', label: t('plan.f.grupo'), type: 'select', options: [{ value: '', label: '—' }, ...grupos.map((g) => ({ value: g.id, label: g.nombre }))], required: true },
    { name: 'entrenadorId', label: t('plan.f.entrenador'), type: 'select', options: entOpts },
    { name: 'fecha', label: t('plan.f.fecha'), type: 'date', full: true, hint: t('plan.f.fecha-ayuda') },
    { name: 'notas', label: t('plan.f.notas'), type: 'textarea' },
  ];
  const form = formFields(def, inicial);
  form.el.classList.add('pl-form');
  const campo = form.inputs;
  const estado = h('div', { 'aria-live': 'polite' });
  let forzar = false;
  let tocado = !esNueva; // a brand-new form stays quiet until the person edits it or tries to save
  let btnGuardar = null;
  let entDefecto = (grupos.find((g) => g.id === inicial.grupoId) || {}).entrenador || '';

  const leer = () => ({ ...row, ...form.values(), id: row.id || '' });
  function marcarCampos(conflictos) {
    Object.values(CAMPO_DE_CONFLICTO).forEach((n) => clearFieldError(campo[n]));
    conflictos.filter((c) => c.severidad === 'error').forEach((c) => {
      const n = CAMPO_DE_CONFLICTO[c.tipo];
      if (n && !campo[n].hasAttribute('aria-invalid')) fieldError(campo[n], mensajeConflicto(c), { focus: false });
    });
  }
  const refrescar = () => {
    const v = leer();
    campo.dia.disabled = !!v.fecha;
    if (v.fecha) { const dd = D.diaDeFecha(v.fecha); if (!Number.isNaN(dd)) campo.dia.value = String(dd); }
    const conflictos = svc.evaluar(leer()).filter((c) => c.severidad !== 'info');
    marcarCampos(tocado ? conflictos : []);
    estado.replaceChildren(...(tocado ? notasConflicto(conflictos, false) : []));
    forzar = false;
    if (btnGuardar) btnGuardar.textContent = t('common.guardar');
  };
  campo.grupoId.addEventListener('change', () => {
    const g = grupos.find((x) => x.id === campo.grupoId.value);
    const sel = campo.entrenadorId;
    if (g && g.entrenador && (sel.value === '' || sel.value === entDefecto)) {
      if (![...sel.options].some((o) => o.value === g.entrenador)) sel.append(h('option', { value: g.entrenador }, g.entrenador));
      sel.value = g.entrenador;
    }
    entDefecto = g ? g.entrenador || '' : '';
  });
  form.el.addEventListener('input', () => { tocado = true; refrescar(); });
  form.el.addEventListener('change', () => { tocado = true; refrescar(); });

  const guardar = () => {
    tocado = true;
    if (!form.validate()) return false;
    const res = svc.guardarAsignacion(leer(), { forzar });
    if (res.ok) { toast(t('plan.guardada')); onCambio?.(); return true; }
    const visibles = res.conflictos.filter((c) => c.severidad !== 'info');
    marcarCampos(visibles);
    estado.replaceChildren(...notasConflicto(visibles, true));
    if (res.requiereForzar) { forzar = true; btnGuardar.textContent = t('plan.guardar-igualmente'); }
    return false;
  };

  const acciones = [{ label: t('common.cancelar') }];
  if (!esNueva) {
    acciones.push({
      label: t('common.eliminar'), danger: true,
      onClick: () => {
        const fila = svc.borrarAsignacion(row.id);
        toast.undo(t('plan.eliminada'), () => { svc.restaurarAsignacion(fila); onCambio?.(); });
        onCambio?.();
      },
    });
    acciones.push({
      label: t('plan.duplicar'),
      onClick: (close) => {
        const sig = row.fecha ? D.sumarDias(row.fecha, 1) : '';
        const nuevo = { ...leer(), id: '', fecha: sig, dia: sig ? D.diaDeFecha(sig) : (Number(row.dia) % 7) + 1 };
        close();
        setTimeout(() => abrirOtro(nuevo), 0);
        return false;
      },
    });
  }
  acciones.push({ label: t('common.guardar'), primary: true, onClick: guardar });
  const m = sheet({ title: esNueva ? t('plan.nueva-asignacion') : t('plan.editar-asignacion'), body: h('div', null, form.el, estado), actions: acciones, className: 'pl-sheet' });
  btnGuardar = m.el.querySelector('.sheet-actions .btn--primary');
  refrescar();
  return m;
}
