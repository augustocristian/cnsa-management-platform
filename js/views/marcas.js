// Vista Marcas: registro de tiempos (mm:ss.cc), mejores marcas por prueba y evolución SVG.
import { t, tDate, locale } from '../i18n.js';

const PRUEBAS = [
  '50 Libre', '100 Libre', '200 Libre', '400 Libre', '800 Libre', '1500 Libre',
  '50 Espalda', '100 Espalda', '200 Espalda',
  '50 Braza', '100 Braza', '200 Braza',
  '50 Mariposa', '100 Mariposa', '200 Mariposa',
  '100 Estilos', '200 Estilos', '400 Estilos'
];
const NS = 'http://www.w3.org/2000/svg';
const ESTILOS = { libre: 1, espalda: 1, braza: 1, mariposa: 1, estilos: 1 };
// "100 Libre" (valor interno guardado) -> "100 Freestyle" / "100 Stile libero"
function pruebaLabel(p) {
  const m = /^(\d+)\s+(\S+)$/.exec(String(p || ''));
  const k = m && m[2].toLowerCase();
  return k && ESTILOS[k] ? `${m[1]} ${t('marcas.estilo.' + k)}` : String(p ?? '');
}

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

// Formato mm:ss.cc (con fallback por si ui no lo trae)
function fmtT(ms) {
  ms = Math.round(Number(ms) / 10) * 10;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
// Acepta "mm:ss.cc", "ss.cc" o "mm:ss"; devuelve ms o null
function parseT(str) {
  const m = /^\s*(?:(\d{1,2}):)?(\d{1,2})(?:[.,](\d{1,2}))?\s*$/.exec(str || '');
  if (!m) return null;
  const min = Number(m[1] || 0), sec = Number(m[2]), cs = Number((m[3] || '0').padEnd(2, '0'));
  if (sec > 59) return null;
  return min * 60000 + sec * 1000 + cs * 10;
}

function injectStyle() {
  if (document.getElementById('mc-style')) return;
  const st = document.createElement('style');
  st.id = 'mc-style';
  st.textContent = `
.mc-bar{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;margin-bottom:1rem}
.mc-bar select,.mc-form input,.mc-form select{padding:.45rem .6rem;border:1px solid #cfd8e3;border-radius:8px;font:inherit}
.mc-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.6rem;align-items:end}
.mc-form label{display:flex;flex-direction:column;font-size:.8rem;color:#5b6b7f;gap:.2rem}
.mc-card{margin-bottom:1rem}
.mc-svg{width:100%;height:auto;max-width:720px}
.mc-svg text{font-size:11px;fill:#5b6b7f}
.mc-time{font-variant-numeric:tabular-nums;font-weight:600}
.mc-pb{background:#e6f4ea;color:#1e7a3a}`;
  document.head.append(st);
}

export async function render(container, params, ctx) {
  injectStyle();
  const { store, ui } = ctx;
  const toast = (m) => (ui && ui.toast ? ui.toast(m) : null);
  const fmt = (ms) => (ui && ui.fmtTime ? ui.fmtTime(ms) : fmtT(ms));
  const parse = (s) => (ui && ui.parseTime ? ui.parseTime(s) : parseT(s));
  const state = { nadadorId: '', prueba: '', piscina: '' };

  const nombre = (id) => {
    const n = store.get('Nadadores', id);
    return n ? `${n.nombre} ${n.apellidos || ''}`.trim() : t('marcas.desconocido');
  };

  function chartEvol(rows) {
    const pts = rows.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
    const W = 600, Hh = 240, L = 62, B = 34, T = 14, R = 16;
    const svg = S('svg', { viewBox: `0 0 ${W} ${Hh}`, class: 'mc-svg', role: 'img', 'aria-label': t('marcas.aria-evol') });
    const vals = pts.map((p) => Number(p.tiempoMs));
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.15, 500);
    const a = lo - pad, b = hi + pad;
    const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + (i / (pts.length - 1)) * (W - L - R));
    const y = (v) => T + ((v - a) / (b - a)) * (Hh - T - B); // menos tiempo = más arriba
    for (let i = 0; i <= 4; i++) {
      const v = a + ((b - a) / 4) * i;
      svg.append(S('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#e3e9f0' }), S('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, fmtT(v)));
    }
    svg.append(S('polyline', { points: pts.map((p, i) => `${x(i)},${y(Number(p.tiempoMs))}`).join(' '), fill: 'none', stroke: '#1a73e8', 'stroke-width': 2.5 }));
    pts.forEach((p, i) => {
      const best = Number(p.tiempoMs) === lo;
      const c = S('circle', { cx: x(i), cy: y(Number(p.tiempoMs)), r: best ? 6 : 4, fill: best ? '#188038' : '#1a73e8' });
      c.append(S('title', {}, `${tDate(p.fecha)} · ${fmtT(p.tiempoMs)}${p.competicion ? ' · ' + p.competicion : ''}`));
      svg.append(c);
      if (pts.length <= 8 || i === 0 || i === pts.length - 1) svg.append(S('text', { x: x(i), y: Hh - 12, 'text-anchor': 'middle' }, p.fecha.slice(2)));
    });
    return svg;
  }

  function addMarca(form) {
    const f = new FormData(form);
    const ms = parse(f.get('tiempo'));
    if (!f.get('nadadorId') || !f.get('fecha') || !f.get('prueba')) { toast(t('marcas.err-campos')); return; }
    if (!(ms > 0)) { toast(t('marcas.err-tiempo')); return; }
    store.upsert('Marcas', {
      nadadorId: f.get('nadadorId'), fecha: f.get('fecha'), prueba: f.get('prueba'), piscina: f.get('piscina'),
      tiempoMs: ms, competicion: f.get('competicion') || '', notas: f.get('notas') || ''
    });
    toast(t('marcas.registrada'));
    draw();
  }

  function draw() {
    const nads = store.list('Nadadores').filter((n) => n.activo !== false && n.activo !== 'FALSE' && n.activo !== 'no');
    const all = store.list('Marcas').filter((m) => Number(m.tiempoMs) > 0);
    const pruebas = [...new Set([...PRUEBAS, ...all.map((m) => m.prueba)])];
    const filtered = all.filter((m) => (!state.nadadorId || m.nadadorId === state.nadadorId)
      && (!state.prueba || m.prueba === state.prueba) && (!state.piscina || String(m.piscina) === state.piscina));

    const filtros = H('div', { class: 'mc-bar' },
      H('select', { onchange: (e) => { state.nadadorId = e.target.value; draw(); } }, H('option', { value: '' }, t('marcas.todos-nadadores')),
        nads.map((n) => H('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id)))),
      H('select', { onchange: (e) => { state.prueba = e.target.value; draw(); } }, H('option', { value: '' }, t('marcas.todas-pruebas')),
        pruebas.map((p) => H('option', { value: p, selected: p === state.prueba }, pruebaLabel(p)))),
      H('select', { onchange: (e) => { state.piscina = e.target.value; draw(); } }, H('option', { value: '' }, t('marcas.piscina-ambas')),
        ['25', '50'].map((p) => H('option', { value: p, selected: p === state.piscina }, p + ' m'))));

    // Mejores marcas por nadador + prueba + piscina
    const best = new Map();
    for (const m of filtered) {
      const k = `${m.nadadorId}|${m.prueba}|${m.piscina}`;
      const cur = best.get(k);
      if (!cur || Number(m.tiempoMs) < Number(cur.tiempoMs)) best.set(k, m);
    }
    const bestRows = [...best.values()].sort((a, b) => a.prueba.localeCompare(b.prueba, locale(), { numeric: true }) || nombre(a.nadadorId).localeCompare(nombre(b.nadadorId)));
    const bestIds = new Set(bestRows.map((m) => m.id));

    // Evolución: requiere nadador y prueba concretos
    let evol;
    if (!state.nadadorId || !state.prueba) evol = H('p', {}, t('marcas.evol-seleccion'));
    else if (filtered.length < 1) evol = H('p', {}, t('marcas.evol-vacio'));
    else evol = chartEvol(filtered);

    const form = H('form', { class: 'mc-form', onsubmit: (e) => { e.preventDefault(); addMarca(e.target); } },
      H('label', {}, t('marcas.f.nadador'), H('select', { name: 'nadadorId', required: true }, H('option', { value: '' }, '—'),
        nads.map((n) => H('option', { value: n.id, selected: n.id === state.nadadorId }, nombre(n.id))))),
      H('label', {}, t('marcas.f.fecha'), H('input', { type: 'date', name: 'fecha', required: true, value: iso(new Date()) })),
      H('label', {}, t('marcas.f.prueba'), H('select', { name: 'prueba', required: true }, pruebas.map((p) => H('option', { value: p, selected: p === state.prueba }, pruebaLabel(p))))),
      H('label', {}, t('marcas.f.piscina'), H('select', { name: 'piscina' }, H('option', { value: '25', selected: state.piscina !== '50' }, '25 m'), H('option', { value: '50', selected: state.piscina === '50' }, '50 m'))),
      H('label', {}, t('marcas.f.tiempo'), H('input', { type: 'text', name: 'tiempo', placeholder: '01:02.45', required: true, inputmode: 'decimal' })),
      H('label', {}, t('marcas.f.competicion'), H('input', { type: 'text', name: 'competicion' })),
      H('label', {}, t('marcas.f.notas'), H('input', { type: 'text', name: 'notas' })),
      H('button', { class: 'btn', type: 'submit' }, t('marcas.registrar')));

    const bestTable = bestRows.length ? H('table', { class: 'table' },
      H('thead', {}, H('tr', {}, ['prueba', 'piscina', 'nadador', 'mejor', 'fecha', 'competicion'].map((k) => H('th', {}, t('marcas.th-' + k))))),
      H('tbody', {}, bestRows.map((m) => H('tr', {}, H('td', {}, pruebaLabel(m.prueba)), H('td', {}, m.piscina + ' m'), H('td', {}, nombre(m.nadadorId)),
        H('td', { class: 'mc-time' }, fmt(m.tiempoMs)), H('td', {}, tDate(m.fecha)), H('td', {}, m.competicion || ''))))) : H('p', {}, t('marcas.sin-marcas'));

    const hist = filtered.slice().sort((a, b) => (a.fecha < b.fecha ? 1 : -1)).slice(0, 100);
    const histTable = hist.length ? H('table', { class: 'table' },
      H('thead', {}, H('tr', {}, ['fecha', 'nadador', 'prueba', 'piscina', 'tiempo', 'competicion', ''].map((k) => H('th', {}, k ? t('marcas.th-' + k) : '')))),
      H('tbody', {}, hist.map((m) => H('tr', {}, H('td', {}, tDate(m.fecha)), H('td', {}, nombre(m.nadadorId)), H('td', {}, pruebaLabel(m.prueba)), H('td', {}, m.piscina + ' m'),
        H('td', { class: 'mc-time' }, fmt(m.tiempoMs), bestIds.has(m.id) ? H('span', { class: 'badge mc-pb', title: t('marcas.pb-titulo') }, t('marcas.pb')) : null),
        H('td', {}, m.competicion || ''),
        H('td', {}, H('button', { class: 'btn', type: 'button', onclick: async () => {
          const ok = ui && ui.confirmDialog ? await ui.confirmDialog(t('marcas.confirm-eliminar')) : true;
          if (ok) { store.remove('Marcas', m.id); draw(); }
        } }, t('marcas.eliminar'))))))) : H('p', {}, t('marcas.sin-filtros'));

    container.replaceChildren(
      H('h2', {}, t('marcas.titulo')), filtros,
      H('div', { class: 'card mc-card' }, H('h3', {}, t('marcas.registrar-titulo')), form),
      H('div', { class: 'card mc-card' }, H('h3', {}, t('marcas.mejores')), bestTable),
      H('div', { class: 'card mc-card' }, H('h3', {}, t('marcas.evolucion')), evol),
      H('div', { class: 'card mc-card' }, H('h3', {}, t('marcas.historial')), histTable));
  }

  draw();
}
