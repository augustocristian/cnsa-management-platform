// Draft of a training plan being edited: header fields + lines, and whether it differs from what is saved.
// No DOM: the editor view mutates `estado` (inputs write straight into the line objects) and calls `cambio()`;
// "unsaved changes" is computed by comparing signatures (domain/entreno.firmaPlan), so undoing an edit makes it clean again.
import * as D from '../domain/entreno.js';

// inicial: { tipoSesion, materialDia, notasGenerales, lineas }
export function crearBorradorPlan(inicial = {}) {
  const estado = {
    tipoSesion: inicial.tipoSesion || '',
    materialDia: inicial.materialDia || '',
    notasGenerales: inicial.notasGenerales || '',
    lineas: inicial.lineas && inicial.lineas.length ? inicial.lineas : D.anadirSet([]),
  };
  let guardado = D.firmaPlan(estado);
  const oyentes = new Set();
  const avisar = () => oyentes.forEach((fn) => fn(b));

  const b = {
    estado,
    // Applies a transformation to the lines (domain operations return new arrays) and notifies.
    operar(fn) {
      estado.lineas = fn(estado.lineas);
      avisar();
    },
    // Something was edited in place (an input wrote into a line or a header field): notify.
    cambio: avisar,
    // Replaces header and lines (template, copy from another session).
    cargar(plan) {
      estado.tipoSesion = plan.tipoSesion || estado.tipoSesion;
      estado.materialDia = plan.materialDia || estado.materialDia;
      estado.notasGenerales = plan.notasGenerales || estado.notasGenerales;
      estado.lineas = plan.lineas && plan.lineas.length ? D.renumerar(plan.lineas) : D.anadirSet([]);
      avisar();
    },
    sucio: () => D.firmaPlan(estado) !== guardado,
    marcarGuardado() {
      guardado = D.firmaPlan(estado);
      avisar();
    },
    vacio: () => D.planVacio(estado.lineas),
    alCambiar(fn) {
      oyentes.add(fn);
      return () => oyentes.delete(fn);
    },
  };
  return b;
}
