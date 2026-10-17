// Calendar view: Month / Week / Agenda with group and pool filters, one Export menu (.ics) and optional Google Calendar sync.
// This module is the orchestrator (state + wiring). Subviews: calendario-vistas (the three views), calendario-exportar (.ics
// delivery and options), calendario-sync (Google panel). Rules: js/domain/calendario.js; use cases: js/application/calendarioService.js.
import { h } from '../ui.js';
import { t } from '../i18n/i18n.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import * as D from '../../domain/calendario.js';
import { menuAcciones } from './entreno-menu.js';
import { fmtCorta, fmtMesAnio } from './formatos-fecha.js';
import { vistaMes, vistaSemana, vistaAgenda, leyenda } from './calendario-vistas.js';
import { exportar, abrirOpcionesExportacion } from './calendario-exportar.js';
import { panelSync } from './calendario-sync.js';

// Translated labels the domain uses when it writes titles (.ics, Google, event titles).
export const etiquetas = () => ({
  calle: (n) => t('cal.ev.calle', { n }),
  piscina: (p) => t('cal.ev.piscina', { n: p }),
  enfoque: t('cal.ev.enfoque'),
  volumen: t('cal.ev.volumen'),
  grupo: t('cal.ev.grupo'),
  todos: t('cal.sin-grupo'),
  tipoEvento: (x) => t('tp.evento.' + x),
  prioridad: (p) => t('tp.prioridad-n', { p }),
  pruebas: t('tp.ev.pruebas'),
  categoria: t('tp.ev.categoria'),
  dia: (i, n) => t('tp.ev.dia-de', { i, n }),
});

export async function render(container, params, ctx) {
  useStyles('calendario');
  const { store, auth } = ctx;
  const hooks = ctx.cal || {}; // test hooks: servicio, ahora, descargar
  const svc = hooks.servicio || ctx.servicioCalendario({ store, auth, etq: etiquetas, ahora: hooks.ahora || ctx.ahora });
  const hoy = svc.hoy();
  const movil = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 759px)').matches;
  const pref = svc.preferencias();
  const vistaIni = D.vistaInicial({ guardada: pref.vista, movil });
  const st = {
    vista: vistaIni, cursor: hoy, sel: hoy, filtros: { grupoId: '', piscina: '' },
    rango: 'mes', alarma: pref.alarmaMin, ventana: pref.ventanaDias,
  };
  const grupos = svc.grupos();
  const v = { hoy, st, grupos, svc, etq: etiquetas, elegirDia };
  container.classList.add('cal-root');
  container.replaceChildren();

  // ---------- Pieces ----------
  const tituloEl = h('p', { class: 'cal-titulo', 'aria-live': 'polite', id: 'cal-titulo' });
  const cuerpo = h('div', { id: 'cal-cuerpo' });
  const segBtns = D.VISTAS.map((x) => h('button', { type: 'button', dataset: { vista: x }, onclick: () => cambiarVista(x) }, t('cal.vista.' + x)));

  function titulo() {
    if (st.vista === 'semana') { const l = D.lunesDe(st.cursor); return t('cal.semana-de', { a: fmtCorta(l), b: fmtCorta(D.addDias(l, 6)) }); }
    if (st.vista === 'agenda') { const r = D.rangoVista('agenda', st.cursor); return `${fmtCorta(r.desde)} – ${fmtCorta(r.hasta)}`; }
    return fmtMesAnio(st.cursor);
  }
  function cambiarVista(x) {
    st.vista = x;
    if (x === 'agenda' && st.sel) st.cursor = st.sel; // the agenda opens at the day you were looking at
    svc.guardarPreferencia('vista', x);
    pintar();
  }
  function mover(dir) {
    st.cursor = D.moverCursor(st.vista, st.cursor, dir);
    st.sel = D.seleccionTrasMover(st.vista, st.cursor, hoy);
    pintar();
  }
  function irAHoy() { st.cursor = hoy; st.sel = hoy; pintar(); }
  function elegirDia(f, enfocar) {
    st.sel = f;
    st.cursor = f;
    pintar();
    if (enfocar) cuerpo.querySelector(`button[data-fecha="${f}"]`)?.focus();
  }

  // ---------- Toolbar: navigation, view switch, filters ----------
  const barra = h('div', { class: 'cal-toolbar' },
    h('div', { class: 'cal-nav', role: 'group', 'aria-label': t('cal.navegacion') },
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': t('cal.anterior'), title: t('cal.anterior'), onclick: () => mover(-1) }, icon('flecha-izq', { size: 18 })),
      tituloEl,
      h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': t('cal.siguiente'), title: t('cal.siguiente'), onclick: () => mover(1) }, icon('flecha-dcha', { size: 18 })),
      h('button', { type: 'button', class: 'btn', onclick: irAHoy }, t('cal.hoy'))),
    h('div', { class: 'segmented', role: 'group', 'aria-label': t('cal.vista.etiqueta') }, segBtns));
  const filtros = h('div', { class: 'filters cal-filtros' },
    h('div', { class: 'field' }, h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, t('cal.filtro.grupo')),
      h('select', { id: 'cal-grupo', onchange: (e) => { st.filtros.grupoId = e.target.value; pintar(); } },
        h('option', { value: '' }, t('cal.filtro.grupo-todos')), grupos.map((g) => h('option', { value: g.id }, g.nombre))))),
    h('div', { class: 'field' }, h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, t('cal.filtro.piscina')),
      h('select', { id: 'cal-piscina', onchange: (e) => { st.filtros.piscina = e.target.value; pintar(); } },
        h('option', { value: '' }, t('cal.filtro.piscina-todas')), ['25', '50'].map((p) => h('option', { value: p }, p + ' m'))))));

  function pintar() {
    const lista = svc.eventos(D.rangoVista(st.vista, st.cursor), st.filtros);
    tituloEl.textContent = titulo();
    segBtns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.vista === st.vista ? 'true' : 'false'));
    const vista = st.vista === 'mes' ? vistaMes(lista, v) : st.vista === 'semana' ? vistaSemana(lista, v) : vistaAgenda(lista, v);
    cuerpo.replaceChildren(leyenda(lista, v), vista);
  }

  // ---------- Page header: ONE Export menu ----------
  const menuExportar = menuAcciones({
    etiqueta: t('cal.exp.menu'), texto: t('cal.exp.menu'),
    items: [
      { label: t('cal.exp.descargar'), icono: 'descargar', onClick: () => exportar({ svc, st, hooks, hoy, abrir: false }) },
      { label: t('cal.exp.anadir'), icono: 'calendario', onClick: () => exportar({ svc, st, hooks, hoy, abrir: true }) },
      { label: t('cal.exp.opciones'), icono: 'ajustes', onClick: () => abrirOpcionesExportacion({ svc, st, onCambio: () => {} }) },
    ],
  });
  menuExportar.id = 'cal-exportar';
  // Descriptive text under the title: what is being shown
  container.append(
    h('header', { class: 'page-head' }, h('h1', null, t('cal.titulo')), h('div', { class: 'page-head-actions' }, menuExportar), h('p', { class: 'page-head-sub', id: 'cal-ambito' }, t('cal.ambito.todos'))),
    barra, filtros, cuerpo, panelSync({ svc, st }));
  pintar();

  // Repaint when data changes (another device of the same person, import...) while the view is on screen.
  if (store.on) {
    const off = store.on(() => {
      if (!container.isConnected) { if (typeof off === 'function') off(); return; }
      pintar();
    });
  }
}
