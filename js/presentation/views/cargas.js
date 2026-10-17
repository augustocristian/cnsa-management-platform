// Loads view: weekly charts and alerts against the targets, the week's loads, the targets table, and a "Log load" sheet.
// Presentation only: rules are in domain/cargas.js and use cases in application/cargasService.js.
import { h, empty, toast, badge } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tDate, tContenido } from '../i18n/i18n.js';
import { indicePorNombre, normalizarNombre, semanaDe, desplazarSemana, cargasDeSemana } from '../../domain/cargas.js';
import { esActivo } from '../../domain/nadadores.js';
import { nombreCompleto, ordenarPorApellidos } from '../../domain/nombres.js';
import { renderGestor, crearServicio, chip, fmtM } from './cargas-contenidos.js';
import { graficoContenidos, graficoDias, leyenda } from './cargas-graficos.js';
import { tablaObjetivos } from './cargas-objetivos.js';
import { abrirRegistro } from './cargas-registro.js';
import { repintarAlCambiar } from './suscripcion.js';
import { ahoraDe } from '../contexto.js';

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function render(container, params, ctx) {
  useStyles('cargas');
  const { store } = ctx;
  const ahora = ahoraDe(ctx);
  const svc = crearServicio(ctx);
  const hoy = () => isoLocal(ahora());
  const state = { lunes: semanaDe(hoy()).lunes, nadadorId: '', gestor: false, destacar: '', recuerdo: {} };

  const nombre = (id) => {
    const n = store.get('Nadadores', id);
    return n ? nombreCompleto(n) : t('cargas.desconocido');
  };
  const etiquetaDia = (iso) => tDate(iso);

  function registrar() {
    abrirRegistro({
      ctx,
      svc,
      hoy: hoy(),
      nadadores: store.list('Nadadores').filter(esActivo),
      recuerdo: {
        nadadorId: state.recuerdo.nadadorId || state.nadadorId,
        fecha: state.recuerdo.fecha,
        tipoId: state.recuerdo.tipoId,
      },
      onRegistrada: (c, { otra }) => {
        const tipo = svc.resolver(c.tipo);
        state.recuerdo = { nadadorId: c.nadadorId, fecha: c.fecha, tipoId: tipo ? tipo.id : '' };
        state.destacar = c.id;
        state.lunes = semanaDe(c.fecha).lunes; // show the week that holds the new load
        draw();
        if (otra) state.destacar = '';
      },
      onClose: () => container.querySelector('.cg-add')?.focus(),
    });
  }

  function alertas(sem) {
    const lista = [];
    const alerta = (tono, clave, vars) =>
      h(
        'div',
        { class: `alert alert--${tono}`, role: 'status' },
        icon(tono === 'ok' ? 'check' : 'aviso', { size: 18 }),
        h('p', null, t(clave, vars)),
      );
    for (const e of sem.evaluacion) {
      const n = tContenido(e.tipo);
      if (e.estado === 'alto')
        lista.push(alerta('danger', 'cargas.alerta-alto', { tipo: n, v: fmtM(e.metros), max: fmtM(e.max) }));
      else if (e.estado === 'bajo')
        lista.push(alerta('warn', 'cargas.alerta-bajo', { tipo: n, v: fmtM(e.metros), min: fmtM(e.min) }));
    }
    return h('div', { class: 'cg-alerts' }, lista.length ? lista : alerta('ok', 'cargas.sin-alertas'));
  }

  function tablaSemana(filas, sem) {
    if (!filas.length) {
      return empty({
        icon: 'grafica',
        title: t('cargas.vacio-titulo'),
        text: t('cargas.vacio'),
        action: { label: t('cargas.vacio-accion'), onClick: registrar },
      });
    }
    const indice = indicePorNombre(sem.tipos);
    return h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table table--cards' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            ['fecha', 'nadador', 'tipo', 'sesion', 'metros', 'rpe', 'min-abbr', 'notas'].map((k) =>
              h(
                'th',
                { class: ['metros', 'rpe', 'min-abbr'].includes(k) ? 'num' : null },
                t(k === 'sesion' ? 'tc.th-sesion' : 'cargas.th-' + k),
              ),
            ),
            h('th', null, h('span', { class: 'sr-only' }, t('cargas.eliminar'))),
          ),
        ),
        h(
          'tbody',
          null,
          filas.map((c) => {
            const ses = c.entrenamientoId ? store.get('Entrenamientos', c.entrenamientoId) : null;
            const nuevo = c.id === state.destacar;
            return h(
              'tr',
              { class: nuevo ? 'is-new' : null, 'data-id': c.id },
              h(
                'td',
                { 'data-label': t('cargas.th-fecha') },
                etiquetaDia(c.fecha),
                nuevo ? badge(t('cargas.nueva'), 'ok') : null,
              ),
              h('td', { 'data-label': t('cargas.th-nadador') }, nombre(c.nadadorId)),
              h('td', { 'data-label': t('cargas.th-tipo') }, chip(h, indice.get(normalizarNombre(c.tipo)), c.tipo)),
              h('td', { 'data-label': t('tc.th-sesion') }, ses ? ses.titulo || tDate(ses.fecha) : '—'),
              h('td', { class: 'num', 'data-label': t('cargas.th-metros') }, fmtM(Number(c.metros) || 0)),
              h('td', { class: 'num', 'data-label': t('cargas.th-rpe') }, c.rpe || '—'),
              h('td', { class: 'num', 'data-label': t('cargas.th-min-abbr') }, c.minutos || '—'),
              h('td', { 'data-label': t('cargas.th-notas') }, c.notas || '—'),
              h(
                'td',
                { class: 'actions' },
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'btn btn-sm btn--ghost btn-icon',
                    'aria-label': t('cargas.eliminar-aria', {
                      nombre: nombre(c.nadadorId),
                      fecha: etiquetaDia(c.fecha),
                    }),
                    onclick: () => {
                      const fila = svc.eliminarCarga(c.id);
                      draw();
                      toast.undo(t('cargas.eliminada'), () => {
                        svc.restaurarCarga(fila);
                        draw();
                      });
                    },
                  },
                  icon('borrar', { size: 18 }),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  function barra(nadadores, sem) {
    const sel = h(
      'select',
      {
        id: 'cg-nadador',
        onchange: (e) => {
          state.nadadorId = e.target.value;
          draw();
        },
      },
      h('option', { value: '' }, t('cargas.todos-media')),
      nadadores.map((n) => h('option', { value: n.id, selected: n.id === state.nadadorId }, nombreCompleto(n))),
    );
    const mover = (n) => () => {
      state.lunes = desplazarSemana(state.lunes, n);
      draw();
    };
    return h(
      'div',
      { class: 'cg-weekbar' },
      h(
        'button',
        { type: 'button', class: 'btn btn-icon', 'aria-label': t('cargas.semana-anterior'), onclick: mover(-1) },
        icon('flecha-izq', { size: 20 }),
      ),
      h(
        'span',
        {
          class: 'cg-week',
          'aria-live': 'polite',
          title: t('cargas.semana-de', { desde: etiquetaDia(sem.desde), hasta: etiquetaDia(sem.hasta) }),
        },
        `${etiquetaDia(sem.desde)} – ${etiquetaDia(sem.hasta)}`,
      ),
      h(
        'button',
        { type: 'button', class: 'btn btn-icon', 'aria-label': t('cargas.semana-siguiente'), onclick: mover(1) },
        icon('flecha-dcha', { size: 20 }),
      ),
      h(
        'button',
        {
          type: 'button',
          class: 'btn',
          onclick: () => {
            state.lunes = semanaDe(hoy()).lunes;
            draw();
          },
        },
        t('cargas.hoy'),
      ),
      h(
        'div',
        { class: 'cg-who field' },
        h('label', { class: 'sr-only', for: 'cg-nadador' }, t('cargas.f.nadador')),
        sel,
      ),
    );
  }

  function draw() {
    const sem = svc.semana(state.lunes, state.nadadorId);
    const filas = cargasDeSemana(svc.cargas(), { desde: sem.desde, hasta: sem.hasta, nadadorId: state.nadadorId });
    const nadadores = ordenarPorApellidos(store.list('Nadadores').filter(esActivo));
    const card = (titulo, ...hijos) =>
      h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, titulo)), ...hijos);
    const gestorHost = h('div', { id: 'cg-gestor' });
    if (state.gestor) renderGestor(gestorHost, ctx, { svc, onChange: draw });

    container.replaceChildren(
      h(
        'header',
        { class: 'page-head' },
        h('h1', null, t('cargas.titulo')),
        h(
          'div',
          { class: 'page-head-actions' },
          h(
            'button',
            {
              type: 'button',
              class: 'btn',
              'aria-expanded': String(state.gestor),
              'aria-controls': 'cg-gestor',
              onclick: () => {
                state.gestor = !state.gestor;
                draw();
              },
            },
            icon('ajustes', { size: 18 }),
            t(state.gestor ? 'tc.ocultar' : 'tc.mostrar'),
          ),
          h(
            'button',
            { type: 'button', class: 'btn btn--primary cg-add', onclick: registrar },
            icon('mas', { size: 18 }),
            t('cargas.registrar-carga'),
          ),
        ),
      ),
      barra(nadadores, sem),
      h(
        'div',
        { class: 'cg-stack' },
        state.gestor ? card(t('tc.titulo'), gestorHost) : null,
        alertas(sem),
        h(
          'div',
          { class: 'cg-grid' },
          card(t('cargas.chart-tipo'), graficoContenidos(sem), h('p', { class: 'cg-note' }, t('cargas.chart-leyenda'))),
          card(t('cargas.chart-dia'), graficoDias(sem), leyenda(sem)),
        ),
        card(t('cargas.semana'), tablaSemana(filas, sem)),
        card(t('cargas.objetivos'), tablaObjetivos({ svc, onGuardado: draw })),
      ),
      h(
        'button',
        { type: 'button', class: 'cg-fab', 'aria-label': t('cargas.registrar-carga'), onclick: registrar },
        icon('mas', { size: 26 }),
      ),
    );
    if (state.destacar) {
      container.querySelector('tr.is-new')?.scrollIntoView?.({ block: 'nearest' });
      state.destacar = '';
    }
  }

  draw();
  // Home quick action: #/cargas/nueva opens the log sheet straight away
  if (Array.isArray(params) && params[0] === 'nueva') registrar();
  return repintarAlCambiar(store, container, draw, ['Cargas', 'TiposCarga', 'Nadadores', 'Entrenamientos']);
}
