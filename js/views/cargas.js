// Vista Cargas: registro de cargas por contenido de entrenamiento (catálogo TiposCarga), objetivos semanales,
// gráficos y alertas. Sólo presenta: la lógica está en domain/cargas.js y application/cargasService.js.
// Objetivos = metros semanales por nadador. Con "Todos" se compara la media por nadador con carga registrada.
import { t, tDate, locale, tContenido, tContenidoDesc } from '../i18n.js';
import { icon } from '../icons.js';
import { agruparPorCategoria, tiposVisibles, COLOR_SIN_TIPO, indicePorNombre, normalizarNombre } from '../domain/cargas.js';
import { renderGestor, crearServicio, abrirFormulario, chip, fmtM, injectStyle as injectTc } from './cargas-contenidos.js';

// 1 ene 2024 es lunes: referencia para nombres de día localizados (0 = lunes).
const diaCorto = (i) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)).replace('.', '');
const NS = 'http://www.w3.org/2000/svg';
const NUEVO = '__nuevo__';

function S(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2)}%`;

function injectStyle() {
  injectTc();
  if (document.getElementById('cg-style')) return;
  const st = document.createElement('style');
  st.id = 'cg-style';
  st.textContent = `
.cg-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:1rem}
.cg-bar select,.cg-form input,.cg-form select{padding:.45rem .6rem;border:1px solid #cfd8e3;border-radius:8px;font:inherit;max-width:100%}
.cg-week{font-weight:600;color:#0d3b8c;min-width:11rem;text-align:center}
.cg-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.6rem;align-items:start}
.cg-form label{display:flex;flex-direction:column;font-size:.8rem;color:#5b6b7f;gap:.2rem;min-width:0}
.cg-form .cg-wide{grid-column:1/-1}
.cg-form button[type=submit]{align-self:end}
.cg-alert{padding:.5rem .8rem;border-radius:8px;margin:.3rem 0;font-size:.9rem}
.cg-alert.hi{background:#fdecea;color:#b3261e}.cg-alert.lo{background:#fff4e0;color:#8a5a00}.cg-alert.ok{background:#e6f4ea;color:#1e7a3a}
.cg-svg{width:100%;height:auto;max-width:720px}
.cg-svg text{font-size:11px;fill:#5b6b7f}
.cg-obj input{width:6rem;padding:.3rem;border:1px solid #cfd8e3;border-radius:6px}
.cg-card{margin-bottom:1rem}
.cg-clist{list-style:none;margin:0;padding:0;display:grid;gap:.55rem}
.cg-crow{display:grid;grid-template-columns:minmax(120px,210px) 1fr minmax(110px,auto);gap:.2rem .7rem;align-items:center}
.cg-ctrack{position:relative;height:1.1rem;background:#eef2f7;border-radius:6px;overflow:hidden}
.cg-cfill{position:absolute;left:0;top:0;bottom:0;border-radius:6px 0 0 6px;opacity:.95}
.cg-cband{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,rgba(31,42,58,.16) 0 4px,rgba(31,42,58,.04) 4px 8px)}
.cg-cmark{position:absolute;top:0;bottom:0;width:3px}
.cg-cmark.mn{background:#188038}.cg-cmark.mx{background:#d93025}
.cg-cval{font-size:.85rem;text-align:right;white-space:nowrap}
.cg-flag{display:block;font-size:.75rem;font-weight:600}
.cg-flag.alto{color:#b3261e}.cg-flag.bajo{color:#8a5a00}.cg-flag.ok{color:#1e7a3a}
.cg-legend{display:flex;flex-wrap:wrap;gap:.3rem .9rem;font-size:.8rem;margin-top:.4rem;color:#5b6b7f}
.cg-help{margin:0;font-size:.8rem;color:#5b6b7f}
@media(max-width:560px){.cg-crow{grid-template-columns:1fr auto}.cg-crow .cg-ctrack{grid-column:1/-1;order:3}.cg-week{min-width:0;flex:1}}`;
  document.head.append(st);
}

export async function render(container, params, ctx) {
  injectStyle();
  const { store, ui } = ctx;
  const h = ui.h;
  const svc = crearServicio(ctx);
  const toast = (m) => (ui && ui.toast ? ui.toast(m) : null);
  const state = { week: monday(new Date()), nadadorId: '', gestor: false, draft: null };

  const nombre = (id) => {
    const n = store.get('Nadadores', id);
    return n ? `${n.nombre} ${n.apellidos || ''}`.trim() : t('cargas.desconocido');
  };

  function chartContenidos(sem) {
    const { agregado, tipos } = sem;
    const filas = tiposVisibles(agregado, tipos).map((tipo) => ({ tipo, v: agregado.metros[tipo.id] || 0, ev: sem.evaluacion.find((e) => e.tipo.id === tipo.id) }));
    const max = Math.max(1, ...filas.map((f) => Math.max(f.v, f.tipo.max || 0, f.tipo.min || 0)), agregado.sinClasificar) * 1.08;
    const lista = h('ul', { class: 'cg-clist', 'aria-label': t('cargas.aria-tipo') });
    for (const { tipo, v, ev } of filas) {
      const mn = tipo.min, mx = tipo.max;
      const banda = mn || mx ? h('div', { class: 'cg-cband', style: `left:${pct(mn || 0, max)};width:${pct((mx || max) - (mn || 0), max)}` }) : null;
      const texto = mn && mx ? t('tc.chart.objetivo', { min: fmtM(mn), max: fmtM(mx) }) : mn ? t('tc.chart.objetivo-min', { min: fmtM(mn) }) : mx ? t('tc.chart.objetivo-max', { max: fmtM(mx) }) : '';
      const flag = !ev ? null : ev.estado === 'alto' ? h('span', { class: 'cg-flag alto' }, t('tc.exceso', { m: fmtM(ev.diferencia) }))
        : ev.estado === 'bajo' ? h('span', { class: 'cg-flag bajo' }, t('tc.faltan', { m: fmtM(ev.diferencia) })) : h('span', { class: 'cg-flag ok' }, t('tc.estado.ok'));
      lista.append(h('li', { class: 'cg-crow' },
        h('span', {}, chip(h, tipo)),
        h('div', { class: 'cg-ctrack', title: texto },
          banda,
          h('div', { class: 'cg-cfill', style: `width:${pct(v, max)};background:${tipo.color}` }),
          mn ? h('i', { class: 'cg-cmark mn', style: `left:calc(${pct(mn, max)} - 1px)` }) : null,
          mx ? h('i', { class: 'cg-cmark mx', style: `left:calc(${pct(mx, max)} - 1px)` }) : null),
        h('span', { class: 'cg-cval' }, `${fmtM(v)} m`, flag)));
    }
    if (agregado.sinClasificar > 0) {
      lista.append(h('li', { class: 'cg-crow' },
        h('span', {}, h('span', { class: 'tc-chip' }, h('span', { class: 'tc-dot', style: `background:${COLOR_SIN_TIPO}` }), t('tc.sin-clasificar'))),
        h('div', { class: 'cg-ctrack' }, h('div', { class: 'cg-cfill', style: `width:${pct(agregado.sinClasificar, max)};background:${COLOR_SIN_TIPO}` })),
        h('span', { class: 'cg-cval' }, `${fmtM(agregado.sinClasificar)} m`)));
    }
    return lista;
  }

  // Barras apiladas por contenido y día (media por nadador o total del nadador elegido).
  function chartDias(sem) {
    const { agregado, tipos } = sem;
    const color = Object.fromEntries(tipos.map((x) => [x.id, x.color]));
    const orden = tiposVisibles(agregado, tipos).map((x) => x.id).concat('');
    const W = 600, Hh = 190, L = 50, B = 26, T = 14, R = 10;
    const max = Math.max(1, ...agregado.porDia) * 1.15;
    const slot = (W - L - R) / 7;
    const y = (v) => Hh - B - (v / max) * (Hh - B - T);
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'cg-svg', role: 'img', 'aria-label': t('cargas.aria-dia') });
    svg.append(S('line', { x1: L, x2: W - R, y1: Hh - B, y2: Hh - B, stroke: '#cfd8e3' }));
    agregado.porDia.forEach((total, i) => {
      const x = L + i * slot + slot * 0.2, w = slot * 0.6;
      let acum = 0;
      for (const id of orden) {
        const v = agregado.porDiaTipo[i][id] || 0;
        if (!v) continue;
        const seg = S('rect', { x, y: y(acum + v), width: w, height: y(acum) - y(acum + v), fill: id ? color[id] : COLOR_SIN_TIPO });
        const tp = id ? tipos.find((x2) => x2.id === id) : null;
        seg.append(S('title', {}, `${diaCorto(i)} · ${tp ? tContenido(tp) : t('tc.sin-clasificar')}: ${fmtM(v)} m`));
        svg.append(seg);
        acum += v;
      }
      if (total) svg.append(S('text', { x: x + w / 2, y: y(total) - 4, 'text-anchor': 'middle' }, fmtM(total)));
      svg.append(S('text', { x: x + w / 2, y: Hh - 8, 'text-anchor': 'middle' }, diaCorto(i)));
    });
    return svg;
  }

  function leyenda(sem) {
    const usados = sem.tipos.filter((x) => (sem.agregado.metros[x.id] || 0) > 0);
    return usados.length ? h('div', { class: 'cg-legend' }, usados.map((x) => chip(h, x))) : null;
  }

  function captureDraft(form) {
    const d = {};
    for (const el of form.elements) if (el.name && el.name !== NUEVO) d[el.name] = el.value;
    return d;
  }

  function registrar(form) {
    const f = new FormData(form);
    const r = svc.registrarCarga({
      nadadorId: f.get('nadadorId'), fecha: f.get('fecha'), tipoId: f.get('tipoId'), metros: f.get('metros'),
      rpe: f.get('rpe'), minutos: f.get('minutos'), notas: f.get('notas'), entrenamientoId: f.get('entrenamientoId'),
    });
    if (!r.ok) {
      const c = r.errores[0].codigo;
      toast(['nadador', 'fecha', 'metros'].includes(c) ? t('cargas.err-campos')
        : c === 'rpe' ? t('tc.err.rpe') : c === 'minutos' ? t('tc.err.minutos') : c === 'sesion-inexistente' ? t('tc.err.sesion') : t('tc.err.elige-contenido'));
      return;
    }
    toast(t('cargas.registrada'));
    draw();
  }

  function formulario(nads) {
    const activos = svc.activos();
    const grupos = agruparPorCategoria(activos);
    const sesiones = svc.sesiones().slice(0, 80);
    const ayuda = h('p', { class: 'cg-help', id: 'cg-tipo-ayuda', 'aria-live': 'polite' });
    const selTipo = h('select', { name: 'tipoId', required: true, 'aria-describedby': 'cg-tipo-ayuda' },
      grupos.map((g) => h('optgroup', { label: t('tc.cat.' + g.categoria) }, g.tipos.map((x) => h('option', { value: x.id }, tContenido(x))))),
      h('option', { value: NUEVO }, t('tc.anadir-opcion')));
    const pintaAyuda = () => { const x = activos.find((a) => a.id === selTipo.value); ayuda.textContent = x ? tContenidoDesc(x) : ''; };
    let previo = selTipo.value;
    const form = h('form', { class: 'cg-form', onsubmit: (e) => { e.preventDefault(); registrar(e.target); } },
      h('label', {}, t('cargas.f.nadador'), h('select', { name: 'nadadorId', required: true },
        h('option', { value: '' }, '—'), nads.map((n) => h('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))))),
      h('label', {}, t('cargas.f.fecha'), h('input', { type: 'date', name: 'fecha', required: true, value: iso(new Date()) })),
      h('div', { class: 'cg-wide' },
        h('label', {}, t('cargas.f.tipo'), selTipo), ayuda),
      h('label', { class: 'cg-wide' }, t('tc.f.sesion'), h('select', { name: 'entrenamientoId' },
        h('option', { value: '' }, t('tc.sin-sesion')),
        sesiones.map((s) => h('option', { value: s.id }, `${tDate(s.fecha)} · ${s.titulo || s.enfoque || ''}`)))),
      h('label', {}, t('cargas.f.metros'), h('input', { type: 'number', name: 'metros', min: 0, step: 50, inputmode: 'numeric', required: true })),
      h('label', {}, t('cargas.f.rpe'), h('input', { type: 'number', name: 'rpe', min: 1, max: 10, inputmode: 'numeric' })),
      h('label', {}, t('cargas.f.minutos'), h('input', { type: 'number', name: 'minutos', min: 1, inputmode: 'numeric' })),
      h('label', {}, t('cargas.f.notas'), h('input', { type: 'text', name: 'notas' })),
      h('button', { class: 'btn btn-primary', type: 'submit', disabled: !activos.length }, t('cargas.registrar')));
    selTipo.addEventListener('change', () => {
      if (selTipo.value === NUEVO) {
        selTipo.value = previo;
        abrirFormulario({ ctx, svc, onGuardado: (nuevo) => { state.draft = { ...captureDraft(form), tipoId: nuevo.id }; draw(); } });
        return;
      }
      previo = selTipo.value;
      pintaAyuda();
    });
    if (state.draft) {
      for (const [k, v] of Object.entries(state.draft)) if (form.elements[k] && v !== undefined) form.elements[k].value = v;
      state.draft = null;
      if (!selTipo.value) selTipo.selectedIndex = 0;
    }
    previo = selTipo.value;
    pintaAyuda();
    return activos.length ? form : h('div', {}, h('p', {}, t('tc.sin-contenidos')), form);
  }

  function draw() {
    const nads = store.list('Nadadores').filter((n) => n.activo !== false && n.activo !== 'FALSE' && n.activo !== 'no');
    const sem = svc.semana(state.week, state.nadadorId);
    const rows = svc.cargas().filter((c) => c.fecha >= sem.desde && c.fecha <= sem.hasta && (!state.nadadorId || c.nadadorId === state.nadadorId));
    const indice = indicePorNombre(sem.tipos);
    const end = new Date(state.week); end.setDate(end.getDate() + 6);
    const lbl = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(d);

    const sel = h('select', { 'aria-label': t('cargas.f.nadador'), onchange: (e) => { state.nadadorId = e.target.value; draw(); } },
      h('option', { value: '' }, t('cargas.todos-media')),
      nads.map((n) => h('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))));
    const shift = (d) => () => { state.week = monday(new Date(state.week.getTime() + d * 7 * 864e5 + 3600e3)); draw(); };
    const bar = h('div', { class: 'cg-bar' },
      h('button', { class: 'btn', 'aria-label': t('cargas.semana-anterior'), onclick: shift(-1) }, '‹'),
      h('span', { class: 'cg-week' }, `${lbl(state.week)} – ${lbl(end)}`),
      h('button', { class: 'btn', 'aria-label': t('cargas.semana-siguiente'), onclick: shift(1) }, '›'),
      h('button', { class: 'btn', onclick: () => { state.week = monday(new Date()); draw(); } }, t('cargas.hoy')), sel,
      h('button', { class: 'btn', type: 'button', 'aria-expanded': state.gestor ? 'true' : 'false', 'aria-controls': 'cg-gestor', onclick: () => { state.gestor = !state.gestor; draw(); } },
        icon('ajustes', { size: 16 }), t(state.gestor ? 'tc.ocultar' : 'tc.mostrar')));

    const alerts = [];
    for (const e of sem.evaluacion) {
      const n = tContenido(e.tipo);
      if (e.estado === 'alto') alerts.push(h('div', { class: 'cg-alert hi' }, t('cargas.alerta-alto', { tipo: n, v: fmtM(e.metros), max: fmtM(e.max) })));
      else if (e.estado === 'bajo') alerts.push(h('div', { class: 'cg-alert lo' }, t('cargas.alerta-bajo', { tipo: n, v: fmtM(e.metros), min: fmtM(e.min) })));
    }
    if (!alerts.length) alerts.push(h('div', { class: 'cg-alert ok' }, t('cargas.sin-alertas')));

    const objRows = svc.activos().map((tipo) => {
      const mn = h('input', { type: 'number', min: 0, step: 100, inputmode: 'numeric', 'aria-label': `${t('cargas.th-min')}: ${tContenido(tipo)}`, value: tipo.min || '' });
      const mx = h('input', { type: 'number', min: 0, step: 100, inputmode: 'numeric', 'aria-label': `${t('cargas.th-max')}: ${tContenido(tipo)}`, value: tipo.max || '' });
      const save = () => {
        const r = svc.guardarObjetivo(tipo.id, mn.value, mx.value);
        if (!r.ok) { toast(t('tc.err.' + (r.errores[0].codigo === 'minmax' ? 'minmax' : r.errores[0].codigo))); return; }
        toast(t('cargas.objetivo-guardado', { tipo: tContenido(tipo) }));
        draw();
      };
      return h('tr', {}, h('td', {}, chip(h, tipo)), h('td', {}, mn), h('td', {}, mx), h('td', {}, h('button', { class: 'btn', type: 'button', onclick: save }, t('cargas.guardar'))));
    });

    const list = rows.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((c) => {
      const ses = c.entrenamientoId ? store.get('Entrenamientos', c.entrenamientoId) : null;
      return h('tr', {},
        h('td', {}, tDate(c.fecha)), h('td', {}, nombre(c.nadadorId)), h('td', {}, chip(h, indice.get(normalizarNombre(c.tipo)), c.tipo)),
        h('td', {}, ses ? ses.titulo || tDate(ses.fecha) : '—'),
        h('td', {}, fmtM(Number(c.metros) || 0)), h('td', {}, c.rpe || ''), h('td', {}, c.minutos || ''), h('td', {}, c.notas || ''),
        h('td', {}, h('button', { class: 'btn', type: 'button', onclick: async () => {
          const ok = ui && ui.confirmDialog ? await ui.confirmDialog(t('cargas.confirm-eliminar')) : true;
          if (ok) { svc.eliminarCarga(c.id); draw(); }
        } }, t('cargas.eliminar'))));
    });
    const th = [['fecha', 'cargas.th-fecha'], ['nadador', 'cargas.th-nadador'], ['tipo', 'cargas.th-tipo'], ['sesion', 'tc.th-sesion'],
      ['metros', 'cargas.th-metros'], ['rpe', 'cargas.th-rpe'], ['min', 'cargas.th-min-abbr'], ['notas', 'cargas.th-notas']];

    const gestorHost = h('div', { id: 'cg-gestor' });
    if (state.gestor) renderGestor(gestorHost, ctx, { svc, onChange: draw });

    container.replaceChildren(...[
      h('h2', {}, t('cargas.titulo')), bar,
      state.gestor ? h('div', { class: 'card cg-card' }, h('h3', {}, t('tc.titulo')), gestorHost) : null,
      h('div', { class: 'card cg-card' }, h('h3', {}, t('cargas.alertas')), alerts),
      h('div', { class: 'grid' },
        h('div', { class: 'card cg-card' }, h('h3', {}, t('cargas.chart-tipo')), chartContenidos(sem),
          h('small', {}, t('cargas.chart-leyenda'))),
        h('div', { class: 'card cg-card' }, h('h3', {}, t('cargas.chart-dia')), chartDias(sem), leyenda(sem))),
      h('div', { class: 'card cg-card' }, h('h3', {}, t('cargas.registrar-titulo')), formulario(nads)),
      h('div', { class: 'card cg-card cg-obj' }, h('h3', {}, t('cargas.objetivos')),
        h('table', { class: 'table' }, h('thead', {}, h('tr', {}, h('th', {}, t('cargas.th-tipo')), h('th', {}, t('cargas.th-min')), h('th', {}, t('cargas.th-max')), h('th', {}))), h('tbody', {}, objRows))),
      h('div', { class: 'card cg-card' }, h('h3', {}, t('cargas.semana')),
        list.length ? h('table', { class: 'table' }, h('thead', {}, h('tr', {}, th.map(([, k]) => h('th', {}, t(k))), h('th', {}))), h('tbody', {}, list))
          : h('p', {}, t('cargas.vacio'))),
    ].filter(Boolean));
  }

  draw();
}
