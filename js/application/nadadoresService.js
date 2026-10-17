// Use cases about swimmers: list, save (with the category materialised), delete with cascade and undo, and the profile summary.
// The repository (list/get/upsert/upsertMany/remove/removeMany + club/setClub, e.g. the store) and the clock are injected:
// no DOM, no storage, no Date.now().
import { crearCategoriasService } from './categoriasService.js';
import { filtrarNadadores, ordenarNadadores, validarNadador, edadDe, resumenAsistencia, asistenciaReciente, resumenCargas, cargasRecientes, marcasPorPrueba } from '../domain/nadadores.js';
import { fechaDeDate } from '../domain/calendario.js';

export const HOJA = 'Nadadores';
// Sheets whose rows hang from a swimmer (column nadadorId); they are deleted with the swimmer.
export const HOJAS_DEPENDIENTES = ['Asistencia', 'Cargas', 'Marcas'];

export function crearNadadoresService(repo, { ahora, categorias } = {}) {
  const cat = categorias || crearCategoriasService(repo, { ahora });
  const hoy = () => fechaDeDate(ahora());
  const dependientes = (id, hoja) => repo.list(hoja).filter((r) => r.nadadorId === id);

  return {
    hoy,
    categorias: cat,

    // Swimmers matching the filters ({q, categoria, grupoId, inactivos}), in category / surname order.
    listar: (filtros) => ordenarNadadores(filtrarNadadores(repo.list(HOJA), filtros)),
    obtener: (id) => repo.get(HOJA, id),
    edad: (nadador) => edadDe(nadador, hoy()),

    // -> {ok:true, fila} | {ok:false, errores:[{campo, codigo}], delStore?:true}
    // `errores` of the store (dates out of range...) come with delStore so the view translates them with its own table.
    guardar(fila) {
      const errores = validarNadador(fila);
      if (errores.length) return { ok: false, errores };
      try {
        return { ok: true, fila: cat.guardarNadador(fila) };
      } catch (e) {
        if (e && e.code === 'validacion') return { ok: false, errores: e.errores || [], delStore: true };
        throw e;
      }
    },

    // Deletes the swimmer and their attendance, loads and marks (one write per sheet). -> snapshot for restaurar()
    eliminar(id) {
      const nadador = repo.get(HOJA, id);
      if (!nadador) return null;
      const filas = {};
      HOJAS_DEPENDIENTES.forEach((hoja) => {
        const rows = dependientes(id, hoja);
        if (rows.length) filas[hoja] = rows;
        repo.removeMany(hoja, rows.map((r) => r.id));
      });
      repo.remove(HOJA, id);
      return { nadador, filas };
    },

    // Undo of eliminar(): puts back the swimmer and everything that was deleted with them.
    restaurar(snapshot) {
      if (!snapshot) return;
      repo.upsertMany(HOJA, [snapshot.nadador]);
      Object.entries(snapshot.filas).forEach(([hoja, rows]) => repo.upsertMany(hoja, rows));
    },

    // Everything the profile shows, computed from the repository.
    ficha(id) {
      const nadador = repo.get(HOJA, id);
      if (!nadador) return null;
      const asistencia = dependientes(id, 'Asistencia');
      const cargas = dependientes(id, 'Cargas');
      return {
        nadador,
        grupo: nadador.grupoId ? repo.get('Grupos', nadador.grupoId) : null,
        edad: edadDe(nadador, hoy()),
        asistencia: { resumen: resumenAsistencia(asistencia), recientes: asistenciaReciente(asistencia, repo.list('Entrenamientos')) },
        cargas: { resumen: resumenCargas(cargas), recientes: cargasRecientes(cargas) },
        marcas: marcasPorPrueba(dependientes(id, 'Marcas')),
      };
    },
  };
}
