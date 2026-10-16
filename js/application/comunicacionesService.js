// Use cases about notices and notes. The repository (list/get/upsert/remove) and the clock are injected.
import { filtrarAvisos, ordenarAvisos, validarAviso, nuevoAviso, textoParaCopiar, fechaRelativa } from '../domain/comunicaciones.js';
import { fechaDeDate } from '../domain/calendario.js';

export const HOJA = 'Comunicaciones';

export function crearComunicacionesService(repo, { ahora = () => new Date() } = {}) {
  const hoy = () => fechaDeDate(ahora());
  return {
    hoy,
    total: () => repo.list(HOJA).length,
    // Notices visible for a filter ('' all | '__todos' general only | group id), newest first.
    listar: (filtro = '') => ordenarAvisos(filtrarAvisos(repo.list(HOJA), filtro)),
    relativa: (fecha) => fechaRelativa(fecha, hoy()),
    textoParaCopiar,

    // datos: {titulo, texto, grupoId}. -> {ok:true, fila} | {ok:false, errores:[{campo, codigo}]}
    publicar(datos, { autor = '' } = {}) {
      const errores = validarAviso(datos);
      if (errores.length) return { ok: false, errores };
      return { ok: true, fila: repo.upsert(HOJA, nuevoAviso(datos, { hoyIso: hoy(), autor })) };
    },

    // Deletes a notice. -> the deleted row (to pass to restaurar) or null
    eliminar(id) {
      const fila = repo.get(HOJA, id);
      if (!fila) return null;
      repo.remove(HOJA, id);
      return fila;
    },
    restaurar(fila) { if (fila) repo.upsert(HOJA, fila); },
  };
}
