// Services and adapters the views receive through their context `ctx` (built here, never imported by the views): the preferences
// singleton, the Client ID setter, the PDF adapter, the Drive client, and the factories of the backup and calendar services.
// The shell passes `...serviciosDeVista(...)` into every view; tests build the same object so they exercise the real wiring.
import { preferencias, CLAVES } from './preferencias.js';
import { crearServicioBackupApp } from './backup.js';
import { crearServicioCalendarioApp } from './calendario.js';
import { drive } from '../infrastructure/drive.js';
import { setClientId } from '../infrastructure/config.js';

// opciones: { store, auth, ahora }
export function serviciosDeVista({ store, auth, ahora = () => new Date() } = {}) {
  return {
    ahora,
    prefs: preferencias,
    CLAVES,
    config: { setClientId },
    // Training PDF (jsPDF is loaded lazily the first time one is generated) and its copy in the cnl/entrenos folder of Drive.
    pdf: {
      generar: async (fichas, etiquetas) =>
        (await import('../infrastructure/pdfEntreno.js')).generar(fichas, etiquetas),
    },
    guardarPdfEnDrive: async ({ blob, nombre, drive: cliente }) =>
      (await import('../infrastructure/driveEntrenos.js')).guardarPdfEnDrive({ drive: cliente || drive, blob, nombre }),
    cargarDrive: async () => drive, // the Drive client, for opening the folder
    // The factories take the store / auth of the view that asks (they default to the ones of this context).
    servicioBackup: (o = {}) => crearServicioBackupApp({ store: o.store || store, ahora: o.ahora || ahora }),
    servicioCalendario: (o = {}) =>
      crearServicioCalendarioApp({
        store: o.store || store,
        auth: o.auth || auth,
        etq: o.etq,
        ahora: o.ahora || ahora,
      }),
  };
}
