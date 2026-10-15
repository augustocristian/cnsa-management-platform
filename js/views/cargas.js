// Vista Cargas: registro por tipo, objetivos semanales (ObjetivosCarga), gráfico SVG y alertas.
// Objetivos = metros semanales por nadador. Con "Todos" se compara la media por nadador con carga registrada.
const TIPOS = ['Aeróbico', 'Velocidad', 'Piernas', 'Técnica', 'Fuerza'];
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
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
const fm = (n) => Math.round(n).toLocaleString('es-ES');

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
    return n ? `${n.nombre} ${n.apellidos || ''}`.trim() : '(desconocido)';
  };

  function objetivos() {
    const map = {};
    for (const t of TIPOS) map[t] = { min: 0, max: 0, row: null };
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
    const byTipo = Object.fromEntries(TIPOS.map((t) => [t, 0]));
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
    for (const t of TIPOS) byTipo[t] /= div;
    for (let i = 0; i < 7; i++) byDia[i] /= div;
    return { byTipo, byDia };
  }

  function chartTipos(tot, obj) {
    const W = 600, Hh = 240, L = 50, B = 30, T = 14, R = 10;
    const max = Math.max(1, ...TIPOS.map((t) => Math.max(tot.byTipo[t], obj[t].max))) * 1.1;
    const y = (v) => Hh - B - (v / max) * (Hh - B - T);
    const slot = (W - L - R) / TIPOS.length;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'cg-svg', role: 'img', 'aria-label': 'Metros semanales por tipo' });
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      svg.append(S('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#e3e9f0' }), S('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, fm(v)));
    }
    TIPOS.forEach((t, i) => {
      const x = L + i * slot + slot * 0.2, w = slot * 0.6, v = tot.byTipo[t], o = obj[t];
      const col = o.max && v > o.max ? '#d93025' : o.min && v < o.min ? '#f29900' : '#1a73e8';
      if (o.max > 0) svg.append(S('rect', { x: x - 6, y: y(o.max), width: w + 12, height: Math.max(0, y(o.min) - y(o.max)), fill: '#1a73e8', opacity: '.12' }));
      svg.append(S('rect', { x, y: y(v), width: w, height: Hh - B - y(v), fill: col, rx: 3 }));
      if (o.min) svg.append(S('line', { x1: x - 6, x2: x + w + 6, y1: y(o.min), y2: y(o.min), stroke: '#188038', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      if (o.max) svg.append(S('line', { x1: x - 6, x2: x + w + 6, y1: y(o.max), y2: y(o.max), stroke: '#d93025', 'stroke-width': 2, 'stroke-dasharray': '4 3' }));
      svg.append(S('text', { x: x + w / 2, y: Hh - 10, 'text-anchor': 'middle' }, t));
    });
    return svg;
  }

  function chartDias(tot) {
    const W = 600, Hh = 180, L = 50, B = 26, T = 12, R = 10;
    const max = Math.max(1, ...tot.byDia) * 1.15;
    const slot = (W - L - R) / 7;
    const y = (v) => Hh - B - (v / max) * (Hh - B - T);
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'cg-svg', role: 'img', 'aria-label': 'Metros por día' });
    svg.append(S('line', { x1: L, x2: W - R, y1: Hh - B, y2: Hh - B, stroke: '#cfd8e3' }));
    tot.byDia.forEach((v, i) => {
      const x = L + i * slot + slot * 0.2, w = slot * 0.6;
      svg.append(S('rect', { x, y: y(v), width: w, height: Hh - B - y(v), fill: '#1a73e8', rx: 3 }));
      if (v) svg.append(S('text', { x: x + w / 2, y: y(v) - 4, 'text-anchor': 'middle' }, fm(v)));
      svg.append(S('text', { x: x + w / 2, y: Hh - 8, 'text-anchor': 'middle' }, DIAS[i]));
    });
    return svg;
  }

  function addCarga(form) {
    const f = new FormData(form);
    const metros = Number(f.get('metros'));
    if (!f.get('nadadorId') || !f.get('fecha') || !(metros > 0)) { toast('Indica nadador, fecha y metros'); return; }
    store.upsert('Cargas', {
      nadadorId: f.get('nadadorId'), fecha: f.get('fecha'), tipo: f.get('tipo'), metros,
      rpe: f.get('rpe') ? Number(f.get('rpe')) : '', minutos: f.get('minutos') ? Number(f.get('minutos')) : '',
      notas: f.get('notas') || '', entrenamientoId: ''
    });
    toast('Carga registrada');
    draw();
  }

  function draw() {
    const nads = store.list('Nadadores').filter((n) => n.activo !== false && n.activo !== 'FALSE' && n.activo !== 'no');
    const obj = objetivos();
    const rows = weekRows();
    const tot = totals(rows);
    const end = new Date(state.week); end.setDate(end.getDate() + 6);
    const lbl = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    const sel = H('select', { onchange: (e) => { state.nadadorId = e.target.value; draw(); } },
      H('option', { value: '' }, 'Todos (media por nadador)'),
      nads.map((n) => H('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))));
    const shift = (d) => () => { state.week = monday(new Date(state.week.getTime() + d * 7 * 864e5 + 3600e3)); draw(); };
    const bar = H('div', { class: 'cg-bar' },
      H('button', { class: 'btn', onclick: shift(-1) }, '‹'),
      H('span', { class: 'cg-week' }, `${lbl(state.week)} – ${lbl(end)}`),
      H('button', { class: 'btn', onclick: shift(1) }, '›'),
      H('button', { class: 'btn', onclick: () => { state.week = monday(new Date()); draw(); } }, 'Hoy'), sel);

    const alerts = [];
    for (const t of TIPOS) {
      const v = tot.byTipo[t], o = obj[t];
      if (o.max && v > o.max) alerts.push(H('div', { class: 'cg-alert hi' }, `${t}: por encima del objetivo (${fm(v)} m > máx ${fm(o.max)} m)`));
      else if (o.min && v < o.min) alerts.push(H('div', { class: 'cg-alert lo' }, `${t}: por debajo del objetivo (${fm(v)} m < mín ${fm(o.min)} m)`));
    }
    if (!alerts.length) alerts.push(H('div', { class: 'cg-alert ok' }, 'Sin alertas: cargas dentro de objetivo.'));

    const form = canEdit && H('form', { class: 'cg-form', onsubmit: (e) => { e.preventDefault(); addCarga(e.target); } },
      H('label', {}, 'Nadador', H('select', { name: 'nadadorId', required: true },
        H('option', { value: '' }, '—'), nads.map((n) => H('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))))),
      H('label', {}, 'Fecha', H('input', { type: 'date', name: 'fecha', required: true, value: iso(new Date()) })),
      H('label', {}, 'Tipo', H('select', { name: 'tipo' }, TIPOS.map((t) => H('option', { value: t }, t)))),
      H('label', {}, 'Metros', H('input', { type: 'number', name: 'metros', min: 0, step: 50, required: true })),
      H('label', {}, 'RPE (1-10)', H('input', { type: 'number', name: 'rpe', min: 1, max: 10 })),
      H('label', {}, 'Minutos', H('input', { type: 'number', name: 'minutos', min: 1 })),
      H('label', {}, 'Notas', H('input', { type: 'text', name: 'notas' })),
      H('button', { class: 'btn', type: 'submit' }, 'Registrar'));

    const objRows = TIPOS.map((t) => {
      const mn = H('input', { type: 'number', min: 0, step: 100, value: obj[t].min, disabled: !canEdit });
      const mx = H('input', { type: 'number', min: 0, step: 100, value: obj[t].max, disabled: !canEdit });
      const save = () => {
        const a = Number(mn.value) || 0, b = Number(mx.value) || 0;
        if (b && a > b) { toast('El mínimo no puede superar el máximo'); return; }
        store.upsert('ObjetivosCarga', { ...(obj[t].row || {}), tipo: t, minSemanalM: a, maxSemanalM: b });
        toast(`Objetivo de ${t} guardado`);
        draw();
      };
      return H('tr', {}, H('td', {}, t), H('td', {}, mn), H('td', {}, mx), canEdit ? H('td', {}, H('button', { class: 'btn', type: 'button', onclick: save }, 'Guardar')) : null);
    });

    const list = rows.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).map((c) => H('tr', {},
      H('td', {}, c.fecha), H('td', {}, nombre(c.nadadorId)), H('td', {}, H('span', { class: 'badge' }, c.tipo || '—')),
      H('td', {}, fm(Number(c.metros) || 0)), H('td', {}, c.rpe || ''), H('td', {}, c.minutos || ''), H('td', {}, c.notas || ''),
      canEdit ? H('td', {}, H('button', { class: 'btn', type: 'button', onclick: async () => {
        const ok = ui && ui.confirmDialog ? await ui.confirmDialog('¿Eliminar esta carga?') : true;
        if (ok) { store.remove('Cargas', c.id); draw(); }
      } }, 'Eliminar')) : null));

    container.replaceChildren(
      H('h2', {}, 'Cargas'), bar,
      H('div', { class: 'card cg-card' }, H('h3', {}, 'Alertas'), alerts),
      H('div', { class: 'grid' },
        H('div', { class: 'card cg-card' }, H('h3', {}, 'Metros por tipo vs objetivo'), chartTipos(tot, obj),
          H('small', {}, 'Banda azul = rango objetivo; líneas verde (mín) y roja (máx).')),
        H('div', { class: 'card cg-card' }, H('h3', {}, 'Metros por día'), chartDias(tot))),
      form ? H('div', { class: 'card cg-card' }, H('h3', {}, 'Registrar carga'), form) : null,
      H('div', { class: 'card cg-card cg-obj' }, H('h3', {}, 'Objetivos semanales (metros)'),
        H('table', { class: 'table' }, H('thead', {}, H('tr', {}, H('th', {}, 'Tipo'), H('th', {}, 'Mín'), H('th', {}, 'Máx'), canEdit ? H('th', {}) : null)), H('tbody', {}, objRows))),
      H('div', { class: 'card cg-card' }, H('h3', {}, 'Cargas de la semana'),
        list.length ? H('table', { class: 'table' }, H('thead', {}, H('tr', {}, ['Fecha', 'Nadador', 'Tipo', 'Metros', 'RPE', 'Min', 'Notas', canEdit ? '' : null].map((x) => (x == null ? null : H('th', {}, x))))), H('tbody', {}, list))
          : H('p', {}, 'No hay cargas registradas esta semana.')));
  }

  draw();
}
