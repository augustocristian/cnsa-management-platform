// Vista Nadadores: listado, alta/edición en modal y ficha individual (#/nadadores/<id>).
import { CATEGORIAS } from '../schema.js';
import { icon } from '../icons.js';
import { t, tDate, tNum, tCat, tEstado } from '../i18n.js';
import { indicePorNombre, normalizarNombre } from '../domain/cargas.js';
import { crearServicio, chip, injectStyle as injectTc } from './cargas-contenidos.js';

const P = 'nad-'; // prefijo de clases propias

// ---------- helpers ----------
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

const isActivo = (n) => !['false', 'no', '0', 'n', ''].includes(String(n.activo ?? 'true').toLowerCase());
const catIdx = (c) => { const i = CATEGORIAS.indexOf(c); return i < 0 ? 99 : i; };
const nombreCompleto = (n) => `${n.nombre || ''} ${n.apellidos || ''}`.trim();
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const num = (v) => Number(String(v ?? '').replace(',', '.')) || 0;

function edad(f) {
  const d = new Date(f);
  if (!f || isNaN(d)) return '';
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a;
}

function fmtTiempo(ms, ui) {
  if (ui && ui.fmtTime) return ui.fmtTime(ms);
  ms = Math.round(num(ms));
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000), c = Math.floor((ms % 1000) / 10);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}
function fmtFecha(f) {
  return f ? tDate(f) : '';
}

function sortNad(a, b) {
  return catIdx(a.categoria) - catIdx(b.categoria)
    || String(a.apellidos || '').localeCompare(String(b.apellidos || ''), 'es')
    || String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
}

function injectStyle() {
  if (document.getElementById('nad-style')) return;
  const s = document.createElement('style');
  s.id = 'nad-style';
  s.textContent = `
.nad-head{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center;justify-content:space-between;margin-bottom:1rem}
.nad-head h1{margin:0;font-size:1.4rem}
.nad-filters{display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1rem}
.nad-filters input,.nad-filters select{padding:.5rem .7rem;border:1px solid #cfd8e6;border-radius:8px;font:inherit;background:#fff}
.nad-filters input{flex:1;min-width:160px}
.nad-tablewrap{overflow-x:auto}
.nad-row{cursor:pointer}
.nad-row:hover{background:rgba(26,115,232,.06)}
.nad-muted{color:#6b7a90;font-size:.9rem}
.nad-inactivo{opacity:.55}
.nad-actions{display:flex;gap:.4rem;flex-wrap:wrap}
.nad-section{margin-top:1rem}
.nad-section h2{margin:0 0 .6rem;font-size:1.1rem}
.nad-data{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:.6rem 1rem}
.nad-data dt{font-size:.78rem;color:#6b7a90;margin:0}
.nad-data dd{margin:0 0 .2rem;font-weight:500;word-break:break-word}
.nad-stats{display:flex;flex-wrap:wrap;gap:.6rem;margin-bottom:.8rem}
.nad-stat{background:#f1f6fe;border-radius:10px;padding:.5rem .9rem;min-width:90px}
.nad-stat b{display:block;font-size:1.3rem;color:#1a4d9c}
.nad-stat span{font-size:.78rem;color:#6b7a90}
.nad-back{background:none;border:0;color:#1a73e8;cursor:pointer;font:inherit;padding:0;margin-bottom:.6rem}
.nad-ov{position:fixed;inset:0;background:rgba(10,20,40,.5);display:flex;align-items:center;justify-content:center;z-index:1000;padding:1rem}
.nad-modal{background:#fff;border-radius:14px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:1.2rem;box-shadow:0 10px 40px rgba(0,0,0,.3)}
.nad-modal h2{margin:0 0 .8rem}
.nad-form{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}
.nad-form label{display:flex;flex-direction:column;font-size:.8rem;color:#445;gap:.2rem}
.nad-form .nad-full{grid-column:1/-1}
.nad-form input,.nad-form select,.nad-form textarea{padding:.5rem;border:1px solid #cfd8e6;border-radius:8px;font:inherit}
.nad-mfoot{display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem}
.nad-chart{width:100%;height:auto;max-width:560px}
.nad-chartbox{margin-bottom:1rem}
.nad-chartbox h3{margin:.2rem 0;font-size:.95rem}
@media(max-width:520px){.nad-form{grid-template-columns:1fr}}
`;
  document.head.appendChild(s);
}

// ---------- modal propio ----------
function openModal(title, bodyEl, buttons) {
  const ov = h('div', { class: P + 'ov' });
  const close = () => ov.remove();
  const foot = h('div', { class: P + 'mfoot' }, buttons.map((b) =>
    h('button', {
      type: 'button', class: 'btn ' + (b.cls || ''),
      onclick: () => { if (b.onClick) { if (b.onClick() === false) return; } close(); },
    }, b.label)));
  ov.appendChild(h('div', { class: P + 'modal' }, h('h2', {}, title), bodyEl, foot));
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  return close;
}

// ---------- render ----------
export async function render(container, params, ctx) {
  injectStyle();
  const { store, auth, ui } = ctx;
  const role = auth.role();
  const canEdit = role === 'admin' || role === 'entrenador';

  if (!canEdit) {
    container.replaceChildren(h('div', { class: 'card' }, t('nadadores.sin-permisos')));
    return;
  }

  // id desde params (string, array u objeto) o desde el hash
  let id = null;
  if (typeof params === 'string') id = params;
  else if (Array.isArray(params)) id = params[0];
  else if (params) id = params.id ?? params[0] ?? null;
  if (!id) {
    const m = location.hash.match(/#\/nadadores\/([^/?]+)/);
    if (m) id = decodeURIComponent(m[1]);
  }

  const refresh = () => render(container, params, ctx);
  if (id) renderFicha(container, id, ctx, canEdit, refresh);
  else renderLista(container, ctx, canEdit, refresh);
}

// ---------- listado ----------
function renderLista(container, ctx, canEdit, refresh) {
  const { store, ui } = ctx;
  const grupos = store.list('Grupos');
  const grupoNombre = (gid) => (grupos.find((g) => g.id === gid) || {}).nombre || '';
  const state = { q: '', cat: '', grupo: '', inactivos: false };

  const tbody = h('tbody');
  const count = h('span', { class: P + 'muted' });

  const paint = () => {
    const q = norm(state.q);
    const rows = store.list('Nadadores')
      .filter((n) => (state.inactivos || isActivo(n))
        && (!state.cat || n.categoria === state.cat)
        && (!state.grupo || n.grupoId === state.grupo)
        && (!q || norm(nombreCompleto(n) + ' ' + (n.licencia || '')).includes(q)))
      .sort(sortNad);
    count.textContent = t(rows.length === 1 ? 'nadadores.contador.uno' : 'nadadores.contador.otros', { n: rows.length });
    tbody.replaceChildren(...(rows.length ? rows.map((n) =>
      h('tr', { class: `${P}row ${isActivo(n) ? '' : P + 'inactivo'}`, onclick: () => { location.hash = `#/nadadores/${n.id}`; } },
        h('td', {}, `${n.apellidos || ''}, ${n.nombre || ''}`),
        h('td', {}, h('span', { class: 'badge' }, tCat(n.categoria) || '-')),
        h('td', {}, grupoNombre(n.grupoId) || '-'),
        h('td', {}, edad(n.fechaNacimiento)),
        h('td', {}, n.licencia || ''))) : [h('tr', {}, h('td', { colspan: 5, class: P + 'muted' }, t('nadadores.sin-resultados')))]));
  };

  const inpQ = h('input', { type: 'search', placeholder: t('nadadores.buscar'), oninput: (e) => { state.q = e.target.value; paint(); } });
  const selCat = h('select', { onchange: (e) => { state.cat = e.target.value; paint(); } },
    h('option', { value: '' }, t('nadadores.todas-cat')), CATEGORIAS.map((c) => h('option', { value: c }, tCat(c))));
  const selGrp = h('select', { onchange: (e) => { state.grupo = e.target.value; paint(); } },
    h('option', { value: '' }, t('nadadores.todos-grupos')), grupos.map((g) => h('option', { value: g.id }, g.nombre)));
  const chk = h('label', { class: P + 'muted' }, h('input', { type: 'checkbox', onchange: (e) => { state.inactivos = e.target.checked; paint(); } }), t('nadadores.ver-inactivos'));

  container.replaceChildren(
    h('div', { class: P + 'head' },
      h('h1', {}, t('nadadores.titulo')),
      canEdit ? h('button', { class: 'btn', onclick: () => editNadador(null, ctx, refresh) }, icon('mas', { size: 16 }), ' ' + t('nadadores.nuevo')) : null),
    h('div', { class: 'card' },
      h('div', { class: P + 'filters' }, inpQ, selCat, selGrp, chk),
      count,
      h('div', { class: P + 'tablewrap' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, [t('nadadores.col-nombre'), t('nadadores.col-categoria'), t('nadadores.col-grupo'), t('nadadores.col-edad'), t('nadadores.col-licencia')].map((x) => h('th', {}, x)))),
          tbody))));
  paint();
}

// ---------- alta / edición ----------
function editNadador(n, ctx, done) {
  const { store, ui } = ctx;
  const isNew = !n;
  n = n || { activo: 'true', sexo: 'F' };
  const grupos = store.list('Grupos');
  const f = {};
  const field = (key, label, el, full) => { f[key] = el; return h('label', { class: full ? P + 'full' : '' }, label, el); };
  const inp = (key, type = 'text') => h('input', { type, value: n[key] ?? '' });
  const sel = (opts, cur) => h('select', {}, opts.map(([v, t]) => h('option', { value: v, selected: v === cur }, t)));

  const body = h('div', { class: P + 'form' },
    field('nombre', t('nadadores.f-nombre'), inp('nombre')),
    field('apellidos', t('nadadores.f-apellidos'), inp('apellidos')),
    field('fechaNacimiento', t('nadadores.f-nacimiento'), inp('fechaNacimiento', 'date')),
    field('sexo', t('nadadores.f-sexo'), sel([['F', t('nadadores.femenino')], ['M', t('nadadores.masculino')]], n.sexo)),
    field('categoria', t('nadadores.f-categoria'), sel([['', '—'], ...CATEGORIAS.map((c) => [c, tCat(c)])], n.categoria || '')),
    field('grupoId', t('nadadores.f-grupo'), sel([['', t('nadadores.sin-grupo')], ...grupos.map((g) => [g.id, g.nombre])], n.grupoId || '')),
    field('email', t('nadadores.f-email'), inp('email', 'email')),
    field('telefono', t('nadadores.f-telefono'), inp('telefono', 'tel')),
    field('tutor', t('nadadores.f-tutor'), inp('tutor'), true),
    field('licencia', t('nadadores.f-licencia'), inp('licencia')),
    field('activo', t('nadadores.f-estado'), sel([['true', t('nadadores.activo')], ['false', t('nadadores.inactivo')]], isActivo(n) ? 'true' : 'false')),
    field('notas', t('nadadores.f-notas'), h('textarea', { rows: 3 }, n.notas || ''), true));

  openModal(isNew ? t('nadadores.nuevo') : t('nadadores.editar'), body, [
    { label: t('common.cancelar') },
    {
      label: t('common.guardar'), cls: 'btn-primary', onClick: () => {
        const row = { ...n };
        for (const k of Object.keys(f)) row[k] = f[k].value.trim();
        if (!row.nombre || !row.apellidos) { ui.toast(t('nadadores.obligatorios')); return false; }
        store.upsert('Nadadores', row);
        ui.toast(t('nadadores.guardado'));
        done();
      },
    },
  ]);
}

async function borrarNadador(n, ctx) {
  const { store, ui } = ctx;
  const ok = await ui.confirmDialog(t('nadadores.confirmar-eliminar', { nombre: nombreCompleto(n) }));
  if (!ok) return false;
  for (const sheet of ['Asistencia', 'Cargas', 'Marcas', 'Banador']) {
    store.list(sheet).filter((r) => r.nadadorId === n.id).forEach((r) => store.remove(sheet, r.id));
  }
  store.remove('Nadadores', n.id);
  ui.toast(t('nadadores.eliminado'));
  return true;
}

// ---------- ficha ----------
function renderFicha(container, id, ctx, canEdit, refresh) {
  const { store, ui } = ctx;
  const n = store.get('Nadadores', id);
  const back = h('button', { class: P + 'back', onclick: () => { location.hash = '#/nadadores'; } }, icon('flecha-izq', { size: 16 }), t('nadadores.volver'));
  if (!n) {
    container.replaceChildren(back, h('div', { class: 'card' }, t('nadadores.no-encontrado')));
    return;
  }
  const grupo = n.grupoId ? store.get('Grupos', n.grupoId) : null;
  const dato = (etq, v) => [h('dt', {}, etq), h('dd', {}, v || '-')];

  const datos = h('div', { class: 'card' },
    h('div', { class: P + 'head' },
      h('h1', {}, nombreCompleto(n), ' ', isActivo(n) ? null : h('span', { class: 'badge' }, t('nadadores.inactivo'))),
      canEdit ? h('div', { class: P + 'actions' },
        h('button', { class: 'btn', onclick: () => editNadador(n, ctx, refresh) }, t('common.editar')),
        h('button', { class: 'btn', onclick: async () => { if (await borrarNadador(n, ctx)) location.hash = '#/nadadores'; } }, t('common.eliminar'))) : null),
    h('dl', { class: P + 'data' },
      dato(t('nadadores.f-categoria'), tCat(n.categoria)), dato(t('nadadores.f-grupo'), grupo && grupo.nombre),
      dato(t('nadadores.f-nacimiento'), fmtFecha(n.fechaNacimiento) + (n.fechaNacimiento ? ` (${t('nadadores.anios', { n: edad(n.fechaNacimiento) })})` : '')),
      dato(t('nadadores.f-sexo'), n.sexo === 'M' ? t('nadadores.masculino') : n.sexo === 'F' ? t('nadadores.femenino') : n.sexo),
      dato(t('nadadores.f-email'), n.email), dato(t('nadadores.f-telefono'), n.telefono), dato(t('nadadores.d-tutor'), n.tutor),
      dato(t('nadadores.f-licencia'), n.licencia), dato(t('nadadores.d-notas'), n.notas)));

  container.replaceChildren(back, datos,
    seccionAsistencia(n, store, ui), seccionCargas(n, store, ui, ctx), seccionMarcas(n, store, ui));
}

function seccion(titulo, ...contenido) {
  return h('div', { class: `card ${P}section` }, h('h2', {}, titulo), contenido);
}
const stat = (v, etq) => h('div', { class: P + 'stat' }, h('b', {}, v), h('span', {}, etq));
const vacio = (txt) => h('p', { class: P + 'muted' }, txt);

function seccionAsistencia(n, store, ui) {
  const regs = store.list('Asistencia').filter((a) => a.nadadorId === n.id);
  const entr = (eid) => store.get('Entrenamientos', eid) || {};
  const items = regs.map((a) => ({ ...a, e: entr(a.entrenamientoId) }))
    .sort((x, y) => String(y.e.fecha || '').localeCompare(String(x.e.fecha || '')));
  const c = (s) => regs.filter((a) => a.estado === s).length;
  const pct = regs.length ? Math.round(((c('presente') + c('justificado')) / regs.length) * 100) : 0;
  if (!regs.length) return seccion(t('nadadores.asistencia'), vacio(t('nadadores.sin-asistencia')));
  return seccion(t('nadadores.asistencia'),
    h('div', { class: P + 'stats' }, stat(c('presente'), t('nadadores.st-presente')), stat(c('ausente'), t('nadadores.st-ausente')), stat(c('justificado'), t('nadadores.st-justificado')), stat(pct + '%', t('nadadores.st-asistencia'))),
    h('div', { class: P + 'tablewrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, [t('nadadores.col-fecha'), t('nadadores.col-sesion'), t('nadadores.col-estado'), t('nadadores.col-nota')].map((x) => h('th', {}, x)))),
      h('tbody', {}, items.slice(0, 15).map((a) => h('tr', {},
        h('td', {}, fmtFecha(a.e.fecha)), h('td', {}, a.e.titulo || ''),
        h('td', {}, h('span', { class: 'badge' }, tEstado(a.estado) || '')), h('td', {}, a.nota || '')))))));
}

function seccionCargas(n, store, ui, ctx) {
  injectTc();
  const indice = indicePorNombre(crearServicio(ctx).tipos());
  const regs = store.list('Cargas').filter((r) => r.nadadorId === n.id)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  if (!regs.length) return seccion(t('nadadores.cargas'), vacio(t('nadadores.sin-cargas')));
  const metros = regs.reduce((s, r) => s + num(r.metros), 0);
  const rpes = regs.filter((r) => num(r.rpe) > 0);
  const rpeMed = rpes.length ? (rpes.reduce((s, r) => s + num(r.rpe), 0) / rpes.length).toFixed(1) : '-';
  return seccion(t('nadadores.cargas'),
    h('div', { class: P + 'stats' }, stat(regs.length, t('nadadores.st-sesiones')), stat(tNum(metros) + ' m', t('nadadores.st-metros')), stat(rpeMed === '-' ? rpeMed : tNum(rpeMed, { minimumFractionDigits: 1 }), t('nadadores.st-rpe'))),
    h('div', { class: P + 'tablewrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, [t('nadadores.col-fecha'), t('nadadores.col-tipo'), t('nadadores.col-metros'), t('nadadores.col-rpe'), t('nadadores.col-min'), t('nadadores.col-notas')].map((x) => h('th', {}, x)))),
      h('tbody', {}, regs.slice(0, 15).map((r) => h('tr', {},
        h('td', {}, fmtFecha(r.fecha)), h('td', {}, r.tipo ? chip(h, indice.get(normalizarNombre(r.tipo)), r.tipo) : ''), h('td', {}, r.metros || ''),
        h('td', {}, r.rpe || ''), h('td', {}, r.minutos || ''), h('td', {}, r.notas || '')))))));
}

function seccionMarcas(n, store, ui) {
  const regs = store.list('Marcas').filter((m) => m.nadadorId === n.id && num(m.tiempoMs) > 0);
  if (!regs.length) return seccion(t('nadadores.evolucion'), vacio(t('nadadores.sin-marcas')));
  const grupos = {};
  regs.forEach((m) => { (grupos[`${m.prueba} (${m.piscina || '?'} m)`] ||= []).push(m); });
  const bloques = Object.keys(grupos).sort().map((k) => {
    const lista = grupos[k].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const mejor = Math.min(...lista.map((m) => num(m.tiempoMs)));
    return h('div', { class: P + 'chartbox' },
      h('h3', {}, k, ' ', h('span', { class: 'badge' }, t('nadadores.pb', { t: fmtTiempo(mejor, ui) }))),
      lista.length > 1 ? grafico(lista) : null,
      h('div', { class: P + 'tablewrap' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, [t('nadadores.col-fecha'), t('nadadores.col-tiempo'), t('nadadores.col-competicion')].map((x) => h('th', {}, x)))),
        h('tbody', {}, [...lista].reverse().map((m) => h('tr', {},
          h('td', {}, fmtFecha(m.fecha)),
          h('td', {}, fmtTiempo(m.tiempoMs, ui), num(m.tiempoMs) === mejor ? [' ', icon('trofeo', { size: 14, class: 'icon-inline' })] : ''),
          h('td', {}, m.competicion || '')))))));
  });
  return seccion(t('nadadores.evolucion'), bloques);

  function grafico(lista) {
    const W = 560, H = 160, pad = 28;
    const ys = lista.map((m) => num(m.tiempoMs));
    const min = Math.min(...ys), max = Math.max(...ys), rng = max - min || 1;
    const pts = lista.map((m, i) => [
      pad + (i * (W - pad * 2)) / (lista.length - 1),
      pad + ((num(m.tiempoMs) - min) / rng) * (H - pad * 2), // menor tiempo = más arriba
    ]);
    const NS = 'http://www.w3.org/2000/svg';
    const el = (t, a, txt) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); if (txt) e.textContent = txt; return e; };
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: P + 'chart', role: 'img' });
    svg.appendChild(el('polyline', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#1a73e8', 'stroke-width': 2 }));
    pts.forEach((p, i) => {
      svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 4, fill: '#1a73e8' }));
      const tt = el('title', {}, `${fmtFecha(lista[i].fecha)} · ${fmtTiempo(ys[i], ui)}`);
      svg.lastChild.appendChild(tt);
    });
    svg.appendChild(el('text', { x: 4, y: 12, 'font-size': 10, fill: '#6b7a90' }, fmtTiempo(min, ui)));
    svg.appendChild(el('text', { x: 4, y: H - 4, 'font-size': 10, fill: '#6b7a90' }, fmtTiempo(max, ui)));
    return svg;
  }
}
