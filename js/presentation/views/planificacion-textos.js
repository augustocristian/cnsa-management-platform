// Texts and small labels of the pool planning screens (all through t()). The domain returns conflict CODES plus parameters;
// this module turns them into sentences in the current language.
import { t } from '../i18n/i18n.js';
import { nombreDia, fmtCorta } from './formatos-fecha.js';

export const textoCalles = (desde, hasta) => (desde === hasta ? t('plan.calle-una', { n: desde }) : t('plan.calles-rango', { desde, hasta }));

// Translated message of a domain conflict.
export function mensajeConflicto(c) {
  const p = c.params || {};
  const calles = textoCalles(Number.isNaN(p.desde) ? '?' : p.desde, Number.isNaN(p.hasta) ? '?' : p.hasta);
  const key = c.tipo === 'fuera-horario' && p.cerrado ? 'plan.c.fuera-horario-cerrado' : 'plan.c.' + c.tipo;
  return t(key, { ...p, calles, dia: c.dia >= 1 && c.dia <= 7 ? nombreDia(c.dia) : '?' });
}

export const nombreGrupoDe = (grupos, gid) => (grupos.find((g) => g.id === gid) || {}).nombre || '?';

// Screen-reader description of a grid block / list item.
export function descripcionBloque(a, grupos) {
  return t('plan.bloque-aria', { grupo: nombreGrupoDe(grupos, a.grupoId), dia: nombreDia(a.dia), ini: a.horaInicio, fin: a.horaFin, calles: textoCalles(a.calleDesde, a.calleHasta) });
}

// Full accessible label: description + severity + one-off date.
export function etiquetaBloque(a, grupos, sev) {
  return descripcionBloque(a, grupos) + (sev ? '. ' + t('plan.sev.' + sev) : '') + (a.fecha ? '. ' + t('plan.puntual', { fecha: fmtCorta(a.fecha) }) : '');
}
