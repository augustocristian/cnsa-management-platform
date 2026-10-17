// Training plan editor of a session: full-screen panel with compact rows grouped by set, live totals, summary by content and
// stroke, a sticky bottom bar (total, unsaved state, Save, "more" menu) and a leave guard.
// Opened from the sessions list and from the season view: abrirEditor({ ctx, sesionId }) -> { cerrar, el } | null.
// The sub-views live in entreno-editor-*.js; the draft state in application/borradorPlan.js.
import { h, toast, confirmDialog } from '../ui.js';
import { icon } from '../icons.js';
import { t, tDate, tContenido } from '../i18n.js';
import * as D from '../domain/entreno.js';
import * as G from '../domain/desglose.js';
import { crearBorradorPlan } from '../application/borradorPlan.js';
import { useStyles } from '../styles.js';
import { servicios, pdfSesion, driveConectado } from './entreno-acciones.js';
import { injectStyle as estiloContenidos } from './cargas-contenidos.js';
import { crearSet } from './entreno-editor-set.js';
import { crearResumen } from './entreno-editor-resumen.js';
import { crearBarra } from './entreno-editor-barra.js';
import { crearDatos } from './entreno-editor-datos.js';
import { protegerSalida } from './entreno-editor-guardia.js';
import { lista, pctTxt, fmt } from './entreno-editor-util.js';

let secuencia = 0;

export function abrirEditor({ ctx, sesionId }) {
  const { entreno: svc } = servicios(ctx);
  const ses = svc.sesion(sesionId);
  if (!ses) return null;
  useStyles('entreno-editor');
  estiloContenidos();
  const abridor = document.activeElement;
  const uid = 'enp' + (++secuencia);
  const borrador = crearBorradorPlan({ tipoSesion: ses.tipoSesion, materialDia: ses.materialDia, notasGenerales: ses.notasGenerales, lineas: svc.lineas(sesionId) });
  let tipos = svc.tipos();

  // ---- shared context of the sub-views ----
  const env = {
    ctx, svc, sesionId, uid, borrador, refs: [], setRefs: new Map(), setCont: new Map(),
    cambio: () => borrador.cambio(),
    tipos: () => tipos,
    recargarTipos: () => { tipos = svc.tipos(); },
    catalogoActivo: () => (tipos.length ? tipos : G.catalogoBase()).filter((x) => x.activo),
    tipoDe: (nombre) => G.resolverContenido(nombre, tipos),
    nombreDe: (nombre) => { const tp = G.resolverContenido(nombre, tipos); return tp ? tContenido(tp) : nombre; },
    refDe: (l) => env.refs.find((r) => r.fila === l),
    hayErrores: () => D.hayErrores(svc.validar(sesionId, borrador.estado.lineas, { ...ses })),
    repintar: () => pintar(),
    op(fn, enfocar) {
      borrador.operar(fn);
      pintar();
      if (enfocar) env.foco(enfocar.set, enfocar.orden, enfocar.campo || 'ejercicio');
    },
    foco(set, orden, campo) {
      const r = env.refs.find((x) => x.fila.set === set && x.fila.orden === orden);
      if (!r) return;
      r.abrir(campo);
      const el = r.inputs[campo] || Object.values(r.inputs)[0];
      if (el) { el.focus(); try { el.select?.(); } catch (e) { /* ignore */ } }
    },
    guardar: () => guardar(),
  };

  const setsEl = h('div', { class: 'enp-sets' });
  const avisosEl = h('ul', { class: 'enp-avisos', 'aria-label': t('entreno.avisos') });
  const resumen = crearResumen(env);
  const { metaEl, toolsEl } = crearDatos(env);
  const acciones = {
    pdf: () => pdf('enviar'), previa: () => pdf('previa'), imprimir: () => pdf('imprimir'), drive: () => pdf('drive'),
    driveDisponible: driveConectado(ctx), registrar: () => resumen.registrar(), copiar: () => resumen.copiar(),
  };
  const barra = crearBarra(env, acciones);

  // ---- redraw ----
  // Recomputes everything derived from the draft (row results, set totals, summary, validation, bar). Cheap enough per keystroke.
  function refrescar() {
    env.refs.forEach((r) => r.actualizar());
    const lineas = borrador.estado.lineas;
    const porSet = new Map(D.totalesPorSet(lineas).map((s) => [s.set, s]));
    env.setRefs.forEach((el, s) => { const e = porSet.get(s) || { metros: 0, tiempoMin: 0 }; el.textContent = t('entreno.set-total', { m: fmt(e.metros), min: fmt(e.tiempoMin) }); });
    const des = svc.desglose(sesionId, lineas);
    env.setCont.forEach((el, st) => {
      const ps = des.porSet.find((x) => x.set === st);
      el.textContent = ps ? ps.porContenido.slice(0, 4).map((c) => `${c.contenido ? c.corto : t('entreno.cont.sin-contenido')} ${pctTxt(c.pct)}`).join(' · ') : '';
    });
    resumen.pintar(des);
    const av = svc.validar(sesionId, lineas, { ...ses });
    env.refs.forEach((r) => r.marcar(new Set(av.filter((a) => a.campo && a.severidad === 'error' && a.set === r.fila.set && a.orden === r.fila.orden).map((a) => a.campo))));
    avisosEl.replaceChildren(...av.map((a) => h('li', { class: a.severidad === 'error' ? 'enp-err' : '' }, icon('aviso', { size: 16 }),
      h('span', null, (a.set ? t('entreno.av-pos', { set: a.set, fila: a.orden }) + ' ' : '') + t('entreno.av.' + a.codigo, a.params || {})))));
    barra.actualizar();
  }
  borrador.alCambiar(refrescar);

  // Full rebuild of the sets (after structural operations)
  function pintar() {
    env.refs = [];
    env.setRefs = new Map();
    env.setCont = new Map();
    const sets = [...new Set(borrador.estado.lineas.map((l) => l.set))].sort((a, b) => a - b);
    setsEl.replaceChildren(...(sets.length ? sets.map((s, i) => crearSet(env, s, { ultimo: i === sets.length - 1 })) : [h('p', { class: 'enp-vacio' }, t('entreno.sin-lineas'))]));
    refrescar();
  }

  function datalists() {
    const mk = (campo, extra) => h('datalist', { id: `enp-dl-${campo}` }, ...svc.sugerencias(campo, extra).map((v) => h('option', { value: v })));
    return h('div', { hidden: true }, mk('objetivo', lista('entreno.sug.objetivo')), mk('bloque', lista('entreno.sug.bloque')), mk('salida', lista('entreno.sug.salida')),
      mk('ejercicio', lista('entreno.sug.ejercicio')), mk('material', lista('entreno.sug.material')),
      h('datalist', { id: 'enp-dl-distancia' }, ...[25, 50, 75, 100, 150, 200, 300, 400, 500, 800, 1000].map((v) => h('option', { value: String(v) }))));
  }

  // ---- actions ----
  function guardar() {
    const r = svc.guardarPlan(sesionId, borrador.estado);
    if (!r.ok) { toast.error(t('entreno.err-guardar')); refrescar(); return false; }
    // rows saved for the first time get their id, so the next save updates them instead of recreating them
    const llenas = borrador.estado.lineas.filter((l) => !D.filaVacia(l)).sort((x, y) => x.set - y.set || x.orden - y.orden);
    llenas.forEach((l, i) => { if (!l.id && r.lineas[i]) l.id = r.lineas[i].id; });
    borrador.marcarGuardado();
    toast(t('entreno.plan-guardado'));
    return true;
  }
  async function pdf(accion) {
    if (env.hayErrores()) { toast(t('entreno.err-corrige')); return; }
    await pdfSesion(ctx, sesionId, { accion, borrador: borrador.estado });
  }

  // ---- panel ----
  const grupoSes = (ctx.store.get('Grupos', ses.grupoId) || {}).nombre || '';
  const tituloSesion = [tDate(String(ses.fecha).slice(0, 10), 'long'), ses.hora ? D.horaTexto(ses.hora) : '', String(ses.titulo || '').includes(grupoSes) ? '' : grupoSes, ses.titulo].filter(Boolean).join(' · ');
  const panel = h('div', { class: 'enp-panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid + '-t', tabindex: '-1' },
    h('div', { class: 'enp-head' },
      h('div', null, h('h2', { id: uid + '-t' }, t('entreno.editor.titulo')), h('p', { class: 'enp-sub' }, tituloSesion)),
      h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('common.cerrar'), onclick: () => cerrar() }, icon('cerrar', { size: 18 }))),
    h('div', { class: 'enp-body' }, metaEl, toolsEl, resumen.barEl, resumen.panelEl, setsEl,
      h('button', { type: 'button', class: 'btn enp-anadir-set', onclick: () => env.op((ls) => D.anadirSet(ls), { set: borrador.estado.lineas.reduce((a, l) => Math.max(a, l.set), 0) + 1, orden: 1 }) }, icon('mas', { size: 16 }), ' ' + t('entreno.anadir-set')),
      avisosEl, datalists()),
    barra.el);
  const ov = h('div', { class: 'enp-ov', onmousedown: (e) => { if (e.target === ov) cerrar(); } }, panel);

  // The rest of the page is inert while the editor is open (it is a modal dialog)
  const inertados = [];
  [...document.body.children].forEach((e) => { if (!/^(SCRIPT|STYLE|LINK)$/.test(e.tagName) && e.id !== 'toasts' && !e.hasAttribute('inert')) { e.setAttribute('inert', ''); inertados.push(e); } });
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  document.body.appendChild(ov);

  // The toasts sit above the bar: publish its real height (it grows when the total wraps or on devices with a safe area)
  const medirBarra = () => document.body.style.setProperty('--enp-bar-h', `${barra.el.offsetHeight}px`);
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(medirBarra) : null;
  observador?.observe(barra.el);
  medirBarra();

  const guardia = protegerSalida({
    haySinGuardar: () => borrador.sucio(),
    pedirSalida: () => confirmDialog(t('entreno.confirm-descartar')),
    alSalir: () => cierre(),
  });
  function cierre() {
    guardia.liberar();
    observador?.disconnect();
    document.body.style.removeProperty('--enp-bar-h');
    document.removeEventListener('keydown', onKey);
    inertados.forEach((e) => e.removeAttribute('inert'));
    document.body.style.overflow = prevOverflow;
    ov.remove();
    abridor?.focus?.();
  }
  async function cerrar(forzar = false) {
    if (!forzar && borrador.sucio() && !(await confirmDialog(t('entreno.confirm-descartar')))) return;
    cierre();
  }
  const onKey = (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('.sheet-overlay, .modal-overlay')) return;
    cerrar();
  };
  document.addEventListener('keydown', onKey);

  pintar();
  panel.focus(); // no field is focused on entry: the keyboard stays closed until the user taps one
  return { cerrar: () => cerrar(true), el: ov };
}
