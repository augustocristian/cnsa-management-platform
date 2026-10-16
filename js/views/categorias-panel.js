// Panel "Categorías de la temporada X": tabla de años de nacimiento (calculada), cambio de temporada con previsualización,
// recálculo a demanda y reglas por sexo. Se usa completo en Configuración y en versión compacta (sólo la tabla) en Nadadores.
import { t, tCat } from '../i18n.js';
import { crearCategoriasService } from '../application/categoriasService.js';
import { CATEGORIAS_POR_EDAD, SEXOS, tablasIguales, etiquetaTemporada, validarConfig } from '../domain/categorias.js';

// Servicio de categorías ligado al store del contexto (ctx.ahora permite fijar el reloj en pruebas).
export function servicioCategorias(ctx) {
  return crearCategoriasService(ctx.store, { ahora: ctx.ahora || (() => new Date()) });
}

// Fila de la tabla (dominio) -> texto localizado del rango de años de nacimiento.
export function textoRango(f) {
  if (!f) return '';
  if (f.master) return t('categorias.rango.master', { edad: f.edadMin, hasta: f.hasta });
  if (f.desde === null) return t('categorias.rango.anteriores', { hasta: f.hasta });
  if (f.desde === f.hasta) return String(f.hasta);
  return t('categorias.rango.rango', { desde: f.desde, hasta: f.hasta });
}

const sexoEtq = (s) => t(s === 'M' ? 'nadadores.masculino' : 'nadadores.femenino');

function injectStyle() {
  if (document.getElementById('catp-style')) return;
  const s = document.createElement('style');
  s.id = 'catp-style';
  s.textContent = `
.catp-intro{margin:0 0 .6rem;color:#6b7a90;font-size:.9rem}
.catp-tablewrap{overflow-x:auto}
.catp-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:flex-end;margin:.8rem 0}
.catp-bar label{display:flex;flex-direction:column;gap:.2rem;font-size:.85rem;color:#445;min-width:200px}
.catp-bar select,.catp-reglas input{padding:.5rem;border:1px solid #cfd8e6;border-radius:8px;font:inherit}
.catp-bar .btn{min-height:44px}
.catp-estado{margin:.2rem 0 0;font-size:.9rem}
.catp-reglas summary{cursor:pointer;font-weight:600;min-height:44px;display:flex;align-items:center}
.catp-reglas input{width:5rem}
.catp-reglas td,.catp-reglas th{vertical-align:middle}
.catp-grid{display:flex;flex-wrap:wrap;gap:1.2rem}
.catp-errores{color:#b3261e;margin:.4rem 0;padding-left:1.1rem}
.catp-cambios{max-height:50vh;overflow:auto}
`;
  document.head.appendChild(s);
}

// Tabla de años de nacimiento de la temporada. Si F y M tienen la misma tabla, una sola columna.
export function tablaAnios(ctx, temporada) {
  const { ui } = ctx;
  const h = ui.h;
  const svc = servicioCategorias(ctx);
  const tt = temporada ?? svc.temporadaActual();
  const iguales = tablasIguales(svc.config());
  const filas = { F: svc.tabla(tt, 'F'), M: svc.tabla(tt, 'M') };
  const sexos = iguales ? ['F'] : SEXOS;
  const cabecera = h('tr', null, h('th', { scope: 'col' }, t('categorias.col-categoria')),
    sexos.map((s) => h('th', { scope: 'col' }, iguales ? t('categorias.col-nacidos') : t('categorias.col-nacidos-sexo', { sexo: sexoEtq(s) }))));
  const cuerpo = filas.F.map((f, i) => h('tr', null, h('th', { scope: 'row' }, tCat(f.categoria)),
    sexos.map((s) => h('td', null, textoRango(filas[s][i])))));
  return h('div', { class: 'catp-tablewrap' },
    h('table', { class: 'table', 'aria-label': t('categorias.tabla-aria', { temporada: etiquetaTemporada(tt) }) }, h('thead', null, cabecera), h('tbody', null, cuerpo)));
}

// Opciones del selector de temporada: automática + una ventana de temporadas alrededor de la actual.
function opcionesTemporada(svc) {
  const hoy = svc.temporadaHoy();
  const base = svc.temporadaActual();
  const desde = Math.min(hoy, base) - 3, hasta = Math.max(hoy, base) + 3;
  const ops = [{ value: '', label: t('categorias.panel.opcion-auto', { temporada: etiquetaTemporada(hoy) }) }];
  for (let a = desde; a <= hasta; a++) ops.push({ value: String(a), label: etiquetaTemporada(a) });
  return ops;
}

// ctx: {store, ui, ahora?}. opciones: {completo, alCambiar}. -> Node
export function panelCategorias(ctx, { completo = true, alCambiar = () => {} } = {}) {
  injectStyle();
  const { ui } = ctx;
  const h = ui.h;
  const svc = servicioCategorias(ctx);
  const temporada = svc.temporadaActual();
  const nombreTemp = etiquetaTemporada(temporada);

  const cabecera = [
    h('h3', { id: 'catp-titulo' }, t('categorias.titulo', { temporada: nombreTemp })),
    h('p', { class: 'catp-intro' }, t('categorias.intro')),
    tablaAnios(ctx, temporada),
  ];
  if (!completo) {
    return h('section', { class: 'card catp', 'aria-labelledby': 'catp-titulo' }, ...cabecera,
      h('p', { class: 'catp-intro' }, h('a', { href: '#/club' }, t('categorias.panel.ver-en-config'))));
  }

  // ----- Temporada: selector, cambio con previsualización y recálculo a demanda -----
  const selTemp = h('select', { id: 'catp-temporada' }, opcionesTemporada(svc).map((o) => h('option', { value: o.value, selected: o.value === (svc.esAutomatica() ? '' : String(temporada)) }, o.label)));
  const estado = h('p', { class: 'catp-estado', 'aria-live': 'polite' },
    t('categorias.panel.vigente', { temporada: nombreTemp }), ' · ', svc.esAutomatica() ? t('categorias.panel.automatica') : t('categorias.panel.fijada'));

  const abrirCambio = () => {
    const destino = selTemp.value === '' ? svc.temporadaHoy() : Number(selTemp.value);
    if (destino === temporada) { ui.toast(t('categorias.panel.misma', { temporada: nombreTemp })); return; }
    const cambios = svc.previsualizarCambio(destino);
    const manuales = ctx.store.list('Nadadores').filter((n) => String(n.categoriaManual || '').trim()).length;
    const resumen = h('p', { role: 'status' }, cambios.length ? t(cambios.length === 1 ? 'categorias.cambio.resumen.uno' : 'categorias.cambio.resumen.otros', { n: cambios.length }) : t('categorias.cambio.ninguno'));
    const tabla = cambios.length ? h('div', { class: 'catp-cambios catp-tablewrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, [t('categorias.cambio.col-nadador'), t('categorias.cambio.col-de'), t('categorias.cambio.col-a')].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, cambios.map((c) => h('tr', null, h('td', null, `${c.apellidos}, ${c.nombre}`), h('td', null, tCat(c.de) || '—'), h('td', null, h('strong', null, tCat(c.a)), c.sube ? ' ↑' : ''))))))
      : null;
    ui.modal({
      title: t('categorias.cambio.titulo', { temporada: etiquetaTemporada(destino) }),
      body: h('div', null, resumen, tabla, manuales ? h('p', { class: 'catp-intro' }, t('categorias.cambio.manuales')) : null),
      actions: [
        { label: t('common.cancelar') },
        {
          label: t('categorias.cambio.aplicar'), primary: true, onClick: () => {
            const r = svc.cambiarTemporada(destino);
            ui.toast(t('categorias.cambio.aplicado', { temporada: etiquetaTemporada(destino), n: r.cambios.length }));
            alCambiar();
          },
        },
      ],
    });
  };
  const bCambiar = h('button', { type: 'button', class: 'btn btn-primary', id: 'catp-cambiar', onclick: abrirCambio }, t('categorias.panel.cambiar'));
  const bRecalcular = h('button', { type: 'button', class: 'btn', id: 'catp-recalcular', onclick: () => {
    const r = svc.recalcular();
    ui.toast(t('categorias.panel.recalculado', { n: r.cambios.length, manuales: r.manuales }));
    alCambiar();
  } }, t('categorias.panel.recalcular'));
  const barra = h('div', { class: 'catp-bar' }, h('label', null, t('categorias.panel.f-temporada'), selTemp), bCambiar, bRecalcular);

  // ----- Reglas por sexo (edad mínima/máxima por categoría y edad mínima máster) -----
  const cfg = svc.config();
  const inputs = {}; // `${sexo}.${categoria}.${0|1}` -> input
  const celda = (s, c, i, valor, deshabilitado) => {
    const inp = h('input', {
      type: 'number', min: '0', max: '120', step: '1', value: valor === null || valor === undefined ? '' : String(valor), disabled: deshabilitado || null,
      'aria-label': `${tCat(c)} (${sexoEtq(s)}): ${t(i === 0 ? 'categorias.reglas.desde' : 'categorias.reglas.hasta')}`,
    });
    inputs[`${s}.${c}.${i}`] = inp;
    return h('td', null, inp);
  };
  const tablasReglas = SEXOS.map((s) => h('div', null,
    h('h4', null, sexoEtq(s)),
    h('div', { class: 'catp-tablewrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, [t('categorias.col-categoria'), t('categorias.reglas.desde'), t('categorias.reglas.hasta')].map((x) => h('th', { scope: 'col' }, x)))),
      h('tbody', null, CATEGORIAS_POR_EDAD.map((c, idx) => h('tr', null, h('th', { scope: 'row' }, tCat(c)),
        celda(s, c, 0, cfg.edades[s][c][0]), celda(s, c, 1, cfg.edades[s][c][1], idx === CATEGORIAS_POR_EDAD.length - 1))))))));
  const inMaster = h('input', { type: 'number', min: '18', max: '120', step: '1', id: 'catp-master-edad', value: String(cfg.edadMinimaMaster) });
  const errores = h('ul', { class: 'catp-errores', role: 'alert', hidden: true });
  const leerConfig = () => ({
    edadMinimaMaster: inMaster.value === '' ? null : Number(inMaster.value),
    edades: Object.fromEntries(SEXOS.map((s) => [s, Object.fromEntries(CATEGORIAS_POR_EDAD.map((c) => {
      const v = (i) => (inputs[`${s}.${c}.${i}`].value === '' ? null : Number(inputs[`${s}.${c}.${i}`].value));
      return [c, [v(0), v(1)]];
    }))])),
  });
  const bGuardar = h('button', { type: 'button', class: 'btn btn-primary', id: 'catp-guardar-reglas', onclick: () => {
    const nueva = leerConfig();
    const errs = validarConfig(nueva);
    errores.replaceChildren(...errs.map((e) => h('li', null, t(`categorias.reglas.err.${e.codigo}`, { categoria: e.categoria ? tCat(e.categoria) : '', sexo: e.sexo ? sexoEtq(e.sexo) : '' }))));
    errores.hidden = !errs.length;
    if (errs.length) return;
    const r = svc.guardarConfig(nueva);
    ui.toast(t('categorias.reglas.guardadas', { n: r.resumen.cambios.length }));
    alCambiar();
  } }, t('categorias.reglas.guardar'));
  const bRestablecer = h('button', { type: 'button', class: 'btn', id: 'catp-restablecer', onclick: () => {
    const r = svc.restablecerConfig();
    ui.toast(t('categorias.reglas.restablecidas', { n: r.cambios.length }));
    alCambiar();
  } }, t('categorias.reglas.restablecer'));
  const reglas = h('details', { class: 'catp-reglas' },
    h('summary', null, t('categorias.reglas.titulo')),
    h('p', { class: 'catp-intro' }, t('categorias.reglas.intro')),
    h('div', { class: 'catp-grid' }, tablasReglas),
    h('div', { class: 'catp-bar' }, h('label', null, t('categorias.reglas.master-edad'), inMaster)),
    errores,
    h('div', { class: 'catp-bar' }, bGuardar, bRestablecer));

  return h('section', { class: 'card catp clb-card', 'aria-labelledby': 'catp-titulo' }, ...cabecera, estado, barra, reglas);
}
