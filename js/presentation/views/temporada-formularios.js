// Season dialogs: season, phase, event and week editing. Every one is a `sheet` with visible labels and INLINE validation
// (errors next to their field, the first one focused). Deleting is immediate and offers Undo through the service snapshots.
// Presentation only: validation rules are in domain/temporada.js and persistence in the service.
import { h, sheet, formFields, fieldError, toast } from '../ui.js';
import { t, tNum, tContenido } from '../i18n/i18n.js';
import { icon } from '../icons.js';
import * as D from '../../domain/temporada.js';
import { CATEGORIAS } from '../../domain/schema.js';
import { fmtCorta, fmtRango } from './formatos-fecha.js';

const mensajeError = (e) => t('tp.err.' + e.codigo);
const alerta = (tono, ...hijos) =>
  h(
    'div',
    { class: `alert alert--${tono}`, role: tono === 'danger' ? 'alert' : null },
    icon('aviso', { size: 18 }),
    h('div', null, hijos),
  );

// Shows service errors [{campo, codigo}] next to their fields; the ones without a field go to `resumen`. Focuses the first field.
export function mostrarErrores(form, errores, resumen) {
  let primero = null;
  const sueltos = [];
  errores.forEach((e) => {
    const input = form.inputs[e.campo];
    if (input) {
      fieldError(input, mensajeError(e), { focus: false });
      primero ||= input;
    } else sueltos.push(e);
  });
  resumen.replaceChildren(
    ...(sueltos.length ? [alerta('danger', h('p', null, sueltos.map(mensajeError).join(' ')))] : []),
  );
  primero?.focus();
}

// Adds the Delete button (immediate + Undo toast) to a dialog's actions.
function accionEliminar({ etiquetaToast, eliminar, restaurar, onCambio }) {
  return {
    label: t('common.eliminar'),
    danger: true,
    onClick: () => {
      const snap = eliminar();
      toast.undo(etiquetaToast, () => {
        restaurar(snap);
        onCambio?.();
      });
      onCambio?.();
    },
  };
}

// ---------- Season ----------
// opciones: {svc, base (null = new), onGuardada(temporada), onEliminada(), onCambio()}
export function abrirTemporada({ svc, base, onGuardada, onEliminada, onCambio }) {
  const esNueva = !base;
  const prop = D.propuestaTemporada(svc.hoy());
  const v = base || {
    nombre: `${t('tp.temporada')} ${prop.anio}-${String(prop.anio + 1).slice(2)}`,
    inicio: prop.inicio,
    fin: prop.fin,
    grupoId: '',
    notas: '',
    activa: !svc.temporadas().length,
  };
  const def = [
    { name: 'nombre', label: t('tp.f.nombre'), type: 'text', required: true, full: true },
    { name: 'inicio', label: t('tp.f.inicio'), type: 'date', required: true },
    { name: 'fin', label: t('tp.f.fin'), type: 'date', required: true },
    {
      name: 'grupoId',
      label: t('tp.f.grupo'),
      type: 'select',
      options: [
        { value: '', label: t('tp.f.todos-grupos') },
        ...svc.grupos().map((g) => ({ value: g.id, label: g.nombre })),
      ],
      full: true,
    },
    { name: 'notas', label: t('tp.f.notas'), type: 'textarea' },
    { name: 'activa', label: t('tp.f.activa'), type: 'checkbox' },
    ...(esNueva ? [{ name: 'conFases', label: t('tp.f.con-fases'), type: 'checkbox', default: true }] : []),
  ];
  const form = formFields(def, { ...v, conFases: true });
  form.el.classList.add('tp-form');
  const resumen = h('div', { 'aria-live': 'polite' });
  const acciones = [{ label: t('common.cancelar') }];
  if (!esNueva) {
    acciones.push(
      accionEliminar({
        etiquetaToast: t('tp.temporada.eliminada'),
        eliminar: () => svc.borrarTemporada(v.id),
        restaurar: (s) => svc.restaurarTemporada(s),
        onCambio: () => {
          onEliminada?.();
          onCambio?.();
        },
      }),
    );
  }
  acciones.push({
    label: t('common.guardar'),
    primary: true,
    onClick: () => {
      if (!form.validate()) return false;
      const val = form.values();
      const r = svc.guardarTemporada({ ...val, id: esNueva ? '' : v.id }, { conFases: !!val.conFases });
      if (!r.ok) {
        mostrarErrores(form, r.errores, resumen);
        return false;
      }
      toast(t('tp.temporada.guardada'));
      onGuardada?.(r.temporada);
      return true;
    },
  });
  return sheet({
    title: esNueva ? t('tp.temporada.nueva') : t('tp.temporada.editar'),
    body: h('div', null, form.el, resumen),
    actions: acciones,
    className: 'tp-sheet',
  });
}

// ---------- Phase ----------
// opciones: {svc, m (model), sel (selected week n), base, onCambio()}
export function abrirFase({ svc, m, sel, base, onCambio }) {
  const esNueva = !base || !base.id;
  const prop = D.propuestaFase(m, sel);
  const v =
    base && base.id
      ? base
      : {
          nombre: '',
          tipo: 'preparacion-general',
          inicio: prop.inicio,
          fin: prop.fin,
          objetivo: '',
          color: D.COLOR_FASE['preparacion-general'],
          ...base,
        };
  const def = [
    { name: 'nombre', label: t('tp.f.nombre'), type: 'text', required: true, full: true },
    {
      name: 'tipo',
      label: t('tp.f.tipo-fase'),
      type: 'select',
      options: D.TIPOS_FASE.map((x) => ({ value: x, label: t('tp.fase.' + x) })),
    },
    { name: 'color', label: t('tp.f.color'), type: 'color' },
    { name: 'inicio', label: t('tp.f.inicio'), type: 'date', required: true },
    { name: 'fin', label: t('tp.f.fin'), type: 'date', required: true },
    { name: 'objetivo', label: t('tp.f.objetivo'), type: 'textarea' },
  ];
  const form = formFields(def, v);
  form.el.classList.add('tp-form');
  const c = form.inputs;
  c.tipo.addEventListener('change', () => {
    const previo = D.COLOR_FASE[v.tipo];
    if (!c.color.dataset.tocado || c.color.value === previo) c.color.value = D.COLOR_FASE[c.tipo.value];
    if (!c.nombre.value.trim() || D.TIPOS_FASE.some((x) => t('tp.fase.' + x) === c.nombre.value))
      c.nombre.value = t('tp.fase.' + c.tipo.value);
  });
  c.color.addEventListener('input', () => {
    c.color.dataset.tocado = '1';
  });
  const estado = h('div', { 'aria-live': 'polite' });
  let forzar = false;
  let guardarBtn = null;
  const acciones = [{ label: t('common.cancelar') }];
  if (!esNueva)
    acciones.push(
      accionEliminar({
        etiquetaToast: t('tp.fase.eliminada'),
        eliminar: () => svc.borrarFase(v.id),
        restaurar: (f) => svc.restaurarFase(f),
        onCambio,
      }),
    );
  acciones.push({
    label: t('common.guardar'),
    primary: true,
    onClick: () => {
      if (!form.validate()) return false;
      const r = svc.guardarFase(
        {
          ...form.values(),
          id: esNueva ? '' : v.id,
          temporadaId: m.temporada.id,
          orden: esNueva ? undefined : v.orden,
        },
        { forzar },
      );
      if (r.ok) {
        toast(t('tp.fase.guardada'));
        if (r.avisos.length) toast(t('tp.v.fase-fuera-temporada', { fase: r.fase.nombre }));
        onCambio?.();
        return true;
      }
      if (r.errores) mostrarErrores(form, r.errores, estado);
      else if (r.requiereForzar) {
        estado.replaceChildren(
          h(
            'div',
            { class: 'alert alert--warn' },
            icon('aviso', { size: 18 }),
            h(
              'div',
              null,
              h('p', { class: 'alert-title' }, t('tp.fase.solapa')),
              h(
                'ul',
                null,
                r.conflictos.map((x) => h('li', null, x.fase)),
              ),
            ),
          ),
        );
        forzar = true;
        guardarBtn.textContent = t('tp.guardar-igualmente');
      }
      return false;
    },
  });
  const mo = sheet({
    title: esNueva ? t('tp.fase.nueva') : t('tp.fase.editar'),
    body: h('div', null, form.el, estado),
    actions: acciones,
    className: 'tp-sheet',
  });
  guardarBtn = mo.el.querySelector('.sheet-actions .btn--primary');
  form.el.addEventListener('input', () => {
    forzar = false;
    guardarBtn.textContent = t('common.guardar');
  });
  return mo;
}

// ---------- Event ----------
export function abrirEvento({ svc, m, sel, base, onCambio }) {
  const esNueva = !base || !base.id;
  const v =
    base && base.id
      ? base
      : {
          tipo: 'competicion',
          nombre: '',
          inicio: D.propuestaEvento(m, sel).inicio,
          fin: '',
          lugar: '',
          prioridad: 'C',
          pruebas: '',
          categoria: '',
          grupoId: m.temporada.grupoId,
          notas: '',
          ...base,
        };
  const def = [
    {
      name: 'tipo',
      label: t('tp.f.tipo-evento'),
      type: 'select',
      options: D.TIPOS_EVENTO.map((x) => ({ value: x, label: t('tp.evento.' + x) })),
    },
    {
      name: 'prioridad',
      label: t('tp.f.prioridad'),
      type: 'select',
      options: [
        { value: '', label: '—' },
        ...D.PRIORIDADES.map((p) => ({ value: p, label: t('tp.prioridad-n', { p }) })),
      ],
    },
    { name: 'nombre', label: t('tp.f.nombre'), type: 'text', required: true, full: true },
    { name: 'inicio', label: t('tp.f.inicio'), type: 'date', required: true },
    { name: 'fin', label: t('tp.f.fin-opc'), type: 'date' },
    { name: 'lugar', label: t('tp.f.lugar'), type: 'text', full: true },
    { name: 'pruebas', label: t('tp.f.pruebas'), type: 'text', full: true },
    {
      name: 'categoria',
      label: t('tp.f.categoria'),
      type: 'select',
      options: [{ value: '', label: '—' }, ...CATEGORIAS.map((c) => ({ value: c, label: c }))],
    },
    {
      name: 'grupoId',
      label: t('tp.f.grupo'),
      type: 'select',
      options: [
        { value: '', label: t('tp.f.todos-grupos') },
        ...svc.grupos().map((g) => ({ value: g.id, label: g.nombre })),
      ],
    },
    { name: 'notas', label: t('tp.f.notas'), type: 'textarea' },
  ];
  const form = formFields(def, v);
  form.el.classList.add('tp-form');
  const estado = h('div', { 'aria-live': 'polite' });
  const acciones = [{ label: t('common.cancelar') }];
  if (!esNueva)
    acciones.push(
      accionEliminar({
        etiquetaToast: t('tp.ev.eliminado'),
        eliminar: () => svc.borrarEvento(v.id),
        restaurar: (e) => svc.restaurarEvento(e),
        onCambio,
      }),
    );
  acciones.push({
    label: t('common.guardar'),
    primary: true,
    onClick: () => {
      if (!form.validate()) return false;
      const r = svc.guardarEvento({ ...form.values(), id: esNueva ? '' : v.id, temporadaId: m.temporada.id });
      if (!r.ok) {
        mostrarErrores(form, r.errores, estado);
        return false;
      }
      toast(t('tp.ev.guardado'));
      if (r.avisos.length)
        toast(t('tp.v.evento-fuera-temporada', { evento: r.evento.nombre, desde: fmtCorta(r.evento.inicio) }));
      onCambio?.();
      return true;
    },
  });
  return sheet({
    title: esNueva ? t('tp.ev.nuevo') : t('tp.ev.editar'),
    body: h('div', null, form.el, estado),
    actions: acciones,
    className: 'tp-sheet',
  });
}

// ---------- Week ----------
export function abrirSemana({ svc, m, s, onCambio }) {
  const activos = m.tipos.filter((c) => c.activo || s.plan.contenidos[c.id]);
  const def = [
    { name: 'volumen', label: t('tp.f.volumen'), type: 'number', min: 0, step: 50 },
    { name: 'intensidad', label: t('tp.f.intensidad'), type: 'number', min: 1, max: 10, step: 1 },
    { name: 'objetivo', label: t('tp.f.objetivo'), type: 'text', full: true },
    { name: 'notas', label: t('tp.f.notas'), type: 'textarea' },
  ];
  const form = formFields(def, {
    volumen: s.plan.volumen ?? '',
    intensidad: s.plan.intensidad ?? '',
    objetivo: s.plan.objetivo,
    notas: s.plan.notas,
  });
  form.el.classList.add('tp-form');
  const inputs = new Map();
  const suma = h('p', { class: 'hint', 'aria-live': 'polite' });
  const cont = h(
    'fieldset',
    { class: 'tp-cont-set' },
    h('legend', null, t('tp.f.reparto')),
    h(
      'div',
      { class: 'tp-cont' },
      activos.map((c) => {
        const inp = h('input', {
          type: 'number',
          min: 0,
          step: 50,
          value: s.plan.contenidos[c.id] || '',
          'aria-label': tContenido(c),
        });
        inputs.set(c.id, inp);
        return h(
          'label',
          null,
          h('span', { class: 'tp-fdot', style: { background: c.color }, 'aria-hidden': 'true' }),
          h('span', null, tContenido(c)),
          inp,
        );
      }),
    ),
    suma,
  );
  const leer = () =>
    Object.fromEntries([...inputs.entries()].map(([k, i]) => [k, i.value]).filter(([, x]) => String(x).trim() !== ''));
  const refrescar = () => {
    suma.textContent = t('tp.f.suma-reparto', { m: tNum(Math.round(D.sumaContenidos(D.parseContenidos(leer())))) });
  };
  cont.addEventListener('input', refrescar);
  refrescar();
  const estado = h('div', { 'aria-live': 'polite' });
  return sheet({
    title: `${t('tp.semana.editar')} ${s.n} · ${fmtRango(s.desde, s.hasta)}`,
    body: h('div', null, form.el, cont, estado),
    className: 'tp-sheet',
    actions: [
      { label: t('common.cancelar') },
      {
        label: t('common.guardar'),
        primary: true,
        onClick: () => {
          const val = form.values();
          const r = svc.guardarSemana(m.temporada.id, s.lunes, {
            volumen: val.volumen === '' ? null : val.volumen,
            intensidad: val.intensidad === '' ? null : val.intensidad,
            objetivo: val.objetivo,
            notas: val.notas,
            contenidos: D.parseContenidos(leer()),
          });
          if (!r.ok) {
            mostrarErrores(form, r.errores, estado);
            return false;
          }
          toast(t('tp.semana.guardada'));
          onCambio?.();
          return true;
        },
      },
    ],
  });
}
