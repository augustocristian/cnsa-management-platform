// Vista Bañador: entrega de bañador/equipación por nadador (talla, estado, fecha, notas).
import { t, tEstado, tDate, locale } from '../i18n.js';
const TALLAS = ['4', '6', '8', '10', '12', '14', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];

function H(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'selected' || k === 'disabled' || k === 'checked') el[k] = !!v;
    else el.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(String(k)));
  return el;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function injectStyle() {
  if (document.getElementById('bn-style')) return;
  const st = document.createElement('style');
  st.id = 'bn-style';
  st.textContent = `
.bn-bar{display:flex;flex-wrap:wrap;gap:.8rem;align-items:center;margin-bottom:1rem}
.bn-bar select,.bn-bar input[type=search],.bn-table select,.bn-table input[type=text]{padding:.35rem .5rem;border:1px solid #cfd8e3;border-radius:8px;font:inherit}
.bn-pend{background:#fff4e0;color:#8a5a00}.bn-ok{background:#e6f4ea;color:#1e7a3a}
.bn-count{color:#5b6b7f;font-size:.9rem}
.bn-table{overflow-x:auto}`;
  document.head.append(st);
}

export async function render(container, params, ctx) {
  injectStyle();
  const { store, ui } = ctx;
  const toast = (m) => (ui && ui.toast ? ui.toast(m) : null);
  const state = { soloPendientes: false, q: '' };

  const nombre = (n) => `${n.nombre} ${n.apellidos || ''}`.trim();

  function draw() {
    const nads = store.list('Nadadores').filter((n) => n.activo !== false && n.activo !== 'FALSE' && n.activo !== 'no');
    const byNad = new Map(store.list('Banador').map((b) => [b.nadadorId, b]));
    // Sin registro = pendiente
    let items = nads.map((n) => ({ n, b: byNad.get(n.id) || null }));
    const pendientes = items.filter((i) => !i.b || i.b.estado !== 'entregado').length;
    if (state.soloPendientes) items = items.filter((i) => !i.b || i.b.estado !== 'entregado');
    if (state.q) items = items.filter((i) => nombre(i.n).toLowerCase().includes(state.q.toLowerCase()));
    items.sort((a, b) => nombre(a.n).localeCompare(nombre(b.n), locale()));

    const save = (n, b, patch) => {
      store.upsert('Banador', { ...(b || { nadadorId: n.id, talla: '', estado: 'pendiente', fecha: '', notas: '' }), ...patch });
      draw();
    };

    const rows = items.map(({ n, b }) => {
      const estado = b && b.estado === 'entregado' ? 'entregado' : 'pendiente';
      const talla = b ? b.talla : '';
      const tallas = talla && !TALLAS.includes(talla) ? [talla, ...TALLAS] : TALLAS;
      const grupo = store.get('Grupos', n.grupoId);
      return H('tr', {},
        H('td', {}, nombre(n)),
        H('td', {}, grupo ? grupo.nombre : ''),
        H('td', {}, H('select', { onchange: (e) => save(n, b, { talla: e.target.value }) }, H('option', { value: '' }, '—'), tallas.map((sz) => H('option', { value: sz, selected: sz === talla }, sz)))),
        H('td', {}, H('span', { class: `badge ${estado === 'entregado' ? 'bn-ok' : 'bn-pend'}` }, tEstado(estado))),
        H('td', {}, b && b.fecha ? tDate(b.fecha) : ''),
        H('td', {}, H('input', { type: 'text', value: b ? b.notas || '' : '', onchange: (e) => store.upsert('Banador', { ...(b || { nadadorId: n.id, talla: '', estado: 'pendiente', fecha: '' }), notas: e.target.value }) })),
        H('td', {}, estado === 'entregado'
          ? H('button', { class: 'btn', type: 'button', onclick: () => save(n, b, { estado: 'pendiente', fecha: '' }) }, t('banador.marcarPendiente'))
          : H('button', { class: 'btn', type: 'button', onclick: () => {
            if (!talla) { toast(t('banador.indicaTalla')); return; }
            save(n, b, { estado: 'entregado', fecha: iso(new Date()) });
          } }, t('banador.marcarEntregado'))));
    });

    container.replaceChildren(
      H('h2', {}, t('banador.titulo')),
      H('div', { class: 'bn-bar' },
        H('label', {}, H('input', { type: 'checkbox', checked: state.soloPendientes, onchange: (e) => { state.soloPendientes = e.target.checked; draw(); } }), t('banador.soloPendientes')),
        H('input', { type: 'search', placeholder: t('banador.buscar'), value: state.q, oninput: (e) => { state.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(() => { draw(); const i = container.querySelector('input[type=search]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 250); } }),
        H('span', { class: 'bn-count' }, t('banador.contador', { n: pendientes, total: nads.length }))),
      H('div', { class: 'card bn-table' }, rows.length
        ? H('table', { class: 'table' },
          H('thead', {}, H('tr', {}, [t('banador.colNadador'), t('banador.colGrupo'), t('banador.colTalla'), t('banador.colEstado'), t('banador.colFecha'), t('banador.colNotas'), ''].map((x) => H('th', {}, x)))),
          H('tbody', {}, rows))
        : H('p', {}, t('banador.vacio'))));
  }

  draw();
}
