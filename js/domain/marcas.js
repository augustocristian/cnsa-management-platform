// Personal bests ("Marcas") domain: event-name normalisation, best times, evolution series and chart scales.
// PURE: no DOM, store, i18n or clock.
//
// Stored value of Marcas.prueba is a neutral Spanish name in CANONICAL form: "100 Libre" (distance + capitalised
// style). Older or imported rows may hold "100 libre", "100  LIBRE", "100m Libre"...: they are grouped and filtered by an
// accent/case-insensitive KEY ("100-libre"), shown with their canonical name, and `migrarPruebas` can rewrite them.
import { claveBusqueda } from './nombres.js';
import { fechaValida, aDias } from './calendario.js';
import { parseTiempo } from './tiempos.js';
import { filtrarMarcasPorBanador, opcionesFiltro } from './banadores.js';

export const ESTILOS = Object.freeze(['libre', 'espalda', 'braza', 'mariposa', 'estilos']);
const SINONIMOS = { libre: 'libre', crol: 'libre', crawl: 'libre', espalda: 'espalda', dorso: 'espalda', braza: 'braza', pecho: 'braza',
  mariposa: 'mariposa', mari: 'mariposa', estilos: 'estilos', estilo: 'estilos', combinado: 'estilos', combinados: 'estilos' };
const NOMBRE_ESTILO = { libre: 'Libre', espalda: 'Espalda', braza: 'Braza', mariposa: 'Mariposa', estilos: 'Estilos' };

// Events offered when registering a time (canonical names).
export const PRUEBAS = Object.freeze([
  '50 Libre', '100 Libre', '200 Libre', '400 Libre', '800 Libre', '1500 Libre',
  '50 Espalda', '100 Espalda', '200 Espalda',
  '50 Braza', '100 Braza', '200 Braza',
  '50 Mariposa', '100 Mariposa', '200 Mariposa',
  '100 Estilos', '200 Estilos', '400 Estilos',
]);

export const TAM_PAGINA = 50;
export const PISCINAS = Object.freeze(['25', '50']);

const colapsar = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
const mayuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "100 libre" | "100m  LIBRE" | "100 Libre" -> { clave: '100-libre', nombre: '100 Libre', distancia: 100, estilo: 'libre' }
// Unknown events keep their (trimmed, capitalised) text; their key is the accent/case-insensitive text; estilo = null.
export function descomponerPrueba(valor) {
  const m = /^(\d{2,4})\s*(?:(?:m|mts|metros)(?![a-z]))?\s*([a-z]+)$/.exec(claveBusqueda(valor));
  const estilo = m ? SINONIMOS[m[2]] : null;
  if (m && estilo) {
    const distancia = Number(m[1]);
    return { clave: `${distancia}-${estilo}`, nombre: `${distancia} ${NOMBRE_ESTILO[estilo]}`, distancia, estilo };
  }
  const texto = colapsar(valor);
  return { clave: claveBusqueda(texto), nombre: mayuscula(texto), distancia: null, estilo: null };
}
export const clavePrueba = (valor) => descomponerPrueba(valor).clave;
export const nombrePrueba = (valor) => descomponerPrueba(valor).nombre;

// Order of events: by style, then distance; unknown events last by name.
function compararPruebas(a, b) {
  const ia = a.estilo ? ESTILOS.indexOf(a.estilo) : 99;
  const ib = b.estilo ? ESTILOS.indexOf(b.estilo) : 99;
  return ia - ib || (a.distancia || 0) - (b.distancia || 0) || a.nombre.localeCompare(b.nombre, 'es');
}

// Events for a selector, without duplicates. -> [{ valor (canonical name), clave, distancia, estilo }]
// conPredefinidas: also the standard list (add-time form); otherwise only events that appear in `marcas` (filter).
export function opcionesPruebas(marcas, { conPredefinidas = false } = {}) {
  const mapa = new Map();
  const fuente = (conPredefinidas ? PRUEBAS : []).concat(marcas.map((m) => m.prueba));
  for (const p of fuente) {
    const d = descomponerPrueba(p);
    if (d.clave && !mapa.has(d.clave)) mapa.set(d.clave, { valor: d.nombre, clave: d.clave, distancia: d.distancia, estilo: d.estilo, nombre: d.nombre });
  }
  return [...mapa.values()].sort(compararPruebas).map(({ nombre, ...o }) => o);
}

export const piscinaDe = (m) => (PISCINAS.includes(String(m.piscina)) ? String(m.piscina) : '');
const tiempo = (m) => Number(m.tiempoMs);

// Marks with a valid time that match the filters. Filters: nadadorId, prueba (any spelling), piscina ('25' | '50').
export function filtrarMarcas(marcas, { nadadorId = '', prueba = '', piscina = '' } = {}) {
  const clave = prueba ? clavePrueba(prueba) : '';
  return marcas.filter((m) => tiempo(m) > 0
    && (!nadadorId || m.nadadorId === nadadorId)
    && (!clave || clavePrueba(m.prueba) === clave)
    && (!piscina || piscinaDe(m) === String(piscina)));
}

// ---------- Swimsuit filter (type / brand / model) combined with the other filters ----------
// filtro: { tipo, marca, modelo } (keys as given by opcionesFiltro; SIN_BANADOR allowed as tipo). Delegates to the catalogue domain.
export const filtrarPorBanador = (marcas, banadores, filtro = {}) => filtrarMarcasPorBanador(marcas, banadores, filtro);
export const hayFiltroBanador = (f = {}) => !!(f.tipo || f.marca || f.modelo);

// All filters at once: swimmer, event, pool and suit. -> marks with a valid time.
export function filtrarMarcasCompleto(marcas, filtros = {}, banadores = []) {
  const { nadadorId, prueba, piscina, tipo, marca, modelo } = filtros;
  return filtrarMarcas(filtrarPorBanador(marcas, banadores, { tipo, marca, modelo }), { nadadorId, prueba, piscina });
}

// Cascading selects: after the type (or brand) changes, a brand (or model) that is no longer offered is dropped.
// -> the corrected { tipo, marca, modelo } and the options to show { tipos, marcas, modelos, sinBanador, conBanador }.
export function ajustarFiltroBanador(filtro, banadores, marcas) {
  const f = { tipo: filtro.tipo || '', marca: filtro.marca || '', modelo: filtro.modelo || '' };
  let op = opcionesFiltro(banadores, marcas, f);
  if (f.marca && !op.marcas.some((o) => o.valor === f.marca)) { f.marca = ''; f.modelo = ''; op = opcionesFiltro(banadores, marcas, f); }
  if (f.modelo && !op.modelos.some((o) => o.valor === f.modelo)) f.modelo = '';
  return { filtro: f, opciones: op };
}

// Newest first (ties: faster first).
export function ordenarHistorial(marcas) {
  return marcas.slice().sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || tiempo(a) - tiempo(b));
}

const claveGrupo = (m) => `${m.nadadorId}|${clavePrueba(m.prueba)}|${piscinaDe(m)}`;
// Better = faster; same time: the earlier date keeps the record.
const mejorQue = (a, b) => tiempo(a) < tiempo(b) || (tiempo(a) === tiempo(b) && String(a.fecha) < String(b.fecha));

// Best mark per swimmer + event + pool. `nombreDe(nadadorId)` only sorts rows with the same event.
export function mejoresMarcas(marcas, nombreDe = () => '') {
  const mejores = new Map();
  for (const m of marcas) {
    if (!(tiempo(m) > 0)) continue;
    const k = claveGrupo(m);
    const cur = mejores.get(k);
    if (!cur || mejorQue(m, cur)) mejores.set(k, m);
  }
  return [...mejores.values()].sort((a, b) => compararPruebas(descomponerPrueba(a.prueba), descomponerPrueba(b.prueba))
    || piscinaDe(a).localeCompare(piscinaDe(b)) || String(nombreDe(a.nadadorId)).localeCompare(String(nombreDe(b.nadadorId)), 'es'));
}

// Ids of the marks that are a personal best (PB) for their swimmer + event + pool.
export const idsMejorMarca = (marcas) => new Set(mejoresMarcas(marcas).map((m) => m.id));

// "See more" pagination: shows the first `pagina * tam` items.
export function visibles(lista, pagina = 1, tam = TAM_PAGINA) {
  const n = Math.max(1, Math.floor(pagina)) * tam;
  const items = lista.slice(0, n);
  return { items, total: lista.length, restantes: Math.max(0, lista.length - items.length), hayMas: lista.length > items.length };
}

// ---------- Which series to chart by default ----------
function masFrecuente(marcas, clave) {
  const cuenta = new Map();
  for (const m of marcas) {
    const k = clave(m);
    const e = cuenta.get(k) || { k, n: 0, ultima: '' };
    e.n += 1;
    if (String(m.fecha) > e.ultima) e.ultima = String(m.fecha);
    cuenta.set(k, e);
  }
  // most marks; ties: most recent activity, then key (deterministic)
  return [...cuenta.values()].sort((a, b) => b.n - a.n || b.ultima.localeCompare(a.ultima) || a.k.localeCompare(b.k))[0]?.k ?? '';
}

// Series for the evolution chart. Whatever the user did not choose is picked automatically: the swimmer with most marks,
// then his/her main event, then the pool used most (25 m and 50 m times are not comparable, so never mixed).
// -> { nadadorId, prueba (canonical name), clave, piscina, marcas (chronological) } | null when there are no marks.
export function elegirSerie(marcas, { nadadorId = '', prueba = '', piscina = '' } = {}) {
  let cand = filtrarMarcas(marcas, { nadadorId, prueba, piscina });
  if (!cand.length) return null;
  const nid = nadadorId || masFrecuente(cand, (m) => m.nadadorId);
  cand = cand.filter((m) => m.nadadorId === nid);
  const clave = prueba ? clavePrueba(prueba) : masFrecuente(cand, (m) => clavePrueba(m.prueba));
  cand = cand.filter((m) => clavePrueba(m.prueba) === clave);
  const pis = piscina ? String(piscina) : masFrecuente(cand, piscinaDe);
  cand = cand.filter((m) => piscinaDe(m) === pis);
  const serie = cand.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.id).localeCompare(String(b.id)));
  return { nadadorId: nid, prueba: descomponerPrueba(serie[0].prueba).nombre, clave, piscina: pis, marcas: serie };
}

// ---------- Chart scales ----------
// Pure geometry for the SVG line chart (time axis: faster = higher). Points are placed proportionally to their date.
// -> { ancho, alto, area:{x0,x1,y0,y1}, puntos:[{x,y,marca,mejor}], ejeY:[{y,ms}], ejeX:[{x,fecha}], lo, hi }
export function escalaEvolucion(serie, { ancho = 640, alto = 260, margen = { t: 16, r: 18, b: 40, l: 70 }, divisionesY = 4, maxEtiquetasX = 5 } = {}) {
  const x0 = margen.l, x1 = ancho - margen.r, y0 = margen.t, y1 = alto - margen.b;
  const tiempos = serie.map(tiempo);
  const lo = Math.min(...tiempos), hi = Math.max(...tiempos);
  const holgura = Math.max((hi - lo) * 0.15, 500);
  const a = lo - holgura, b = hi + holgura;
  const dias = serie.map((m) => aDias(m.fecha));
  const validas = dias.every(Number.isFinite);
  const d0 = Math.min(...dias), d1 = Math.max(...dias);
  const posX = (i) => {
    if (serie.length === 1) return (x0 + x1) / 2;
    if (validas && d1 > d0) return x0 + ((dias[i] - d0) / (d1 - d0)) * (x1 - x0);
    return x0 + (i / (serie.length - 1)) * (x1 - x0);
  };
  const posY = (v) => y0 + ((v - a) / (b - a)) * (y1 - y0);
  const iMejor = tiempos.indexOf(lo);
  const puntos = serie.map((marca, i) => ({ x: posX(i), y: posY(tiempos[i]), marca, mejor: i === iMejor }));
  const ejeY = Array.from({ length: divisionesY + 1 }, (_, i) => { const ms = a + ((b - a) / divisionesY) * i; return { y: posY(ms), ms }; });
  // x labels spread over the points (first and last always), never closer than ~64 units
  const ejeX = [];
  let ultimoX = -Infinity;
  const paso = Math.max(1, Math.ceil(serie.length / Math.max(1, maxEtiquetasX)));
  puntos.forEach((p, i) => {
    const ultimo = i === puntos.length - 1;
    if ((i % paso === 0 || ultimo) && p.x - ultimoX >= 64) {
      if (ultimo && ejeX.length && p.x - ejeX[ejeX.length - 1].x < 64) ejeX.pop();
      ejeX.push({ x: p.x, fecha: p.marca.fecha });
      ultimoX = p.x;
    }
  });
  return { ancho, alto, area: { x0, x1, y0, y1 }, puntos, ejeY, ejeX, lo, hi };
}

// ---------- Validation and migration ----------
// data: { nadadorId, fecha, prueba, piscina, tiempo (text) | tiempoMs }; ctx.nadadorExiste(id).
// -> { errores: [{campo, codigo}], tiempoMs }
export function validarMarca(data, { nadadorExiste = () => true } = {}) {
  const errores = [];
  if (!data.nadadorId || !nadadorExiste(data.nadadorId)) errores.push({ campo: 'nadadorId', codigo: 'nadador' });
  if (!fechaValida(data.fecha)) errores.push({ campo: 'fecha', codigo: 'fecha' });
  if (!colapsar(data.prueba)) errores.push({ campo: 'prueba', codigo: 'prueba' });
  if (data.piscina !== '' && data.piscina != null && !PISCINAS.includes(String(data.piscina))) errores.push({ campo: 'piscina', codigo: 'piscina' });
  const bruto = data.tiempoMs != null && data.tiempoMs !== '' ? Number(data.tiempoMs) : parseTiempo(data.tiempo);
  const texto = String(data.tiempo ?? '').trim();
  if (data.tiempoMs == null && !texto) errores.push({ campo: 'tiempo', codigo: 'tiempo-vacio' });
  else if (!(bruto > 0) || bruto > 86400000) errores.push({ campo: 'tiempo', codigo: 'tiempo' });
  return { errores, tiempoMs: bruto };
}

// Rows whose stored event name is not canonical (only recognised events are rewritten). -> [{ id, prueba }]
export function migrarPruebas(marcas) {
  const cambios = [];
  for (const m of marcas) {
    const d = descomponerPrueba(m.prueba);
    if (d.estilo && d.nombre !== m.prueba) cambios.push({ id: m.id, prueba: d.nombre });
  }
  return cambios;
}
