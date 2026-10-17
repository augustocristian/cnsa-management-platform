// Sections of the season screen (cards, notices, suggestions, phases, events, chart/list, table, week detail).
// Presentation only: each function receives the model `m` of temporadaService.resumen() and a context `c` with the screen state and
// the actions (open dialogs, select a week, redraw). Visual pieces are the shared components (card, badge, alert, table, btn).
import { h, toast } from '../ui.js';
import { t, tNum, tContenido, tEstado } from '../i18n.js';
import { icon } from '../icons.js';
import { semanaDelEvento, semanasEnRango, semanasDeFase } from '../domain/temporada.js';
import { ordenarTipos } from '../domain/cargas.js';
import * as G from './temporada-grafico.js';

const ICONO_ESTADO = { 'en-rango': 'check', bajo: 'flecha-abajo', alto: 'flecha-arriba', pendiente: 'reloj', 'en-curso': 'reloj', 'sin-previsto': 'info' };
const TONO_ESTADO = { 'en-rango': 'ok', bajo: 'warn', alto: 'danger', pendiente: 'neutral', 'en-curso': 'neutral', 'sin-previsto': 'neutral' };

// ---------- Small pieces ----------
export const chipEstado = (e) => h('span', { class: `badge badge--${TONO_ESTADO[e] || 'neutral'} tp-chip tp-e-${e}` }, icon(ICONO_ESTADO[e] || 'info', { size: 13 }), G.textoEstado(e));
const puntoFase = (f) => h('span', { class: 'tp-fdot', style: f ? { background: f.color } : null, 'aria-hidden': 'true' });
const chipEvento = (e) => h('span', { class: 'tp-evchip', title: `${e.nombre} · ${G.nombrePrioridad(e)}` }, G.insigniaEvento(e), h('span', null, e.nombre));
const btn = (txt, ic, fn, cls = 'btn btn-sm', extra = {}) => h('button', { type: 'button', class: cls, onclick: fn, ...extra }, ic ? icon(ic, { size: 14 }) : null, txt);
const seccion = (idH, titulo, accion, ...cuerpo) => h('section', { class: 'tp-sec', 'aria-labelledby': idH },
  h('div', { class: 'tp-sec-head' }, h('h2', { id: idH }, titulo), accion || null), cuerpo);
const vacio = (texto) => h('p', { class: 'hint' }, texto);

// ---------- Summary cards ----------
export function resumenCards(m) {
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

// ---------- Notices (validations of the plan) ----------
function textoValidacion(v) {
  const p = { ...v.params };
  ['desde', 'hasta'].forEach((k) => { if (p[k]) p[k] = G.fmtCorta(p[k]); });
  return t('tp.v.' + v.tipo, p);
}
export function panelAvisos(m) {
  const v = m.validaciones.filter((x) => x.severidad !== 'info');
  const info = m.validaciones.filter((x) => x.severidad === 'info');
  if (!v.length && !info.length) return null;
  const alerta = (tono, ic, ...hijos) => h('div', { class: `alert alert--${tono}`, role: tono === 'danger' ? 'alert' : null }, icon(ic, { size: 18 }), h('div', null, hijos));
  return h('div', { class: 'tp-avisos', role: 'region', 'aria-label': t('tp.v.titulo') },
    v.map((x) => alerta(x.severidad === 'error' ? 'danger' : 'warn', 'aviso', h('p', null, h('strong', null, t('tp.v.sev.' + x.severidad) + ': '), textoValidacion(x)))),
    info.map((x) => alerta('info', 'info', h('p', null, textoValidacion(x)))));
}

// ---------- Suggestions ----------
function textoSugerencia(m, c, s) {
  const p = { ...s.params, contenido: s.params.tipoId ? c.contenidoNombre(s.params.tipoId) : '', real: tNum(s.params.real), previsto: tNum(s.params.previsto), metros: tNum(s.params.metros), objetivo: tNum(s.params.objetivo), base: tNum(s.params.base), pct: (s.params.pct > 0 ? '+' : '') + s.params.pct, semana: s.semana };
  return t('tp.sug.' + s.codigo, p);
}
export function panelSugerencias(m, c, filtroN) {
  const lista = filtroN ? m.sugerencias.filter((s) => s.semana === filtroN && s.codigo !== 'sin-previsto') : m.sugerencias;
  if (!lista.length) return filtroN ? null : vacio(t('tp.sug.ninguna'));
  return h('ul', { class: 'tp-sug' }, lista.map((s) => h('li', { class: s.severidad, 'data-sug': s.codigo },
    icon(s.severidad === 'info' ? 'info' : 'estrella', { size: 18 }),
    h('p', null, textoSugerencia(m, c, s)),
    s.accion ? btn(t('tp.sug.aplicar'), 'check', () => { if (c.svc.aplicarSugerencia(m.temporada.id, s).ok) { toast(t('tp.sug.aplicada')); c.st.sel = s.semana; c.redibujar(); } }) : null,
    s.semana && !filtroN ? btn(t('tp.sug.ver', { n: s.semana }), 'ojo', () => c.seleccionar(s.semana, true)) : null,
    s.codigo === 'sin-previsto' ? btn(t('tp.herr.plantilla'), 'documento', () => c.abrirPlantilla()) : null)));
}

// ---------- Phases ----------
export function seccionFases(m, c) {
  const tot = new Map(m.totales.fases.filter((x) => x.fase).map((x) => [x.fase.id, x]));
  const actual = m.semanas.find((s) => s.tiempo === 'actual');
  return seccion('tp-h-fases', t('tp.fases'), btn(t('tp.fase.nueva'), 'mas', () => c.abrirFase(null), 'btn'),
    m.fases.length ? h('ul', { class: 'tp-fases' }, m.fases.map((f) => {
      const x = tot.get(f.id);
      const nSem = m.semanas.filter((s) => s.fase && s.fase.id === f.id).length;
      const esActual = actual && actual.fase && actual.fase.id === f.id;
      return h('li', { class: 'tp-fase' + (esActual ? ' tp-fase-act' : ''), style: { '--fc': f.color }, 'data-fase': f.id },
        h('h3', null, f.nombre, esActual ? h('span', { class: 'badge badge--info tp-chip' }, t('tp.fase.actual')) : null),
        h('p', null, `${t('tp.fase.' + f.tipo)} · ${G.fmtRango(f.inicio, f.fin)} · ${t('tp.n-semanas', { n: nSem })}`),
        f.objetivo ? h('p', null, f.objetivo) : null,
        x ? h('p', null, x.previstoHastaHoy > 0 || x.real > 0 ? `${t('tp.previsto')} ${G.fmtM(x.previsto)} · ${t('tp.real')} ${G.fmtM(x.real)} (${G.fmtPct(x.desv.pct)}) ` : `${t('tp.previsto')} ${G.fmtM(x.previsto)} `, x.previstoHastaHoy > 0 || x.real > 0 ? chipEstado(x.desv.estado) : null) : null,
        h('div', { class: 'tp-acc' },
          btn(t('common.editar'), 'editar', () => c.abrirFase(f), 'btn btn-sm', { 'aria-label': `${t('tp.fase.editar')}: ${f.nombre}` }),
          btn(t('tp.herr.plantilla-corta'), 'documento', () => c.abrirPlantilla(f), 'btn btn-sm', { 'aria-label': `${t('tp.herr.plantilla')}: ${f.nombre}` })));
    })) : vacio(t('tp.sin-fases-ayuda')));
}

// ---------- Events ----------
export function itemEvento(e, m, c) {
  const sem = semanaDelEvento(m, e);
  return h('li', { 'data-evento': e.id },
    G.insigniaEvento(e),
    h('span', { class: 'grow' }, h('strong', null, e.nombre), ' ', h('small', null, `${G.nombrePrioridad(e)} · ${G.fmtRango(e.inicio, e.fin)}${e.lugar ? ' · ' + e.lugar : ''}${sem ? ' · ' + t('tp.semana-n', { n: sem.n }) : ' · ' + t('tp.fuera-temporada')}`)),
    btn(t('common.editar'), 'editar', () => c.abrirEvento(e), 'btn btn-sm', { 'aria-label': `${t('tp.ev.editar')}: ${e.nombre}` }),
    btn(t('common.eliminar'), 'borrar', () => c.borrarEvento(e), 'btn btn-sm btn--ghost', { 'aria-label': `${t('common.eliminar')}: ${e.nombre}` }));
}
export function seccionEventos(m, c) {
  return seccion('tp-h-ev', t('tp.eventos'), btn(t('tp.ev.nuevo'), 'mas', () => c.abrirEvento(null), 'btn'),
    m.eventos.length ? h('ul', { class: 'tp-list' }, m.eventos.map((e) => itemEvento(e, m, c))) : vacio(t('tp.sin-eventos')));
}

// ---------- Chart (desktop) / list of weeks with mini-bars (phone) ----------
function controlesZoom(m, c) {
  const { st } = c;
  const ops = m.semanas.map((s) => ({ value: s.n, label: `${t('tp.semana-n', { n: s.n })} · ${G.fmtCorta(s.lunes)}` }));
  const sel = (valor, fn, et) => h('label', { class: 'field-control' }, h('span', { class: 'field-label' }, et),
    h('select', { onchange: (e) => fn(Number(e.target.value)) }, ops.map((o) => h('option', { value: o.value, selected: o.value === valor }, o.label))));
  const fijar = (d, hh) => { st.desde = Math.max(1, d); st.hasta = Math.min(m.semanas.length, hh); st.rangoFijado = true; c.draw(); };
  const actual = m.semanaActual || st.sel || 1;
  const fs = (m.semanas.find((s) => s.n === st.sel) || {}).fase;
  return h('div', { class: 'tp-zoom', role: 'group', 'aria-label': t('tp.zoom') },
    sel(st.desde, (v) => fijar(Math.min(v, st.hasta), st.hasta), t('tp.herr.desde')),
    sel(st.hasta, (v) => fijar(st.desde, Math.max(v, st.desde)), t('tp.herr.hasta')),
    btn(t('tp.zoom.todo'), null, () => { st.rangoFijado = false; fijar(1, m.semanas.length); st.rangoFijado = false; }, 'btn'),
    btn(t('tp.zoom.proximas'), null, () => fijar(actual, actual + 7), 'btn'),
    fs ? btn(t('tp.zoom.fase'), null, () => { const r = semanasDeFase(m, fs.id); if (r) fijar(r.desde, r.hasta); }, 'btn') : null);
}

function listaMovil(m, c, rango) {
  const { st } = c;
  const max = Math.max(1, ...rango.map((s) => Math.max(s.plan.volumen || 0, s.real.total))) * 1.05;
  const pct = (v) => `${Math.min(100, (v / max) * 100).toFixed(2)}%`;
  const tipos = ordenarTipos(m.tipos);
  return h('ol', { class: 'tp-lista', 'aria-label': t('tp.lista-aria') }, rango.map((s) => h('li', null, h('button', {
    type: 'button', class: 'tp-wk' + (s.tiempo === 'actual' ? ' tp-act' : ''), 'aria-pressed': s.n === st.sel ? 'true' : 'false', 'data-n': s.n, 'aria-label': G.ariaSemana(s), onclick: () => c.seleccionar(s.n, true),
  },
  h('span', { class: 'tp-wk-top' }, h('strong', null, t('tp.semana-n', { n: s.n })), h('span', { class: 'muted' }, G.fmtRango(s.desde, s.hasta)), h('span', null, puntoFase(s.fase), G.nombreFase(s.fase)), s.tiempo === 'actual' ? h('span', { class: 'badge badge--info tp-chip' }, t('tp.hoy')) : null),
  s.eventos.length ? h('span', null, s.eventos.map(chipEvento)) : null,
  h('span', { class: 'tp-pista', 'aria-hidden': 'true' },
    tipos.map((tp) => (s.real.metros[tp.id] > 0 ? h('i', { style: { width: pct(s.real.metros[tp.id]), background: tp.color } }) : null)),
    s.real.sinClasificar > 0 ? h('i', { class: 'tp-sin-clasif-bar', style: { width: pct(s.real.sinClasificar) } }) : null,
    s.plan.volumen > 0 ? h('b', { style: { left: pct(s.plan.volumen) } }) : null),
  h('span', { class: 'tp-wk-num' }, h('span', null, `${t('tp.previsto')} ${s.plan.volumen > 0 ? G.fmtM(s.plan.volumen) : '—'}`), h('span', null, `${t('tp.real')} ${s.real.fuente === 'ninguna' ? '—' : G.fmtM(s.real.total)}`), h('span', null, G.fmtPct(s.desv.pct)), chipEstado(s.estado))))));
}

export function seccionGrafico(m, c) {
  const { st } = c;
  const movil = c.esMovil();
  const rango = semanasEnRango(m, st.desde, st.hasta);
  const cuerpo = [controlesZoom(m, c)];
  if (movil) cuerpo.push(listaMovil(m, c, rango));
  else {
    cuerpo.push(h('div', { class: 'tp-scroll', tabindex: 0, role: 'region', 'aria-label': t('tp.g.region') }, G.graficoSemanas({ m, desde: st.desde, hasta: st.hasta, sel: st.sel, onSelect: (n) => c.seleccionar(n, false) })));
    cuerpo.push(G.leyenda({ m, desde: st.desde, hasta: st.hasta }));
  }
  const tl = !movil && m.semanas.length ? h('div', null, h('h3', { id: 'tp-h-tl' }, t('tp.tl.titulo')), G.lineaTiempo({ m, onSelect: (n) => c.seleccionar(n, false) })) : null;
  return seccion('tp-h-graf', t('tp.g.titulo'), null, cuerpo, tl);
}

// ---------- Weekly table (desktop) ----------
export function seccionTabla(m, c) {
  if (c.esMovil()) return null;
  const { st } = c;
  const rango = semanasEnRango(m, st.desde, st.hasta);
  const sumP = rango.reduce((a, s) => a + (s.plan.volumen || 0), 0);
  const sumR = rango.filter((s) => s.tiempo !== 'futura').reduce((a, s) => a + s.real.total, 0);
  return seccion('tp-h-tabla', t('tp.tabla.titulo'), null,
    h('div', { class: 'table-wrap' }, h('table', { class: 'table tp-tabla', 'data-tabla': 'semanas' },
      h('caption', { class: 'tp-caption' }, t('tp.tabla.caption')),
      h('thead', null, h('tr', null, ...['semana', 'fechas', 'fase', 'eventos'].map((k) => h('th', { scope: 'col' }, t('tp.' + k))), ...['previsto', 'real', 'desviacion'].map((k) => h('th', { scope: 'col', class: 'num' }, t('tp.' + k))), h('th', { scope: 'col' }, t('tp.estado-t')))),
      h('tbody', null, rango.map((s) => h('tr', { class: (s.n === st.sel ? 'tp-sel ' : '') + (s.tiempo === 'actual' ? 'tp-act' : ''), 'data-n': s.n },
        h('td', null, h('button', { type: 'button', class: 'tp-sem-btn', 'aria-pressed': s.n === st.sel ? 'true' : 'false', 'aria-label': t('tp.tabla.abrir', { n: s.n, fechas: G.fmtRango(s.desde, s.hasta) }), onclick: () => c.seleccionar(s.n, true) }, String(s.n))),
        h('td', null, G.fmtRango(s.desde, s.hasta)),
        h('td', null, puntoFase(s.fase), G.nombreFase(s.fase)),
        h('td', null, s.eventos.map(chipEvento)),
        h('td', { class: 'num' }, s.plan.volumen > 0 ? G.fmtM(s.plan.volumen) : '—'),
        h('td', { class: 'num' }, s.real.fuente === 'ninguna' ? '—' : G.fmtM(s.real.total), s.real.fuente !== 'ninguna' ? h('small', { class: 'muted' }, ' ' + t('tp.fuente.' + s.real.fuente)) : null),
        h('td', { class: 'num' }, G.fmtPct(s.desv.pct)),
        h('td', null, chipEstado(s.estado))))),
      h('tfoot', null, h('tr', null, h('th', { scope: 'row', colspan: 4 }, t('tp.tabla.total')), h('td', { class: 'num' }, G.fmtM(sumP)), h('td', { class: 'num' }, G.fmtM(sumR)), h('td', { colspan: 2 }, ''))))));
}

// ---------- Selected week detail ----------
export function detalleSemana(m, c) {
  const { st, svc } = c;
  const s = m.semanas.find((x) => x.n === st.sel);
  if (!s) return null;
  const entrenos = svc.entrenosDeSemana(m.temporada.id, s.lunes);
  const maxC = Math.max(1, ...s.contenidos.map((x) => Math.max(x.previsto, x.real)));
  const pc = (v) => `${Math.min(100, (v / maxC) * 100).toFixed(1)}%`;
  const sug = panelSugerencias(m, c, s.n);
  const dato = (k, v) => h('div', null, h('dt', null, k), h('dd', null, v));
  return h('section', { class: 'tp-sec tp-det card', id: 'tp-detalle', 'aria-labelledby': 'tp-h-det', tabindex: -1 },
    h('div', { class: 'tp-det-head' },
      btn('', 'flecha-izq', () => c.seleccionar(Math.max(1, s.n - 1), false), 'btn btn-icon btn-sm', { 'aria-label': t('tp.semana-anterior'), disabled: s.n <= 1 }),
      h('h2', { id: 'tp-h-det' }, `${t('tp.semana-n', { n: s.n })} · ${G.fmtRango(s.desde, s.hasta)}`),
      btn('', 'flecha-dcha', () => c.seleccionar(Math.min(m.semanas.length, s.n + 1), false), 'btn btn-icon btn-sm', { 'aria-label': t('tp.semana-siguiente'), disabled: s.n >= m.semanas.length }),
      h('span', null, puntoFase(s.fase), G.nombreFase(s.fase)), chipEstado(s.estado), s.tiempo === 'actual' ? h('span', { class: 'badge badge--info tp-chip' }, t('tp.hoy')) : null),
    h('dl', { class: 'tp-det-grid' },
      dato(t('tp.previsto'), s.plan.volumen > 0 ? G.fmtM(s.plan.volumen) : t('tp.sin-previsto')),
      dato(`${t('tp.real')} (${t('tp.fuente.' + s.real.fuente)})`, G.fmtM(s.real.total)),
      dato(t('tp.desviacion'), G.fmtPct(s.desv.pct)),
      dato(t('tp.det.cargas'), s.cargas.total > 0 ? G.fmtM(s.cargas.total) : '—'),
      dato(t('tp.det.planes'), s.planes.total > 0 ? G.fmtM(s.planes.total) : '—'),
      dato(t('tp.f.intensidad'), s.plan.intensidad ?? '—')),
    s.plan.objetivo || s.plan.notas ? h('p', null, s.plan.objetivo ? h('strong', null, s.plan.objetivo) : null, s.plan.notas ? ` — ${s.plan.notas}` : '') : null,
    h('div', { class: 'tp-herr', role: 'group', 'aria-label': t('tp.herr.titulo') },
      btn(t('tp.semana.editar'), 'editar', () => c.abrirSemana(s), 'btn'),
      btn(t('tp.herr.copiar'), 'copiar', () => c.abrirCopiar(s), 'btn'),
      m.fases.length ? btn(t('tp.herr.plantilla'), 'documento', () => c.abrirPlantilla(s.fase), 'btn') : null,
      btn(t('tp.herr.ajustar'), 'grafica', () => c.abrirAjuste(s), 'btn')),
    sug ? h('div', null, h('h3', null, t('tp.sug.titulo-semana')), sug) : null,
    h('h3', null, t('tp.det.contenidos')),
    s.contenidos.length ? h('div', { class: 'table-wrap' }, h('table', { class: 'table tp-tabla', 'data-tabla': 'contenidos' },
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('tp.contenido')), h('th', { scope: 'col', class: 'num' }, t('tp.previsto')), h('th', { scope: 'col', class: 'num' }, t('tp.real')), h('th', { scope: 'col', class: 'num' }, t('tp.desviacion')), h('th', { scope: 'col' }, t('tp.estado-t')), h('th', { scope: 'col' }, t('tp.det.barra')))),
      h('tbody', null, s.contenidos.map((x) => h('tr', { 'data-tipo': x.tipo.id },
        h('td', null, h('span', { class: 'tp-fdot', style: { background: x.tipo.color }, 'aria-hidden': 'true' }), tContenido(x.tipo)),
        h('td', { class: 'num' }, x.previsto > 0 ? G.fmtM(x.previsto) : '—'), h('td', { class: 'num' }, x.real > 0 ? G.fmtM(x.real) : '—'), h('td', { class: 'num' }, G.fmtPct(x.desv.pct)), h('td', null, chipEstado(x.desv.estado)),
        h('td', { 'aria-hidden': 'true' }, h('span', { class: 'tp-mini' }, h('i', { style: { width: pc(x.real), background: x.tipo.color } }), x.previsto > 0 ? h('b', { style: { left: pc(x.previsto) } }) : null))))),
      s.real.sinClasificar > 0 ? h('tfoot', null, h('tr', null, h('th', { scope: 'row' }, t('tp.sin-clasificar')), h('td', null), h('td', { class: 'num' }, G.fmtM(s.real.sinClasificar)), h('td', { colspan: 3 }))) : null)) : vacio(t('tp.det.sin-contenidos')),
    h('h3', null, t('tp.det.entrenos')),
    entrenos.length ? h('ul', { class: 'tp-list', 'data-lista': 'entrenos' }, entrenos.map((e) => h('li', { 'data-sesion': e.id },
      h('span', { class: 'grow' }, h('strong', null, e.titulo || G.fmtCorta(e.fecha)), ' ', h('small', null, `${G.fmtCorta(e.fecha)}${e.hora ? ' ' + e.hora : ''}${e.grupoNombre ? ' · ' + e.grupoNombre : ''} · ${G.fmtM(e.metros)} · ${tEstado(e.estado)}${e.conPlan ? '' : ' · ' + t('tp.det.sin-plan')}`)),
      btn(t('tp.det.abrir-plan'), 'documento', () => c.abrirPlanEntreno(e.id), 'btn btn-sm', { 'aria-label': `${t('tp.det.abrir-plan')}: ${e.titulo}` })))) : vacio(t('tp.det.sin-entrenos')),
    h('h3', null, t('tp.eventos')),
    s.eventos.length ? h('ul', { class: 'tp-list', 'data-lista': 'eventos-semana' }, s.eventos.map((e) => itemEvento(e, m, c))) : vacio(t('tp.sin-eventos')),
    h('p', null, btn(t('tp.ev.nuevo'), 'mas', () => c.abrirEvento(null), 'btn')));
}
