// Dominio puro de las categorías de natación: se calculan por año de nacimiento (y sexo) y por temporada.
// Sin DOM, sin E/S y sin reloj: la fecha "de hoy" siempre llega por parámetro (o se deriva de una fecha dada).
//
// Reglas (referencia RFEN; la temporada empieza el 1 de septiembre y se identifica por su año de inicio):
//  - La categoría depende del año de nacimiento (no del mes) y de la temporada: edad = añoInicioTemporada - añoNacimiento.
//  - Tabla por defecto (idéntica para F y M, editable por sexo): Pre-Benjamín 8; Benjamín 9-10; Alevín 11-12;
//    Infantil 13-14; Junior 15-17; Absoluto 18 o más. En la temporada 2026-2027 eso da: 2018 / 2016-2017 / 2014-2015 /
//    2012-2013 / 2009-2011 / 2008 y anteriores.
//  - Master: no depende sólo del año: exige licencia máster Y una edad mínima (por defecto 25 años en la temporada).
//  - Un nadador más joven que la tabla recibe Pre-Benjamín con aviso 'por-debajo-edad'.
//  - Ninguna función lanza: ante datos inválidos devuelven "sin categoría" ('').

export const MASTER = 'Master';
// Categorías que dependen de la edad, de menor a mayor (Master va aparte, después).
export const CATEGORIAS_POR_EDAD = ['Pre-Benjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto'];
export const CATEGORIAS_ORDEN = [...CATEGORIAS_POR_EDAD, MASTER];
export const SEXOS = ['F', 'M'];
export const EDAD_MINIMA_MASTER = 25;
export const MES_INICIO_TEMPORADA = 9; // septiembre
const ANIO_MIN = 1900, ANIO_MAX = 2200;

// Edades (años cumplidos en el año de inicio de temporada) por categoría: [mínima, máxima|null]. Absoluto es abierta por arriba.
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

// ---------- Fechas y temporadas ----------
const pad = (n) => String(n).padStart(2, '0');

// 'YYYY-MM-DD' (o con hora) o Date -> {y, m, d} si es una fecha real del calendario; si no, null.
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

// Año de inicio de la temporada a la que pertenece una fecha (1 sep. -> 31 ago.), o null si la fecha no es válida.
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

// Años cumplidos a la fecha `hoy`; '' si alguna fecha no es válida.
export function edadCumplida(fechaNacimiento, hoy) {
  const n = parseFecha(fechaNacimiento), h = parseFecha(hoy);
  if (!n || !h) return '';
  let e = h.y - n.y;
  if (h.m < n.m || (h.m === n.m && h.d < n.d)) e--;
  return e < 0 ? '' : e;
}

// ---------- Configuración (tabla de edades por sexo y edad mínima máster) ----------
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

// Errores de una tabla de edades de un sexo: [{codigo, categoria}]. Debe ser contigua, creciente y abierta por arriba.
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

// Errores de una configuración completa: [{codigo, sexo?, categoria?}]
export function validarConfig(config) {
  const errores = [];
  const c = config && typeof config === 'object' ? config : {};
  const em = aEntero(c.edadMinimaMaster);
  if (em === null || em < 18 || em > 120) errores.push({ codigo: 'edad-master-invalida' });
  SEXOS.forEach((s) => validarEdades(c.edades && c.edades[s]).forEach((e) => errores.push({ ...e, sexo: s })));
  return errores;
}

// Acepta un objeto o un JSON (texto guardado en la configuración del club) y devuelve SIEMPRE una configuración válida:
// lo que falta o es inválido se sustituye por los valores por defecto (por sexo, y la edad máster por separado).
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

// ¿Dos sexos comparten la misma tabla?
export const tablasIguales = (config) => JSON.stringify(config.edades.F) === JSON.stringify(config.edades.M);

// ---------- Tabla de una temporada ----------
// Filas [{categoria, desde, hasta, edadMin, edadMax, master?}] ordenadas; desde/hasta = años de nacimiento (desde = más antiguo,
// null si no tiene límite por abajo, p. ej. Absoluto). La fila Master (master:true) usa sólo la edad mínima: hasta = año máximo.
// sexo desconocido -> tabla de F (si F y M difieren no hay forma de saber; categoriaDe lo señala con 'sin-sexo').
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

// Rango de años de nacimiento de una categoría en una temporada, o null si no existe.
export function rangoAnios(categoria, temporada, opciones) {
  const f = tablaCategorias(temporada, opciones).find((x) => x.categoria === categoria);
  return f ? { desde: f.desde, hasta: f.hasta, master: !!f.master, edadMin: f.edadMin, edadMax: f.edadMax } : null;
}

// ---------- Cálculo de la categoría ----------
// nadador: {fechaNacimiento, sexo, licenciaMaster}. -> {categoria, origen, avisos, edad, anioNacimiento, sexo}
//  categoria '' = sin categoría (origen 'sin-fecha' | 'sin-temporada' | 'sin-sexo'); origen: 'edad' | 'master'.
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

// Categoría que manda para un nadador: la manual si está escrita; si no, la calculada.
// -> {categoria, manual, ...resultado de categoriaDe}
export function categoriaVigente(nadador, temporada, config) {
  const calc = categoriaDe(nadador, temporada, config);
  const manual = String((nadador && nadador.categoriaManual) ?? '').trim();
  return manual ? { ...calc, categoria: manual, manual: true, calculada: calc.categoria } : { ...calc, manual: false, calculada: calc.categoria };
}

export const ordenCategoria = (c) => { const i = CATEGORIAS_ORDEN.indexOf(c); return i < 0 ? CATEGORIAS_ORDEN.length : i; };

const nombreDe = (n) => `${n.nombre || ''} ${n.apellidos || ''}`.trim();

// Quién cambia de categoría al pasar de la temporada `de` a la `a`. Los nadadores con categoría manual no cambian y se omiten.
// -> [{id, nombre, apellidos, de, a, sube}] ordenado por categoría de destino y apellidos.
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
