// Vista Temporada (apartado de Planificación): fases, semanas, previsto vs real, eventos, gráficos y ajustes.
// Sólo presenta: la lógica está en js/domain/temporada.js y la orquestación en js/application/temporadaService.js.
// Vocabulario: macrociclo = Fase, microciclo = Semana (lunes a domingo).
import { t, tNum, tContenido, tEstado } from '../i18n.js';
import { icon } from '../icons.js';
import * as D from '../domain/temporada.js';
import { CATEGORIAS } from '../schema.js';
import { crearTemporadaService } from '../application/temporadaService.js';
import * as G from './temporada-grafico.js';

const CSS = `
.tp-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}
.tp-bar .grow{flex:1}
.tp-bar select{width:auto;max-width:100%}
.tp-bar label{display:inline-flex;gap:6px;align-items:center;font-size:.85rem;color:var(--muted)}
.tp-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:0 0 12px}
.tp-card{background:#fff;border:1px solid var(--border);border-radius:12px;padding:8px 10px;min-width:0}
.tp-card dt{font-size:.75rem;color:var(--muted);margin:0}
.tp-card dd{margin:2px 0 0;font-weight:700;font-size:1.05rem;overflow-wrap:anywhere}
.tp-card dd small{display:block;font-weight:400;color:var(--muted);font-size:.78rem}
.tp-sec{margin:16px 0}
.tp-sec>h3{margin:0 0 8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.tp-sec>h3 .grow{flex:1}
.tp-note{border-radius:10px;padding:.5rem .7rem;margin:6px 0;font-size:.88rem;display:flex;gap:8px;align-items:flex-start}
.tp-note.err{background:#fdecea;color:#8c1d18}
.tp-note.warn{background:#fff4de;color:#7a4b00}
.tp-note.info{background:#e8f1fd;color:#0b3d91}
.tp-note.ok{background:#e6f6ed;color:#14683b}
.tp-note .icon{flex:none;margin-top:2px}
.tp-note ul{margin:4px 0 0;padding-left:1.1rem}
.tp-chip{display:inline-flex;align-items:center;gap:.3rem;border-radius:999px;padding:.1rem .6rem;font-size:.8rem;border:1px solid var(--border);background:#fff;white-space:nowrap}
.tp-e-en-rango{border-color:var(--ok);color:#14683b}
.tp-e-bajo{border-color:var(--warn);color:#7a4b00}
.tp-e-alto{border-color:var(--danger);color:#8c1d18}
.tp-e-pendiente,.tp-e-en-curso,.tp-e-sin-previsto{color:var(--muted)}
.tp-fases{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px}
.tp-fase{border:1px solid var(--border);border-left:6px solid var(--fc,#6f7785);border-radius:12px;background:#fff;padding:8px 10px;display:flex;flex-direction:column;gap:3px;min-width:0}
.tp-fase.tp-fase-act{box-shadow:0 0 0 2px var(--c-primary)}
.tp-fase h4{margin:0;font-size:.98rem;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.tp-fase p{margin:0;font-size:.82rem;color:var(--muted)}
.tp-fase .tp-acc{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.tp-btn-s{font:inherit;font-size:.82rem;padding:.25rem .6rem;border-radius:9px;border:1px solid var(--border);background:#fff;cursor:pointer;display:inline-flex;gap:4px;align-items:center}
.tp-btn-s:hover{background:var(--c-primary-soft)}
.tp-btn-s.danger{color:var(--danger)}
.tp-zoom{display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-bottom:8px}
.tp-zoom label{display:flex;flex-direction:column;font-size:.78rem;color:var(--muted);gap:2px}
.tp-zoom select{width:auto}
.tp-scroll{overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:#fff;padding:6px}
.tp-scroll:focus-visible{outline:2px solid var(--c-primary)}
.tp-grafico{position:relative;min-width:max-content}
.tp-svg{display:block;max-width:none}
.tp-svg text{font-size:11px;fill:#33415a;font-family:inherit}
.tp-svg .tp-eje{fill:#5b6b7f;font-size:10px}
.tp-svg .tp-eje-n{font-weight:700;fill:#33415a}
.tp-svg .tp-eje-a{font-weight:700}
.tp-svg .tp-fase-t,.tp-svg-tl .tp-fase-t{font-size:11px;font-weight:700;fill:#1f2a3a}
.tp-svg .tp-marca-t,.tp-svg-tl .tp-marca-t{fill:#fff;font-size:10px;font-weight:800}
.tp-svg .tp-marca-s,.tp-svg-tl .tp-marca-s{font-size:8.5px;font-weight:700}
.tp-svg .tp-grid,.tp-svg-tl .tp-grid{stroke:#e3e8f0;stroke-width:1}
.tp-svg .tp-eje-l{stroke:#8a96a8;stroke-width:1}
.tp-svg .tp-previsto{fill:none;stroke:#1f2a3a;stroke-width:2.2}
.tp-svg .tp-previsto-p{fill:#fff;stroke:#1f2a3a;stroke-width:2}
.tp-svg .tp-hoy{fill:var(--c-primary);fill-opacity:.1;stroke:var(--c-primary);stroke-width:1.5;stroke-dasharray:4 3}
.tp-svg .tp-hoy-t,.tp-svg-tl .tp-hoy-t{fill:var(--c-primary-dark);font-weight:700;font-size:10px}
.tp-svg .tp-evento-l{stroke:#b3261e;stroke-width:1.2;stroke-dasharray:3 3}
.tp-svg .tp-evento{cursor:pointer}
.tp-svg .tp-evento:focus-visible{outline:2px solid var(--c-primary)}
.tp-svg .tp-col{cursor:pointer;outline:none}
.tp-svg .tp-col-r{fill:transparent;stroke:transparent}
.tp-svg .tp-col:hover .tp-col-r,.tp-svg .tp-col:focus .tp-col-r{fill:rgba(31,42,58,.06);stroke:#1f2a3a;stroke-width:1.5}
.tp-svg .tp-col-sel .tp-col-r{stroke:var(--c-primary);stroke-width:2.5;fill:rgba(26,115,232,.07)}
.tp-svg-tl{display:block;width:100%;height:auto;max-width:900px}
.tp-svg-tl text{font-size:10px;fill:#33415a;font-family:inherit}
.tp-svg-tl .tp-eje{fill:#5b6b7f}
.tp-svg-tl .tp-tl-hoy{stroke:var(--c-primary);stroke-width:2;stroke-dasharray:4 3}
.tp-svg-tl .tp-evento{cursor:pointer}
.tp-tip{position:absolute;top:60px;z-index:5;width:180px;background:#1f2a3a;color:#fff;border-radius:8px;padding:6px 8px;font-size:.78rem;pointer-events:none;box-shadow:var(--shadow)}
.tp-tip strong{display:block}
.tp-ley{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-wrap:wrap;gap:4px 14px;font-size:.8rem}
.tp-ley-i{display:inline-flex;align-items:center;gap:5px}
.tp-sw{width:13px;height:13px;border-radius:3px;border:1px solid rgba(0,0,0,.25);display:inline-block}
.tp-sw-hatch{background:repeating-linear-gradient(45deg,#d6dbe3 0 3px,#7b8594 3px 5px)}
.tp-sw-dash{background:#fff;border:1px dashed #1f2a3a}
.tp-sw-linea{width:22px;height:0;border-top:2.2px solid #1f2a3a;display:inline-block}
.tp-insignia .tp-marca-t{fill:#fff;font-size:9px;font-weight:800}
.tp-insignia .tp-marca-s{font-size:7px}
.tp-tablawrap{overflow-x:auto;border:1px solid var(--border);border-radius:12px;background:#fff}
.tp-tabla{border-collapse:collapse;width:100%;font-size:.86rem}
.tp-tabla caption{text-align:left;padding:6px 10px;color:var(--muted);font-size:.8rem}
.tp-tabla th,.tp-tabla td{padding:5px 8px;border-top:1px solid var(--border);text-align:left;vertical-align:middle}
.tp-tabla th{background:#f6f8fc;font-size:.78rem;color:var(--c-secondary);position:sticky;top:0}
.tp-tabla td.num,.tp-tabla th.num{text-align:right;white-space:nowrap}
.tp-tabla tr.tp-sel{background:var(--c-primary-soft)}
.tp-tabla tr.tp-act td:first-child{box-shadow:inset 4px 0 0 var(--c-primary)}
.tp-sem-btn{font:inherit;font-weight:700;border:1px solid var(--border);background:#fff;border-radius:8px;padding:.1rem .5rem;cursor:pointer;min-width:2.2rem}
.tp-sem-btn[aria-pressed=true]{background:var(--c-primary);border-color:var(--c-primary);color:#fff}
.tp-fdot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:baseline}
.tp-evchip{display:inline-flex;align-items:center;gap:2px;font-size:.78rem;margin-right:6px;white-space:nowrap}
.tp-lista{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.tp-wk{width:100%;text-align:left;font:inherit;background:#fff;border:1px solid var(--border);border-radius:12px;padding:8px 10px;cursor:pointer;display:flex;flex-direction:column;gap:5px}
.tp-wk[aria-pressed=true]{border-color:var(--c-primary);box-shadow:0 0 0 2px var(--c-primary)}
.tp-wk.tp-act{background:var(--c-primary-soft)}
.tp-wk-top{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.tp-wk-top strong{font-size:1rem}
.tp-pista{position:relative;height:14px;background:#eef2f7;border-radius:6px;overflow:hidden;display:flex}
.tp-pista i{display:block;height:100%}
.tp-pista b{position:absolute;top:-2px;bottom:-2px;width:3px;background:#1f2a3a}
.tp-wk-num{font-size:.82rem;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.tp-det{background:#fff;border:1px solid var(--border);border-radius:14px;padding:10px 12px}
.tp-det h3{margin:0 0 6px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tp-det h4{margin:12px 0 6px;font-size:.95rem}
.tp-det-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:0}
.tp-det-grid div{background:#f6f8fc;border-radius:10px;padding:6px 8px}
.tp-det-grid dt{font-size:.74rem;color:var(--muted);margin:0}
.tp-det-grid dd{margin:0;font-weight:700}
.tp-mini{position:relative;height:10px;min-width:90px;background:#eef2f7;border-radius:5px;overflow:hidden}
.tp-mini i{position:absolute;left:0;top:0;bottom:0}
.tp-mini b{position:absolute;top:0;bottom:0;width:2px;background:#1f2a3a}
.tp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:5px}
.tp-list li{display:flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid var(--border);border-radius:10px;padding:5px 8px;background:#fff}
.tp-list li .grow{flex:1;min-width:140px}
.tp-list small{color:var(--muted)}
.tp-herr{display:flex;flex-wrap:wrap;gap:6px}
.tp-sug{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.tp-sug li{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;border:1px solid var(--border);border-left:5px solid var(--warn);border-radius:10px;background:#fff;padding:6px 10px}
.tp-sug li.info{border-left-color:var(--c-primary)}
.tp-sug li p{margin:0;flex:1;min-width:200px;font-size:.9rem}
.tp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.7rem .9rem}
.tp-form .full{grid-column:1/-1}
.tp-form label{display:flex;flex-direction:column;gap:.2rem;font-size:.85rem;font-weight:600;color:var(--muted)}
.tp-form label.check{flex-direction:row;align-items:center;gap:8px;font-weight:400;color:var(--text)}
.tp-form label.check input{width:auto}
.tp-cont{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px 10px;margin-top:6px}
.tp-cont label{flex-direction:row;align-items:center;gap:6px;font-weight:400;color:var(--text)}
.tp-cont input{width:6.5rem}
.tp-vacio{color:var(--muted);font-size:.9rem}
.tp-prev{margin-top:8px;max-height:36vh;overflow:auto}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (max-width:820px){
  .modal-overlay.tp-sheet{place-items:end center;padding:0}
  .tp-sheet .modal{border-radius:16px 16px 0 0;max-height:92vh}
  .tp-form{grid-template-columns:1fr}
}
`;

function injectStyle() {
  if (document.getElementById('tp-style')) return;
  const s = document.createElement('style');
  s.id = 'tp-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const ICONO_ESTADO = { 'en-rango': 'check', bajo: 'flecha-abajo', alto: 'flecha-arriba', pendiente: 'reloj', 'en-curso': 'reloj', 'sin-previsto': 'info' };
const esMovil = () => typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 700px)').matches;

export async function render(container, params, ctx) {
  const { store, ui } = ctx;
  const h = ui.h;
  injectStyle();
  const toast = (m) => ui.toast(m);
  const svc = crearTemporadaService(store, { nombreFase: (tp) => t('tp.fase.' + tp), ahora: ctx.ahora });
  const st = { tid: '', fuente: 'auto', sel: 0, desde: 1, hasta: 0, scroll: false, rangoFijado: false };
  const act = svc.activa();
  if (act) st.tid = act.id;
  let modelo = null;

  // ---------- Utilidades de presentación ----------
  const contenidoNombre = (id) => { const x = modelo.tipos.find((c) => c.id === id); return x ? tContenido(x) : id; };
  const chipEstado = (e) => h('span', { class: 'tp-chip tp-e-' + e }, icon(ICONO_ESTADO[e] || 'info', { size: 13 }), G.textoEstado(e));
  const puntoFase = (f) => h('span', { class: 'tp-fdot', style: { background: f ? f.color : '#c9d1dc' }, 'aria-hidden': 'true' });
  const chipEvento = (e) => h('span', { class: 'tp-evchip', title: `${e.nombre} · ${G.nombrePrioridad(e)}` }, G.insigniaEvento(e, h), h('span', null, e.nombre));
  const btn = (txt, ic, fn, cls = 'tp-btn-s', extra = {}) => h('button', { type: 'button', class: cls, onclick: fn, ...extra }, ic ? icon(ic, { size: 14 }) : null, txt);
  function abrirModal(opts) { const m = ui.modal(opts); m.el.classList.add('tp-sheet'); return m; }
  const nota = (cls, ic, ...hijos) => h('div', { class: 'tp-note ' + cls, role: cls === 'err' ? 'alert' : null }, icon(ic, { size: 16 }), h('div', null, hijos));
  const mensajeError = (e) => t('tp.err.' + e.codigo);

  function redibujar() {
    if (redibujar.pend) return;
    redibujar.pend = true;
    Promise.resolve().then(() => { redibujar.pend = false; if (container.isConnected) draw(); });
  }

  // ---------- Formularios ----------
  // Control de un campo de formFields (uno por campo, en el orden de la definición).
  function control(form, nombre, def) { return form.el.querySelectorAll('input,select,textarea')[def.findIndex((d) => d.name === nombre)]; }
  function opcionesSemana(m) { return m.semanas.map((s) => ({ value: s.n, label: `${t('tp.semana-n', { n: s.n })} · ${G.fmtCorta(s.lunes)}` })); }

  function abrirTemporada(base) {
    const esNueva = !base;
    const hoy = svc.hoy();
    const y = +hoy.slice(0, 4), anio = +hoy.slice(5, 7) >= 9 ? y : y - 1;
    let ini = D.lunesDe(`${anio}-09-01`);
    if (ini < `${anio}-09-01`) ini = D.addDias(ini, 7);
    const v = base || { nombre: `${t('tp.temporada')} ${anio}-${String(anio + 1).slice(2)}`, inicio: ini, fin: D.addDias(ini, 7 * 38 - 1), grupoId: '', notas: '', activa: !svc.temporadas().length };
    const def = [
      { name: 'nombre', label: t('tp.f.nombre'), type: 'text', required: true, full: true },
      { name: 'inicio', label: t('tp.f.inicio'), type: 'date', required: true },
      { name: 'fin', label: t('tp.f.fin'), type: 'date', required: true },
      { name: 'grupoId', label: t('tp.f.grupo'), type: 'select', options: [{ value: '', label: t('tp.f.todos-grupos') }, ...svc.grupos().map((g) => ({ value: g.id, label: g.nombre }))], full: true },
      { name: 'notas', label: t('tp.f.notas'), type: 'textarea' },
      { name: 'activa', label: t('tp.f.activa'), type: 'checkbox' },
      ...(esNueva ? [{ name: 'conFases', label: t('tp.f.con-fases'), type: 'checkbox', default: true }] : []),
    ];
    const form = ui.formFields(def, { ...v, conFases: true });
    form.el.classList.add('tp-form');
    const err = h('div', { 'aria-live': 'polite' });
    const acciones = [{ label: t('common.cancelar') }];
    if (!esNueva) {
      acciones.push({
        label: t('common.eliminar'), danger: true,
        onClick: async () => {
          if (!(await ui.confirmDialog(t('tp.temporada.eliminar-confirm', { nombre: v.nombre }), { danger: true, okLabel: t('common.eliminar') }))) return false;
          svc.borrarTemporada(v.id);
          const a = svc.activa();
          st.tid = a ? a.id : ''; st.rangoFijado = false; st.sel = 0;
          toast(t('tp.temporada.eliminada'));
          redibujar();
        },
      });
    }
    acciones.push({
      label: t('common.guardar'), primary: true,
      onClick: () => {
        if (!form.validate()) return false;
        const val = form.values();
        const r = svc.guardarTemporada({ ...val, id: esNueva ? '' : v.id }, { conFases: !!val.conFases });
        if (!r.ok) { err.replaceChildren(nota('err', 'aviso', r.errores.map(mensajeError).join(' '))); return false; }
        st.tid = r.temporada.id; st.rangoFijado = false; st.sel = 0;
        toast(t('tp.temporada.guardada'));
        redibujar();
        return true;
      },
    });
    abrirModal({ title: esNueva ? t('tp.temporada.nueva') : t('tp.temporada.editar'), body: h('div', null, form.el, err), actions: acciones });
  }

  function abrirFase(base) {
    const m = modelo;
    const esNueva = !base || !base.id;
    // Propuesta de fechas: el primer hueco sin fase; si no lo hay, desde la semana seleccionada.
    const hueco = m.validaciones.find((x) => x.tipo === 'hueco-fases');
    const sem = m.semanas.find((s) => s.n === st.sel) || m.semanas[0];
    const ini = hueco ? hueco.params.desde : sem.lunes;
    let fin = D.addDias(ini, 27);
    if (hueco && fin > hueco.params.hasta) fin = hueco.params.hasta;
    if (fin > m.temporada.fin) fin = m.temporada.fin;
    const v = base && base.id ? base : { nombre: '', tipo: 'preparacion-general', inicio: ini, fin, objetivo: '', color: D.COLOR_FASE['preparacion-general'], ...(base || {}) };
    const def = [
      { name: 'nombre', label: t('tp.f.nombre'), type: 'text', required: true, full: true },
      { name: 'tipo', label: t('tp.f.tipo-fase'), type: 'select', options: D.TIPOS_FASE.map((x) => ({ value: x, label: t('tp.fase.' + x) })) },
      { name: 'color', label: t('tp.f.color'), type: 'color' },
      { name: 'inicio', label: t('tp.f.inicio'), type: 'date', required: true },
      { name: 'fin', label: t('tp.f.fin'), type: 'date', required: true },
      { name: 'objetivo', label: t('tp.f.objetivo'), type: 'textarea' },
    ];
    const form = ui.formFields(def, v);
    form.el.classList.add('tp-form');
    const campo = (n) => control(form, n, def);
    campo('tipo').addEventListener('change', () => {
      const prev = D.COLOR_FASE[v.tipo];
      if (!campo('color').dataset.tocado || campo('color').value === prev) campo('color').value = D.COLOR_FASE[campo('tipo').value];
      if (!campo('nombre').value.trim() || D.TIPOS_FASE.some((x) => t('tp.fase.' + x) === campo('nombre').value)) campo('nombre').value = t('tp.fase.' + campo('tipo').value);
    });
    campo('color').addEventListener('input', () => { campo('color').dataset.tocado = '1'; });
    const estado = h('div', { 'aria-live': 'polite' });
    let forzar = false;
    let guardarBtn = null;
    const acciones = [{ label: t('common.cancelar') }];
    if (!esNueva) {
      acciones.push({
        label: t('common.eliminar'), danger: true,
        onClick: async () => {
          if (!(await ui.confirmDialog(t('tp.fase.eliminar-confirm', { nombre: v.nombre }), { danger: true, okLabel: t('common.eliminar') }))) return false;
          svc.borrarFase(v.id); toast(t('tp.fase.eliminada')); redibujar();
        },
      });
    }
    acciones.push({
      label: t('common.guardar'), primary: true,
      onClick: () => {
        if (!form.validate()) return false;
        const r = svc.guardarFase({ ...form.values(), id: esNueva ? '' : v.id, temporadaId: m.temporada.id, orden: esNueva ? undefined : v.orden }, { forzar });
        if (r.ok) { toast(t('tp.fase.guardada')); if (r.avisos.length) toast(t('tp.v.fase-fuera-temporada', { fase: r.fase.nombre })); redibujar(); return true; }
        if (r.errores) estado.replaceChildren(nota('err', 'aviso', r.errores.map(mensajeError).join(' ')));
        else if (r.requiereForzar) {
          estado.replaceChildren(nota('warn', 'aviso', t('tp.fase.solapa'), h('ul', null, r.conflictos.map((c) => h('li', null, c.fase)))));
          forzar = true; guardarBtn.textContent = t('tp.guardar-igualmente');
        }
        return false;
      },
    });
    const mo = abrirModal({ title: esNueva ? t('tp.fase.nueva') : t('tp.fase.editar'), body: h('div', null, form.el, estado), actions: acciones });
    guardarBtn = mo.el.querySelector('.modal-actions .btn-primary');
    form.el.addEventListener('input', () => { forzar = false; guardarBtn.textContent = t('common.guardar'); });
  }

  function abrirEvento(base) {
    const m = modelo;
    const esNueva = !base || !base.id;
    const sem = m.semanas.find((s) => s.n === st.sel) || m.semanas[0];
    const sab = D.addDias(sem.lunes, 5);
    const v = base && base.id ? base : { tipo: 'competicion', nombre: '', inicio: sab > m.temporada.fin ? m.temporada.fin : sab, fin: '', lugar: '', prioridad: 'C', pruebas: '', categoria: '', grupoId: m.temporada.grupoId, notas: '', ...(base || {}) };
    const def = [
      { name: 'tipo', label: t('tp.f.tipo-evento'), type: 'select', options: D.TIPOS_EVENTO.map((x) => ({ value: x, label: t('tp.evento.' + x) })) },
      { name: 'prioridad', label: t('tp.f.prioridad'), type: 'select', options: [{ value: '', label: '—' }, ...D.PRIORIDADES.map((p) => ({ value: p, label: t('tp.prioridad-n', { p }) }))] },
      { name: 'nombre', label: t('tp.f.nombre'), type: 'text', required: true, full: true },
      { name: 'inicio', label: t('tp.f.inicio'), type: 'date', required: true },
      { name: 'fin', label: t('tp.f.fin-opc'), type: 'date' },
      { name: 'lugar', label: t('tp.f.lugar'), type: 'text', full: true },
      { name: 'pruebas', label: t('tp.f.pruebas'), type: 'text', full: true },
      { name: 'categoria', label: t('tp.f.categoria'), type: 'select', options: [{ value: '', label: '—' }, ...CATEGORIAS.map((c) => ({ value: c, label: c }))] },
      { name: 'grupoId', label: t('tp.f.grupo'), type: 'select', options: [{ value: '', label: t('tp.f.todos-grupos') }, ...svc.grupos().map((g) => ({ value: g.id, label: g.nombre }))] },
      { name: 'notas', label: t('tp.f.notas'), type: 'textarea' },
    ];
    const form = ui.formFields(def, v);
    form.el.classList.add('tp-form');
    const estado = h('div', { 'aria-live': 'polite' });
    const acciones = [{ label: t('common.cancelar') }];
    if (!esNueva) {
      acciones.push({
        label: t('common.eliminar'), danger: true,
        onClick: async () => {
          if (!(await ui.confirmDialog(t('tp.ev.eliminar-confirm', { nombre: v.nombre }), { danger: true, okLabel: t('common.eliminar') }))) return false;
          svc.borrarEvento(v.id); toast(t('tp.ev.eliminado')); redibujar();
        },
      });
    }
    acciones.push({
      label: t('common.guardar'), primary: true,
      onClick: () => {
        if (!form.validate()) return false;
        const r = svc.guardarEvento({ ...form.values(), id: esNueva ? '' : v.id, temporadaId: m.temporada.id });
        if (!r.ok) { estado.replaceChildren(nota('err', 'aviso', r.errores.map(mensajeError).join(' '))); return false; }
        toast(t('tp.ev.guardado'));
        if (r.avisos.length) toast(t('tp.v.evento-fuera-temporada', { evento: r.evento.nombre, desde: G.fmtCorta(r.evento.inicio) }));
        redibujar();
        return true;
      },
    });
    abrirModal({ title: esNueva ? t('tp.ev.nuevo') : t('tp.ev.editar'), body: h('div', null, form.el, estado), actions: acciones });
  }

  function abrirSemana(s) {
    const m = modelo;
    const activos = m.tipos.filter((c) => c.activo || s.plan.contenidos[c.id]);
    const def = [
      { name: 'volumen', label: t('tp.f.volumen'), type: 'number', min: 0, step: 50 },
      { name: 'intensidad', label: t('tp.f.intensidad'), type: 'number', min: 1, max: 10, step: 1 },
      { name: 'objetivo', label: t('tp.f.objetivo'), type: 'text', full: true },
      { name: 'notas', label: t('tp.f.notas'), type: 'textarea' },
    ];
    const form = ui.formFields(def, { volumen: s.plan.volumen ?? '', intensidad: s.plan.intensidad ?? '', objetivo: s.plan.objetivo, notas: s.plan.notas });
    form.el.classList.add('tp-form');
    const inputs = new Map();
    const suma = h('p', { class: 'hint', 'aria-live': 'polite' });
    const cont = h('fieldset', { class: 'tp-cont-set' }, h('legend', null, t('tp.f.reparto')),
      h('div', { class: 'tp-cont' }, activos.map((c) => {
        const inp = h('input', { type: 'number', min: 0, step: 50, value: s.plan.contenidos[c.id] || '', 'aria-label': tContenido(c) });
        inputs.set(c.id, inp);
        return h('label', null, h('span', { class: 'tp-fdot', style: { background: c.color }, 'aria-hidden': 'true' }), h('span', null, tContenido(c)), inp);
      })), suma);
    const leer = () => Object.fromEntries([...inputs.entries()].map(([k, i]) => [k, i.value]).filter(([, v]) => String(v).trim() !== ''));
    const refrescar = () => {
      const tot = D.sumaContenidos(D.parseContenidos(leer()));
      suma.textContent = t('tp.f.suma-reparto', { m: tNum(Math.round(tot)) });
    };
    cont.addEventListener('input', refrescar);
    refrescar();
    const err = h('div', { 'aria-live': 'polite' });
    const acciones = [{ label: t('common.cancelar') }, {
      label: t('common.guardar'), primary: true,
      onClick: () => {
        const val = form.values();
        const r = svc.guardarSemana(m.temporada.id, s.lunes, { volumen: val.volumen === '' ? null : val.volumen, intensidad: val.intensidad === '' ? null : val.intensidad, objetivo: val.objetivo, notas: val.notas, contenidos: D.parseContenidos(leer()) });
        if (!r.ok) { err.replaceChildren(nota('err', 'aviso', r.errores.map(mensajeError).join(' '))); return false; }
        toast(t('tp.semana.guardada')); redibujar(); return true;
      },
    }];
    abrirModal({ title: `${t('tp.semana.editar')} ${s.n} · ${G.fmtRango(s.desde, s.hasta)}`, body: h('div', null, form.el, cont, err), actions: acciones });
  }

  function tablaCambios(cambios) {
    if (!cambios.length) return h('p', { class: 'tp-vacio' }, t('tp.herr.sin-cambios'));
    return h('div', { class: 'tp-tablawrap tp-prev' }, h('table', { class: 'tp-tabla' },
      h('caption', { class: 'sr-only' }, t('tp.herr.previa')),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('tp.semana')), h('th', { scope: 'col' }, t('tp.fechas')), h('th', { scope: 'col', class: 'num' }, t('tp.herr.antes')), h('th', { scope: 'col', class: 'num' }, t('tp.herr.despues')))),
      h('tbody', null, cambios.map((c) => h('tr', null, h('th', { scope: 'row' }, c.n), h('td', null, G.fmtCorta(c.lunes)), h('td', { class: 'num' }, c.antes > 0 ? G.fmtM(c.antes) : '—'), h('td', { class: 'num' }, c.despues > 0 ? G.fmtM(c.despues) : '—'))))));
  }

  function abrirCopiar(s) {
    const m = modelo;
    const def = [{ name: 'destino', label: t('tp.herr.copiar-a'), type: 'select', options: opcionesSemana(m).filter((o) => o.value !== s.n), full: true }];
    const form = ui.formFields(def, { destino: (m.semanas.find((x) => x.n === s.n + 1) || m.semanas[0]).n });
    form.el.classList.add('tp-form');
    abrirModal({
      title: t('tp.herr.copiar-titulo', { n: s.n }), body: h('div', null, h('p', { class: 'hint' }, t('tp.herr.copiar-ayuda')), form.el),
      actions: [{ label: t('common.cancelar') }, {
        label: t('tp.herr.copiar'), primary: true,
        onClick: () => { const r = svc.copiarSemana(m.temporada.id, s.n, Number(form.values().destino), { fuente: st.fuente }); if (!r.ok) return false; toast(t('tp.herr.copiada')); st.sel = Number(form.values().destino); redibujar(); return true; },
      }],
    });
  }

  function abrirPlantilla(fase0) {
    const m = modelo;
    if (!m.fases.length) return;
    const def = [
      { name: 'faseId', label: t('tp.herr.fase'), type: 'select', options: m.fases.map((f) => ({ value: f.id, label: f.nombre })), full: true },
      { name: 'volumenBase', label: t('tp.herr.base'), type: 'number', min: 0, step: 50, full: true },
    ];
    const form = ui.formFields(def, { faseId: (fase0 || m.fases[0]).id, volumenBase: '' });
    form.el.classList.add('tp-form');
    const campo = (n) => control(form, n, def);
    const prev = h('div', { 'aria-live': 'polite' });
    let tocado = false;
    const calc = (aplicar = false) => {
      const r = svc.plantillaFase(m.temporada.id, campo('faseId').value, { volumenBase: tocado ? Number(campo('volumenBase').value) : undefined, aplicar });
      return r;
    };
    const refrescar = () => {
      const r = calc(false);
      if (!tocado && r.ok) campo('volumenBase').value = r.volumenBase || '';
      const cambios = (r.cambios || []).map((c) => ({ n: c.n, lunes: c.lunes, antes: (m.semanas.find((s) => s.n === c.n) || { plan: {} }).plan.volumen, despues: c.volumen }));
      prev.replaceChildren(r.ok && r.volumenBase === 0 ? h('p', { class: 'tp-vacio' }, t('tp.herr.sin-base')) : tablaCambios(cambios));
    };
    campo('volumenBase').addEventListener('input', () => { tocado = true; refrescar(); });
    campo('faseId').addEventListener('change', () => { tocado = false; refrescar(); });
    refrescar();
    abrirModal({
      title: t('tp.herr.plantilla'), body: h('div', null, h('p', { class: 'hint' }, t('tp.herr.plantilla-ayuda')), form.el, prev),
      actions: [{ label: t('common.cancelar') }, {
        label: t('tp.herr.aplicar'), primary: true,
        onClick: () => { const r = calc(true); if (!r.ok) return false; toast(t('tp.herr.aplicada')); redibujar(); return true; },
      }],
    });
  }

  function abrirAjuste(s) {
    const m = modelo;
    const ops = opcionesSemana(m);
    const def = [
      { name: 'desde', label: t('tp.herr.desde'), type: 'select', options: ops },
      { name: 'hasta', label: t('tp.herr.hasta'), type: 'select', options: ops },
      { name: 'modo', label: t('tp.herr.modo'), type: 'select', options: [{ value: 'escalar', label: t('tp.herr.modo-escalar') }, { value: 'mover', label: t('tp.herr.modo-mover') }], full: true },
      { name: 'valor', label: t('tp.herr.valor'), type: 'number', step: 1, full: true },
    ];
    const form = ui.formFields(def, { desde: s.n, hasta: Math.min(m.semanas.length, s.n + 3), modo: 'escalar', valor: 10 });
    form.el.classList.add('tp-form');
    const campo = (n) => control(form, n, def);
    const prev = h('div', { 'aria-live': 'polite' });
    const calc = (aplicar) => {
      const v = form.values();
      const desde = Math.min(Number(v.desde), Number(v.hasta)), hasta = Math.max(Number(v.desde), Number(v.hasta));
      return svc.ajustarVolumen(m.temporada.id, { desde, hasta, ...(v.modo === 'mover' ? { mover: Number(v.valor) || 0 } : { pct: Number(v.valor) || 0 }), aplicar });
    };
    const refrescar = () => { campo('valor').setAttribute('aria-label', campo('modo').value === 'mover' ? t('tp.herr.valor-semanas') : t('tp.herr.valor-pct')); prev.replaceChildren(tablaCambios(calc(false).cambios.map((c) => ({ ...c, despues: c.despues })))); };
    form.el.addEventListener('input', refrescar);
    form.el.addEventListener('change', refrescar);
    refrescar();
    abrirModal({
      title: t('tp.herr.ajustar'), body: h('div', null, h('p', { class: 'hint' }, t('tp.herr.ajustar-ayuda')), form.el, prev),
      actions: [{ label: t('common.cancelar') }, {
        label: t('tp.herr.aplicar'), primary: true,
        onClick: () => { const r = calc(true); if (!r.cambios.length) return false; toast(t('tp.herr.ajustado', { n: r.cambios.length })); redibujar(); return true; },
      }],
    });
  }

  // ---------- Textos de sugerencias y validaciones ----------
  function textoSugerencia(s) {
    const p = { ...s.params, contenido: s.params.tipoId ? contenidoNombre(s.params.tipoId) : '', real: tNum(s.params.real), previsto: tNum(s.params.previsto), metros: tNum(s.params.metros), objetivo: tNum(s.params.objetivo), base: tNum(s.params.base), pct: (s.params.pct > 0 ? '+' : '') + s.params.pct, semana: s.semana };
    return t('tp.sug.' + s.codigo, p);
  }
  function textoValidacion(v) {
    const p = { ...v.params };
    ['desde', 'hasta'].forEach((k) => { if (p[k]) p[k] = G.fmtCorta(p[k]); });
    return t('tp.v.' + v.tipo, p);
  }

  async function abrirPlanEntreno(id) {
    const { abrirEditor } = await import('./entreno-editor.js');
    abrirEditor({ ctx, sesionId: id });
  }

  // ---------- Bloques ----------
  function barraSuperior(m) {
    const temporadas = svc.temporadas();
    const sel = h('select', { 'aria-label': t('tp.temporada'), onchange: (e) => { st.tid = e.target.value; st.rangoFijado = false; st.sel = 0; draw(); } },
      temporadas.map((x) => h('option', { value: x.id, selected: x.id === st.tid }, `${x.nombre}${x.activa ? ' · ' + t('tp.activa') : ''}`)));
    const fuente = h('select', { 'aria-label': t('tp.fuente-real'), onchange: (e) => { st.fuente = e.target.value; draw(); } },
      ['auto', 'planes', 'cargas'].map((f) => h('option', { value: f, selected: f === st.fuente }, t('tp.fuente-op.' + f))));
    return h('div', { class: 'tp-bar' }, sel,
      btn(t('tp.temporada.editar'), 'editar', () => abrirTemporada(m.temporada), 'btn'),
      btn(t('tp.temporada.nueva'), 'mas', () => abrirTemporada(null), 'btn'),
      !m.temporada.activa ? btn(t('tp.temporada.activar'), 'check', () => { svc.activar(m.temporada.id); toast(t('tp.temporada.activada')); redibujar(); }, 'btn') : null,
      h('span', { class: 'grow' }),
      h('label', null, t('tp.fuente-real'), fuente));
  }

  function resumenCards(m) {
    const tt = m.totales.total;
    const actual = m.semanas.find((s) => s.tiempo === 'actual');
    const fase = actual ? actual.fase : null;
    const card = (k, v, sub) => h('div', { class: 'tp-card' }, h('dt', null, k), h('dd', null, v, sub ? h('small', null, sub) : null));
    const prox = m.proxima;
    return h('dl', { class: 'tp-cards' },
      card(t('tp.card.semanas'), String(m.semanas.length), actual ? t('tp.card.semana-actual', { n: actual.n }) : (m.hoy < m.temporada.inicio ? t('tp.card.no-empezada') : t('tp.card.terminada'))),
      card(t('tp.card.fase-actual'), fase ? fase.nombre : '—', fase ? t('tp.fase.' + fase.tipo) : ''),
      card(t('tp.card.previsto'), G.fmtM(tt.previsto), t('tp.card.previsto-hoy', { m: G.fmtM(tt.previstoHastaHoy) })),
      card(t('tp.card.real'), G.fmtM(tt.real), h('span', null, G.fmtPct(tt.desv.pct), ' · ', G.textoEstado(tt.desv.estado))),
      card(t('tp.card.proxima'), prox ? prox.nombre : '—', prox ? `${G.nombrePrioridad(prox)} · ${G.fmtCorta(prox.inicio)}` : t('tp.sin-eventos')));
  }

  function panelAvisos(m) {
    const v = m.validaciones.filter((x) => x.severidad !== 'info');
    const info = m.validaciones.filter((x) => x.severidad === 'info');
    if (!v.length && !info.length) return null;
    return h('div', { class: 'tp-sec', 'aria-label': t('tp.v.titulo'), role: 'region' },
      v.map((x) => nota(x.severidad === 'error' ? 'err' : 'warn', 'aviso', h('strong', null, t('tp.v.sev.' + x.severidad) + ': '), textoValidacion(x))),
      info.map((x) => nota('info', 'info', textoValidacion(x))));
  }

  function panelSugerencias(m, filtroN) {
    const lista = filtroN ? m.sugerencias.filter((s) => s.semana === filtroN && s.codigo !== 'sin-previsto') : m.sugerencias;
    if (!lista.length) return filtroN ? null : h('p', { class: 'tp-vacio' }, t('tp.sug.ninguna'));
    return h('ul', { class: 'tp-sug' }, lista.map((s) => h('li', { class: s.severidad, 'data-sug': s.codigo },
      icon(s.severidad === 'info' ? 'info' : 'estrella', { size: 18 }),
      h('p', null, textoSugerencia(s)),
      s.accion ? btn(t('tp.sug.aplicar'), 'check', () => { const r = svc.aplicarSugerencia(m.temporada.id, s); if (r.ok) { toast(t('tp.sug.aplicada')); st.sel = s.semana; redibujar(); } }) : null,
      s.semana && !filtroN ? btn(t('tp.sug.ver', { n: s.semana }), 'ojo', () => seleccionar(s.semana, true)) : null,
      s.codigo === 'sin-previsto' ? btn(t('tp.herr.plantilla'), 'documento', () => abrirPlantilla()) : null)));
  }

  function seccionFases(m) {
    const tot = new Map(m.totales.fases.filter((x) => x.fase).map((x) => [x.fase.id, x]));
    const actual = m.semanas.find((s) => s.tiempo === 'actual');
    return h('section', { class: 'tp-sec', 'aria-labelledby': 'tp-h-fases' },
      h('h3', { id: 'tp-h-fases' }, t('tp.fases'), h('span', { class: 'grow' }), btn(t('tp.fase.nueva'), 'mas', () => abrirFase(null), 'btn')),
      m.fases.length ? h('ul', { class: 'tp-fases' }, m.fases.map((f) => {
        const x = tot.get(f.id);
        const nSem = m.semanas.filter((s) => s.fase && s.fase.id === f.id).length;
        return h('li', { class: 'tp-fase' + (actual && actual.fase && actual.fase.id === f.id ? ' tp-fase-act' : ''), style: { '--fc': f.color }, 'data-fase': f.id },
          h('h4', null, f.nombre, actual && actual.fase && actual.fase.id === f.id ? h('span', { class: 'tp-chip' }, t('tp.fase.actual')) : null),
          h('p', null, `${t('tp.fase.' + f.tipo)} · ${G.fmtRango(f.inicio, f.fin)} · ${t('tp.n-semanas', { n: nSem })}`),
          f.objetivo ? h('p', null, f.objetivo) : null,
          x ? h('p', null, x.previstoHastaHoy > 0 || x.real > 0 ? `${t('tp.previsto')} ${G.fmtM(x.previsto)} · ${t('tp.real')} ${G.fmtM(x.real)} (${G.fmtPct(x.desv.pct)}) ` : `${t('tp.previsto')} ${G.fmtM(x.previsto)} `, x.previstoHastaHoy > 0 || x.real > 0 ? chipEstado(x.desv.estado) : null) : null,
          h('div', { class: 'tp-acc' }, btn(t('common.editar'), 'editar', () => abrirFase(f), 'tp-btn-s', { 'aria-label': `${t('tp.fase.editar')}: ${f.nombre}` }),
            btn(t('tp.herr.plantilla-corta'), 'documento', () => abrirPlantilla(f), 'tp-btn-s', { 'aria-label': `${t('tp.herr.plantilla')}: ${f.nombre}` })));
      })) : h('p', { class: 'tp-vacio' }, t('tp.sin-fases-ayuda')));
  }

  function seccionEventos(m) {
    return h('section', { class: 'tp-sec', 'aria-labelledby': 'tp-h-ev' },
      h('h3', { id: 'tp-h-ev' }, t('tp.eventos'), h('span', { class: 'grow' }), btn(t('tp.ev.nuevo'), 'mas', () => abrirEvento(null), 'btn')),
      m.eventos.length ? h('ul', { class: 'tp-list' }, m.eventos.map((e) => itemEvento(e, m))) : h('p', { class: 'tp-vacio' }, t('tp.sin-eventos')));
  }
  function itemEvento(e, m) {
    const sem = m.semanas.find((s) => e.inicio >= s.lunes && e.inicio <= s.domingo);
    return h('li', { 'data-evento': e.id },
      G.insigniaEvento(e, h),
      h('span', { class: 'grow' }, h('strong', null, e.nombre), ' ', h('small', null, `${G.nombrePrioridad(e)} · ${G.fmtRango(e.inicio, e.fin)}${e.lugar ? ' · ' + e.lugar : ''}${sem ? ' · ' + t('tp.semana-n', { n: sem.n }) : ' · ' + t('tp.fuera-temporada')}`)),
      btn(t('common.editar'), 'editar', () => abrirEvento(e), 'tp-btn-s', { 'aria-label': `${t('tp.ev.editar')}: ${e.nombre}` }),
      btn(t('common.eliminar'), 'borrar', async () => { if (await ui.confirmDialog(t('tp.ev.eliminar-confirm', { nombre: e.nombre }), { danger: true, okLabel: t('common.eliminar') })) { svc.borrarEvento(e.id); toast(t('tp.ev.eliminado')); redibujar(); } }, 'tp-btn-s danger', { 'aria-label': `${t('common.eliminar')}: ${e.nombre}` }));
  }

  function seleccionar(n, scroll = false) {
    st.sel = n; st.scroll = scroll; draw();
  }

  function zoomControles(m) {
    const ops = opcionesSemana(m);
    const sel = (valor, fn, et) => h('label', null, et, h('select', { onchange: (e) => fn(Number(e.target.value)) }, ops.map((o) => h('option', { value: o.value, selected: o.value === valor }, o.label))));
    const fijar = (d, hh) => { st.desde = Math.max(1, d); st.hasta = Math.min(m.semanas.length, hh); st.rangoFijado = true; draw(); };
    const actual = m.semanaActual || st.sel || 1;
    const fs = (m.semanas.find((s) => s.n === st.sel) || {}).fase;
    return h('div', { class: 'tp-zoom', role: 'group', 'aria-label': t('tp.zoom') },
      sel(st.desde, (v) => fijar(Math.min(v, st.hasta), st.hasta), t('tp.herr.desde')),
      sel(st.hasta, (v) => fijar(st.desde, Math.max(v, st.desde)), t('tp.herr.hasta')),
      btn(t('tp.zoom.todo'), null, () => { st.rangoFijado = false; fijar(1, m.semanas.length); st.rangoFijado = false; }, 'btn'),
      btn(t('tp.zoom.proximas'), null, () => fijar(actual, actual + 7), 'btn'),
      fs ? btn(t('tp.zoom.fase'), null, () => { const ns = m.semanas.filter((s) => s.fase && s.fase.id === fs.id).map((s) => s.n); fijar(ns[0], ns[ns.length - 1]); }, 'btn') : null);
  }

  function seccionGrafico(m) {
    const movil = esMovil();
    const rango = m.semanas.filter((s) => s.n >= st.desde && s.n <= st.hasta);
    const cuerpo = [zoomControles(m)];
    if (movil) {
      const max = Math.max(1, ...rango.map((s) => Math.max(s.plan.volumen || 0, s.real.total))) * 1.05;
      const pct = (v) => `${Math.min(100, (v / max) * 100).toFixed(2)}%`;
      cuerpo.push(h('ol', { class: 'tp-lista', 'aria-label': t('tp.lista-aria') }, rango.map((s) => h('li', null, h('button', {
        type: 'button', class: 'tp-wk' + (s.tiempo === 'actual' ? ' tp-act' : ''), 'aria-pressed': s.n === st.sel ? 'true' : 'false', 'data-n': s.n, 'aria-label': G.ariaSemana(s), onclick: () => seleccionar(s.n, true),
      },
      h('span', { class: 'tp-wk-top' }, h('strong', null, t('tp.semana-n', { n: s.n })), h('span', { class: 'muted' }, G.fmtRango(s.desde, s.hasta)), h('span', null, puntoFase(s.fase), G.nombreFase(s.fase)), s.tiempo === 'actual' ? h('span', { class: 'tp-chip' }, t('tp.hoy')) : null),
      s.eventos.length ? h('span', null, s.eventos.map((e) => chipEvento(e))) : null,
      h('span', { class: 'tp-pista', 'aria-hidden': 'true' },
        ordenTipos(m).map((tp) => (s.real.metros[tp.id] > 0 ? h('i', { style: { width: pct(s.real.metros[tp.id]), background: tp.color } }) : null)),
        s.real.sinClasificar > 0 ? h('i', { style: { width: pct(s.real.sinClasificar), background: '#9aa4b2' } }) : null,
        s.plan.volumen > 0 ? h('b', { style: { left: pct(s.plan.volumen) } }) : null),
      h('span', { class: 'tp-wk-num' }, h('span', null, `${t('tp.previsto')} ${s.plan.volumen > 0 ? G.fmtM(s.plan.volumen) : '—'}`), h('span', null, `${t('tp.real')} ${s.real.fuente === 'ninguna' ? '—' : G.fmtM(s.real.total)}`), h('span', null, G.fmtPct(s.desv.pct)), chipEstado(s.estado)))))));
    } else {
      cuerpo.push(h('div', { class: 'tp-scroll', tabindex: 0, role: 'region', 'aria-label': t('tp.g.region') }, G.graficoSemanas({ m, desde: st.desde, hasta: st.hasta, sel: st.sel, onSelect: (n) => seleccionar(n, false) })));
      cuerpo.push(G.leyenda({ m, h, desde: st.desde, hasta: st.hasta }));
    }
    const lt = !movil && m.semanas.length ? h('div', null, h('h4', { id: 'tp-h-tl' }, t('tp.tl.titulo')), G.lineaTiempo({ m, onSelect: (n) => seleccionar(n, false) })) : null;
    return h('section', { class: 'tp-sec', 'aria-labelledby': 'tp-h-graf' }, h('h3', { id: 'tp-h-graf' }, t('tp.g.titulo')), cuerpo, lt);
  }
  const ordenTipos = (m) => m.tipos.slice().sort((a, b) => a.orden - b.orden);

  function seccionTabla(m) {
    if (esMovil()) return null;
    const rango = m.semanas.filter((s) => s.n >= st.desde && s.n <= st.hasta);
    const sumP = rango.reduce((a, s) => a + (s.plan.volumen || 0), 0), sumR = rango.filter((s) => s.tiempo !== 'futura').reduce((a, s) => a + s.real.total, 0);
    return h('section', { class: 'tp-sec', 'aria-labelledby': 'tp-h-tabla' }, h('h3', { id: 'tp-h-tabla' }, t('tp.tabla.titulo')),
      h('div', { class: 'tp-tablawrap' }, h('table', { class: 'tp-tabla', 'data-tabla': 'semanas' },
        h('caption', null, t('tp.tabla.caption')),
        h('thead', null, h('tr', null, ...['semana', 'fechas', 'fase', 'eventos'].map((k) => h('th', { scope: 'col' }, t('tp.' + k))), ...['previsto', 'real', 'desviacion'].map((k) => h('th', { scope: 'col', class: 'num' }, t('tp.' + k))), h('th', { scope: 'col' }, t('tp.estado-t')))),
        h('tbody', null, rango.map((s) => h('tr', { class: (s.n === st.sel ? 'tp-sel ' : '') + (s.tiempo === 'actual' ? 'tp-act' : ''), 'data-n': s.n },
          h('td', null, h('button', { type: 'button', class: 'tp-sem-btn', 'aria-pressed': s.n === st.sel ? 'true' : 'false', 'aria-label': t('tp.tabla.abrir', { n: s.n, fechas: G.fmtRango(s.desde, s.hasta) }), onclick: () => seleccionar(s.n, true) }, String(s.n))),
          h('td', null, G.fmtRango(s.desde, s.hasta)),
          h('td', null, puntoFase(s.fase), G.nombreFase(s.fase)),
          h('td', null, s.eventos.map((e) => chipEvento(e))),
          h('td', { class: 'num' }, s.plan.volumen > 0 ? G.fmtM(s.plan.volumen) : '—'),
          h('td', { class: 'num' }, s.real.fuente === 'ninguna' ? '—' : G.fmtM(s.real.total), s.real.fuente !== 'ninguna' ? h('small', { class: 'muted' }, ' ' + t('tp.fuente.' + s.real.fuente)) : null),
          h('td', { class: 'num' }, G.fmtPct(s.desv.pct)),
          h('td', null, chipEstado(s.estado))))),
        h('tfoot', null, h('tr', null, h('th', { scope: 'row', colspan: 4 }, t('tp.tabla.total')), h('td', { class: 'num' }, G.fmtM(sumP)), h('td', { class: 'num' }, G.fmtM(sumR)), h('td', { colspan: 2 }, ''))))));
  }

  function detalleSemana(m) {
    const s = m.semanas.find((x) => x.n === st.sel);
    if (!s) return null;
    const entrenos = svc.entrenosDeSemana(m.temporada.id, s.lunes);
    const maxC = Math.max(1, ...s.contenidos.map((c) => Math.max(c.previsto, c.real)));
    const pc = (v) => `${Math.min(100, (v / maxC) * 100).toFixed(1)}%`;
    const sug = panelSugerencias(m, s.n);
    return h('section', { class: 'tp-sec tp-det', id: 'tp-detalle', 'aria-labelledby': 'tp-h-det', tabindex: -1 },
      h('h3', { id: 'tp-h-det' },
        btn('', 'flecha-izq', () => seleccionar(Math.max(1, s.n - 1), false), 'tp-btn-s', { 'aria-label': t('tp.semana-anterior'), disabled: s.n <= 1 }),
        `${t('tp.semana-n', { n: s.n })} · ${G.fmtRango(s.desde, s.hasta)}`,
        btn('', 'flecha-dcha', () => seleccionar(Math.min(m.semanas.length, s.n + 1), false), 'tp-btn-s', { 'aria-label': t('tp.semana-siguiente'), disabled: s.n >= m.semanas.length }),
        h('span', null, puntoFase(s.fase), G.nombreFase(s.fase)), chipEstado(s.estado), s.tiempo === 'actual' ? h('span', { class: 'tp-chip' }, t('tp.hoy')) : null),
      h('dl', { class: 'tp-det-grid' },
        h('div', null, h('dt', null, t('tp.previsto')), h('dd', null, s.plan.volumen > 0 ? G.fmtM(s.plan.volumen) : t('tp.sin-previsto'))),
        h('div', null, h('dt', null, `${t('tp.real')} (${t('tp.fuente.' + s.real.fuente)})`), h('dd', null, G.fmtM(s.real.total))),
        h('div', null, h('dt', null, t('tp.desviacion')), h('dd', null, `${G.fmtPct(s.desv.pct)}`)),
        h('div', null, h('dt', null, t('tp.det.cargas')), h('dd', null, s.cargas.total > 0 ? G.fmtM(s.cargas.total) : '—')),
        h('div', null, h('dt', null, t('tp.det.planes')), h('dd', null, s.planes.total > 0 ? G.fmtM(s.planes.total) : '—')),
        h('div', null, h('dt', null, t('tp.f.intensidad')), h('dd', null, s.plan.intensidad ?? '—'))),
      s.plan.objetivo || s.plan.notas ? h('p', null, s.plan.objetivo ? h('strong', null, s.plan.objetivo) : null, s.plan.notas ? ` — ${s.plan.notas}` : '') : null,
      h('div', { class: 'tp-herr', role: 'group', 'aria-label': t('tp.herr.titulo') },
        btn(t('tp.semana.editar'), 'editar', () => abrirSemana(s), 'btn'),
        btn(t('tp.herr.copiar'), 'copiar', () => abrirCopiar(s), 'btn'),
        m.fases.length ? btn(t('tp.herr.plantilla'), 'documento', () => abrirPlantilla(s.fase), 'btn') : null,
        btn(t('tp.herr.ajustar'), 'grafica', () => abrirAjuste(s), 'btn')),
      sug ? h('div', null, h('h4', null, t('tp.sug.titulo-semana')), sug) : null,
      h('h4', null, t('tp.det.contenidos')),
      s.contenidos.length ? h('div', { class: 'tp-tablawrap' }, h('table', { class: 'tp-tabla', 'data-tabla': 'contenidos' },
        h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('tp.contenido')), h('th', { scope: 'col', class: 'num' }, t('tp.previsto')), h('th', { scope: 'col', class: 'num' }, t('tp.real')), h('th', { scope: 'col', class: 'num' }, t('tp.desviacion')), h('th', { scope: 'col' }, t('tp.estado-t')), h('th', { scope: 'col' }, t('tp.det.barra')))),
        h('tbody', null, s.contenidos.map((c) => h('tr', { 'data-tipo': c.tipo.id },
          h('td', null, h('span', { class: 'tp-fdot', style: { background: c.tipo.color }, 'aria-hidden': 'true' }), tContenido(c.tipo)),
          h('td', { class: 'num' }, c.previsto > 0 ? G.fmtM(c.previsto) : '—'), h('td', { class: 'num' }, c.real > 0 ? G.fmtM(c.real) : '—'), h('td', { class: 'num' }, G.fmtPct(c.desv.pct)), h('td', null, chipEstado(c.desv.estado)),
          h('td', { 'aria-hidden': 'true' }, h('span', { class: 'tp-mini' }, h('i', { style: { width: pc(c.real), background: c.tipo.color } }), c.previsto > 0 ? h('b', { style: { left: pc(c.previsto) } }) : null))))),
        s.real.sinClasificar > 0 ? h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, t('tp.sin-clasificar')), h('td', null), h('td', { class: 'num' }, G.fmtM(s.real.sinClasificar)), h('td', { colspan: 3 }))) : null)) : h('p', { class: 'tp-vacio' }, t('tp.det.sin-contenidos')),
      h('h4', null, t('tp.det.entrenos')),
      entrenos.length ? h('ul', { class: 'tp-list', 'data-lista': 'entrenos' }, entrenos.map((e) => h('li', { 'data-sesion': e.id },
        h('span', { class: 'grow' }, h('strong', null, e.titulo || G.fmtCorta(e.fecha)), ' ', h('small', null, `${G.fmtCorta(e.fecha)}${e.hora ? ' ' + e.hora : ''}${e.grupoNombre ? ' · ' + e.grupoNombre : ''} · ${G.fmtM(e.metros)} · ${tEstado(e.estado)}${e.conPlan ? '' : ' · ' + t('tp.det.sin-plan')}`)),
        btn(t('tp.det.abrir-plan'), 'documento', () => abrirPlanEntreno(e.id), 'tp-btn-s', { 'aria-label': `${t('tp.det.abrir-plan')}: ${e.titulo}` })))) : h('p', { class: 'tp-vacio' }, t('tp.det.sin-entrenos')),
      h('h4', null, t('tp.eventos')),
      s.eventos.length ? h('ul', { class: 'tp-list', 'data-lista': 'eventos-semana' }, s.eventos.map((e) => itemEvento(e, m))) : h('p', { class: 'tp-vacio' }, t('tp.sin-eventos')),
      h('p', null, btn(t('tp.ev.nuevo'), 'mas', () => abrirEvento(null), 'btn')));
  }

  // ---------- Pintado ----------
  function draw() {
    const temporadas = svc.temporadas();
    if (!temporadas.length) {
      st.tid = '';
      container.replaceChildren(h('div', { class: 'card tp-vacio-card', style: { padding: '1rem' } },
        h('h3', null, t('tp.vacio.titulo')), h('p', null, t('tp.vacio.texto')),
        btn(t('tp.temporada.crear'), 'mas', () => abrirTemporada(null), 'btn btn-primary')));
      return;
    }
    if (!temporadas.some((x) => x.id === st.tid)) { const a = svc.activa(); st.tid = a.id; st.rangoFijado = false; st.sel = 0; }
    modelo = svc.resumen(st.tid, { fuente: st.fuente });
    const m = modelo;
    if (!m.semanas.length) {
      container.replaceChildren(barraSuperior(m), nota('err', 'aviso', t('tp.sin-semanas')));
      return;
    }
    if (!st.sel || st.sel > m.semanas.length) st.sel = m.semanaActual || (m.hoy > m.temporada.fin ? m.semanas.length : 1);
    if (!st.rangoFijado || st.hasta > m.semanas.length || st.desde > st.hasta) { st.desde = 1; st.hasta = m.semanas.length; }
    container.replaceChildren(...[
      barraSuperior(m), resumenCards(m), panelAvisos(m),
      h('section', { class: 'tp-sec', 'aria-labelledby': 'tp-h-sug' }, h('h3', { id: 'tp-h-sug' }, t('tp.sug.titulo')), panelSugerencias(m, 0)),
      seccionFases(m), seccionGrafico(m), seccionTabla(m), detalleSemana(m), seccionEventos(m)].filter(Boolean));
    if (st.scroll) { st.scroll = false; const d = container.querySelector('#tp-detalle'); if (d) { if (d.scrollIntoView) d.scrollIntoView({ block: 'start' }); if (d.focus) d.focus({ preventScroll: true }); } }
  }

  draw();
  const off = store.on ? store.on(() => { if (container.isConnected) redibujar(); else if (typeof off === 'function') off(); }) : null;
  const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 700px)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { if (container.isConnected) redibujar(); });
  return off;
}
