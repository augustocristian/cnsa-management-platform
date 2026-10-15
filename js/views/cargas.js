// Vista Cargas: registro por tipo, objetivos semanales (ObjetivosCarga), gráfico SVG y alertas.
// Objetivos = metros semanales por nadador. Con "Todos" se compara la media por nadador con carga registrada.
import { t, tTipo, tDate, tNum, locale } from '../i18n.js';

const TIPOS = ['Aeróbico', 'Velocidad', 'Piernas', 'Técnica', 'Fuerza'];
// 1 ene 2024 es lunes: referencia para nombres de día localizados (0 = lunes).
const diaCorto = (i) => new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)).replace('.', '');
const NS = 'http://www.w3.org/2000/svg';

function H(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'selected' || k === 'disabled' || k === 'required') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
function S(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  if (text != null) el.textContent = text;
  return el;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function monday(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
const fm = (n) => tNum(Math.round(n), { maximumFractionDigits: 0 });

function injectStyle() {
  if (document.getElementById('cg-style')) return;
  const st = document.createElement('style');
  st.id = 'cg-style';
  st.textContent = `
.cg-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:1rem}
.cg-bar select,.cg-form input,.cg-form select{padding:.45rem .6rem;border:1px solid #cfd8e3;border-radius:8px;font:inherit}
.cg-week{font-weight:600;color:#0d3b8c;min-width:11rem;text-align:center}
.cg-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.6rem;align-items:end}
.cg-form label{display:flex;flex-direction:column;font-size:.8rem;color:#5b6b7f;gap:.2rem}
.cg-alert{padding:.5rem .8rem;border-radius:8px;margin:.3rem 0;font-size:.9rem}
.cg-alert.hi{background:#fdecea;color:#b3261e}.cg-alert.lo{background:#fff4e0;color:#8a5a00}.cg-alert.ok{background:#e6f4ea;color:#1e7a3a}
.cg-svg{width:100%;height:auto;max-width:720px}
.cg-svg text{font-size:11px;fill:#5b6b7f}
.cg-obj input{width:6rem;padding:.3rem;border:1px solid #cfd8e3;border-radius:6px}
.cg-card{margin-bottom:1rem}`;
  document.head.append(st);
}

export async function render(container, params, ctx) {
  injectStyle();
  const { store, auth, ui } = ctx;
  const toast = (m) => (ui && ui.toast ? ui.toast(m) : null);
  const canEdit = auth.role() !== 'nadador';
  const state = { week: monday(new Date()), nadadorId: '' };

  const nombre = (id) => {
    const n = store.get('Nadadores', id);
    return n ? `${n.nombre} ${n.apellidos || ''}`.trim() : t('cargas.desconocido');
  };

  function objetivos() {
    const map = {};
    for (const k of TIPOS) map[k] = { min: 0, max: 0, row: null };
    for (const o of store.list('ObjetivosCarga')) {
      if (map[o.tipo]) map[o.tipo] = { min: Number(o.minSemanalM) || 0, max: Number(o.maxSemanalM) || 0, row: o };
    }
    return map;
  }

  function weekRows() {
    const a = iso(state.week);
    const e = new Date(state.week); e.setDate(e.getDate() + 6);
    const b = iso(e);
    return store.list('Cargas').filter((c) => c.fecha >= a && c.fecha <= b && (!state.nadadorId || c.nadadorId === state.nadadorId));
  }

  function totals(rows) {
    const byTipo = Object.fromEntries(TIPOS.map((k) => [k, 0]));
    const byDia = Array(7).fill(0);
    const swimmers = new Set();
    for (const c of rows) {
      const m = Number(c.metros) || 0;
      if (byTipo[c.tipo] != null) byTipo[c.tipo] += m;
      const d = (new Date(c.fecha + 'T00:00:00').getDay() + 6) % 7;
      if (d >= 0 && d < 7) byDia[d] += m;
      swimmers.add(c.nadadorId);
    }
    const div = state.nadadorId ? 1 : Math.max(1, swimmers.size);
    for (const k of TIPOS) byTipo[k] /= div;
    for (let i = 0; i < 7; i++) byDia[i] /= div;
    return { byTipo, byDia };
  }

  function chartTipos(tot, obj) {
    const W = 600, Hh = 240, L = 50, B = 30, T = 14, R = 10;
    const max = Math.max(1, ...TIPOS.map((k) => Math.max(tot.byTipo[k], obj[k].max))) * 1.1;
    const y = (v) => Hh - B - (v / max) * (Hh - B - T);
    const slot = (W - L - R) / TIPOS.length;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'cg-svg', role: 'img', 'aria-label': t('cargas.aria-tipo') });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg.append(S('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#e3e9f0' }), S('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, fm(v)));
    }
    TIPOS.forEach((k, i) => {
      const x = L + i * slot + slot * 0.2, w = slot * 0.6, v = tot.byTipo[k], o = obj[k];
      const col = o.max && v > o.max ? '#d93025' : o.min && v < o.min ? '#f29900' : '#1a73e8';
      if (o.max > 0) svg.append(S('rect', { x: x - 6, y: y(o.max), width: w + 12, height: Math.max(0, y(o.min) - y(o.max)), fill: '#1a73e8', opacity: '.12' }));
      svg.append(S('rect', { x, y: y(v), width: w, height: Hh - B - y(v), fill: col, rx: 3 }));
      if (o.min) svg.append(S('line', { x1: x - 6, x2: x + w + 6, y1: y(o.min), y2: y(o.min), stroke: '#188038', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      if (o.max) svg.append(S('line', { x1: x - 6, x2: x + w + 6, y1: y(o.max), y2: y(o.max), stroke: '#d93025', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      svg.append(S('text', { x: x + w / 2, y: Hh - 10, 'text-anchor': 'middle' }, tTipo(k)));
    });
    return svg;
  }

  function chartDias(tot) {
    const W = 600, Hh = 180, L = 50, B = 26, T = 12, R = 10;
    const max = Math.max(1, ...tot.byDia) * 1.15;
    const slot = (W - L - R) / 7;
    const y = (v) => Hh - B - (v / max) * (Hh - B - T);
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'cg-svg', role: 'img', 'aria-label': t('cargas.aria-dia') });
    svg.append(S('line', { x1: L, x2: W - R, y1: Hh - B, y2: Hh - B, stroke: '#cfd8e3' }));
    tot.byDia.forEach((v, i) => {
      const x = L + i * slot + slot * 0.2, w = slot * 0.6;
      svg.append(S('rect', { x, y: y(v), width: w, height: Hh - B - y(v), fill: '#1a73e8', rx: 3 }));
      if (v) svg.append(S('text', { x: x + w / 2, y: y(v) - 4, 'text-anchor': 'middle' }, fm(v)));
      svg.append(S('text', { x: x + w / 2, y: Hh - 8, 'text-anchor': 'middle' }, diaCorto(i)));
    });
    return svg;
  }

  function addCarga(form) {
    const f = new FormData(form);
    const metros = Number(f.get('metros'));
    if (!f.get('nadadorId') || !f.get('fecha') || !(metros > 0)) { toast(t('cargas.err-campos')); return; }
    store.upsert('Cargas', {
      nadadorId: f.get('nadadorId'), fecha: f.get('fecha'), tipo: f.get('tipo'), metros,
      rpe: f.get('rpe') ? Number(f.get('rpe')) : '', minutos: f.get('minutos') ? Number(f.get('minutos')) : '',
      notas: f.get('notas') || '', entrenamientoId: ''
    });
    toast(t('cargas.registrada'));
    draw();
  }

  function draw() {
    const nads = store.list('Nadadores').filter((n) => n.activo !== false && n.activo !== 'FALSE' && n.activo !== 'no');
    const obj = objetivos();
    const rows = weekRows();
    const tot = totals(rows);
    const end = new Date(state.week); end.setDate(end.getDate() + 6);
    const lbl = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(d);

    const sel = H('select', { onchange: (e) => { state.nadadorId = e.target.value; draw(); } },
      H('option', { value: '' }, t('cargas.todos-media')),
      nads.map((n) => H('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))));
    const shift = (d) => () => { state.week = monday(new Date(state.week.getTime() + d * 7 * 864e5 + 3600e3)); draw(); };
    const bar = H('div', { class: 'cg-bar' },
      H('button', { class: 'btn', 'aria-label': t('cargas.semana-anterior'), onclick: shift(-1) }, '‹'),
      H('span', { class: 'cg-week' }, `${lbl(state.week)} – ${lbl(end)}`),
      H('button', { class: 'btn', 'aria-label': t('cargas.semana-siguiente'), onclick: shift(1) }, '›'),
      H('button', { class: 'btn', onclick: () => { state.week = monday(new Date()); draw(); } }, t('cargas.hoy')), sel);

    const alerts = [];
    for (const k of TIPOS) {
      const v = tot.byTipo[k], o = obj[k];
      if (o.max && v > o.max) alerts.push(H('div', { class: 'cg-alert hi' }, t('cargas.alerta-alto', { tipo: tTipo(k), v: fm(v), max: fm(o.max) })));
      else if (o.min && v < o.min) alerts.push(H('div', { class: 'cg-alert lo' }, t('cargas.alerta-bajo', { tipo: tTipo(k), v: fm(v), min: fm(o.min) })));
    }
    if (!alerts.length) alerts.push(H('div', { class: 'cg-alert ok' }, t('cargas.sin-alertas')));

    const form = canEdit && H('form', { class: 'cg-form', onsubmit: (e) => { e.preventDefault(); addCarga(e.target); } },
      H('label', {}, t('cargas.f.nadador'), H('select', { name: 'nadadorId', required: true },
        H('option', { value: '' }, '—'), nads.map((n) => H('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))))),
      H('label', {}, t('cargas.f.fecha'), H('input', { type: 'date', name: 'fecha', required: true, value: iso(new Date()) })),
      H('label', {}, t('cargas.f.tipo'), H('select', { name: 'tipo' }, TIPOS.map((k) => H('option', { value: k }, tTipo(k))))),
      H('label', {}, t('cargas.f.metros'), H('input', { type: 'number', name: 'metros', min: 0, step: 50, required: true })),
      H('label', {}, t('cargas.f.rpe'), H('input', { type: 'number', name: 'rpe', min: 1, max: 10 })),
      H('label', {}, t('cargas.f.minutos'), H('input', { type: 'number', name: 'minutos', min: 1 })),
      H('label', {}, t('cargas.f.notas'), H('input', { type: 'text', name: 'notas' })),
      H('button', { class: 'btn', type: 'submit' }, t('cargas.registrar')));

    const objRows = TIPOS.map((k) => {
      const mn = H('input', { type: 'number', min: 0, step: 100, value: obj[k].min, disabled: !canEdit });
      const mx = H('input', { type: 'number', min: 0, step: 100, value: obj[k].max, disabled: !canEdit });
      const save = () => {
        const a = Number(mn.value) || 0, b = Number(mx.value) || 0;
        if (b && a > b) { toast(t('cargas.err-minmax')); return; }
        store.upsert('ObjetivosCarga', { ...(obj[k].row || {}), tipo: k, minSemanalM: a, maxSemanalM: b });
        toast(t('cargas.objetivo-guardado', { tipo: tTipo(k) }));
        draw();
      };
      return H('tr', {}, H('td', {}, tTipo(k)), H('td', {}, mn), H('td', {}, mx), canEdit ? H('td', {}, H('button', { class: 'btn', type: 'button', onclick: save }, t('cargas.guardar'))) : null);
    });

    const list = rows.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((c) => H('tr', {},
      H('td', {}, tDate(c.fecha)), H('td', {}, nombre(c.nadadorId)), H('td', {}, H('span', { class: 'badge' }, tTipo(c.tipo) || '—')),
      H('td', {}, fm(Number(c.metros) || 0)), H('td', {}, c.rpe || ''), H('td', {}, c.minutos || ''), H('td', {}, c.notas || ''),
      canEdit ? H('td', {}, H('button', { class: 'btn', type: 'button', onclick: async () => {
        const ok = ui && ui.confirmDialog ? await ui.confirmDialog(t('cargas.confirm-eliminar')) : true;
        if (ok) { store.remove('Cargas', c.id); draw(); }
      } }, t('cargas.eliminar'))) : null));

    container.replaceChildren(
      H('h2', {}, t('cargas.titulo')), bar,
      H('div', { class: 'card cg-card' }, H('h3', {}, t('cargas.alertas')), alerts),
      H('div', { class: 'grid' },
        H('div', { class: 'card cg-card' }, H('h3', {}, t('cargas.chart-tipo')), chartTipos(tot, obj),
          H('small', {}, t('cargas.chart-leyenda'))),
        H('div', { class: 'card cg-card' }, H('h3', {}, t('cargas.chart-dia')), chartDias(tot))),
      form ? H('div', { class: 'card cg-card' }, H('h3', {}, t('cargas.registrar-titulo')), form) : null,
      H('div', { class: 'card cg-card cg-obj' }, H('h3', {}, t('cargas.objetivos')),
        H('table', { class: 'table' }, H('thead', {}, H('tr', {}, H('th', {}, t('cargas.th-tipo')), H('th', {}, t('cargas.th-min')), H('th', {}, t('cargas.th-max')), canEdit ? H('th', {}) : null)), H('tbody', {}, objRows))),
      H('div', { class: 'card cg-card' }, H('h3', {}, t('cargas.semana')),
        list.length ? H('table', { class: 'table' }, H('thead', {}, H('tr', {}, ['fecha', 'nadador', 'tipo', 'metros', 'rpe', 'min-abbr', 'notas', canEdit ? '' : null].map((k) => (k == null ? null : H('th', {}, k ? t('cargas.th-' + k) : ''))))), H('tbody', {}, list))
          : H('p', {}, t('cargas.vacio'))));
  }

  draw();
}
