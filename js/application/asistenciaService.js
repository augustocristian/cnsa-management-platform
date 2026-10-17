// Attendance use cases. The repository (list/get/upsert/remove, optionally upsertMany/removeMany - e.g. the store)
// and the clock (`ahora`, returns a Date) are injected: no DOM, no storage, no Date.now here.
import * as D from '../domain/asistencia.js';
import { fechaDeDate } from '../domain/calendario.js';

export const HOJA = 'Asistencia';

export function crearAsistenciaService(repo, { ahora } = {}) {
  const hoy = () => fechaDeDate(ahora());
  // Bulk operations use ONE write when the repository offers it (the store does: a single sync/emit).
  const guardarVarias = (filas) => (repo.upsertMany ? repo.upsertMany(HOJA, filas) : filas.map((f) => repo.upsert(HOJA, f)));
  const quitarVarias = (ids) => (repo.removeMany ? repo.removeMany(HOJA, ids) : ids.forEach((id) => repo.remove(HOJA, id)));
  const registrosDe = (sesionId) => repo.list(HOJA).filter((a) => a.entrenamientoId === sesionId);

  const svc = {
    sesiones: () => D.ordenarSesiones(repo.list('Entrenamientos')),
    sesion: (id) => repo.get('Entrenamientos', id),
    grupos: () => repo.list('Grupos'),
    sesionPorDefecto: () => D.sesionPorDefecto(repo.list('Entrenamientos'), hoy()),

    // Roll call model of a session: { sesion, filas: [{ nadador, registro|null, estado }], resumen }
    lista(sesionId, locale = 'es') {
      const sesion = repo.get('Entrenamientos', sesionId);
      if (!sesion) return null;
      const nadadores = D.nadadoresDeSesion(sesion, repo.list('Nadadores'), locale);
      const regs = registrosDe(sesionId);
      const porNadador = new Map(regs.map((r) => [r.nadadorId, r]));
      const filas = nadadores.map((nadador) => {
        const registro = porNadador.get(nadador.id) || null;
        return { nadador, registro, estado: registro && D.esEstado(registro.estado) ? registro.estado : '' };
      });
      return { sesion, filas, resumen: D.resumenSesion(nadadores, regs) };
    },

    // Sets the state of one swimmer ('' = unmarked). Returns what is needed to undo it: { previo } (the old record or null).
    marcar(sesionId, nadadorId, estado, nota) {
      const previo = registrosDe(sesionId).find((r) => r.nadadorId === nadadorId) || null;
      if (estado === '' || estado == null) {
        if (previo) repo.remove(HOJA, previo.id);
        return { previo, actual: null };
      }
      if (!D.esEstado(estado)) throw new Error('invalid attendance state: ' + estado);
      const fila = { ...(previo || { entrenamientoId: sesionId, nadadorId }), estado, nota: nota ?? (previo ? previo.nota : '') ?? '' };
      return { previo, actual: repo.upsert(HOJA, fila) };
    },
    // One tap on a state button: first tap sets it, tapping the same state again clears it.
    tocar(sesionId, nadadorId, objetivo) {
      const previo = registrosDe(sesionId).find((r) => r.nadadorId === nadadorId);
      return svc.marcar(sesionId, nadadorId, D.estadoTrasToque(previo ? previo.estado : '', objetivo));
    },
    // Undoes marcar(): puts the previous record back (or removes the new one when there was none).
    deshacer(sesionId, nadadorId, { previo, actual }) {
      if (previo) repo.upsert(HOJA, previo);
      else if (actual) repo.remove(HOJA, actual.id);
    },

    // Marks every UNMARKED swimmer as present with a single write. -> the created records (pass them to deshacerVarias)
    marcarTodos(sesionId, estado = 'presente', locale = 'es') {
      const m = svc.lista(sesionId, locale);
      if (!m) return [];
      const nuevas = D.planMarcarTodos(m.filas.map((f) => f.nadador), registrosDe(sesionId), sesionId, estado);
      return nuevas.length ? guardarVarias(nuevas) : [];
    },
    deshacerVarias(registros) { if (registros.length) quitarVarias(registros.map((r) => r.id)); },

    historial({ grupoId = '', locale = 'es' } = {}) {
      return D.historial({ nadadores: repo.list('Nadadores'), sesiones: repo.list('Entrenamientos'), registros: repo.list(HOJA), grupoId, locale });
    },
  };
  return svc;
}
