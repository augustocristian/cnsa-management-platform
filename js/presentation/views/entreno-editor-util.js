// Small helpers shared by the plan editor sub-views.
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { t, tNum, hasKey } from '../i18n/i18n.js';
import { claveEstilo } from '../../domain/desglose.js';

export const r1 = (n) => Math.round(n * 10) / 10;
export const fmt = (n) => tNum(n, { useGrouping: false });
export const pctTxt = (p) => tNum(p, { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' %';
export const mTxt = (m) => tNum(r1(m), { useGrouping: false, maximumFractionDigits: 1 }) + ' m';
export const estiloTxt = (e) => {
  if (!e) return t('entreno.est.ninguno');
  const k = 'entreno.estilo.' + claveEstilo(e);
  return hasKey(k) ? t(k) : e;
};
// 'a|b|c' dictionary value -> ['a','b','c']
export const lista = (clave) => t(clave).split('|').map((x) => x.trim()).filter(Boolean);

// Icon button (44 px) with an accessible name.
export const ib = (iconName, label, onclick, { danger = false, disabled = false } = {}) =>
  h('button', { type: 'button', class: 'enp-ib' + (danger ? ' enp-del' : ''), 'aria-label': label, title: label, onclick, disabled }, icon(iconName, { size: 18 }));

// Which pane of a row holds each field (fields not listed live in the first line of the row).
export const PANEL_DE = { salida: 'salida', tiempoMin: 'tiempoMin', material: 'material', objetivo: 'objetivo', bloque: 'mas', notas: 'mas' };
