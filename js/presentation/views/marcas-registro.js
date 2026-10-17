// "Log a time" sheet: searchable swimmer, event, pool, time with numeric mask and live interpretation, optional swimsuit.
import { h, field, fieldError, sheet, toast, timeInput } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { opcionesPruebas, PISCINAS } from '../../domain/marcas.js';
import { interpretarTiempo } from '../../domain/tiempos.js';
import { nombreCompleto, ordenarPorApellidos } from '../../domain/nombres.js';
import { TIPOS_BANADOR } from '../../domain/banadores.js';
import { abrirFormulario as abrirFormularioBanador, etiquetaTipoBanador, nombreBanador } from './banadores-catalogo.js';
import { combobox } from './combobox.js';
import { pruebaLabel } from './marcas-util.js';

const NUEVO = '__nuevo__';
const full = (el) => { el.classList.add('full'); return el; };

// opts: { ctx, svc, banSvc, nadadores (active), marcas, recuerdo: { nadadorId, piscina, fecha }, hoy, onRegistrada(marca), onClose }
export function abrirRegistro({ ctx, svc, banSvc, nadadores, marcas, recuerdo, hoy, onRegistrada, onClose }) {
  const lista = ordenarPorApellidos(nadadores);
  const nadador = combobox({
    label: t('marcas.f.nadador'), requerido: true, placeholder: t('marcas.f.nadador-ph'),
    opciones: lista.map((n) => ({ value: n.id, label: nombreCompleto(n) })), valor: recuerdo.nadadorId || '',
  });
  const fecha = h('input', { type: 'date', value: recuerdo.fecha || hoy });
  const prueba = h('select', null, opcionesPruebas(marcas, { conPredefinidas: true }).map((o) => h('option', { value: o.valor, selected: o.valor === recuerdo.prueba }, pruebaLabel(o.valor))));
  const piscina = h('select', null, PISCINAS.map((p) => h('option', { value: p, selected: p === (recuerdo.piscina || '25') }, t('marcas.piscina-n', { n: p }))));
  const tiempo = timeInput(h('input', { type: 'text', class: 'mc-time-input', placeholder: '1:02.45', ...(recuerdo.nadadorId ? { autofocus: true } : {}) }));
  const vivo = h('p', { class: 'mc-live', 'aria-live': 'polite' });
  tiempo.addEventListener('input', () => {
    const r = interpretarTiempo(tiempo.value);
    vivo.textContent = r.estado === 'ok' ? t('marcas.tiempo-interpretado', { t: r.texto }) : '';
    vivo.classList.toggle('mc-live--ok', r.estado === 'ok');
  });
  const competicion = h('input', { type: 'text', maxlength: 80 });
  const notas = h('input', { type: 'text', maxlength: 200 });

  // Optional swimsuit: grouped by type; "Add swimsuit…" opens the catalogue form and selects the new one.
  const banador = h('select', null);
  let previo = '';
  const llenarBanadores = (seleccionar = '') => {
    const todos = banSvc.disponiblesParaMarca(seleccionar);
    banador.replaceChildren(h('option', { value: '' }, t('marcas.banador-ninguno')),
      ...TIPOS_BANADOR.map((tp) => {
        const del = todos.filter((b) => b.tipo === tp);
        return del.length ? h('optgroup', { label: etiquetaTipoBanador(tp) }, del.map((b) => h('option', { value: b.id }, nombreBanador(b)))) : null;
      }).filter(Boolean),
      h('option', { value: NUEVO }, t('marcas.banador-anadir')));
    banador.value = seleccionar;
    previo = banador.value;
  };
  llenarBanadores('');
  banador.addEventListener('change', () => {
    if (banador.value !== NUEVO) { previo = banador.value; return; }
    banador.value = previo;
    abrirFormularioBanador({ ctx, svc: banSvc, tipoInicial: 'competicion', onGuardado: (b) => llenarBanadores(b.id) });
  });

  const form = h('form', { class: 'form-grid mc-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    full(nadador.el),
    field({ label: t('marcas.f.fecha'), input: fecha, required: true }),
    field({ label: t('marcas.f.prueba'), input: prueba, required: true }),
    field({ label: t('marcas.f.piscina'), input: piscina }),
    full(field({ label: t('marcas.f.tiempo'), input: tiempo, required: true, hint: t('marcas.f.tiempo-ayuda') })),
    h('div', { class: 'field full' }, vivo),
    full(field({ label: t('marcas.banador'), input: banador })),
    field({ label: t('marcas.f.competicion'), input: competicion }),
    field({ label: t('marcas.f.notas'), input: notas }));

  const entradas = { nadadorId: nadador.input, fecha, prueba, piscina, tiempo };
  const guardar = () => {
    const r = svc.registrar({
      nadadorId: nadador.valor(), fecha: fecha.value, prueba: prueba.value, piscina: piscina.value, tiempo: tiempo.value,
      competicion: competicion.value, notas: notas.value, banadorId: banador.value === NUEVO ? '' : banador.value,
    });
    if (!r.ok) {
      r.errores.forEach((e, i) => fieldError(entradas[e.campo] || tiempo, t('marcas.err.' + e.codigo), { focus: i === 0 }));
      return false;
    }
    toast(t('marcas.registrada'));
    onRegistrada(r.marca);
    return true;
  };
  return sheet({
    title: t('marcas.registrar-titulo'), body: form, onClose,
    actions: [{ label: t('common.cancelar') }, { label: t('marcas.registrar'), primary: true, onClick: guardar }],
  });
}
