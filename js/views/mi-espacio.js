// Vista Mi espacio: datos del nadador (entrenamientos, asistencia, marcas, comunicaciones).
import { t, tDate, tNum, tCat, tEstado } from '../i18n.js';

function injectStyle() {
  if (document.getElementById('mie-style')) return;
  const s = document.createElement('style');
  s.id = 'mie-style';
  s.textContent = `
  .mie-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
  .mie-card h3{margin:0 0 10px;color:#174ea6}
  .mie-card table{width:100%;border-collapse:collapse}
  .mie-card td,.mie-card th{padding:6px;border-bottom:1px solid #eee;text-align:left;font-size:.9rem}
  .mie-empty{color:#888;font-size:.9rem}
  .mie-stat{font-size:2rem;font-weight:700;color:#1a73e8}
  .mie-pick{margin-bottom:12px}
  `;
  document.head.append(s);
}

const day = (v) => String(v || '').slice(0, 10);

export async function render(container, params, ctx) {
  const { store, auth, ui } = ctx;
  const h = ui.h;
  injectStyle();
  container.replaceChildren();

  const nadadores = store.list('Nadadores');
  const email = ((auth.user && auth.user.email) || '').toLowerCase();
  const usuario = store.list('Usuarios').find((u) => (u.email || '').toLowerCase() === email);
  let nadId = (params && params.id) || (usuario && usuario.nadadorId) || '';
  if (!nadId) {
    const n = nadadores.find((x) => email && (x.email || '').toLowerCase() === email);
    if (n) nadId = n.id;
  }

  // Si no hay vínculo (p. ej. vista demo), permitir elegir nadador
  if (!nadId || !nadadores.find((n) => n.id === nadId)) {
    const sel = h('select', {}, h('option', { value: '' }, t('mie.elige')),
      ...nadadores.map((n) => h('option', { value: n.id }, `${n.nombre} ${n.apellidos || ''}`)));
    sel.addEventListener('change', () => { if (sel.value) render(container, { id: sel.value }, ctx); });
    container.append(h('div', { class: 'card mie-pick' },
      h('p', {}, t('mie.sin-vinculo')), sel));
    return;
  }

  const nad = store.get('Nadadores', nadId);
  const grupo = nad.grupoId ? store.get('Grupos', nad.grupoId) : null;
  const hoy = new Date().toISOString().slice(0, 10);
  const entrenos = store.list('Entrenamientos');

  container.append(h('h2', {}, t('mie.hola', { nombre: nad.nombre })),
    h('p', { class: 'mie-empty' }, `${tCat(nad.categoria) || ''}${grupo ? t('mie.grupo', { nombre: grupo.nombre }) : ''}`));

  // Próximos entrenamientos de su grupo
  const prox = entrenos.filter((e) => day(e.fecha) >= hoy && e.estado !== 'realizado' && (!e.grupoId || e.grupoId === nad.grupoId))
    .sort((a, b) => (day(a.fecha) + a.hora).localeCompare(day(b.fecha) + b.hora)).slice(0, 6);
  const cEntr = h('div', { class: 'card mie-card' }, h('h3', {}, t('mie.proximos')));
  if (prox.length) {
    const tb = h('table', { class: 'table' }, h('tr', {}, ...[t('mie.col-fecha'), t('mie.col-hora'), t('mie.col-sesion')].map((x) => h('th', {}, x))));
    for (const e of prox) tb.append(h('tr', {}, h('td', {}, tDate(day(e.fecha))), h('td', {}, e.hora || ''), h('td', {}, e.titulo || e.enfoque || '')));
    cEntr.append(tb);
  } else cEntr.append(h('p', { class: 'mie-empty' }, t('mie.sin-proximos')));

  // Asistencia
  const asis = store.list('Asistencia').filter((a) => a.nadadorId === nadId);
  const pres = asis.filter((a) => a.estado === 'presente').length;
  const pct = asis.length ? Math.round((pres / asis.length) * 100) : 0;
  const cAsis = h('div', { class: 'card mie-card' }, h('h3', {}, t('mie.asistencia')));
  if (asis.length) {
    cAsis.append(h('div', { class: 'mie-stat' }, `${pct}%`),
      h('p', {}, t('mie.resumen-asis', { p: pres, a: asis.filter((a) => a.estado === 'ausente').length, j: asis.filter((a) => a.estado === 'justificado').length })));
    const tb = h('table', { class: 'table' });
    const ult = asis.map((a) => ({ a, e: entrenos.find((x) => x.id === a.entrenamientoId) }))
      .sort((x, y) => day(y.e && y.e.fecha).localeCompare(day(x.e && x.e.fecha))).slice(0, 5);
    for (const { a, e } of ult) tb.append(h('tr', {}, h('td', {}, e ? tDate(day(e.fecha)) : '—'), h('td', {}, e ? (e.titulo || '') : ''), h('td', {}, h('span', { class: 'badge' }, tEstado(a.estado)))));
    cAsis.append(tb);
  } else cAsis.append(h('p', { class: 'mie-empty' }, t('mie.sin-asistencia')));

  // Marcas (mejor por prueba y piscina)
  const marcas = store.list('Marcas').filter((m) => m.nadadorId === nadId);
  const cMar = h('div', { class: 'card mie-card' }, h('h3', {}, t('mie.marcas')));
  if (marcas.length) {
    const mejores = new Map();
    for (const m of marcas) {
      const k = `${m.prueba}|${m.piscina}`;
      const cur = mejores.get(k);
      if (!cur || Number(m.tiempoMs) < Number(cur.tiempoMs)) mejores.set(k, m);
    }
    const tb = h('table', { class: 'table' }, h('tr', {}, ...[t('mie.col-prueba'), t('mie.col-piscina'), t('mie.col-mejor'), t('mie.col-fecha')].map((x) => h('th', {}, x))));
    for (const m of [...mejores.values()].sort((a, b) => String(a.prueba).localeCompare(String(b.prueba))))
      tb.append(h('tr', {}, h('td', {}, m.prueba || ''), h('td', {}, `${m.piscina} m`), h('td', {}, ui.fmtTime(Number(m.tiempoMs))), h('td', {}, tDate(day(m.fecha)))));
    cMar.append(tb);
  } else cMar.append(h('p', { class: 'mie-empty' }, t('mie.sin-marcas')));

  // Cargas de las últimas 4 semanas
  const desde = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
  const cargas = store.list('Cargas').filter((c) => c.nadadorId === nadId && day(c.fecha) >= desde);
  const metros = cargas.reduce((a, c) => a + (Number(c.metros) || 0), 0);
  const cCar = h('div', { class: 'card mie-card' }, h('h3', {}, t('mie.cargas')),
    cargas.length ? h('div', {}, h('div', { class: 'mie-stat' }, `${tNum(metros)} m`), h('p', {}, t('mie.sesiones-reg', { n: cargas.length })))
      : h('p', { class: 'mie-empty' }, t('mie.sin-cargas')));

  // Comunicaciones de su grupo o generales
  const coms = store.list('Comunicaciones').filter((c) => !c.grupoId || c.grupoId === nad.grupoId)
    .sort((a, b) => day(b.fecha).localeCompare(day(a.fecha))).slice(0, 5);
  const cCom = h('div', { class: 'card mie-card' }, h('h3', {}, t('mie.comunicaciones')));
  if (coms.length) for (const c of coms) cCom.append(h('div', { style: 'padding:6px 0;border-bottom:1px solid #eee' },
    h('strong', {}, c.titulo || ''), h('div', { class: 'mie-empty' }, tDate(day(c.fecha))), h('div', {}, c.texto || '')));
  else cCom.append(h('p', { class: 'mie-empty' }, t('mie.sin-comunicaciones')));

  container.append(h('div', { class: 'grid mie-grid' }, cEntr, cAsis, cMar, cCar, cCom));
}
