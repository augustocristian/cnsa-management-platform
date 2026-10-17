// Calendar views: Month grid, Week columns, Agenda list, the event card and the group legend. Presentation only.
// `v` is the view context built by calendario.js: {hoy, st, grupos, svc, etq, elegirDia(f, enfocar)}.
import { h } from '../ui.js';
import { t } from '../i18n/i18n.js';
import * as D from '../../domain/calendario.js';
import { colorEventoCalendario } from '../../domain/temporada.js';
import { intl, fmtDiaLargo, fmtMesAnio } from './formatos-fecha.js';

// A colour from the domain -> CSS class/style. Group colours are a hue, season events a semantic tone, the rest neutral.
// The actual colours live in css/views/calendario.css (tokens, light + dark).
export function atributosColor(color) {
  if (color.tono != null) return { class: 'cal-c', style: `--cal-h:${color.tono}` };
  if (color.semantico) return { class: `cal-c cal-s-${color.semantico}` };
  return { class: 'cal-c cal-neutro' };
}
const colorDe = (ev, grupos) => (ev && colorEventoCalendario(ev)) || D.colorGrupo(ev ? ev.grupoId : '', grupos);
const attrsColor = (ev, grupos, extra = '') => { const a = atributosColor(colorDe(ev, grupos)); return { class: `${extra} ${a.class}`.trim(), style: a.style }; };

const nEventos = (n) => (n === 1 ? t('cal.ev.uno') : t('cal.ev.n', { n }));
const listaDia = (evs, v) => (evs.length ? evs.map((e) => tarjeta(e, v)) : h('p', { class: 'cal-vacio' }, t('cal.vacio-dia')));

function textoHora(ev) {
  const r = D.rangoHoraEvento(ev);
  return r ? `${r.ini}–${r.fin}` : t('cal.ev.todo-dia');
}

export function tarjeta(ev, v) {
  const meta = [];
  if (ev.grupoNombre) meta.push(h('span', null, `${t('cal.ev.grupo')}: ${ev.grupoNombre}`));
  const pis = D.ubicacionEvento(ev, v.etq());
  if (pis) meta.push(h('span', null, pis));
  if (ev.enfoque) meta.push(h('span', null, `${t('cal.ev.enfoque')}: ${ev.enfoque}`));
  if (ev.volumenMin !== '' || ev.volumenMax !== '') meta.push(h('span', null, `${t('cal.ev.volumen')}: ${ev.volumenMin !== '' && ev.volumenMax !== '' ? `${ev.volumenMin}–${ev.volumenMax}` : (ev.volumenMax || ev.volumenMin)} m`));
  if (ev.descripcion && ev.origen === 'calle') meta.push(h('span', null, ev.descripcion));
  const etiqueta = (txt) => h('span', { class: 'badge badge--neutral' }, txt);
  return h('article', { ...attrsColor(ev, v.grupos, 'cal-ev'), dataset: { origen: ev.origen, id: ev.id } },
    h('div', { class: 'cal-ev-top' },
      h('span', { class: 'cal-ev-hora' }, textoHora(ev)),
      h('span', { class: 'cal-ev-titulo' }, ev.titulo),
      ev.origen === 'calle' ? etiqueta(t('cal.ev.asignacion')) : null,
      ev.origen === 'temporada' ? etiqueta(t('tp.evento.' + ev.tipoEvento)) : null,
      ev.estado === 'realizado' ? etiqueta(t('cal.ev.realizado')) : null),
    meta.length ? h('div', { class: 'cal-ev-meta' }, meta) : null);
}

export function leyenda(lista, v) {
  const ids = new Set(lista.map((e) => e.grupoId));
  const visibles = v.svc.gruposVisibles(v.st.filtros);
  const chips = v.grupos.filter((g) => ids.has(g.id) || (visibles && visibles.includes(g.id)) || !visibles)
    .map((g) => h('li', { ...attrsColor({ grupoId: g.id }, v.grupos, 'cal-gchip') }, g.nombre));
  if (ids.has('')) chips.push(h('li', { ...attrsColor({ grupoId: '' }, v.grupos, 'cal-gchip') }, t('cal.sin-grupo')));
  return h('div', null, h('p', { class: 'cal-leyenda-t' }, t('cal.leyenda')), h('ul', { class: 'cal-leyenda', 'aria-label': t('cal.leyenda') }, chips));
}

// ---------- Month: a real grid with a roving tabindex and WAI-ARIA keyboard movement ----------
export function vistaMes(lista, v) {
  const { st, hoy } = v;
  const dias = D.agruparPorDia(lista);
  const mesActual = st.cursor.slice(0, 7);
  const cab = [...Array(7).keys()].map((i) => {
    const f = D.addDias('2024-01-01', i); // 2024-01-01 was a Monday
    return h('th', { scope: 'col', abbr: intl(f, { weekday: 'long' }) }, intl(f, { weekday: 'short' }));
  });
  const filas = D.matrizMes(st.cursor).map((semana) => h('tr', null, semana.map((f) => {
    const evs = dias.get(f) || [];
    const cls = ['cal-celda', f.slice(0, 7) === mesActual ? '' : 'cal-fuera', f === hoy ? 'cal-hoy' : '', f === st.sel ? 'cal-sel' : ''].filter(Boolean).join(' ');
    const btn = h('button', {
      type: 'button', class: 'cal-num', tabindex: f === st.sel ? 0 : -1, 'aria-pressed': f === st.sel ? 'true' : 'false', 'aria-current': f === hoy ? 'date' : null,
      'aria-label': `${fmtDiaLargo(f)}${evs.length ? ', ' + nEventos(evs.length) : ''}`, dataset: { fecha: f },
      onkeydown: (e) => { const destino = D.fechaTrasTecla(e.key, f); if (destino) { e.preventDefault(); v.elegirDia(destino, true); } },
    }, h('span', null, String(Number(f.slice(8)))));
    return h('td', { class: cls, onclick: () => v.elegirDia(f, false) }, btn,
      h('ul', { class: 'cal-chips', 'aria-hidden': 'true' },
        evs.slice(0, 3).map((e) => h('li', { ...attrsColor(e, v.grupos, 'cal-chip') }, `${e.hora ? e.hora + ' ' : ''}${e.titulo}`)),
        evs.length > 3 ? h('li', { class: 'cal-mas' }, t('cal.ev.mas', { n: evs.length - 3 })) : null),
      evs.length ? h('div', { class: 'cal-puntos', 'aria-hidden': 'true' }, evs.slice(0, 4).map((e) => h('span', { ...attrsColor(e, v.grupos, 'cal-punto') }))) : null);
  })));
  const detalle = h('section', { class: 'cal-detalle', 'aria-labelledby': 'cal-detalle-t' },
    h('h2', { id: 'cal-detalle-t' }, t('cal.dia', { fecha: fmtDiaLargo(st.sel) })), listaDia(dias.get(st.sel) || [], v));
  return h('div', null,
    h('div', { class: 'cal-mes-wrap' }, h('table', { class: 'cal-mes', role: 'grid' }, h('caption', { class: 'sr-only' }, fmtMesAnio(st.cursor)), h('thead', null, h('tr', null, cab)), h('tbody', null, filas))),
    detalle);
}

export function vistaSemana(lista, v) {
  const dias = D.agruparPorDia(lista);
  const lunes = D.lunesDe(v.st.cursor);
  return h('div', { class: 'cal-semana' }, [...Array(7).keys()].map((i) => {
    const f = D.addDias(lunes, i);
    return h('section', { class: 'cal-col' + (f === v.hoy ? ' cal-hoy' : ''), 'aria-label': fmtDiaLargo(f) }, h('h2', null, fmtDiaLargo(f)), listaDia(dias.get(f) || [], v));
  }));
}

// Agenda: a rolling window that starts AT the cursor (today when the view opens). Days with events, plus the anchor day when it is today.
export function vistaAgenda(lista, v) {
  const dias = D.agruparPorDia(lista);
  const r = D.rangoVista('agenda', v.st.cursor);
  const fechas = D.diasDeAgenda(dias, r.desde, v.hoy);
  if (!fechas.length) return h('p', { class: 'cal-vacio' }, t('cal.vacio-agenda'));
  return h('div', { class: 'cal-agenda' }, fechas.map((f) =>
    h('section', { class: 'cal-agenda-dia' + (f === v.hoy ? ' cal-hoy' : ''), 'aria-label': fmtDiaLargo(f) },
      h('h2', null, `${fmtDiaLargo(f)}${f === v.hoy ? ' · ' + t('cal.hoy') : ''}`), listaDia(dias.get(f) || [], v))));
}
