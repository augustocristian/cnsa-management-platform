// "Log load" sheet: searchable swimmer, date, content, session, metres, RPE, minutes, notes with inline validation.
// Swimmer, date and content are remembered between entries ("Log and add another" keeps the sheet open).
import { h, field, fieldError, sheet, toast } from '../ui.js';
import { t, tDate, tContenido, tContenidoDesc } from '../i18n/i18n.js';
import { agruparPorCategoria } from '../../domain/cargas.js';
import { nombreCompleto, ordenarPorApellidos } from '../../domain/nombres.js';
import { combobox } from './combobox.js';
import { abrirFormulario as abrirFormularioContenido } from './cargas-contenidos.js';

const NUEVO = '__nuevo__';
const full = (el) => { el.classList.add('full'); return el; };

// opts: { ctx, svc, nadadores (active), recuerdo: { nadadorId, fecha, tipoId }, hoy, onRegistrada(carga, { otra }), onClose }
export function abrirRegistro({ ctx, svc, nadadores, recuerdo, hoy, onRegistrada, onClose }) {
  const nadador = combobox({
    label: t('cargas.f.nadador'), requerido: true, placeholder: t('cargas.f.nadador-ph'),
    opciones: ordenarPorApellidos(nadadores).map((n) => ({ value: n.id, label: nombreCompleto(n) })), valor: recuerdo.nadadorId || '',
  });
  const fecha = h('input', { type: 'date', value: recuerdo.fecha || hoy });
  const tipo = h('select', { name: 'tipoId' });
  const ayuda = h('p', { class: 'hint', id: 'cg-tipo-ayuda', 'aria-live': 'polite' });
  tipo.setAttribute('aria-describedby', 'cg-tipo-ayuda');
  let previo = '';
  const llenarTipos = (seleccionado = '') => {
    const activos = svc.activos();
    tipo.replaceChildren(
      ...agruparPorCategoria(activos).map((g) => h('optgroup', { label: t('tc.cat.' + g.categoria) }, g.tipos.map((x) => h('option', { value: x.id }, tContenido(x))))),
      h('option', { value: NUEVO }, t('tc.anadir-opcion')));
    if (seleccionado && activos.some((a) => a.id === seleccionado)) tipo.value = seleccionado;
    previo = tipo.value;
    const x = activos.find((a) => a.id === tipo.value);
    ayuda.textContent = x ? tContenidoDesc(x) : '';
  };
  llenarTipos(recuerdo.tipoId);
  tipo.addEventListener('change', () => {
    if (tipo.value === NUEVO) {
      tipo.value = previo;
      abrirFormularioContenido({ ctx, svc, onGuardado: (nuevo) => llenarTipos(nuevo.id) });
      return;
    }
    llenarTipos(tipo.value);
  });

  const sesion = h('select', { name: 'entrenamientoId' }, h('option', { value: '' }, t('tc.sin-sesion')),
    svc.sesiones().slice(0, 80).map((s) => h('option', { value: s.id }, `${tDate(s.fecha)} · ${s.titulo || s.enfoque || ''}`)));
  const metros = h('input', { type: 'number', name: 'metros', min: 1, inputmode: 'numeric', ...(recuerdo.nadadorId ? { autofocus: true } : {}) });
  const rpe = h('input', { type: 'number', name: 'rpe', min: 1, max: 10, inputmode: 'numeric' });
  const minutos = h('input', { type: 'number', name: 'minutos', min: 1, inputmode: 'numeric' });
  const notas = h('input', { type: 'text', name: 'notas', maxlength: 200 });

  const form = h('form', { class: 'form-grid cg-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    full(nadador.el),
    field({ label: t('cargas.f.fecha'), input: fecha, required: true }),
    field({ label: t('cargas.f.tipo'), input: tipo, required: true }),
    full(h('div', { class: 'field' }, ayuda)),
    full(field({ label: t('tc.f.sesion'), input: sesion })),
    field({ label: t('cargas.f.metros'), input: metros, required: true }),
    field({ label: t('cargas.f.rpe'), input: rpe }),
    field({ label: t('cargas.f.minutos'), input: minutos }),
    field({ label: t('cargas.f.notas'), input: notas }));

  const entradas = { nadadorId: nadador.input, fecha, tipo, metros, rpe, minutos, entrenamientoId: sesion };
  const mensaje = (e) => (['rpe', 'minutos', 'tipo-inexistente', 'tipo-inactivo', 'sesion-inexistente'].includes(e.codigo)
    ? t({ rpe: 'tc.err.rpe', minutos: 'tc.err.minutos', 'sesion-inexistente': 'tc.err.sesion' }[e.codigo] || 'tc.err.elige-contenido') : t('cargas.err.' + e.codigo));

  // -> true when saved
  function guardar(otra) {
    const res = svc.registrarCarga({
      nadadorId: nadador.valor(), fecha: fecha.value, tipoId: tipo.value === NUEVO ? '' : tipo.value, metros: metros.value,
      rpe: rpe.value, minutos: minutos.value, notas: notas.value, entrenamientoId: sesion.value,
    });
    if (!res.ok) {
      res.errores.forEach((e, i) => fieldError(entradas[e.campo] || metros, mensaje(e), { focus: i === 0 }));
      return false;
    }
    toast(t('cargas.registrada'));
    onRegistrada(res.carga, { otra });
    if (otra) { // keep swimmer, date and content; clear the rest and go back to the metres
      [metros, rpe, minutos, notas].forEach((i) => { i.value = ''; });
      sesion.value = '';
      metros.focus();
    }
    return true;
  }

  return sheet({
    title: t('cargas.registrar-titulo'), body: form, onClose,
    actions: [
      { label: t('common.cancelar') },
      { label: t('cargas.registrar-otra'), onClick: () => { guardar(true); return false; } },
      { label: t('cargas.registrar'), primary: true, onClick: () => guardar(false) },
    ],
  });
}
