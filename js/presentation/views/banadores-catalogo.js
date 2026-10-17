// Swimsuit catalogue manager (training suits and competition fast skins) as a `sheet`-based dialog.
// Presentation only: the rules live in domain/banadores.js and application/banadoresService.js.
// Opened from the Marks view ("Manage swimsuits") and from Settings: abrirCatalogoBanadores(ctx).
// Styles: css/views/banadores.css (prefix `bn-`).
import { icon } from '../icons.js';
import { genIdDe } from '../contexto.js';
import { t } from '../i18n/i18n.js';
import { useStyles } from '../styles.js';
import { crearBanadoresService } from '../../application/banadoresService.js';
import { TIPOS_BANADOR, etiquetaBanador, normalizarTipoBanador, MARCA_MAX, MODELO_MAX, NOTAS_MAX } from '../../domain/banadores.js';

// ---------- Display helpers shared with the Marks view ----------
// Translated words for etiquetaBanador(): "Arena Powerskin Carbon Core FX — fast skin".
export const etiquetasTipoCorto = () => Object.fromEntries(TIPOS_BANADOR.map((tp) => [tp, t('bn.tipo-corto.' + tp)]));
export const etiquetaTipoBanador = (tipo) => (normalizarTipoBanador(tipo) ? t('bn.tipo.' + normalizarTipoBanador(tipo)) : '');
// Full translated label of a suit (empty string for no suit).
export const etiquetaBanadorTraducida = (b) => etiquetaBanador(b, etiquetasTipoCorto());
// "Arena Powerskin Carbon Core FX" (without the type), or a placeholder for a generic training suit.
export const nombreBanador = (b) => [b && b.marca, b && b.modelo].filter(Boolean).join(' ') || t('bn.sin-nombre');

// Suits service (ctx.banadores lets tests and other views inject one).
export function crearServicio(ctx) {
  return ctx.banadores || crearBanadoresService(ctx.store, { generarId: () => 'bn-' + genIdDe(ctx)() });
}

const usosTexto = (n) => t(n === 1 ? 'bn.usos.uno' : 'bn.usos.otros', { n });

// ---------- Create / edit form ----------
// `banador` null = new. onGuardado(banador) runs after a successful save.
export function abrirFormulario({ ctx, svc, banador = null, tipoInicial = 'entrenamiento', onGuardado }) {
  const { ui } = ctx;
  const h = ui.h;
  const nuevo = !banador;
  const listaMarcas = [...new Set(svc.banadores().map((b) => b.marca).filter(Boolean))];
  const idLista = 'bn-marcas-' + Math.random().toString(36).slice(2, 7);
  const tipo = h('select', {}, TIPOS_BANADOR.map((tp) => h('option', { value: tp, selected: tp === (banador ? banador.tipo : tipoInicial) }, t('bn.tipo.' + tp))));
  const marca = h('input', { type: 'text', value: banador ? banador.marca : '', maxlength: MARCA_MAX, autocomplete: 'off', list: idLista });
  const modelo = h('input', { type: 'text', value: banador ? banador.modelo : '', maxlength: MODELO_MAX, autocomplete: 'off' });
  const notas = h('textarea', { rows: 2, maxlength: NOTAS_MAX }, banador ? banador.notas : '');
  const entradas = { tipo, marca, modelo, notas };
  const body = h('form', { class: 'bn-form', novalidate: true },
    ui.field({ label: t('bn.f.tipo'), input: tipo, hint: t('bn.f.tipo-ayuda') }),
    ui.field({ label: t('bn.f.marca'), input: marca, hint: t('bn.f.marca-ayuda') }),
    ui.field({ label: t('bn.f.modelo'), input: modelo, hint: t('bn.f.modelo-ayuda') }),
    ui.field({ label: t('bn.f.notas'), input: notas }),
    h('datalist', { id: idLista }, listaMarcas.map((m) => h('option', { value: m }))));

  const guardar = () => {
    Object.values(entradas).forEach((i) => ui.clearFieldError(i));
    const data = { tipo: tipo.value, marca: marca.value, modelo: modelo.value, notas: notas.value };
    const r = nuevo ? svc.crear(data) : svc.editar(banador.id, data);
    if (!r.ok) {
      r.errores.forEach((e, i) => ui.fieldError(entradas[e.campo] || marca, t('bn.err.' + e.codigo), { focus: i === 0 }));
      return false;
    }
    ui.toast(t(nuevo ? 'bn.creado' : 'bn.guardado', { nombre: nombreBanador(r.banador) }));
    if (onGuardado) onGuardado(r.banador);
    return true;
  };
  const hoja = ui.sheet({
    title: t(nuevo ? 'bn.nuevo-titulo' : 'bn.editar-titulo'),
    body,
    className: 'bn-sheet',
    actions: [{ label: t('common.cancelar') }, { label: t('common.guardar'), primary: true, onClick: () => guardar() }],
  });
  body.addEventListener('submit', (e) => { e.preventDefault(); if (guardar()) hoja.close(); });
  return hoja;
}

// ---------- Delete ----------
// Unused suit: deleted with an Undo toast. Used by marks: it cannot be deleted; offer to deactivate or to merge into another.
function eliminar({ ctx, svc, banador, onChange }) {
  const { ui } = ctx;
  const h = ui.h;
  const nombre = nombreBanador(banador);
  const usos = svc.usos(banador.id);
  if (!usos) {
    const r = svc.borrar(banador.id);
    if (!r.ok) return;
    ui.toast.undo(t('bn.eliminado', { nombre }), () => { svc.restaurar(r.banador); onChange(); });
    onChange();
    return;
  }
  const otros = svc.banadores().filter((x) => x.id !== banador.id);
  const destino = h('select', { 'aria-label': t('bn.borrar.fusionar-con') }, otros.map((x) => h('option', { value: x.id }, etiquetaBanadorTraducida(x))));
  const body = h('div', { class: 'bn-form' },
    h('p', {}, t('bn.borrar.en-uso', { nombre, n: usos })),
    otros.length ? ui.field({ label: t('bn.borrar.fusionar-con'), input: destino }) : h('p', { class: 'hint' }, t('bn.borrar.sin-destino')));
  const actions = [{ label: t('common.cancelar') }];
  if (banador.activo) {
    actions.push({ label: t('bn.borrar.desactivar'), onClick: () => { svc.desactivar(banador.id); ui.toast(t('bn.desactivado', { nombre })); onChange(); } });
  }
  if (otros.length) {
    actions.push({
      label: t('bn.borrar.fusionar'), danger: true,
      onClick: () => {
        const dest = svc.banador(destino.value);
        const r = svc.fusionar(banador.id, destino.value);
        if (!r.ok) return false;
        ui.toast(t('bn.fusionado', { nombre, destino: nombreBanador(dest), n: r.reasignadas }));
        onChange();
        return true;
      },
    });
  }
  ui.sheet({ title: t('bn.borrar.en-uso-titulo'), body, actions, className: 'bn-sheet' });
}

// ---------- The manager (list grouped by type) ----------
// Paints into `host`. onCambio() runs after every data change (the caller decides whether to repaint its own view).
export function renderCatalogo(host, ctx, { svc = crearServicio(ctx), onCambio = () => {} } = {}) {
  useStyles('banadores');
  const { ui } = ctx;
  const h = ui.h;
  const cambio = () => { pintar(); onCambio(); };
  const nuevo = (tipoInicial) => abrirFormulario({ ctx, svc, tipoInicial, onGuardado: cambio });

  function fila(b, usos) {
    const nombre = nombreBanador(b);
    const n = usos.get(b.id) || 0;
    const alternar = () => {
      if (b.activo) {
        svc.desactivar(b.id);
        ui.toast.undo(t('bn.desactivado', { nombre }), () => { svc.activar(b.id, true); cambio(); });
      } else {
        svc.activar(b.id, true);
        ui.toast(t('bn.activado', { nombre }));
      }
      cambio();
    };
    return h('li', { class: 'bn-item' + (b.activo ? '' : ' bn-inactivo'), 'data-id': b.id },
      h('div', { class: 'bn-main' },
        h('div', { class: 'bn-linea' }, h('strong', { class: 'bn-nombre' }, nombre), b.activo ? null : ui.badge(t('bn.inactivo'), 'neutral')),
        b.notas ? h('p', { class: 'bn-meta' }, b.notas) : null,
        h('p', { class: 'bn-meta bn-usos' }, usosTexto(n))),
      h('div', { class: 'bn-acts' },
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t('bn.aria.editar', { nombre }), onclick: () => abrirFormulario({ ctx, svc, banador: b, onGuardado: cambio }) }, t('bn.a.editar')),
        h('button', { type: 'button', class: 'btn btn-sm', 'aria-label': t(b.activo ? 'bn.aria.desactivar' : 'bn.aria.activar', { nombre }), onclick: alternar }, t(b.activo ? 'bn.a.desactivar' : 'bn.a.activar')),
        h('button', { type: 'button', class: 'btn btn-sm btn--ghost', 'aria-label': t('bn.aria.eliminar', { nombre }), onclick: () => eliminar({ ctx, svc, banador: b, onChange: cambio }) }, icon('borrar', { size: 16 }), t('bn.a.eliminar'))));
  }

  function pintar() {
    const usos = svc.conteoUsos();
    const grupos = svc.grupos();
    if (!grupos.some((g) => g.banadores.length)) {
      host.replaceChildren(h('div', { class: 'bn-gestor' },
        ui.empty({ icon: 'traje', title: t('bn.vacio-titulo'), text: t('bn.vacio-texto'), action: { label: t('bn.nuevo'), onClick: () => nuevo('entrenamiento') } })));
      return;
    }
    host.replaceChildren(h('div', { class: 'bn-gestor' },
      h('div', { class: 'bn-head' },
        h('p', { class: 'bn-intro' }, t('bn.intro')),
        h('button', { type: 'button', class: 'btn btn--primary', onclick: () => nuevo('entrenamiento') }, icon('mas', { size: 16 }), t('bn.nuevo'))),
      grupos.map((g) => h('section', { class: 'bn-grupo', 'data-tipo': g.tipo },
        h('h3', { class: 'bn-grupo-titulo' }, t('bn.grupo.' + g.tipo)),
        g.banadores.length
          ? h('ul', { class: 'bn-lista', 'aria-label': `${t('bn.aria.lista')}: ${t('bn.grupo.' + g.tipo)}` }, g.banadores.map((b) => fila(b, usos)))
          : h('p', { class: 'bn-vacio-grupo' }, t('bn.vacio.' + g.tipo))))));
  }
  pintar();
  return { repintar: pintar };
}

// Opens the catalogue in a dialog. ctx = {store, ui} (ctx.banadores optional: injected service).
// opciones.onCambio() is called after every change so the caller can refresh (e.g. the Marks filters).
// -> {close, el, dialog, repintar}
export function abrirCatalogoBanadores(ctx, { onCambio } = {}) {
  const host = ctx.ui.h('div', { class: 'bn-host' });
  const gestor = renderCatalogo(host, ctx, { onCambio });
  const hoja = ctx.ui.sheet({ title: t('bn.titulo'), body: host, className: 'bn-sheet bn-catalogo', actions: [{ label: t('common.cerrar'), primary: true }] });
  return { ...hoja, repintar: gestor.repintar };
}
