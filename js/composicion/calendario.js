// Composition of the calendar for the running app: wires the real adapters (Google Calendar client, Calendar scope from config,
// the user preferences singleton) into the calendar service, which itself imports none of them. Tests build the service directly
// with fakes and never load this module.
import { crearCalendarioService } from '../application/calendarioService.js';
import { crearClienteGoogleCalendar } from '../infrastructure/googleCalendar.js';
import { CALENDAR_SCOPE } from '../config.js';
import { preferencias, CLAVES } from '../preferencias.js';

// opciones: {store, auth, etq, ahora}  -> calendar service
export function crearServicioCalendarioApp({ store, auth, etq, ahora = () => new Date() } = {}) {
  return crearCalendarioService({
    store, auth, etq, ahora,
    storage: preferencias.comoAlmacenamiento(CLAVES.calSync), // the sync map is a user preference stored in Drive
    prefs: { get: (k, def) => preferencias.get(k, def), set: (k, v) => preferencias.set(k, v) },
    crearCliente: crearClienteGoogleCalendar,
    calendarScope: CALENDAR_SCOPE,
  });
}
