// Desglose del plan de entreno por CONTENIDO y por ESTILO. Lógica pura (sin DOM, store, red ni i18n).
//
// Cada fila del plan (EntrenoLineas) tiene series x distancia y puede repartir la distancia POR REPETICIÓN entre
// varios contenidos (componentes) y estilos:   4x100 Crol. 75 AeL-25 Tope   ->   AeL 75 m/rep, Tope 25 m/rep.
//
// Decisión de cálculo (importante): los metros de un componente en la fila son series x metros por repetición, igual que
// la distancia de la fila (series x distancia). Por eso 4x100 de crol son 400 m de crol en total (100 m POR repetición);
// el desglose por repetición se conserva en `metrosPorRep` y se muestra donde ayuda (chips del editor, columna del PDF).
//
// Modelo del componente: { contenido, metrosPorRep, modo: 'auto'|'manual', pct? }
//   - manual con pct       -> pct % de la distancia por repetición
//   - con metrosPorRep     -> esos metros por repetición (auto = los dedujo el sistema, p. ej. del texto; manual = los fijó el usuario)
//   - auto sin metrosPorRep -> recibe su parte (a partes iguales) de lo que queda sin asignar
//   - un único componente auto recibe toda la distancia
// Manual siempre gana: autocompletar desde el texto nunca toca los componentes manuales.
import {
  num, normalizarLinea, filaVacia, ordenarLineas, distanciaBloque, seriesEfectivas, leerComponentes, escribirComponentes,
} from './entreno.js';
import { normalizarNombre, CATALOGO_PREDEFINIDO, PREFIJO_ID } from './cargas.js';

export const EPS = 0.005;
export const ESTILOS = ['Crol', 'Espalda', 'Braza', 'Mariposa', 'Estilos'];
// Alias de estilos (normalizados) -> nombre canónico guardado
const ESTILO_ALIAS = {
  Crol: ['crol', 'libre', 'crawl', 'free', 'freestyle', 'stile libero'],
  Espalda: ['espalda', 'esp', 'back', 'backstroke', 'dorso'],
  Braza: ['braza', 'pecho', 'breast', 'breaststroke', 'rana'],
  Mariposa: ['mariposa', 'fly', 'butterfly', 'farfalla'],
  Estilos: ['estilos', 'combinado', 'medley', 'im', 'misti'],
};
const r2 = (n) => Math.round(n * 100) / 100;
const vacio = (v) => String(v ?? '').trim() === '';

// ---------- Estilos ----------
const INDICE_ESTILO = new Map(Object.entries(ESTILO_ALIAS).flatMap(([canon, lista]) => lista.map((a) => [a, canon])));
// "crawl" | "Libre" | "Fly" -> "Crol" | "Mariposa"; un estilo libre ("Otro") se conserva tal cual.
export function canonicoEstilo(texto) {
  const s = String(texto ?? '').trim();
  return INDICE_ESTILO.get(normalizarNombre(s)) || s;
}

// ---------- Catálogo y diccionario de alias ----------
// Catálogo mínimo cuando no se pasa uno (pruebas, planes sin club abierto): los predefinidos con sus alias de fábrica.
export const catalogoBase = () => CATALOGO_PREDEFINIDO.map((c) => ({
  id: c.id, nombre: c.nombre, alias: c.alias.slice(), color: c.color, activo: true, predefinido: true, categoria: c.categoria, orden: c.orden,
}));
const catalogo = (tipos) => (Array.isArray(tipos) && tipos.length ? tipos : catalogoBase());

// Claves de un contenido: su nombre, cada tramo de un nombre "A / B" y sus alias. -> [clave normalizada]
export function clavesDeTipo(tipo) {
  const nombre = normalizarNombre(tipo.nombre);
  const tramos = nombre.includes('/') ? nombre.split('/').map((x) => x.trim()).filter((x) => x.length >= 3) : [];
  return [...new Set([nombre, ...tramos, ...(tipo.alias || []).map(normalizarNombre)].filter(Boolean))];
}
// Texto -> contenido del catálogo por nombre o alias exacto (sin tildes ni mayúsculas), o null.
export function resolverContenido(texto, tipos) {
  const k = normalizarNombre(texto);
  if (!k) return null;
  const cat = catalogo(tipos);
  return cat.find((t) => clavesDeTipo(t).includes(k)) || null;
}
// Abreviatura para espacios reducidos (PDF, resumen en texto): el primer alias, o el nombre.
export const nombreCorto = (tipo) => (tipo && tipo.alias && tipo.alias.length ? tipo.alias[0] : tipo ? tipo.nombre : '');

// Diccionario ordenado de más largo a más corto: [{ k, tipo } | { k, estilo }]
function diccionario(tipos) {
  const mapa = new Map();
  catalogo(tipos).forEach((t) => clavesDeTipo(t).forEach((k) => { if (!mapa.has(k)) mapa.set(k, { k, tipo: t }); }));
  INDICE_ESTILO.forEach((estilo, k) => { if (!mapa.has(k)) mapa.set(k, { k, estilo }); });
  return [...mapa.values()].sort((a, b) => b.k.length - a.k.length);
}

// ---------- Reparto de una distancia por repetición ----------
// items: [{ metrosPorRep, pct, modo }]; D = distancia por repetición.
// -> { m: [metros por rep de cada item], asignado, resto (>0 = sin asignar), exceso (>0 = pasado) }
export function repartir(items, D) {
  const out = items.map(() => 0);
  if (!items.length) return { m: out, asignado: 0, resto: D > 0 ? D : 0, exceso: 0 };
  if (items.length === 1 && items[0].modo !== 'manual') {
    out[0] = D;
    return { m: out, asignado: D, resto: 0, exceso: 0 };
  }
  let fijo = 0;
  const libres = [];
  items.forEach((it, i) => {
    if (it.pct > 0) { out[i] = r2(D * it.pct / 100); fijo += out[i]; } else if (it.metrosPorRep != null) { out[i] = it.metrosPorRep; fijo += out[i]; } else if (it.modo !== 'manual') libres.push(i);
  });
  const sobrante = Math.max(0, r2(D - fijo));
  if (libres.length) {
    const parte = r2(sobrante / libres.length);
    libres.forEach((i, k) => { out[i] = k === libres.length - 1 ? r2(sobrante - parte * (libres.length - 1)) : parte; });
  }
  const asignado = r2(out.reduce((a, v) => a + v, 0));
  const dif = r2(D - asignado);
  return { m: out, asignado, resto: dif > EPS ? dif : 0, exceso: dif < -EPS ? -dif : 0 };
}

// Porcentajes que suman exactamente 100 (método del mayor resto) con `dec` decimales.
export function porcentajes(valores, dec = 1) {
  const total = valores.reduce((a, v) => a + v, 0);
  if (!(total > 0)) return valores.map(() => 0);
  const f = 10 ** dec;
  const brutos = valores.map((v) => (v / total) * 100 * f);
  const suelo = brutos.map(Math.floor);
  let falta = 100 * f - suelo.reduce((a, v) => a + v, 0);
  const orden = brutos.map((b, i) => [b - suelo[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; falta > 0 && k < orden.length; k++, falta--) suelo[orden[k][1]]++;
  return suelo.map((v) => v / f);
}

// ---------- Clasificación de texto libre (líneas antiguas sin componentes) ----------
const REGLAS_CONTENIDO = [
  ['aerobico-ligero', /calentamiento|vuelta a la calma|recuperacion|regenerativ|suave|soltar|enfriamiento|activacion|ligero/],
  ['aerobico-intenso', /aerobico intenso|potencia aerobica|vo2/],
  ['anaerobico', /anaerobico|lactato|lactic/],
  ['alactico', /alactico|sprint|velocidad|explosiv|maxima/],
  ['aerobico-medio', /umbral|aerobico|resistencia|\bcss\b|fondo|ritmo/],
  ['piernas', /pierna|patada|batido/],
  ['brazos', /brazo|traccion|\bpull\b|palas/],
  ['tecnica', /tecnic|\btec\b|drill/],
  ['salidas', /salida|poyete/],
  ['virajes', /viraje|volteo/],
];
// Texto libre (objetivo, bloque, ejercicio) -> contenido del catálogo o null.
export function clasificarTexto(texto, tipos) {
  const k = normalizarNombre(texto);
  if (!k) return null;
  const cat = catalogo(tipos);
  const exacto = resolverContenido(k, cat);
  if (exacto) return exacto;
  const propio = cat.find((t) => !t.predefinido && t.activo && normalizarNombre(t.nombre).length >= 3 && k.includes(normalizarNombre(t.nombre)));
  if (propio) return propio;
  for (const [clave, re] of REGLAS_CONTENIDO) {
    if (re.test(k)) return cat.find((t) => t.id === PREFIJO_ID + clave) || null;
  }
  return null;
}

// ---------- Parser del texto del ejercicio ----------
// "4x100 Crol. 75 AeL-25 Tope" | "8x50 (25 Sprint+25 AeL)" | "6x100 AeL" | "3x(200 AeM + 100 AeI)"
// -> { ok, codigo?, series, distancia, componentes: [{contenido, metrosPorRep, modo:'auto'}], estilos: [{estilo, metrosPorRep}], sinReconocer: [palabra] }
// Una palabra sin número se aplica a toda la distancia (o al resto); un número delante de una o varias palabras
// reconocidas (contenidos o estilos) les asigna esos metros por repetición. Lo que no se reconoce se ignora y se lista.
export function parsearEjercicio(texto, { tipos } = {}) {
  const vacioR = (codigo) => ({ ok: false, codigo, series: null, distancia: null, componentes: [], estilos: [], sinReconocer: [] });
  const s = String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[×*]/g, 'x').replace(/\s+/g, ' ').trim();
  if (!s) return vacioR('vacio');
  const dic = diccionario(tipos);
  const NUM = /^(\d+(?:[.,]\d+)?)\s*(?:m(?![a-z0-9]))?/;
  let i = 0, series = null, distancia = null;
  const pre = /^(\d+)\s*x\s*(?=[\d(])/.exec(s);
  if (pre) {
    series = Number(pre[1]);
    i = pre[0].length;
    if (s[i] === '(') i++; // 3x(200 AeM + 100 AeI): la distancia es la suma del paréntesis
    else {
      const dm = NUM.exec(s.slice(i));
      if (dm) { distancia = Number(dm[1].replace(',', '.')); i += dm[0].length; }
    }
    if (/\d\s*x\s*[\d(]/.test(s.slice(i))) return vacioR('varios-bloques');
  }
  const grupos = [];
  let cur = { numero: null, etiquetas: [], palabras: [] };
  const cerrar = () => { if (cur.numero != null || cur.etiquetas.length || cur.palabras.length) grupos.push(cur); cur = { numero: null, etiquetas: [], palabras: [] }; };
  while (i < s.length) {
    const c = s[i];
    if (c === ' ') { i++; continue; }
    if (/\d/.test(c)) {
      const m = NUM.exec(s.slice(i));
      cerrar();
      cur.numero = Number(m[1].replace(',', '.'));
      i += m[0].length;
      continue;
    }
    if (/[a-z]/.test(c)) {
      const hit = dic.find((e) => s.startsWith(e.k, i) && !/[a-z0-9]/.test(s[i + e.k.length] || ''));
      if (hit) { cur.etiquetas.push(hit); i += hit.k.length; continue; }
      const w = /^[a-z0-9]+/.exec(s.slice(i))[0];
      cur.palabras.push(w);
      i += w.length;
      continue;
    }
    i++; // separadores: . , + - / ( ) ; :
  }
  cerrar();

  // Agrupa por contenido / estilo (misma clave: suma números; con y sin número -> el número).
  const comps = new Map();
  const ests = new Map();
  const sin = [];
  const unir = (mapa, clave, valor, datos) => {
    const e = mapa.get(clave);
    if (!e) mapa.set(clave, { ...datos, metrosPorRep: valor });
    else if (valor != null) e.metrosPorRep = (e.metrosPorRep == null ? 0 : e.metrosPorRep) + valor;
  };
  grupos.forEach((g) => {
    g.etiquetas.forEach((e) => {
      if (e.tipo) unir(comps, e.tipo.id, g.numero, { contenido: e.tipo.nombre });
      else unir(ests, e.estilo, g.numero, { estilo: e.estilo });
    });
    if (g.numero != null && !g.etiquetas.length) sin.push(...g.palabras); // «25 flecha»: número seguido de algo que no se conoce
  });
  let componentes = [...comps.values()].map((c) => ({ contenido: c.contenido, metrosPorRep: c.metrosPorRep, modo: 'auto', pct: null }));
  const estilos = [...ests.values()].map((e) => ({ estilo: e.estilo, metrosPorRep: e.metrosPorRep }));
  const suma = (l) => l.reduce((a, c) => a + (c.metrosPorRep || 0), 0);
  if (distancia == null) {
    const d = suma(componentes) || suma(estilos);
    if (d > 0) distancia = r2(d);
  }
  if (componentes.length === 1 && componentes[0].metrosPorRep != null && distancia != null && Math.abs(componentes[0].metrosPorRep - distancia) > EPS) {
    componentes = [{ ...componentes[0], modo: 'manual' }]; // un número explícito distinto de la distancia se respeta
  }
  const ok = series != null || distancia != null || componentes.length > 0 || estilos.length > 0;
  return { ok, codigo: ok ? '' : 'sin-datos', series, distancia, componentes, estilos, sinReconocer: [...new Set(sin)] };
}

// Autocompleta una fila a partir del texto de su ejercicio. Si el texto empieza por «NxM» (4x100), series y distancia salen de ahí;
// si no, sólo se rellenan las que estén vacías. Los componentes manuales se conservan y los automáticos se sustituyen por los del texto;
// los estilos sólo se rellenan si la fila no tiene ninguno.
// -> { linea, parse, cambios: { series, distancia, componentes, estilos } }
export function autocompletarLinea(linea, { tipos } = {}) {
  const l = normalizarLinea(linea);
  const p = parsearEjercicio(l.ejercicio, { tipos });
  const out = { ...l };
  const cambios = { series: false, distancia: false, componentes: false, estilos: false };
  if (!p.ok) return { linea: out, parse: p, cambios };
  const explicito = p.series != null; // el texto trae «NxM»: manda sobre lo escrito en la fila
  if (p.series != null && (explicito || vacio(l.series)) && num(l.series) !== p.series) { out.series = p.series; cambios.series = true; }
  if (p.distancia != null && (explicito || vacio(l.distancia)) && num(l.distancia) !== p.distancia) { out.distancia = p.distancia; cambios.distancia = true; }
  if (p.componentes.length) {
    const manuales = l.componentes.filter((c) => c.modo === 'manual');
    const claves = new Set(manuales.map((c) => normalizarNombre(c.contenido)));
    const nuevos = p.componentes.filter((c) => !claves.has(normalizarNombre(c.contenido)));
    out.componentes = [...manuales, ...nuevos];
    cambios.componentes = JSON.stringify(out.componentes) !== JSON.stringify(l.componentes);
  }
  if (p.estilos.length && !l.estilos.length) { out.estilos = p.estilos; cambios.estilos = true; }
  return { linea: out, parse: p, cambios };
}

// ---------- Operaciones de edición sobre los componentes de una fila (devuelven arrays nuevos) ----------
export function anadirComponente(componentes, contenido, { modo = 'auto', metrosPorRep = null, pct = null } = {}) {
  const k = normalizarNombre(contenido);
  const lista = leerComponentes(componentes);
  if (!k || lista.some((c) => normalizarNombre(c.contenido) === k)) return lista;
  return [...lista, { contenido: String(contenido).trim(), metrosPorRep, modo, pct }];
}
export function quitarComponente(componentes, contenido) {
  const k = normalizarNombre(contenido);
  return leerComponentes(componentes).filter((c) => normalizarNombre(c.contenido) !== k);
}
// Fija a mano los metros por repetición (o el %) de un componente: queda marcado como manual.
export function fijarComponente(componentes, contenido, { metrosPorRep = null, pct = null } = {}) {
  const k = normalizarNombre(contenido);
  return leerComponentes(componentes).map((c) => (normalizarNombre(c.contenido) === k
    ? { ...c, modo: 'manual', metrosPorRep: pct > 0 ? null : metrosPorRep, pct: pct > 0 ? pct : null } : c));
}
// Como fijarComponente, pero los demás componentes AUTOMÁTICOS con metros (p. ej. los sacados del texto) se reajustan en
// proporción para llenar lo que queda de la distancia: fijar Sprint a 40 en «75 AeL + 25 Sprint» deja AeL en 60.
// Si hay automáticos sin metros ya se reparten solos el resto, y no se toca nada.
export function fijarReequilibrando(linea, contenido, valor, { tipos } = {}) {
  const l = normalizarLinea(linea);
  const D = resolverLinea(l, { tipos }).distancia;
  const comps = fijarComponente(l.componentes, contenido, valor);
  const explicitos = comps.map((c, i) => (c.modo !== 'manual' && c.metrosPorRep != null ? i : -1)).filter((i) => i >= 0);
  if (!(D > 0) || !explicitos.length || comps.some((c) => c.modo !== 'manual' && c.metrosPorRep == null)) return comps;
  const m = repartir(comps, D).m;
  const resto = Math.max(0, r2(D - comps.reduce((a, c, i) => a + (c.modo === 'manual' ? m[i] : 0), 0)));
  const pesos = explicitos.map((i) => (comps[i].metrosPorRep > 0 ? comps[i].metrosPorRep : 1));
  const total = pesos.reduce((a, v) => a + v, 0);
  let acum = 0;
  return comps.map((c, i) => {
    const k = explicitos.indexOf(i);
    if (k < 0) return c;
    const v = k === explicitos.length - 1 ? r2(resto - acum) : r2(resto * pesos[k] / total);
    acum = r2(acum + v);
    return { ...c, metrosPorRep: v };
  });
}
// Devuelve un componente al reparto automático (recibe su parte de lo que queda).
export function liberarComponente(componentes, contenido) {
  const k = normalizarNombre(contenido);
  return leerComponentes(componentes).map((c) => (normalizarNombre(c.contenido) === k ? { ...c, modo: 'auto', metrosPorRep: null, pct: null } : c));
}
// Todos los automáticos vuelven a partes iguales (los manuales no se tocan).
export function repartirIgual(componentes) {
  return leerComponentes(componentes).map((c) => (c.modo === 'manual' ? c : { ...c, metrosPorRep: null, pct: null }));
}
// Suma el resto sin asignar (por repetición) al componente `contenido` (lo crea si no existe). Queda manual.
export function asignarResto(linea, contenido, { tipos } = {}) {
  const l = normalizarLinea(linea);
  const r = resolverLinea(l, { tipos });
  if (!(r.resto > EPS)) return l.componentes;
  const k = normalizarNombre(contenido);
  const existe = r.componentes.find((c) => normalizarNombre(c.contenido) === k);
  if (existe) return l.componentes.map((c) => (normalizarNombre(c.contenido) === k ? { ...c, modo: 'manual', pct: null, metrosPorRep: r2(existe.metrosPorRep + r.resto) } : c));
  return [...l.componentes, { contenido: String(contenido).trim(), metrosPorRep: r.resto, modo: 'manual', pct: null }];
}

// ---------- Resolución de una fila ----------
// -> { distancia, series, componentes: [{contenido, modo, pct, metrosPorRep (resuelto), tipo|null}], estilos: [{estilo, metrosPorRep}],
//      asignado, resto, exceso, restoEstilo }
export function resolverLinea(linea, { tipos } = {}) {
  const l = normalizarLinea(linea);
  const D = Number.isFinite(num(l.distancia)) && num(l.distancia) > 0 ? num(l.distancia) : 0;
  const rc = repartir(l.componentes, D);
  const re = repartir(l.estilos.map((e) => ({ metrosPorRep: e.metrosPorRep, pct: 0, modo: 'auto' })), D);
  return {
    distancia: D, series: seriesEfectivas(l),
    componentes: l.componentes.map((c, i) => ({ contenido: c.contenido, modo: c.modo, pct: c.pct, metrosPorRep: rc.m[i], tipo: resolverContenido(c.contenido, tipos) })),
    estilos: l.estilos.map((e, i) => ({ estilo: canonicoEstilo(e.estilo), metrosPorRep: re.m[i] })),
    asignado: rc.asignado, resto: l.componentes.length ? rc.resto : 0, exceso: l.componentes.length ? rc.exceso : 0,
    restoEstilo: l.estilos.length ? re.resto : 0, excesoEstilo: l.estilos.length ? re.exceso : 0,
  };
}

// ---------- Desglose de filas, sets y sesión ----------
const claveContenido = (nombre, tipo) => (tipo ? tipo.id : nombre ? 'txt:' + normalizarNombre(nombre) : '');

// Desglose de UNA fila: metros por contenido y estilo. `heredado` = contenido (tipo|null) de las filas anteriores del set
// para las filas antiguas sin componentes. -> { totalM, contenidos: [{clave, contenido, tipo, metros}], estilos: [{clave, estilo, metros}], resto... }
export function desgloseLinea(linea, { tipos, heredado = null } = {}) {
  const l = normalizarLinea(linea);
  const total = distanciaBloque(l);
  const r = resolverLinea(l, { tipos });
  const S = r.series;
  let contenidos = [];
  let legacy = false;
  if (l.componentes.length) {
    const f = r.exceso > EPS && r.asignado > 0 ? r.distancia / r.asignado : 1; // pasarse de la distancia: se ajusta proporcionalmente
    contenidos = r.componentes.filter((c) => c.metrosPorRep > 0).map((c) => ({
      clave: claveContenido(c.tipo ? c.tipo.nombre : c.contenido, c.tipo), contenido: c.tipo ? c.tipo.nombre : c.contenido, tipo: c.tipo, metros: r2(S * c.metrosPorRep * f),
    }));
  } else if (total > 0) {
    legacy = true;
    const tipo = heredado || null;
    contenidos = [{ clave: claveContenido(tipo ? tipo.nombre : '', tipo), contenido: tipo ? tipo.nombre : '', tipo, metros: total }];
  }
  const asignado = r2(contenidos.reduce((a, c) => a + c.metros, 0));
  const sinAsignarM = Math.max(0, r2(total - asignado));
  if (sinAsignarM > EPS) contenidos.push({ clave: '', contenido: '', tipo: null, metros: sinAsignarM });

  let estilos = [];
  if (l.estilos.length && total > 0) {
    const f = r.excesoEstilo > EPS ? r.distancia / (r.distancia + r.excesoEstilo) : 1;
    estilos = r.estilos.filter((e) => e.metrosPorRep > 0).map((e) => ({ clave: normalizarNombre(e.estilo), estilo: e.estilo, metros: r2(S * e.metrosPorRep * f) }));
  }
  const conEstilo = r2(estilos.reduce((a, e) => a + e.metros, 0));
  if (total - conEstilo > EPS) estilos.push({ clave: '', estilo: '', metros: r2(total - conEstilo) });
  return { totalM: total, contenidos, estilos, legacy, resolucion: r };
}

// Recorre la sesión en orden aplicando la herencia del contenido para las filas antiguas (sin componentes):
// la fila con objetivo fija el contenido del resto del set; si no tiene, usa su bloque, el heredado o su ejercicio.
function recorrer(lineas, tipos) {
  const out = [];
  let setActual = null, heredado = null;
  ordenarLineas((lineas || []).map(normalizarLinea)).filter((l) => !filaVacia(l)).forEach((l) => {
    if (l.set !== setActual) { setActual = l.set; heredado = null; }
    let tipo;
    if (l.objetivo.trim()) { tipo = clasificarTexto(l.objetivo, tipos); heredado = tipo; } else tipo = clasificarTexto(l.bloque, tipos) || heredado || clasificarTexto(l.ejercicio, tipos);
    out.push({ linea: l, desglose: desgloseLinea(l, { tipos, heredado: tipo }) });
  });
  return out;
}

function agregar(items, tipos) {
  const cat = catalogo(tipos);
  const orden = new Map(cat.map((t, i) => [t.id, i]));
  const cont = new Map(), est = new Map();
  let totalM = 0;
  items.forEach(({ desglose: d }) => {
    totalM += d.totalM;
    d.contenidos.forEach((c) => { const e = cont.get(c.clave) || { ...c, metros: 0 }; e.metros = r2(e.metros + c.metros); cont.set(c.clave, e); });
    d.estilos.forEach((x) => { const e = est.get(x.clave) || { ...x, metros: 0 }; e.metros = r2(e.metros + x.metros); est.set(x.clave, e); });
  });
  const ordenar = (a, b) => (a.clave === '') - (b.clave === '') || b.metros - a.metros || (orden.get(a.clave) ?? 999) - (orden.get(b.clave) ?? 999) || String(a.clave).localeCompare(String(b.clave));
  const cs = [...cont.values()].filter((c) => c.metros > 0).sort(ordenar);
  const es = [...est.values()].filter((c) => c.metros > 0).sort(ordenar);
  const pc = porcentajes(cs.map((c) => c.metros));
  const pe = porcentajes(es.map((c) => c.metros));
  return {
    totalM: r2(totalM),
    porContenido: cs.map((c, i) => ({
      contenido: c.contenido, tipoId: c.tipo ? c.tipo.id : '', color: c.tipo ? c.tipo.color : '', predefinido: !!(c.tipo && c.tipo.predefinido),
      corto: c.tipo ? nombreCorto(c.tipo) : c.contenido, metros: c.metros, pct: pc[i],
    })),
    porEstilo: es.map((e, i) => ({ estilo: e.estilo, metros: e.metros, pct: pe[i] })),
  };
}

// Desglose de la sesión: { totalM, porContenido: [{contenido, tipoId, color, corto, metros, pct}], porEstilo: [{estilo, metros, pct}],
//   porSet: [{set, totalM, porContenido, porEstilo}], filas: [{set, orden, ...desgloseLinea}] }
// `contenido: ''` / `estilo: ''` = metros sin contenido / sin estilo asignado. Los % suman 100 (1 decimal). totalM = suma de Dist. Bloque.
export function desgloseSesion(lineas, { tipos } = {}) {
  const items = recorrer(lineas, tipos);
  const base = agregar(items, tipos);
  const sets = [...new Set(items.map((x) => x.linea.set))];
  return {
    ...base,
    porSet: sets.map((s) => ({ set: s, ...agregar(items.filter((x) => x.linea.set === s), tipos) })),
    filas: items.map((x) => ({ set: x.linea.set, orden: x.linea.orden, ...x.desglose })),
  };
}

// Volumen por contenido de VARIAS sesiones (agregados semanales, planificación de temporada).
// sesiones: [lineas[]] o [{ lineas }]. -> { totalM, porContenido, porEstilo, metros: { tipoId: m }, sinClasificar }
export function volumenPorContenido(sesiones, { tipos } = {}) {
  const items = [];
  (sesiones || []).forEach((s) => items.push(...recorrer(Array.isArray(s) ? s : (s && s.lineas) || [], tipos)));
  const base = agregar(items, tipos);
  const metros = {};
  let sinClasificar = 0;
  base.porContenido.forEach((c) => { if (c.tipoId) metros[c.tipoId] = (metros[c.tipoId] || 0) + c.metros; else sinClasificar += c.metros; });
  return { ...base, metros, sinClasificar: r2(sinClasificar) };
}

// ---------- Validación ----------
// -> [{ severidad: 'aviso', codigo, set, orden, campo, params }]
export function validarReparto(linea, { tipos } = {}) {
  const l = normalizarLinea(linea);
  const out = [];
  const pos = { set: l.set, orden: l.orden };
  if (!l.componentes.length && !l.estilos.length) return out;
  const r = resolverLinea(l, { tipos });
  if (!(r.distancia > 0)) { out.push({ severidad: 'aviso', codigo: 'reparto-sin-distancia', campo: 'componentes', ...pos }); return out; }
  if (r.resto > EPS) out.push({ severidad: 'aviso', codigo: 'reparto-incompleto', campo: 'componentes', params: { resto: r.resto, distancia: r.distancia }, ...pos });
  if (r.exceso > EPS) out.push({ severidad: 'aviso', codigo: 'reparto-excede', campo: 'componentes', params: { exceso: r.exceso, distancia: r.distancia }, ...pos });
  if (r.restoEstilo > EPS) out.push({ severidad: 'aviso', codigo: 'estilo-incompleto', campo: 'estilos', params: { resto: r.restoEstilo, distancia: r.distancia }, ...pos });
  if (r.excesoEstilo > EPS) out.push({ severidad: 'aviso', codigo: 'estilo-excede', campo: 'estilos', params: { exceso: r.excesoEstilo, distancia: r.distancia }, ...pos });
  return out;
}
export function validarRepartoSesion(lineas, { tipos } = {}) {
  return ordenarLineas((lineas || []).map(normalizarLinea)).filter((l) => !filaVacia(l)).flatMap((l) => validarReparto(l, { tipos }));
}

// ---------- Presentación en texto (sin i18n: las etiquetas llegan por parámetro) ----------
const nfm = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
const defMetros = (n) => `${nfm(n)} m`;
const defPct = (p) => `${String(p).replace('.', ',')} %`;

// "75 AeL + 25 Sprint" (contenidos de una fila por repetición); un solo contenido: sólo su nombre. Con estilo: " · Crol".
export function textoEjercicio(linea, { tipos, etiqueta = (c) => (c.tipo ? nombreCorto(c.tipo) : c.contenido), etiquetaEstilo = (e) => e } = {}) {
  const r = resolverLinea(linea, { tipos });
  const partes = [];
  if (r.componentes.length === 1) partes.push(etiqueta(r.componentes[0]));
  else if (r.componentes.length) {
    partes.push(r.componentes.filter((c) => c.metrosPorRep > 0).map((c) => `${nfm(c.metrosPorRep)} ${etiqueta(c)}`).join(' + '));
  }
  if (r.estilos.length) partes.push(r.estilos.filter((e) => e.metrosPorRep > 0).map((e) => (r.estilos.length > 1 ? `${nfm(e.metrosPorRep)} ${etiquetaEstilo(e.estilo)}` : etiquetaEstilo(e.estilo))).join(' + '));
  return partes.filter(Boolean).join('  ·  ');
}

// Resumen en una línea como el del entrenador:
//   "Volumen total: 400 m (AeL 300 m · Sprint 100 m) · Por estilo: Crol 400 m"
// etq: { total, porEstilo, sinContenido, sinEstilo } ; nombre(item) / nombreEstilo(item): texto visible; metros(n) / pct(p): formato.
export function textoResumen(d, { etq = {}, nombre = (c) => c.corto || c.contenido, nombreEstilo = (e) => e.estilo, metros = defMetros, pct = defPct, conPct = false } = {}) {
  const e = { total: 'Volumen total', porEstilo: 'Por estilo', sinContenido: 'Sin contenido', sinEstilo: 'Sin estilo', pctContenido: '% por contenido', pctEstilo: '% por estilo', ...etq };
  const cont = d.porContenido.map((c) => `${c.contenido ? nombre(c) : e.sinContenido} ${metros(c.metros)}`);
  const est = d.porEstilo.map((x) => `${x.estilo ? nombreEstilo(x) : e.sinEstilo} ${metros(x.metros)}`);
  let linea = `${e.total}: ${metros(d.totalM)}`;
  if (cont.length) linea += ` (${cont.join(' · ')})`;
  if (est.length) linea += ` · ${e.porEstilo}: ${est.join(' · ')}`;
  if (!conPct) return linea;
  const pc = d.porContenido.map((c) => `${c.contenido ? nombre(c) : e.sinContenido} ${pct(c.pct)}`).join(' · ');
  const pe = d.porEstilo.map((x) => `${x.estilo ? nombreEstilo(x) : e.sinEstilo} ${pct(x.pct)}`).join(' · ');
  return [linea, [pc && `${e.pctContenido}: ${pc}`, pe && `${e.pctEstilo}: ${pe}`].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
}

// ---------- Renombrar / fusionar contenidos en los componentes ya guardados ----------
// valor: columna `componentes` (JSON) de una fila. -> JSON nuevo, o null si la fila no usa `de` (nada que cambiar).
export function renombrarEnComponentes(valor, de, a) {
  const k = normalizarNombre(de);
  const lista = leerComponentes(valor);
  if (!lista.some((c) => normalizarNombre(c.contenido) === k)) return null;
  const out = [];
  lista.forEach((c) => {
    const nuevo = normalizarNombre(c.contenido) === k ? { ...c, contenido: a } : c;
    const previo = out.find((x) => normalizarNombre(x.contenido) === normalizarNombre(nuevo.contenido));
    if (!previo) { out.push(nuevo); return; }
    // dos componentes acaban siendo el mismo contenido: se suman sus metros y se conserva el modo manual
    if (nuevo.metrosPorRep != null || previo.metrosPorRep != null) previo.metrosPorRep = r2((previo.metrosPorRep || 0) + (nuevo.metrosPorRep || 0));
    if (nuevo.pct || previo.pct) previo.pct = r2((previo.pct || 0) + (nuevo.pct || 0));
    if (nuevo.modo === 'manual') previo.modo = 'manual';
  });
  return escribirComponentes(out);
}

// ---------- Colores de los estilos (editor y PDF) ----------
export const COLOR_ESTILO = { crol: '#1a73e8', espalda: '#00897b', braza: '#8d6e63', mariposa: '#d93025', estilos: '#7e57c2' };
export const COLOR_OTRO_ESTILO = '#6d4c9f';
export const COLOR_SIN_ESTILO = '#9aa4b2';
export const claveEstilo = (e) => normalizarNombre(e);
export const colorEstilo = (e) => (e ? COLOR_ESTILO[claveEstilo(e)] || COLOR_OTRO_ESTILO : COLOR_SIN_ESTILO);
// '#1a73e8' -> [26, 115, 232] (gris si no es un color válido)
export function hexA(c) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
  if (!m) return [154, 164, 178];
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
