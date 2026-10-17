// Home dashboard use case: gathers the club data and builds the whole model the view renders.
// The repository (list/get/..., e.g. the store), the clock and the preferences port are INJECTED, so this runs
// in tests with an in-memory repository and a fixed date. No DOM, no storage, no network.
import * as D from '../domain/inicio.js';
import * as C from '../domain/cargas.js';
import { esActivo } from '../domain/nadadores.js';
import { crearCargasService } from './cargasService.js';

const CLAVE_PASOS_OCULTOS = 'inicio.pasosOcultos.';

// opciones: {ahora: () => Date, cargas?: loads service, prefs?: {get(clave, def), set(clave, valor)}, clubId?: () => string}
export function crearInicioService(
  repo,
  { ahora, cargas = crearCargasService(repo), prefs = null, clubId = () => repo.clubRef?.id || '' } = {},
) {
  const claveOculto = () => CLAVE_PASOS_OCULTOS + clubId();
  const listar = (hoja) => repo.list(hoja) || [];

  // First steps card dismissed by the user (per club, stored in the user's preferences).
  const pasosOcultos = () => !!prefs && prefs.get(claveOculto(), false) === true;

  return {
    pasosOcultos,
    ocultarPasos(oculto = true) {
      if (prefs) prefs.set(claveOculto(), oculto === true ? true : null);
    },

    panel() {
      const ahoraD = ahora();
      const hoy = D.fechaIso(ahoraD);
      const grupos = listar('Grupos');
      const nadadores = listar('Nadadores');
      const entrenos = listar('Entrenamientos');
      const asistencias = listar('Asistencia');
      const nombreGrupo = (id) => (grupos.find((g) => g.id === id) || {}).nombre || '';
      const activos = nadadores.filter(esActivo);

      // Today and the next session
      const sesionesHoy = D.sesionesDeHoy(entrenos, ahoraD);
      const asistenciaHoy = D.asistenciaDeHoy(sesionesHoy, nadadores, asistencias);
      const hoyDetalle = sesionesHoy.map((s, i) => ({
        ...s,
        grupoNombre: nombreGrupo(s.grupoId),
        asistencia: asistenciaHoy.sesiones[i],
      }));
      const foco = D.sesionParaAsistencia(sesionesHoy);
      const proxima = D.proximaSesion(entrenos, ahoraD);
      const lunes = C.lunesDe(ahoraD);
      const lunesIso = D.fechaIso(lunes);

      // Weekly load
      const sem = cargas.semana(lunes);
      const objetivoSemanal = C.objetivoTotal(sem.tipos);
      const serie = D.serieSemanal({
        agregado: sem.agregado,
        lunes,
        ahora: ahoraD,
        ordenTipos: C.tiposVisibles(sem.agregado, sem.tipos).map((x) => x.id),
        objetivoSemanal,
      });
      const hayObjetivos = sem.tipos.some((x) => x.activo && (x.min || x.max));

      // Season, notes, first steps
      const pasos = D.pasosIniciales({
        grupos: grupos.length,
        nadadores: nadadores.length,
        piscinas: listar('Piscinas').length,
        sesiones: entrenos.length,
      });
      const esperadosHoy = asistenciaHoy.total.esperados;

      return {
        hoy,
        club: { nombre: String(repo.club?.nombre ?? '').trim(), lema: String(repo.club?.lema ?? '').trim() },
        kpis: { nadadoresActivos: activos.length, semana: D.sesionesDeLaSemana(entrenos, lunesIso) },
        titular: { sesiones: sesionesHoy.length, esperados: esperadosHoy },
        hoySesiones: hoyDetalle,
        sesionAsistencia: foco ? { id: foco.id, grupoNombre: nombreGrupo(foco.grupoId), hora: foco.hora } : null,
        proxima: proxima ? { ...proxima, grupoNombre: nombreGrupo(proxima.grupoId) } : null,
        asistencia: { ...asistenciaHoy, hayNadadores: nadadores.length > 0 },
        carga: {
          serie,
          tipos: C.tiposVisibles(sem.agregado, sem.tipos),
          objetivoSemanal,
          hayObjetivos,
          alertas: D.alertasDeCarga(sem.evaluacion),
          evaluados: sem.evaluacion.length,
        },
        avisos: D.avisosRecientes(listar('Comunicaciones'), grupos, ahoraD),
        evento: D.proximoEvento(listar('EventosTemporada'), ahoraD),
        primerosPasos: { ...pasos, oculto: pasosOcultos() },
      };
    },
  };
}
