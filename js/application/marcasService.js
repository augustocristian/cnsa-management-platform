// Personal-best use cases. The repository (list/get/upsert/remove, e.g. the store) is injected; no DOM, storage or clock.
import * as D from '../domain/marcas.js';

export const HOJA = 'Marcas';

export function crearMarcasService(repo) {
  const svc = {
    marcas: () => repo.list(HOJA).filter((m) => Number(m.tiempoMs) > 0),

    // data: { nadadorId, fecha, prueba, piscina, tiempo (text) , competicion, notas, banadorId? }
    // -> { ok, marca } | { ok: false, errores: [{ campo, codigo }] }. The event is stored in its canonical form ("100 Libre").
    registrar(data) {
      const { errores, tiempoMs } = D.validarMarca(data, { nadadorExiste: (id) => !!repo.get('Nadadores', id) });
      if (errores.length) return { ok: false, errores };
      const fila = {
        nadadorId: data.nadadorId,
        fecha: data.fecha,
        prueba: D.nombrePrueba(data.prueba),
        piscina: String(data.piscina || '25'),
        tiempoMs,
        competicion: String(data.competicion ?? '').trim(),
        notas: String(data.notas ?? '').trim(),
      };
      if (data.banadorId) fila.banadorId = String(data.banadorId);
      return { ok: true, marca: repo.upsert(HOJA, fila) };
    },

    // Deletes a mark and returns the removed row so the caller can offer "Undo" (restaurar).
    eliminar(id) {
      const fila = repo.get(HOJA, id);
      repo.remove(HOJA, id);
      return fila;
    },
    restaurar(fila) {
      return fila ? repo.upsert(HOJA, fila) : null;
    },

    // Rewrites non-canonical event names ("100 libre" -> "100 Libre"). Idempotent. -> number of rows changed
    migrarPruebas() {
      const cambios = D.migrarPruebas(repo.list(HOJA));
      cambios.forEach((c) => repo.upsert(HOJA, { ...repo.get(HOJA, c.id), prueba: c.prueba }));
      return cambios.length;
    },
  };
  return svc;
}
