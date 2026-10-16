// Pool planning grids: the day grid (lanes x time slots), the week list of days and the group legend.
// Presentation only. State and actions come in through the `v` object built by planificacion-piscina.js:
//   {pool, dia, semana, grupos, tono(gid), sev: Map(id -> severity), abrir(a), crearEn(row), mover(id, ini, calle, fecha), foco(id)}
import { h } from '../ui.js';
import { t } from '../i18n.js';
import { icon } from '../icons.js';
import * as D from '../domain/planificacion.js';
import { nombreDia, fmtCorta } from './formatos-fecha.js';
import { textoCalles, descripcionBloque, etiquetaBloque, nombreGrupoDe } from './planificacion-textos.js';

export const ALTO_FILA = 26; // px of one time slot in the day grid

function bloque(a, v, nivel, filaIni) {
  const { filas } = D.posicionBloque(a, a.ini, v.pool.intervaloMin);
  const s = v.sev.get(a.id);
  const lbl = etiquetaBloque(a, v.grupos, s);
  const hijos = [
    h('b', null, s ? icon('aviso', { size: 13 }) : null, a.fecha ? icon('calendario', { size: 13 }) : null, nombreGrupoDe(v.grupos, a.grupoId)),
    filas >= 2 ? h('span', null, `${a.horaInicio}–${a.horaFin}`) : null,
    filas >= 3 && a.entrenadorId ? h('span', null, a.entrenadorId) : null,
  ];
  const b = h('button', {
    type: 'button', class: 'pl-block' + (s ? ' sev-' + s : ''),
    style: `grid-row:${filaIni} / span ${filas};grid-column:${a.calleDesde + 1} / ${a.calleHasta + 2};--h:${v.tono(a.grupoId)};margin-left:${1 + nivel * 12}px`,
    'aria-label': lbl, title: lbl, dataset: { id: a.id }, onclick: () => { v.foco(a.id); v.abrir(a); },
  }, hijos);
  b.draggable = true;
  b.addEventListener('dragstart', (e) => { e.dataTransfer?.setData('text/plain', a.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; });
  return b;
}

function celda(v, i, m, c, off, fechaDia, rango) {
  const { pool, dia } = v;
  const fin = D.finPorDefecto(m, rango.hasta, pool.intervaloMin);
  const btn = h('button', {
    type: 'button', class: 'pl-cell' + (off ? ' pl-off' : ''), style: { gridRow: i + 2, gridColumn: c + 1 }, disabled: off, dataset: { calle: c, hora: D.deMin(m) },
    'aria-label': t('plan.hueco-aria', { calle: c, hora: D.deMin(m) }),
    onclick: () => v.crearEn({ piscinaId: pool.id, dia, fecha: '', horaInicio: D.deMin(m), horaFin: D.deMin(fin), calleDesde: c, calleHasta: c }),
  });
  btn.addEventListener('dragover', (e) => { if (!off) { e.preventDefault(); btn.classList.add('pl-over'); } });
  btn.addEventListener('dragleave', () => btn.classList.remove('pl-over'));
  btn.addEventListener('drop', (e) => {
    e.preventDefault();
    btn.classList.remove('pl-over');
    const id = e.dataTransfer?.getData('text/plain');
    if (id && !off) v.mover(id, m, c, fechaDia);
  });
  return btn;
}

// -> {region, doy, sinSitio, abre, cierra, scroll}
export function rejillaDia(v, asigs) {
  const { pool, dia } = v;
  const fecha = D.fechaDeDia(v.semana, dia);
  const doy = D.delDia(asigs, { piscinaId: pool.id, dia, fecha });
  const rango = D.rangoDia(pool, dia, doy);
  const filas = D.franjas(rango.desde, rango.hasta, pool.intervaloMin);
  const horario = pool.horario[dia];
  const abre = horario ? D.aMin(horario.abre) : Number.NaN;
  const cierra = horario ? D.aMin(horario.cierra) : Number.NaN;
  const grid = h('div', {
    class: 'pl-grid', role: 'group', 'aria-label': t('plan.rejilla-aria', { piscina: pool.nombre, dia: nombreDia(dia) }),
    style: { gridTemplateColumns: `52px repeat(${pool.numCalles}, minmax(64px, 1fr))`, gridTemplateRows: `auto repeat(${filas.length}, ${ALTO_FILA}px)` },
  });
  grid.append(h('div', { class: 'pl-head pl-corner', style: { gridRow: 1, gridColumn: 1 } }, ''));
  for (let c = 1; c <= pool.numCalles; c++) grid.append(h('div', { class: 'pl-head', style: { gridRow: 1, gridColumn: c + 1 } }, t('plan.calle', { n: c })));
  filas.forEach((m, i) => {
    const off = !D.franjaAbierta(pool, dia, m);
    const mostrar = pool.intervaloMin >= 30 || m % 30 === 0;
    grid.append(h('div', { class: 'pl-time' + (off ? ' pl-off' : ''), style: { gridRow: i + 2, gridColumn: 1 } }, mostrar ? D.deMin(m) : ''));
    for (let c = 1; c <= pool.numCalles; c++) grid.append(celda(v, i, m, c, off, fecha, rango));
  });
  const nivel = D.niveles(doy);
  doy.filter((a) => D.cabeEnRejilla(a, pool)).forEach((a) => {
    grid.append(bloque(a, v, nivel.get(a.id) || 0, D.posicionBloque(a, rango.desde, pool.intervaloMin).fila + 2));
  });
  const primero = doy.filter((a) => !Number.isNaN(a.ini)).reduce((mn, a) => Math.min(mn, a.ini), Infinity);
  const scroll = Number.isFinite(primero) ? Math.max(0, Math.floor((primero - rango.desde) / pool.intervaloMin) * ALTO_FILA - 8) : 0;
  const region = h('div', {
    class: 'pl-gridwrap', role: 'region', tabindex: 0, 'aria-label': t('plan.rejilla-region', { piscina: pool.nombre, dia: nombreDia(dia) }), dataset: { scroll },
  }, grid);
  return { region, doy, sinSitio: doy.filter((a) => D.fueraDeCalles(a, pool)), abre, cierra, scroll };
}

// Days of the week as sections with their assignments. interactivo = false for the printable copy.
export function listaSemana(v, asigs, interactivo) {
  const { pool } = v;
  const dias = D.DIAS.map((d) => {
    const f = D.fechaDeDia(v.semana, d);
    const lista = D.delDia(asigs, { piscinaId: pool.id, dia: d, fecha: f }).slice().sort((x, y) => x.ini - y.ini || x.calleDesde - y.calleDesde);
    const hr = pool.horario[d];
    const oc = hr ? D.ocupacion(pool, lista, D.aMin(hr.abre), D.aMin(hr.cierra)) : null;
    const items = lista.map((a) => {
      const s = v.sev.get(a.id);
      const hijos = [h('strong', null, s ? icon('aviso', { size: 13 }) : null, a.fecha ? icon('calendario', { size: 13 }) : null, ' ', nombreGrupoDe(v.grupos, a.grupoId)),
        h('small', null, `${a.horaInicio}–${a.horaFin} · ${textoCalles(a.calleDesde, a.calleHasta)}`),
        a.entrenadorId ? h('small', null, a.entrenadorId) : null];
      const at = { class: 'pl-item' + (s ? ' sev-' + s : ''), style: `--h:${v.tono(a.grupoId)}`, 'aria-label': descripcionBloque(a, v.grupos) + (s ? '. ' + t('plan.sev.' + s) : '') };
      return interactivo ? h('button', { ...at, type: 'button', onclick: () => v.abrir(a) }, hijos) : h('div', at, hijos);
    });
    return h('section', { class: 'pl-day', 'aria-label': nombreDia(d) + ' ' + fmtCorta(f) },
      h('h3', null, h('span', null, `${nombreDia(d, 'short')} ${fmtCorta(f)}`), h('small', null, hr ? t('plan.ocupacion-corta', { pct: oc.pct }) : t('plan.cerrado'))),
      items.length ? items : h('p', { class: 'pl-empty' }, hr ? t('plan.sin-asignaciones') : t('plan.cerrado')));
  });
  return h('div', { class: 'pl-week' }, dias);
}

export function leyenda(v, grupos) {
  return h('ul', { class: 'pl-legend', 'aria-label': t('plan.leyenda') },
    grupos.map((g) => h('li', null, h('span', { class: 'pl-sw', style: `--h:${v.tono(g.id)}` }), g.nombre)));
}
