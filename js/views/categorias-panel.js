// "Categories of season X" panel: birth-year table (computed), season change with preview, on-demand recalculation and
// rules per sex. Used in full in Settings and as the bare table (tablaAnios) in the swimmer list.
import { h, field, sheet, toast } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tCat } from '../i18n.js';
import { crearCategoriasService } from '../application/categoriasService.js';
import { CATEGORIAS_POR_EDAD, SEXOS, tablasIguales, etiquetaTemporada, validarConfig } from '../domain/categorias.js';

// Categories service bound to the store of the context (ctx.ahora lets tests fix the clock).
export function servicioCategorias(ctx) {
  return crearCategoriasService(ctx.store, { ahora: ctx.ahora || (() => new Date()) });
}

// Domain table row -> localised birth-year range text.
export function textoRango(f) {
  if (!f) return '';
  if (f.master) return t('categorias.rango.master', { edad: f.edadMin, hasta: f.hasta });
  if (f.desde === null) return t('categorias.rango.anteriores', { hasta: f.hasta });
  if (f.desde === f.hasta) return String(f.hasta);
  return t('categorias.rango.rango', { desde: f.desde, hasta: f.hasta });
}

const sexoEtq = (s) => t(s === 'M' ? 'nadadores.masculino' : 'nadadores.femenino');

// Birth-year table of the season. When F and M share the same table there is a single column.
export function tablaAnios(ctx, temporada) {
  useStyles('categorias');
  const svc = servicioCategorias(ctx);
  const tt = temporada ?? svc.temporadaActual();
  const iguales = tablasIguales(svc.config());
  const filas = { F: svc.tabla(tt, 'F'), M: svc.tabla(tt, 'M') };
  const sexos = iguales ? ['F'] : SEXOS;
  const cabecera = h('tr', null, h('th', { scope: 'col' }, t('categorias.col-categoria')),
    sexos.map((s) => h('th', { scope: 'col' }, iguales ? t('categorias.col-nacidos') : t('categorias.col-nacidos-sexo', { sexo: sexoEtq(s) }))));
  const cuerpo = filas.F.map((f, i) => h('tr', null, h('th', { scope: 'row' }, tCat(f.categoria)), sexos.map((s) => h('td', null, textoRango(filas[s][i])))));
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table', 'aria-label': t('categorias.tabla-aria', { temporada: etiquetaTemporada(tt) }) }, h('thead', null, cabecera), h('tbody', null, cuerpo)));
}

// Season selector options: automatic + a window of seasons around the current one.
function opcionesTemporada(svc) {
  const hoy = svc.temporadaHoy(), base = svc.temporadaActual();
  const ops = [{ value: '', label: t('categorias.panel.opcion-auto', { temporada: etiquetaTemporada(hoy) }) }];
  for (let a = Math.min(hoy, base) - 3; a <= Math.max(hoy, base) + 3; a++) ops.push({ value: String(a), label: etiquetaTemporada(a) });
  return ops;
}

function previsualizarCambio(ctx, svc, destino, alCambiar) {
  const cambios = svc.previsualizarCambio(destino);
  const manuales = ctx.store.list('Nadadores').filter((n) => String(n.categoriaManual || '').trim()).length;
  const resumen = h('p', { role: 'status' }, cambios.length ? t(cambios.length === 1 ? 'categorias.cambio.resumen.uno' : 'categorias.cambio.resumen.otros', { n: cambios.length }) : t('categorias.cambio.ninguno'));
  const tabla = cambios.length ? h('div', { class: 'table-wrap catp-cambios' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, ['categorias.cambio.col-nadador', 'categorias.cambio.col-de', 'categorias.cambio.col-a'].map((k) => h('th', { scope: 'col' }, t(k))))),
    h('tbody', null, cambios.map((c) => h('tr', null, h('td', null, `${c.apellidos}, ${c.nombre}`), h('td', null, tCat(c.de) || '—'), h('td', null, h('strong', null, tCat(c.a)), c.sube ? ' ↑' : '')))))) : null;
  sheet({
    title: t('categorias.cambio.titulo', { temporada: etiquetaTemporada(destino) }),
    body: h('div', null, resumen, tabla, manuales ? h('p', { class: 'hint' }, t('categorias.cambio.manuales')) : null),
    actions: [{ label: t('common.cancelar') }, {
      label: t('categorias.cambio.aplicar'), primary: true,
      onClick: () => { const r = svc.cambiarTemporada(destino); toast(t('categorias.cambio.aplicado', { temporada: etiquetaTemporada(destino), n: r.cambios.length })); alCambiar(); },
    }],
  });
}

// Rules per sex: one table per sex with the minimum and maximum age of each category, and the minimum age for Masters.
function seccionReglas(svc, alCambiar) {
  const cfg = svc.config();
  const inputs = {}; // `${sexo}.${categoria}.${0|1}` -> input
  const celda = (s, c, i, valor, deshabilitado) => {
    inputs[`${s}.${c}.${i}`] = h('input', {
      type: 'number', min: '0', max: '120', step: '1', inputmode: 'numeric', value: valor ?? '', disabled: deshabilitado || null,
      'aria-label': `${tCat(c)} (${sexoEtq(s)}): ${t(i === 0 ? 'categorias.reglas.desde' : 'categorias.reglas.hasta')}`,
    });
    return h('td', null, inputs[`${s}.${c}.${i}`]);
  };
  const tablas = SEXOS.map((s) => h('div', { class: 'catp-sexo' }, h('h3', null, sexoEtq(s)),
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['categorias.col-categoria', 'categorias.reglas.desde', 'categorias.reglas.hasta'].map((k) => h('th', { scope: 'col' }, t(k))))),
      h('tbody', null, CATEGORIAS_POR_EDAD.map((c, idx) => h('tr', null, h('th', { scope: 'row' }, tCat(c)),
        celda(s, c, 0, cfg.edades[s][c][0]), celda(s, c, 1, cfg.edades[s][c][1], idx === CATEGORIAS_POR_EDAD.length - 1))))))));
  const inMaster = h('input', { type: 'number', min: '18', max: '120', step: '1', inputmode: 'numeric', id: 'catp-master-edad', value: String(cfg.edadMinimaMaster) });
  const errores = h('ul', { class: 'catp-errores' });
  const aviso = h('div', { class: 'alert alert--danger', role: 'alert', hidden: true }, icon('aviso', { size: 18 }), errores);
  const leer = () => {
    const v = (s, c, i) => (inputs[`${s}.${c}.${i}`].value === '' ? null : Number(inputs[`${s}.${c}.${i}`].value));
    return {
      edadMinimaMaster: inMaster.value === '' ? null : Number(inMaster.value),
      edades: Object.fromEntries(SEXOS.map((s) => [s, Object.fromEntries(CATEGORIAS_POR_EDAD.map((c) => [c, [v(s, c, 0), v(s, c, 1)]]))])),
    };
  };
  const guardar = () => {
    const nueva = leer();
    const errs = validarConfig(nueva);
    errores.replaceChildren(...errs.map((e) => h('li', null, t(`categorias.reglas.err.${e.codigo}`, { categoria: e.categoria ? tCat(e.categoria) : '', sexo: e.sexo ? sexoEtq(e.sexo) : '' }))));
    aviso.hidden = !errs.length;
    if (errs.length) return;
    toast(t('categorias.reglas.guardadas', { n: svc.guardarConfig(nueva).resumen.cambios.length }));
    alCambiar();
  };
  const restablecer = () => { toast(t('categorias.reglas.restablecidas', { n: svc.restablecerConfig().cambios.length })); alCambiar(); };
  return h('details', { class: 'catp-reglas' }, h('summary', null, t('categorias.reglas.titulo')),
    h('p', { class: 'hint' }, t('categorias.reglas.intro')),
    h('div', { class: 'catp-grid' }, tablas),
    field({ label: t('categorias.reglas.master-edad'), input: inMaster }),
    aviso,
    h('div', { class: 'catp-actions' },
      h('button', { type: 'button', class: 'btn btn--primary', id: 'catp-guardar-reglas', onclick: guardar }, t('categorias.reglas.guardar')),
      h('button', { type: 'button', class: 'btn', id: 'catp-restablecer', onclick: restablecer }, t('categorias.reglas.restablecer'))));
}

// ctx: {store, ahora?}. opciones: {alCambiar} -> Node
export function panelCategorias(ctx, { alCambiar = () => {} } = {}) {
  useStyles('categorias');
  const svc = servicioCategorias(ctx);
  const temporada = svc.temporadaActual();
  const nombreTemp = etiquetaTemporada(temporada);

  const selTemp = h('select', { id: 'catp-temporada' }, opcionesTemporada(svc).map((o) => h('option', { value: o.value, selected: o.value === (svc.esAutomatica() ? '' : String(temporada)) }, o.label)));
  const cambiar = () => {
    const destino = selTemp.value === '' ? svc.temporadaHoy() : Number(selTemp.value);
    if (destino === temporada) { toast(t('categorias.panel.misma', { temporada: nombreTemp })); return; }
    previsualizarCambio(ctx, svc, destino, alCambiar);
  };
  const recalcular = () => {
    const r = svc.recalcular();
    toast(t('categorias.panel.recalculado', { n: r.cambios.length, manuales: r.manuales }));
    alCambiar();
  };

  return h('section', { class: 'card catp clb-card', 'aria-labelledby': 'catp-titulo' },
    h('div', { class: 'card-head' }, h('h2', { id: 'catp-titulo' }, t('categorias.titulo', { temporada: nombreTemp }))),
    h('p', { class: 'hint' }, t('categorias.intro')),
    tablaAnios(ctx, temporada),
    h('p', { class: 'catp-estado', 'aria-live': 'polite' }, t('categorias.panel.vigente', { temporada: nombreTemp }), ' · ', svc.esAutomatica() ? t('categorias.panel.automatica') : t('categorias.panel.fijada')),
    h('div', { class: 'filters catp-bar' },
      field({ label: t('categorias.panel.f-temporada'), input: selTemp }),
      h('button', { type: 'button', class: 'btn btn--primary', id: 'catp-cambiar', onclick: cambiar }, t('categorias.panel.cambiar')),
      h('button', { type: 'button', class: 'btn', id: 'catp-recalcular', onclick: recalcular }, t('categorias.panel.recalcular'))),
    seccionReglas(svc, alCambiar));
}
