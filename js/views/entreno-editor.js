// Editor del plan de entreno de una sesión: líneas agrupadas por set, totales en vivo, plantillas,
// copia desde otras sesiones y acciones de PDF. Móvil primero (cada fila es una tarjeta; en pantallas anchas, tabla).
import { icon } from '../icons.js';
import { t, tDate, tNum } from '../i18n.js';
import * as D from '../domain/entreno.js';
import * as A from './entreno-acciones.js';

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
@media(min-width:1000px){
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

const lista = (clave) => t(clave).split('|').map((x) => x.trim()).filter(Boolean);
let secuencia = 0;

// opciones: { ctx, sesionId, soloLectura } -> { cerrar, el }
export function abrirEditor({ ctx, sesionId, soloLectura = false }) {
  const h = ctx.ui.h;
  const svc = A.servicio(ctx);
  const ses = svc.sesion(sesionId);
  if (!ses) return null;
  inyectarEstilo();
  const toast = (m) => (ctx.ui.toast ? ctx.ui.toast(m) : alert(m));
  const uid = 'enp' + (++secuencia);
  const lectura = soloLectura || !svc.puedeEditar();
  const abridor = document.activeElement;

  const state = {
    tipoSesion: ses.tipoSesion || '', materialDia: ses.materialDia || '', notasGenerales: ses.notasGenerales || '',
    lineas: svc.lineas(sesionId),
  };
  if (!state.lineas.length && !lectura) state.lineas = D.anadirSet([]);
  let sucio = false;
  const marcar = () => { sucio = true; };

  // ----- elementos persistentes -----
  const setsEl = h('div', { class: 'enp-sets' });
  const avisosEl = h('ul', { class: 'enp-avisos', 'aria-label': t('entreno.avisos') });
  const totEl = h('div', { class: 'enp-tot', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  let refs = []; // { fila, out, inputs: {campo: el} }
  let setRefs = new Map(); // set -> elemento total

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
    refs.push({ fila: l, out, inputs });
    return fila;
  }

  function setEl(s, ultimo, total) {
    const filas = state.lineas.filter((l) => l.set === s);
    const totalEl = h('span', { class: 'enp-set-tot' });
    setRefs.set(s, totalEl);
    const id = `${uid}-set-${s}`;
    return h('section', { class: 'enp-set', 'aria-labelledby': id, 'data-set': s },
      h('div', { class: 'enp-set-head' },
        h('h3', { id }, t('entreno.set', { n: s })),
        totalEl,
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
    const sets = [...new Set(state.lineas.map((l) => l.set))].sort((a, b) => a - b);
    setsEl.replaceChildren(...(sets.length ? sets.map((s, i) => setEl(s, i === sets.length - 1, sets.length)) : [h('p', { class: 'enp-vacio' }, t('entreno.sin-lineas'))]));
    refrescar();
  }

  // ----- lectura -----
  function pintarLectura() {
    const grupos = D.agruparSets(state.lineas.filter((l) => !D.filaVacia(l)));
    if (!grupos.length) { setsEl.replaceChildren(h('p', { class: 'enp-vacio' }, t('entreno.sin-plan-lectura'))); return; }
    setsEl.replaceChildren(...grupos.map((g) => h('section', { class: 'enp-set' },
      h('div', { class: 'enp-set-head' }, h('h3', {}, t('entreno.set', { n: g.set })), h('span', { class: 'enp-set-tot' }, t('entreno.set-total', { m: fmt(g.distSet), min: fmt(g.tiempoMin) }))),
      h('div', { class: 'enp-ro-wrap' }, h('table', { class: 'enp-ro' },
        h('thead', {}, h('tr', {}, ...['tiempo', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'material', 'notas'].map((c) => h('th', { scope: 'col' }, t('entreno.col.' + c))))),
        h('tbody', {}, ...g.lineas.map((l) => h('tr', {},
          h('td', { class: 'enp-n' }, l.tiempoMin === '' ? '' : String(l.tiempoMin)), h('td', {}, l.objetivo), h('td', {}, l.bloque),
          h('td', { class: 'enp-n' }, l.series === '' ? '' : String(l.series)), h('td', { class: 'enp-n' }, l.distancia === '' ? '' : String(l.distancia)),
          h('td', {}, l.salida), h('td', {}, l.ejercicio), h('td', { class: 'enp-n' }, fmt(l.distBloque)), h('td', {}, l.material), h('td', {}, l.notas)))))))));
    totEl.textContent = textoTotales();
  }

  // ----- cabecera de datos y herramientas -----
  const campoMeta = (k, clave, valor) => {
    if (lectura) return valor ? h('div', { class: 'enp-sub' }, h('strong', {}, t(clave) + ': '), valor) : null;
    const el = h('input', { type: 'text', value: valor, autocomplete: 'off' });
    el.addEventListener('input', () => { state[k] = el.value; marcar(); });
    return h('label', {}, t(clave), el);
  };
  const metaEl = lectura
    ? h('div', { class: 'enp-metaro' }, campoMeta('tipoSesion', 'entreno.f.tipo-sesion', state.tipoSesion), campoMeta('materialDia', 'entreno.f.material-dia', state.materialDia), campoMeta('notasGenerales', 'entreno.f.notas-generales', state.notasGenerales))
    : h('div', { class: 'enp-meta' }, campoMeta('tipoSesion', 'entreno.f.tipo-sesion', state.tipoSesion), campoMeta('materialDia', 'entreno.f.material-dia', state.materialDia), campoMeta('notasGenerales', 'entreno.f.notas-generales', state.notasGenerales));

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
  const borradorPdf = () => (lectura ? null : state);
  async function pdf(accion) {
    if (!lectura && errores()) { toast(t('entreno.err-corrige')); return; }
    await A.pdfSesion(ctx, sesionId, { accion, borrador: borradorPdf() });
  }
  async function drive() {
    if (!lectura && errores()) { toast(t('entreno.err-corrige')); return; }
    const ficha = svc.ficha(sesionId, borradorPdf());
    try {
      const m = await import('../infrastructure/pdfEntreno.js');
      const r = await m.generarPdfEntreno([ficha]);
      const res = await A.guardarEnDrive(ctx, { blob: r.blob, nombre: A.nombreSesion(ficha) });
      toast(t(res.actualizado ? 'entreno.drive-actualizado' : 'entreno.drive-ok', { n: A.nombreSesion(ficha) }));
    } catch (e) { console.error(e); toast(t('entreno.err-drive')); }
  }

  async function cerrar(forzar = false) {
    if (!forzar && sucio && !lectura) {
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
    lectura ? null : btn(t('common.guardar'), 'check', guardar, true),
    btn(t('entreno.generar-pdf'), 'descargar', () => pdf('descargar'), lectura),
    btn(t('entreno.vista-previa'), 'ojo', () => pdf('previa')),
    btn(t('entreno.imprimir'), 'imprimir', () => pdf('imprimir')),
    A.puedeGuardarEnDrive(ctx) ? btn(t('entreno.guardar-drive'), 'nube', drive) : null);

  const cuerpo = h('div', { class: 'enp-body' },
    metaEl,
    lectura ? null : herramientas(),
    setsEl,
    lectura ? null : h('button', { type: 'button', class: 'btn', onclick: () => op((ls) => D.anadirSet(ls), { set: (state.lineas.reduce((a, l) => Math.max(a, l.set), 0)) + 1, orden: 1 }) }, icon('mas', { size: 16 }), ' ' + t('entreno.anadir-set')),
    lectura ? null : avisosEl,
    lectura ? null : sugerir());

  const ov = h('div', { class: 'enp-ov', onmousedown: (e) => { if (e.target === ov) cerrar(); } },
    h('div', { class: 'enp-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid + '-t' },
      h('div', { class: 'enp-head' },
        h('div', {}, h('h2', { id: uid + '-t' }, t(lectura ? 'entreno.plan-de' : 'entreno.editor.titulo')), h('p', { class: 'enp-sub' }, tituloSesion)),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.cerrar'), onclick: () => cerrar() }, icon('cerrar', { size: 18 }))),
      cuerpo,
      h('div', { class: 'enp-foot' }, totEl, acts)));
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(ov);
  document.addEventListener('keydown', onKey);
  if (lectura) pintarLectura(); else pintar();
  (ov.querySelector('.enp-meta input') || ov.querySelector('.btn'))?.focus();
  return { cerrar: () => cerrar(true), el: ov };
}
