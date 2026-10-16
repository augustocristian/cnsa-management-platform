// Pool planning use cases: orchestrates the domain and persistence.
// The repository is injected (any object with list/get/upsert/remove, e.g. the store): this module imports no store, no DOM and
// no fetch, so it can be tested with an in-memory repository.
import * as D from '../domain/planificacion.js';

export const HOJA_PISCINAS = 'Piscinas';
export const HOJA_ASIGNACIONES = 'AsignacionesCalle';

export function filaPiscina(p) {
  const n = D.normalizarPiscina(p);
  return { id: n.id, nombre: n.nombre, longitudM: n.longitudM, numCalles: n.numCalles, intervaloMin: n.intervaloMin, maxPorCalle: n.maxPorCalle, horario: D.stringifyHorario(n.horario) };
}
export function filaAsignacion(a) {
  const n = D.normalizarAsignacion(a);
  return {
    id: n.id, piscinaId: n.piscinaId, dia: n.fecha ? n.dia : (Number.isNaN(n.dia) ? '' : n.dia), fecha: n.fecha,
    horaInicio: n.horaInicio, horaFin: n.horaFin, calleDesde: Number.isNaN(n.calleDesde) ? '' : n.calleDesde,
    calleHasta: Number.isNaN(n.calleHasta) ? (Number.isNaN(n.calleDesde) ? '' : n.calleDesde) : n.calleHasta,
    grupoId: n.grupoId, entrenadorId: n.entrenadorId, notas: n.notas,
  };
}
export function piscinaPorDefecto() {
  return { id: '', nombre: '', longitudM: 25, numCalles: 6, intervaloMin: 30, maxPorCalle: 8, horario: D.horarioPorDefecto() };
}

export function crearPlanificacionService(repo) {
  const datos = () => ({
    piscinas: repo.list(HOJA_PISCINAS), asignaciones: repo.list(HOJA_ASIGNACIONES),
    grupos: repo.list('Grupos'), nadadores: repo.list('Nadadores'),
  });

  const svc = {
    piscinas: () => repo.list(HOJA_PISCINAS).map(D.normalizarPiscina),
    piscina: (id) => { const p = repo.get(HOJA_PISCINAS, id); return p ? D.normalizarPiscina(p) : null; },
    asignaciones: (piscinaId) => repo.list(HOJA_ASIGNACIONES).map(D.normalizarAsignacion).filter((a) => !piscinaId || a.piscinaId === String(piscinaId)),
    grupos: () => repo.list('Grupos'),
    nadadoresPorGrupo: () => D.nadadoresPorGrupo(repo.list('Nadadores')),
    // Entrenadores conocidos: los de Grupos y los de las asignaciones (sin duplicados, orden alfabético).
    entrenadores() {
      const set = new Map();
      const add = (n) => { const s = String(n || '').trim(); if (s) set.set(s.toLowerCase(), set.get(s.toLowerCase()) || s); };
      repo.list('Grupos').forEach((g) => add(g.entrenador));
      repo.list(HOJA_ASIGNACIONES).forEach((a) => add(a.entrenadorId));
      return [...set.values()].sort((a, b) => a.localeCompare(b));
    },

    // Usual start time of each group according to its sessions; guides the distribution suggestion.
    preferenciasHora: () => D.preferenciasHora(repo.list('Entrenamientos')),

    // ----- Piscinas -----
    // -> { ok, errores?, piscina?, recortadas, fuera }. Al reducir calles recorta las asignaciones que sobresalen
    // (si recortar) y devuelve cuántas quedan totalmente fuera de rango (siguen guardadas y se muestran como error).
    guardarPiscina(data, { recortar = true } = {}) {
      const errores = D.validarPiscina(data);
      if (errores.length) return { ok: false, errores, recortadas: 0, fuera: 0 };
      const fila = filaPiscina(data);
      let recortadas = 0, fuera = 0;
      if (fila.id) {
        const aj = D.ajustarAlReducir(repo.list(HOJA_ASIGNACIONES), fila.id, fila.numCalles);
        fuera = aj.fuera.length;
        if (recortar) { aj.recortadas.forEach((a) => repo.upsert(HOJA_ASIGNACIONES, a)); recortadas = aj.recortadas.length; }
        else fuera += aj.recortadas.length;
      }
      const piscina = repo.upsert(HOJA_PISCINAS, fila);
      return { ok: true, piscina: D.normalizarPiscina(piscina), recortadas, fuera };
    },
    // Previsualiza el efecto de dejar la piscina con `numCalles` calles.
    efectoReducir: (piscinaId, numCalles) => D.ajustarAlReducir(repo.list(HOJA_ASIGNACIONES), piscinaId, numCalles),
    // Deletes the pool and its assignments. -> snapshot for restaurarPiscina() (Undo) or null
    borrarPiscina(id) {
      const piscina = repo.get(HOJA_PISCINAS, id);
      if (!piscina) return null;
      const asignaciones = repo.list(HOJA_ASIGNACIONES).filter((a) => a.piscinaId === String(id));
      asignaciones.forEach((a) => repo.remove(HOJA_ASIGNACIONES, a.id));
      repo.remove(HOJA_PISCINAS, id);
      return { piscina, asignaciones };
    },
    restaurarPiscina(snap) {
      if (!snap) return;
      repo.upsert(HOJA_PISCINAS, snap.piscina);
      snap.asignaciones.forEach((a) => repo.upsert(HOJA_ASIGNACIONES, a));
    },

    // ----- Asignaciones -----
    evaluar: (data) => D.conflictosDe(filaAsignacion(data), datos()),
    // -> { ok, bloqueado?, requiereForzar?, conflictos, asignacion? }
    guardarAsignacion(data, { forzar = false } = {}) {
      const fila = filaAsignacion(data);
      const conflictos = D.conflictosDe(fila, datos());
      if (D.bloqueante(conflictos)) return { ok: false, bloqueado: true, conflictos };
      if (conflictos.length && !forzar) return { ok: false, requiereForzar: true, conflictos };
      const guardada = repo.upsert(HOJA_ASIGNACIONES, fila);
      return { ok: true, conflictos, asignacion: D.normalizarAsignacion(guardada) };
    },
    mover(id, cambios, opts) {
      const a = repo.get(HOJA_ASIGNACIONES, id);
      if (!a) return { ok: false, conflictos: [], inexistente: true };
      return svc.guardarAsignacion({ ...a, ...cambios }, opts);
    },
    duplicar(id, cambios = {}, opts) {
      const a = repo.get(HOJA_ASIGNACIONES, id);
      if (!a) return { ok: false, conflictos: [], inexistente: true };
      return svc.guardarAsignacion({ ...a, ...cambios, id: '' }, opts);
    },
    // Deletes an assignment. -> the removed row for restaurarAsignacion() (Undo) or null
    borrarAsignacion(id) {
      const fila = repo.get(HOJA_ASIGNACIONES, id);
      if (!fila) return null;
      repo.remove(HOJA_ASIGNACIONES, id);
      return fila;
    },
    restaurarAsignacion(fila) { if (fila) repo.upsert(HOJA_ASIGNACIONES, fila); },

    // ----- Análisis -----
    // Conflictos globales (o los que afectan a una piscina). huecos=true añade los huecos libres (info).
    conflictos({ piscinaId = '', huecos = false } = {}) {
      const todos = D.detectarConflictos(datos(), { huecos });
      if (!piscinaId) return todos;
      const ids = new Set(svc.asignaciones(piscinaId).map((a) => a.id));
      return todos.filter((c) => c.piscinaId === String(piscinaId) || c.asignaciones.some((id) => ids.has(id)));
    },
    sugerir({ piscinaId, dia, ...resto }) {
      const piscina = repo.get(HOJA_PISCINAS, piscinaId);
      if (!piscina) return { propuestas: [], sinHueco: [] };
      const d = datos();
      return D.sugerirDistribucion({ piscina, dia, grupos: d.grupos, nadadores: d.nadadores, asignaciones: d.asignaciones, ...resto });
    },
    // Guarda las propuestas (sólo traen avisos, nunca errores). -> número de asignaciones creadas
    aplicarSugerencia(propuestas) {
      let n = 0;
      propuestas.forEach((p) => { if (svc.guardarAsignacion(p, { forzar: true }).ok) n++; });
      return n;
    },
  };
  return svc;
}
