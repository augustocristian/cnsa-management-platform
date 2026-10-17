// "Temporada" tab of the planning: phases, weeks, planned vs real volume, A/B/C events, charts and tools.
// Orchestrator: it owns the screen state and wires the subviews (temporada-secciones, -formularios, -herramientas, -grafico).
// Rules are in js/domain/temporada.js and use cases in js/application/temporadaService.js.
// Vocabulary: macrocycle = Phase, microcycle = Week (Monday to Sunday).
import { h, toast, empty } from '../ui.js';
import { t, tContenido } from '../i18n/i18n.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { crearTemporadaService } from '../../application/temporadaService.js';
import { menuAcciones } from './entreno-menu.js';
import * as S from './temporada-secciones.js';
import * as F from './temporada-formularios.js';
import * as T from './temporada-herramientas.js';

import { ahoraDe } from '../contexto.js';
const esMovil = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 700px)').matches;

export async function render(container, params, ctx) {
  useStyles('temporada');
  container.classList.add('tp-root');
  // Actions live in the page header of the planning shell; rendered on their own they get a local row.
  const acciones = ctx.planificacion?.acciones || h('div', { class: 'page-head-actions' });
  const anfitrion = !!ctx.planificacion?.acciones;
  const svc = crearTemporadaService(ctx.store, { nombreFase: (tp) => t('tp.fase.' + tp), ahora: ahoraDe(ctx) });
  const st = { tid: '', fuente: 'auto', sel: 0, desde: 1, hasta: 0, scroll: false, rangoFijado: false };
  const act = svc.activa();
  if (act) st.tid = act.id;
  let modelo = null;

  function redibujar() {
    if (redibujar.pend) return;
    redibujar.pend = true;
    Promise.resolve().then(() => {
      redibujar.pend = false;
      if (container.isConnected) draw();
    });
  }
  function seleccionar(n, scroll = false) {
    st.sel = n;
    st.scroll = scroll;
    draw();
  }
  const reiniciarVista = () => {
    st.rangoFijado = false;
    st.sel = 0;
  };

  // Everything the sections need: state + actions
  const c = {
    svc,
    st,
    draw,
    redibujar,
    seleccionar,
    esMovil,
    contenidoNombre: (id) => {
      const x = modelo.tipos.find((k) => k.id === id);
      return x ? tContenido(x) : id;
    },
    abrirFase: (base) => F.abrirFase({ svc, m: modelo, sel: st.sel, base, onCambio: redibujar }),
    abrirEvento: (base) => F.abrirEvento({ svc, m: modelo, sel: st.sel, base, onCambio: redibujar }),
    abrirSemana: (s) => F.abrirSemana({ svc, m: modelo, s, onCambio: redibujar }),
    abrirCopiar: (s) =>
      T.abrirCopiar({
        svc,
        m: modelo,
        s,
        fuente: st.fuente,
        onCopiada: (n) => {
          st.sel = n;
          redibujar();
        },
      }),
    abrirPlantilla: (fase) => T.abrirPlantilla({ svc, m: modelo, fase0: fase, onAplicada: redibujar }),
    abrirAjuste: (s) => T.abrirAjuste({ svc, m: modelo, s, onAplicado: redibujar }),
    borrarEvento: (e) => {
      const fila = svc.borrarEvento(e.id);
      toast.undo(t('tp.ev.eliminado'), () => {
        svc.restaurarEvento(fila);
        redibujar();
      });
      redibujar();
    },
    abrirPlanEntreno: async (id) => {
      const { abrirEditor } = await import('./entreno-editor.js');
      abrirEditor({ ctx, sesionId: id });
    },
  };
  const abrirTemporada = (base) =>
    F.abrirTemporada({
      svc,
      base,
      onGuardada: (tp) => {
        st.tid = tp.id;
        reiniciarVista();
        redibujar();
      },
      onEliminada: () => {
        const a = svc.activa();
        st.tid = a ? a.id : '';
        reiniciarVista();
      },
      onCambio: redibujar,
    });

  // ---------- Header actions and toolbar ----------
  function accionesCabecera(m) {
    acciones.replaceChildren(
      h(
        'button',
        { type: 'button', class: 'btn', onclick: () => abrirTemporada(m.temporada) },
        icon('editar', { size: 16 }),
        t('tp.temporada.editar'),
      ),
      menuAcciones({
        etiqueta: t('tp.mas-acciones'),
        items: [
          { label: t('tp.temporada.nueva'), icono: 'mas', onClick: () => abrirTemporada(null) },
          {
            label: t('tp.temporada.activar'),
            icono: 'check',
            oculto: m.temporada.activa,
            onClick: () => {
              svc.activar(m.temporada.id);
              toast(t('tp.temporada.activada'));
              redibujar();
            },
          },
        ],
      }),
    );
  }

  function barra(m) {
    const temporadas = svc.temporadas();
    const sel = h(
      'select',
      {
        'aria-label': t('tp.temporada'),
        onchange: (e) => {
          st.tid = e.target.value;
          reiniciarVista();
          draw();
        },
      },
      temporadas.map((x) =>
        h('option', { value: x.id, selected: x.id === st.tid }, `${x.nombre}${x.activa ? ' · ' + t('tp.activa') : ''}`),
      ),
    );
    const fuente = h(
      'select',
      {
        'aria-label': t('tp.fuente-real'),
        onchange: (e) => {
          st.fuente = e.target.value;
          draw();
        },
      },
      ['auto', 'planes', 'cargas'].map((f) =>
        h('option', { value: f, selected: f === st.fuente }, t('tp.fuente-op.' + f)),
      ),
    );
    return h(
      'div',
      { class: 'tp-bar' },
      sel,
      !m.temporada.activa ? h('span', { class: 'badge badge--neutral' }, t('tp.no-activa')) : null,
      h('span', { class: 'grow' }),
      h('label', { class: 'tp-fuente' }, t('tp.fuente-real'), fuente),
    );
  }

  // ---------- Drawing ----------
  function draw() {
    const temporadas = svc.temporadas();
    if (!temporadas.length) {
      st.tid = '';
      acciones.replaceChildren();
      container.replaceChildren(
        h(
          'section',
          { class: 'tp-sec' },
          empty({
            icon: 'grafica',
            title: t('tp.vacio.titulo'),
            text: t('tp.vacio.texto'),
            action: { label: t('tp.temporada.crear'), onClick: () => abrirTemporada(null) },
          }),
        ),
      );
      return;
    }
    if (!temporadas.some((x) => x.id === st.tid)) {
      st.tid = svc.activa().id;
      reiniciarVista();
    }
    modelo = svc.resumen(st.tid, { fuente: st.fuente });
    const m = modelo;
    accionesCabecera(m);
    if (!m.semanas.length) {
      container.replaceChildren(
        ...[anfitrion ? null : acciones, barra(m)].filter(Boolean),
        h(
          'div',
          { class: 'alert alert--danger', role: 'alert' },
          icon('aviso', { size: 18 }),
          h('p', null, t('tp.sin-semanas')),
        ),
      );
      return;
    }
    if (!st.sel || st.sel > m.semanas.length)
      st.sel = m.semanaActual || (m.hoy > m.temporada.fin ? m.semanas.length : 1);
    if (!st.rangoFijado || st.hasta > m.semanas.length || st.desde > st.hasta) {
      st.desde = 1;
      st.hasta = m.semanas.length;
    }
    container.replaceChildren(
      ...[
        anfitrion ? null : acciones,
        barra(m),
        S.resumenCards(m),
        S.panelAvisos(m),
        h(
          'section',
          { class: 'tp-sec', 'aria-labelledby': 'tp-h-sug' },
          h('h2', { id: 'tp-h-sug' }, t('tp.sug.titulo')),
          S.panelSugerencias(m, c, 0),
        ),
        S.seccionFases(m, c),
        S.seccionGrafico(m, c),
        S.seccionTabla(m, c),
        S.detalleSemana(m, c),
        S.seccionEventos(m, c),
      ].filter(Boolean),
    );
    if (st.scroll) {
      st.scroll = false;
      const d = container.querySelector('#tp-detalle');
      if (d) {
        d.scrollIntoView?.({ block: 'start' });
        d.focus?.({ preventScroll: true });
      }
    }
  }

  draw();
  const off = ctx.store.on
    ? ctx.store.on(() => {
        if (container.isConnected) redibujar();
        else if (typeof off === 'function') off();
      })
    : null;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 700px)') : null;
  if (mq && mq.addEventListener)
    mq.addEventListener('change', () => {
      if (container.isConnected) redibujar();
    });
  return off;
}
