// Vista Planificación de la piscina: rejilla horaria por calles, asignación de cursos y panel de conflictos.
// Sólo presenta: la lógica vive en js/domain/planificacion.js y la orquestación en js/application/planificacionService.js.
import { icon } from '../icons.js';
import { t, locale } from '../i18n.js';
import * as D from '../domain/planificacion.js';
import { crearPlanificacionService, piscinaPorDefecto } from '../application/planificacionService.js';

const CSS = `
.pl-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.pl-bar .grow{flex:1}
.pl-bar select{width:auto;max-width:100%}
.pl-seg{display:inline-flex;border:1px solid var(--border);border-radius:12px;overflow:hidden}
.pl-seg button{font:inherit;border:0;background:#fff;padding:.5rem .8rem;cursor:pointer}
.pl-seg button[aria-pressed=true]{background:var(--c-primary);color:#fff}
.pl-tabs{display:flex;gap:4px;overflow-x:auto;margin-bottom:10px;padding-bottom:2px}
.pl-tab{font:inherit;flex:1;min-width:58px;border:1px solid var(--border);background:#fff;border-radius:10px;padding:.35rem .4rem;cursor:pointer;display:flex;flex-direction:column;align-items:center;line-height:1.2}
.pl-tab small{color:var(--muted)}
.pl-tab[aria-selected=true]{background:var(--c-primary);border-color:var(--c-primary);color:#fff}
.pl-tab[aria-selected=true] small{color:#fff}
.pl-tab.pl-closed-day{background:#f3f4f7;color:var(--muted)}
.pl-tab.pl-closed-day[aria-selected=true]{background:var(--c-secondary);color:#fff}
.pl-chip{display:inline-flex;align-items:center;gap:.35rem;border-radius:999px;padding:.2rem .7rem;font-size:.85rem;border:1px solid var(--border);background:#fff}
.pl-chip.err{border-color:var(--danger);color:var(--danger)}
.pl-chip.warn{border-color:var(--warn);color:#8a5a00}
.pl-chip.ok{border-color:var(--ok);color:var(--ok)}
.pl-meta{color:var(--muted);font-size:.9rem;margin:6px 0 10px}
.pl-gridwrap{overflow:auto;max-height:78vh;border:1px solid var(--border);border-radius:12px;background:#fff}
.pl-grid{display:grid;position:relative;min-width:max-content;width:100%}
.pl-head{position:sticky;top:0;z-index:4;background:#f6f8fc;font-size:.8rem;font-weight:700;color:var(--c-secondary);text-align:center;padding:.4rem .2rem;border-bottom:2px solid var(--border);border-left:1px solid var(--border)}
.pl-time{position:sticky;left:0;z-index:3;background:#f6f8fc;font-size:.72rem;color:var(--muted);padding:0 .35rem;text-align:right;border-top:1px solid var(--border)}
.pl-head.pl-corner{left:0;z-index:5;border-left:0}
.pl-cell{font:inherit;border:0;border-top:1px dotted #d6dde9;border-left:1px solid var(--border);background:transparent;padding:0;margin:0;border-radius:0;cursor:pointer;min-width:62px}
.pl-cell:hover:not(:disabled){background:var(--c-primary-soft)}
.pl-cell:focus-visible{outline:2px solid var(--c-primary);outline-offset:-2px;background:var(--c-primary-soft)}
.pl-cell.pl-over{background:var(--c-primary-mid)}
.pl-cell.pl-off,.pl-time.pl-off{background:repeating-linear-gradient(135deg,#f1f3f7,#f1f3f7 6px,#e9edf3 6px,#e9edf3 12px);cursor:default}
div.pl-cell{cursor:default}
.pl-block{z-index:2;margin:1px;border-radius:8px;padding:2px 5px;overflow:hidden;font:inherit;font-size:.74rem;line-height:1.2;text-align:left;color:var(--text);border:1px solid;border-left-width:4px;background:hsl(var(--h) 75% 91%);border-color:hsl(var(--h) 50% 40%);display:flex;flex-direction:column;gap:1px;min-width:0}
button.pl-block{cursor:pointer}
button.pl-block:focus-visible{outline:3px solid var(--c-primary);outline-offset:1px}
.pl-block b{display:flex;gap:3px;align-items:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pl-block span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#3a4658}
.pl-block.sev-error{outline:2px solid var(--danger);outline-offset:-1px}
.pl-block.sev-aviso{outline:2px dashed var(--warn);outline-offset:-1px}
.pl-block .icon{width:13px;height:13px}
.pl-block.sev-error .icon{color:var(--danger)}
.pl-block.sev-aviso .icon{color:#b36b00}
.pl-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0;font-size:.85rem;list-style:none;padding:0}
.pl-legend li{display:inline-flex;gap:6px;align-items:center}
.pl-sw{width:14px;height:14px;border-radius:4px;border:1px solid;background:hsl(var(--h) 75% 91%);border-color:hsl(var(--h) 50% 40%)}
.pl-week{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
.pl-day{border:1px solid var(--border);border-radius:12px;background:#fff;padding:8px;min-width:0}
.pl-day h4{margin:0 0 6px;font-size:.9rem;color:var(--c-secondary);display:flex;justify-content:space-between;gap:4px;text-transform:capitalize}
.pl-day h4 small{color:var(--muted);font-weight:400;text-transform:none}
.pl-item{display:block;width:100%;text-align:left;font:inherit;font-size:.8rem;margin:0 0 5px;padding:4px 6px;border-radius:8px;border:1px solid;border-left-width:4px;background:hsl(var(--h) 75% 91%);border-color:hsl(var(--h) 50% 40%);color:var(--text)}
button.pl-item{cursor:pointer}
.pl-item.sev-error{outline:2px solid var(--danger);outline-offset:-1px}
.pl-item.sev-aviso{outline:2px dashed var(--warn);outline-offset:-1px}
.pl-item small{display:block;color:#3a4658}
.pl-empty{color:var(--muted);font-size:.85rem}
.pl-panel{margin-top:14px}
.pl-panel h3{margin:0 0 8px}
.pl-clist{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-direction:column;gap:5px}
.pl-clist button{font:inherit;text-align:left;width:100%;display:flex;gap:8px;align-items:flex-start;border:1px solid var(--border);background:#fff;border-radius:10px;padding:.45rem .6rem;cursor:pointer}
.pl-clist button:hover{background:var(--c-primary-soft)}
.pl-clist .icon{margin-top:2px}
.pl-clist .e .icon{color:var(--danger)}
.pl-clist .a .icon{color:#b36b00}
.pl-clist .i .icon{color:var(--c-primary)}
.pl-note{border-radius:10px;padding:.5rem .7rem;margin:8px 0;font-size:.88rem}
.pl-note.err{background:#fdecea;color:#8c1d18}
.pl-note.warn{background:#fff4de;color:#7a4b00}
.pl-note.ok{background:#e6f6ed;color:#14683b}
.pl-note ul{margin:4px 0 0;padding-left:1.1rem}
.pl-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem .9rem}
.pl-form .full{grid-column:1/-1}
.pl-form label{display:flex;flex-direction:column;gap:.2rem;font-size:.85rem;font-weight:600;color:var(--muted)}
.pl-form label small{font-weight:400}
.pl-hours{display:grid;grid-template-columns:minmax(90px,1fr) auto 1fr 1fr;gap:6px 8px;align-items:center;font-size:.9rem}
.pl-hours label{flex-direction:row;align-items:center;gap:6px;font-weight:600;color:var(--text)}
.pl-hours input[type=checkbox]{width:auto}
.pl-sug li{margin:3px 0}
.pl-form label.pl-check{flex-direction:row;align-items:center;gap:8px;font-weight:400;color:var(--text);font-size:.95rem}
.pl-form label.pl-check input{width:auto}
.pl-print,.pl-print-title{display:none}
@media (max-width:820px){
  .modal-overlay.pl-sheet{place-items:end center;padding:0}
  .pl-sheet .modal{border-radius:16px 16px 0 0;max-height:92vh}
  .pl-form .pl-wide{grid-column:1/-1}
  .pl-hours{grid-template-columns:1fr auto 1fr 1fr}
  .pl-gridwrap{max-height:62vh}
}
@media print{
  .sidebar,.topbar,.footer,.pl-screen,#toasts,.install-banner{display:none!important}
  .shell{display:block!important;padding:0!important}
  .view{padding:0!important}
  body{background:#fff}
  .pl-print,.pl-print-title{display:block}
  .pl-week{grid-template-columns:repeat(4,1fr)}
  .pl-day,.pl-item{break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .pl-sw{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
`;

const pad2 = (n) => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtCorta = (f) => { const [y, m, d] = f.split('-').map(Number); return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(y, m - 1, d)); };
const nombreDia = (dia, estilo = 'long') => new Intl.DateTimeFormat(locale(), { weekday: estilo }).format(new Date(2024, 0, dia)); // 1 ene 2024 = lunes

function injectStyle() {
  if (document.getElementById('pl-style')) return;
  const s = document.createElement('style');
  s.id = 'pl-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const textoCalles = (d, h) => (d === h ? t('plan.calle-una', { n: d }) : t('plan.calles-rango', { desde: d, hasta: h }));

// Mensaje traducido de un conflicto del dominio.
export function mensajeConflicto(c) {
  const p = c.params || {};
  const calles = textoCalles(Number.isNaN(p.desde) ? '?' : p.desde, Number.isNaN(p.hasta) ? '?' : p.hasta);
  const key = c.tipo === 'fuera-horario' && p.cerrado ? 'plan.c.fuera-horario-cerrado' : 'plan.c.' + c.tipo;
  return t(key, { ...p, calles, dia: c.dia >= 1 && c.dia <= 7 ? nombreDia(c.dia) : '?' });
}

export async function render(container, params, ctx) {
  const { store, auth } = ctx;
  const h = ctx.ui.h;
  const toast = (m) => ctx.ui.toast(m);
  injectStyle();
  const svc = crearPlanificacionService(store, { puedeEditar: () => auth.role() !== 'nadador' });
  const canEdit = () => svc.puedeEditar();

  // Nadador: sólo ve su grupo (si se puede identificar; en vista demo sin vínculo ve todos, siempre de sólo lectura).
  function miGrupo() {
    if (canEdit()) return '';
    const email = ((auth.user && auth.user.email) || '').toLowerCase();
    const u = store.list('Usuarios').find((x) => (x.email || '').toLowerCase() === email);
    let id = (u && u.nadadorId) || '';
    const nads = store.list('Nadadores');
    if (!id && email) { const n = nads.find((x) => (x.email || '').toLowerCase() === email); if (n) id = n.id; }
    const n = nads.find((x) => x.id === id);
    return n ? n.grupoId : '';
  }

  const hoy = hoyIso();
  let semana = D.lunesDe(hoy);
  let dia = D.diaDeFecha(hoy);
  let modo = 'dia';
  let piscinaId = '';
  let ultimoFoco = null;

  const grupos = () => store.list('Grupos');
  const tono = (gid) => D.colorTono(gid, grupos());
  const nombreGrupo = (gid) => (grupos().find((g) => g.id === gid) || {}).nombre || '?';
  const fechaDelDia = (d) => D.fechaDeDia(semana, d);

  // ---------- Diálogos ----------
  function abrirModal(opts) {
    const m = ctx.ui.modal(opts);
    m.el.classList.add('pl-sheet');
    return m;
  }
  const filaConflicto = (c, extra) => h('li', { class: c.severidad === 'error' ? 'e' : c.severidad === 'aviso' ? 'a' : 'i' }, extra);
  const iconoSev = (s) => icon(s === 'info' ? 'info' : 'aviso', { size: 16 });

  function listaNotas(conflictos, forzar) {
    const errs = conflictos.filter((c) => c.severidad === 'error');
    const avs = conflictos.filter((c) => c.severidad === 'aviso');
    if (!errs.length && !avs.length) return [h('div', { class: 'pl-note ok' }, icon('check', { size: 16 }), ' ', t('plan.sin-conflictos'))];
    const out = [];
    if (errs.length) out.push(h('div', { class: 'pl-note err', role: 'alert' }, h('strong', null, t('plan.bloqueado')), h('ul', null, errs.map((c) => h('li', null, mensajeConflicto(c))))));
    if (avs.length) out.push(h('div', { class: 'pl-note warn' }, h('strong', null, forzar && !errs.length ? t('plan.avisos-forzar') : t('plan.avisos')), h('ul', null, avs.map((c) => h('li', null, mensajeConflicto(c))))));
    return out;
  }

  // Formulario de asignación (crear, editar, mover). row = valores iniciales; row.id => edición.
  function abrirFormulario(row) {
    const pools = svc.piscinas();
    if (!pools.length) return;
    const esNueva = !row.id;
    const ent0 = svc.entrenadores();
    const inicial = {
      piscinaId: row.piscinaId || piscinaId || pools[0].id, dia: row.dia || dia, fecha: row.fecha || '',
      horaInicio: row.horaInicio || '17:00', horaFin: row.horaFin || '18:00', calleDesde: row.calleDesde || 1, calleHasta: row.calleHasta || row.calleDesde || 1,
      grupoId: row.grupoId || '', entrenadorId: row.entrenadorId || '', notas: row.notas || '',
    };
    const piscina0 = pools.find((p) => p.id === inicial.piscinaId) || pools[0];
    const entOpts = [{ value: '', label: t('plan.sin-entrenador-opt') }, ...ent0.map((e) => ({ value: e, label: e }))];
    if (inicial.entrenadorId && !ent0.includes(inicial.entrenadorId)) entOpts.push({ value: inicial.entrenadorId, label: inicial.entrenadorId });
    const def = [
      { name: 'piscinaId', label: t('plan.f.piscina'), type: 'select', options: pools.map((p) => ({ value: p.id, label: p.nombre })), required: true },
      { name: 'dia', label: t('plan.f.dia'), type: 'select', options: D.DIAS.map((d) => ({ value: d, label: nombreDia(d) })) },
      { name: 'horaInicio', label: t('plan.f.inicio'), type: 'time', step: piscina0.intervaloMin * 60, required: true },
      { name: 'horaFin', label: t('plan.f.fin'), type: 'time', step: piscina0.intervaloMin * 60, required: true },
      { name: 'calleDesde', label: t('plan.f.desde'), type: 'number', min: 1, step: 1, required: true },
      { name: 'calleHasta', label: t('plan.f.hasta'), type: 'number', min: 1, step: 1, required: true },
      { name: 'grupoId', label: t('plan.f.grupo'), type: 'select', options: [{ value: '', label: '—' }, ...grupos().map((g) => ({ value: g.id, label: g.nombre }))], required: true },
      { name: 'entrenadorId', label: t('plan.f.entrenador'), type: 'select', options: entOpts },
      { name: 'fecha', label: t('plan.f.fecha'), type: 'date', full: true },
      { name: 'notas', label: t('plan.f.notas'), type: 'textarea' },
    ];
    const form = ctx.ui.formFields(def, inicial);
    form.el.classList.add('pl-form');
    ['piscinaId', 'dia', 'grupoId', 'entrenadorId'].forEach((n) => form.el.querySelectorAll('label')[def.findIndex((d) => d.name === n)].classList.add('pl-wide'));
    const campo = (n) => [...form.el.querySelectorAll('label')].map((l) => l.querySelector('input,select,textarea')).find((x, i) => def[i].name === n);
    const hint = h('p', { class: 'hint full' }, t('plan.f.fecha-ayuda'));
    campo('fecha').closest('label').after(hint);
    const estado = h('div', { 'aria-live': 'polite' });
    let forzar = false;
    let entDefecto = (grupos().find((g) => g.id === inicial.grupoId) || {}).entrenador || '';

    const leer = () => ({ ...row, ...form.values(), id: row.id || '' });
    const refrescar = () => {
      const v = leer();
      const diaSel = campo('dia');
      diaSel.disabled = !!v.fecha;
      if (v.fecha) { const dd = D.diaDeFecha(v.fecha); if (!Number.isNaN(dd)) diaSel.value = String(dd); }
      estado.replaceChildren(...listaNotas(svc.evaluar(leer()).filter((c) => c.severidad !== 'info'), false));
      forzar = false;
      if (btnGuardar) btnGuardar.textContent = t('common.guardar');
    };
    campo('grupoId').addEventListener('change', () => {
      const g = grupos().find((x) => x.id === campo('grupoId').value);
      const sel = campo('entrenadorId');
      if (g && g.entrenador && (sel.value === '' || sel.value === entDefecto)) {
        if (![...sel.options].some((o) => o.value === g.entrenador)) sel.append(h('option', { value: g.entrenador }, g.entrenador));
        sel.value = g.entrenador;
      }
      entDefecto = g ? g.entrenador || '' : '';
    });
    form.el.addEventListener('input', refrescar);
    form.el.addEventListener('change', refrescar);

    const guardar = () => {
      if (!form.validate()) return false;
      const res = svc.guardarAsignacion(leer(), { forzar });
      if (res.ok) { toast(t('plan.guardada')); return true; }
      estado.replaceChildren(...listaNotas(res.conflictos.filter((c) => c.severidad !== 'info'), true));
      if (res.requiereForzar) { forzar = true; btnGuardar.textContent = t('plan.guardar-igualmente'); }
      return false;
    };
    const acciones = [{ label: t('common.cancelar') }];
    if (!esNueva) {
      acciones.push({
        label: t('common.eliminar'), danger: true,
        onClick: async () => {
          if (!(await ctx.ui.confirmDialog(t('plan.eliminar-confirm'), { danger: true, okLabel: t('common.eliminar') }))) return false;
          svc.borrarAsignacion(row.id);
          toast(t('plan.eliminada'));
        },
      });
      acciones.push({
        label: t('plan.duplicar'),
        onClick: (close) => {
          const sig = row.fecha ? D.sumarDias(row.fecha, 1) : '';
          const nuevo = { ...leer(), id: '', fecha: sig, dia: sig ? D.diaDeFecha(sig) : (Number(row.dia) % 7) + 1 };
          close();
          setTimeout(() => abrirFormulario(nuevo), 0);
          return false;
        },
      });
    }
    acciones.push({ label: t('common.guardar'), primary: true, onClick: guardar });
    const m = abrirModal({ title: esNueva ? t('plan.nueva-asignacion') : t('plan.editar-asignacion'), body: h('div', null, form.el, estado), actions: acciones });
    const btnGuardar = m.el.querySelector('.modal-actions .btn-primary');
    refrescar();
  }

  // Detalle de sólo lectura (nadador).
  function abrirDetalle(a) {
    const p = svc.piscina(a.piscinaId);
    abrirModal({
      title: nombreGrupo(a.grupoId),
      body: h('dl', { class: 'pl-detail' },
        ...[[t('plan.f.piscina'), p ? p.nombre : '?'], [t('plan.f.dia'), a.fecha ? `${nombreDia(a.dia)} (${fmtCorta(a.fecha)})` : nombreDia(a.dia)],
          [t('plan.f.horario'), `${a.horaInicio}–${a.horaFin}`], [t('plan.f.calles'), textoCalles(a.calleDesde, a.calleHasta)],
          [t('plan.f.entrenador'), a.entrenadorId || '—'], [t('plan.f.notas'), a.notas || '—']]
          .flatMap(([k, v]) => [h('dt', { class: 'muted' }, k), h('dd', { style: { margin: '0 0 .5rem' } }, v)])),
    });
  }
  const abrirAsignacion = (a) => (canEdit() ? abrirFormulario(a) : abrirDetalle(a));

  // Configuración de piscina
  function abrirConfig(base) {
    const p = base || piscinaPorDefecto();
    const esNueva = !p.id;
    const inp = (type, value, attrs = {}) => h('input', { type, value, ...attrs });
    const nombre = inp('text', p.nombre, { maxlength: 60, required: true });
    const longitud = h('select', null, D.LONGITUDES.map((l) => h('option', { value: l, selected: l === p.longitudM }, l + ' m')));
    const calles = inp('number', p.numCalles, { min: 1, max: D.MAX_CALLES, step: 1, required: true });
    const intervalo = h('select', null, D.INTERVALOS.map((i) => h('option', { value: i, selected: i === p.intervaloMin }, t('plan.cfg.min', { n: i }))));
    const maxCalle = inp('number', p.maxPorCalle, { min: 1, max: 99, step: 1, required: true });
    const filas = D.DIAS.map((d) => {
      const x = p.horario[d];
      const abierto = h('input', { type: 'checkbox', checked: !!x, id: 'pl-ab' + d });
      const abre = inp('time', x ? x.abre : '07:00', { 'aria-label': t('plan.cfg.abre') + ' ' + nombreDia(d) });
      const cierra = inp('time', x ? x.cierra : '22:00', { 'aria-label': t('plan.cfg.cierra') + ' ' + nombreDia(d) });
      const sync = () => { abre.disabled = cierra.disabled = !abierto.checked; };
      abierto.addEventListener('change', sync);
      sync();
      return { d, abierto, abre, cierra, nodos: [h('label', { for: 'pl-ab' + d }, abierto, ' ', nombreDia(d)), h('span', { class: 'muted' }, ''), abre, cierra] };
    });
    const f = (label, el, full) => h('label', { class: full ? 'full' : '' }, label, el);
    const error = h('p', { class: 'form-error', role: 'alert' });
    const datos = () => ({
      id: p.id, nombre: nombre.value.trim(), longitudM: Number(longitud.value), numCalles: Number(calles.value),
      intervaloMin: Number(intervalo.value), maxPorCalle: Number(maxCalle.value),
      horario: Object.fromEntries(filas.map((r) => [r.d, r.abierto.checked ? { abre: r.abre.value, cierra: r.cierra.value } : null])),
    });
    const body = h('div', null,
      h('div', { class: 'pl-form' }, f(t('plan.cfg.nombre'), nombre, true), f(t('plan.cfg.longitud'), longitud), f(t('plan.cfg.calles'), calles),
        f(t('plan.cfg.intervalo'), intervalo), f(t('plan.cfg.max'), maxCalle),
        h('div', { class: 'full' }, h('strong', null, t('plan.cfg.horario')),
          h('div', { class: 'pl-hours', role: 'group', 'aria-label': t('plan.cfg.horario') }, filas.flatMap((r) => r.nodos)))),
      error);
    const acciones = [{ label: t('common.cancelar') }];
    if (!esNueva) {
      acciones.push({
        label: t('plan.cfg.eliminar'), danger: true,
        onClick: async () => {
          const n = svc.asignaciones(p.id).length;
          if (!(await ctx.ui.confirmDialog(t('plan.cfg.eliminar-confirm', { n }), { danger: true, okLabel: t('common.eliminar') }))) return false;
          svc.borrarPiscina(p.id);
          piscinaId = '';
          toast(t('plan.cfg.eliminada'));
        },
      });
    }
    acciones.push({
      label: t('common.guardar'), primary: true,
      onClick: async () => {
        const d = datos();
        const errs = D.validarPiscina(d);
        if (errs.length) { error.textContent = errs.map((e) => t('plan.err.' + e)).join(' '); return false; }
        if (!esNueva && d.numCalles < p.numCalles) {
          const ef = svc.efectoReducir(p.id, d.numCalles);
          if (ef.recortadas.length || ef.fuera.length) {
            if (!(await ctx.ui.confirmDialog(t('plan.cfg.recorte-confirm', { recortadas: ef.recortadas.length, fuera: ef.fuera.length })))) return false;
          }
        }
        const res = svc.guardarPiscina(d, { recortar: true });
        if (!res.ok) { error.textContent = res.errores.map((e) => t('plan.err.' + e)).join(' '); return false; }
        piscinaId = res.piscina.id;
        toast(res.recortadas || res.fuera ? t('plan.cfg.guardada-recorte', { recortadas: res.recortadas, fuera: res.fuera }) : t('plan.cfg.guardada'));
      },
    });
    abrirModal({ title: esNueva ? t('plan.nueva-piscina') : t('plan.cfg.titulo'), body, actions: acciones });
  }

  // Sugerir distribución
  function abrirSugerencia(pool) {
    const diaSel = h('select', { 'aria-label': t('plan.sug.dia') }, D.DIAS.map((d) => h('option', { value: d, selected: d === dia }, nombreDia(d))));
    const dur = h('input', { type: 'number', min: pool.intervaloMin, step: pool.intervaloMin, value: 60, 'aria-label': t('plan.sug.duracion') });
    const lista = h('div');
    const vista = h('div', { 'aria-live': 'polite' });
    let propuestas = [];
    const grupoChecks = new Map();
    const pintarGrupos = () => {
      lista.replaceChildren();
      grupoChecks.clear();
      const ya = svc.asignaciones(pool.id).filter((a) => !a.fecha && a.dia === Number(diaSel.value)).map((a) => a.grupoId);
      grupos().forEach((g) => {
        const cb = h('input', { type: 'checkbox', checked: !ya.includes(g.id), id: 'pl-sg' + g.id });
        cb.addEventListener('change', calcular);
        grupoChecks.set(g.id, cb);
        lista.append(h('div', null, h('label', { for: 'pl-sg' + g.id, class: 'pl-check' }, cb, g.nombre)));
      });
    };
    function calcular() {
      const sel = [...grupoChecks].filter(([, cb]) => cb.checked).map(([id]) => id);
      const r = svc.sugerir({ piscinaId: pool.id, dia: Number(diaSel.value), duracionMin: Number(dur.value) || 60, soloGrupos: sel, preferencias: preferenciasHora() });
      propuestas = r.propuestas;
      vista.replaceChildren(
        propuestas.length ? h('ul', { class: 'pl-sug' }, propuestas.map((p) => h('li', null,
          h('strong', null, nombreGrupo(p.grupoId)), ` · ${p.horaInicio}–${p.horaFin} · ${textoCalles(p.calleDesde, p.calleHasta)}`,
          p.reducida ? ' · ' + t('plan.sug.reducida') : ''))) : h('p', { class: 'muted' }, t('plan.sug.vacio')),
        ...r.sinHueco.map((s) => h('div', { class: 'pl-note warn' }, t(s.motivo === 'cerrado' ? 'plan.sug.cerrado' : 'plan.sug.sin-hueco', { grupo: nombreGrupo(s.grupoId) }))));
    }
    diaSel.addEventListener('change', () => { pintarGrupos(); calcular(); });
    dur.addEventListener('input', calcular);
    pintarGrupos();
    calcular();
    abrirModal({
      title: t('plan.sugerir'),
      body: h('div', null, h('p', { class: 'hint' }, t('plan.sug.intro')),
        h('div', { class: 'pl-form' }, h('label', null, t('plan.sug.dia'), diaSel), h('label', null, t('plan.sug.duracion'), dur),
          h('div', { class: 'full' }, h('strong', null, t('plan.sug.grupos')), lista)), vista),
      actions: [{ label: t('common.cancelar') }, {
        label: t('plan.sug.aplicar'), primary: true,
        onClick: () => {
          if (!propuestas.length) return false;
          const n = svc.aplicarSugerencia(propuestas);
          dia = Number(diaSel.value);
          toast(t('plan.sug.aplicadas', { n }));
        },
      }],
    });
  }

  // Hora habitual de cada grupo según sus entrenamientos (la más frecuente): orienta la sugerencia.
  function preferenciasHora() {
    const cuenta = {};
    store.list('Entrenamientos').forEach((e) => {
      if (!e.grupoId || !/^\d{1,2}:\d{2}$/.test(String(e.hora || ''))) return;
      const c = (cuenta[e.grupoId] ||= {});
      c[e.hora] = (c[e.hora] || 0) + 1;
    });
    return Object.fromEntries(Object.entries(cuenta).map(([g, c]) => [g, Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
  }

  // ---------- Bloques de la rejilla ----------
  function descripcionBloque(a) {
    return t('plan.bloque-aria', { grupo: nombreGrupo(a.grupoId), dia: nombreDia(a.dia), ini: a.horaInicio, fin: a.horaFin, calles: textoCalles(a.calleDesde, a.calleHasta) });
  }
  function bloqueEl(a, sev, nivel, rowStart, interval, base, interactivo) {
    const filas = Math.max(1, Math.round((a.fin - a.ini) / interval));
    const s = sev.get(a.id);
    const cls = 'pl-block' + (s ? ' sev-' + s : '');
    const lbl = descripcionBloque(a) + (s ? '. ' + t('plan.sev.' + s) : '') + (a.fecha ? '. ' + t('plan.puntual', { fecha: fmtCorta(a.fecha) }) : '');
    const kids = [
      h('b', null, s ? icon('aviso', { size: 13 }) : null, a.fecha ? icon('calendario', { size: 13 }) : null, nombreGrupo(a.grupoId)),
      filas >= 2 ? h('span', null, `${a.horaInicio}–${a.horaFin}`) : null,
      filas >= 3 && a.entrenadorId ? h('span', null, a.entrenadorId) : null,
    ];
    const attrs = {
      class: cls, style: `grid-row:${rowStart} / span ${filas};grid-column:${a.calleDesde + 1} / ${a.calleHasta + 2};--h:${tono(a.grupoId)};margin-left:${1 + nivel * 12}px`,
      'aria-label': lbl, title: lbl, dataset: { id: a.id },
    };
    if (!interactivo) return h('div', attrs, kids);
    const b = h('button', { ...attrs, type: 'button', onclick: () => { ultimoFoco = a.id; abrirAsignacion(a); } }, kids);
    if (canEdit()) {
      b.draggable = true;
      b.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', a.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
    }
    return b;
  }

  function moverBloque(id, ini, calleDesde, fechaDia) {
    const a = svc.asignaciones().find((x) => x.id === id);
    if (!a) return;
    const dur = a.fin - a.ini;
    const span = a.calleHasta - a.calleDesde;
    const pool = svc.piscina(a.piscinaId);
    const cambios = {
      piscinaId: pool.id, fecha: a.fecha ? fechaDia : '', dia: D.diaDeFecha(fechaDia), horaInicio: D.deMin(ini), horaFin: D.deMin(ini + dur),
      calleDesde, calleHasta: Math.min(pool.numCalles, calleDesde + span),
    };
    const res = svc.mover(id, cambios);
    if (res.ok) toast(t('plan.movida'));
    else { toast(t('plan.mover-conflicto')); abrirFormulario({ ...a, ...cambios }); }
  }

  function rejillaDia(pool, asigs, sev) {
    const f = fechaDelDia(dia);
    const doy = D.delDia(asigs, { piscinaId: pool.id, dia, fecha: f });
    const rango = D.rangoDia(pool, dia, doy);
    const filas = D.franjas(rango.desde, rango.hasta, pool.intervaloMin);
    const horario = pool.horario[dia];
    const abre = horario ? D.aMin(horario.abre) : NaN, cierra = horario ? D.aMin(horario.cierra) : NaN;
    const abierta = (m) => !Number.isNaN(abre) && m >= abre && m + pool.intervaloMin <= cierra;
    const editar = canEdit();
    const grid = h('div', {
      class: 'pl-grid', role: 'group', 'aria-label': t('plan.rejilla-aria', { piscina: pool.nombre, dia: nombreDia(dia) }),
      style: { gridTemplateColumns: `52px repeat(${pool.numCalles}, minmax(64px, 1fr))`, gridTemplateRows: `auto repeat(${filas.length}, 26px)` },
    });
    grid.append(h('div', { class: 'pl-head pl-corner', style: { gridRow: 1, gridColumn: 1 } }, ''));
    for (let c = 1; c <= pool.numCalles; c++) grid.append(h('div', { class: 'pl-head', style: { gridRow: 1, gridColumn: c + 1 } }, t('plan.calle', { n: c })));
    filas.forEach((m, i) => {
      const mostrar = pool.intervaloMin >= 30 || m % 30 === 0;
      grid.append(h('div', { class: 'pl-time' + (abierta(m) ? '' : ' pl-off'), style: { gridRow: i + 2, gridColumn: 1 } }, mostrar ? D.deMin(m) : ''));
      for (let c = 1; c <= pool.numCalles; c++) {
        const off = !abierta(m);
        const pos = { gridRow: i + 2, gridColumn: c + 1 };
        const cls = 'pl-cell' + (off ? ' pl-off' : '');
        if (!editar) { grid.append(h('div', { class: cls, style: pos })); continue; }
        const fin = Math.min(m + 60, rango.hasta);
        const btn = h('button', {
          type: 'button', class: cls, style: pos, disabled: off, dataset: { calle: c, hora: D.deMin(m) },
          'aria-label': t('plan.hueco-aria', { calle: c, hora: D.deMin(m) }),
          onclick: () => abrirFormulario({ piscinaId: pool.id, dia, fecha: '', horaInicio: D.deMin(m), horaFin: D.deMin(Math.max(fin, m + pool.intervaloMin)), calleDesde: c, calleHasta: c }),
        });
        btn.addEventListener('dragover', (e) => { if (!off) { e.preventDefault(); btn.classList.add('pl-over'); } });
        btn.addEventListener('dragleave', () => btn.classList.remove('pl-over'));
        btn.addEventListener('drop', (e) => {
          e.preventDefault();
          btn.classList.remove('pl-over');
          const id = e.dataTransfer?.getData('text/plain');
          if (id && !off) moverBloque(id, m, c, f);
        });
        grid.append(btn);
      }
    });
    const nivel = D.niveles(doy);
    doy.filter((a) => !Number.isNaN(a.ini) && a.fin > a.ini && a.calleDesde >= 1 && a.calleHasta <= pool.numCalles && a.calleHasta >= a.calleDesde).forEach((a) => {
      const fila = Math.floor((a.ini - rango.desde) / pool.intervaloMin) + 2;
      grid.append(bloqueEl(a, sev, nivel.get(a.id) || 0, fila, pool.intervaloMin, rango.desde, true));
    });
    // Asignaciones fuera de rango de calles: no caben en la rejilla, se avisan aparte
    const sinSitio = doy.filter((a) => !(a.calleDesde >= 1 && a.calleHasta <= pool.numCalles && a.calleHasta >= a.calleDesde));
    return { grid, doy, sinSitio, abre, cierra };
  }

  function semanaEl(pool, asigs, sev, interactivo) {
    const dias = D.DIAS.map((d) => {
      const f = fechaDelDia(d);
      const lista = D.delDia(asigs, { piscinaId: pool.id, dia: d, fecha: f }).slice().sort((x, y) => x.ini - y.ini || x.calleDesde - y.calleDesde);
      const hr = pool.horario[d];
      const oc = hr ? D.ocupacion(pool, lista, D.aMin(hr.abre), D.aMin(hr.cierra)) : null;
      const items = lista.map((a) => {
        const s = sev.get(a.id);
        const kids = [h('strong', null, s ? icon('aviso', { size: 13 }) : null, a.fecha ? icon('calendario', { size: 13 }) : null, ' ', nombreGrupo(a.grupoId)),
          h('small', null, `${a.horaInicio}–${a.horaFin} · ${textoCalles(a.calleDesde, a.calleHasta)}`),
          a.entrenadorId ? h('small', null, a.entrenadorId) : null];
        const at = { class: 'pl-item' + (s ? ' sev-' + s : ''), style: `--h:${tono(a.grupoId)}`, 'aria-label': descripcionBloque(a) + (s ? '. ' + t('plan.sev.' + s) : '') };
        return interactivo ? h('button', { ...at, type: 'button', onclick: () => abrirAsignacion(a) }, kids) : h('div', at, kids);
      });
      return h('section', { class: 'pl-day', 'aria-label': nombreDia(d) + ' ' + fmtCorta(f) },
        h('h4', null, h('span', null, `${nombreDia(d, 'short')} ${fmtCorta(f)}`), h('small', null, hr ? t('plan.ocupacion-corta', { pct: oc.pct }) : t('plan.cerrado'))),
        items.length ? items : h('div', { class: 'pl-empty' }, hr ? t('plan.sin-asignaciones') : t('plan.cerrado')));
    });
    return h('div', { class: 'pl-week' }, dias);
  }

  function leyenda(gs) {
    return h('ul', { class: 'pl-legend', 'aria-label': t('plan.leyenda') },
      gs.map((g) => h('li', null, h('span', { class: 'pl-sw', style: `--h:${tono(g.id)}` }), g.nombre)));
  }

  // ---------- Panel de conflictos ----------
  function panelConflictos(todos) {
    const errs = todos.filter((c) => c.severidad === 'error'), avs = todos.filter((c) => c.severidad === 'aviso'), infos = todos.filter((c) => c.severidad === 'info');
    const asigsPorId = new Map(svc.asignaciones().map((a) => [a.id, a]));
    const item = (c) => {
      const a = asigsPorId.get(c.asignaciones[0]);
      const cl = c.severidad === 'error' ? 'e' : c.severidad === 'aviso' ? 'a' : 'i';
      const accion = c.severidad === 'info'
        ? () => { piscinaId = c.piscinaId; dia = c.dia; modo = 'dia'; abrirFormulario({ piscinaId: c.piscinaId, dia: c.dia, horaInicio: c.params.horaInicio, horaFin: c.params.horaFin, calleDesde: c.params.desde, calleHasta: c.params.hasta }); }
        : () => { if (a) { piscinaId = a.piscinaId; abrirFormulario(a); } };
      return h('li', { class: cl }, h('button', { type: 'button', onclick: accion }, iconoSev(c.severidad), h('span', null, mensajeConflicto(c))));
    };
    return h('section', { class: 'card pl-panel', 'aria-labelledby': 'pl-panel-h' },
      h('h3', { id: 'pl-panel-h' }, t('plan.panel.titulo')),
      !errs.length && !avs.length ? h('div', { class: 'pl-note ok' }, icon('check', { size: 16 }), ' ', t('plan.panel.vacio')) : null,
      errs.length ? h('div', null, h('strong', null, t('plan.panel.errores') + ` (${errs.length})`), h('ul', { class: 'pl-clist' }, errs.map(item))) : null,
      avs.length ? h('div', null, h('strong', null, t('plan.panel.avisos') + ` (${avs.length})`), h('ul', { class: 'pl-clist' }, avs.map(item))) : null,
      infos.length ? h('details', null, h('summary', null, t('plan.panel.huecos') + ` (${infos.length})`), h('ul', { class: 'pl-clist' }, infos.map(item))) : null);
  }

  // ---------- Pantalla ----------
  function draw() {
    const pools = svc.piscinas();
    const editar = canEdit();
    if (!pools.some((p) => p.id === piscinaId)) piscinaId = pools.length ? pools[0].id : '';
    const pool = pools.find((p) => p.id === piscinaId);

    if (!pool) {
      container.replaceChildren(h('h2', null, t('plan.titulo')), h('div', { class: 'card' },
        h('p', null, editar ? t('plan.sin-piscinas') : t('plan.sin-piscinas-lectura')),
        editar ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => abrirConfig(null) }, icon('mas', { size: 16 }), t('plan.crear-piscina')) : null));
      return;
    }

    const grupoFiltro = miGrupo();
    const todas = svc.asignaciones(pool.id);
    const visibles = grupoFiltro ? todas.filter((a) => a.grupoId === grupoFiltro) : todas;
    const globales = editar ? svc.conflictos({ huecos: true }) : [];
    const sev = D.severidadPorAsignacion(globales);
    const resumen = D.resumenConflictos(globales);
    const gsLey = grupos().filter((g) => (grupoFiltro ? g.id === grupoFiltro : true));

    const poolSel = h('select', { 'aria-label': t('plan.piscina'), onchange: (e) => { piscinaId = e.target.value; draw(); } },
      pools.map((p) => h('option', { value: p.id, selected: p.id === piscinaId }, `${p.nombre} (${p.longitudM} m)`)));
    const finSemana = D.sumarDias(semana, 6);
    const irSemana = (n) => { semana = D.sumarDias(semana, n * 7); draw(); };
    const chip = editar
      ? h('a', { class: 'pl-chip ' + (resumen.error ? 'err' : resumen.aviso ? 'warn' : 'ok'), href: '#pl-panel-h', onclick: (e) => { e.preventDefault(); document.getElementById('pl-panel-h')?.scrollIntoView?.({ block: 'center' }); } },
        iconoSev(resumen.error ? 'error' : resumen.aviso ? 'aviso' : 'info'),
        resumen.error || resumen.aviso ? t('plan.conflictos-resumen', { errores: resumen.error, avisos: resumen.aviso }) : t('plan.sin-conflictos'))
      : null;

    const barra = h('div', { class: 'pl-bar' },
      poolSel,
      editar ? h('button', { class: 'btn', type: 'button', onclick: () => abrirConfig(pool) }, icon('ajustes', { size: 16 }), t('plan.configurar')) : null,
      editar ? h('button', { class: 'btn', type: 'button', onclick: () => abrirConfig(null) }, icon('mas', { size: 16 }), t('plan.nueva-piscina')) : null,
      h('span', { class: 'grow' }), chip);
    const barra2 = h('div', { class: 'pl-bar' },
      h('div', { class: 'pl-seg', role: 'group', 'aria-label': t('plan.modo') },
        h('button', { type: 'button', 'aria-pressed': modo === 'dia' ? 'true' : 'false', onclick: () => { modo = 'dia'; draw(); } }, t('plan.modo.dia')),
        h('button', { type: 'button', 'aria-pressed': modo === 'semana' ? 'true' : 'false', onclick: () => { modo = 'semana'; draw(); } }, t('plan.modo.semana'))),
      h('button', { class: 'btn', type: 'button', 'aria-label': t('plan.semana-anterior'), onclick: () => irSemana(-1) }, icon('flecha-izq', { size: 16 })),
      h('strong', { 'aria-live': 'polite' }, t('plan.semana-de', { desde: fmtCorta(semana), hasta: fmtCorta(finSemana) })),
      h('button', { class: 'btn', type: 'button', 'aria-label': t('plan.semana-siguiente'), onclick: () => irSemana(1) }, icon('flecha-dcha', { size: 16 })),
      h('button', { class: 'btn', type: 'button', onclick: () => { semana = D.lunesDe(hoy); dia = D.diaDeFecha(hoy); draw(); } }, t('plan.hoy')),
      h('span', { class: 'grow' }),
      editar ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => abrirFormulario({ piscinaId: pool.id, dia }) }, icon('mas', { size: 16 }), t('plan.nueva-asignacion')) : null,
      editar ? h('button', { class: 'btn', type: 'button', onclick: () => abrirSugerencia(pool) }, icon('estrella', { size: 16 }), t('plan.sugerir')) : null,
      h('button', { class: 'btn', type: 'button', onclick: () => window.print() }, icon('descargar', { size: 16 }), t('plan.imprimir')));

    const pantalla = [barra, barra2];
    if (!editar) pantalla.push(h('p', { class: 'hint' }, t('plan.solo-lectura')));

    if (modo === 'dia') {
      const tabs = h('div', { class: 'pl-tabs', role: 'tablist', 'aria-label': t('plan.dias') },
        D.DIAS.map((d) => h('button', {
          type: 'button', role: 'tab', 'aria-selected': d === dia ? 'true' : 'false', class: 'pl-tab' + (pool.horario[d] ? '' : ' pl-closed-day'),
          onclick: () => { dia = d; draw(); },
        }, h('span', null, nombreDia(d, 'short')), h('small', null, fmtCorta(fechaDelDia(d))))));
      pantalla.push(tabs);
      const { grid, doy, sinSitio, abre, cierra } = rejillaDia(pool, visibles, sev);
      const oc = D.ocupacion(pool, doy, abre, cierra);
      pantalla.push(h('div', { class: 'pl-meta' }, Number.isNaN(abre) ? t('plan.dia-cerrado') : t('plan.ocupacion', { pct: oc.pct, horario: `${pool.horario[dia].abre}–${pool.horario[dia].cierra}` })));
      const primero = doy.filter((a) => !Number.isNaN(a.ini)).reduce((m, a) => Math.min(m, a.ini), Infinity);
      const rangoIni = D.rangoDia(pool, dia, doy).desde;
      pantalla.push(h('div', { class: 'pl-gridwrap', dataset: Number.isFinite(primero) ? { scroll: Math.max(0, Math.floor((primero - rangoIni) / pool.intervaloMin) * 26 - 8) } : {} }, grid));
      if (sinSitio.length) pantalla.push(h('div', { class: 'pl-note err', role: 'alert' }, t('plan.fuera-rango-aviso'), h('ul', null, sinSitio.map((a) => h('li', null, h('button', { class: 'btn-link', type: 'button', onclick: () => abrirAsignacion(a) }, descripcionBloque(a)))))));
    } else {
      pantalla.push(semanaEl(pool, visibles, sev, true));
    }
    pantalla.push(leyenda(gsLey));

    const imprimible = h('div', { class: 'pl-print' },
      h('h2', null, `${pool.nombre} · ${t('plan.semana-de', { desde: fmtCorta(semana), hasta: fmtCorta(finSemana) })}`),
      semanaEl(pool, visibles, new Map(), false), leyenda(gsLey));

    container.replaceChildren(
      h('h2', { class: 'pl-screen' }, t('plan.titulo')),
      h('div', { class: 'pl-screen' }, pantalla),
      editar ? h('div', { class: 'pl-screen' }, panelConflictos(globales)) : null,
      imprimible);

    const wrap = container.querySelector('.pl-gridwrap');
    if (wrap && wrap.dataset.scroll) wrap.scrollTop = Number(wrap.dataset.scroll);
    if (ultimoFoco) {
      const el = container.querySelector(`[data-id="${CSS_escape(ultimoFoco)}"]`);
      ultimoFoco = null;
      el?.focus?.();
    }
  }
  const CSS_escape = (s) => String(s).replace(/["\\]/g, '\\$&');

  draw();
  if (store.on) {
    const off = store.on(() => { if (container.isConnected) draw(); else if (typeof off === 'function') off(); });
    return off;
  }
}
