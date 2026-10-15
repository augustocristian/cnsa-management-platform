// Vista Entrenamientos: planificación semanal, crear/editar sesiones.
import { icon } from '../icons.js';
import { t, tEstado, locale } from '../i18n.js';
import * as PLAN from './entreno-acciones.js';
import { abrirEditor } from './entreno-editor.js';
const CSS = `
.ent-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;margin-bottom:12px}
.ent-nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ent-week{font-weight:600;min-width:150px;text-align:center}
.ent-day{margin-bottom:12px}
.ent-day h3{margin:0 0 8px;font-size:1rem;text-transform:capitalize}
.ent-day.ent-today h3{color:var(--c-primary,#1a73e8)}
.ent-sess{display:flex;gap:10px;justify-content:space-between;align-items:flex-start;padding:10px 0;border-top:1px solid #e5e9f0;flex-wrap:wrap}
.ent-time{font-weight:700;min-width:48px}
.ent-main{flex:1;min-width:200px}
.ent-title{font-weight:600}
.ent-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;font-size:.85rem;color:#5f6b7a}
.ent-act{display:flex;gap:6px;flex-wrap:wrap}
.ent-empty{color:#7a8594;padding:8px 0}
.ent-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:flex;align-items:flex-end;justify-content:center}
.ent-modal{background:#fff;border-radius:16px 16px 0 0;width:100%;max-width:560px;max-height:92vh;overflow:auto;padding:16px;box-sizing:border-box}
@media(min-width:700px){.ent-ov{align-items:center}.ent-modal{border-radius:16px}}
.ent-modal h2{margin:0 0 12px;font-size:1.15rem}
.ent-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.ent-form label{display:flex;flex-direction:column;font-size:.85rem;gap:4px;color:#44505f}
.ent-form .ent-full{grid-column:1/-1}
.ent-form input,.ent-form select,.ent-form textarea{font:inherit;padding:8px;border:1px solid #c9d1dc;border-radius:8px;width:100%;box-sizing:border-box}
.ent-foot{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}
`;

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const shortDate = (d) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(d);
const dayName = (d) => new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(d);

function injectStyle() {
  if (document.getElementById('ent-style')) return;
  const s = document.createElement('style');
  s.id = 'ent-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export async function render(container, params, ctx) {
  const { store, auth } = ctx;
  const h = ctx.ui.h;
  const toast = (m) => (ctx.ui.toast ? ctx.ui.toast(m) : alert(m));
  injectStyle();

  const canEdit = auth.role() !== 'nadador';
  const plan = PLAN.servicio(ctx);
  let weekStart = mondayOf(new Date());
  let groupFilter = '';
  let unsub = null;

  const grupoName = (id) => (store.list('Grupos').find((g) => g.id === id) || {}).nombre || t('entre.grupo-todos');

  async function confirmDel(msg) {
    if (ctx.ui.confirmDialog) return ctx.ui.confirmDialog(msg);
    return confirm(msg);
  }

  // Modal propio con formulario
  function openForm(row) {
    const isNew = !row.id;
    const grupos = store.list('Grupos');
    const f = (name, label, attrs = {}, full = false) =>
      h('label', { class: full ? 'ent-full' : '' }, label, h('input', { name, value: row[name] ?? '', ...attrs }));
    const form = h('form', { class: 'ent-form' },
      f('titulo', t('entre.f.titulo'), { required: true }, true),
      f('fecha', t('entre.f.fecha'), { type: 'date', required: true }),
      f('hora', t('entre.f.hora'), { type: 'time' }),
      f('duracionMin', t('entre.f.duracion'), { type: 'number', min: 0 }),
      h('label', {}, t('entre.f.piscina'),
        h('select', { name: 'piscina' },
          ...[['', '—'], ['25', '25 m'], ['50', '50 m']].map(([v, lbl]) => h('option', { value: v }, lbl)))),
      h('label', {}, t('entre.f.grupo'),
        h('select', { name: 'grupoId' },
          h('option', { value: '' }, t('entre.todos-grupos')),
          ...grupos.map((g) => h('option', { value: g.id }, g.nombre)))),
      h('label', {}, t('entre.f.estado'),
        h('select', { name: 'estado' },
          h('option', { value: 'planificado' }, tEstado('planificado')),
          h('option', { value: 'realizado' }, tEstado('realizado')))),
      f('volumenMin', t('entre.f.vol-min'), { type: 'number', min: 0, step: 100 }),
      f('volumenMax', t('entre.f.vol-max'), { type: 'number', min: 0, step: 100 }),
      f('enfoque', t('entre.f.enfoque'), {}, true),
      h('label', { class: 'ent-full' }, t('entre.f.descripcion'),
        h('textarea', { name: 'descripcion', rows: 4 }, row.descripcion ?? '')),
    );
    form.elements.piscina.value = String(row.piscina ?? '');
    form.elements.grupoId.value = row.grupoId ?? '';
    form.elements.estado.value = row.estado || 'planificado';

    const close = () => ov.remove();
    form.append(h('div', { class: 'ent-foot ent-full' },
      h('button', { type: 'button', class: 'btn', onclick: close }, t('common.cancelar')),
      h('button', { type: 'submit', class: 'btn btn-primary' }, t('common.guardar'))));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const out = { ...row, ...Object.fromEntries(new FormData(form).entries()) };
      if (out.volumenMin && out.volumenMax && Number(out.volumenMin) > Number(out.volumenMax)) {
        return toast(t('entre.err-volumen'));
      }
      const guardada = await store.upsert('Entrenamientos', out);
      if (isNew && row.copiaDe && guardada) plan.copiarPlan(row.copiaDe, guardada.id); // duplicar: copia también el plan detallado
      close();
      toast(t('entre.guardada'));
    });
    const ov = h('div', { class: 'ent-ov', onclick: (e) => { if (e.target === ov) close(); } },
      h('div', { class: 'ent-modal' }, h('h2', {}, isNew ? t('entre.nueva') : t('entre.editar-sesion')), form));
    document.body.appendChild(ov);
  }

  function sessionRow(s) {
    const meta = [];
    if (s.duracionMin) meta.push(t('entre.meta-min', { n: s.duracionMin }));
    if (s.piscina) meta.push(t('entre.meta-piscina', { n: s.piscina }));
    if (s.volumenMin || s.volumenMax) meta.push(t('entre.meta-vol', { min: s.volumenMin || '?', max: s.volumenMax || '?' }));
    if (s.enfoque) meta.push(t('entre.meta-enfoque', { v: s.enfoque }));
    const resumen = plan.tienePlan(s.id) ? plan.resumen(s.id) : null;
    if (resumen && resumen.metros) meta.push(t('entreno.chip', { m: resumen.metros, min: resumen.tiempoMin }));
    const done = s.estado === 'realizado';
    return h('div', { class: 'ent-sess' },
      h('div', { class: 'ent-time' }, s.hora || '--:--'),
      h('div', { class: 'ent-main' },
        h('div', { class: 'ent-title' }, s.titulo || t('entre.sesion')),
        h('div', { class: 'ent-meta' },
          h('span', { class: 'badge' }, grupoName(s.grupoId)),
          h('span', { class: 'badge' }, tEstado(done ? 'realizado' : 'planificado')),
          ...meta.map((m) => h('span', {}, m))),
        s.descripcion ? h('div', { class: 'ent-meta' }, s.descripcion) : null),
      h('div', { class: 'ent-act' },
        h('button', { class: 'btn', onclick: () => abrirEditor({ ctx, sesionId: s.id, soloLectura: !canEdit }) }, icon('documento', { size: 16 }), ' ' + t(canEdit ? 'entreno.plan' : 'entreno.ver-plan')),
        h('button', { class: 'btn', 'aria-label': t('entreno.pdf-de', { n: s.titulo || t('entre.sesion') }), onclick: () => PLAN.pdfSesion(ctx, s.id) }, icon('descargar', { size: 16 }), ' PDF'),
        ...(!canEdit ? [] : [
        h('button', { class: 'btn', onclick: async () => {
          await store.upsert('Entrenamientos', { ...s, estado: done ? 'planificado' : 'realizado' });
        } }, done ? t('entre.reabrir') : t('entre.marcar-realizado')),
        h('button', { class: 'btn', onclick: () => openForm(s) }, t('common.editar')),
        h('button', { class: 'btn', onclick: () => openForm({ ...s, id: undefined, estado: 'planificado', copiaDe: s.id }) }, t('entre.duplicar')),
        h('button', { class: 'btn', onclick: async () => {
          if (await confirmDel(t('entre.confirm-eliminar'))) { plan.eliminarSesion(s.id); toast(t('entre.eliminada')); }
        } }, t('common.eliminar'))])));
  }

  function draw() {
    const end = addDays(weekStart, 6);
    const todayIso = iso(new Date());
    const all = store.list('Entrenamientos');
    const grupos = store.list('Grupos');

    const groupSel = h('select', { onchange: (e) => { groupFilter = e.target.value; draw(); } },
      h('option', { value: '' }, t('entre.todos-grupos')),
      ...grupos.map((g) => h('option', { value: g.id }, g.nombre)));
    groupSel.value = groupFilter;

    const bar = h('div', { class: 'ent-bar' },
      h('div', { class: 'ent-nav' },
        h('button', { class: 'btn', 'aria-label': t('entre.semana-anterior'), onclick: () => { weekStart = addDays(weekStart, -7); draw(); } }, '‹'),
        h('div', { class: 'ent-week' }, `${shortDate(weekStart)} – ${shortDate(end)} ${end.getFullYear()}`),
        h('button', { class: 'btn', 'aria-label': t('entre.semana-siguiente'), onclick: () => { weekStart = addDays(weekStart, 7); draw(); } }, '›'),
        h('button', { class: 'btn', onclick: () => { weekStart = mondayOf(new Date()); draw(); } }, t('entre.hoy'))),
      h('div', { class: 'ent-nav' }, groupSel,
        h('button', { class: 'btn', onclick: () => PLAN.pdfSemana(ctx, { lunes: iso(weekStart), grupoId: groupFilter, grupoNombre: groupFilter ? grupoName(groupFilter) : '' }) }, icon('descargar', { size: 16 }), ' ' + t('entreno.pdf-semana')),
        canEdit ? h('button', { class: 'btn btn-primary', onclick: () => openForm({ fecha: todayIso, estado: 'planificado', grupoId: groupFilter }) }, icon('mas', { size: 16 }), ' ' + t('entre.nueva')) : null));

    const days = [];
    let weekTotal = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const di = iso(d);
      const sess = all
        .filter((s) => String(s.fecha).slice(0, 10) === di && (!groupFilter || s.grupoId === groupFilter))
        .sort((a, b) => String(a.hora || '').localeCompare(String(b.hora || '')));
      weekTotal += sess.length;
      days.push(h('div', { class: 'card ent-day' + (di === todayIso ? ' ent-today' : '') },
        h('h3', {}, `${dayName(d)} ${shortDate(d)}`),
        sess.length ? h('div', {}, ...sess.map(sessionRow)) : h('div', { class: 'ent-empty' }, t('entre.sin-sesiones'))));
    }

    container.replaceChildren(
      h('h2', {}, t('entre.titulo')),
      bar,
      h('div', { class: 'ent-meta' }, t('entre.total-semana', { n: weekTotal })),
      h('div', { class: 'grid' }, ...days));
  }

  draw();
  if (store.on) {
    const off = store.on(() => { if (container.isConnected) draw(); else if (typeof off === 'function') off(); });
    unsub = off;
  }
  return unsub;
}
