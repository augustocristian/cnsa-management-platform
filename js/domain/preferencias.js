// Dominio de las preferencias del usuario: lógica PURA (sin DOM, red ni localStorage).
// Forma del fichero cnl/preferencias.json de su Drive:
//   { version: 1, valores: { clave: valor }, marcas: { clave: marcaTiempoMs } }
// Cada clave lleva su propia marca de tiempo: la fusión entre dispositivos es "gana la más reciente por clave",
// de modo que dos dispositivos que cambian cosas distintas no se pisan. Un valor null es una lápida (borrado).
// Las claves desconocidas (de una versión futura) se conservan al reescribir.

export const VERSION = 1;
export const IDIOMAS = ['es', 'en', 'it'];
export const VISTAS_CALENDARIO = ['mes', 'semana', 'agenda'];
export const VENTANAS_CALENDARIO = [30, 90, 180];
export const ALARMAS_CALENDARIO = [0, 30, 60];

export const CLAVES = {
  idioma: 'idioma',
  ultimoClub: 'ultimoClub',
  clubes: 'clubes',
  tutorial: 'tutorial',
  calVista: 'calendario.vista',
  calVentana: 'calendario.ventanaDias',
  calAlarma: 'calendario.alarmaMin',
  calSync: 'calSync.', // prefijo: calSync.<clave del mapa por club y usuario>
};

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const esTexto = (x) => typeof x === 'string' && x.length > 0 && x.length < 500;
const entero = (x) => Number.isInteger(x);

// Validadores por clave: devuelven el valor limpio o undefined si no vale (se ignora).
const SANEADORES = {
  idioma: (v) => (IDIOMAS.includes(v) ? v : undefined),
  ultimoClub: (v) => (esTexto(v) ? v : undefined),
  clubes: (v) => {
    if (!Array.isArray(v)) return undefined;
    const vistos = new Set();
    return v.filter((c) => esObjeto(c) && esTexto(c.id) && !vistos.has(c.id) && vistos.add(c.id))
      .map((c) => ({ id: c.id, name: typeof c.name === 'string' ? c.name.slice(0, 200) : '' }));
  },
  tutorial: (v) => {
    if (!esObjeto(v)) return undefined;
    const done = Array.isArray(v.done) ? [...new Set(v.done.filter((n) => entero(n) && n >= 1 && n <= 50))].sort((a, b) => a - b) : [];
    return { done, current: entero(v.current) && v.current >= 1 && v.current <= 50 ? v.current : 1 };
  },
  'calendario.vista': (v) => (VISTAS_CALENDARIO.includes(v) ? v : undefined),
  'calendario.ventanaDias': (v) => (VENTANAS_CALENDARIO.includes(v) ? v : undefined),
  'calendario.alarmaMin': (v) => (ALARMAS_CALENDARIO.includes(v) ? v : undefined),
};

// Valida un valor para una clave. Claves desconocidas: se aceptan tal cual (compatibilidad hacia delante),
// salvo calSync.*, que debe ser {items:{}, ultima}.
export function sanear(clave, valor) {
  if (valor === null) return null; // lápida
  if (SANEADORES[clave]) return SANEADORES[clave](valor);
  if (clave.startsWith(CLAVES.calSync)) return esObjeto(valor) && esObjeto(valor.items) ? { items: valor.items, ultima: valor.ultima || null } : undefined;
  return valor === undefined ? undefined : valor;
}

export function vacias() { return { version: VERSION, valores: {}, marcas: {} }; }

// Acepta cualquier cosa (fichero corrupto, versión futura...) y devuelve unas preferencias bien formadas.
export function normalizar(raw) {
  const out = vacias();
  if (!esObjeto(raw)) return out;
  if (entero(raw.version) && raw.version >= 1) out.version = raw.version; // no se degrada una versión futura
  const valores = esObjeto(raw.valores) ? raw.valores : {};
  const marcas = esObjeto(raw.marcas) ? raw.marcas : {};
  Object.keys(valores).forEach((k) => {
    const v = sanear(k, valores[k]);
    if (v === undefined) return;
    out.valores[k] = v;
    out.marcas[k] = Number.isFinite(marcas[k]) ? marcas[k] : 0;
  });
  return out;
}

export function obtener(p, clave, def) {
  const v = p.valores[clave];
  return v === undefined || v === null ? def : v;
}

const igualValor = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Devuelve unas preferencias nuevas con la clave fijada, o la MISMA instancia si no hay cambio (o el valor no vale).
export function poner(p, clave, valor, ts) {
  const limpio = valor === undefined ? null : sanear(clave, valor);
  if (limpio === undefined) return p;
  const actual = p.valores[clave] === undefined ? null : p.valores[clave];
  if (igualValor(actual, limpio)) return p;
  return { version: p.version, valores: { ...p.valores, [clave]: limpio }, marcas: { ...p.marcas, [clave]: ts } };
}

// Fusión por clave: gana la marca más reciente; empate -> el remoto. Devuelve
// {resultado, deLocal: [claves donde el resultado difiere del remoto (hay que subirlas)],
//  deRemoto: [claves donde el resultado difiere de lo local (hay que aplicarlas)]}
export function fusionar(local, remoto) {
  const resultado = { version: Math.max(local.version, remoto.version), valores: {}, marcas: {} };
  const claves = new Set([...Object.keys(local.valores), ...Object.keys(remoto.valores)]);
  const deLocal = [];
  const deRemoto = [];
  claves.forEach((k) => {
    const tl = k in local.valores ? local.marcas[k] || 0 : -1;
    const tr = k in remoto.valores ? remoto.marcas[k] || 0 : -1;
    const gana = tl > tr ? local : remoto;
    resultado.valores[k] = gana.valores[k];
    resultado.marcas[k] = gana.marcas[k] || 0;
    const l = k in local.valores ? local.valores[k] : null;
    const r = k in remoto.valores ? remoto.valores[k] : null;
    if (!igualValor(resultado.valores[k], r)) deLocal.push(k);
    if (!igualValor(resultado.valores[k], l)) deRemoto.push(k);
  });
  return { resultado, deLocal, deRemoto };
}

export function iguales(a, b) {
  return a.version === b.version && igualValor(a.valores, b.valores) && igualValor(a.marcas, b.marcas);
}
