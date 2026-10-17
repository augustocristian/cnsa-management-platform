// Unread-notices counter for the header bell.
// Ports (all injected, nothing is read from the browser here):
//   listar()                -> array of Comunicaciones rows (e.g. () => store.list('Comunicaciones'))
//   ahora()                 -> Date (the clock)
//   visto = { leer(), escribir(isoDate) }   device-local "last time the notices view was opened" marker
import { aIso, contarNoLeidos, desdeIso, VENTANA_DIAS } from '../domain/avisos.js';

const SIN_MARCA = { leer: () => null, escribir: () => {} };

export function crearAvisosService({ listar, ahora, visto = SIN_MARCA, ventanaDias = VENTANA_DIAS } = {}) {
  return {
    // Never throws: a damaged sheet must not break the header.
    contarNoLeidos() {
      try {
        const desde = desdeIso(ahora(), ventanaDias);
        return contarNoLeidos(listar(), { desde, visto: visto.leer() || null });
      } catch (e) {
        return 0;
      }
    },
    // The user opened the notices view: everything up to today counts as read.
    marcarVistos() {
      try {
        visto.escribir(aIso(ahora()));
      } catch (e) {
        /* the marker is a convenience */
      }
    },
  };
}
