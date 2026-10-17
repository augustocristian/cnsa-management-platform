// SVG pieces of the Home dashboard: weekly load chart and attendance donut. Presentation only; the numbers come
// from domain/inicio.js. Colours live in css/views/inicio.css (tokens); only the content colours chosen by the user
// are set inline (through the CSSOM, never as a style attribute string).
import { t, tNum, tContenido, locale } from '../i18n/i18n.js';
import { COLOR_SIN_TIPO } from '../../domain/cargas.js';
import { etiquetaMetros, fechaDe } from '../../domain/inicio.js';

const NS = 'http://www.w3.org/2000/svg';
let uid = 0;

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const k of kids) if (k != null) el.append(k);
  return el;
}
const texto = (attrs, txt) => svg('text', attrs, document.createTextNode(String(txt)));

const fmtM = (n) => tNum(Math.round(Number(n) || 0), { useGrouping: 'always', maximumFractionDigits: 0 });
const separadorDecimal = () => new Intl.NumberFormat(locale()).formatToParts(1.1).find((p) => p.type === 'decimal')?.value || '.';
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// 'lun' / 'Mon' style short weekday of an ISO date, capitalised and without the trailing dot.
export const diaCorto = (iso) => capital(new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(fechaDe(iso)).replace(/\.$/, ''));
export const diaLargo = (iso) => capital(new Intl.DateTimeFormat(locale(), { weekday: 'long' }).format(fechaDe(iso)));

const W = 520, H = 264, L = 44, R = 8, T = 22, B = 34;

// carga: model.carga from inicioService. h: DOM builder. -> <figure>
export function graficoSemanal(h, carga) {
  const { serie, tipos } = carga;
  const id = `ini-gs-${++uid}`;
  const { eje, banda, dias } = serie;
  const dec = separadorDecimal();
  const y = (v) => T + (H - T - B) * (1 - v / eje.tope);
  const slot = (W - L - R) / 7;
  const color = new Map(tipos.map((x) => [x.id, x.color]));
  const nombre = new Map(tipos.map((x) => [x.id, tContenido(x)]));

  const resumen = t('home.grafico.aria', { total: fmtM(dias.reduce((a, d) => a + (d.total || 0), 0)) });
  const root = svg('svg', { class: 'ini-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-labelledby': `${id}-t ${id}-d` },
    svg('title', { id: `${id}-t` }, document.createTextNode(t('home.grafico.titulo'))),
    svg('desc', { id: `${id}-d` }, document.createTextNode(resumen)));

  // Gridlines and round ticks (500, 1k, 2.5k...)
  for (const v of eje.marcas) {
    root.append(svg('line', { class: v === 0 ? 'ini-base' : 'ini-gridline', x1: L, x2: W - R, y1: y(v), y2: y(v) }),
      texto({ class: 'ini-axis', x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, etiquetaMetros(v, dec)));
  }

  // One objective band (daily min..max per swimmer); a lone minimum is a dashed line
  if (banda) {
    if (banda.max > 0) {
      const alto = y(banda.min || 0) - y(banda.max);
      root.append(svg('rect', { class: 'ini-band', x: L, y: y(banda.max), width: W - L - R, height: Math.max(alto, 1) }),
        svg('line', { class: 'ini-band-edge', x1: L, x2: W - R, y1: y(banda.max), y2: y(banda.max) }));
      if (banda.min > 0) root.append(svg('line', { class: 'ini-band-edge', x1: L, x2: W - R, y1: y(banda.min), y2: y(banda.min) }));
    } else root.append(svg('line', { class: 'ini-band-edge', x1: L, x2: W - R, y1: y(banda.min), y2: y(banda.min) }));
  }

  for (const d of dias) {
    const x0 = L + slot * d.indice, bw = slot * 0.56, bx = x0 + (slot - bw) / 2;
    root.append(texto({ class: 'ini-axis' + (d.hoy ? ' ini-axis--hoy' : ''), x: x0 + slot / 2, y: H - 12, 'text-anchor': 'middle' }, diaCorto(d.fecha)));
    if (d.futuro) { // not zero: it has not happened yet
      root.append(svg('rect', { class: 'ini-future', x: bx, y: T, width: bw, height: H - T - B, rx: 4 }));
      continue;
    }
    let acum = 0;
    for (const p of d.porTipo) {
      const r = svg('rect', { class: 'ini-bar', x: bx, y: y(acum + p.metros), width: bw, height: Math.max(y(acum) - y(acum + p.metros), 1), rx: 2 },
        svg('title', {}, document.createTextNode(`${diaLargo(d.fecha)} · ${nombre.get(p.id) || t('tc.sin-clasificar')}: ${fmtM(p.metros)} m`)));
      r.style.fill = color.get(p.id) || COLOR_SIN_TIPO;
      root.append(r);
      acum += p.metros;
    }
    if (d.total > 0) root.append(texto({ class: 'ini-val', x: bx + bw / 2, y: y(d.total) - 5, 'text-anchor': 'middle' }, etiquetaMetros(d.total, dec)));
  }

  // Table alternative for assistive technology (the SVG is an image)
  const objetivo = banda ? (banda.min && banda.max ? `${fmtM(banda.min)}-${fmtM(banda.max)}` : fmtM(banda.max || banda.min)) : '';
  const tabla = h('table', { class: 'sr-only' },
    h('caption', null, t('home.grafico.tabla')),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('home.grafico.th-dia')), h('th', { scope: 'col' }, t('home.grafico.th-total')),
      objetivo ? h('th', { scope: 'col' }, t('home.grafico.th-objetivo')) : null)),
    h('tbody', null, dias.map((d) => h('tr', null,
      h('th', { scope: 'row' }, diaLargo(d.fecha)),
      h('td', null, d.futuro ? t('home.grafico.por-llegar') : `${fmtM(d.total)} m`),
      objetivo ? h('td', null, `${objetivo} m`) : null))));

  const leyenda = h('ul', { class: 'ini-legend' },
    tipos.filter((x) => dias.some((d) => d.porTipo.some((p) => p.id === x.id))).map((x) => {
      const dot = h('span', { class: 'ini-dot', 'aria-hidden': 'true' });
      dot.style.setProperty('--dot', x.color);
      return h('li', null, dot, tContenido(x));
    }),
    banda ? h('li', null, h('span', { class: 'ini-swatch ini-swatch--banda', 'aria-hidden': 'true' }),
      banda.min && banda.max ? t('home.grafico.leyenda-objetivo', { min: fmtM(banda.min), max: fmtM(banda.max) }) : t('home.grafico.leyenda-objetivo-uno', { m: fmtM(banda.max || banda.min) })) : null,
    dias.some((d) => d.futuro) ? h('li', null, h('span', { class: 'ini-swatch ini-swatch--futuro', 'aria-hidden': 'true' }), t('home.grafico.leyenda-futuro')) : null);

  return h('figure', { class: 'ini-chart' },
    h('div', { class: 'ini-chart-scroll', tabindex: '0', role: 'region', 'aria-label': t('home.grafico.region') }, root),
    tabla, leyenda);
}

// Attendance donut. total: {esperados, presentes, ausentes, justificados, sinConfirmar, porcentaje}
export function donutAsistencia(total) {
  const R0 = 48, C = 2 * Math.PI * R0;
  const partes = [['presente', total.presentes], ['ausente', total.ausentes], ['justificado', total.justificados], ['sin', total.sinConfirmar]];
  const root = svg('svg', {
    class: 'ini-donut', viewBox: '0 0 140 140', role: 'img',
    'aria-label': t('home.asis.aria', { presentes: total.presentes, esperados: total.esperados, pct: total.porcentaje ?? 0 }),
  });
  root.append(svg('circle', { class: 'ini-donut-pista', cx: 70, cy: 70, r: R0 }));
  let desde = 0;
  for (const [clave, n] of partes) {
    const len = total.esperados ? (n / total.esperados) * C : 0;
    if (len > 0) {
      root.append(svg('circle', {
        class: `ini-donut-seg ini-donut-seg--${clave}`, cx: 70, cy: 70, r: R0,
        'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -desde, transform: 'rotate(-90 70 70)',
      }));
    }
    desde += len;
  }
  root.append(texto({ class: 'ini-donut-num', x: 70, y: 76, 'text-anchor': 'middle' }, total.porcentaje == null ? '-' : `${total.porcentaje}%`));
  return root;
}
