// Vista Calendario: Mes / Semana / Agenda personalizados por rol, exportación .ics y sincronización con Google Calendar.
// Sólo presenta: la lógica vive en js/domain/calendario.js, la orquestación en js/application/calendarioService.js
// y la API de Google en js/infrastructure/googleCalendar.js.
import { icon } from '../icons.js';
import { t, locale } from '../i18n.js';
import * as D from '../domain/calendario.js';
import { crearCalendarioService } from '../application/calendarioService.js';

const CSS = `
.cal-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cal-head h2{display:flex;align-items:center;gap:.5rem;margin:0 0 .3rem}
.cal-ambito{color:var(--muted);margin:.2rem 0 .8rem;font-size:.92rem}
.cal-toolbar{display:grid;gap:.6rem;margin-bottom:.8rem}
.cal-nav{display:flex;align-items:center;gap:.4rem}
.cal-nav .btn{min-height:44px;min-width:44px;justify-content:center}
.cal-titulo{flex:1;text-align:center;font-weight:700;font-size:1.05rem;color:var(--c-secondary);margin:0}
.cal-titulo::first-letter,.cal-col h3::first-letter,.cal-agenda-dia h3::first-letter,.cal-detalle h3::first-letter{text-transform:uppercase}
.cal-seg{display:flex;border:1px solid var(--c-primary-mid);border-radius:12px;overflow:hidden;background:var(--surface)}
.cal-seg button{flex:1;min-height:44px;border:0;background:transparent;color:var(--c-secondary);font:inherit;font-weight:600;cursor:pointer;padding:.4rem .9rem}
.cal-seg button+button{border-left:1px solid var(--c-primary-mid)}
.cal-seg button[aria-pressed=true]{background:var(--c-primary);color:#fff}
.cal-filtros{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:flex-end;margin-bottom:.7rem}
.cal-filtros label{display:flex;flex-direction:column;gap:.2rem;font-size:.85rem;color:var(--muted)}
.cal-filtros label.cal-check{flex-direction:row;align-items:center;gap:.5rem;min-height:44px;color:var(--text)}
.cal-leyenda{display:flex;flex-wrap:wrap;gap:.4rem;list-style:none;padding:0;margin:0 0 .8rem}
.cal-leyenda-t{font-size:.8rem;color:var(--muted);margin:0 0 .3rem}
.cal-gchip{display:inline-flex;align-items:center;gap:.4rem;padding:.2rem .65rem;border-radius:999px;font-size:.85rem;background:var(--cal-fondo);color:var(--cal-texto);border:1px solid var(--cal-acento)}
.cal-gchip::before{content:"";width:.6rem;height:.6rem;border-radius:50%;background:var(--cal-acento)}
.cal-mes{width:100%;table-layout:fixed;border-collapse:collapse;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.cal-mes th{font-size:.75rem;text-transform:uppercase;color:var(--muted);padding:.4rem 0;border-bottom:2px solid var(--border);font-weight:700}
.cal-celda{vertical-align:top;border:1px solid var(--border);height:64px;padding:2px;cursor:pointer}
.cal-celda.cal-fuera{background:color-mix(in srgb,var(--bg) 70%,transparent)}
.cal-celda.cal-fuera .cal-num{opacity:.55}
.cal-celda.cal-sel{background:var(--c-primary-soft);box-shadow:inset 0 0 0 2px var(--c-primary)}
.cal-num{display:block;width:100%;min-height:28px;text-align:left;border:0;background:none;font:inherit;font-size:.85rem;font-weight:600;color:var(--text);cursor:pointer;padding:2px 4px;border-radius:6px}
.cal-hoy .cal-num span{display:inline-block;min-width:1.6em;text-align:center;border-radius:999px;background:var(--c-primary);color:#fff;padding:0 .2em}
.cal-puntos{display:flex;flex-wrap:wrap;gap:3px;padding:2px 4px}
.cal-punto{width:8px;height:8px;border-radius:50%;background:var(--cal-acento)}
.cal-chips{display:none;list-style:none;margin:0;padding:0}
.cal-chip{font-size:.72rem;line-height:1.25;margin:0 0 2px;padding:1px 4px;border-left:3px solid var(--cal-acento);background:var(--cal-fondo);color:var(--cal-texto);border-radius:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cal-mas{font-size:.72rem;color:var(--muted);padding-left:4px}
.cal-semana{display:grid;gap:.6rem}
.cal-col,.cal-agenda-dia,.cal-detalle{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:.6rem .8rem}
.cal-col.cal-hoy,.cal-agenda-dia.cal-hoy{border-color:var(--c-primary);box-shadow:0 0 0 1px var(--c-primary)}
.cal-col h3,.cal-agenda-dia h3,.cal-detalle h3{margin:0 0 .3rem;font-size:.98rem}
.cal-agenda{display:grid;gap:.6rem}
.cal-detalle{margin-top:.8rem}
.cal-vacio{color:var(--muted);font-size:.9rem;margin:.2rem 0}
.cal-ev{border-left:4px solid var(--cal-acento);background:var(--cal-fondo);color:var(--cal-texto);border-radius:10px;padding:.45rem .7rem;margin:.4rem 0}
.cal-ev-top{display:flex;gap:.6rem;flex-wrap:wrap;align-items:baseline}
.cal-ev-hora{font-weight:700;white-space:nowrap}
.cal-ev-titulo{font-weight:600}
.cal-ev-meta{display:flex;flex-wrap:wrap;gap:.1rem .8rem;font-size:.85rem;margin-top:.2rem}
.cal-ev-badge{font-size:.72rem;border:1px solid currentColor;border-radius:999px;padding:0 .5rem}
.cal-paneles{display:grid;gap:1rem;margin-top:1rem}
.cal-paneles h3{margin-top:0}
.cal-fila{display:flex;flex-wrap:wrap;gap:.6rem 1rem;align-items:flex-end;margin:.6rem 0}
.cal-fila label{display:flex;flex-direction:column;gap:.2rem;font-size:.85rem;color:var(--muted)}
.cal-fila .btn{min-height:44px}
.cal-nota{font-size:.85rem;color:var(--muted);margin:.4rem 0}
.cal-estado{margin:.5rem 0 0;font-size:.92rem}
.cal-error{color:var(--danger)}
@media(min-width:700px){.cal-toolbar{grid-template-columns:1fr auto;align-items:center}}
@media(min-width:760px){.cal-celda{height:108px}.cal-chips{display:block}.cal-puntos{display:none}}
@media(min-width:900px){.cal-paneles{grid-template-columns:1fr 1fr;align-items:start}}
@media(min-width:700px){.cal-semana{grid-template-columns:repeat(auto-fit,minmax(210px,1fr))}}
@media(min-width:1500px){.cal-semana{grid-template-columns:repeat(7,minmax(0,1fr))}}
`;

function injectStyle() {
  if (document.getElementById('cal-style')) return;
  const s = document.createElement('style');
  s.id = 'cal-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignorar */ } };
const dateOf = (f) => { const p = D.parseFecha(f); return new Date(p.y, p.m - 1, p.d); };
const intl = (f, opts) => new Intl.DateTimeFormat(locale(), opts).format(dateOf(f));
const fmtLargo = (f) => intl(f, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtCorto = (f) => intl(f, { day: 'numeric', month: 'short' });
const fmtMes = (f) => intl(f, { month: 'long', year: 'numeric' });
const VISTAS = ['mes', 'semana', 'agenda'];

// Etiquetas traducidas que usa el dominio al generar textos (ICS, Google, títulos).
export const etiquetas = () => ({
  calle: (n) => t('cal.ev.calle', { n }),
  piscina: (p) => t('cal.ev.piscina', { n: p }),
  enfoque: t('cal.ev.enfoque'),
  volumen: t('cal.ev.volumen'),
  grupo: t('cal.ev.grupo'),
  todos: t('cal.sin-grupo'),
});

// Descarga por defecto (se puede sustituir con ctx.cal.descargar en pruebas).
function descargaNavegador(blob, nombre, { abrir = false } = {}) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  if (!abrir) a.download = nombre;
  else a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function anadirAMiCalendario(blob, nombre) {
  try {
    const file = new File([blob], nombre, { type: 'text/calendar' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: nombre }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  descargaNavegador(blob, nombre, { abrir: true });
}

export async function render(container, params, ctx) {
  const { store, auth, ui } = ctx;
  const h = ui.h;
  const hooks = ctx.cal || {};
  injectStyle();
  const svc = hooks.servicio || crearCalendarioService({ store, auth, etq: etiquetas, ahora: hooks.ahora });
  const hoy = svc.hoy();
  const esMovil = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 759px)').matches;
  const guardada = lsGet('cnl:cal-vista');
  const st = {
    vista: VISTAS.includes(guardada) ? guardada : (esMovil ? 'agenda' : 'mes'),
    cursor: hoy, sel: hoy, filtros: { todosGrupos: false, grupoId: '', piscina: '' },
    rango: 'mes', alarma: 0, ventana: 90,
  };
  const rol = svc.usuario().rol;
  const grupos = svc.grupos();
  const color = (gid) => D.colorGrupo(gid, grupos);
  const colorVars = (gid) => { const c = color(gid); return `--cal-fondo:${c.fondo};--cal-acento:${c.acento};--cal-texto:${c.texto}`; };

  container.replaceChildren();

  // ---------- Rangos y eventos de la vista ----------
  function rangoVista() {
    if (st.vista === 'semana') { const l = D.lunesDe(st.cursor); return { desde: l, hasta: D.addDias(l, 6) }; }
    if (st.vista === 'mes') { const l = D.lunesDe(D.inicioMes(st.cursor)); return { desde: l, hasta: D.addDias(D.lunesDe(D.finMes(st.cursor)), 6) }; }
    return { desde: D.inicioMes(st.cursor), hasta: D.finMes(st.cursor) };
  }
  const eventosVista = () => svc.eventos(rangoVista(), st.filtros);
  const porDia = (lista) => { const m = new Map(); lista.forEach((e) => { if (!m.has(e.fecha)) m.set(e.fecha, []); m.get(e.fecha).push(e); }); return m; };

  // ---------- Piezas ----------
  function horaTxt(ev) {
    if (!ev.hora) return t('cal.ev.todo-dia');
    const fin = D.finEvento(ev);
    return `${ev.hora}–${fin.hora}`;
  }
  function tarjeta(ev) {
    const meta = [];
    if (ev.grupoNombre) meta.push(h('span', null, `${t('cal.ev.grupo')}: ${ev.grupoNombre}`));
    const pis = D.ubicacionEvento(ev, etiquetas());
    if (pis) meta.push(h('span', null, pis));
    if (ev.enfoque) meta.push(h('span', null, `${t('cal.ev.enfoque')}: ${ev.enfoque}`));
    if (ev.volumenMin !== '' || ev.volumenMax !== '') meta.push(h('span', null, `${t('cal.ev.volumen')}: ${ev.volumenMin !== '' && ev.volumenMax !== '' ? `${ev.volumenMin}–${ev.volumenMax}` : (ev.volumenMax || ev.volumenMin)} m`));
    if (ev.descripcion && ev.origen === 'calle') meta.push(h('span', null, ev.descripcion));
    return h('article', { class: 'cal-ev', style: colorVars(ev.grupoId), dataset: { origen: ev.origen, id: ev.id } },
      h('div', { class: 'cal-ev-top' },
        h('span', { class: 'cal-ev-hora' }, horaTxt(ev)),
        h('span', { class: 'cal-ev-titulo' }, ev.titulo),
        ev.origen === 'calle' ? h('span', { class: 'cal-ev-badge' }, t('cal.ev.asignacion')) : null,
        ev.estado === 'realizado' ? h('span', { class: 'cal-ev-badge' }, t('cal.ev.realizado')) : null),
      meta.length ? h('div', { class: 'cal-ev-meta' }, meta) : null);
  }
  const listaDia = (evs) => (evs.length ? evs.map(tarjeta) : h('p', { class: 'cal-vacio' }, t('cal.vacio-dia')));
  const nEventos = (n) => (n === 1 ? t('cal.ev.uno') : t('cal.ev.n', { n }));

  function leyenda(lista) {
    const ids = new Set(lista.map((e) => e.grupoId));
    const visibles = svc.gruposVisibles(st.filtros);
    const chips = grupos.filter((g) => ids.has(g.id) || (visibles && visibles.includes(g.id)) || (!visibles && rol !== 'nadador'))
      .map((g) => h('li', { class: 'cal-gchip', style: colorVars(g.id) }, g.nombre));
    if (ids.has('')) chips.push(h('li', { class: 'cal-gchip', style: colorVars('') }, t('cal.sin-grupo')));
    return h('div', null, h('p', { class: 'cal-leyenda-t' }, t('cal.leyenda')), h('ul', { class: 'cal-leyenda', 'aria-label': t('cal.leyenda') }, chips));
  }

  // ---------- Vistas ----------
  function vistaMes(lista) {
    const dias = porDia(lista);
    const r = rangoVista();
    const mesActual = st.cursor.slice(0, 7);
    const cab = [...Array(7).keys()].map((i) => {
      const f = D.addDias('2024-01-01', i); // 2024-01-01 fue lunes
      return h('th', { scope: 'col', abbr: intl(f, { weekday: 'long' }) }, intl(f, { weekday: 'short' }));
    });
    const filas = [];
    for (let ini = r.desde; ini <= r.hasta; ini = D.addDias(ini, 7)) {
      const celdas = [];
      for (let i = 0; i < 7; i++) {
        const f = D.addDias(ini, i);
        const evs = dias.get(f) || [];
        const cls = ['cal-celda', f.slice(0, 7) === mesActual ? '' : 'cal-fuera', f === hoy ? 'cal-hoy' : '', f === st.sel ? 'cal-sel' : ''].filter(Boolean).join(' ');
        const btn = h('button', {
          type: 'button', class: 'cal-num', 'aria-pressed': f === st.sel ? 'true' : 'false', 'aria-current': f === hoy ? 'date' : null,
          'aria-label': `${fmtLargo(f)}${evs.length ? ', ' + nEventos(evs.length) : ''}`, dataset: { fecha: f },
          onkeydown: (e) => teclaMes(e, f),
        }, h('span', null, String(Number(f.slice(8)))));
        celdas.push(h('td', { class: cls, onclick: () => elegirDia(f, false) }, btn,
          h('ul', { class: 'cal-chips', 'aria-hidden': 'true' },
            evs.slice(0, 3).map((e) => h('li', { class: 'cal-chip', style: colorVars(e.grupoId) }, `${e.hora ? e.hora + ' ' : ''}${e.titulo}`)),
            evs.length > 3 ? h('li', { class: 'cal-mas' }, t('cal.ev.mas', { n: evs.length - 3 })) : null),
          evs.length ? h('div', { class: 'cal-puntos', 'aria-hidden': 'true' }, evs.slice(0, 4).map((e) => h('span', { class: 'cal-punto', style: colorVars(e.grupoId) }))) : null));
      }
      filas.push(h('tr', null, celdas));
    }
    const detalle = h('section', { class: 'cal-detalle', 'aria-labelledby': 'cal-detalle-t' },
      h('h3', { id: 'cal-detalle-t' }, t('cal.dia', { fecha: fmtLargo(st.sel) })), listaDia(dias.get(st.sel) || []));
    return h('div', null,
      h('table', { class: 'cal-mes' }, h('caption', { class: 'cal-sr' }, fmtMes(st.cursor)), h('thead', null, h('tr', null, cab)), h('tbody', null, filas)),
      detalle);
  }

  function teclaMes(e, f) {
    const mov = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!mov) return;
    e.preventDefault();
    elegirDia(D.addDias(f, mov), true);
  }

  function vistaSemana(lista) {
    const dias = porDia(lista);
    const lunes = D.lunesDe(st.cursor);
    return h('div', { class: 'cal-semana' }, [...Array(7).keys()].map((i) => {
      const f = D.addDias(lunes, i);
      return h('section', { class: 'cal-col' + (f === hoy ? ' cal-hoy' : ''), 'aria-label': fmtLargo(f) },
        h('h3', null, fmtLargo(f)), listaDia(dias.get(f) || []));
    }));
  }

  function vistaAgenda(lista) {
    if (!lista.length) return h('p', { class: 'cal-vacio' }, t('cal.vacio'));
    const dias = porDia(lista);
    return h('div', { class: 'cal-agenda' }, [...dias.keys()].sort().map((f) =>
      h('section', { class: 'cal-agenda-dia' + (f === hoy ? ' cal-hoy' : ''), 'aria-label': fmtLargo(f) },
        h('h3', null, `${fmtLargo(f)}${f === hoy ? ' · ' + t('cal.hoy') : ''}`), dias.get(f).map(tarjeta))));
  }

  // ---------- Barra y filtros ----------
  const tituloEl = h('p', { class: 'cal-titulo', 'aria-live': 'polite', id: 'cal-titulo' });
  const cuerpo = h('div', { id: 'cal-cuerpo' });
  const segBtns = VISTAS.map((v) => h('button', { type: 'button', dataset: { vista: v }, onclick: () => { st.vista = v; lsSet('cnl:cal-vista', v); pintar(); } }, t('cal.vista.' + v)));

  function titulo() {
    if (st.vista === 'semana') { const l = D.lunesDe(st.cursor); return t('cal.semana-de', { a: fmtCorto(l), b: fmtCorto(D.addDias(l, 6)) }); }
    return fmtMes(st.cursor);
  }
  function mover(dir) {
    if (st.vista === 'semana') st.cursor = D.addDias(st.cursor, 7 * dir);
    else st.cursor = D.addMeses(st.cursor, dir);
    st.sel = st.cursor.slice(0, 7) === hoy.slice(0, 7) && st.vista === 'mes' ? hoy : st.cursor;
    pintar();
  }
  function elegirDia(f, enfocar) {
    st.sel = f;
    st.cursor = f;
    pintar();
    if (enfocar) cuerpo.querySelector(`button[data-fecha="${f}"]`)?.focus();
  }

  const barra = h('div', { class: 'cal-toolbar' },
    h('div', { class: 'cal-nav', role: 'group', 'aria-label': t('cal.navegacion') },
      h('button', { type: 'button', class: 'btn', 'aria-label': t('cal.anterior'), title: t('cal.anterior'), onclick: () => mover(-1) }, icon('flecha-izq', { size: 18 })),
      h('button', { type: 'button', class: 'btn', onclick: () => { st.cursor = hoy; st.sel = hoy; pintar(); } }, t('cal.hoy')),
      tituloEl,
      h('button', { type: 'button', class: 'btn', 'aria-label': t('cal.siguiente'), title: t('cal.siguiente'), onclick: () => mover(1) }, icon('flecha-dcha', { size: 18 }))),
    h('div', { class: 'cal-seg', role: 'group', 'aria-label': t('cal.vista.etiqueta') }, segBtns));

  const filtros = [];
  const ambito = svc.ambito();
  if (rol === 'entrenador' && !ambito.todos) {
    filtros.push(h('label', { class: 'cal-check' }, h('input', { type: 'checkbox', id: 'cal-todos', onchange: (e) => { st.filtros.todosGrupos = e.target.checked; pintar(); } }), t('cal.filtro.todos-grupos')));
  }
  if (rol !== 'nadador') {
    filtros.push(h('label', null, t('cal.filtro.grupo'),
      h('select', { id: 'cal-grupo', onchange: (e) => { st.filtros.grupoId = e.target.value; pintar(); } },
        h('option', { value: '' }, t('cal.filtro.grupo-todos')), grupos.map((g) => h('option', { value: g.id }, g.nombre)))));
    filtros.push(h('label', null, t('cal.filtro.piscina'),
      h('select', { id: 'cal-piscina', onchange: (e) => { st.filtros.piscina = e.target.value; pintar(); } },
        h('option', { value: '' }, t('cal.filtro.piscina-todas')), ['25', '50'].map((p) => h('option', { value: p }, `${p} m`)))));
  }
  const demoNadador = rol === 'nadador' && !ambito.vinculado && (!auth.user || auth.demoRole);
  if (demoNadador) {
    filtros.push(h('label', null, t('cal.nadador.demo'),
      h('select', { id: 'cal-nadador', onchange: (e) => { svc.setNadadorDemo(e.target.value); render(container, params, { ...ctx, cal: { ...hooks, servicio: svc } }); } },
        h('option', { value: '' }, t('cal.nadador.demo-elige')),
        svc.nadadores().map((n) => h('option', { value: n.id, selected: n.id === svc.getNadadorDemo() }, `${n.nombre} ${n.apellidos || ''}`.trim())))));
  }

  function textoAmbito() {
    const a = svc.ambito();
    const nombres = (ids) => grupos.filter((g) => ids.includes(g.id)).map((g) => g.nombre).join(', ');
    if (rol === 'nadador') return a.grupoIds.length ? t('cal.ambito.nadador', { grupo: nombres(a.grupoIds) }) : t('cal.nadador.sin-vinculo');
    if (rol === 'entrenador' && !a.todos) return t('cal.ambito.entrenador', { grupos: nombres(a.grupoIds) });
    return t('cal.ambito.todos');
  }

  function pintar() {
    const lista = eventosVista();
    tituloEl.textContent = titulo();
    segBtns.forEach((b) => b.setAttribute('aria-pressed', b.dataset.vista === st.vista ? 'true' : 'false'));
    const vista = st.vista === 'mes' ? vistaMes(lista) : st.vista === 'semana' ? vistaSemana(lista) : vistaAgenda(lista);
    cuerpo.replaceChildren(leyenda(lista), vista);
  }

  // ---------- Exportación ----------
  const alarmas = [];
  const selAlarma = () => {
    const s = h('select', { 'aria-label': t('cal.exp.alarma'), onchange: (e) => { st.alarma = Number(e.target.value); alarmas.forEach((x) => { x.value = e.target.value; }); } },
      [0, 30, 60].map((m) => h('option', { value: String(m) }, t('cal.exp.alarma.' + m))));
    alarmas.push(s);
    return s;
  };
  const exportMsg = h('p', { class: 'cal-estado', role: 'status', 'aria-live': 'polite' });
  const rangoElegido = () => {
    if (st.rango === 'temporada') return { rango: D.rangoPredefinido('temporada', hoy), sufijo: 'temporada' };
    if (st.rango === 'proximos90') return { rango: D.rangoPredefinido('proximos90', hoy), sufijo: '90-dias' };
    return { rango: D.rangoPredefinido('mes', hoy, st.cursor), sufijo: st.cursor.slice(0, 7) };
  };
  function exportar(abrir) {
    const { rango, sufijo } = rangoElegido();
    const res = svc.exportar({ rango, alarmaMin: st.alarma, filtros: st.filtros, sufijo });
    exportMsg.classList.remove('cal-error');
    if (!res.count) { exportMsg.textContent = t('cal.exp.vacio'); exportMsg.classList.add('cal-error'); return res; }
    const blob = new Blob([res.ics], { type: 'text/calendar;charset=utf-8' });
    if (hooks.descargar) hooks.descargar(blob, res.nombre, { abrir, ics: res.ics });
    else if (abrir) anadirAMiCalendario(blob, res.nombre);
    else descargaNavegador(blob, res.nombre);
    exportMsg.textContent = t('cal.exp.ok', { n: res.count });
    return res;
  }

  const zonaInput = h('input', { type: 'text', id: 'cal-zona', value: svc.zona(), list: 'cal-zonas', autocomplete: 'off', spellcheck: 'false' });
  let zonas = [];
  try { zonas = Intl.supportedValuesOf('timeZone'); } catch (e) { zonas = [D.TZ_DEFECTO]; }
  const zonaMsg = h('p', { class: 'cal-estado', role: 'status', 'aria-live': 'polite' });
  const bloqueZona = rol === 'admin' ? h('div', { class: 'cal-fila' },
    h('label', null, t('cal.exp.zona'), zonaInput, h('datalist', { id: 'cal-zonas' }, zonas.map((z) => h('option', { value: z })))),
    h('button', {
      type: 'button', class: 'btn', id: 'cal-zona-guardar',
      onclick: () => {
        zonaMsg.classList.remove('cal-error');
        try { zonaMsg.textContent = t('cal.exp.zona-ok', { zona: svc.guardarZona(zonaInput.value) }); zonaInput.value = svc.zona(); }
        catch (e) { zonaMsg.textContent = t('cal.exp.zona-invalida'); zonaMsg.classList.add('cal-error'); }
      },
    }, t('cal.exp.zona-guardar')),
    h('small', { class: 'cal-nota' }, t('cal.exp.zona-ayuda'))) : null;

  const panelExport = h('section', { class: 'card', 'aria-labelledby': 'cal-exp-t' },
    h('h3', { id: 'cal-exp-t' }, t('cal.exp.titulo')),
    h('div', { class: 'cal-fila' },
      h('label', null, t('cal.exp.rango'), h('select', { id: 'cal-rango', onchange: (e) => { st.rango = e.target.value; } },
        ['mes', 'temporada', 'proximos90'].map((r) => h('option', { value: r }, t('cal.exp.rango.' + r))))),
      h('label', null, t('cal.exp.alarma'), selAlarma())),
    h('div', { class: 'cal-fila' },
      h('button', { type: 'button', class: 'btn btn-primary', id: 'cal-descargar', onclick: () => exportar(false) }, icon('descargar', { size: 18 }), t('cal.exp.descargar')),
      h('button', { type: 'button', class: 'btn', id: 'cal-anadir', onclick: () => exportar(true) }, icon('calendario', { size: 18 }), t('cal.exp.anadir'))),
    exportMsg, bloqueZona, zonaMsg,
    h('p', { class: 'cal-nota' }, t('cal.exp.alcance')),
    h('p', { class: 'cal-nota' }, t('cal.exp.nota')));

  // ---------- Sincronización con Google Calendar ----------
  const syncMsg = h('p', { class: 'cal-estado', role: 'status', 'aria-live': 'polite' });
  const syncEstado = h('p', { class: 'cal-nota', id: 'cal-sync-estado' });
  const puede = svc.puedeSincronizar();
  const errTxt = (e) => {
    const c = e && e.code;
    if (['auth', 'permisos', 'api-desactivada', 'limite', 'red', 'servidor', 'local', 'sin-sesion'].includes(c)) return t('cal.sync.err.' + c);
    return t('cal.sync.err.http', { msg: (e && e.message) || '' });
  };
  function pintarEstadoSync() {
    const e = svc.estadoSync();
    syncEstado.textContent = e.activa
      ? t('cal.sync.estado-activa', { n: e.total, fecha: e.ultima ? new Date(e.ultima.ts).toLocaleString(locale()) : '—' })
      : t('cal.sync.estado-inactiva');
  }
  async function sincronizar(btn) {
    btn.disabled = true;
    syncMsg.classList.remove('cal-error');
    try {
      const r = await svc.sincronizar({ ventanaDias: st.ventana, alarmaMin: st.alarma, onProgreso: (p) => { syncMsg.textContent = t('cal.sync.progreso', p); } });
      syncMsg.textContent = t('cal.sync.resumen', { c: r.creados, a: r.actualizados, b: r.borrados, i: r.iguales, e: r.errores.length });
      if (r.abortado) { syncMsg.textContent += ' ' + errTxt({ code: r.abortado }); syncMsg.classList.add('cal-error'); }
      else if (r.errores.length) { syncMsg.textContent += ' ' + errTxt(r.errores[0]); syncMsg.classList.add('cal-error'); }
    } catch (e) { syncMsg.textContent = errTxt(e); syncMsg.classList.add('cal-error'); }
    btn.disabled = false;
    pintarEstadoSync();
  }
  async function parar(btn) {
    if (!(await ui.confirmDialog(t('cal.sync.parar-confirmar'), { danger: true }))) return;
    btn.disabled = true;
    syncMsg.classList.remove('cal-error');
    try {
      const r = await svc.dejarDeSincronizar();
      syncMsg.textContent = r.errores.length ? t('cal.sync.parado-errores', { n: r.borrados, e: r.errores.length }) : t('cal.sync.parado', { n: r.borrados });
      if (r.errores.length) syncMsg.classList.add('cal-error');
    } catch (e) { syncMsg.textContent = errTxt(e); syncMsg.classList.add('cal-error'); }
    btn.disabled = false;
    pintarEstadoSync();
  }
  const btnSync = h('button', { type: 'button', class: 'btn btn-primary', id: 'cal-sync', disabled: !puede.ok, onclick: (e) => sincronizar(e.currentTarget) }, icon('refrescar', { size: 18 }), t('cal.sync.boton'));
  const btnParar = h('button', { type: 'button', class: 'btn', id: 'cal-sync-parar', disabled: !puede.ok, onclick: (e) => parar(e.currentTarget) }, t('cal.sync.parar'));
  const panelSync = h('section', { class: 'card', 'aria-labelledby': 'cal-sync-t' },
    h('h3', { id: 'cal-sync-t' }, t('cal.sync.titulo')),
    h('p', { class: 'cal-nota' }, t('cal.sync.desc')),
    puede.ok ? h('div', { class: 'cal-fila' },
      h('label', null, t('cal.sync.ventana'), h('select', { id: 'cal-ventana', onchange: (e) => { st.ventana = Number(e.target.value); } },
        [30, 90, 180].map((d) => h('option', { value: String(d), selected: d === 90 }, t('cal.sync.ventana.' + d)))) ),
      h('label', null, t('cal.exp.alarma'), selAlarma())) : null,
    h('div', { class: 'cal-fila' }, btnSync, btnParar),
    puede.ok ? syncEstado : h('p', { class: 'cal-nota', id: 'cal-sync-motivo' },
      puede.motivo === 'local' ? t('cal.sync.local') : t('cal.sync.sin-sesion'), ' ',
      h('a', { href: '#/tutorial' }, t('cal.sync.local-tutorial'))),
    syncMsg);
  if (puede.ok) pintarEstadoSync();

  // ---------- Montaje ----------
  container.append(
    h('div', { class: 'cal-head' }, h('h2', null, icon('calendario', { size: 26 }), t('cal.titulo')), h('p', { class: 'cal-ambito', id: 'cal-ambito' }, textoAmbito())),
    barra, filtros.length ? h('div', { class: 'cal-filtros' }, filtros) : null, cuerpo,
    h('div', { class: 'cal-paneles' }, panelExport, panelSync));
  pintar();

  // Repinta si cambian los datos (otro usuario, importación...) mientras la vista sigue en pantalla.
  if (store.on) {
    const off = store.on(() => {
      if (!container.isConnected) { if (typeof off === 'function') off(); return; }
      pintar();
    });
  }
}
