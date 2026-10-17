// Swimmer form in a sheet: the essential fields first, the rest under "More data", inline validation,
// "Save and add another" for new swimmers. Business rules live in domain/nadadores.js and nadadoresService.js.
import { h, sheet, field, fieldError, toast } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { esActivo } from '../../domain/nadadores.js';
import { bloqueCategoria } from './nadadores-categoria.js';
import { textoValidacion } from './datos-integridad.js';

// On touch devices focusing a text field opens the keyboard and hides half the form: the sheet focuses its body instead.
const tactil = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

const SEXOS = [
  ['F', 'nadadores.femenino'],
  ['M', 'nadadores.masculino'],
];
const EXTRAS = ['email', 'telefono', 'tutor', 'licencia', 'notas'];

// vc: {ctx, svc}. nadador: record to edit, or null for a new swimmer. opciones: {alGuardar(fila), defecto:{grupoId}}
export function abrirFormulario(vc, nadador, { alGuardar = () => {}, defecto = {} } = {}) {
  const { ctx, svc } = vc;
  const esNuevo = !nadador;
  const n = nadador || { activo: 'true', sexo: 'F', ...defecto };
  const grupos = ctx.store.list('Grupos');
  const inputs = {};
  const iniciales = {};

  const campo = (clave, label, input, { required = false, full = false, hint } = {}) => {
    inputs[clave] = input;
    iniciales[clave] = input.value;
    const f = field({ label, input, required, hint });
    if (full) f.classList.add('full');
    return f;
  };
  // These are other people's data: browser autofill (the coach's own name, phone...) would be wrong, hence autocomplete="off".
  const texto = (clave, label, atributos = {}, opciones = {}) =>
    campo(
      clave,
      label,
      h('input', { type: 'text', value: n[clave] ?? '', autocomplete: 'off', ...atributos }),
      opciones,
    );
  const seleccion = (clave, label, opts, actual) =>
    campo(
      clave,
      label,
      h(
        'select',
        null,
        opts.map(([v, txt]) => h('option', { value: v, selected: v === actual }, txt)),
      ),
    );

  const nombre = texto(
    'nombre',
    t('nadadores.f-nombre'),
    { autocapitalize: 'words', enterkeyhint: 'next' },
    { required: true },
  );
  const apellidos = texto(
    'apellidos',
    t('nadadores.f-apellidos'),
    { autocapitalize: 'words', enterkeyhint: 'next' },
    { required: true },
  );
  const nacimiento = campo(
    'fechaNacimiento',
    t('nadadores.f-nacimiento'),
    h('input', { type: 'date', value: n.fechaNacimiento ?? '' }),
  );
  const sexo = seleccion(
    'sexo',
    t('nadadores.f-sexo'),
    SEXOS.map(([v, k]) => [v, t(k)]),
    n.sexo,
  );
  const grupo = seleccion(
    'grupoId',
    t('nadadores.f-grupo'),
    [['', t('nadadores.sin-grupo')], ...grupos.map((g) => [g.id, g.nombre])],
    n.grupoId || '',
  );
  const categoria = bloqueCategoria(svc.categorias, n, inputs);

  const masDatos = [
    ...categoria.extras,
    texto('email', t('nadadores.f-email'), {
      type: 'email',
      inputmode: 'email',
      autocapitalize: 'none',
      spellcheck: 'false',
    }),
    texto('telefono', t('nadadores.f-telefono'), { type: 'tel', inputmode: 'tel' }),
    texto('tutor', t('nadadores.f-tutor'), {}, { full: true }),
    texto('licencia', t('nadadores.f-licencia')),
    seleccion(
      'activo',
      t('nadadores.f-estado'),
      [
        ['true', t('nadadores.activo')],
        ['false', t('nadadores.inactivo')],
      ],
      esActivo(n) ? 'true' : 'false',
    ),
    campo('notas', t('nadadores.f-notas'), h('textarea', { rows: 3 }, n.notas || ''), {
      full: true,
      hint: t('dat.notas.aviso'),
    }),
  ];
  const abierto =
    categoria.manualInicial ||
    categoria.controles.chkMaster.checked ||
    EXTRAS.some((k) => String(n[k] || '').trim()) ||
    !esActivo(n);
  const detalle = h(
    'details',
    { class: 'nad-masdatos full', open: abierto },
    h('summary', null, t('nadadores.mas-datos')),
    h('div', { class: 'form-grid nad-masgrid' }, masDatos),
  );

  const cuerpo = h(
    'div',
    { class: 'nad-formbody', tabindex: '-1' },
    h('div', { class: 'form-grid' }, nombre, apellidos, nacimiento, sexo, categoria.vivo, grupo, detalle),
  );
  // Initial focus: the first name on a computer, the sheet itself on a phone (no keyboard unless the user taps a field).
  (tactil() ? cuerpo : inputs.nombre).setAttribute('data-autofocus', '1');

  const leer = () => {
    const fila = { ...n };
    Object.keys(inputs).forEach((k) => {
      fila[k] = inputs[k].value.trim();
    });
    const c = categoria.datos();
    fila.licenciaMaster = c.licenciaMaster ? 'true' : 'false';
    fila.categoriaManual = c.categoriaManual;
    return fila;
  };

  function mostrarErrores(r) {
    Object.values(inputs).forEach((i) => fieldError(i, ''));
    let primero = null;
    r.errores.forEach((e) => {
      const input = inputs[e.campo];
      if (!input) return;
      fieldError(input, r.delStore ? t('dat.val.' + e.codigo) : t('nadadores.err.' + e.codigo), { focus: false });
      primero ||= input;
    });
    if (primero) {
      if (detalle.contains(primero)) detalle.open = true;
      primero.focus();
    } else toast.error(textoValidacion({ errores: r.errores }));
  }

  function limpiar() {
    Object.keys(inputs).forEach((k) => {
      if (k !== 'grupoId' && k !== 'sexo') inputs[k].value = iniciales[k];
      fieldError(inputs[k], '');
    });
    const { chkMaster, chkManual } = categoria.controles;
    chkMaster.checked = false;
    chkManual.checked = false;
    categoria.actualizar();
    detalle.open = false;
    inputs.nombre.focus();
  }

  const guardar = (otro) => () => {
    const r = svc.guardar(leer());
    if (!r.ok) {
      mostrarErrores(r);
      return false;
    }
    toast(t('nadadores.guardado'));
    alGuardar(r.fila);
    if (otro) {
      limpiar();
      return false;
    }
    return true;
  };

  const acciones = [{ label: t('common.cancelar') }];
  if (esNuevo) acciones.push({ label: t('nadadores.guardar-y-otro'), onClick: guardar(true) });
  acciones.push({ label: t('common.guardar'), primary: true, onClick: guardar(false) });
  return sheet({
    title: esNuevo ? t('nadadores.nuevo') : t('nadadores.editar'),
    body: cuerpo,
    actions: acciones,
    className: 'nad-modal',
  });
}
