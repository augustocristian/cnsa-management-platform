// Application service of <module>: orchestrates domain + persistence.
// It receives the repository as a parameter (any object with list/get/upsert/remove, e.g. the store): it imports neither the
// store, nor the DOM, nor fetch, so it can be tested with an in-memory repository.
import * as D from '../domain/<module>.js';

export function crear<Module>Service(repo, { puedeEditar = () => true, ahora, genId } = {}) {
  const exigirPermiso = () => { if (!puedeEditar()) throw new Error('sin-permiso'); };

  return {
    listar: () => repo.list(D.HOJA).map(D.normalizar),
    obtener(id) { const f = repo.get(D.HOJA, id); return f ? D.normalizar(f) : null; },

    // Validates without saving (for the live preview of the form)
    validar: (x) => D.validar(x, { existentes: repo.list(D.HOJA).map(D.normalizar) }),

    // Saves. Errors -> throws {codigo:'validacion', errores}; warnings -> require forzar:true
    guardar(x, { forzar = false } = {}) {
      exigirPermiso();
      const { errores, avisos } = this.validar(x);
      if (errores.length) throw Object.assign(new Error('validacion'), { codigo: 'validacion', errores });
      if (avisos.length && !forzar) throw Object.assign(new Error('avisos'), { codigo: 'avisos', avisos });
      const fila = D.aFila(x);
      if (!fila.id && genId) fila.id = genId();
      return D.normalizar(repo.upsert(D.HOJA, fila)); // the store generates the id when missing
    },

    eliminar(id) {
      exigirPermiso();
      const previa = repo.get(D.HOJA, id);
      if (!previa) return null;
      repo.remove(D.HOJA, id);
      return previa; // the view can offer Undo with repo.upsert(D.HOJA, previa)
    },
  };
}
