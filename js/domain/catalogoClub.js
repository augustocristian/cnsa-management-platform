// Seeds the training-content catalogue (TiposCarga) and migrates legacy data (see domain/cargas.js) on the club's rows.
// Idempotent: only adds the missing predefined ones and never overwrites edits. `genId` is injected.
import { prepararCatalogo, normalizarTipo, filaTipo } from './cargas.js';
import { cleanRow } from './filas.js';

// Mutates `db` (TiposCarga, ObjetivosCarga). -> true if anything changed
export function asegurarCatalogo(db, genId) {
  const plan = prepararCatalogo({
    tipos: db.TiposCarga.map(normalizarTipo),
    cargas: db.Cargas,
    objetivos: db.ObjetivosCarga,
    generarId: () => 'tc-' + genId(),
  });
  if (!plan.crear.length && !plan.actualizar.length && !plan.eliminarObjetivos.length) return false;
  plan.crear.concat(plan.actualizar).forEach((t) => {
    const fila = cleanRow('TiposCarga', filaTipo(t), genId);
    const i = db.TiposCarga.findIndex((r) => r.id === fila.id);
    if (i >= 0) db.TiposCarga[i] = fila;
    else db.TiposCarga.push(fila);
  });
  if (plan.eliminarObjetivos.length)
    db.ObjetivosCarga = db.ObjetivosCarga.filter((o) => !plan.eliminarObjetivos.includes(o.id));
  return true;
}
