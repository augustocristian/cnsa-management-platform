// Attendance view: roll call on the pool deck (one tap = present) and history.
// Presentation only: rules are in domain/asistencia.js and use cases in application/asistenciaService.js.
import { h, empty, sheet, toast, avatar, field } from '../ui.js';
import { icon } from '../icons.js';
import { useStyles } from '../styles.js';
import { t, tEstado, tDate, locale } from '../i18n/i18n.js';
import { crearAsistenciaService } from '../../application/asistenciaService.js';
import { ESTADOS, ESTADOS_RAPIDOS, MUCHAS_SESIONES, filtrarSesiones, sesionVecina } from '../../domain/asistencia.js';
import { nombreApellidosPrimero, nombreCompleto } from '../../domain/nombres.js';
import { historialPanel } from './asistencia-historial.js';
import { repintarAlCambiar } from './suscripcion.js';
import { ahoraDe } from '../contexto.js';

const TONO = { presente: 'ok', ausente: 'danger', justificado: 'warn', '': 'neutral' };

export async function render(container, params, ctx) {
  useStyles('asistencia');
  const { store } = ctx;
  const svc = ctx.asistencia || crearAsistenciaService(store, { ahora: ahoraDe(ctx) });
  const state = {
    tab: 'lista', grupoId: '', abierto: null, consulta: '',
    sesionId: (Array.isArray(params) ? params[0] : params && (params.id || params[0])) || '',
  };
  let ultimoAviso = null;

  const grupoNombre = (id) => (svc.grupos().find((g) => g.id === id) || {}).nombre || t('entre.grupo-todos');
  const etiqueta = (s) => `${tDate(String(s.fecha).slice(0, 10))} ${s.hora || ''} · ${s.titulo || t('asist.sesion')} · ${grupoNombre(s.grupoId)}`.replace(/\s+·/, ' ·');

  // Only one undo toast at a time: tapping quickly on the deck must not pile them up.
  function aviso(msg, deshacer) {
    ultimoAviso?.close();
    ultimoAviso = toast.undo(msg, deshacer);
  }

  // ---------- Roll call ----------
  function tarjeta(f, sesionId) {
    const nombre = nombreApellidosPrimero(f.nadador);
    const boton = (estado) => h('button', {
      type: 'button', class: 'asi-btn', 'data-estado': estado, 'data-foco': `${f.nadador.id}:${estado}`, 'aria-pressed': String(f.estado === estado),
      onclick: () => {
        const r = svc.tocar(sesionId, f.nadador.id, estado);
        const nuevo = r.actual ? r.actual.estado : '';
        aviso(nuevo ? t('asist.guardado', { nombre, estado: tEstado(nuevo) }) : t('asist.desmarcado', { nombre }), () => svc.deshacer(sesionId, f.nadador.id, r));
      },
    }, icon(estado === 'presente' ? 'check' : 'cerrar', { size: 18 }), tEstado(estado));
    return h('li', { class: 'asi-card', 'data-estado': f.estado, 'data-nid': f.nadador.id },
      h('div', { class: 'asi-who' },
        avatar(nombreCompleto(f.nadador)),
        h('div', { class: 'asi-id' },
          h('span', { class: 'asi-name' }, nombre),
          h('span', { class: `badge badge--${TONO[f.estado]} asi-state` }, f.estado ? tEstado(f.estado) : t('asist.sin-marcar'))),
        h('button', {
          type: 'button', class: 'asi-more', 'aria-label': t('asist.mas', { nombre }), 'aria-haspopup': 'dialog', 'data-foco': `${f.nadador.id}:mas`,
          onclick: () => detalle(f, sesionId),
        }, icon('mas-opciones', { size: 22 }))),
      f.registro && f.registro.nota ? h('p', { class: 'asi-note' }, f.registro.nota) : null,
      h('div', { class: 'asi-actions', role: 'group', 'aria-label': nombre }, ESTADOS_RAPIDOS.map(boton)));
  }

  // "..." sheet: any of the four states (including excused) plus a note.
  function detalle(f, sesionId) {
    const nombre = nombreApellidosPrimero(f.nadador);
    let elegido = f.estado;
    const nota = h('input', { type: 'text', value: f.registro ? f.registro.nota || '' : '', maxlength: 120 });
    const chips = h('div', { class: 'asi-estados', role: 'group', 'aria-label': t('asist.estado') });
    const pintar = () => chips.replaceChildren(...ESTADOS.concat('').map((e) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(elegido === e), onclick: () => { elegido = e; pintar(); chips.querySelector('[aria-pressed="true"]')?.focus(); },
    }, e ? tEstado(e) : t('asist.sin-marcar'))));
    pintar();
    sheet({
      onClose: () => container.querySelector(`[data-foco="${f.nadador.id}:mas"]`)?.focus(),
      title: t('asist.detalle-titulo', { nombre }),
      body: h('div', null, chips, field({ label: t('asist.nota'), input: nota })),
      actions: [{ label: t('common.cancelar') }, {
        label: t('common.guardar'), primary: true,
        onClick: () => {
          const r = svc.marcar(sesionId, f.nadador.id, elegido, nota.value.trim());
          aviso(elegido ? t('asist.guardado', { nombre, estado: tEstado(elegido) }) : t('asist.desmarcado', { nombre }), () => svc.deshacer(sesionId, f.nadador.id, r));
        },
      }],
    });
  }

  function resumen(m) {
    const r = m.resumen;
    const chip = (tono, n, clave) => h('span', { class: `badge badge--${tono}` }, t(clave, { n }));
    return h('div', { class: 'asi-sticky' },
      h('div', { class: 'asi-progress' },
        h('p', { 'aria-live': 'polite' }, t('asist.marcados', { x: r.marcados, n: r.total })),
        h('div', { class: 'progress progress--ok', role: 'progressbar', 'aria-label': t('asist.marcados', { x: r.marcados, n: r.total }), 'aria-valuenow': String(r.porcentajeMarcado), 'aria-valuemin': '0', 'aria-valuemax': '100', style: `--value:${r.porcentajeMarcado}%` }, h('span'))),
      h('div', { class: 'asi-sum' },
        chip('ok', r.presente, 'asist.presentes'), chip('danger', r.ausente, 'asist.ausentes'),
        chip('warn', r.justificado, 'asist.justificados'), chip('neutral', r.sinMarcar, 'asist.sin-marcar-n')));
  }

  function selector(sesiones) {
    const eti = new Map(sesiones.map((s) => [s.id, etiqueta(s)]));
    const sel = h('select', { id: 'asi-sesion', onchange: (e) => { state.sesionId = e.target.value; draw(); } });
    const cuenta = h('p', { class: 'asi-meta', 'aria-live': 'polite' });
    const llenar = () => {
      const lista = filtrarSesiones(sesiones, state.consulta, (s) => eti.get(s.id), state.sesionId);
      sel.replaceChildren(...lista.map((s) => h('option', { value: s.id, selected: s.id === state.sesionId }, eti.get(s.id))));
      cuenta.textContent = state.consulta.trim() ? (lista.length ? t('asist.sesiones-n', { n: lista.length, total: sesiones.length }) : t('asist.sin-coincidencias')) : '';
    };
    llenar();
    const vecino = (delta, claveEtq, ic) => {
      const id = sesionVecina(sesiones, state.sesionId, delta);
      return h('button', { type: 'button', class: 'btn btn-icon', 'aria-label': t(claveEtq), disabled: !id, onclick: () => { state.sesionId = id; draw(); } }, icon(ic, { size: 20 }));
    };
    const buscar = sesiones.length > MUCHAS_SESIONES
      ? field({ label: t('asist.sesion-buscar'), hint: t('asist.sesion-buscar-ayuda'), input: h('input', { type: 'search', class: 'asi-search', autocomplete: 'off', value: state.consulta, oninput: (e) => { state.consulta = e.target.value; llenar(); } }) })
      : null;
    return h('div', { class: 'asi-session' + (buscar ? ' asi-session--busca' : '') }, buscar,
      h('div', { class: 'asi-pick' }, vecino(1, 'asist.sesion-anterior', 'flecha-izq'),
        field({ label: t('asist.sesion-sel'), input: sel }), vecino(-1, 'asist.sesion-siguiente', 'flecha-dcha')), cuenta);
  }

  function lista() {
    const sesiones = svc.sesiones();
    if (!sesiones.length) {
      return empty({ icon: 'asistencia', title: t('asist.sin-sesiones'), action: { label: t('asist.sin-sesiones-accion'), onClick: () => { location.hash = '#/entrenamientos'; } } });
    }
    if (!svc.sesion(state.sesionId)) state.sesionId = svc.sesionPorDefecto();
    const m = svc.lista(state.sesionId, locale());
    const todos = h('button', { type: 'button', class: 'btn btn--primary', disabled: !m.filas.length || !m.resumen.sinMarcar, onclick: () => {
      const creadas = svc.marcarTodos(state.sesionId, 'presente', locale());
      if (creadas.length) aviso(t('asist.todos-marcados', { n: creadas.length }), () => svc.deshacerVarias(creadas));
      else toast(t('asist.todos-ya'));
    } }, icon('check', { size: 18 }), t('asist.todos-presentes'));
    return h('div', null, selector(sesiones),
      m.filas.length ? [resumen(m), h('p', { class: 'asi-help' }, t('asist.ayuda-lista')), h('div', { class: 'page-head-actions' }, todos),
        h('ul', { class: 'asi-list', 'aria-label': t('asist.tab-lista') }, m.filas.map((f) => tarjeta(f, m.sesion.id)))]
        : empty({ icon: 'nadadores', title: t('asist.sin-nadadores-grupo') }));
  }

  // ---------- Page ----------
  function pestana(id, clave) {
    return h('button', { type: 'button', class: 'tab', role: 'tab', id: `asi-tab-${id}`, 'aria-selected': String(state.tab === id), 'aria-controls': 'asi-panel', tabindex: state.tab === id ? '0' : '-1',
      onclick: () => { state.tab = id; draw(); },
      onkeydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { state.tab = id === 'lista' ? 'historial' : 'lista'; draw(); container.querySelector(`#asi-tab-${state.tab}`)?.focus(); } },
    }, t(clave));
  }

  function draw() {
    const foco = document.activeElement?.dataset?.foco;
    container.replaceChildren(
      h('header', { class: 'page-head' }, h('h1', null, t('asist.titulo'))),
      h('div', { class: 'tabs', role: 'tablist', 'aria-label': t('asist.tabs-aria') }, pestana('lista', 'asist.tab-lista'), pestana('historial', 'asist.tab-historial')),
      h('div', { id: 'asi-panel', role: 'tabpanel', 'aria-labelledby': `asi-tab-${state.tab}` }, state.tab === 'lista' ? lista() : historialPanel({ svc, state, redraw: draw })));
    if (foco) container.querySelector(`[data-foco="${foco}"]`)?.focus({ preventScroll: true });
  }

  draw();
  return repintarAlCambiar(store, container, draw, ['Asistencia', 'Entrenamientos', 'Nadadores', 'Grupos']);
}
