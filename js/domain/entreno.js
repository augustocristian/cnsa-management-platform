// Domain of the detailed training plan: pure logic (no DOM, no store, no fetch, no i18n).
// A session (Entrenamientos sheet) has lines (EntrenoLineas sheet) grouped into SETS:
//   { id, entrenamientoId, set, orden, tiempoMin, objetivo, bloque, series, distancia, salida, ejercicio, material, notas }
// Each row may also carry `componentes` (split of the per-repetition distance among several contents) and `estilos`;
// their logic (parser, split, percentages) is in desglose.js; here the columns are only read/written.
// Dist. Bloque = sets x distance of the row; Dist. Set = sum of the rows of the set; the TOTALS add up the whole session.
// Validation warnings are returned as codes + parameters; the presentation translates them.

import { CATALOGO_PREDEFINIDO } from './cargas.js';

export const CAMPOS_TEXTO = ['objetivo', 'bloque', 'salida', 'ejercicio', 'material', 'notas'];
export const CAMPOS_SUGERIBLES = ['objetivo', 'bloque', 'salida', 'ejercicio', 'material'];
export const TOLERANCIA_CARGA = 0.1; // 10 % difference between the plan and the recorded load

// ---------- Numbers ----------
// Number from text/number; '' -> NaN. Accepts a decimal comma.
export function num(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '')
    .trim()
    .replace(',', '.');
  if (s === '' || !/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
}
const vacio = (v) => String(v ?? '').trim() === '';
const o0 = (n) => (Number.isFinite(n) ? n : 0);

// ---------- Send-offs: C/1'10" (cycle: "cada" = every) and d/15" (rest: "descanso") ----------
// Returns { valido, vacio, tipo: 'ciclo'|'descanso'|'', segundos, texto }. `texto` is the canonical form.
export function parsearSalida(raw) {
  const s0 = String(raw ?? '').trim();
  if (!s0) return { valido: true, vacio: true, tipo: '', segundos: 0, texto: '' };
  const m = /^(?:(cada|c(?:iclo)?|d(?:escanso)?|r(?:est)?)\s*[/:=\s-]?\s*)?(.+)$/i.exec(
    s0.replace(/[´`’‘]/g, "'").replace(/[“”]/g, '"'),
  );
  if (!m) return { valido: false, vacio: false, tipo: '', segundos: NaN, texto: s0 };
  const letra = (m[1] || '').toLowerCase();
  const tipo = !letra ? 'ciclo' : /^d|^r/.test(letra) ? 'descanso' : 'ciclo';
  const cuerpo = m[2].trim();
  const seg = tiempoASegundos(cuerpo);
  if (!Number.isFinite(seg)) return { valido: false, vacio: false, tipo: '', segundos: NaN, texto: s0 };
  return { valido: true, vacio: false, tipo, segundos: seg, texto: textoSalida(tipo, seg) };
}

// "1'10''" | '1\'10"' | '1:10' | '70' | '15"' | '1\'' | '90s' | "1m30" -> seconds (NaN if not valid)
export function tiempoASegundos(s) {
  const x = String(s).trim().replace(/''/g, '"').replace(/\s+/g, '');
  let m = /^(\d+)'(\d{1,2})"?$/.exec(x) || /^(\d+):(\d{2})$/.exec(x) || /^(\d+)m(?:in)?(\d{1,2})s?$/i.exec(x);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = /^(\d+)'$/.exec(x) || /^(\d+)m(?:in)?$/i.exec(x);
  if (m) return Number(m[1]) * 60;
  m = /^(\d+(?:\.\d+)?)(?:"|s|seg)?$/i.exec(x);
  if (m) return Number(m[1]);
  return NaN;
}

// (tipo, segundos) -> C/1'10"  |  d/15"
export function textoSalida(tipo, seg) {
  const mm = Math.floor(seg / 60),
    ss = Math.round(seg % 60);
  const t = mm ? `${mm}'${ss ? String(ss).padStart(2, '0') + '"' : ''}` : `${ss}"`;
  return (tipo === 'descanso' ? 'd/' : 'C/') + t;
}

// ---------- Columns componentes and estilo ----------
// componentes: JSON [{contenido, metrosPorRep, modo: 'auto'|'manual', pct?}]. An 'auto' component without metrosPorRep (null)
// gets its share of the rest of the distance; a manual one with pct uses that percentage of the per-repetition distance.
const r2 = (n) => Math.round(n * 100) / 100;
const numPos = (v) => {
  const n = num(v);
  return Number.isFinite(n) && n >= 0 ? r2(n) : null;
};
function jsonLista(v) {
  if (Array.isArray(v)) return v;
  const s = String(v ?? '').trim();
  if (!s.startsWith('[')) return null;
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) ? a : null;
  } catch (e) {
    return null;
  }
}
export function leerComponentes(v) {
  return (jsonLista(v) || [])
    .filter((c) => c && typeof c === 'object' && String(c.contenido ?? '').trim())
    .map((c) => {
      const pct = numPos(c.pct);
      return {
        contenido: String(c.contenido).trim(),
        metrosPorRep: numPos(c.metrosPorRep),
        modo: c.modo === 'manual' ? 'manual' : 'auto',
        pct: pct > 0 ? pct : null,
      };
    });
}
export function escribirComponentes(arr) {
  const l = leerComponentes(arr);
  return l.length
    ? JSON.stringify(
        l.map((c) => ({
          contenido: c.contenido,
          metrosPorRep: c.metrosPorRep,
          modo: c.modo,
          ...(c.pct ? { pct: c.pct } : {}),
        })),
      )
    : '';
}
// estilo: "Crol" (whole distance) | JSON [{estilo, metrosPorRep}] (per-repetition split among several styles)
export function leerEstilos(v) {
  const lista = jsonLista(v);
  if (lista)
    return lista
      .filter((e) => e && typeof e === 'object' && String(e.estilo ?? '').trim())
      .map((e) => ({ estilo: String(e.estilo).trim(), metrosPorRep: numPos(e.metrosPorRep) }));
  const s = String(v ?? '').trim();
  return s ? [{ estilo: s, metrosPorRep: null }] : [];
}
export function escribirEstilos(arr) {
  const l = leerEstilos(arr);
  if (!l.length) return '';
  return l.length === 1 && l[0].metrosPorRep == null ? l[0].estilo : JSON.stringify(l);
}

// ---------- Normalisation ----------
// Empty -> ''; valid number -> number; any other text is kept as is (so that a warning can say it is not numeric).
function numOTexto(v) {
  if (vacio(v)) return '';
  const n = num(v);
  return Number.isFinite(n) ? n : String(v).trim();
}

export function normalizarLinea(l = {}) {
  const set = Math.max(1, Math.round(num(l.set)) || 1);
  const orden = Math.round(num(l.orden));
  return {
    id: l.id ? String(l.id) : '',
    entrenamientoId: l.entrenamientoId == null ? '' : String(l.entrenamientoId),
    set,
    orden: Number.isFinite(orden) ? orden : 0,
    tiempoMin: numOTexto(l.tiempoMin),
    objetivo: String(l.objetivo ?? ''),
    bloque: String(l.bloque ?? ''),
    series: numOTexto(l.series),
    distancia: numOTexto(l.distancia),
    salida: String(l.salida ?? ''),
    ejercicio: String(l.ejercicio ?? ''),
    material: String(l.material ?? ''),
    notas: String(l.notas ?? ''),
    componentes: leerComponentes(l.componentes),
    estilos: leerEstilos(l.estilos ?? l.estilo),
  };
}

// Normalised row -> sheet row (componentes and estilo as text: JSON or name).
export function serializarLinea(l) {
  const { estilos, ...resto } = normalizarLinea(l);
  return { ...resto, componentes: escribirComponentes(resto.componentes), estilo: escribirEstilos(estilos) };
}

export const lineaVacia = (set = 1, orden = 1) => normalizarLinea({ set, orden });

// Does the row have no content at all?
export function filaVacia(l) {
  return vacio(l.tiempoMin) && vacio(l.series) && vacio(l.distancia) && CAMPOS_TEXTO.every((c) => vacio(l[c]));
}

export function ordenarLineas(lineas) {
  return lineas.slice().sort((a, b) => num(a.set) - num(b.set) || num(a.orden) - num(b.orden));
}

// Consecutive sets and orders (1..n, 1..k) keeping the current order (accepts fractional sets/orders as
// insertion markers). Returns copies.
export function renumerar(lineas) {
  const crudo = lineas.map((l) => {
    const set = num(l.set),
      orden = num(l.orden);
    return { ...normalizarLinea(l), set: Number.isFinite(set) ? set : 1, orden: Number.isFinite(orden) ? orden : 0 };
  });
  const orden = crudo.slice().sort((a, b) => a.set - b.set || a.orden - b.orden);
  const mapa = new Map();
  const cnt = new Map();
  orden.forEach((l) => {
    if (!mapa.has(l.set)) mapa.set(l.set, mapa.size + 1);
  });
  return orden.map((l) => {
    const s = mapa.get(l.set);
    cnt.set(s, (cnt.get(s) || 0) + 1);
    return { ...l, set: s, orden: cnt.get(s) };
  });
}

// ---------- Calculation ----------
// Effective sets: empty ones with a distance -> 1.
export function seriesEfectivas(l) {
  const s = num(l.series);
  if (Number.isFinite(s)) return s;
  return vacio(l.series) && Number.isFinite(num(l.distancia)) ? 1 : 0;
}
export function distanciaBloque(l) {
  const d = num(l.distancia);
  if (!Number.isFinite(d)) return 0;
  return seriesEfectivas(l) * d;
}
// Estimated seconds of a row with a cycle-type send-off (sets x cycle); 0 if it cannot be known.
export function segundosEstimados(l) {
  const s = parsearSalida(l.salida);
  return s.valido && s.tipo === 'ciclo' ? seriesEfectivas(l) * s.segundos : 0;
}

// -> [{ set, lineas: [{...linea, distBloque}], distSet, tiempoMin }] (sets in order)
export function agruparSets(lineas) {
  const mapa = new Map();
  ordenarLineas(lineas.map(normalizarLinea)).forEach((l) => {
    if (!mapa.has(l.set)) mapa.set(l.set, []);
    mapa.get(l.set).push({ ...l, distBloque: distanciaBloque(l) });
  });
  return [...mapa.entries()].map(([set, ls]) => ({
    set,
    lineas: ls,
    distSet: ls.reduce((a, l) => a + l.distBloque, 0),
    tiempoMin: ls.reduce((a, l) => a + o0(num(l.tiempoMin)), 0),
  }));
}

// -> { metros, tiempoMin, sets, filas }  (only rows with content count)
export function totales(lineas) {
  const sets = agruparSets(lineas.filter((l) => !filaVacia(normalizarLinea(l))));
  return {
    metros: sets.reduce((a, s) => a + s.distSet, 0),
    tiempoMin: sets.reduce((a, s) => a + s.tiempoMin, 0),
    sets: sets.length,
    filas: sets.reduce((a, s) => a + s.lineas.length, 0),
  };
}

// Summary: totals + distinct goals + breakdown per set (for lists and headers).
export function resumen(lineas) {
  const tot = totales(lineas);
  const sets = agruparSets(lineas.filter((l) => !filaVacia(normalizarLinea(l)))).map((s) => ({
    set: s.set,
    metros: s.distSet,
    tiempoMin: s.tiempoMin,
    filas: s.lineas.length,
  }));
  const objetivos = [];
  ordenarLineas(lineas.map(normalizarLinea)).forEach((l) => {
    const o = l.objetivo.trim();
    if (o && !objetivos.some((x) => x.toLowerCase() === o.toLowerCase())) objetivos.push(o);
  });
  return { ...tot, porSet: sets, objetivos };
}

// ---------- Carga registrada ----------
// Average metres of the loads recorded for the session (0 if none).
export function cargaRegistrada(cargas, entrenamientoId) {
  const m = (cargas || [])
    .filter((c) => String(c.entrenamientoId) === String(entrenamientoId))
    .map((c) => num(c.metros))
    .filter((x) => Number.isFinite(x) && x > 0);
  return m.length ? Math.round(m.reduce((a, b) => a + b, 0) / m.length) : 0;
}

// ---------- Validation ----------
// -> [{ severidad: 'error'|'aviso', codigo, set?, orden?, campo?, params? }]
export function validarLinea(l) {
  const out = [];
  const pos = { set: l.set, orden: l.orden };
  const numerico = (campo, codigo, { entero = false } = {}) => {
    if (vacio(l[campo])) return;
    const n = num(l[campo]);
    if (!Number.isFinite(n)) out.push({ severidad: 'error', codigo, campo, ...pos });
    else if (n < 0) out.push({ severidad: 'error', codigo: 'numero-negativo', campo, ...pos });
    else if (entero && !Number.isInteger(n)) out.push({ severidad: 'error', codigo, campo, ...pos });
  };
  numerico('series', 'series-no-numerica', { entero: true });
  numerico('distancia', 'distancia-no-numerica');
  numerico('tiempoMin', 'tiempo-no-numerico');
  if (!vacio(l.salida) && !parsearSalida(l.salida).valido)
    out.push({ severidad: 'aviso', codigo: 'salida-invalida', campo: 'salida', params: { salida: l.salida }, ...pos });
  if (!vacio(l.series) && vacio(l.distancia) && Number.isFinite(num(l.series)) && num(l.series) > 0)
    out.push({ severidad: 'aviso', codigo: 'sin-distancia', campo: 'distancia', ...pos });
  return out;
}

// sesion: Entrenamientos row (volumenMin/volumenMax optional); cargaMedia: recorded metres (0 = none).
export function validarSesion({ sesion = {}, lineas = [], cargaMedia = 0, tolerancia = TOLERANCIA_CARGA } = {}) {
  const norm = lineas.map(normalizarLinea).filter((l) => !filaVacia(l));
  const out = [];
  if (!norm.length) out.push({ severidad: 'aviso', codigo: 'sin-lineas' });
  norm.forEach((l) => out.push(...validarLinea(l)));
  const tot = totales(norm);
  const car = num(cargaMedia);
  if (norm.length && car > 0 && Math.abs(tot.metros - car) > car * tolerancia) {
    out.push({ severidad: 'aviso', codigo: 'distancia-difiere-carga', params: { total: tot.metros, registrada: car } });
  }
  const min = num(sesion.volumenMin),
    max = num(sesion.volumenMax);
  if (
    norm.length &&
    tot.metros > 0 &&
    ((Number.isFinite(min) && min > 0 && tot.metros < min) || (Number.isFinite(max) && max > 0 && tot.metros > max))
  ) {
    out.push({
      severidad: 'aviso',
      codigo: 'fuera-volumen-objetivo',
      params: { total: tot.metros, min: Number.isFinite(min) ? min : '', max: Number.isFinite(max) ? max : '' },
    });
  }
  const dur = num(sesion.duracionMin);
  if (norm.length && dur > 0 && tot.tiempoMin > dur * 1.2) {
    out.push({ severidad: 'aviso', codigo: 'tiempo-supera-duracion', params: { total: tot.tiempoMin, duracion: dur } });
  }
  return out;
}
export const hayErrores = (avisos) => avisos.some((a) => a.severidad === 'error');

// ---------- Draft editing (all return a new, renumbered array) ----------
const ultimoSet = (ls) => ls.reduce((a, l) => Math.max(a, l.set), 0);

export function anadirSet(lineas, { filas = 1 } = {}) {
  const base = renumerar(lineas);
  const s = ultimoSet(base) + 1;
  const nuevas = Array.from({ length: filas }, (_, i) => lineaVacia(s, i + 1));
  return base.concat(nuevas);
}
// Adds a row at the end of the set (or after the row `despuesDe` if given by position {set, orden}).
export function anadirFila(lineas, set, despuesDe = null) {
  const base = renumerar(lineas);
  if (!base.some((l) => l.set === set)) return anadirSet(base);
  const max = base.filter((l) => l.set === set).reduce((a, l) => Math.max(a, l.orden), 0);
  const pos = despuesDe ? despuesDe.orden : max;
  const mover = base.map((l) => (l.set === set && l.orden > pos ? { ...l, orden: l.orden + 1 } : l));
  return renumerar(mover.concat(lineaVacia(set, pos + 1)));
}
export function quitarFila(lineas, set, orden) {
  return renumerar(renumerar(lineas).filter((l) => !(l.set === set && l.orden === orden)));
}
export function quitarSet(lineas, set) {
  return renumerar(renumerar(lineas).filter((l) => l.set !== set));
}
// Moves a row up/down within its set (delta -1 / +1); at the edge it moves to the adjacent set.
export function moverFila(lineas, set, orden, delta) {
  const base = renumerar(lineas);
  const i = base.findIndex((l) => l.set === set && l.orden === orden);
  if (i < 0) return base;
  const j = i + delta;
  if (j < 0 || j >= base.length) return base;
  const copia = base.slice();
  const a = copia[i],
    b = copia[j];
  if (a.set === b.set) {
    copia[i] = { ...b, orden: a.orden };
    copia[j] = { ...a, orden: b.orden };
    return renumerar(copia);
  }
  // crosses into the adjacent set: the row takes the neighbouring set at the corresponding end
  copia[i] = { ...a, set: b.set, orden: delta < 0 ? b.orden + 0.5 : b.orden - 0.5 };
  return renumerar(copia);
}
export function moverSet(lineas, set, delta) {
  const base = renumerar(lineas);
  const destino = set + delta;
  if (destino < 1 || destino > ultimoSet(base)) return base;
  return renumerar(base.map((l) => (l.set === set ? { ...l, set: destino } : l.set === destino ? { ...l, set } : l)));
}
// Duplicates a set right after the original. Optional genId to assign ids.
export function duplicarSet(lineas, set, genId = () => '') {
  const base = renumerar(lineas);
  const copia = base.filter((l) => l.set === set).map((l) => ({ ...l, id: genId(), set: set + 0.5 }));
  if (!copia.length) return base;
  return renumerar(base.concat(copia));
}
export function duplicarFila(lineas, set, orden, genId = () => '') {
  const base = renumerar(lineas);
  const l = base.find((x) => x.set === set && x.orden === orden);
  if (!l) return base;
  return renumerar(base.concat({ ...l, id: genId(), orden: l.orden + 0.5 }));
}

// ---------- Session duplication ----------
const CAMPOS_PLAN = ['tipoSesion', 'materialDia', 'notasGenerales'];
// Copy of the lines without id or entrenamientoId (or with the given ones): to assign them to another session.
export function clonarLineas(lineas, { entrenamientoId = '', genId = () => '' } = {}) {
  return renumerar(lineas).map((l) => ({ ...l, id: genId(), entrenamientoId }));
}
// Duplicates a session with its plan. `cambios` overrides session fields (fecha, hora, grupoId...).
// -> { sesion: {...without id}, lineas: [...without id or entrenamientoId] }. The state goes back to 'planificado'.
export function duplicarSesion(sesion, lineas, cambios = {}) {
  const s = { ...sesion, ...cambios, id: '', estado: 'planificado' };
  return { sesion: s, lineas: clonarLineas(lineas) };
}
// Plan fields of a session (to copy from another session or template).
export const camposPlan = (s = {}) => Object.fromEntries(CAMPOS_PLAN.map((c) => [c, s[c] ?? '']));

// ---------- Plantillas ----------
// ajusta = row that scales when adapting the template to a target volume (planDemo)
const L = (
  set,
  tiempoMin,
  objetivo,
  bloque,
  series,
  distancia,
  salida,
  ejercicio,
  material = '',
  notas = '',
  ajusta = false,
) => ({ set, tiempoMin, objetivo, bloque, series, distancia, salida, ejercicio, material, notas, ajusta });

// Contents (names of the predefined catalogue) and per-repetition split of the template rows.
const N = Object.fromEntries(CATALOGO_PREDEFINIDO.map((c) => [c.clave, c.nombre]));
const C = (clave, metrosPorRep = null) => ({ contenido: N[clave], metrosPorRep, modo: 'auto' });
// con(fila, [componentes], estilo | [{estilo, metrosPorRep}]): adds contents and style to a template row
const con = (fila, componentes, estilo = '') => ({
  ...fila,
  componentes,
  estilos: Array.isArray(estilo) ? estilo : estilo ? [{ estilo, metrosPorRep: null }] : [],
});

// Built-in templates. The visible name is translated with the key `entreno.pl.<id>`; the content is free text.
export const PLANTILLAS = [
  {
    id: 'aerobico',
    tipoSesion: 'Aer+Ritmo',
    materialDia: 'Tabla, pull',
    lineas: [
      con(
        L(1, 7, 'Calentamiento', '', 1, 300, '', '100 suave + 100 ligero + 100 progresivo'),
        [C('aerobico-ligero')],
        'Crol',
      ),
      con(L(1, 6, '', '', 4, 50, '', '25 técnica / 25 normal'), [C('tecnica', 25), C('aerobico-ligero', 25)], 'Crol'),
      con(L(1, 4, '', '', 2, 50, '', 'Pn. 25 flecha crol / 25 Pn'), [C('piernas')], 'Crol'),
      con(L(2, 12, 'Piernas', '', 8, 50, 'C/1\'10"', 'Piernas con tabla', 'Tabla'), [C('piernas')], 'Crol'),
      con(
        L(3, 14, 'Aeróbico', '', 6, 100, 'd/15"', 'Ritmo uniforme', '', 'Contar brazadas', true),
        [C('aerobico-medio')],
        'Crol',
      ),
      con(
        L(3, 10, '', 'Tec Prueba', 4, 100, '', '4x100 Crol. 75 AeL-25 Tope'),
        [C('aerobico-ligero', 75), C('alactico', 25)],
        'Crol',
      ),
      con(L(4, 5, 'Vuelta a la calma', '', 1, 200, '', 'Suave'), [C('aerobico-ligero')], 'Estilos'),
    ],
  },
  {
    id: 'tecnica',
    tipoSesion: 'Técnica',
    materialDia: 'Aletas, tubo',
    lineas: [
      con(L(1, 8, 'Calentamiento', '', 1, 400, '', 'Mixto suave'), [C('aerobico-ligero')], 'Estilos'),
      con(
        L(2, 16, 'Técnica', 'Brazada', 8, 100, 'C/2\'00"', '25 ejercicio / 75 nadando', 'Aletas', '', true),
        [C('tecnica', 25), C('aerobico-ligero', 75)],
        'Crol',
      ),
      con(
        L(2, 12, '', 'Virajes', 6, 50, 'd/20"', 'Virajes y salidas bajo el agua'),
        [C('virajes', 35), C('salidas', 15)],
        'Crol',
      ),
      con(L(3, 10, 'Aeróbico', '', 4, 100, 'd/15"', 'Ritmo cómodo'), [C('aerobico-medio')], 'Crol'),
      con(L(4, 4, 'Vuelta a la calma', '', 1, 200, '', 'Suave'), [C('aerobico-ligero')], 'Estilos'),
    ],
  },
  {
    id: 'velocidad',
    tipoSesion: 'Velocidad',
    materialDia: 'Aletas',
    lineas: [
      con(L(1, 7, 'Calentamiento', '', 1, 400, '', 'Mixto progresivo'), [C('aerobico-ligero')], 'Estilos'),
      con(L(2, 6, 'Activación', '', 4, 50, 'C/1\'00"', 'Progresivos 1-4'), [C('aerobico-ligero')], 'Crol'),
      con(
        L(3, 12, 'Velocidad', 'Series rápidas', 8, 25, 'd/45"', 'Máxima velocidad con salida', '', 'Registrar tiempos'),
        [C('alactico', 15), C('salidas', 10)],
        'Crol',
      ),
      con(L(3, 6, '', '', 4, 50, 'd/1\'00"', 'Ritmo de prueba'), [C('anaerobico')], 'Crol'),
      con(
        L(4, 7, 'Aeróbico', '', 4, 100, 'd/15"', 'Suave, respiración cada 3', '', '', true),
        [C('aerobico-ligero')],
        'Crol',
      ),
      con(L(5, 4, 'Vuelta a la calma', '', 1, 200, '', 'Suave'), [C('aerobico-ligero')], 'Estilos'),
    ],
  },
  {
    id: 'mixta',
    tipoSesion: 'Mixta',
    materialDia: 'Tabla, pull, aletas',
    lineas: [
      con(
        L(1, 8, 'Calentamiento', '', 1, 400, '', '200 crol + 200 estilos'),
        [C('aerobico-ligero')],
        [
          { estilo: 'Crol', metrosPorRep: 200 },
          { estilo: 'Estilos', metrosPorRep: 200 },
        ],
      ),
      con(
        L(2, 18, 'Aeróbico', '', 5, 200, 'C/3\'30"', 'Crol, respiración alterna', '', '', true),
        [C('aerobico-medio')],
        'Crol',
      ),
      con(L(3, 12, 'Piernas', '', 6, 50, 'C/1\'10"', 'Batido con tabla', 'Tabla'), [C('piernas')], 'Crol'),
      con(
        L(3, 10, 'Velocidad', '', 4, 25, 'd/30"', 'Sprint desde salida'),
        [C('alactico', 15), C('salidas', 10)],
        'Mariposa',
      ),
      con(L(4, 5, 'Vuelta a la calma', '', 1, 200, '', 'Suave'), [C('aerobico-ligero')], 'Estilos'),
    ],
  },
];
export const plantilla = (id) => PLANTILLAS.find((p) => p.id === id) || null;
// Template lines already normalised (no ids).
export function lineasDePlantilla(id, { entrenamientoId = '', genId = () => '' } = {}) {
  const p = plantilla(id);
  return p
    ? clonarLineas(
        p.lineas.map((l, i) => ({ ...l, orden: i + 1 })),
        { entrenamientoId, genId },
      )
    : [];
}

// Realistic demo plan (like the club's example). `variante` rotates among templates;
// `objetivoM` adjusts the row marked as adjustable and the cool-down to approximate the session volume;
// `duracionMin` (optional) distributes the time so that the plan fits the session duration.
export function planDemo(variante, objetivoM = 0, duracionMin = 0) {
  const ids = ['aerobico', 'velocidad', 'tecnica', 'mixta'];
  const id = ids[Math.abs(variante) % ids.length];
  const p = plantilla(id);
  const lineas = p.lineas.map(({ ajusta, ...l }, i) => ({ ...l, orden: i + 1, _ajusta: ajusta }));
  if (objetivoM > 0) {
    const tot = () => totales(lineas).metros;
    const idx = lineas.findIndex((l) => l._ajusta);
    if (idx >= 0) {
      const l = lineas[idx];
      const resto = tot() - distanciaBloque(l);
      const series = Math.max(1, Math.round((objetivoM - resto) / l.distancia));
      const otros = lineas.reduce((a, x, i) => a + (i === idx ? 0 : Number(x.tiempoMin) || 0), 0);
      const tiempo =
        duracionMin > 0 ? Math.round(duracionMin * 0.95) - otros : Math.round((l.tiempoMin * series) / l.series);
      lineas[idx] = { ...l, series, tiempoMin: Math.max(series, tiempo) };
    }
    const fin = lineas.length - 1;
    const dif = objetivoM - tot();
    lineas[fin] = { ...lineas[fin], distancia: Math.max(100, lineas[fin].distancia + Math.round(dif / 50) * 50) };
  }
  return { tipoSesion: p.tipoSesion, materialDia: p.materialDia, notasGenerales: '', lineas: renumerar(lineas) };
}

// ---------- Sugerencias (autocompletar) ----------
// Values previously used in `campo`, from most to least frequent. `extra` = default values appended at the end.
export function sugerencias(lineas, campo, { extra = [], limite = 40 } = {}) {
  const cuenta = new Map();
  (lineas || []).forEach((l) => {
    const v = String(l[campo] ?? '').trim();
    if (!v) return;
    const k = v.toLowerCase();
    const e = cuenta.get(k) || { valor: v, n: 0 };
    e.n++;
    cuenta.set(k, e);
  });
  const res = [...cuenta.values()].sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor)).map((e) => e.valor);
  extra.forEach((v) => {
    if (v && !cuenta.has(String(v).toLowerCase())) res.push(v);
  });
  return res.slice(0, limite);
}

// ---------- File names ----------
export function slug(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
// Alevin-2026-10-15-jueves.pdf  (dia = name of the day in the active language; optional)
export function nombreFichero({ grupo = '', fecha = '', dia = '' } = {}) {
  const partes = [slug(grupo) || 'Entreno', String(fecha).slice(0, 10), slug(dia).toLowerCase()].filter(Boolean);
  return partes.join('-') + '.pdf';
}
export function nombreFicheroSemana({ grupo = '', lunes = '' } = {}) {
  return [slug(grupo) || 'Club', 'semana', String(lunes).slice(0, 10)].filter(Boolean).join('-') + '.pdf';
}

// "19:50" | "19:50:00" | 0.826 (Sheets day fraction) -> "19:50"
export function horaTexto(v) {
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const m = Math.round(v * 1440);
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? '').trim());
  return m ? m[1].padStart(2, '0') + ':' + m[2] : String(v ?? '');
}

// ---------- Draft state (unsaved changes) ----------
const CAMPOS_FIRMA = [
  'set',
  'orden',
  'tiempoMin',
  'objetivo',
  'bloque',
  'series',
  'distancia',
  'salida',
  'ejercicio',
  'material',
  'notas',
  'componentes',
  'estilo',
];

// Stable text that identifies the content of a plan: ignores ids, empty rows and format differences (3 vs '3').
// Two drafts with the same signature are the same plan, so "there are unsaved changes" = the signature differs from the saved one.
export function firmaPlan({ tipoSesion = '', materialDia = '', notasGenerales = '', lineas = [] } = {}) {
  const filas = renumerar(lineas)
    .filter((l) => !filaVacia(l))
    .map((l) => {
      const s = serializarLinea(l);
      return CAMPOS_FIRMA.map((c) => s[c]);
    });
  return JSON.stringify([
    String(tipoSesion ?? '').trim(),
    String(materialDia ?? '').trim(),
    String(notasGenerales ?? '').trim(),
    filas,
  ]);
}
export const planCambiado = (guardado, actual) => firmaPlan(guardado) !== firmaPlan(actual);

// Is every row without content? (a PDF of that plan would come out blank)
export const planVacio = (lineas) => (lineas || []).every((l) => filaVacia(normalizarLinea(l)));

// Totals per set over all rows of the draft (empty ones too) -> [{ set, metros, tiempoMin }]
export function totalesPorSet(lineas) {
  return agruparSets(lineas || []).map((s) => ({ set: s.set, metros: s.distSet, tiempoMin: s.tiempoMin }));
}

// Summary of a row for its chips: which fields of the second line have a value.
// -> { salida, material, tiempoMin, objetivo, contenidos (n), mas: block or notes with text }
export function resumenFila(l) {
  const n = normalizarLinea(l);
  const txt = (v) => String(v ?? '').trim();
  return {
    salida: txt(n.salida),
    material: txt(n.material),
    tiempoMin: txt(n.tiempoMin),
    objetivo: txt(n.objetivo),
    contenidos: n.componentes.length + n.estilos.length,
    mas: !!(txt(n.bloque) || txt(n.notas)),
  };
}
