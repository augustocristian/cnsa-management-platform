// PURE validation of rows before they are saved (store.upsert) or imported. No browser dependencies.
// Only what is clearly invalid is rejected; an empty field is always valid (each view decides what is mandatory).

export const EDAD_MINIMA_ANIOS = 1;
export const EDAD_MAXIMA_ANIOS = 110;

// [min, max] per sheet and numeric column.
export const RANGOS = {
  Entrenamientos: { duracionMin: [0, 1440], volumenMin: [0, 200000], volumenMax: [0, 200000] },
  EntrenoLineas: { tiempoMin: [0, 1440], orden: [0, 100000] },
  Cargas: { metros: [0, 100000], rpe: [0, 10], minutos: [0, 1440] },
  Marcas: { tiempoMs: [1, 86400000] },
  Piscinas: { longitudM: [1, 100], numCalles: [1, 50], intervaloMin: [1, 240], maxPorCalle: [0, 200] },
  AsignacionesCalle: { dia: [1, 7], calleDesde: [1, 100], calleHasta: [1, 100] },
  TiposCarga: { minSemanalM: [0, 500000], maxSemanalM: [0, 500000], orden: [0, 100000] },
};
const COLS_FECHA = {
  Nadadores: ['fechaNacimiento'], Entrenamientos: ['fecha'], Cargas: ['fecha'], Marcas: ['fecha'], Comunicaciones: ['fecha'], Banador: ['fecha'],
  AsignacionesCalle: ['fecha'], Temporadas: ['fechaInicio', 'fechaFin'], Fases: ['fechaInicio', 'fechaFin'], SemanasPlan: ['lunes'], EventosTemporada: ['fechaInicio', 'fechaFin'],
};
const COLS_HORA = { Entrenamientos: ['hora'], AsignacionesCalle: ['horaInicio', 'horaFin'] };

const vacio = (v) => v === undefined || v === null || v === '';

// 'YYYY-MM-DD' that exists on the calendar (rejects 2026-02-31, 2026-13-01...)
export function esFechaReal(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function esHoraReal(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v));
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

// Completed years at `hoy` ('YYYY-MM-DD') for an ISO birth date.
export function edadEnAnios(nacimiento, hoy) {
  const n = String(nacimiento).split('-').map(Number);
  const h = String(hoy).split('-').map(Number);
  let e = h[0] - n[0];
  if (h[1] < n[1] || (h[1] === n[1] && h[2] < n[2])) e--;
  return e;
}

const hoyISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

// -> [{campo, codigo}] (empty = valid). Codes: fecha-invalida, hora-invalida, numero-invalido, fuera-de-rango, fecha-futura, edad-minima, edad-maxima.
export function validarFila(sheet, row, { hoy = hoyISO() } = {}) {
  const errores = [];
  const r = row || {};
  (COLS_FECHA[sheet] || []).forEach((c) => {
    if (vacio(r[c])) return;
    if (!esFechaReal(r[c])) { errores.push({ campo: c, codigo: 'fecha-invalida' }); return; }
    if (sheet === 'Nadadores' && c === 'fechaNacimiento') {
      if (String(r[c]) > hoy) errores.push({ campo: c, codigo: 'fecha-futura' });
      else if (edadEnAnios(r[c], hoy) < EDAD_MINIMA_ANIOS) errores.push({ campo: c, codigo: 'edad-minima' });
      else if (edadEnAnios(r[c], hoy) > EDAD_MAXIMA_ANIOS) errores.push({ campo: c, codigo: 'edad-maxima' });
    }
  });
  (COLS_HORA[sheet] || []).forEach((c) => { if (!vacio(r[c]) && !esHoraReal(r[c])) errores.push({ campo: c, codigo: 'hora-invalida' }); });
  const rangos = RANGOS[sheet] || {};
  Object.keys(rangos).forEach((c) => {
    if (vacio(r[c])) return;
    const n = typeof r[c] === 'number' ? r[c] : Number(String(r[c]).trim().replace(',', '.'));
    if (typeof r[c] === 'boolean' || !Number.isFinite(n)) errores.push({ campo: c, codigo: 'numero-invalido' });
    else if (n < rangos[c][0] || n > rangos[c][1]) errores.push({ campo: c, codigo: 'fuera-de-rango' });
  });
  return errores;
}

// Repeated ids in a list of rows -> [id, ...]
export function idsDuplicados(rows) {
  const vistos = new Set();
  const dup = new Set();
  (rows || []).forEach((r) => { const id = String(r && r.id); if (vistos.has(id)) dup.add(id); vistos.add(id); });
  return [...dup];
}

// Error with code 'validacion' and the list in .errores (so the view can show them).
export function errorValidacion(sheet, errores) {
  const e = new Error('Datos no válidos en ' + sheet + ': ' + errores.map((x) => x.campo + ' (' + x.codigo + ')').join(', '));
  e.code = 'validacion';
  e.sheet = sheet;
  e.errores = errores;
  return e;
}
