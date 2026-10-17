// Pure helpers over the in-memory club data ({ db, club }): empty database, clean rows, "is there real data?", file names.
// The id generator is injected (see application/ports/IdGenPort.js): the domain never creates randomness itself.
import { SHEETS, ENTITY_SHEETS } from './schema.js';
import { normalizarValor } from './sheetdata.js';

export function emptyDb() {
  const d = {};
  ENTITY_SHEETS.forEach((s) => { d[s] = []; });
  return d;
}

// Clean row with exactly the sheet's columns (and normalised types: phones/licences as text, ISO dates).
// A row without id gets one from `genId`.
export function cleanRow(sheet, row, genId) {
  const clean = {};
  SHEETS[sheet].forEach((c) => { clean[c] = normalizarValor(c, row[c]); });
  clean.id = row.id !== undefined && row.id !== null && row.id !== '' ? String(row.id) : genId();
  return clean;
}

// Real data = any row outside the auto-seeded content catalogue, or any club key other than the name.
export const hayDatosReales = (db, club) => ENTITY_SHEETS.some((s) => s !== 'TiposCarga' && db[s].length) || Object.keys(club).some((k) => k !== 'nombre');

// "Empty" club document for the daily backup: no real data (the auto-seeded content catalogue and the club name do not count).
export const docVacio = (doc) => !doc || !doc.hojas
  || (Object.keys(doc.hojas).every((k) => k === 'TiposCarga' || !Array.isArray(doc.hojas[k]) || !doc.hojas[k].length) && Object.keys(doc.club || {}).every((k) => k === 'nombre'));

const pad2 = (n) => String(n).padStart(2, '0');
// Local day of a Date as YYYY-MM-DD.
export const fechaIsoLocal = (fecha) => fecha.getFullYear() + '-' + pad2(fecha.getMonth() + 1) + '-' + pad2(fecha.getDate());
// Local day of a Date as YYYYMMDD (one daily backup per day).
export const diaCompacto = (fecha) => fecha.getFullYear() + pad2(fecha.getMonth() + 1) + pad2(fecha.getDate());

// "Club name" -> file name without characters that Drive / file systems reject.
export const nombreArchivo = (nombre, extension) => String(nombre || 'club').replace(/[\\/:*?"<>|]/g, '-') + extension;

export const errSoloLectura = () => Object.assign(new Error('Este club lo guardó una versión más nueva de la aplicación: actualiza la app. Mientras tanto está en solo lectura.'), { code: 'solo-lectura' });
export const errProblema = () => Object.assign(new Error('El fichero del club en Drive necesita tu atención antes de poder guardar.'), { code: 'problema-fichero' });
