// Evolution chart of the times of one event (own SVG). The geometry comes from the domain; colours come from CSS tokens.
import { h, fmtTime } from '../ui.js';
import { t, tDate } from '../i18n.js';
import { puntosEvolucion } from '../domain/nadadores.js';

const ANCHO = 560, ALTO = 160;
const NS = 'http://www.w3.org/2000/svg';

export function graficoEvolucion(grupo) {
  const tiempos = grupo.lista.map((m) => Number(m.tiempoMs));
  const { puntos, min, max } = puntosEvolucion(tiempos, { ancho: ANCHO, alto: ALTO });
  const svg = h('svg', { viewBox: `0 0 ${ANCHO} ${ALTO}`, class: 'nad-chart', role: 'img', 'aria-label': t('nadadores.grafico-aria', { prueba: grupo.clave, mejor: fmtTime(grupo.mejor) }) },
    h('polyline', { class: 'nad-line', points: puntos.map((p) => p.join(',')).join(' '), fill: 'none' }));
  puntos.forEach(([x, y], i) => {
    const punto = h('circle', { class: 'nad-dot', cx: x, cy: y, r: 4 });
    const titulo = document.createElementNS(NS, 'title');
    titulo.textContent = `${tDate(grupo.lista[i].fecha)} · ${fmtTime(tiempos[i])}`;
    punto.append(titulo);
    svg.append(punto);
  });
  svg.append(h('text', { class: 'nad-axis', x: 4, y: 12 }, fmtTime(min)), h('text', { class: 'nad-axis', x: 4, y: ALTO - 4 }, fmtTime(max)));
  return svg;
}
