// Editor del plan de entreno de una sesión: líneas agrupadas por set, totales en vivo, plantillas,
// copia desde otras sesiones y acciones de PDF. Móvil primero (cada fila es una tarjeta; en pantallas anchas, tabla).
import { icon } from '../icons.js';
import { t, tDate, tNum, tContenido, hasKey } from '../i18n.js';
import * as D from '../domain/entreno.js';
import * as G from '../domain/desglose.js';
import { COLOR_SIN_TIPO, normalizarNombre as nn } from '../domain/cargas.js';
import * as A from './entreno-acciones.js';
import { crearServicio as crearCargasSvc, abrirFormulario as formContenido, injectStyle as estiloContenidos } from './cargas-contenidos.js';

const CSS = `
.enp-ov{position:fixed;inset:0;z-index:90;background:rgba(15,23,42,.5);display:flex;align-items:stretch;justify-content:center}
.enp-panel{background:var(--surface,#fff);width:100%;max-width:1360px;display:flex;flex-direction:column;max-height:100dvh;min-height:0}
@media(min-width:900px){.enp-ov{padding:2vh 2vw}.enp-panel{border-radius:16px;max-height:96vh}}
.enp-head{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border,#e1e8f2)}
.enp-head h2{margin:0;font-size:1.15rem}
.enp-head small{font-weight:400;color:var(--muted,#6b778a);font-size:.85rem}
.enp-sub{margin:2px 0 0;color:var(--muted,#6b778a);font-size:.9rem}
.enp-body{flex:1;overflow:auto;padding:12px 16px;min-height:0}
.enp-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--border,#e1e8f2);background:var(--surface,#fff)}
.enp-foot .enp-acts{display:flex;flex-wrap:wrap;gap:6px}
.enp-tot{font-weight:700;font-size:1.02rem;color:var(--c-secondary,#0b3d91)}
.enp-tot span{white-space:nowrap}
.enp-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:12px}
.enp-meta label,.enp-tools label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;font-weight:600;color:var(--muted,#6b778a)}
.enp-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end;margin-bottom:12px;padding:10px;border:1px dashed var(--border,#e1e8f2);border-radius:12px}
.enp-tools .enp-tool{display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap}
.enp-tools select{min-width:170px}
.enp-set{border:1px solid var(--border,#e1e8f2);border-left:5px solid var(--c-primary,#1a73e8);border-radius:12px;margin-bottom:12px;background:var(--surface,#fff)}
.enp-set-head{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:8px 10px;background:var(--c-primary-soft,#e8f1fd);border-radius:0 10px 0 0}
.enp-set-head h3{margin:0;font-size:1rem}
.enp-set-tot{font-weight:700;color:var(--c-secondary,#0b3d91)}
.enp-set-acts{display:flex;gap:2px;flex-wrap:wrap}
.enp-ib{display:inline-grid;place-items:center;min-width:40px;height:40px;border:1px solid transparent;background:transparent;border-radius:10px;color:var(--c-secondary,#0b3d91);cursor:pointer;font:inherit}
.enp-ib:hover{background:#fff;border-color:var(--border,#e1e8f2)}
.enp-ib:disabled{opacity:.35;cursor:default}
.enp-ib.enp-del{color:var(--danger,#d93025)}
.enp-row{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;border-top:1px solid var(--border,#e1e8f2)}
.enp-f{display:flex;flex-direction:column;gap:2px;min-width:0}
.enp-f .enp-lbl,.enp-out .enp-lbl{font-size:.72rem;font-weight:600;color:var(--muted,#6b778a)}
.enp-foot .enp-acts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%}
.enp-foot .btn{padding:.5rem .35rem;font-size:.85rem;display:inline-flex;align-items:center;justify-content:center;gap:.3rem;text-align:center;line-height:1.15}
.enp-foot{padding:8px 12px}
.enp-tools{padding:8px}
.enp-tools .enp-tool{width:100%}
.enp-tools .enp-tool label{flex:1;min-width:0}
.enp-tools select{min-width:0;width:100%}
@media(min-width:700px){
  .enp-foot{padding:10px 16px}
  .enp-foot .enp-acts{display:flex;flex-wrap:wrap;width:auto}
  .enp-foot .btn{padding:.6rem 1rem;font-size:1rem}
  .enp-tools .enp-tool{width:auto}
  .enp-tools select{min-width:170px;width:auto}
}
.enp-f input{padding:.5rem .55rem;min-height:42px}
.enp-f input[aria-invalid="true"]{border-color:var(--danger,#d93025);background:#fdeceb}
.enp-f-objetivo,.enp-f-ejercicio,.enp-f-notas{grid-column:1/-1}
.enp-out{display:flex;flex-direction:column;gap:2px}
.enp-out output{font-weight:700;min-height:42px;display:flex;align-items:center}
.enp-ract{display:flex;gap:2px;justify-content:flex-end;align-items:center;grid-column:1/-1}
.enp-colhead{display:none}
.enp-avisos{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:4px}
.enp-avisos li{display:flex;gap:6px;align-items:flex-start;font-size:.9rem;padding:6px 8px;border-radius:8px;background:#fff7e0;color:#7a5200}
.enp-avisos li.enp-err{background:#fdeceb;color:#a1261c}
.enp-vacio{color:var(--muted,#6b778a);padding:12px 0}
.enp-ro{width:100%;border-collapse:collapse;font-size:.92rem}
.enp-ro th,.enp-ro td{padding:6px 8px;border-bottom:1px solid var(--border,#e1e8f2);text-align:left;vertical-align:top}
.enp-ro th{font-size:.75rem;text-transform:uppercase;color:var(--muted,#6b778a)}
.enp-ro .enp-n{text-align:right;white-space:nowrap}
.enp-ro-wrap{overflow-x:auto}
.enp-frame{flex:1;width:100%;min-height:60vh;border:0;background:#eef1f6}
.enp-prev .enp-foot{justify-content:flex-end}
.enp-print{position:fixed;width:0;height:0;border:0;right:0;bottom:0}
.enp-prev-ov{z-index:95}
.enp-cont{grid-column:1/-1;order:2;display:grid;gap:8px;padding-top:8px;border-top:1px dashed var(--border,#e1e8f2)}
.enp-ract{order:3}
.enp-cont-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.enp-cont-bar label{display:flex;flex-direction:column;gap:2px;font-size:.72rem;font-weight:600;color:var(--muted,#6b778a)}
.enp-cont-bar select,.enp-cont-bar input{min-height:40px;padding:.3rem .45rem;font:inherit;width:auto;max-width:100%}
.enp-cont-bar select.enp-c-add{min-width:200px}
.enp-cont-bar .btn{min-height:40px;padding:.35rem .7rem;display:inline-flex;align-items:center;gap:.3rem}
.enp-chips{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.enp-c{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:6px 8px;border:1px solid var(--border,#e1e8f2);border-left:6px solid var(--cc,#9aa4b2);border-radius:10px;background:var(--surface,#fff)}
.enp-c-name{flex:1 1 150px;font-weight:600;overflow-wrap:anywhere}
.enp-c input.enp-c-val{width:84px;min-height:40px;padding:.3rem .45rem;text-align:right}
.enp-c select.enp-c-un{width:96px;min-height:40px}
.enp-c-modo{min-height:40px;padding:.3rem .7rem;border-radius:999px;border:1px solid var(--border,#e1e8f2);background:#f1f4f9;color:var(--c-secondary,#0b3d91);font:inherit;font-size:.85rem;font-weight:600;cursor:pointer}
.enp-c-modo[aria-pressed="true"]{background:var(--c-secondary,#0b3d91);color:#fff;border-color:var(--c-secondary,#0b3d91)}
.enp-c-res{flex:1 1 100%;font-size:.82rem;color:var(--muted,#6b778a)}
.enp-c-resto{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;background:#fff7e0;color:#7a5200;font-size:.88rem}
.enp-c-resto.enp-c-exc{background:#fdeceb;color:#a1261c}
.enp-c-resto select{min-height:40px}
.enp-est{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.enp-est-fila{display:flex;gap:6px;align-items:center}
.enp-est select,.enp-est input{min-height:40px;padding:.3rem .45rem;font:inherit;width:auto}
.enp-est .btn{min-height:40px;padding:.35rem .7rem;display:inline-flex;align-items:center;gap:.3rem}
.enp-est input.enp-est-m{width:84px;text-align:right}
.enp-set-cont{font-size:.82rem;color:var(--muted,#6b778a)}
.enp-res-bar{position:sticky;top:0;z-index:3;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;width:100%;margin:0 0 8px;padding:8px 12px;min-height:44px;text-align:left;font:inherit;font-weight:700;color:var(--c-secondary,#0b3d91);background:var(--surface,#fff);border:1px solid var(--border,#e1e8f2);border-radius:12px;box-shadow:0 -12px 0 var(--surface,#fff),0 2px 6px rgba(15,23,42,.12);cursor:pointer}
.enp-res-bar .enp-res-chev{margin-left:auto;transition:transform .15s}
.enp-res-bar[aria-expanded="true"] .enp-res-chev{transform:rotate(180deg)}
.enp-res{margin:0 0 12px;border:1px solid var(--border,#e1e8f2);border-radius:12px;background:var(--surface,#fff)}
.enp-res[hidden],.enp-cont [hidden]{display:none!important}
.enp-res-mini{display:flex;flex:1 1 120px;height:10px;border-radius:5px;overflow:hidden;background:#e8ecf2;min-width:90px}
.enp-res-mini span,.enp-bar span{display:block;height:100%}
.enp-res-body{padding:10px 12px 12px;display:grid;gap:12px}
.enp-res-cols{display:grid;gap:12px}
.enp-res h4{margin:0 0 6px;font-size:.85rem;text-transform:uppercase;letter-spacing:.03em;color:var(--muted,#6b778a)}
.enp-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:#e8ecf2;margin-bottom:6px}
.enp-res ul.enp-leg{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:.92rem}
.enp-leg li{display:grid;grid-template-columns:12px minmax(0,1fr) auto auto;gap:8px;align-items:center}
.enp-leg i{width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.2)}
.enp-leg b{font-variant-numeric:tabular-nums;text-align:right;min-width:3.4em}
.enp-leg span.enp-m{font-variant-numeric:tabular-nums;text-align:right}
.enp-res-txt{margin:0;white-space:pre-line;font-size:.9rem;padding:8px 10px;border-radius:8px;background:#f3f6fb}
.enp-res-acts{display:flex;flex-wrap:wrap;gap:8px}
.enp-res-acts .btn{min-height:40px;display:inline-flex;align-items:center;gap:.3rem}
@media(min-width:700px){.enp-res-cols{grid-template-columns:1fr 1fr}}
@media(min-width:1000px){
  .enp-ract{order:1}
  .enp-cont{order:2}
  .enp-chips{grid-template-columns:repeat(auto-fill,minmax(470px,1fr))}
  .enp-colhead,.enp-row{grid-template-columns:58px minmax(100px,1.1fr) minmax(80px,.8fr) 56px 72px 84px minmax(130px,2fr) 72px minmax(80px,1fr) minmax(100px,1.3fr) 152px;gap:6px;align-items:center}
  .enp-colhead{display:grid;padding:6px 10px;font-size:.72rem;font-weight:700;text-transform:uppercase;color:var(--muted,#6b778a)}
  .enp-f .enp-lbl,.enp-out .enp-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
  .enp-f-objetivo,.enp-f-ejercicio,.enp-f-notas,.enp-ract{grid-column:auto}
  .enp-f input{min-height:36px;padding:.35rem .45rem}
  .enp-out output{min-height:36px}
  .enp-colhead .enp-ch-n{text-align:left}
}
`;

const CAMPOS = [
  ['tiempoMin', 'tiempo', { inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' }],
  ['objetivo', 'objetivo', { list: 'enp-dl-objetivo' }],
  ['bloque', 'bloque', { list: 'enp-dl-bloque' }],
  ['series', 'series', { inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off' }],
  ['distancia', 'distancia', { inputmode: 'numeric', pattern: '[0-9]*', list: 'enp-dl-distancia', autocomplete: 'off' }],
  ['salida', 'salida', { list: 'enp-dl-salida', placeholder: "C/1'10\"", autocapitalize: 'off', autocomplete: 'off' }],
  ['ejercicio', 'ejercicio', { list: 'enp-dl-ejercicio' }],
];
const CAMPOS_FIN = [['material', 'material', { list: 'enp-dl-material' }], ['notas', 'notas', {}]];

function inyectarEstilo() {
  if (document.getElementById('enp-style')) return;
  const s = document.createElement('style');
  s.id = 'enp-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const claveEstilo = G.claveEstilo;
const colorEstilo = G.colorEstilo;
const r1 = (n) => Math.round(n * 10) / 10;

const lista = (clave) => t(clave).split('|').map((x) => x.trim()).filter(Boolean);
let secuencia = 0;

// opciones: { ctx, sesionId } -> { cerrar, el }
export function abrirEditor({ ctx, sesionId }) {
  const h = ctx.ui.h;
  const svc = A.servicio(ctx);
  const ses = svc.sesion(sesionId);
  if (!ses) return null;
  inyectarEstilo();
  estiloContenidos();
  const toast = (m) => (ctx.ui.toast ? ctx.ui.toast(m) : alert(m));
  const uid = 'enp' + (++secuencia);
  const abridor = document.activeElement;

  const state = {
    tipoSesion: ses.tipoSesion || '', materialDia: ses.materialDia || '', notasGenerales: ses.notasGenerales || '',
    lineas: svc.lineas(sesionId),
  };
  if (!state.lineas.length) state.lineas = D.anadirSet([]);
  let sucio = false;
  const marcar = () => { sucio = true; };
  let tipos = svc.tipos();
  const catalogoActivo = () => (tipos.length ? tipos : G.catalogoBase()).filter((x) => x.activo);
  const tipoDe = (nombre) => G.resolverContenido(nombre, tipos);
  const nombreDe = (nombre) => { const tp = tipoDe(nombre); return tp ? tContenido(tp) : nombre; };
  const estiloTxt = (e) => { if (!e) return t('entreno.est.ninguno'); const k = 'entreno.estilo.' + claveEstilo(e); return hasKey(k) ? t(k) : e; };
  const pctTxt = (p) => tNum(p, { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' %';
  const mTxt = (m) => tNum(r1(m), { useGrouping: false, maximumFractionDigits: 1 }) + ' m';

  // ----- elementos persistentes -----
  const setsEl = h('div', { class: 'enp-sets' });
  const avisosEl = h('ul', { class: 'enp-avisos', 'aria-label': t('entreno.avisos') });
  const totEl = h('div', { class: 'enp-tot', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let refs = []; // { fila, out, inputs: {campo: el} }
  let setRefs = new Map(); // set -> elemento total
  let setCont = new Map(); // set -> elemento con el resumen de contenidos del set

  const fmt = (n) => tNum(n, { useGrouping: false });
  const textoTotales = () => {
    const tot = D.totales(state.lineas);
    return t('entreno.total-linea', { m: fmt(tot.metros), min: fmt(tot.tiempoMin), sets: tot.sets });
  };

  function refrescar() {
    refs.forEach((r) => { r.out.textContent = fmt(D.distanciaBloque(r.fila)); });
    const porSet = new Map();
    state.lineas.forEach((l) => porSet.set(l.set, (porSet.get(l.set) || { m: 0, min: 0 })));
    state.lineas.forEach((l) => { const e = porSet.get(l.set); e.m += D.distanciaBloque(l); e.min += Number.isFinite(D.num(l.tiempoMin)) ? D.num(l.tiempoMin) : 0; });
    setRefs.forEach((el, s) => { const e = porSet.get(s) || { m: 0, min: 0 }; el.textContent = t('entreno.set-total', { m: fmt(e.m), min: fmt(e.min) }); });
    totEl.textContent = textoTotales();
    const des = svc.desglose(sesionId, state.lineas);
    refs.forEach((r) => r.cont && r.cont.actualizar());
    setCont.forEach((el, st) => {
      const ps = des.porSet.find((x) => x.set === st);
      el.textContent = ps ? ps.porContenido.slice(0, 4).map((c) => `${c.contenido ? c.corto : t('entreno.cont.sin-contenido')} ${pctTxt(c.pct)}`).join(' · ') : '';
    });
    pintarResumen(des);
    // validación
    const av = svc.validar(sesionId, state.lineas, { ...ses });
    const malos = new Set();
    av.forEach((a) => { if (a.campo && a.severidad === 'error') malos.add(`${a.set}:${a.orden}:${a.campo}`); });
    refs.forEach((r) => Object.entries(r.inputs).forEach(([campo, el]) => {
      if (malos.has(`${r.fila.set}:${r.fila.orden}:${campo}`)) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    }));
    avisosEl.replaceChildren(...av.map((a) => {
      const pos = a.set ? t('entreno.av-pos', { set: a.set, fila: a.orden }) + ' ' : '';
      return h('li', { class: a.severidad === 'error' ? 'enp-err' : '' }, icon('aviso', { size: 16 }),
        h('span', {}, pos + t('entreno.av.' + a.codigo, a.params || {})));
    }));
    return av;
  }

  // ----- DOM del borrador -----
  function sugerir() {
    const mk = (campo, extra) => h('datalist', { id: `enp-dl-${campo}` }, ...svc.sugerencias(campo, extra).map((v) => h('option', { value: v })));
    return h('div', { hidden: true },
      mk('objetivo', lista('entreno.sug.objetivo')), mk('bloque', lista('entreno.sug.bloque')), mk('salida', lista('entreno.sug.salida')),
      mk('ejercicio', lista('entreno.sug.ejercicio')), mk('material', lista('entreno.sug.material')),
      h('datalist', { id: 'enp-dl-distancia' }, ...[25, 50, 75, 100, 150, 200, 300, 400, 500, 800, 1000].map((v) => h('option', { value: String(v) }))));
  }

  function foco(set, orden, campo) {
    const r = refs.find((x) => x.fila.set === set && x.fila.orden === orden);
    const el = r && (r.inputs[campo] || Object.values(r.inputs)[0]);
    if (el) { el.focus(); if (el.select) try { el.select(); } catch (e) { /* ignorar */ } }
  }

  function op(fn, enfocar) {
    state.lineas = fn(state.lineas);
    marcar();
    pintar();
    if (enfocar) foco(enfocar.set, enfocar.orden, enfocar.campo || 'objetivo');
  }

  const ib = (iconName, label, onclick, extra = {}) =>
    h('button', { type: 'button', class: 'enp-ib' + (extra.danger ? ' enp-del' : ''), 'aria-label': label, title: label, onclick, disabled: extra.disabled }, icon(iconName, { size: 18 }));

  // ----- contenidos y estilo de una fila -----
  // Chips de contenidos (color del catálogo) con metros por repetición o %, modo Auto/Manual, resto sin asignar y estilo.
  function contEl(l, pos) {
    const chipsUl = h('ul', { class: 'enp-chips', 'aria-label': t('entreno.cont.lista-aria', { pos }) });
    const restoTxt = h('span', {});
    const restoSel = h('select', { 'aria-label': t('entreno.cont.asignar-a') });
    const restoBtn = h('button', { type: 'button', class: 'btn', onclick: () => asignarResto() }, t('entreno.cont.asignar-resto'));
    const restoCtl = h('span', { class: 'enp-c-ctl', style: 'display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap' }, restoSel, restoBtn);
    const restoEl = h('div', { class: 'enp-c-resto', role: 'status', hidden: true }, restoTxt, restoCtl);
    const addSel = h('select', { class: 'enp-c-add', 'aria-label': t('entreno.cont.anadir-aria', { pos }) });
    const igualBtn = h('button', { type: 'button', class: 'btn', onclick: () => { l.componentes = G.repartirIgual(l.componentes); marcar(); pintarComps(); refrescar(); } }, t('entreno.cont.igual'));
    const autoBtn = h('button', { type: 'button', class: 'btn', 'aria-label': t('entreno.cont.autocompletar-aria', { pos }), onclick: () => autocompletar() }, icon('refrescar', { size: 16 }), ' ' + t('entreno.cont.autocompletar'));
    const estEl = h('div', { class: 'enp-est', role: 'group', 'aria-label': `${t('entreno.est.titulo')} (${pos})` });
    let comps = [];
    let ests = [];
    const buscar = (nombre) => l.componentes.find((c) => nn(c.contenido) === nn(nombre));
    const resolver = () => G.resolverLinea(l, { tipos });
    const enfocarComp = (nombre, parte) => { const c = comps.find((x) => x.k === nn(nombre)); if (c && c[parte]) c[parte].focus(); };
    const pintarModo = (btn, cur, nombre) => {
      const manual = !!cur && cur.modo === 'manual';
      btn.setAttribute('aria-pressed', manual ? 'true' : 'false');
      btn.setAttribute('aria-label', t(manual ? 'entreno.cont.modo-aria-manual' : 'entreno.cont.modo-aria-auto', { nombre }));
      btn.textContent = t(manual ? 'entreno.cont.modo-manual' : 'entreno.cont.modo-auto');
    };

    function pintarAdd() {
      const usados = new Set(l.componentes.map((c) => nn(c.contenido)));
      addSel.replaceChildren(h('option', { value: '' }, t('entreno.cont.anadir')),
        ...catalogoActivo().filter((x) => !usados.has(nn(x.nombre))).map((x) => h('option', { value: x.nombre }, tContenido(x))),
        h('option', { value: '__nuevo' }, t('tc.anadir-opcion')));
      addSel.value = '';
      const opciones = [...l.componentes.map((c) => c.contenido), ...catalogoActivo().map((x) => x.nombre).filter((n) => !usados.has(nn(n)))];
      restoSel.replaceChildren(...opciones.map((n) => h('option', { value: n }, nombreDe(n))));
      if (l.componentes.length) restoSel.value = l.componentes[l.componentes.length - 1].contenido;
      igualBtn.hidden = l.componentes.length < 2;
    }

    function pintarComps() {
      comps = [];
      chipsUl.replaceChildren(...l.componentes.map((c) => {
        const nombre = nombreDe(c.contenido);
        const tp = tipoDe(c.contenido);
        const manual = c.modo === 'manual';
        const esPct = manual && c.pct > 0;
        const val = h('input', {
          type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'enp-c-val', 'data-campo': 'comp-valor',
          value: esPct ? String(c.pct) : c.metrosPorRep != null ? String(c.metrosPorRep) : '',
          'aria-label': t(esPct ? 'entreno.cont.valor-pct-aria' : 'entreno.cont.valor-aria', { nombre, pos }),
        });
        const un = h('select', { class: 'enp-c-un', 'aria-label': t('entreno.cont.unidad-aria', { nombre, pos }) },
          h('option', { value: 'm' }, t('entreno.cont.u-m')), h('option', { value: 'pct' }, t('entreno.cont.u-pct')));
        un.value = esPct ? 'pct' : 'm';
        const modo = h('button', { type: 'button', class: 'enp-c-modo', 'data-campo': 'comp-modo' });
        pintarModo(modo, c, nombre);
        const res = h('span', { class: 'enp-c-res' });
        val.addEventListener('input', () => {
          const txt = val.value.trim();
          if (txt === '') l.componentes = G.liberarComponente(l.componentes, c.contenido);
          else {
            const n = D.num(txt);
            if (!Number.isFinite(n) || n < 0) { val.setAttribute('aria-invalid', 'true'); return; }
            l.componentes = G.fijarReequilibrando(l, c.contenido, un.value === 'pct' ? { pct: n } : { metrosPorRep: n }, { tipos });
          }
          val.removeAttribute('aria-invalid');
          pintarModo(modo, buscar(c.contenido), nombre);
          marcar(); refrescar();
        });
        un.addEventListener('change', () => {
          const r = resolver();
          const rc = r.componentes.find((x) => nn(x.contenido) === nn(c.contenido));
          const m = rc ? rc.metrosPorRep : 0;
          l.componentes = G.fijarComponente(l.componentes, c.contenido, un.value === 'pct' ? { pct: r.distancia > 0 ? r1(m / r.distancia * 100) : 0 } : { metrosPorRep: m });
          marcar(); pintarComps(); refrescar(); enfocarComp(c.contenido, 'un');
        });
        modo.addEventListener('click', () => {
          const cur = buscar(c.contenido);
          if (cur && cur.modo === 'manual') l.componentes = G.liberarComponente(l.componentes, c.contenido);
          else {
            const rc = resolver().componentes.find((x) => nn(x.contenido) === nn(c.contenido));
            l.componentes = G.fijarComponente(l.componentes, c.contenido, { metrosPorRep: rc ? rc.metrosPorRep : 0 });
          }
          marcar(); pintarComps(); refrescar(); enfocarComp(c.contenido, 'modo');
        });
        comps.push({ k: nn(c.contenido), val, un, modo, res, nombre });
        return h('li', { class: 'enp-c', 'data-contenido': c.contenido, style: `--cc:${tp ? tp.color : COLOR_SIN_TIPO}` },
          h('span', { class: 'enp-c-name' }, nombre), val, un, modo,
          ib('cerrar', t('entreno.cont.quitar', { nombre, pos }), () => { l.componentes = G.quitarComponente(l.componentes, c.contenido); marcar(); pintarComps(); refrescar(); addSel.focus(); }),
          res);
      }));
      pintarAdd();
    }

    function asignarResto() {
      const dest = restoSel.value;
      if (!dest) return;
      l.componentes = G.asignarResto(l, dest, { tipos });
      marcar(); pintarComps(); refrescar();
      toast(t('entreno.cont.asignado', { nombre: nombreDe(dest) }));
    }

    function nuevoContenido() {
      formContenido({
        ctx, svc: crearCargasSvc(ctx),
        onGuardado: (tipo) => {
          tipos = svc.tipos();
          l.componentes = G.anadirComponente(l.componentes, tipo.nombre);
          marcar(); pintar();
        },
      });
    }
    addSel.addEventListener('change', () => {
      const v = addSel.value;
      addSel.value = '';
      if (!v) return;
      if (v === '__nuevo') { nuevoContenido(); return; }
      l.componentes = G.anadirComponente(l.componentes, v);
      marcar(); pintarComps(); refrescar();
      enfocarComp(v, 'val');
    });

    function autocompletar() {
      const r = G.autocompletarLinea(l, { tipos });
      if (r.parse.codigo === 'varios-bloques') { toast(t('entreno.cont.varios-bloques')); return; }
      if (!r.parse.ok) { toast(t('entreno.cont.nada-texto')); return; }
      l.series = r.linea.series; l.distancia = r.linea.distancia;
      l.componentes = r.linea.componentes; l.estilos = r.linea.estilos;
      const refFila = refs.find((x) => x.fila === l);
      if (refFila) { refFila.inputs.series.value = l.series === '' ? '' : String(l.series); refFila.inputs.distancia.value = l.distancia === '' ? '' : String(l.distancia); }
      marcar(); pintarComps(); pintarEst(); refrescar();
      toast(t('entreno.cont.autocompletado', { n: r.linea.componentes.length, e: r.linea.estilos.length }));
    }

    // Estilo: uno (toda la distancia) o varios con metros por repetición cada uno
    function pintarEst() {
      ests = [];
      const multi = l.estilos.length > 1;
      const filas = (l.estilos.length ? l.estilos : [null]).map((e, i) => {
        const nombre = e ? e.estilo : '';
        const canon = G.canonicoEstilo(nombre);
        const conocido = G.ESTILOS.includes(canon);
        const otro = !!e && (!!e.otro || (!!nombre && !conocido));
        const etiqueta = t('entreno.est.aria', { pos }) + (multi ? ' ' + (i + 1) : '');
        const sel = h('select', { 'data-campo': 'estilo', 'aria-label': etiqueta },
          multi ? null : h('option', { value: '' }, t('entreno.est.ninguno')),
          ...G.ESTILOS.map((x) => h('option', { value: x }, estiloTxt(x))), h('option', { value: '__otro' }, t('entreno.est.otro')));
        sel.value = otro ? '__otro' : conocido ? canon : '';
        const poner = (nuevo) => { l.estilos = (l.estilos.length ? l.estilos : [null]).map((x, j) => (j === i ? nuevo : x)).filter(Boolean); };
        sel.addEventListener('change', () => {
          const v = sel.value;
          if (v === '') l.estilos = l.estilos.filter((_, j) => j !== i);
          else if (v === '__otro') poner({ estilo: '', metrosPorRep: e ? e.metrosPorRep : null, otro: true });
          else poner({ estilo: v, metrosPorRep: e ? e.metrosPorRep : null });
          marcar(); pintarEst(); refrescar();
          if (v === '__otro') { const x = ests[i] && ests[i].txt; if (x) x.focus(); } else if (ests[i]) ests[i].sel.focus();
        });
        const txt = otro ? h('input', { type: 'text', value: nombre, maxlength: 30, 'aria-label': t('entreno.est.otro-aria', { pos }), 'data-campo': 'estilo-otro' }) : null;
        let quitar = null;
        if (txt) txt.addEventListener('input', () => { poner({ estilo: txt.value, metrosPorRep: e ? e.metrosPorRep : null, otro: true }); if (quitar) quitar.setAttribute('aria-label', t('entreno.est.quitar', { estilo: txt.value || estiloTxt(''), pos })); marcar(); refrescar(); });
        const m = multi ? h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', class: 'enp-est-m', 'data-campo': 'estilo-metros', value: e && e.metrosPorRep != null ? String(e.metrosPorRep) : '', 'aria-label': t('entreno.est.metros-aria', { estilo: estiloTxt(canon), pos }) }) : null;
        if (m) m.addEventListener('input', () => { const n = D.num(m.value); l.estilos = l.estilos.map((x, j) => (j === i ? { ...x, metrosPorRep: Number.isFinite(n) && n >= 0 ? n : null } : x)); marcar(); refrescar(); });
        ests.push({ sel, txt, m });
        if (multi) quitar = ib('cerrar', t('entreno.est.quitar', { estilo: nombre ? estiloTxt(canon) : estiloTxt(''), pos }), () => { l.estilos = l.estilos.filter((_, j) => j !== i); marcar(); pintarEst(); refrescar(); });
        return h('div', { class: 'enp-est-fila' }, sel, txt, m, quitar);
      });
      const libres = G.ESTILOS.filter((x) => !l.estilos.some((e) => G.canonicoEstilo(e.estilo) === x));
      estEl.replaceChildren(...filas,
        l.estilos.length && l.estilos.length < 4 && libres.length
          ? h('button', { type: 'button', class: 'btn', 'data-accion': 'estilo-mas', onclick: () => { l.estilos = [...l.estilos, { estilo: libres[0], metrosPorRep: null }]; marcar(); pintarEst(); refrescar(); } }, icon('mas', { size: 16 }), ' ' + t('entreno.est.dividir'))
          : null);
    }

    function actualizar() {
      const r = resolver();
      const S = r.series;
      comps.forEach((cr) => {
        const rc = r.componentes.find((x) => nn(x.contenido) === cr.k);
        if (!rc) return;
        cr.val.placeholder = rc.metrosPorRep ? String(rc.metrosPorRep) : '';
        const pct = r.distancia > 0 ? rc.metrosPorRep / r.distancia * 100 : 0;
        cr.res.textContent = t('entreno.cont.res', { rep: fmt(rc.metrosPorRep), m: fmt(r1(S * rc.metrosPorRep)), pct: pctTxt(pct) });
      });
      ests.forEach((er, i) => { if (er.m && r.estilos[i]) er.m.placeholder = String(r.estilos[i].metrosPorRep || ''); });
      const hayResto = r.componentes.length > 0 && r.resto > G.EPS;
      const hayExceso = r.componentes.length > 0 && r.exceso > G.EPS;
      restoEl.hidden = !(hayResto || hayExceso);
      restoEl.classList.toggle('enp-c-exc', hayExceso);
      restoCtl.hidden = !hayResto;
      restoTxt.textContent = hayExceso ? t('entreno.cont.excede', { rep: fmt(r.exceso) }) : hayResto ? t('entreno.cont.sin-asignar', { rep: fmt(r.resto), m: fmt(r1(S * r.resto)) }) : '';
    }

    pintarComps();
    pintarEst();
    const el = h('div', { class: 'enp-cont', role: 'group', 'aria-label': `${t('entreno.cont.titulo')} (${pos})` },
      h('div', { class: 'enp-cont-bar' }, addSel, estEl, autoBtn, igualBtn), chipsUl, restoEl);
    return { el, actualizar };
  }

  function filaEl(l, esUltimaSet) {
    const inputs = {};
    const pos = t('entreno.pos', { set: l.set, fila: l.orden });
    const campo =([nombre, clave, attrs]) => {
      const el = h('input', { type: 'text', value: l[nombre] === undefined || l[nombre] === null ? '' : String(l[nombre]), 'data-campo': nombre, 'aria-label': `${t('entreno.col.' + clave)} (${pos})`, enterkeyhint: 'next', ...attrs });
      el.addEventListener('input', () => { l[nombre] = el.value; marcar(); refrescar(); });
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        e.preventDefault();
        const fs = state.lineas.filter((x) => x.set === l.set);
        const sig = fs.find((x) => x.orden === l.orden + 1);
        if (sig) foco(sig.set, sig.orden, nombre);
        else op((ls) => D.anadirFila(ls, l.set), { set: l.set, orden: l.orden + 1, campo: nombre });
      });
      if (nombre === 'salida') {
        el.addEventListener('blur', () => { // normaliza C/1'10" cuando es válida
          const p = D.parsearSalida(el.value);
          if (p.valido && !p.vacio && p.texto !== el.value) { el.value = p.texto; l.salida = p.texto; refrescar(); }
        });
      }
      inputs[nombre] = el;
      return h('label', { class: 'enp-f enp-f-' + nombre }, h('span', { class: 'enp-lbl' }, t('entreno.col.' + clave)), el);
    };
    const out = h('output', { 'aria-label': `${t('entreno.col.dist-bloque')} (${pos})` });
    const fs = state.lineas.filter((x) => x.set === l.set);
    const fila = h('div', { class: 'enp-row', role: 'group', 'aria-label': pos, 'data-set': l.set, 'data-orden': l.orden },
      ...CAMPOS.map(campo),
      h('div', { class: 'enp-out' }, h('span', { class: 'enp-lbl' }, t('entreno.col.dist-bloque')), out),
      ...CAMPOS_FIN.map(campo),
      h('div', { class: 'enp-ract' },
        ib('fila-arriba', t('entreno.fila-subir', { pos }), () => op((ls) => D.moverFila(ls, l.set, l.orden, -1), { set: l.set, orden: Math.max(1, l.orden - 1) }), { disabled: l.set === 1 && l.orden === 1 }),
        ib('fila-abajo', t('entreno.fila-bajar', { pos }), () => op((ls) => D.moverFila(ls, l.set, l.orden, 1), { set: l.set, orden: l.orden + 1 }), { disabled: esUltimaSet && l.orden === fs.length }),
        ib('copiar', t('entreno.fila-duplicar', { pos }), () => op((ls) => D.duplicarFila(ls, l.set, l.orden), { set: l.set, orden: l.orden + 1 })),
        ib('borrar', t('entreno.fila-quitar', { pos }), () => op((ls) => D.quitarFila(ls, l.set, l.orden)), { danger: true })));
    const cont = contEl(l, pos);
    fila.appendChild(cont.el);
    refs.push({ fila: l, out, inputs, cont });
    return fila;
  }

  function setEl(s, ultimo, total) {
    const filas = state.lineas.filter((l) => l.set === s);
    const totalEl = h('span', { class: 'enp-set-tot' });
    setRefs.set(s, totalEl);
    const contSet = h('span', { class: 'enp-set-cont' });
    setCont.set(s, contSet);
    const id = `${uid}-set-${s}`;
    return h('section', { class: 'enp-set', 'aria-labelledby': id, 'data-set': s },
      h('div', { class: 'enp-set-head' },
        h('h3', { id }, t('entreno.set', { n: s })),
        totalEl,
        contSet,
        h('div', { class: 'enp-set-acts' },
          ib('mas', t('entreno.set-anadir-fila', { n: s }), () => op((ls) => D.anadirFila(ls, s), { set: s, orden: filas.length + 1 })),
          ib('fila-arriba', t('entreno.set-subir', { n: s }), () => op((ls) => D.moverSet(ls, s, -1)), { disabled: s === 1 }),
          ib('fila-abajo', t('entreno.set-bajar', { n: s }), () => op((ls) => D.moverSet(ls, s, 1)), { disabled: ultimo }),
          ib('copiar', t('entreno.set-duplicar', { n: s }), () => op((ls) => D.duplicarSet(ls, s))),
          ib('borrar', t('entreno.set-quitar', { n: s }), () => op((ls) => D.quitarSet(ls, s)), { danger: true }))),
      h('div', { class: 'enp-colhead', 'aria-hidden': 'true' },
        ...['tiempo', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'material', 'notas'].map((c) => h('span', {}, t('entreno.col.' + c))), h('span', {})),
      ...filas.map((l) => filaEl(l, ultimo)));
  }

  function pintar() {
    refs = [];
    setRefs = new Map();
    setCont = new Map();
    const sets = [...new Set(state.lineas.map((l) => l.set))].sort((a, b) => a - b);
    setsEl.replaceChildren(...(sets.length ? sets.map((s, i) => setEl(s, i === sets.length - 1, sets.length)) : [h('p', { class: 'enp-vacio' }, t('entreno.sin-lineas'))]));
    refrescar();
  }

  // ----- resumen de la sesión -----
  const textoFila = (l) => G.textoEjercicio(l, { tipos, etiquetaEstilo: estiloTxt, etiqueta: (c) => (c.tipo ? G.nombreCorto(c.tipo) : c.contenido) });
  const opcionesTexto = (conPct) => ({
    conPct, nombre: (c) => (c.tipoId ? c.corto : c.contenido), nombreEstilo: (e) => estiloTxt(e.estilo), metros: mTxt, pct: pctTxt,
    etq: {
      total: t('entreno.res.texto-total'), porEstilo: t('entreno.res.texto-estilo'), sinContenido: t('entreno.cont.sin-contenido'), sinEstilo: t('entreno.est.ninguno'),
      pctContenido: t('entreno.res.texto-pct-contenido'), pctEstilo: t('entreno.res.texto-pct-estilo'),
    },
  });
  // Barra siempre visible (fija arriba al desplazarse) + panel plegable: abierto en escritorio, cerrado en móvil.
  const resBar = h('button', { type: 'button', class: 'enp-res-bar', 'aria-controls': uid + '-res' });
  const resEl = h('div', { class: 'enp-res', id: uid + '-res' });
  let resAbierto = !(typeof matchMedia === 'function' && matchMedia('(max-width: 999px)').matches);
  const aplicarResAbierto = () => { resEl.hidden = !resAbierto; resBar.setAttribute('aria-expanded', resAbierto ? 'true' : 'false'); };
  resBar.addEventListener('click', () => { resAbierto = !resAbierto; aplicarResAbierto(); });
  aplicarResAbierto();
  async function copiarResumen() {
    const txt = G.textoResumen(svc.desglose(sesionId, state.lineas), opcionesTexto(true));
    try {
      await navigator.clipboard.writeText(txt);
      toast(t('entreno.res.copiado'));
    } catch (e) {
      try {
        const ta = h('textarea', { 'aria-hidden': 'true', style: 'position:fixed;left:-1000px;top:0' }, txt);
        document.body.appendChild(ta);
        ta.select();
        const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
        ta.remove();
        toast(t(ok ? 'entreno.res.copiado' : 'entreno.res.err-copiar'));
      } catch (e2) { toast(t('entreno.res.err-copiar')); }
    }
  }
  async function registrarCargas() {
    if (errores()) { toast(t('entreno.err-corrige')); return; }
    const ok = ctx.ui.confirmDialog ? await ctx.ui.confirmDialog(t('entreno.res.registrar-confirmar')) : confirm(t('entreno.res.registrar-confirmar'));
    if (!ok || !guardar()) return;
    const r = svc.registrarCargasDesdePlan(sesionId);
    if (!r.ok) toast(t('entreno.err-guardar'));
    else if (!r.contenidos) toast(t('entreno.res.registrar-nada'));
    else if (!r.nadadores) toast(t('entreno.res.registrar-sin-nadadores'));
    else toast(t(r.creadas ? 'entreno.res.registrado' : 'entreno.res.registrado-ya', { n: r.creadas, omitidas: r.omitidas }));
  }
  function leyenda(items, { nombre, color, dato }) {
    return h('ul', { class: 'enp-leg' }, items.map((it) => h('li', { 'data-clave': dato(it) },
      h('i', { style: `background:${color(it)}`, 'aria-hidden': 'true' }), h('span', {}, nombre(it)), h('span', { class: 'enp-m' }, mTxt(it.metros)), h('b', {}, pctTxt(it.pct)))));
  }
  function barra(items, color, texto) {
    return h('div', { class: 'enp-bar', role: 'img', 'aria-label': texto }, items.map((it) => h('span', { style: `flex:${it.metros} 0 0;background:${color(it)}`, title: `${it.etq}: ${mTxt(it.metros)} (${pctTxt(it.pct)})` })));
  }
  function pintarResumen(d) {
    const tot = D.totales(state.lineas);
    const colorC = (c) => c.color || COLOR_SIN_TIPO;
    const nomC = (c) => (c.contenido ? nombreDe(c.contenido) : t('entreno.cont.sin-contenido'));
    const nomE = (e) => estiloTxt(e.estilo);
    const cs = d.porContenido.map((c) => ({ ...c, etq: nomC(c) }));
    const es = d.porEstilo.map((e) => ({ ...e, etq: nomE(e) }));
    const mini = d.totalM > 0 ? h('span', { class: 'enp-res-mini', 'aria-hidden': 'true' }, cs.map((c) => h('span', { style: `flex:${c.metros} 0 0;background:${colorC(c)}` }))) : null;
    resBar.setAttribute('aria-label', `${t('entreno.res.titulo')}: ${fmt(d.totalM)} m · ${fmt(tot.tiempoMin)} min`);
    resBar.replaceChildren(icon('grafica', { size: 18 }), h('span', {}, t('entreno.res.titulo')),
      h('span', { class: 'enp-res-total' }, `${fmt(d.totalM)} m · ${fmt(tot.tiempoMin)} min`), mini, icon('flecha-abajo', { size: 16, class: 'enp-res-chev' }));
    const cuerpoRes = d.totalM > 0
      ? h('div', { class: 'enp-res-body' },
        h('div', { class: 'enp-res-cols' },
          h('div', { class: 'enp-res-cont' }, h('h4', {}, t('entreno.res.por-contenido')),
            barra(cs, colorC, cs.map((c) => `${c.etq} ${mTxt(c.metros)} ${pctTxt(c.pct)}`).join(', ')),
            leyenda(cs, { nombre: (c) => c.etq, color: colorC, dato: (c) => c.contenido })),
          h('div', { class: 'enp-res-est' }, h('h4', {}, t('entreno.res.por-estilo')),
            barra(es, (e) => colorEstilo(e.estilo), es.map((e) => `${e.etq} ${mTxt(e.metros)} ${pctTxt(e.pct)}`).join(', ')),
            leyenda(es, { nombre: (e) => e.etq, color: (e) => colorEstilo(e.estilo), dato: (e) => e.estilo }))),
        h('p', { class: 'enp-res-txt', 'data-resumen': 'texto' }, G.textoResumen(d, opcionesTexto(true))),
        h('div', { class: 'enp-res-acts' },
          h('button', { type: 'button', class: 'btn', onclick: copiarResumen }, icon('copiar', { size: 16 }), ' ' + t('entreno.res.copiar')),
          h('button', { type: 'button', class: 'btn', onclick: registrarCargas }, icon('cargas', { size: 16 }), ' ' + t('entreno.res.registrar'))))
      : h('div', { class: 'enp-res-body' }, h('p', { class: 'enp-vacio' }, t('entreno.res.vacio')));
    resEl.replaceChildren(cuerpoRes);
  }

  // ----- cabecera de datos y herramientas -----
  const campoMeta = (k, clave, valor) => {
    const el = h('input', { type: 'text', value: valor, autocomplete: 'off' });
    el.addEventListener('input', () => { state[k] = el.value; marcar(); });
    return h('label', {}, t(clave), el);
  };
  const metaEl = h('div', { class: 'enp-meta' }, campoMeta('tipoSesion', 'entreno.f.tipo-sesion', state.tipoSesion), campoMeta('materialDia', 'entreno.f.material-dia', state.materialDia), campoMeta('notasGenerales', 'entreno.f.notas-generales', state.notasGenerales));

  async function cargarPlan(plan) {
    if (!plan) return;
    const hayContenido = state.lineas.some((l) => !D.filaVacia(l));
    if (hayContenido && !(await (ctx.ui.confirmDialog ? ctx.ui.confirmDialog(t('entreno.confirm-reemplazar')) : confirm(t('entreno.confirm-reemplazar'))))) return;
    state.tipoSesion = plan.tipoSesion || state.tipoSesion;
    state.materialDia = plan.materialDia || state.materialDia;
    state.notasGenerales = plan.notasGenerales || state.notasGenerales;
    state.lineas = plan.lineas.length ? D.renumerar(plan.lineas) : D.anadirSet([]);
    marcar();
    cuerpo.querySelectorAll('.enp-meta input').forEach((el, i) => { el.value = [state.tipoSesion, state.materialDia, state.notasGenerales][i] || ''; });
    pintar();
    toast(t('entreno.plan-cargado'));
  }

  function herramientas() {
    const plantillas = svc.plantillas();
    const selPl = h('select', { id: uid + '-pl' }, ...plantillas.map((p) => h('option', { value: p.id }, `${t('entreno.pl.' + p.id)} (${fmt(p.resumen.metros)} m)`)));
    const otras = svc.sesionesConPlan({ salvo: sesionId });
    const selSes = h('select', { id: uid + '-ses', disabled: !otras.length },
      ...(otras.length ? otras.map((s) => {
        const g = (ctx.store.get('Grupos', s.grupoId) || {}).nombre || '';
        return h('option', { value: s.id }, [tDate(String(s.fecha).slice(0, 10)), g, s.titulo].filter(Boolean).join(' · '));
      }) : [h('option', { value: '' }, t('entreno.sin-otras'))]));
    return h('div', { class: 'enp-tools' },
      h('div', { class: 'enp-tool' }, h('label', {}, t('entreno.plantilla'), selPl),
        h('button', { type: 'button', class: 'btn', onclick: () => cargarPlan(svc.planDesdePlantilla(selPl.value)) }, t('entreno.usar-plantilla'))),
      h('div', { class: 'enp-tool' }, h('label', {}, t('entreno.copiar-de'), selSes),
        h('button', { type: 'button', class: 'btn', disabled: !otras.length, onclick: () => cargarPlan(svc.planDesdeSesion(selSes.value)) }, t('entreno.copiar'))));
  }

  // ----- acciones -----
  const errores = () => D.hayErrores(svc.validar(sesionId, state.lineas, { ...ses }));
  function guardar() {
    const r = svc.guardarPlan(sesionId, state);
    if (!r.ok) { toast(t('entreno.err-guardar')); refrescar(); return false; }
    sucio = false;
    toast(t('entreno.plan-guardado'));
    refrescar();
    return true;
  }
  const borradorPdf = () => state;
  async function pdf(accion) {
    if (errores()) { toast(t('entreno.err-corrige')); return; }
    await A.pdfSesion(ctx, sesionId, { accion, borrador: borradorPdf() });
  }
  async function drive() {
    if (errores()) { toast(t('entreno.err-corrige')); return; }
    const ficha = svc.ficha(sesionId, borradorPdf());
    try {
      const m = await import('../infrastructure/pdfEntreno.js');
      const r = await m.generarPdfEntreno([ficha]);
      const res = await A.guardarEnDrive(ctx, { blob: r.blob, nombre: A.nombreSesion(ficha) });
      toast(t(res.actualizado ? 'entreno.drive-actualizado' : 'entreno.drive-ok', { n: A.nombreSesion(ficha) }));
    } catch (e) { console.error(e); toast(t('entreno.err-drive')); }
  }

  async function cerrar(forzar = false) {
    if (!forzar && sucio) {
      const ok = ctx.ui.confirmDialog ? await ctx.ui.confirmDialog(t('entreno.confirm-descartar')) : confirm(t('entreno.confirm-descartar'));
      if (!ok) return;
    }
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = prevOverflow;
    ov.remove();
    abridor?.focus?.();
  }
  const onKey = (e) => {
    if (e.key !== 'Escape' || document.querySelector('.modal-overlay') || document.querySelector('.enp-prev-ov')) return;
    cerrar();
  };

  const grupoSes = (ctx.store.get('Grupos', ses.grupoId) || {}).nombre || '';
  const tituloSesion = [tDate(String(ses.fecha).slice(0, 10), 'long'), ses.hora ? D.horaTexto(ses.hora) : '', String(ses.titulo || '').includes(grupoSes) ? '' : grupoSes, ses.titulo].filter(Boolean).join(' · ');
  const btn = (label, ic, fn, primary = false) => h('button', { type: 'button', class: 'btn' + (primary ? ' btn-primary' : ''), onclick: fn }, icon(ic, { size: 16 }), ' ' + label);
  const acts = h('div', { class: 'enp-acts' },
    btn(t('common.guardar'), 'check', guardar, true),
    btn(t('entreno.generar-pdf'), 'descargar', () => pdf('descargar')),
    btn(t('entreno.vista-previa'), 'ojo', () => pdf('previa')),
    btn(t('entreno.imprimir'), 'imprimir', () => pdf('imprimir')),
    A.puedeGuardarEnDrive(ctx) ? btn(t('entreno.guardar-drive'), 'nube', drive) : null);

  const cuerpo = h('div', { class: 'enp-body' },
    metaEl,
    herramientas(),
    resBar,
    resEl,
    setsEl,
    h('button', { type: 'button', class: 'btn', onclick: () => op((ls) => D.anadirSet(ls), { set: (state.lineas.reduce((a, l) => Math.max(a, l.set), 0)) + 1, orden: 1 }) }, icon('mas', { size: 16 }), ' ' + t('entreno.anadir-set')),
    avisosEl,
    sugerir());

  const ov = h('div', { class: 'enp-ov', onmousedown: (e) => { if (e.target === ov) cerrar(); } },
    h('div', { class: 'enp-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid + '-t' },
      h('div', { class: 'enp-head' },
        h('div', {}, h('h2', { id: uid + '-t' }, t('entreno.editor.titulo')), h('p', { class: 'enp-sub' }, tituloSesion)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.cerrar'), onclick: () => cerrar() }, icon('cerrar', { size: 18 }))),
      cuerpo,
      h('div', { class: 'enp-foot' }, totEl, acts)));
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(ov);
  document.addEventListener('keydown', onKey);
  pintar();
  (ov.querySelector('.enp-meta input') || ov.querySelector('.btn'))?.focus();
  return { cerrar: () => cerrar(true), el: ov };
}
