// Connection use cases: which club to open after connecting to Drive, renewing an expired Drive connection and
// disconnecting. Entering/leaving the demo belongs to application/modoService.js. There is no user identity in the app: only a Drive connection (or the demo, store.mode === 'demo').
// Everything concrete is injected (no localStorage, document or clock in here); the shell composes the real adapters.
//
// Ports:
//   auth      Drive connection { connect({interactive}), disconnect() }   (js/infrastructure/driveConnection.js or the fake)
//   drive     { listClubs(), preferencias, reset?() }
//   prefs     { conectar, get, set, flush, desconectar }                  (js/composicion/preferencias.js)
//   CLAVES    preference keys ({ clubes, ultimoClub, ... })
//   store     club store (mode, clubRef, soloLectura, pendiente, sync, cerrar)
//   banderas  { selectorForzado(), limpiarSelectorForzado(),              "Switch club" flag (sessionStorage in the browser)
//              demoGuardada() }                                             device flag: the demo was left open (localStorage 'cnl:mode')
//   limpiarDatosLocales()                                                  erases every local mirror of personal data
//   espera(ms)                                                             timer, injectable for tests
//   log       { warn }
import { demoDisponible } from './modoService.js';

const SALIDA_ESPERA_MS = 10000;
const PREFS_ESPERA_MS = 1500;

const SILENCIO = { warn() {} }; // default log: the composition root injects the real console
const SIN_ESPERA = () => new Promise(() => {}); // default wait: never elapses (the composition root injects a real timer)

export function crearSesionService({
  auth,
  drive,
  prefs,
  CLAVES,
  store,
  banderas,
  limpiarDatosLocales,
  espera = SIN_ESPERA,
  log = SILENCIO,
} = {}) {
  const sinBanderas = { selectorForzado: () => false, limpiarSelectorForzado: () => {}, demoGuardada: () => false };
  const flags = banderas || sinBanderas;

  // Which mode does the app start in? -> 'drive' (Drive already authorized) | 'demo' (the demo was left open and is still allowed)
  //   | 'demo-cerrada' (the demo was left open but a Google Client ID is configured now: the caller closes it and tells the person)
  //   | 'start' (neither). A Drive authorization wins over a stale demo flag. The demo rule is demoDisponible() (modoService.js).
  const resolveStartMode = () => {
    const driveAuth = !!auth.isConnected();
    if (driveAuth) return 'drive';
    if (!flags.demoGuardada()) return 'start';
    return demoDisponible({ clientId: !!auth.enabled, driveAuth }) ? 'demo' : 'demo-cerrada';
  };

  return {
    resolveStartMode,

    // What to show when the app starts. -> 'config' (no Client ID: "Configuration needed" with "Try the demo" + owner setup)
    //   | 'inicio' (Client ID set: only "Connect Google Drive") | 'demo' (the demo was left open)
    //   | 'demo-cerrada' (see resolveStartMode) | 'drive' (Drive already authorized: resolve the club) | 'tutorial'
    decidirArranque({ tutorial = false } = {}) {
      const modo = resolveStartMode();
      if (modo !== 'start') return modo;
      if (!auth.enabled) return tutorial ? 'tutorial' : 'config';
      return tutorial ? 'tutorial' : 'inicio';
    },

    // After connecting: connects the preferences, finds the clubs in Drive and decides what to show.
    //   { accion: 'abrir',  ref }        open this club
    //   { accion: 'crear' }              no clubs yet: first-run wizard
    //   { accion: 'elegir', clubes }     several clubs and no usable "last club" (or the user asked to switch)
    //   { accion: 'error',  error }      the list could not be loaded and there is no mirror to fall back on
    async resolverClub() {
      const conectando = Promise.resolve()
        .then(() => prefs.conectar({ remoto: drive.preferencias }))
        .catch((e) => log.warn('Preferencias', e));
      let clubes;
      try {
        clubes = await drive.listClubs();
        prefs.set(
          CLAVES.clubes,
          clubes.map((c) => ({ id: c.id, name: c.name })),
        );
      } catch (e) {
        const espejo = prefs.get(CLAVES.clubes, []);
        if (e && (e.offline || e.code === 'sesion-caducada') && espejo.length)
          clubes = espejo.map((c) => ({ ...c, unverified: true }));
        else {
          await conectando;
          return { accion: 'error', error: e };
        }
      }
      await conectando;
      if (!clubes.length) return { accion: 'crear' };
      if (flags.selectorForzado()) {
        flags.limpiarSelectorForzado();
        return { accion: 'elegir', clubes };
      }
      const hit = clubes.find((c) => c.id === prefs.get(CLAVES.ultimoClub));
      if (hit) return { accion: 'abrir', ref: hit };
      if (clubes.length === 1) return { accion: 'abrir', ref: clubes[0] };
      return { accion: 'elegir', clubes };
    },

    // Renews the Drive connection (the caller must run this from a click: Google blocks windows not opened from one).
    // -> { ok: true } | { ok: false, error }
    async reconectar() {
      try {
        await auth.connect({ interactive: true });
      } catch (error) {
        return { ok: false, error };
      }
      if (store?.clubRef) {
        Promise.resolve(store.sync()).catch(() => {});
        Promise.resolve(prefs?.flush()).catch(() => {});
      }
      return { ok: true };
    },

    // Disconnect Drive: uploads what is pending (with a deadline), asks what to do if it could not, revokes the token and erases
    // every local mirror. In demo mode nothing is uploaded (there is no Drive). `preguntarPendientes()` -> Promise<'salir' | 'cancelar'>
    // is only called when changes could not be uploaded. -> { salio: boolean }. The caller reloads the page afterwards.
    async cerrarSesion({ preguntarPendientes } = {}) {
      try {
        if (store?.clubRef && store.mode !== 'demo' && !store.soloLectura) {
          await Promise.race([Promise.resolve(store.sync()).catch(() => {}), espera(SALIDA_ESPERA_MS)]);
          if (store.pendiente && (await preguntarPendientes?.()) !== 'salir') return { salio: false };
        }
      } catch (e) {
        log.warn('Session close', e);
      }
      try {
        if (prefs) await Promise.race([prefs.flush(), espera(PREFS_ESPERA_MS)]);
      } catch (e) {
        /* offline: the cache is discarded anyway */
      }
      try {
        prefs?.desconectar();
      } catch (e) {
        /* ignore */
      }
      try {
        auth.disconnect();
      } catch (e) {
        /* ignore */
      }
      try {
        drive?.reset?.();
      } catch (e) {
        /* ignore */
      }
      try {
        store?.cerrar();
      } catch (e) {
        /* ignore */
      }
      try {
        await limpiarDatosLocales?.();
      } catch (e) {
        /* ignore */
      }
      return { salio: true };
    },
  };
}
