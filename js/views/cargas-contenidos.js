// Gestor de "Contenidos de entrenamiento" (catálogo de cargas) y utilidades de presentación compartidas.
// Sólo presenta: toda la lógica vive en domain/cargas.js y application/cargasService.js.
// Lo usan la vista Cargas y Configuración. Clases propias con prefijo `tc-`.
import { icon } from '../icons.js';
import { t, tNum, tContenido, tContenidoDesc } from '../i18n.js';
import { crearCargasService } from '../application/cargasService.js';
import { agruparPorCategoria, COLOR_SIN_TIPO, siguienteColor, NOMBRE_MAX, DESCRIPCION_MAX } from '../domain/cargas.js';

// Metros con separador de miles también en español (2.300).
export const fmtM = (n) => tNum(Math.round(Number(n) || 0), { useGrouping: 'always', maximumFractionDigits: 0 });

// Servicio con el rol actual (ctx.cargas permite inyectar uno en pruebas).
export function crearServicio(ctx) {
  return ctx.cargas || crearCargasService(ctx.store, { puedeEditar: () => ctx.auth.role() !== 'nadador' });
}

export function injectStyle() {
  if (document.getElementById('tc-style')) return;
  const st = document.createElement('style');
  st.id = 'tc-style';
  st.textContent = `
.tc-chip{display:inline-flex;align-items:center;gap:.4rem;max-width:100%}
.tc-dot{display:inline-block;flex:none;width:.8rem;height:.8rem;border-radius:50%;border:1px solid rgba(0,0,0,.25)}
.tc-gestor{display:grid;gap:.75rem}
.tc-head{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between}
.tc-intro{margin:0;color:var(--muted,#6b778a);font-size:.9rem}
.tc-grupo{margin:.6rem 0 .2rem;font-size:.8rem;text-transform:uppercase;letter-spacing:.04em;color:var(--muted,#6b778a)}
.tc-lista{list-style:none;margin:0;padding:0;display:grid;gap:.5rem}
.tc-item{display:flex;flex-wrap:wrap;gap:.5rem .8rem;align-items:flex-start;padding:.7rem .8rem;border:1px solid var(--border,#e1e8f2);border-radius:12px;border-left-width:6px;background:var(--surface,#fff)}
.tc-item.tc-inactivo{opacity:.65;background:#f7f8fa}
.tc-main{flex:1 1 220px;min-width:0}
.tc-nombre{overflow-wrap:anywhere}
.tc-badge{display:inline-block;margin-left:.4rem;padding:.05rem .5rem;border-radius:999px;font-size:.72rem;font-weight:600;background:var(--c-primary-soft,#e8f1fd);color:var(--c-secondary,#0b3d91);white-space:nowrap}
.tc-badge.tc-off{background:#eceff3;color:#4b5563}
.tc-desc,.tc-meta{margin:.2rem 0 0;font-size:.85rem;color:var(--muted,#6b778a);overflow-wrap:anywhere}
.tc-acts{display:flex;flex-wrap:wrap;gap:.35rem;align-items:center}
.tc-acts .btn{padding:.35rem .7rem}
.tc-acts .icon-btn{width:36px;height:36px;border:1px solid var(--border,#e1e8f2);border-radius:10px}
.tc-acts .icon-btn:disabled{opacity:.35;cursor:default}
.tc-form{display:grid;gap:.7rem}
.tc-field{display:flex;flex-direction:column;gap:.25rem;font-size:.85rem;font-weight:600;color:var(--muted,#6b778a)}
.tc-field input,.tc-field textarea{font:inherit;font-weight:400;color:var(--text,#1f2a3a)}
.tc-field input[type=color]{height:42px;padding:2px;width:100%}
.tc-row2{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
@media(max-width:520px){.tc-row2{grid-template-columns:1fr}}
.tc-hint{margin:0;font-size:.8rem;color:var(--muted,#6b778a);font-weight:400}
.tc-error{margin:0;min-height:1.2em;color:var(--danger,#d93025);font-size:.85rem}
.tc-help{margin:.2rem 0 0;font-size:.8rem;color:var(--muted,#6b778a)}`;
  document.head.append(st);
}

// Punto de color + nombre visible del contenido (o el texto crudo si no está en el catálogo).
export function chip(h, tipo, textoCrudo) {
  return h('span', { class: 'tc-chip' },
    h('span', { class: 'tc-dot', style: `background:${tipo ? tipo.color : COLOR_SIN_TIPO}`, 'aria-hidden': 'true' }),
    tipo ? tContenido(tipo) : (textoCrudo || t('tc.sin-clasificar')));
}

// Mensaje de error de validación (primer error).
export const textoError = (errores) => t('tc.err.' + (errores[0] && errores[0].codigo));

// Modal de alta/edición. `tipo` null = nuevo. onGuardado(tipo) se llama tras guardar con éxito.
export function abrirFormulario({ ctx, svc, tipo = null, onGuardado }) {
  const { ui } = ctx;
  const h = ui.h;
  const nuevo = !tipo;
  const fijo = !!(tipo && tipo.predefinido);
  const descVisible = tipo ? tContenidoDesc(tipo) : '';
  const nombre = h('input', { type: 'text', value: tipo ? tContenido(tipo) : '', maxlength: NOMBRE_MAX, disabled: fijo, required: !fijo });
  const desc = h('textarea', { rows: 3, maxlength: DESCRIPCION_MAX }, descVisible);
  const color = h('input', { type: 'color', value: tipo ? tipo.color : siguienteColor(svc.tipos()) });
  const min = h('input', { type: 'number', min: 0, step: 100, inputmode: 'numeric', value: tipo && tipo.min ? tipo.min : '' });
  const max = h('input', { type: 'number', min: 0, step: 100, inputmode: 'numeric', value: tipo && tipo.max ? tipo.max : '' });
  const error = h('p', { class: 'tc-error', role: 'alert' });
  const campo = (etq, el, ayuda) => h('label', { class: 'tc-field' }, etq, el, ayuda ? h('span', { class: 'tc-hint' }, ayuda) : null);
  const body = h('form', { class: 'tc-form', onsubmit: (e) => e.preventDefault() },
    campo(t('tc.f.nombre'), nombre, fijo ? t('tc.f.nombre-fijo') : null),
    campo(t('tc.f.descripcion'), desc),
    campo(t('tc.f.color'), color),
    h('div', { class: 'tc-row2' }, campo(t('tc.f.min'), min), campo(t('tc.f.max'), max)),
    h('p', { class: 'tc-hint' }, t('tc.f.objetivos-ayuda')),
    error);

  const guardar = () => {
    const data = { nombre: nombre.value, descripcion: desc.value, color: color.value, min: min.value, max: max.value };
    // Un predefinido cuya descripción no se ha tocado conserva el valor original (así sigue traduciéndose).
    if (fijo && desc.value.trim() === descVisible) data.descripcion = tipo.descripcion;
    const r = nuevo ? svc.crear(data) : svc.editar(tipo.id, data);
    if (!r.ok) { error.textContent = textoError(r.errores); (r.errores[0].campo === 'nombre' ? nombre : desc).focus(); return false; }
    ui.toast(t(nuevo ? 'tc.creado' : 'tc.guardado', { nombre: tContenido(r.tipo) }));
    if (onGuardado) onGuardado(r.tipo);
    return true;
  };
  ui.modal({
    title: nuevo ? t('tc.nuevo-titulo') : t('tc.editar-titulo'),
    body,
    actions: [{ label: t('common.cancelar') }, { label: t('common.guardar'), primary: true, onClick: () => guardar() }],
  });
}

// Eliminar: sin cargas se confirma y borra; con cargas se ofrece desactivar o fusionar.
async function eliminar({ ctx, svc, tipo, onChange }) {
  const { ui } = ctx;
  const h = ui.h;
  const nombre = tContenido(tipo);
  const usos = svc.usos(tipo.id);
  if (!usos) {
    if (!(await ui.confirmDialog(t('tc.borrar.confirmar', { nombre }), { okLabel: t('tc.a.eliminar'), danger: true }))) return;
    const r = svc.borrar(tipo.id);
    if (r.ok) { ui.toast(t('tc.eliminado', { nombre })); onChange(); }
    return;
  }
  const otros = svc.tipos().filter((x) => x.id !== tipo.id);
  const sel = h('select', { 'aria-label': t('tc.borrar.fusionar-con') }, otros.map((x) => h('option', { value: x.id }, tContenido(x))));
  const body = h('div', { class: 'tc-form' },
    h('p', {}, t('tc.borrar.en-uso', { nombre, n: usos })),
    otros.length ? h('label', { class: 'tc-field' }, t('tc.borrar.fusionar-con'), sel) : h('p', { class: 'tc-hint' }, t('tc.borrar.sin-destino')));
  const actions = [{ label: t('common.cancelar') }];
  if (tipo.activo) actions.push({ label: t('tc.borrar.desactivar'), onClick: () => { svc.activar(tipo.id, false); ui.toast(t('tc.desactivado', { nombre })); onChange(); } });
  if (otros.length) {
    actions.push({
      label: t('tc.borrar.fusionar'), danger: true,
      onClick: () => {
        const destino = svc.tipo(sel.value);
        const r = svc.fusionar(tipo.id, sel.value);
        if (!r.ok) return false;
        ui.toast(t('tc.fusionado', { nombre, destino: tContenido(destino), n: r.reasignadas }));
        onChange();
      },
    });
  }
  ui.modal({ title: t('tc.borrar.en-uso-titulo'), body, actions });
}

function objetivoTexto(tipo) {
  if (tipo.min && tipo.max) return t('tc.objetivo-rango', { min: fmtM(tipo.min), max: fmtM(tipo.max) });
  if (tipo.min) return t('tc.objetivo-min', { min: fmtM(tipo.min) });
  if (tipo.max) return t('tc.objetivo-max', { max: fmtM(tipo.max) });
  return t('tc.sin-objetivo');
}

// Pinta el gestor dentro de `host`. onChange() se llama tras cada cambio de datos (la vista decide si repinta).
export function renderGestor(host, ctx, { svc = crearServicio(ctx), onChange = () => {} } = {}) {
  injectStyle();
  const { ui } = ctx;
  const h = ui.h;
  const puede = svc.puedeEditar();
  const cambio = () => { pintar(); onChange(); };

  function fila(tipo, i, total, usos) {
    const nombre = tContenido(tipo);
    const nUsos = usos.get(tipo.id) || 0;
    const acts = [];
    if (puede) {
      acts.push(
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('tc.aria.subir', { nombre }), title: t('tc.a.subir'), disabled: i === 0, onclick: () => { svc.mover(tipo.id, -1); cambio(); } }, icon('flecha-arriba', { size: 16 })),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('tc.aria.bajar', { nombre }), title: t('tc.a.bajar'), disabled: i === total - 1, onclick: () => { svc.mover(tipo.id, 1); cambio(); } }, icon('flecha-abajo', { size: 16 })),
        h('button', { type: 'button', class: 'btn', 'aria-label': t('tc.aria.editar', { nombre }), onclick: () => abrirFormulario({ ctx, svc, tipo, onGuardado: cambio }) }, t('tc.a.editar')),
        h('button', {
          type: 'button', class: 'btn', 'aria-label': t(tipo.activo ? 'tc.aria.desactivar' : 'tc.aria.activar', { nombre }),
          onclick: () => { svc.activar(tipo.id, !tipo.activo); ui.toast(t(tipo.activo ? 'tc.desactivado' : 'tc.activado', { nombre })); cambio(); },
        }, t(tipo.activo ? 'tc.a.desactivar' : 'tc.a.activar')));
      if (!tipo.predefinido) {
        acts.push(h('button', { type: 'button', class: 'btn', 'aria-label': t('tc.aria.eliminar', { nombre }), onclick: () => eliminar({ ctx, svc, tipo, onChange: cambio }) }, t('tc.a.eliminar')));
      }
    }
    const desc = tContenidoDesc(tipo);
    return h('li', { class: 'tc-item' + (tipo.activo ? '' : ' tc-inactivo'), style: `border-left-color:${tipo.color}`, 'data-id': tipo.id },
      h('div', { class: 'tc-main' },
        h('div', {}, h('strong', { class: 'tc-nombre' }, nombre),
          h('span', { class: 'tc-badge' }, t(tipo.predefinido ? 'tc.predefinido' : 'tc.personalizado')),
          tipo.activo ? null : h('span', { class: 'tc-badge tc-off' }, t('tc.inactivo'))),
        desc ? h('p', { class: 'tc-desc' }, desc) : null,
        h('p', { class: 'tc-meta' }, `${objetivoTexto(tipo)} · ${t(nUsos === 1 ? 'tc.usos.uno' : 'tc.usos.otros', { n: nUsos })}`)),
      acts.length ? h('div', { class: 'tc-acts' }, acts) : null);
  }

  function pintar() {
    const usos = svc.conteoUsos();
    const grupos = agruparPorCategoria(svc.tipos());
    host.replaceChildren(h('div', { class: 'tc-gestor' },
      h('div', { class: 'tc-head' },
        h('p', { class: 'tc-intro' }, t(puede ? 'tc.intro' : 'tc.intro-lectura')),
        puede ? h('button', { type: 'button', class: 'btn btn-primary', onclick: () => abrirFormulario({ ctx, svc, onGuardado: cambio }) }, icon('mas', { size: 16 }), t('tc.nuevo')) : null),
      grupos.map((g) => [
        h('h4', { class: 'tc-grupo' }, t('tc.cat.' + g.categoria)),
        h('ul', { class: 'tc-lista', 'aria-label': `${t('tc.aria.lista')}: ${t('tc.cat.' + g.categoria)}` }, g.tipos.map((x, i) => fila(x, i, g.tipos.length, usos))),
      ])));
  }
  pintar();
  return { repintar: pintar };
}
