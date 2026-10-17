// Domain of training loads. PURE: no DOM, store, network or i18n.
// Content catalogue (TiposCarga sheet), name normalisation, validation, seeding/migration
// of legacy data, weekly aggregates per content and goal evaluation.
//
// Convenciones:
// - Stored values are Spanish. Cargas.tipo stores the NAME of the content (compatible with legacy data
//   and readable in Excel); comparison is always by normalised name (no accents, case-insensitive).
// - Predefined contents have a stable id `tc-<clave>`, so seeding is idempotent even if two
//   devices of the same person open the club at once (the merge by id does not duplicate).

import { lunesDe as lunesDeIso, addDias, fechaValida } from './calendario.js';

export const CATEGORIAS_TIPO = ['intensidad', 'especifico', 'personalizado'];
export const NOMBRE_MAX = 60;
export const DESCRIPCION_MAX = 240;
export const COLOR_SIN_TIPO = '#9aa4b2';
export const PREFIJO_ID = 'tc-';

// Colours for new contents (different from the predefined ones, readable on white).
export const COLORES_PERSONALIZADOS = [
  '#6d4c9f',
  '#0b7285',
  '#a1887f',
  '#c2185b',
  '#5c7c1e',
  '#e07b00',
  '#3f6fb5',
  '#7a5c00',
];

// Predefined catalogue. `nombre` and `descripcion` are the stored value (Spanish); the view translates them
// with the keys `tc.<clave>.nombre` / `tc.<clave>.desc`.
export const CATALOGO_PREDEFINIDO = Object.freeze(
  [
    {
      clave: 'aerobico-ligero',
      alias: ['AeL', 'Ae1'],
      nombre: 'Aeróbico ligero',
      categoria: 'intensidad',
      orden: 1,
      color: '#2e9e73',
      descripcion:
        'Esfuerzo suave (<60-75 % de FC o Borg 4-5/10), duración larga, ideal para calentamiento y recuperación.',
    },
    {
      clave: 'aerobico-medio',
      alias: ['AeM', 'Ae2', 'Umbral', 'CSS'],
      nombre: 'Aeróbico medio / Umbral anaeróbico',
      categoria: 'intensidad',
      orden: 2,
      color: '#1a73e8',
      descripcion: 'Ritmo sostenido (tipo CSS, Critical Swim Speed), base del fondo aeróbico.',
    },
    {
      clave: 'aerobico-intenso',
      alias: ['AeI', 'Ae3', 'VO2'],
      nombre: 'Aeróbico intenso / Potencia aeróbica',
      categoria: 'intensidad',
      orden: 3,
      color: '#7e57c2',
      descripcion: 'Cerca del VO2 máx, intervalos exigentes con descansos controlados.',
    },
    {
      clave: 'anaerobico',
      alias: ['Lac', 'Lactico'],
      nombre: 'Anaeróbico / Tolerancia al lactato',
      categoria: 'intensidad',
      orden: 4,
      color: '#e8710a',
      descripcion: 'Series de alta intensidad para soportar la acumulación de ácido láctico.',
    },
    {
      clave: 'alactico',
      alias: ['Sprint', 'Tope', 'Alactico', 'Alac'],
      nombre: 'Aláctico / Sprint',
      categoria: 'intensidad',
      orden: 5,
      color: '#d93025',
      descripcion: 'Velocidad máxima en distancias cortas (50-100 m) con amplias recuperaciones.',
    },
    {
      clave: 'piernas',
      alias: ['Pn', 'Pies'],
      nombre: 'Piernas',
      categoria: 'especifico',
      orden: 6,
      color: '#00897b',
      descripcion: 'Trabajo específico de patada, con o sin tabla y aletas.',
    },
    {
      clave: 'brazos',
      alias: ['Br'],
      nombre: 'Brazos',
      categoria: 'especifico',
      orden: 7,
      color: '#8d6e63',
      descripcion: 'Trabajo específico de tracción, con pull buoy y palas si se desea.',
    },
    {
      clave: 'tecnica',
      alias: ['Tec'],
      nombre: 'Técnica',
      categoria: 'especifico',
      orden: 8,
      color: '#3949ab',
      descripcion: 'Ejercicios para mejorar el gesto y la eficiencia en cada estilo.',
    },
    {
      clave: 'salidas',
      alias: ['Sal'],
      nombre: 'Salidas',
      categoria: 'especifico',
      orden: 9,
      color: '#b08900',
      descripcion: 'Salidas desde el poyete y primeros metros bajo el agua.',
    },
    {
      clave: 'virajes',
      alias: ['Vir', 'Vol'],
      nombre: 'Virajes/volteos',
      categoria: 'especifico',
      orden: 10,
      color: '#00acc1',
      descripcion: 'Aproximación, giro e impulso en la pared en cada estilo.',
    },
  ].map((c) => Object.freeze({ ...c, id: PREFIJO_ID + c.clave })),
);

// ---------- Utilidades ----------
// Name comparison key: no accents, lower case, collapsed spaces and no spaces around "/".
export function normalizarNombre(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim();
}

const aBool = (v, defecto) => {
  if (v === true || v === false) return v;
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (s === '') return defecto;
  return !['false', 'no', '0', 'n'].includes(s);
};
const aNumero = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};
// Goal in metres: > 0 or null (no goal). 0 is equivalent to "no goal", as in the old model.
const objetivo = (v) => {
  const n = aNumero(v);
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
};
export const colorValido = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? '').trim());

// ---------- Aliases (abbreviations coaches use to write the content: AeL, Tope, Pn...) ----------
export const ALIAS_MAX = 8;
export const ALIAS_LARGO_MAX = 24;
// Text "AeL, Ae1; Tope" | list -> list without empty or repeated items (by normalised name).
export function parseAlias(v) {
  const lista = Array.isArray(v) ? v : String(v ?? '').split(/[,;|\n]/);
  const vistos = new Set();
  const out = [];
  lista.forEach((x) => {
    const a = String(x ?? '').trim();
    const k = normalizarNombre(a);
    if (a && !vistos.has(k)) {
      vistos.add(k);
      out.push(a);
    }
  });
  return out;
}
// Default aliases of a predefined content (by stable id tc-<clave>).
export const aliasPredefinido = (id) => {
  const c = CATALOGO_PREDEFINIDO.find((x) => x.id === String(id));
  return c ? c.alias.slice() : [];
};

export const esPredefinido = (t) => !!t && !!t.predefinido;
export const rangoCategoria = (c) => {
  const i = CATEGORIAS_TIPO.indexOf(c);
  return i < 0 ? CATEGORIAS_TIPO.length - 1 : i;
};

// Sheet row -> typed domain object.
export function normalizarTipo(r) {
  const cat = CATEGORIAS_TIPO.includes(r.categoria) ? r.categoria : 'personalizado';
  const orden = aNumero(r.orden);
  return {
    id: String(r.id ?? ''),
    nombre: String(r.nombre ?? '').trim(),
    descripcion: String(r.descripcion ?? '').trim(),
    color: colorValido(r.color) ? String(r.color).trim().toLowerCase() : COLOR_SIN_TIPO,
    categoria: cat,
    orden: orden != null && Number.isFinite(orden) ? orden : 999,
    activo: aBool(r.activo, true),
    predefinido: aBool(r.predefinido, false),
    min: objetivo(r.minSemanalM),
    max: objetivo(r.maxSemanalM),
    // A predefined content without its own aliases uses the factory ones (so clubs created earlier get them too).
    alias: (() => {
      const a = parseAlias(r.alias);
      return a.length ? a : aBool(r.predefinido, false) ? aliasPredefinido(r.id) : [];
    })(),
  };
}

// Domain object -> sheet row (plain values).
export function filaTipo(t) {
  return {
    id: t.id,
    nombre: t.nombre,
    descripcion: t.descripcion || '',
    color: t.color,
    categoria: t.categoria,
    orden: t.orden,
    activo: t.activo ? 'true' : 'false',
    predefinido: t.predefinido ? 'true' : 'false',
    minSemanalM: t.min == null ? '' : t.min,
    maxSemanalM: t.max == null ? '' : t.max,
    alias: parseAlias(t.alias).join(', '),
  };
}

// Display order: category, order and name.
export function ordenarTipos(tipos) {
  return tipos
    .slice()
    .sort(
      (a, b) =>
        rangoCategoria(a.categoria) - rangoCategoria(b.categoria) ||
        a.orden - b.orden ||
        a.nombre.localeCompare(b.nombre, 'es'),
    );
}

// [{categoria, tipos}] only with non-empty categories, in order.
export function agruparPorCategoria(tipos) {
  const orden = ordenarTipos(tipos);
  return CATEGORIAS_TIPO.map((categoria) => ({
    categoria,
    tipos: orden.filter((t) => t.categoria === categoria),
  })).filter((g) => g.tipos.length);
}

export const filtrarActivos = (tipos) => tipos.filter((t) => t.activo);

// Index normalised name -> type.
export function indicePorNombre(tipos) {
  const m = new Map();
  tipos.forEach((t) => {
    const k = normalizarNombre(t.nombre);
    if (k && !m.has(k)) m.set(k, t);
  });
  return m;
}
export function resolverTipo(valor, tipos) {
  const k = normalizarNombre(valor);
  if (!k) return null;
  return tipos.find((t) => normalizarNombre(t.nombre) === k) || null;
}

export function siguienteOrden(tipos) {
  return Math.max(10, ...tipos.map((t) => (Number.isFinite(t.orden) && t.orden < 999 ? t.orden : 0))) + 1;
}
export function siguienteColor(tipos) {
  const usados = tipos.filter((t) => !t.predefinido).length;
  return COLORES_PERSONALIZADOS[usados % COLORES_PERSONALIZADOS.length];
}

// ---------- Validation ----------
// data: {nombre, descripcion, color, min, max} (min/max may come as text). existentes: normalised types.
// -> [{campo, codigo}] (empty = valid). The texts are translated in the view with `tc.err.<codigo>`.
export function validarTipo(data, existentes, { id = '' } = {}) {
  const errores = [];
  const nombre = String(data.nombre ?? '').trim();
  if (!nombre) errores.push({ campo: 'nombre', codigo: 'nombre-vacio' });
  else if (nombre.length > NOMBRE_MAX) errores.push({ campo: 'nombre', codigo: 'nombre-largo' });
  else {
    const k = normalizarNombre(nombre);
    if (existentes.some((t) => t.id !== String(id) && normalizarNombre(t.nombre) === k))
      errores.push({ campo: 'nombre', codigo: 'nombre-duplicado' });
  }
  if (String(data.descripcion ?? '').trim().length > DESCRIPCION_MAX)
    errores.push({ campo: 'descripcion', codigo: 'descripcion-larga' });
  if (data.color != null && data.color !== '' && !colorValido(data.color))
    errores.push({ campo: 'color', codigo: 'color-invalido' });
  const mn = aNumero(data.min),
    mx = aNumero(data.max);
  if (Number.isNaN(mn) || (mn != null && mn < 0)) errores.push({ campo: 'min', codigo: 'objetivo-invalido' });
  if (Number.isNaN(mx) || (mx != null && mx < 0)) errores.push({ campo: 'max', codigo: 'objetivo-invalido' });
  if (mn > 0 && mx > 0 && mn > mx) errores.push({ campo: 'max', codigo: 'minmax' });
  if ('alias' in data) {
    const alias = parseAlias(data.alias);
    const propio = normalizarNombre(nombre);
    const otros = new Set();
    existentes
      .filter((t) => t.id !== String(id))
      .forEach((t) => {
        otros.add(normalizarNombre(t.nombre));
        (t.alias || []).forEach((a) => otros.add(normalizarNombre(a)));
      });
    if (alias.length > ALIAS_MAX) errores.push({ campo: 'alias', codigo: 'alias-muchos' });
    else if (alias.some((a) => a.length > ALIAS_LARGO_MAX)) errores.push({ campo: 'alias', codigo: 'alias-largo' });
    else if (alias.some((a) => otros.has(normalizarNombre(a)) && normalizarNombre(a) !== propio))
      errores.push({ campo: 'alias', codigo: 'alias-duplicado' });
  }
  return errores;
}

// ---------- Seeding and migration ----------
// Missing predefined contents (by id). If a content with the same normalised name and another id already exists
// (e.g. created by hand in Excel) it is not seeded: what exists is respected and the duplicate is avoided.
export function sembrarCatalogo(existentes) {
  const ids = new Set(existentes.map((t) => t.id));
  const nombres = new Set(existentes.map((t) => normalizarNombre(t.nombre)));
  return CATALOGO_PREDEFINIDO.filter((c) => !ids.has(c.id) && !nombres.has(normalizarNombre(c.nombre))).map((c) => ({
    id: c.id,
    nombre: c.nombre,
    descripcion: c.descripcion,
    color: c.color,
    categoria: c.categoria,
    orden: c.orden,
    activo: true,
    predefinido: true,
    min: null,
    max: null,
    alias: c.alias.slice(),
  }));
}

// Migration of legacy data (idempotent):
// - Cargas.tipo and ObjetivosCarga.tipo that do not exist in the catalogue are kept as custom contents
//   ("heredados" = inherited, with their original name). Those matching by name (Piernas, Técnica) use the predefined one.
// - The goals of ObjetivosCarga move to minSemanalM/maxSemanalM of the content (without overwriting one already set)
//   and the old row is removed so it is not migrated again.
// tipos: normalised (the received objects are modified); cargas/objetivos: raw rows. -> {crear:[tipo], actualizar:[tipo], eliminarObjetivos:[id]}
export function migrarHeredados({ tipos, cargas = [], objetivos = [], generarId }) {
  const todos = tipos.slice();
  const porNombre = indicePorNombre(todos);
  const crear = [];
  const actualizar = new Map();
  const nuevo = (nombre) => {
    const t = {
      id: generarId(),
      nombre: String(nombre).trim(),
      descripcion: '',
      color: siguienteColor(todos),
      categoria: 'personalizado',
      orden: siguienteOrden(todos),
      activo: true,
      predefinido: false,
      min: null,
      max: null,
    };
    todos.push(t);
    crear.push(t);
    porNombre.set(normalizarNombre(t.nombre), t);
    return t;
  };
  const usados = new Set(cargas.map((c) => normalizarNombre(c.tipo)).filter(Boolean));
  const eliminarObjetivos = [];
  for (const o of objetivos) {
    const nombre = String(o.tipo ?? '').trim();
    const mn = objetivo(o.minSemanalM),
      mx = objetivo(o.maxSemanalM);
    let t = porNombre.get(normalizarNombre(nombre));
    if (!t && nombre && (mn || mx || usados.has(normalizarNombre(nombre)))) t = nuevo(nombre);
    if (t && (mn || mx) && t.min == null && t.max == null) {
      t.min = mn;
      t.max = mx;
      if (!crear.includes(t)) actualizar.set(t.id, t);
    }
    eliminarObjetivos.push(String(o.id));
  }
  for (const c of cargas) {
    const nombre = String(c.tipo ?? '').trim();
    if (nombre && !porNombre.has(normalizarNombre(nombre))) nuevo(nombre);
  }
  return { crear, actualizar: [...actualizar.values()], eliminarObjetivos };
}

// Seeding + migration in one step (what runs when a club is opened).
// -> {crear:[tipo], actualizar:[tipo], eliminarObjetivos:[id]}; everything empty = nothing to do.
export function prepararCatalogo({ tipos, cargas = [], objetivos = [], generarId }) {
  const sembrados = sembrarCatalogo(tipos);
  const mig = migrarHeredados({ tipos: tipos.map((t) => ({ ...t })).concat(sembrados), cargas, objetivos, generarId });
  return {
    crear: sembrados.concat(mig.crear),
    actualizar: mig.actualizar.filter((t) => !sembrados.includes(t)),
    eliminarObjetivos: mig.eliminarObjetivos,
  };
}

// ---------- Dates (Monday-to-Sunday week) ----------
export const fechaIso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function lunesDe(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export function rangoSemana(lunes) {
  const fin = new Date(lunes);
  fin.setDate(fin.getDate() + 6);
  return { desde: fechaIso(lunes), hasta: fechaIso(fin) };
}
const diaDeSemana = (iso) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
};

// ---------- Agregados ----------
// Metres of the week [desde, hasta] per content and per day. Without nadadorId, the values are the AVERAGE per swimmer
// with a load recorded that week (so they are comparable with the goals, which are per swimmer). With nadadorId, totals.
// -> { divisor, nadadores, total, metros: {tipoId: m}, sinClasificar, porDia: [7], porDiaTipo: [{tipoId|'': m} x 7] }
export function agregarSemana({ cargas, tipos, desde, hasta, nadadorId = '' }) {
  const indice = indicePorNombre(tipos);
  const filas = cargas.filter((c) => {
    const f = String(c.fecha).slice(0, 10);
    return f >= desde && f <= hasta && (!nadadorId || c.nadadorId === nadadorId);
  });
  const nads = new Set(filas.map((c) => c.nadadorId));
  const divisor = nadadorId ? 1 : Math.max(1, nads.size);
  const metros = Object.fromEntries(tipos.map((t) => [t.id, 0]));
  const porDia = Array(7).fill(0);
  const porDiaTipo = Array.from({ length: 7 }, () => ({}));
  let sinClasificar = 0;
  for (const c of filas) {
    const m = Number(c.metros) || 0;
    const t = indice.get(normalizarNombre(c.tipo));
    const k = t ? t.id : '';
    if (t) metros[t.id] += m;
    else sinClasificar += m;
    const d = diaDeSemana(c.fecha);
    porDia[d] += m;
    porDiaTipo[d][k] = (porDiaTipo[d][k] || 0) + m;
  }
  for (const k of Object.keys(metros)) metros[k] /= divisor;
  for (let i = 0; i < 7; i++) {
    porDia[i] /= divisor;
    for (const k of Object.keys(porDiaTipo[i])) porDiaTipo[i][k] /= divisor;
  }
  const total = porDia.reduce((a, v) => a + v, 0);
  return { divisor, nadadores: nads.size, total, metros, sinClasificar: sinClasificar / divisor, porDia, porDiaTipo };
}

// ---------- Objetivos ----------
// -> {estado: 'sin-objetivo'|'ok'|'bajo'|'alto', diferencia} (diferencia > 0 = metres missing or in excess).
export function evaluarObjetivo(valor, min, max) {
  if (max && valor > max) return { estado: 'alto', diferencia: valor - max };
  if (min && valor < min) return { estado: 'bajo', diferencia: min - valor };
  return { estado: min || max ? 'ok' : 'sin-objetivo', diferencia: 0 };
}

// Evaluation of all active contents with a goal -> [{tipo, metros, min, max, estado, diferencia}] in order.
export function evaluarSemana(agregado, tipos) {
  return ordenarTipos(tipos)
    .filter((t) => t.activo && (t.min || t.max))
    .map((tipo) => {
      const metros = agregado.metros[tipo.id] || 0;
      return { tipo, metros, min: tipo.min, max: tipo.max, ...evaluarObjetivo(metros, tipo.min, tipo.max) };
    });
}

// Total weekly goal per swimmer (sum of the active contents) for the weekly chart line.
export function objetivoTotal(tipos) {
  const act = filtrarActivos(tipos);
  return { min: act.reduce((a, t) => a + (t.min || 0), 0), max: act.reduce((a, t) => a + (t.max || 0), 0) };
}

// Contents to show in a chart: the active ones plus the inactive ones with metres that week.
export function tiposVisibles(agregado, tipos) {
  return ordenarTipos(tipos).filter((t) => t.activo || (agregado.metros[t.id] || 0) > 0);
}

// ---------- Weeks as ISO strings (pure; the view decides what "today" is) ----------
// Monday-to-Sunday week that contains the date. -> { lunes, desde, hasta }
export function semanaDe(fecha) {
  const lunes = lunesDeIso(fecha);
  return { lunes, desde: lunes, hasta: addDias(lunes, 6) };
}
export const desplazarSemana = (lunes, semanas) => addDias(lunes, 7 * semanas);

// Loads of the week [desde, hasta] (optionally of one swimmer), newest first.
export function cargasDeSemana(cargas, { desde, hasta, nadadorId = '' }) {
  return cargas
    .filter((c) => {
      const f = String(c.fecha).slice(0, 10);
      return f >= desde && f <= hasta && (!nadadorId || c.nadadorId === nadadorId);
    })
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.id).localeCompare(String(a.id)));
}

// ---------- Validation of a load ----------
// ctx: { nadadorExiste(id), tipo (resolved content | null), sesionExiste(id) }
// -> [{ campo, codigo }]; the view translates the code (cargas.err.<codigo> / tc.err.<codigo>).
export function validarCarga(data, { nadadorExiste = () => true, tipo = null, sesionExiste = () => true } = {}) {
  const errores = [];
  if (!data.nadadorId || !nadadorExiste(data.nadadorId)) errores.push({ campo: 'nadadorId', codigo: 'nadador' });
  if (!fechaValida(data.fecha)) errores.push({ campo: 'fecha', codigo: 'fecha' });
  if (!(Number(data.metros) > 0)) errores.push({ campo: 'metros', codigo: 'metros' });
  const rpe = data.rpe === '' || data.rpe == null ? '' : Number(data.rpe);
  if (rpe !== '' && !(rpe >= 1 && rpe <= 10)) errores.push({ campo: 'rpe', codigo: 'rpe' });
  const minutos = data.minutos === '' || data.minutos == null ? '' : Number(data.minutos);
  if (minutos !== '' && !(minutos > 0)) errores.push({ campo: 'minutos', codigo: 'minutos' });
  if (!tipo) errores.push({ campo: 'tipo', codigo: 'tipo-inexistente' });
  else if (!tipo.activo) errores.push({ campo: 'tipo', codigo: 'tipo-inactivo' });
  const sesion = data.entrenamientoId ? String(data.entrenamientoId) : '';
  if (sesion && !sesionExiste(sesion)) errores.push({ campo: 'entrenamientoId', codigo: 'sesion-inexistente' });
  return errores;
}

// ---------- Weekly targets edited in one table ----------
// entradas: [{ id, min, max }] (text or numbers). Everything is validated first; only the contents whose targets changed
// are returned in `cambios`. -> { errores: [{ id, campo, codigo }], cambios: [{ id, min, max }] }
export function validarObjetivos(entradas, tipos) {
  const errores = [];
  const cambios = [];
  for (const e of entradas) {
    const actual = tipos.find((t) => t.id === e.id);
    if (!actual) continue;
    const mn = aNumero(e.min),
      mx = aNumero(e.max);
    if (Number.isNaN(mn) || (mn != null && mn < 0))
      errores.push({ id: e.id, campo: 'min', codigo: 'objetivo-invalido' });
    if (Number.isNaN(mx) || (mx != null && mx < 0))
      errores.push({ id: e.id, campo: 'max', codigo: 'objetivo-invalido' });
    if (mn > 0 && mx > 0 && mn > mx) errores.push({ id: e.id, campo: 'max', codigo: 'minmax' });
    const nuevoMin = objetivo(e.min),
      nuevoMax = objetivo(e.max);
    if (nuevoMin !== actual.min || nuevoMax !== actual.max) cambios.push({ id: e.id, min: nuevoMin, max: nuevoMax });
  }
  return { errores, cambios };
}

// ---------- Chart geometry (percentages of the scale, so any width works) ----------
const porcentaje = (v, max) => (max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0);

// Bars "metres per content vs target" for the week.
// -> { max, filas: [{ tipo, metros, min, max, estado, diferencia, pct, pctMin, pctMax }], sinClasificar: { metros, pct } }
export function filasContenidos(sem) {
  const { agregado, tipos, evaluacion } = sem;
  const visibles = tiposVisibles(agregado, tipos);
  const maximo =
    Math.max(
      1,
      agregado.sinClasificar,
      ...visibles.map((t) => Math.max(agregado.metros[t.id] || 0, t.max || 0, t.min || 0)),
    ) * 1.08;
  const filas = visibles.map((tipo) => {
    const metros = agregado.metros[tipo.id] || 0;
    const ev = evaluacion.find((e) => e.tipo.id === tipo.id);
    return {
      tipo,
      metros,
      min: tipo.min,
      max: tipo.max,
      estado: ev ? ev.estado : 'sin-objetivo',
      diferencia: ev ? ev.diferencia : 0,
      pct: porcentaje(metros, maximo),
      pctMin: tipo.min ? porcentaje(tipo.min, maximo) : null,
      pctMax: tipo.max ? porcentaje(tipo.max, maximo) : null,
    };
  });
  return {
    max: maximo,
    filas,
    sinClasificar: { metros: agregado.sinClasificar, pct: porcentaje(agregado.sinClasificar, maximo) },
  };
}

// Stacked bar per weekday (0 = Monday), segments in the order of the visible contents, unclassified last.
// -> { max, dias: [{ indice, total, pct, segmentos: [{ tipoId, tipo, metros, pct }] }] }
export function segmentosPorDia(sem) {
  const { agregado, tipos } = sem;
  const orden = tiposVisibles(agregado, tipos)
    .map((t) => t.id)
    .concat('');
  const maximo = Math.max(1, ...agregado.porDia) * 1.05;
  const dias = agregado.porDia.map((total, indice) => ({
    indice,
    total,
    pct: porcentaje(total, maximo),
    segmentos: orden
      .filter((id) => (agregado.porDiaTipo[indice][id] || 0) > 0)
      .map((id) => {
        const metros = agregado.porDiaTipo[indice][id];
        return {
          tipoId: id,
          tipo: id ? tipos.find((t) => t.id === id) : null,
          metros,
          pct: porcentaje(metros, maximo),
        };
      }),
  }));
  return { max: maximo, dias };
}
