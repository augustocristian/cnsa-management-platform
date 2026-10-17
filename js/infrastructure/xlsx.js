// Excel (.xlsx) export and import of the club data with SheetJS (loaded lazily, see lazy.js). Does not touch the store.
import { SHEETS, ENTITY_SHEETS } from '../domain/schema.js';
import { normalizarValor, normalizarClub } from '../domain/sheetdata.js';
import { emptyDb } from '../domain/filas.js';
import { validarFila } from '../domain/validacion.js';
import { loadXLSX } from './lazy.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_FILAS = 50000;

function construirLibro(XLSX, { club, db }) {
  const wb = XLSX.utils.book_new();
  const clubRows = Object.keys(club).map((k) => ({ clave: k, valor: club[k] }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clubRows, { header: SHEETS.Club }), 'Club');
  ENTITY_SHEETS.forEach((s) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db[s], { header: SHEETS[s] }), s);
  });
  return wb;
}

// { club, db } -> Blob of the .xlsx workbook
export async function libroABlob(datos) {
  const XLSX = await loadXLSX();
  const out = XLSX.write(construirLibro(XLSX, datos), { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: XLSX_MIME });
}

// .xlsx -> {data, hojas:[{nombre, filas, actuales}], total, duplicados:[{hoja,id}], invalidas:n}. Does not touch the store.
// Normalises types (phone/licence to text, Excel serial dates to ISO) and rejects huge files.
// `actuales` = { club: number of club keys now, filas: (sheet) => number of rows now, hoy: 'YYYY-MM-DD' } (preview counts and the date checks).
export async function leerLibro(file, actuales) {
  if (file && Number(file.size) > MAX_IMPORT_BYTES) throw Object.assign(new Error('El fichero supera los 20 MB.'), { code: 'import-demasiado-grande' });
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const data = { db: emptyDb(), club: {} };
  const rowsOf = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : []);
  const hojas = [];
  const duplicados = [];
  let total = 0;
  let invalidas = 0;
  rowsOf('Club').forEach((r) => { if (r.clave) data.club[String(r.clave)] = normalizarClub(r.valor); });
  hojas.push({ nombre: 'Club', filas: Object.keys(data.club).length, actuales: actuales.club });
  ENTITY_SHEETS.forEach((s) => {
    const crudas = rowsOf(s);
    total += crudas.length;
    if (total > MAX_IMPORT_FILAS) throw Object.assign(new Error('El fichero tiene más de 50.000 filas.'), { code: 'import-demasiadas-filas' });
    const porId = new Map();
    crudas.forEach((r) => {
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = normalizarValor(c, r[c]); });
      if (o.id === '') return;
      o.id = String(o.id);
      if (porId.has(o.id)) duplicados.push({ hoja: s, id: o.id });
      porId.set(o.id, o);
      if (validarFila(s, o, { hoy: actuales.hoy }).length) invalidas++;
    });
    data.db[s] = [...porId.values()];
    hojas.push({ nombre: s, filas: data.db[s].length, actuales: actuales.filas(s) });
  });
  return { data, hojas, total, duplicados, invalidas };
}
