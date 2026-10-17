// Training-content manager ("Contenidos de entrenamiento") and presentation helpers shared with other views
// (chip, fmtM, crearServicio, abrirFormulario). Presentation only: rules live in domain/cargas.js and
// application/cargasService.js. Used by Loads and Settings. Styles: css/views/cargas.css (prefix `tc-`).
import { h, field, fieldError, clearFieldError, sheet, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tNum, tContenido, tContenidoDesc } from '../i18n/i18n.js';
import { crearCargasService } from '../../application/cargasService.js';
import { agruparPorCategoria, COLOR_SIN_TIPO, siguienteColor, NOMBRE_MAX, DESCRIPCION_MAX, PREFIJO_ID } from '../../domain/cargas.js';

// Metres with a thousands separator also in Spanish (2.300).
export const fmtM = (n) => tNum(Math.round(Number(n) || 0), { useGrouping: 'always', maximumFractionDigits: 0 });

// New content ids are generated here (presentation owns randomness; the service only receives the generator).
const idContenido = () => PREFIJO_ID + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Loads service (ctx.cargas lets tests inject one).
export function crearServicio(ctx) {
  return ctx.cargas || crearCargasService(ctx.store, { generarId: idContenido });
}

// Loads the stylesheet of the training-content pieces (idempotent). Kept for the views that import it.
export function injectStyle() { useStyles('cargas'); }

// Colour dot + visible name of a content (or the raw text when it is not in the catalogue). `_h` is kept for compatibility.
export function chip(_h, tipo, textoCrudo) {
  useStyles('cargas');
  return h('span', { class: 'tc-chip' },
    h('span', { class: 'tc-dot', style: `background:${tipo ? tipo.color : COLOR_SIN_TIPO}`, 'aria-hidden': 'true' }),
    tipo ? tContenido(tipo) : (textoCrudo || t('tc.sin-clasificar')));
}

// Message of the first validation error.
export const textoError = (errores) => t('tc.err.' + (errores[0] && errores[0].codigo));

// Create / edit sheet. `tipo` null = new. onGuardado(tipo) runs after a successful save. Errors are shown inline.
export function abrirFormulario({ ctx, svc, tipo = null, onGuardado }) {
  useStyles('cargas');
  const nuevo = !tipo;
  const fijo = !!(tipo && tipo.predefinido);
  const descVisible = tipo ? tContenidoDesc(tipo) : '';
  const nombre = h('input', { type: 'text', value: tipo ? tContenido(tipo) : '', maxlength: NOMBRE_MAX, disabled: fijo });
  const desc = h('textarea', { rows: 3, maxlength: DESCRIPCION_MAX }, descVisible);
  const alias = h('input', { type: 'text', value: tipo ? (tipo.alias || []).join(', ') : '', maxlength: 120, autocomplete: 'off', placeholder: 'AeL, Ae1' });
  const color = h('input', { type: 'color', value: tipo ? tipo.color : siguienteColor(svc.tipos()) });
  const min = h('input', { type: 'number', min: 0, inputmode: 'numeric', value: tipo && tipo.min ? tipo.min : '' });
  const max = h('input', { type: 'number', min: 0, inputmode: 'numeric', value: tipo && tipo.max ? tipo.max : '' });
  const entradas = { nombre, descripcion: desc, alias, color, min, max };
  const body = h('form', { class: 'tc-form', novalidate: true, onsubmit: (e) => e.preventDefault() },
    field({ label: t('tc.f.nombre'), input: nombre, required: !fijo, hint: fijo ? t('tc.f.nombre-fijo') : null }),
    field({ label: t('tc.f.descripcion'), input: desc }),
    field({ label: t('tc.f.alias'), input: alias, hint: t('tc.f.alias-ayuda') }),
    field({ label: t('tc.f.color'), input: color }),
    h('div', { class: 'tc-row2' }, field({ label: t('tc.f.min'), input: min }), field({ label: t('tc.f.max'), input: max })),
    h('p', { class: 'tc-hint' }, t('tc.f.objetivos-ayuda')));

  const guardar = () => {
    Object.values(entradas).forEach(clearFieldError);
    const data = { nombre: nombre.value, descripcion: desc.value, color: color.value, min: min.value, max: max.value, alias: alias.value };
    // A predefined content whose description was not touched keeps the original value (so it keeps being translated).
    if (fijo && desc.value.trim() === descVisible) data.descripcion = tipo.descripcion;
    const r = nuevo ? svc.crear(data) : svc.editar(tipo.id, data);
    if (!r.ok) {
      r.errores.forEach((e, i) => fieldError(entradas[e.campo] || desc, t('tc.err.' + e.codigo), { focus: i === 0 }));
      return false;
    }
    toast(t(nuevo ? 'tc.creado' : 'tc.guardado', { nombre: tContenido(r.tipo) }));
    if (onGuardado) onGuardado(r.tipo);
    return true;
  };
  sheet({
    title: nuevo ? t('tc.nuevo-titulo') : t('tc.editar-titulo'), body,
    actions: [{ label: t('common.cancelar') }, { label: t('common.guardar'), primary: true, onClick: () => guardar() }],
  });
}

// Delete: without loads it is confirmed and removed; with loads the user can deactivate it or merge it into another one.
async function eliminar({ svc, tipo, onChange }) {
  const nombre = tContenido(tipo);
  const usos = svc.usos(tipo.id);
  if (!usos) {
    if (!(await confirmDialog(t('tc.borrar.confirmar', { nombre }), { okLabel: t('tc.a.eliminar'), danger: true }))) return;
    const r = svc.borrar(tipo.id);
    if (r.ok) { toast(t('tc.eliminado', { nombre })); onChange(); }
    return;
  }
  const otros = svc.tipos().filter((x) => x.id !== tipo.id);
  const sel = h('select', null, otros.map((x) => h('option', { value: x.id }, tContenido(x))));
  const body = h('div', { class: 'tc-form' },
    h('p', null, t('tc.borrar.en-uso', { nombre, n: usos })),
    otros.length ? field({ label: t('tc.borrar.fusionar-con'), input: sel }) : h('p', { class: 'tc-hint' }, t('tc.borrar.sin-destino')));
  const actions = [{ label: t('common.cancelar') }];
  if (tipo.activo) actions.push({ label: t('tc.borrar.desactivar'), onClick: () => { svc.activar(tipo.id, false); toast(t('tc.desactivado', { nombre })); onChange(); } });
  if (otros.length) {
    actions.push({
      label: t('tc.borrar.fusionar'), danger: true,
      onClick: () => {
        const destino = svc.tipo(sel.value);
        const r = svc.fusionar(tipo.id, sel.value);
        if (!r.ok) return false;
        toast(t('tc.fusionado', { nombre, destino: tContenido(destino), n: r.reasignadas }));
        onChange();
        return true;
      },
    });
  }
  sheet({ title: t('tc.borrar.en-uso-titulo'), body, actions });
}

function objetivoTexto(tipo) {
  if (tipo.min && tipo.max) return t('tc.objetivo-rango', { min: fmtM(tipo.min), max: fmtM(tipo.max) });
  if (tipo.min) return t('tc.objetivo-min', { min: fmtM(tipo.min) });
  if (tipo.max) return t('tc.objetivo-max', { max: fmtM(tipo.max) });
  return t('tc.sin-objetivo');
}

// Paints the manager inside `host`. onChange() runs after every data change (the view decides whether to repaint).
export function renderGestor(host, ctx, { svc = crearServicio(ctx), onChange = () => {} } = {}) {
  useStyles('cargas');
  const cambio = () => { pintar(); onChange(); };

  function fila(tipo, i, total, usos) {
    const nombre = tContenido(tipo);
    const nUsos = usos.get(tipo.id) || 0;
    const acts = [
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('tc.aria.subir', { nombre }), title: t('tc.a.subir'), disabled: i === 0, onclick: () => { svc.mover(tipo.id, -1); cambio(); } }, icon('flecha-arriba', { size: 16 })),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('tc.aria.bajar', { nombre }), title: t('tc.a.bajar'), disabled: i === total - 1, onclick: () => { svc.mover(tipo.id, 1); cambio(); } }, icon('flecha-abajo', { size: 16 })),
      h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t('tc.aria.editar', { nombre }), onclick: () => abrirFormulario({ ctx, svc, tipo, onGuardado: cambio }) }, t('tc.a.editar')),
      h('button', {
        type: 'button', class: 'btn btn-sm', 'aria-label': t(tipo.activo ? 'tc.aria.desactivar' : 'tc.aria.activar', { nombre }),
        onclick: () => { svc.activar(tipo.id, !tipo.activo); toast(t(tipo.activo ? 'tc.desactivado' : 'tc.activado', { nombre })); cambio(); },
      }, t(tipo.activo ? 'tc.a.desactivar' : 'tc.a.activar')),
    ];
    if (!tipo.predefinido) {
      acts.push(h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t('tc.aria.eliminar', { nombre }), onclick: () => eliminar({ svc, tipo, onChange: cambio }) }, t('tc.a.eliminar')));
    }
    const desc = tContenidoDesc(tipo);
    return h('li', { class: 'tc-item' + (tipo.activo ? '' : ' tc-inactivo'), style: `border-left-color:${tipo.color}`, 'data-id': tipo.id },
      h('div', { class: 'tc-main' },
        h('div', null, h('strong', { class: 'tc-nombre' }, nombre),
          h('span', { class: 'tc-badge' }, t(tipo.predefinido ? 'tc.predefinido' : 'tc.personalizado')),
          tipo.activo ? null : h('span', { class: 'tc-badge tc-off' }, t('tc.inactivo'))),
        desc ? h('p', { class: 'tc-desc' }, desc) : null,
        (tipo.alias || []).length ? h('p', { class: 'tc-meta' }, t('tc.alias-lista', { alias: tipo.alias.join(', ') })) : null,
        h('p', { class: 'tc-meta' }, `${objetivoTexto(tipo)} · ${t(nUsos === 1 ? 'tc.usos.uno' : 'tc.usos.otros', { n: nUsos })}`)),
      h('div', { class: 'tc-acts' }, acts));
  }

  function pintar() {
    const usos = svc.conteoUsos();
    const grupos = agruparPorCategoria(svc.tipos());
    host.replaceChildren(h('div', { class: 'tc-gestor' },
      h('div', { class: 'tc-head' },
        h('p', { class: 'tc-intro' }, t('tc.intro')),
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => abrirFormulario({ ctx, svc, onGuardado: cambio }) }, icon('mas', { size: 16 }), t('tc.nuevo'))),
      grupos.map((g) => [
        h('h3', { class: 'tc-grupo' }, t('tc.cat.' + g.categoria)),
        h('ul', { class: 'tc-lista', 'aria-label': `${t('tc.aria.lista')}: ${t('tc.cat.' + g.categoria)}` }, g.tipos.map((x, i) => fila(x, i, g.tipos.length, usos))),
      ])));
  }
  pintar();
  return { repintar: pintar };
}
