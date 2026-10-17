// Domain of the user's preferences: PURE logic (no DOM, network or localStorage).
// Shape of the cnl/preferencias.json file in their Drive:
//   { version: 1, valores: { clave: valor }, marcas: { clave: marcaTiempoMs } }
// Each key carries its own timestamp: the merge between devices is "the most recent wins per key",
// so two devices changing different things do not overwrite each other. A null value is a tombstone (deletion).
// Unknown keys (from a future version) are kept when rewriting.

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
  tema: 'tema', // 'light' | 'dark' (absent = automatic, follows the system)
  calSync: 'calSync.', // prefix: calSync.<key of the map per club and user>
};

const esObjeto = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const esTexto = (x) => typeof x === 'string' && x.length > 0 && x.length < 500;
const entero = (x) => Number.isInteger(x);

// Per-key validators: they return the clean value or undefined if it is not valid (it is ignored).
const SANEADORES = {
  idioma: (v) => (IDIOMAS.includes(v) ? v : undefined),
  tema: (v) => (v === 'light' || v === 'dark' ? v : undefined),
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

// Validates a value for a key. Unknown keys: accepted as they are (forward compatibility),
// except calSync.*, which must be {items:{}, ultima}.
export function sanear(clave, valor) {
  if (valor === null) return null; // tombstone
  if (SANEADORES[clave]) return SANEADORES[clave](valor);
  if (clave.startsWith(CLAVES.calSync)) return esObjeto(valor) && esObjeto(valor.items) ? { items: valor.items, ultima: valor.ultima || null } : undefined;
  return valor === undefined ? undefined : valor;
}

export function vacias() { return { version: VERSION, valores: {}, marcas: {} }; }

// Accepts anything (corrupt file, future version...) and returns well-formed preferences.
export function normalizar(raw) {
  const out = vacias();
  if (!esObjeto(raw)) return out;
  if (entero(raw.version) && raw.version >= 1) out.version = raw.version; // a future version is not downgraded
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

// Returns new preferences with the key set, or the SAME instance if nothing changes (or the value is not valid).
export function poner(p, clave, valor, ts) {
  const limpio = valor === undefined ? null : sanear(clave, valor);
  if (limpio === undefined) return p;
  const actual = p.valores[clave] === undefined ? null : p.valores[clave];
  if (igualValor(actual, limpio)) return p;
  return { version: p.version, valores: { ...p.valores, [clave]: limpio }, marcas: { ...p.marcas, [clave]: ts } };
}

// Per-key merge: the most recent timestamp wins; tie -> the remote one. Returns
// {resultado, deLocal: [keys where the result differs from the remote (they must be uploaded)],
//  deRemoto: [keys where the result differs from the local one (they must be applied)]}
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
