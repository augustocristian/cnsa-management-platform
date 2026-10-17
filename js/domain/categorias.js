// Pure domain of swimming categories: computed from the year of birth (and sex) and the season.
// No DOM, no I/O and no clock: "today" always arrives as a parameter (or is derived from a given date).
//
// Rules (RFEN reference; the season starts on 1 September and is identified by its start year):
//  - The category depends on the year of birth (not the month) and on the season: age = seasonStartYear - birthYear.
//  - Default table (identical for F and M, editable per sex): Pre-Benjamín 8; Benjamín 9-10; Alevín 11-12;
//    Infantil 13-14; Junior 15-17; Absoluto 18 or more. In season 2026-2027 that gives: 2018 / 2016-2017 / 2014-2015 /
//    2012-2013 / 2009-2011 / 2008 and earlier.
//  - Master: does not depend on the year only: it needs a master licence AND a minimum age (25 years in the season by default).
//  - A swimmer younger than the table gets Pre-Benjamín with the warning 'por-debajo-edad' (below age).
//  - No function throws: with invalid data they return "no category" ('').

export const MASTER = 'Master';
// Age-dependent categories, from youngest to oldest (Master is separate, after them).
export const CATEGORIAS_POR_EDAD = ['Pre-Benjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto'];
export const CATEGORIAS_ORDEN = [...CATEGORIAS_POR_EDAD, MASTER];
export const SEXOS = ['F', 'M'];
export const EDAD_MINIMA_MASTER = 25;
export const MES_INICIO_TEMPORADA = 9; // septiembre
const ANIO_MIN = 1900, ANIO_MAX = 2200;

// Ages (completed years in the season start year) per category: [min, max|null]. Absoluto is open-ended.
export const EDADES_POR_DEFECTO = Object.freeze({
  'Pre-Benjamín': [8, 8],
  'Benjamín': [9, 10],
  'Alevín': [11, 12],
  'Infantil': [13, 14],
  'Junior': [15, 17],
  'Absoluto': [18, null],
});

const esEntero = (v) => typeof v === 'number' && Number.isInteger(v);
const aEntero = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'));
  return Number.isInteger(n) ? n : null;
};

// ---------- Dates and seasons ----------
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' (or with a time) or Date -> {y, m, d} if it is a real calendar date; otherwise null.
export function parseFecha(f) {
  let y, m, d;
  if (f instanceof Date) {
    if (isNaN(f.getTime())) return null;
    y = f.getFullYear(); m = f.getMonth() + 1; d = f.getDate();
  } else if (typeof f === 'string') {
    const r = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(f.trim());
    if (!r) return null;
    y = Number(r[1]); m = Number(r[2]); d = Number(r[3]);
  } else return null;
  if (y < ANIO_MIN || y > ANIO_MAX || m < 1 || m > 12 || d < 1) return null;
  const dias = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dias ? { y, m, d } : null;
}

// Start year of the season a date belongs to (1 Sep -> 31 Aug), or null if the date is not valid.
export function temporadaDe(fecha) {
  const p = parseFecha(fecha);
  return p ? (p.m >= MES_INICIO_TEMPORADA ? p.y : p.y - 1) : null;
}

// 2026 -> '2026-2027'
export function etiquetaTemporada(anio) {
  const a = aEntero(anio);
  return a === null ? '' : `${a}-${a + 1}`;
}

// 2026 | '2026' | '2026-2027' | '2026/27' | '2026-27' -> 2026; otra cosa -> null.
export function parseTemporada(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return esEntero(v) && v >= ANIO_MIN && v <= ANIO_MAX ? v : null;
  const r = /^\s*(\d{4})(?:\s*[-/]\s*(\d{2}|\d{4}))?\s*$/.exec(String(v));
  if (!r) return null;
  const a = Number(r[1]);
  if (a < ANIO_MIN || a > ANIO_MAX) return null;
  if (r[2] !== undefined) {
    const fin = r[2].length === 2 ? Math.floor(a / 100) * 100 + Number(r[2]) : Number(r[2]);
    if (fin !== a + 1 && !(r[2].length === 2 && (a + 1) % 100 === Number(r[2]))) return null;
  }
  return a;
}

// {inicio:'2026-09-01', fin:'2027-08-31'}
export function limitesTemporada(anio) {
  const a = aEntero(anio);
  return a === null ? null : { inicio: `${a}-${pad(MES_INICIO_TEMPORADA)}-01`, fin: `${a + 1}-08-31` };
}

// Completed years at the date `hoy`; '' if any date is not valid.
export function edadCumplida(fechaNacimiento, hoy) {
  const n = parseFecha(fechaNacimiento), h = parseFecha(hoy);
  if (!n || !h) return '';
  let e = h.y - n.y;
  if (h.m < n.m || (h.m === n.m && h.d < n.d)) e--;
  return e < 0 ? '' : e;
}

// ---------- Configuration (age table per sex and minimum master age) ----------
export function sexoNormalizado(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (['f', 'fem', 'femenino', 'mujer', 'female', 'woman', 'w'].includes(s)) return 'F';
  if (['m', 'masc', 'masculino', 'hombre', 'male', 'man', 'h'].includes(s)) return 'M';
  return '';
}

export function esVerdadero(v) {
  if (v === true) return true;
  return ['true', 'si', 'sí', 'yes', 'y', 's', '1', 'x'].includes(String(v ?? '').trim().toLowerCase());
}

const copiaEdades = (e) => Object.fromEntries(CATEGORIAS_POR_EDAD.map((c) => [c, [...e[c]]]));

export function configPorDefecto() {
  return { edadMinimaMaster: EDAD_MINIMA_MASTER, edades: { F: copiaEdades(EDADES_POR_DEFECTO), M: copiaEdades(EDADES_POR_DEFECTO) } };
}

// Errors of one sex's age table: [{codigo, categoria}]. It must be contiguous, increasing and open at the top.
export function validarEdades(edades) {
  const errores = [];
  if (!edades || typeof edades !== 'object') return [{ codigo: 'tabla-invalida' }];
  let esperado = null;
  CATEGORIAS_POR_EDAD.forEach((c, i) => {
    const par = edades[c];
    const ultima = i === CATEGORIAS_POR_EDAD.length - 1;
    const min = Array.isArray(par) ? aEntero(par[0]) : null;
    const max = Array.isArray(par) ? aEntero(par[1]) : null;
    if (min === null || min < 0 || min > 120) { errores.push({ codigo: 'edad-invalida', categoria: c }); esperado = null; return; }
    if (esperado !== null && min !== esperado) errores.push({ codigo: 'no-contigua', categoria: c });
    if (ultima) { if (Array.isArray(par) && par[1] !== null && par[1] !== undefined && par[1] !== '') errores.push({ codigo: 'ultima-abierta', categoria: c }); esperado = null; return; }
    if (max === null || max < min || max > 120) { errores.push({ codigo: 'rango-invalido', categoria: c }); esperado = null; return; }
    esperado = max + 1;
  });
  return errores;
}

// Errors of a complete configuration: [{codigo, sexo?, categoria?}]
export function validarConfig(config) {
  const errores = [];
  const c = config && typeof config === 'object' ? config : {};
  const em = aEntero(c.edadMinimaMaster);
  if (em === null || em < 18 || em > 120) errores.push({ codigo: 'edad-master-invalida' });
  SEXOS.forEach((s) => validarEdades(c.edades && c.edades[s]).forEach((e) => errores.push({ ...e, sexo: s })));
  return errores;
}

// Accepts an object or a JSON (text stored in the club configuration) and ALWAYS returns a valid configuration:
// whatever is missing or invalid is replaced by the defaults (per sex, and the master age separately).
export function normalizarConfig(raw) {
  let c = raw;
  if (typeof c === 'string') { try { c = JSON.parse(c); } catch (e) { c = null; } }
  const base = configPorDefecto();
  if (!c || typeof c !== 'object') return base;
  const em = aEntero(c.edadMinimaMaster);
  if (em !== null && em >= 18 && em <= 120) base.edadMinimaMaster = em;
  SEXOS.forEach((s) => {
    const e = c.edades && c.edades[s];
    if (e && !validarEdades(e).length) {
      base.edades[s] = Object.fromEntries(CATEGORIAS_POR_EDAD.map((cat, i) => [cat, [aEntero(e[cat][0]), i === CATEGORIAS_POR_EDAD.length - 1 ? null : aEntero(e[cat][1])]]));
    }
  });
  return base;
}

// Do two sexes share the same table?
export const tablasIguales = (config) => JSON.stringify(config.edades.F) === JSON.stringify(config.edades.M);

// ---------- Table of a season ----------
// Rows [{categoria, desde, hasta, edadMin, edadMax, master?}] sorted; desde/hasta = birth years (desde = oldest,
// null if there is no lower limit, e.g. Absoluto). The Master row (master:true) only uses the minimum age: hasta = maximum year.
// unknown sex -> F table (if F and M differ there is no way to know; categoriaDe flags it with 'sin-sexo').
export function tablaCategorias(temporada, { sexo = 'F', config } = {}) {
  const t = parseTemporada(temporada);
  if (t === null) return [];
  const cfg = normalizarConfig(config);
  const s = sexoNormalizado(sexo) || 'F';
  const filas = CATEGORIAS_POR_EDAD.map((categoria) => {
    const [edadMin, edadMax] = cfg.edades[s][categoria];
    return { categoria, edadMin, edadMax, desde: edadMax === null ? null : t - edadMax, hasta: t - edadMin };
  });
  filas.push({ categoria: MASTER, edadMin: cfg.edadMinimaMaster, edadMax: null, desde: null, hasta: t - cfg.edadMinimaMaster, master: true });
  return filas;
}

// Range of birth years of a category in a season, or null if it does not exist.
export function rangoAnios(categoria, temporada, opciones) {
  const f = tablaCategorias(temporada, opciones).find((x) => x.categoria === categoria);
  return f ? { desde: f.desde, hasta: f.hasta, master: !!f.master, edadMin: f.edadMin, edadMax: f.edadMax } : null;
}

// ---------- Category calculation ----------
// nadador: {fechaNacimiento, sexo, licenciaMaster}. -> {categoria, origen, avisos, edad, anioNacimiento, sexo}
//  categoria '' = no category (origen 'sin-fecha' | 'sin-temporada' | 'sin-sexo'); origen: 'edad' | 'master'.
//  avisos: 'por-debajo-edad' | 'master-edad-insuficiente'
export function categoriaDe(nadador, temporada, config) {
  const vacio = (origen, extra) => ({ categoria: '', origen, avisos: [], edad: '', anioNacimiento: null, sexo: '', ...extra });
  try {
    const n = nadador && typeof nadador === 'object' ? nadador : {};
    const t = parseTemporada(temporada);
    if (t === null) return vacio('sin-temporada');
    const p = parseFecha(n.fechaNacimiento);
    if (!p) return vacio('sin-fecha');
    const cfg = normalizarConfig(config);
    let sexo = sexoNormalizado(n.sexo);
    if (!sexo) {
      if (!tablasIguales(cfg)) return vacio('sin-sexo', { anioNacimiento: p.y });
      sexo = 'F';
    }
    const edad = t - p.y;
    const base = { edad, anioNacimiento: p.y, sexo, avisos: [] };
    if (esVerdadero(n.licenciaMaster)) {
      if (edad >= cfg.edadMinimaMaster) return { ...base, categoria: MASTER, origen: 'master' };
      base.avisos.push('master-edad-insuficiente');
    }
    const e = cfg.edades[sexo];
    if (edad < e[CATEGORIAS_POR_EDAD[0]][0]) {
      base.avisos.push('por-debajo-edad');
      return { ...base, categoria: CATEGORIAS_POR_EDAD[0], origen: 'edad' };
    }
    const cat = CATEGORIAS_POR_EDAD.find((c) => edad >= e[c][0] && (e[c][1] === null || edad <= e[c][1]));
    return { ...base, categoria: cat || '', origen: 'edad' };
  } catch (err) {
    return vacio('sin-fecha');
  }
}

// Category that applies to a swimmer: the manual one if set; otherwise the calculated one.
// -> {categoria, manual, ...result of categoriaDe}
export function categoriaVigente(nadador, temporada, config) {
  const calc = categoriaDe(nadador, temporada, config);
  const manual = String((nadador && nadador.categoriaManual) ?? '').trim();
  return manual ? { ...calc, categoria: manual, manual: true, calculada: calc.categoria } : { ...calc, manual: false, calculada: calc.categoria };
}

export const ordenCategoria = (c) => { const i = CATEGORIAS_ORDEN.indexOf(c); return i < 0 ? CATEGORIAS_ORDEN.length : i; };

const nombreDe = (n) => `${n.nombre || ''} ${n.apellidos || ''}`.trim();

// Who changes category when going from season `de` to `a`. Swimmers with a manual category do not change and are skipped.
// -> [{id, nombre, apellidos, de, a, sube}] sorted by target category and surnames.
export function cambiosDeTemporada(nadadores, de, a, config) {
  const lista = Array.isArray(nadadores) ? nadadores : [];
  if (parseTemporada(de) === null || parseTemporada(a) === null) return [];
  const out = [];
  lista.forEach((n) => {
    if (!n || String(n.categoriaManual ?? '').trim()) return;
    const antes = categoriaDe(n, de, config).categoria;
    const despues = categoriaDe(n, a, config).categoria;
    if (antes === despues || !despues) return;
    out.push({ id: n.id, nombre: n.nombre || '', apellidos: n.apellidos || '', de: antes, a: despues, sube: ordenCategoria(despues) > ordenCategoria(antes) });
  });
  return out.sort((x, y) => ordenCategoria(x.a) - ordenCategoria(y.a) || nombreDe(x).localeCompare(nombreDe(y), 'es'));
}
