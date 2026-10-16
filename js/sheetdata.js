// Club document (cnl/<Club>.json) <-> in-memory data, hash and per-field merge. No browser dependencies.
// File format: { version: 1, club: { key: value }, hojas: { Nadadores: [row...], ... }, sync?: {...} }
// The "hojas" (sheets) follow the names and columns of schema.js (the same ones as the exportable Excel).
//
// In-memory data: { db, club, meta?, extra?, avisos?, versionFutura? }
//   meta   = sync metadata (logical clock, per-row stamps and tombstones of deleted rows); see below.
//   extra  = what this code does not know (sheets, columns and keys of a file written by a newer version):
//            it is kept and written back as is (lossless round trip).
//   avisos = problems found while reading (duplicated ids, rows without id).
//   versionFutura = the file's version number if it is GREATER than DOC_VERSION (the store becomes read-only).
import { SHEETS, ENTITY_SHEETS } from './schema.js';

export const DOC_VERSION = 1;
const norm = (v) => (v === undefined || v === null ? '' : v);
const esObjeto = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

// ---------- Type normalisation ----------
// Excel and other editors turn "0034 600" into a number or "2012-03-04" into a serial date: everything goes back to text.
const COLS_TEXTO = new Set(['nombre', 'apellidos', 'email', 'telefono', 'tutor', 'licencia', 'notas', 'titulo', 'descripcion', 'texto', 'autor',
  'categoria', 'sexo', 'prueba', 'competicion', 'lugar', 'entrenador', 'talla', 'estado', 'piscina', 'activo', 'predefinido', 'activa', 'tipo', 'enfoque', 'alias']);
const COLS_FECHA = new Set(['fecha', 'fechaNacimiento', 'fechaInicio', 'fechaFin', 'lunes']);
const COLS_HORA = new Set(['hora', 'horaInicio', 'horaFin']);
const esColTexto = (c) => COLS_TEXTO.has(c) || /Id$/.test(c);

const pad2 = (n) => String(n).padStart(2, '0');
// Excel serial number (days since 1899-12-30) -> 'YYYY-MM-DD'
export function fechaDeSerieExcel(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 1 || x > 2958465) return '';
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(x) * 86400000).toISOString().slice(0, 10);
}
function horaDeFraccion(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0 || x >= 1) return String(n);
  const min = Math.round(x * 1440);
  return pad2(Math.floor(min / 60) % 24) + ':' + pad2(min % 60);
}
const aTexto = (v) => {
  if (typeof v === 'string') return v;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
};

// Value of a cell in column `col` -> normalised value (text in text columns, ISO in dates, HH:MM in times).
export function normalizarValor(col, v) {
  if (v === undefined || v === null) return '';
  if (COLS_FECHA.has(col)) {
    if (typeof v === 'number') return fechaDeSerieExcel(v) || String(v);
    return aTexto(v);
  }
  if (COLS_HORA.has(col)) {
    if (typeof v === 'number') return horaDeFraccion(v);
    return aTexto(v);
  }
  if (esColTexto(col)) return aTexto(v);
  return v;
}

// Value of the Club sheet (key/value): text only.
export function normalizarClub(v) {
  if (v === undefined || v === null) return '';
  return aTexto(v);
}

// ---------- Sync metadata: logical clock, stamps and tombstones ----------
// A stamp is "n@device": n comes from a Lamport clock (it grows with each local change and jumps to the highest seen on another device),
// so it orders changes without depending on wall-clock time (which may be wrong on a device).
export const metaVacia = () => ({ reloj: 0, sellos: {}, lapidas: {} });
export function parseSello(s) {
  const [n, d] = String(s || '').split('@');
  return [Number(n) || 0, d || ''];
}
// >0 if a is later than b
export function cmpSello(a, b) {
  const [na, da] = parseSello(a);
  const [nb, db] = parseSello(b);
  return na !== nb ? na - nb : (da < db ? -1 : da > db ? 1 : 0);
}
const masReciente = (a, b) => (cmpSello(a, b) >= 0 ? a : b);

const LAPIDAS_VENTANA = 5000; // logical operations a "soft" tombstone is kept before being purged
// Removes old tombstones (the deletion has already been seen by every device that syncs regularly).
// GDPR purge ones (h) are kept: they stop a device with old data from resurrecting the swimmer.
export function purgarLapidas(meta, ventana = LAPIDAS_VENTANA) {
  if (!meta) return 0;
  let n = 0;
  Object.keys(meta.lapidas || {}).forEach((s) => {
    Object.keys(meta.lapidas[s]).forEach((id) => {
      const l = meta.lapidas[s][id];
      if (!l.h && parseSello(l.s)[0] < meta.reloj - ventana) { delete meta.lapidas[s][id]; n++; }
    });
  });
  return n;
}

const cloneMeta = (m) => {
  const o = metaVacia();
  if (!m) return o;
  o.reloj = Number(m.reloj) || 0;
  Object.keys(m.sellos || {}).forEach((s) => { o.sellos[s] = { ...m.sellos[s] }; });
  Object.keys(m.lapidas || {}).forEach((s) => { o.lapidas[s] = {}; Object.keys(m.lapidas[s]).forEach((id) => { o.lapidas[s][id] = { ...m.lapidas[s][id] }; }); });
  return o;
};

function metaDeDoc(sync) {
  const m = metaVacia();
  if (!esObjeto(sync)) return m;
  m.reloj = Number(sync.reloj) || 0;
  if (esObjeto(sync.sellos)) Object.keys(sync.sellos).forEach((s) => { if (esObjeto(sync.sellos[s])) m.sellos[s] = { ...sync.sellos[s] }; });
  if (esObjeto(sync.lapidas)) Object.keys(sync.lapidas).forEach((s) => {
    if (!esObjeto(sync.lapidas[s])) return;
    m.lapidas[s] = {};
    Object.keys(sync.lapidas[s]).forEach((id) => { const l = sync.lapidas[s][id]; if (esObjeto(l) && l.s) m.lapidas[s][id] = { s: String(l.s), ...(l.h ? { h: 1 } : {}) }; });
  });
  return m;
}

// ---------- Document <-> data ----------
const CLAVES_DOC = new Set(['version', 'club', 'hojas', 'sync']);

// {db, club, meta?, extra?} -> JSON document (each row with exactly the schema columns + any unknown columns it carried)
export function dataToDoc(data) {
  const extra = data.extra || {};
  const hojas = {};
  ENTITY_SHEETS.forEach((s) => {
    const cols = (extra.cols && extra.cols[s]) || {};
    hojas[s] = (data.db[s] || []).map((r) => {
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = norm(r[c]); });
      if (cols[r.id]) Object.keys(cols[r.id]).forEach((c) => { if (!(c in o)) o[c] = cols[r.id][c]; });
      return o;
    });
  });
  Object.keys(extra.hojas || {}).forEach((s) => { if (!(s in hojas)) hojas[s] = extra.hojas[s]; });
  const doc = { version: DOC_VERSION, club: Object.assign({}, data.club || {}), hojas };
  if (data.meta) {
    const m = data.meta;
    doc.sync = { reloj: m.reloj, sellos: m.sellos, lapidas: m.lapidas };
  }
  Object.keys(extra.top || {}).forEach((k) => { if (!(k in doc)) doc[k] = extra.top[k]; });
  return doc;
}

// Inverse of dataToDoc; tolerates missing sheets, rows without id (dropped with a warning), duplicated ids (the last wins, with a warning),
// odd types (normalised) and future versions (unknown content is kept in `extra`).
export function docToData(doc) {
  const d = esObjeto(doc) ? doc : {};
  const out = { db: {}, club: {}, meta: metaDeDoc(d.sync), extra: { top: {}, hojas: {}, cols: {} }, avisos: [] };
  const v = Number(d.version);
  if (Number.isFinite(v) && v > DOC_VERSION) out.versionFutura = v;
  const club = esObjeto(d.club) ? d.club : {};
  Object.keys(club).forEach((k) => { out.club[k] = normalizarClub(club[k]); });
  const hojas = esObjeto(d.hojas) ? d.hojas : {};
  ENTITY_SHEETS.forEach((s) => {
    const seen = new Map();
    (Array.isArray(hojas[s]) ? hojas[s] : []).forEach((r) => {
      if (!r || typeof r !== 'object' || Array.isArray(r) || norm(r.id) === '') { out.avisos.push({ tipo: 'sin-id', hoja: s }); return; }
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = normalizarValor(c, r[c]); });
      o.id = String(o.id);
      if (seen.has(o.id)) out.avisos.push({ tipo: 'duplicado', hoja: s, id: o.id });
      seen.set(o.id, o);
      const desconocidas = Object.keys(r).filter((c) => !SHEETS[s].includes(c));
      if (desconocidas.length) {
        (out.extra.cols[s] ||= {})[o.id] = Object.fromEntries(desconocidas.map((c) => [c, r[c]]));
      } else if (out.extra.cols[s]) delete out.extra.cols[s][o.id];
    });
    out.db[s] = [...seen.values()];
  });
  Object.keys(hojas).forEach((s) => { if (!ENTITY_SHEETS.includes(s) && s !== 'Club') out.extra.hojas[s] = hojas[s]; });
  Object.keys(d).forEach((k) => { if (!CLAVES_DOC.has(k)) out.extra.top[k] = d[k]; });
  return out;
}

// true if there is no data at all (freshly created or empty file).
export function isEmptyData(data) {
  const ex = data.extra || {};
  return !Object.keys(data.club || {}).length && ENTITY_SHEETS.every((s) => !(data.db[s] || []).length)
    && !Object.keys(ex.hojas || {}).length && !Object.keys(ex.top || {}).length;
}

// Does the document have the shape of a club document? ({} or null do not: that is not a new club, it is an emptied file)
export function pareceDocumentoClub(doc) {
  return esObjeto(doc) && (esObjeto(doc.hojas) || esObjeto(doc.club)) && doc.version !== undefined;
}

// Stable content hash (32-bit FNV-1a over the canonical JSON; excludes the sync metadata).
export function hashData(data) {
  const doc = dataToDoc({ db: data.db, club: data.club, extra: data.extra });
  const str = JSON.stringify(doc);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16) + ':' + str.length;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- Merge ----------
// Child -> parent relations used to clean up orphans after a merge: [child sheet, column, parent sheet]
export const RELACIONES = [
  ['Asistencia', 'nadadorId', 'Nadadores'], ['Asistencia', 'entrenamientoId', 'Entrenamientos'],
  ['Cargas', 'nadadorId', 'Nadadores'], ['Cargas', 'entrenamientoId', 'Entrenamientos'],
  ['Marcas', 'nadadorId', 'Nadadores'], ['Banador', 'nadadorId', 'Nadadores'],
  ['EntrenoLineas', 'entrenamientoId', 'Entrenamientos'],
  ['Fases', 'temporadaId', 'Temporadas'], ['SemanasPlan', 'temporadaId', 'Temporadas'], ['EventosTemporada', 'temporadaId', 'Temporadas'],
  ['AsignacionesCalle', 'piscinaId', 'Piscinas'],
];

// PER-FIELD three-way merge: starts from the remote and applies the local changes relative to the base.
//  - Row on both sides: each column resolves on its own (the one only one side changed is taken from that side); if both changed it
//    differently the most recent logical stamp wins (without stamps, the local one).
//  - Deleted on one side and edited on the other: the edit wins (no work is lost), except for a GDPR purge (tombstone `h`), which always deletes.
//  - Deletions leave a tombstone (id + stamp): so a device without a base (lost cache) does not resurrect deleted rows either.
//  - After merging, orphan rows of deleted parents are removed (e.g. loads of a swimmer deleted on another device).
// base = null (unknown): local data prevails in conflicts and deletions only come from tombstones.
export function mergeData(base, local, remote, { dispositivo = 'merge' } = {}) {
  const lm = cloneMeta(local.meta);
  const rm = cloneMeta(remote.meta);
  const out = { db: {}, club: Object.assign({}, remote.club), meta: metaVacia(), extra: mezclarExtra(local.extra, remote.extra), avisos: [] };
  if (remote.versionFutura) out.versionFutura = remote.versionFutura;
  out.meta.reloj = Math.max(lm.reloj, rm.reloj);
  const nuevoSello = () => `${++out.meta.reloj}@${dispositivo}`;

  ENTITY_SHEETS.forEach((s) => {
    const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]));
    const B = base ? byId(base.db[s]) : null;
    const L = byId(local.db[s]);
    const R = byId(remote.db[s]);
    const sellosL = lm.sellos[s] || {};
    const sellosR = rm.sellos[s] || {};
    const lapL = lm.lapidas[s] || {};
    const lapR = rm.lapidas[s] || {};
    const filas = new Map();
    const sellos = {};
    const lapidas = {};
    const lapida = (id, l) => {
      const p = lapidas[id];
      lapidas[id] = p ? { s: masReciente(p.s, l.s), ...(p.h || l.h ? { h: 1 } : {}) } : { ...l };
    };
    const ids = [...new Set([...R.keys(), ...L.keys(), ...Object.keys(lapL), ...Object.keys(lapR)])];
    ids.forEach((id) => {
      const l = L.get(id);
      const r = R.get(id);
      const b = B ? B.get(id) : undefined;
      const sl = sellosL[id];
      const sr = sellosR[id];
      const tl = lapL[id];
      const tr = lapR[id];
      if (l && r) {
        const row = {};
        Object.keys(l).forEach((c) => {
          if (same(l[c], r[c])) row[c] = l[c];
          else if (b && same(l[c], b[c])) row[c] = r[c];
          else if (b && same(r[c], b[c])) row[c] = l[c];
          else row[c] = sr && (!sl || cmpSello(sr, sl) > 0) ? r[c] : l[c];
        });
        Object.keys(r).forEach((c) => { if (!(c in row)) row[c] = r[c]; });
        filas.set(id, row);
        const st = sl && sr ? masReciente(sl, sr) : (sl || sr);
        if (st) sellos[id] = st;
      } else if (l) { // missing on the remote side
        const remotoBorro = (b !== undefined) || tr;
        let conservar = true;
        if (remotoBorro) {
          if (tr && tr.h) conservar = false;
          else if (b !== undefined) conservar = !same(l, b); // no local changes: the deletion wins; edited: the edit wins
          else conservar = !!sl && cmpSello(sl, tr.s) > 0; // no base: was it edited after the deletion?
        }
        if (conservar) { filas.set(id, l); if (sl) sellos[id] = sl; } else lapida(id, tr || { s: nuevoSello() });
      } else if (r) { // missing on the local side
        const localBorro = (b !== undefined) || tl;
        let conservar = true;
        if (localBorro) {
          if (tl && tl.h) conservar = false;
          else if (b !== undefined) conservar = !same(r, b);
          else conservar = !!sr && cmpSello(sr, tl.s) > 0;
        }
        if (conservar) { filas.set(id, r); if (sr) sellos[id] = sr; } else lapida(id, tl || { s: nuevoSello() });
      }
      if (tl && !filas.has(id)) lapida(id, tl);
      if (tr && !filas.has(id)) lapida(id, tr);
    });
    out.db[s] = [...filas.values()];
    out.meta.sellos[s] = sellos;
    out.meta.lapidas[s] = lapidas;
  });

  limpiarHuerfanas(out, nuevoSello);

  const bc = (base && base.club) || {};
  Object.keys(local.club || {}).forEach((k) => {
    const lv = local.club[k];
    if (!base || !(k in bc) || !same(bc[k], lv)) {
      // Changed locally: local wins, even if the remote changed it to something else (the user's latest edit)
      out.club[k] = lv;
    }
  });
  if (base) Object.keys(bc).forEach((k) => { if (!(k in (local.club || {})) && same(bc[k], remote.club[k])) delete out.club[k]; });
  return out;
}

// Removes from `data` the child rows pointing at a DELETED parent (tombstoned or absent after a merge). Returns how many it removed.
// A child whose parent never existed is left as is (that is not a deletion).
export function limpiarHuerfanas(data, nuevoSello) {
  let n = 0;
  const meta = data.meta || null;
  RELACIONES.forEach(([hijo, col, padre]) => {
    const vivos = new Set((data.db[padre] || []).map((r) => r.id));
    const borrados = meta && meta.lapidas[padre] ? meta.lapidas[padre] : {};
    const antes = (data.db[hijo] || []).length;
    const quitar = [];
    data.db[hijo] = (data.db[hijo] || []).filter((r) => {
      const fk = r[col];
      if (fk === '' || fk === undefined || fk === null) return true;
      const huerfana = !vivos.has(String(fk)) && Object.prototype.hasOwnProperty.call(borrados, String(fk));
      if (huerfana) quitar.push(r.id);
      return !huerfana;
    });
    if (meta && quitar.length) {
      meta.lapidas[hijo] ||= {};
      quitar.forEach((id) => { meta.lapidas[hijo][id] = { s: nuevoSello ? nuevoSello() : `${meta.reloj}@merge` }; if (meta.sellos[hijo]) delete meta.sellos[hijo][id]; });
    }
    n += antes - data.db[hijo].length;
  });
  return n;
}

function mezclarExtra(a, b) {
  const x = a || { top: {}, hojas: {}, cols: {} };
  const y = b || { top: {}, hojas: {}, cols: {} };
  const cols = {};
  new Set([...Object.keys(x.cols || {}), ...Object.keys(y.cols || {})]).forEach((s) => { cols[s] = { ...(x.cols || {})[s], ...(y.cols || {})[s] }; });
  return { top: { ...x.top, ...y.top }, hojas: { ...x.hojas, ...y.hojas }, cols };
}
