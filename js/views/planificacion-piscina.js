// "Piscina" tab of the planning: lane grid by day or week list, conflicts panel, dialogs. This module owns the screen STATE and
// wires the subviews together (toolbar, grids, dialogs); rules live in domain/planificacion.js and saving in the service.
import { h, toast, empty } from '../ui.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import * as D from '../domain/planificacion.js';
import { fechaDeDate } from '../domain/calendario.js';
import { crearPlanificacionService } from '../application/planificacionService.js';
import { fmtCorta, nombreDia } from './formatos-fecha.js';
import { descripcionBloque } from './planificacion-textos.js';
import { rejillaDia, listaSemana, leyenda } from './planificacion-rejilla.js';
import { panelConflictos } from './planificacion-conflictos.js';
import { barraPiscina, accionesPiscina } from './planificacion-barra.js';
import { abrirFormularioAsignacion } from './planificacion-formulario.js';
import { abrirConfigPiscina, abrirSugerencia } from './planificacion-config.js';
import { teclasTabs } from './tabs-teclado.js';

export async function renderPiscina(container, params, ctx) {
  const { store } = ctx;
  const acciones = ctx.planificacion?.acciones || null; // page-head actions slot supplied by the planning shell
  const svc = crearPlanificacionService(store);
  const hoy = fechaDeDate((ctx.ahora || (() => new Date()))());
  container.classList.add('pl-root');

  const st = { semana: D.lunesDe(hoy), dia: D.diaDeFecha(hoy), modo: 'dia', piscinaId: '', ultimoFoco: null };
  const tono = (gid) => D.colorTono(gid, svc.grupos());

  // ---------- Actions shared by the toolbar, the grid and the dialogs ----------
  const abrirForm = (row) => abrirFormularioAsignacion({ svc, row, piscinaId: st.piscinaId, dia: st.dia, abrirOtro: abrirForm, onCambio: () => draw() });
  const abrirConfig = (base) => abrirConfigPiscina({ svc, base, onGuardada: (id) => { st.piscinaId = id; draw(); }, onEliminada: () => { st.piscinaId = ''; draw(); } });
  const accion = {
    cambiarPiscina: (id) => { st.piscinaId = id; draw(); },
    cambiarModo: (m) => { st.modo = m; draw(); },
    semana: (n) => { st.semana = D.sumarDias(st.semana, n * 7); draw(); },
    hoy: () => { st.semana = D.lunesDe(hoy); st.dia = D.diaDeFecha(hoy); draw(); },
    nueva: () => abrirForm({ piscinaId: st.piscinaId, dia: st.dia }),
    sugerir: () => abrirSugerencia({ svc, pool: svc.piscina(st.piscinaId), dia: st.dia, onAplicada: (d) => { st.dia = d; draw(); } }),
    configurar: () => abrirConfig(svc.piscina(st.piscinaId)),
    nuevaPiscina: () => abrirConfig(null),
    imprimir: () => window.print(),
  };

  function moverBloque(id, ini, calleDesde, fechaDia) {
    const a = svc.asignaciones().find((x) => x.id === id);
    if (!a) return;
    const dur = a.fin - a.ini;
    const pool = svc.piscina(a.piscinaId);
    const cambios = {
      piscinaId: pool.id, fecha: a.fecha ? fechaDia : '', dia: D.diaDeFecha(fechaDia), horaInicio: D.deMin(ini), horaFin: D.deMin(ini + dur),
      calleDesde, calleHasta: Math.min(pool.numCalles, calleDesde + (a.calleHasta - a.calleDesde)),
    };
    if (svc.mover(id, cambios).ok) { toast(t('plan.movida')); draw(); } else { toast(t('plan.mover-conflicto')); abrirForm({ ...a, ...cambios }); }
  }

  // ---------- Screen ----------
  function pantallaSinPiscinas() {
    acciones?.replaceChildren();
    container.replaceChildren(h('section', { class: 'pl-sec pl-screen' },
      h('h2', null, t('plan.titulo')),
      empty({ icon: 'planificacion', title: t('plan.sin-piscinas-titulo'), text: t('plan.sin-piscinas'), action: { label: t('plan.crear-piscina'), onClick: () => abrirConfig(null) } })));
  }

  function draw() {
    const pools = svc.piscinas();
    if (!pools.some((p) => p.id === st.piscinaId)) st.piscinaId = pools.length ? pools[0].id : '';
    const pool = pools.find((p) => p.id === st.piscinaId);
    if (!pool) { pantallaSinPiscinas(); return; }

    const asigs = svc.asignaciones(pool.id);
    const globales = svc.conflictos({ huecos: true });
    const sev = D.severidadPorAsignacion(globales);
    const grupos = svc.grupos();
    const v = {
      pool, pools, dia: st.dia, semana: st.semana, finSemana: D.sumarDias(st.semana, 6), modo: st.modo, grupos, sev, resumen: D.resumenConflictos(globales), tono,
      abrir: abrirForm, crearEn: abrirForm, mover: moverBloque, foco: (id) => { st.ultimoFoco = id; },
    };
    acciones?.replaceChildren(...accionesPiscina(accion));

    const pantalla = [h('h2', null, t('plan.titulo')), barraPiscina(v, accion)];
    if (st.modo === 'dia') {
      const tabs = teclasTabs(h('div', { class: 'tabs pl-dias pl-screen', id: 'pl-dias', role: 'tablist', 'aria-label': t('plan.dias') },
        D.DIAS.map((d) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': d === st.dia ? 'true' : 'false', class: 'tab pl-tab' + (pool.horario[d] ? '' : ' pl-closed-day'),
          onclick: () => { st.dia = d; draw(); },
        }, h('span', null, nombreDia(d, 'short')), h('small', null, fmtCorta(D.fechaDeDia(st.semana, d)))))));
      pantalla.push(tabs);
      const g = rejillaDia(v, asigs);
      const oc = D.ocupacion(pool, g.doy, g.abre, g.cierra);
      pantalla.push(h('p', { class: 'pl-meta' }, Number.isNaN(g.abre) ? t('plan.dia-cerrado') : t('plan.ocupacion', { pct: oc.pct, horario: `${pool.horario[st.dia].abre}–${pool.horario[st.dia].cierra}` })));
      pantalla.push(g.region);
      if (g.sinSitio.length) {
        pantalla.push(h('div', { class: 'alert alert--danger', role: 'alert' }, icon('aviso', { size: 18 }),
          h('div', null, h('p', { class: 'alert-title' }, t('plan.fuera-rango-aviso')),
            h('ul', { class: 'pl-clist' }, g.sinSitio.map((a) => h('li', null, h('button', { type: 'button', onclick: () => abrirForm(a) }, descripcionBloque(a, grupos))))))));
      }
    } else {
      pantalla.push(listaSemana(v, asigs, true));
    }
    pantalla.push(leyenda(v, grupos));

    const imprimible = h('div', { class: 'pl-print' },
      h('h2', null, `${pool.nombre} · ${t('plan.semana-de', { desde: fmtCorta(st.semana), hasta: fmtCorta(v.finSemana) })}`),
      listaSemana({ ...v, sev: new Map() }, asigs, false), leyenda(v, grupos));

    container.replaceChildren(
      h('section', { class: 'pl-sec pl-screen' }, pantalla),
      panelConflictos({
        conflictos: globales, asignaciones: svc.asignaciones(),
        onAsignacion: (a) => { st.piscinaId = a.piscinaId; abrirForm(a); },
        onHueco: (c) => { st.piscinaId = c.piscinaId; st.dia = c.dia; st.modo = 'dia'; abrirForm({ piscinaId: c.piscinaId, dia: c.dia, horaInicio: c.params.horaInicio, horaFin: c.params.horaFin, calleDesde: c.params.desde, calleHasta: c.params.hasta }); },
      }),
      imprimible);

    const region = container.querySelector('.pl-gridwrap');
    if (region && region.dataset.scroll) region.scrollTop = Number(region.dataset.scroll);
    if (st.ultimoFoco) {
      const el = container.querySelector(`[data-id="${String(st.ultimoFoco).replace(/["\\]/g, '\\$&')}"]`);
      st.ultimoFoco = null;
      el?.focus?.();
    }
  }

  draw();
  if (store.on) {
    const off = store.on(() => { if (container.isConnected) draw(); else if (typeof off === 'function') off(); });
    return off;
  }
  return undefined;
}
