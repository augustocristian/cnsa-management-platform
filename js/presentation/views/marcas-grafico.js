// Evolution chart of a swimmer's times in one event (own SVG). Geometry comes from domain/marcas.js (escalaEvolucion).
// The SVG is drawn 1:1 and sits in a scroll box on narrow screens so the 12 px labels stay readable.
import { h } from '../ui.js';
import { t, tDate, locale } from '../i18n/i18n.js';
import { escalaEvolucion } from '../../domain/marcas.js';
import { fmtTiempo } from '../../domain/tiempos.js';

const NS = 'http://www.w3.org/2000/svg';
// <title> child (native tooltip). h() would create an HTML element for it, so build it in the SVG namespace.
function titulo(texto) {
  const el = document.createElementNS(NS, 'title');
  el.textContent = texto;
  return el;
}
const fechaCorta = (f) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f));
  if (!m) return String(f);
  return new Intl.DateTimeFormat(locale(), { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(+m[1], +m[2] - 1, +m[3]));
};

// serie: { marcas } from elegirSerie; textoBanador(marca) -> string ('' = none)
export function graficoEvolucion(serie, { textoBanador = () => '' } = {}) {
  const g = escalaEvolucion(serie.marcas);
  const { x0, x1, y1 } = g.area;
  const svg = h('svg', { viewBox: `0 0 ${g.ancho} ${g.alto}`, class: 'mc-svg', role: 'img', 'aria-label': t('marcas.aria-evol') });
  g.ejeY.forEach((p) => svg.append(
    h('line', { class: 'mc-grid', x1: x0, x2: x1, y1: p.y, y2: p.y }),
    h('text', { x: x0 - 8, y: p.y + 4, 'text-anchor': 'end' }, fmtTiempo(p.ms))));
  svg.append(h('polyline', { class: 'mc-line', points: g.puntos.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }));
  g.puntos.forEach((p) => {
    const suit = textoBanador(p.marca);
    const c = h('circle', { class: 'mc-dot' + (p.mejor ? ' mc-dot--pb' : ''), cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: p.mejor ? 7 : 5 });
    c.append(titulo(`${tDate(p.marca.fecha)} · ${fmtTiempo(p.marca.tiempoMs)}${p.mejor ? ' · ' + t('marcas.pb') : ''}${p.marca.competicion ? ' · ' + p.marca.competicion : ''}${suit ? ' · ' + suit : ''}`));
    svg.append(c);
    if (p.mejor) svg.append(h('text', { class: 'mc-pb-label', x: p.x.toFixed(1), y: (p.y - 12).toFixed(1), 'text-anchor': 'middle' }, t('marcas.pb')));
  });
  g.ejeX.forEach((p) => svg.append(h('text', { x: p.x.toFixed(1), y: y1 + 22, 'text-anchor': 'middle' }, fechaCorta(p.fecha))));

  const caja = h('div', { class: 'mc-scroll', tabindex: '0', role: 'region', 'aria-label': t('marcas.aria-scroll') }, svg);
  queueMicrotask(() => { caja.scrollLeft = caja.scrollWidth; }); // show the most recent times first on phones
  const leyenda = h('ul', { class: 'mc-legend' },
    h('li', null, h('span', { class: 'mc-key', 'aria-hidden': 'true' }), t('marcas.evol-marca')),
    h('li', null, h('span', { class: 'mc-key mc-key--pb', 'aria-hidden': 'true' }), t('marcas.evol-mejor')));
  return h('div', null, caja, leyenda);
}
