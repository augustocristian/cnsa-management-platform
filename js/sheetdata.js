// Documento del club (cnl/<Club>.json) <-> datos en memoria, hash y fusión por fila. Sin dependencias del navegador.
// Formato del fichero: { version: 1, club: { clave: valor }, hojas: { Nadadores: [fila...], ... } }
// Las "hojas" siguen los nombres y columnas de schema.js (las mismas que el Excel exportable).
import { SHEETS, ENTITY_SHEETS } from './schema.js';

export const DOC_VERSION = 1;
const norm = (v) => (v === undefined || v === null ? '' : v);

// {db, club} -> documento JSON (cada fila con exactamente las columnas del esquema)
export function dataToDoc(data) {
  const hojas = {};
  ENTITY_SHEETS.forEach((s) => {
    hojas[s] = (data.db[s] || []).map((r) => { const o = {}; SHEETS[s].forEach((c) => { o[c] = norm(r[c]); }); return o; });
  });
  return { version: DOC_VERSION, club: Object.assign({}, data.club || {}), hojas };
}

// Inverso de dataToDoc; tolera hojas ausentes, filas sin id (se descartan), ids duplicados (gana la última) y versiones futuras.
export function docToData(doc) {
  const out = { db: {}, club: {} };
  const d = doc && typeof doc === 'object' ? doc : {};
  const club = d.club && typeof d.club === 'object' && !Array.isArray(d.club) ? d.club : {};
  Object.keys(club).forEach((k) => { out.club[k] = club[k]; });
  const hojas = d.hojas && typeof d.hojas === 'object' ? d.hojas : {};
  ENTITY_SHEETS.forEach((s) => {
    const seen = new Map();
    (Array.isArray(hojas[s]) ? hojas[s] : []).forEach((r) => {
      if (!r || typeof r !== 'object' || norm(r.id) === '') return;
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = norm(r[c]); });
      o.id = String(o.id);
      seen.set(o.id, o);
    });
    out.db[s] = [...seen.values()];
  });
  return out;
}

// true si no hay ningún dato (fichero recién creado).
export function isEmptyData(data) {
  return !Object.keys(data.club || {}).length && ENTITY_SHEETS.every((s) => !(data.db[s] || []).length);
}

// Hash estable del contenido (FNV-1a de 32 bits sobre el JSON canónico).
export function hashData(data) {
  const str = JSON.stringify(dataToDoc(data));
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16) + ':' + str.length;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Fusión de tres vías por fila (id): parte de lo remoto y aplica los cambios locales respecto a base.
// base = null (se desconoce): los datos locales prevalecen y no hay borrados.
export function mergeData(base, local, remote) {
  const out = { db: {}, club: Object.assign({}, remote.club) };
  ENTITY_SHEETS.forEach((s) => {
    const byId = (rows) => new Map((rows || []).map((r) => [r.id, r]));
    const b = byId(base && base.db[s]);
    const l = byId(local.db[s]);
    const res = byId(remote.db[s]);
    l.forEach((row, id) => { if (!base || !b.has(id) || !same(b.get(id), row)) res.set(id, row); });
    if (base) b.forEach((_, id) => { if (!l.has(id)) res.delete(id); });
    out.db[s] = [...res.values()];
  });
  const bc = (base && base.club) || {};
  Object.keys(local.club || {}).forEach((k) => { if (!base || !(k in bc) || !same(bc[k], local.club[k])) out.club[k] = local.club[k]; });
  if (base) Object.keys(bc).forEach((k) => { if (!(k in (local.club || {}))) delete out.club[k]; });
  return out;
}
