// Logical stamps and tombstones of the club data (Lamport-style, no wall clock): which rows were created, edited or
// deleted since the last time they were seen. Pure: the stamp generator (`tick`) is injected.
import { ENTITY_SHEETS } from './schema.js';

export const SEP = '\u0001';

// 'sheet\u0001id' -> JSON of the row, for every row of `db`.
export function indexar(db) {
  const visto = new Map();
  ENTITY_SHEETS.forEach((s) => db[s].forEach((r) => visto.set(s + SEP + r.id, JSON.stringify(r))));
  return visto;
}

// Compares the sheets with what was last seen (`visto`, mutated): new/edited rows get a new logical stamp in `meta` and missing
// rows leave a tombstone. Works for any write path (upsert, import, demo, catalogue migrations...). -> number of changes found
export function reconciliarMeta({ db, meta, visto, tick }) {
  const actuales = new Set();
  let cambios = 0;
  ENTITY_SHEETS.forEach((s) => {
    db[s].forEach((r) => {
      const k = s + SEP + r.id;
      actuales.add(k);
      const j = JSON.stringify(r);
      if (visto.get(k) === j) return;
      visto.set(k, j);
      (meta.sellos[s] ||= {})[r.id] = tick();
      if (meta.lapidas[s]) delete meta.lapidas[s][r.id];
      cambios++;
    });
  });
  [...visto.keys()].forEach((k) => {
    if (actuales.has(k)) return;
    visto.delete(k);
    const [s, id] = k.split(SEP);
    if (meta.sellos[s]) delete meta.sellos[s][id];
    (meta.lapidas[s] ||= {})[id] = { s: tick() };
    cambios++;
  });
  return cambios;
}
