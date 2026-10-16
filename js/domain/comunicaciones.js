// Pure rules for notices and notes (no DOM, no storage, no clock: "today" arrives as a parameter).
import { parseFecha } from './categorias.js';

// Filter values: '' = every notice, TODO_EL_CLUB = only the general ones, otherwise a group id.
export const TODO_EL_CLUB = '__todos';
export const DIAS_RELATIVOS = 7;

// Newest first (notices of the same day keep the most recently added first). Returns a new array.
export function ordenarAvisos(avisos) {
  return avisos.map((a, i) => [a, i])
    .sort(([a, i], [b, j]) => String(b.fecha || '').localeCompare(String(a.fecha || '')) || j - i)
    .map(([a]) => a);
}

// Which notices are visible for a filter.
export function filtrarAvisos(avisos, filtro = '') {
  if (filtro === TODO_EL_CLUB) return avisos.filter((a) => !a.grupoId);
  if (filtro) return avisos.filter((a) => a.grupoId === filtro);
  return avisos;
}

// -> [{campo, codigo}]. Codes: titulo-obligatorio, texto-obligatorio.
export function validarAviso({ titulo, texto } = {}) {
  const errores = [];
  if (!String(titulo || '').trim()) errores.push({ campo: 'titulo', codigo: 'titulo-obligatorio' });
  if (!String(texto || '').trim()) errores.push({ campo: 'texto', codigo: 'texto-obligatorio' });
  return errores;
}

// New notice row (without id: the repository assigns it).
export function nuevoAviso({ titulo, texto, grupoId = '' }, { hoyIso, autor = '' }) {
  return { fecha: hoyIso, titulo: String(titulo).trim(), texto: String(texto).trim(), grupoId: grupoId || '', autor };
}

// Plain text to paste in another channel (email, messaging...).
export const textoParaCopiar = (aviso) => `${aviso.titulo}\n\n${aviso.texto}`;

// Whole days from `fecha` to `hoyIso` (null when a date is invalid).
export function diasDesde(fecha, hoyIso) {
  const a = parseFecha(fecha), b = parseFecha(hoyIso);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

// -> {tipo:'hoy'|'ayer'|'dias'|'fecha', n}: "today", "yesterday", "N days ago" up to a week, otherwise a plain date.
export function fechaRelativa(fecha, hoyIso) {
  const d = diasDesde(fecha, hoyIso);
  if (d === null || d < 0 || d > DIAS_RELATIVOS) return { tipo: 'fecha', n: 0 };
  if (d === 0) return { tipo: 'hoy', n: 0 };
  if (d === 1) return { tipo: 'ayer', n: 1 };
  return { tipo: 'dias', n: d };
}
