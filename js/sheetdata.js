// Conversión datos <-> pestañas de Google Sheets (filas de celdas), hash y fusión. Sin dependencias del navegador.
import { SHEETS, ENTITY_SHEETS } from './schema.js';

const CHUNK = 40000; // límite de Sheets: 50.000 caracteres por celda
const norm = (v) => (v === undefined || v === null ? '' : v);

// {db, club} -> {Club: [[cab],[fila]...], Nadadores: [...], ...} (fila 1 = cabeceras)
export function dataToTabs(data) {
  const tabs = { Club: [SHEETS.Club.slice()] };
  Object.keys(data.club || {}).forEach((k) => {
    const v = norm(data.club[k]);
    if (typeof v === 'string' && v.length > CHUNK) {
      for (let i = 0, n = 0; i < v.length; i += CHUNK, n++) tabs.Club.push([n ? k + '#' + n : k, v.slice(i, i + CHUNK)]);
    } else tabs.Club.push([k, v]);
  });
  ENTITY_SHEETS.forEach((s) => {
    tabs[s] = [SHEETS[s].slice()].concat((data.db[s] || []).map((r) => SHEETS[s].map((c) => norm(r[c]))));
  });
  return tabs;
}

// Inverso de dataToTabs; tolera pestañas ausentes, columnas reordenadas y filas cortas.
export function tabsToData(tabs) {
  const out = { db: {}, club: {} };
  const objs = (name) => {
    const rows = (tabs && tabs[name]) || [];
    if (!rows.length) return [];
    const head = rows[0].map(String);
    return rows.slice(1).map((r) => { const o = {}; head.forEach((h, i) => { o[h] = norm(r[i]); }); return o; });
  };
  const chunks = {};
  objs('Club').forEach((r) => {
    if (r.clave === '') return;
    const m = /^(.*)#(\d+)$/.exec(String(r.clave));
    if (m) (chunks[m[1]] = chunks[m[1]] || []).push([Number(m[2]), String(r.valor)]);
    else out.club[String(r.clave)] = r.valor;
  });
  Object.keys(chunks).forEach((k) => {
    chunks[k].sort((a, b) => a[0] - b[0]);
    out.club[k] = String(out.club[k] === undefined ? '' : out.club[k]) + chunks[k].map((c) => c[1]).join('');
  });
  ENTITY_SHEETS.forEach((s) => {
    const seen = new Map();
    objs(s).forEach((r) => {
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = norm(r[c]); });
      if (o.id === '') return;
      o.id = String(o.id);
      seen.set(o.id, o); // ids duplicados: gana la última fila
    });
    out.db[s] = [...seen.values()];
  });
  return out;
}

// true si no hay ningún dato (hoja recién creada).
export function isEmptyData(data) {
  return !Object.keys(data.club || {}).length && ENTITY_SHEETS.every((s) => !(data.db[s] || []).length);
}

// Hash estable del contenido (FNV-1a de 32 bits sobre el JSON canónico).
export function hashData(data) {
  const tabs = dataToTabs(data);
  const str = JSON.stringify(Object.keys(tabs).sort().map((k) => [k, tabs[k]]));
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
