// Sport-profile sections of the swimmer file: attendance, training loads and personal bests.
// All numbers come from nadadoresService.ficha(); this module only draws them.
import { h, badge, fmtTime } from '../ui.js';
import { icon } from '../icons.js';
import { t, tDate, tNum, tEstado } from '../i18n/i18n.js';
import { indicePorNombre, normalizarNombre } from '../../domain/cargas.js';
import { crearServicio, chip, injectStyle as injectContenidos } from './cargas-contenidos.js';
import { graficoEvolucion } from './nadadores-grafico.js';

const TONO_ESTADO = { presente: 'ok', ausente: 'danger', justificado: 'info' };

export function seccion(titulo, ...contenido) {
  return h('section', { class: 'card nad-section' }, h('h2', null, titulo), contenido);
}
const stat = (valor, etiqueta) => h('div', { class: 'stat nad-stat' }, h('span', { class: 'stat-value' }, valor), h('span', { class: 'stat-label' }, etiqueta));
const sinDatos = (texto) => h('p', { class: 'muted' }, texto);
const tabla = (columnas, filas) => h('div', { class: 'table-wrap' }, h('table', { class: 'table table--cards' },
  h('thead', null, h('tr', null, columnas.map(([k, c]) => h('th', { scope: 'col', class: c }, t(k))))), h('tbody', null, filas)));

export function seccionAsistencia({ resumen, recientes }) {
  if (!resumen.total) return seccion(t('nadadores.asistencia'), sinDatos(t('nadadores.sin-asistencia')));
  return seccion(t('nadadores.asistencia'),
    h('div', { class: 'stats' },
      stat(resumen.presentes, t('nadadores.st-presente')), stat(resumen.ausentes, t('nadadores.st-ausente')),
      stat(resumen.justificados, t('nadadores.st-justificado')), stat(resumen.porcentaje + '%', t('nadadores.st-asistencia'))),
    tabla([['nadadores.col-fecha'], ['nadadores.col-sesion'], ['nadadores.col-estado'], ['nadadores.col-nota']], recientes.map((a) => h('tr', null,
      h('td', { 'data-label': t('nadadores.col-fecha') }, tDate(a.entreno.fecha)),
      h('td', { 'data-label': t('nadadores.col-sesion') }, a.entreno.titulo || ''),
      h('td', { 'data-label': t('nadadores.col-estado') }, badge(tEstado(a.estado) || '', TONO_ESTADO[a.estado] || 'neutral')),
      h('td', { 'data-label': t('nadadores.col-nota') }, a.nota || '')))));
}

export function seccionCargas({ resumen, recientes }, ctx) {
  if (!resumen.sesiones) return seccion(t('nadadores.cargas'), sinDatos(t('nadadores.sin-cargas')));
  injectContenidos();
  const indice = indicePorNombre(crearServicio(ctx).tipos());
  const rpe = resumen.rpeMedio === null ? '-' : tNum(resumen.rpeMedio, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return seccion(t('nadadores.cargas'),
    h('div', { class: 'stats' }, stat(resumen.sesiones, t('nadadores.st-sesiones')), stat(tNum(resumen.metros) + ' m', t('nadadores.st-metros')), stat(rpe, t('nadadores.st-rpe'))),
    tabla([['nadadores.col-fecha'], ['nadadores.col-tipo'], ['nadadores.col-metros', 'num'], ['nadadores.col-rpe', 'num'], ['nadadores.col-min', 'num'], ['nadadores.col-notas']], recientes.map((r) => h('tr', null,
      h('td', { 'data-label': t('nadadores.col-fecha') }, tDate(r.fecha)),
      h('td', { 'data-label': t('nadadores.col-tipo') }, r.tipo ? chip(h, indice.get(normalizarNombre(r.tipo)), r.tipo) : ''),
      h('td', { 'data-label': t('nadadores.col-metros'), class: 'num' }, r.metros ? tNum(r.metros) : ''),
      h('td', { 'data-label': t('nadadores.col-rpe'), class: 'num' }, r.rpe || ''),
      h('td', { 'data-label': t('nadadores.col-min'), class: 'num' }, r.minutos || ''),
      h('td', { 'data-label': t('nadadores.col-notas') }, r.notas || '')))));
}

export function seccionMarcas(pruebas) {
  if (!pruebas.length) return seccion(t('nadadores.evolucion'), sinDatos(t('nadadores.sin-marcas')));
  return seccion(t('nadadores.evolucion'), pruebas.map((p) => h('div', { class: 'nad-chartbox' },
    h('h3', null, p.clave, ' ', badge(t('nadadores.pb', { t: fmtTime(p.mejor) }), 'ok')),
    p.lista.length > 1 ? graficoEvolucion(p) : null,
    tabla([['nadadores.col-fecha'], ['nadadores.col-tiempo', 'num'], ['nadadores.col-competicion']], [...p.lista].reverse().map((m) => h('tr', null,
      h('td', { 'data-label': t('nadadores.col-fecha') }, tDate(m.fecha)),
      h('td', { 'data-label': t('nadadores.col-tiempo'), class: 'num' }, fmtTime(m.tiempoMs), Number(m.tiempoMs) === p.mejor ? [' ', icon('trofeo', { size: 14, class: 'icon-inline' }), h('span', { class: 'sr-only' }, t('nadadores.mejor-marca'))] : ''),
      h('td', { 'data-label': t('nadadores.col-competicion') }, m.competicion || '')))))));
}
