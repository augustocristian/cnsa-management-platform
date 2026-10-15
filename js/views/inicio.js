// Vista Inicio: dashboard del club.
import { icon } from '../icons.js';
const NS = 'http://www.w3.org/2000/svg';
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TIPOS = ['Aeróbico', 'Velocidad', 'Piernas', 'Técnica', 'Fuerza'];

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k != null) el.append(k);
  return el;
}
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const num = (v) => Number(v) || 0;
const fmtM = (n) => Math.round(n).toLocaleString('es-ES');

function injectStyle() {
  if (document.getElementById('ini-style')) return;
  const s = document.createElement('style');
  s.id = 'ini-style';
  s.textContent = `
  .ini-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,#1a73e8,#4a9af5);color:#fff;border-radius:16px;padding:20px 24px;margin-bottom:16px;overflow:hidden}
  .ini-banner h1{margin:0 0 4px;font-size:1.6rem}
  .ini-banner p{margin:0;opacity:.9}
  .ini-banner svg{width:150px;height:70px;flex:none}
  .ini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
  .ini-wide{grid-column:1/-1}
  @media(min-width:900px){.ini-wide{grid-column:span 2}}
  .ini-card h3{margin:0 0 12px;font-size:1.05rem;color:#174ea6}
  .ini-quick{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
  .ini-quick a{display:flex;flex-direction:column;align-items:center;gap:6px;padding:14px 8px;border-radius:12px;background:#e8f0fe;color:#174ea6;text-decoration:none;font-weight:600;font-size:.9rem;text-align:center}
  .ini-quick a:hover{background:#d2e3fc}
  .ini-ico{display:grid;place-items:center;width:44px;height:44px;border-radius:12px;background:color-mix(in srgb,var(--c-primary,#1a73e8) 14%,#fff);color:var(--c-primary,#1a73e8)}
  .ini-chart svg{width:100%;height:auto}
  .ini-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:.8rem;margin-top:6px;color:#555}
  .ini-legend i{display:inline-block;width:14px;height:3px;margin-right:4px;vertical-align:middle}
  .ini-alert{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee;font-size:.9rem}
  .ini-alert:last-child{border:0}
  .ini-up{color:#d93025}.ini-down{color:#e37400}.ini-ok{color:#188038}
  .ini-sess dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}
  .ini-sess dt{color:#666}.ini-sess dd{margin:0;font-weight:600}
  .ini-donut{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .ini-donut svg{width:140px;height:140px;flex:none}
  .ini-donut ul{list-style:none;margin:0;padding:0;font-size:.9rem}
  .ini-donut li i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
  .ini-com{padding:8px 0;border-bottom:1px solid #eee}
  .ini-com:last-child{border:0}
  .ini-com small{color:#777}
  .ini-empty{color:#888;font-size:.9rem}
  `;
  document.head.append(s);
}

function swimmerSvg() {
  const g = svg('g', { fill: 'none', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round' });
  g.append(
    svg('path', { d: 'M5 58 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0', opacity: '.7' }),
    svg('path', { d: 'M5 68 q10 -8 20 0 t20 0 t20 0 t20 0 t20 0 t20 0', opacity: '.4' }),
    svg('circle', { cx: 60, cy: 34, r: 8, fill: '#fff' }),
    svg('path', { d: 'M68 36 L95 26 M60 42 L40 52' })
  );
  return svg('svg', { viewBox: '0 0 130 75', 'aria-hidden': 'true' }, g);
}

function weeklyChart(porDia, minD, maxD) {
  const W = 560, H = 240, L = 50, R = 12, T = 14, B = 28;
  const top = Math.max(1000, ...porDia, maxD) * 1.15;
  const x = (i) => L + (i * (W - L - R)) / 6;
  const y = (v) => T + (H - T - B) * (1 - v / top);
  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Control de cargas semanal' });
  for (let k = 0; k <= 4; k++) {
    const v = (top * k) / 4;
    root.append(
      svg('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: '#e5e7eb' }),
      Object.assign(svg('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#666' }), { textContent: fmtM(v) })
    );
  }
  DIAS.forEach((d, i) => root.append(Object.assign(svg('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 11, fill: '#666' }), { textContent: d })));
  if (maxD > 0) {
    root.append(
      svg('rect', { x: L, y: y(maxD), width: W - L - R, height: Math.max(0, y(minD) - y(maxD)), fill: '#34a853', opacity: '.12' }),
      svg('line', { x1: L, x2: W - R, y1: y(minD), y2: y(minD), stroke: '#e37400', 'stroke-dasharray': '5 4' }),
      svg('line', { x1: L, x2: W - R, y1: y(maxD), y2: y(maxD), stroke: '#d93025', 'stroke-dasharray': '5 4' })
    );
  }
  const pts = porDia.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  root.append(svg('polyline', { points: pts, fill: 'none', stroke: '#1a73e8', 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  porDia.forEach((v, i) => root.append(svg('circle', { cx: x(i), cy: y(v), r: 4, fill: '#1a73e8' }, Object.assign(svg('title'), { textContent: `${DIAS[i]}: ${fmtM(v)} m` }))));
  return root;
}

function donut(parts) {
  const total = parts.reduce((a, p) => a + p.v, 0);
  const R = 50, C = 2 * Math.PI * R;
  const root = svg('svg', { viewBox: '0 0 140 140', role: 'img', 'aria-label': 'Asistencia hoy' });
  root.append(svg('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: '#eee', 'stroke-width': 20 }));
  let off = 0;
  if (total > 0) {
    for (const p of parts) {
      const len = (p.v / total) * C;
      if (len > 0) root.append(svg('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: p.color, 'stroke-width': 20, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' }));
      off += len;
    }
  }
  root.append(Object.assign(svg('text', { x: 70, y: 76, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: '#174ea6' }), { textContent: total }));
  return root;
}

export async function render(container, params, ctx) {
  const { store, auth, ui } = ctx;
  const h = ui.h;
  injectStyle();
  container.replaceChildren();

  const now = new Date();
  const hoy = iso(now);
  const rol = auth.role ? auth.role() : 'admin';
  const rolTxt = rol.charAt(0).toUpperCase() + rol.slice(1);
  const fechaLarga = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // Semana actual (lunes a domingo)
  const lun = new Date(now); lun.setHours(0, 0, 0, 0);
  lun.setDate(lun.getDate() - ((lun.getDay() + 6) % 7));
  const semana = Array.from({ length: 7 }, (_, i) => { const d = new Date(lun); d.setDate(lun.getDate() + i); return iso(d); });

  const cargas = store.list('Cargas').filter((c) => semana.includes(String(c.fecha).slice(0, 10)));
  const porDia = semana.map((f) => cargas.filter((c) => String(c.fecha).slice(0, 10) === f).reduce((a, c) => a + num(c.metros), 0));
  const objetivos = store.list('ObjetivosCarga');
  // Los objetivos son metros semanales por nadador: se escalan por los nadadores con carga esta semana
  const nNad = Math.max(1, new Set(cargas.map((c) => c.nadadorId)).size);
  const minTot = objetivos.reduce((a, o) => a + num(o.minSemanalM), 0) * nNad;
  const maxTot = objetivos.reduce((a, o) => a + num(o.maxSemanalM), 0) * nNad;

  // Banner
  const banner = h('div', { class: 'ini-banner' },
    h('div', {}, h('h1', {}, `¡Bienvenido, ${rolTxt}!`), h('p', {}, fechaLarga)));
  banner.append(swimmerSvg());

  // Acceso rápido
  const atajos = [['nadadores', 'Nadadores', '#/nadadores'], ['asistencia', 'Asistencia', '#/asistencia'], ['cargas', 'Cargas', '#/cargas'], ['marcas', 'Marcas', '#/marcas']];
  const quick = h('div', { class: 'card ini-card' }, h('h3', {}, 'Acceso rápido'),
    h('div', { class: 'ini-quick' }, ...atajos.map(([ic, t, href]) => h('a', { href }, h('span', { class: 'ini-ico' }, icon(ic, { size: 24 })), t))));

  // Gráfico
  const chart = h('div', { class: 'card ini-card ini-chart ini-wide' }, h('h3', {}, 'Control de cargas semanal del club'));
  chart.append(weeklyChart(porDia, minTot / 7, maxTot / 7));
  chart.append(h('div', { class: 'ini-legend' },
    h('span', {}, h('i', { style: 'background:#1a73e8' }), 'Realizado (m)'),
    h('span', {}, h('i', { style: 'background:#e37400' }), 'Objetivo mínimo (diario)'),
    h('span', {}, h('i', { style: 'background:#d93025' }), 'Objetivo máximo (diario)')));

  // Alertas de cargas
  const alertas = h('div', { class: 'card ini-card' }, h('h3', {}, 'Alertas de cargas'));
  let nAlert = 0;
  for (const o of objetivos) {
    const real = cargas.filter((c) => c.tipo === o.tipo).reduce((a, c) => a + num(c.metros), 0);
    const mn = num(o.minSemanalM) * nNad, mx = num(o.maxSemanalM) * nNad;
    let cls = '', txt = '';
    if (mx && real > mx) { cls = 'ini-up'; txt = `Por encima (+${fmtM(real - mx)} m)`; }
    else if (mn && real < mn) { cls = 'ini-down'; txt = `Por debajo (−${fmtM(mn - real)} m)`; }
    if (txt) { nAlert++; alertas.append(h('div', { class: 'ini-alert' }, h('span', {}, `${o.tipo}: ${fmtM(real)} m`), h('span', { class: `badge ${cls}` }, txt))); }
  }
  if (!objetivos.length) alertas.append(h('p', { class: 'ini-empty' }, 'Define objetivos de carga para ver alertas.'));
  else if (!nAlert) alertas.append(h('p', { class: 'ini-ok' }, 'Todas las cargas están dentro del objetivo.'));

  // Próxima sesión
  const grupos = store.list('Grupos');
  const grupoNombre = (id) => (grupos.find((g) => g.id === id) || {}).nombre || 'Todos';
  const entrenos = store.list('Entrenamientos');
  const prox = entrenos
    .filter((e) => String(e.fecha).slice(0, 10) >= hoy && e.estado !== 'realizado')
    .sort((a, b) => (String(a.fecha) + String(a.hora)).localeCompare(String(b.fecha) + String(b.hora)))[0];
  const sesion = h('div', { class: 'card ini-card ini-sess' }, h('h3', {}, 'Próxima sesión'));
  if (prox) {
    const d = new Date(String(prox.fecha).slice(0, 10) + 'T00:00');
    const vol = prox.volumenMin || prox.volumenMax ? `${fmtM(num(prox.volumenMin))} – ${fmtM(num(prox.volumenMax))} m` : '—';
    sesion.append(h('dl', {},
      h('dt', {}, 'Día'), h('dd', {}, d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('dt', {}, 'Hora'), h('dd', {}, prox.hora || '—'),
      h('dt', {}, 'Grupo'), h('dd', {}, grupoNombre(prox.grupoId)),
      h('dt', {}, 'Piscina'), h('dd', {}, prox.piscina ? `${prox.piscina} m` : '—'),
      h('dt', {}, 'Volumen objetivo'), h('dd', {}, vol),
      h('dt', {}, 'Enfoque'), h('dd', {}, prox.enfoque || prox.titulo || '—')));
  } else sesion.append(h('p', { class: 'ini-empty' }, 'No hay sesiones planificadas.'));

  // Asistencia hoy
  const sesHoy = entrenos.filter((e) => String(e.fecha).slice(0, 10) === hoy);
  const idsHoy = new Set(sesHoy.map((e) => e.id));
  const asis = store.list('Asistencia').filter((a) => idsHoy.has(a.entrenamientoId));
  const presentes = asis.filter((a) => a.estado === 'presente').length;
  const faltan = asis.filter((a) => a.estado === 'ausente' || a.estado === 'justificado').length;
  const gruposHoy = new Set(sesHoy.map((e) => e.grupoId));
  const esperados = sesHoy.length
    ? sesHoy.reduce((a, e) => a + store.list('Nadadores').filter((n) => String(n.activo) !== 'false' && (!e.grupoId || n.grupoId === e.grupoId)).length, 0)
    : 0;
  const sinConf = Math.max(0, esperados - presentes - faltan);
  const parts = [{ n: 'Asistieron', v: presentes, color: '#34a853' }, { n: 'Faltaron', v: faltan, color: '#d93025' }, { n: 'Sin confirmar', v: sinConf, color: '#bdc1c6' }];
  const asisCard = h('div', { class: 'card ini-card' }, h('h3', {}, 'Asistencia hoy'));
  if (sesHoy.length) {
    const wrap = h('div', { class: 'ini-donut' });
    wrap.append(donut(parts), h('ul', {}, ...parts.map((p) => h('li', {}, h('i', { style: `background:${p.color}` }), `${p.n}: ${p.v}`))));
    asisCard.append(wrap);
  } else asisCard.append(h('p', { class: 'ini-empty' }, 'Hoy no hay sesiones.'));

  // Comunicaciones recientes
  const coms = store.list('Comunicaciones').sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 4);
  const comCard = h('div', { class: 'card ini-card' }, h('h3', {}, 'Comunicaciones recientes'));
  if (coms.length) for (const c of coms) {
    comCard.append(h('div', { class: 'ini-com' }, h('strong', {}, c.titulo || '(sin título)'), h('br'),
      h('small', {}, `${String(c.fecha).slice(0, 10)} · ${c.grupoId ? grupoNombre(c.grupoId) : 'Todos'}`)));
  } else comCard.append(h('p', { class: 'ini-empty' }, 'Sin comunicaciones.'));
  comCard.append(h('a', { href: '#/comunicaciones', class: 'btn' }, 'Ver todas'));

  container.append(banner, h('div', { class: 'grid ini-grid' }, quick, alertas, chart, sesion, asisCard, comCard));
}
