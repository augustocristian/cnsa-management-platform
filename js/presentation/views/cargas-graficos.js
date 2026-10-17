// Weekly load charts: metres per content vs target, and a stacked bar per weekday. Plain HTML/CSS bars (they reflow on
// phones, text keeps its real size). All geometry comes from domain/cargas.js (filasContenidos, segmentosPorDia).
// Colours are the ones of the training-content catalogue, shared by every chart and legend.
import { h } from '../ui.js';
import { t, locale, tContenido } from '../i18n/i18n.js';
import { filasContenidos, segmentosPorDia, COLOR_SIN_TIPO } from '../../domain/cargas.js';
import { chip, fmtM } from './cargas-contenidos.js';

// 1 Jan 2024 is a Monday: reference for localised weekday names (0 = Monday).
const diaCorto = (i) =>
  new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(new Date(2024, 0, 1 + i)).replace('.', '');
const pct = (v) => `${v.toFixed(2)}%`;

export function graficoContenidos(sem) {
  const { filas, sinClasificar } = filasContenidos(sem);
  const lista = h('ul', { class: 'cg-clist', 'aria-label': t('cargas.aria-tipo') });
  for (const f of filas) {
    const objetivo =
      f.min && f.max
        ? t('tc.chart.objetivo', { min: fmtM(f.min), max: fmtM(f.max) })
        : f.min
          ? t('tc.chart.objetivo-min', { min: fmtM(f.min) })
          : f.max
            ? t('tc.chart.objetivo-max', { max: fmtM(f.max) })
            : '';
    const bandaIni = f.pctMin || 0;
    const bandaFin = f.pctMax == null ? 100 : f.pctMax;
    const estado =
      f.estado === 'alto'
        ? h('span', { class: 'cg-flag cg-flag--alto' }, t('tc.exceso', { m: fmtM(f.diferencia) }))
        : f.estado === 'bajo'
          ? h('span', { class: 'cg-flag cg-flag--bajo' }, t('tc.faltan', { m: fmtM(f.diferencia) }))
          : f.estado === 'ok'
            ? h('span', { class: 'cg-flag cg-flag--ok' }, t('tc.estado.ok'))
            : null;
    lista.append(
      h(
        'li',
        { class: 'cg-crow' },
        chip(h, f.tipo),
        h(
          'div',
          { class: 'cg-track', title: objetivo || null },
          f.pctMin != null || f.pctMax != null
            ? h('div', {
                class: 'cg-band',
                style: `left:${pct(bandaIni)};width:${pct(Math.max(0, bandaFin - bandaIni))}`,
              })
            : null,
          h('div', { class: 'cg-fill', style: `width:${pct(f.pct)};background:${f.tipo.color}` }),
          f.pctMin != null
            ? h('i', { class: 'cg-mark cg-mark--mn', style: `left:calc(${pct(f.pctMin)} - 1px)` })
            : null,
          f.pctMax != null
            ? h('i', { class: 'cg-mark cg-mark--mx', style: `left:calc(${pct(f.pctMax)} - 1px)` })
            : null,
        ),
        h('span', { class: 'cg-val' }, `${fmtM(f.metros)} m`, estado),
      ),
    );
  }
  if (sinClasificar.metros > 0) {
    lista.append(
      h(
        'li',
        { class: 'cg-crow' },
        chip(h, null),
        h(
          'div',
          { class: 'cg-track' },
          h('div', { class: 'cg-fill', style: `width:${pct(sinClasificar.pct)};background:${COLOR_SIN_TIPO}` }),
        ),
        h('span', { class: 'cg-val' }, `${fmtM(sinClasificar.metros)} m`),
      ),
    );
  }
  return lista;
}

export function graficoDias(sem) {
  const { dias } = segmentosPorDia(sem);
  const lista = h('ul', { class: 'cg-days', 'aria-label': t('cargas.aria-dia') });
  for (const d of dias) {
    const nombre = diaCorto(d.indice);
    lista.append(
      h(
        'li',
        { class: 'cg-day' },
        h('span', { class: 'sr-only' }, t('cargas.dia-total', { dia: nombre, m: fmtM(d.total) })),
        h('span', { class: 'cg-day-name', 'aria-hidden': 'true' }, nombre),
        h(
          'div',
          { class: 'cg-track', 'aria-hidden': 'true' },
          d.segmentos.map((s) =>
            h('div', {
              class: 'cg-seg',
              style: `width:${pct(s.pct)};background:${s.tipo ? s.tipo.color : COLOR_SIN_TIPO}`,
              title: `${nombre} · ${s.tipo ? tContenido(s.tipo) : t('tc.sin-clasificar')}: ${fmtM(s.metros)} m`,
            }),
          ),
        ),
        h('span', { class: 'cg-total', 'aria-hidden': 'true' }, d.total ? `${fmtM(d.total)} m` : '—'),
      ),
    );
  }
  return lista;
}

// Legend as chips: contents with metres in the week (+ unclassified).
export function leyenda(sem) {
  const usados = sem.tipos.filter((x) => (sem.agregado.metros[x.id] || 0) > 0);
  const extra = sem.agregado.sinClasificar > 0 ? [chip(h, null)] : [];
  return usados.length || extra.length
    ? h(
        'div',
        { class: 'cg-legend' },
        usados.map((x) => chip(h, x)),
        extra,
      )
    : null;
}
