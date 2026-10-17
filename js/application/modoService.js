// Mode use cases: Google Drive mode vs DEMO mode.
//
//   'drive'  the person connected Google Drive: the club lives in their own Drive (folder `cnl`).
//   'demo'   the person chose "Try the demo": sample data kept ONLY in this browser (localStorage namespace `cnl:demo:*`), clearly
//            labelled "Demo mode - data is not saved to Drive". Drive is never touched and demo data is never mixed with real data.
//   'start'  neither: with a Google Client ID the start screen offers only "Connect Google Drive"; WITHOUT one the "Configuration
//            needed" screen offers "Try the demo" first and the owner setup below it (see demoDisponible).
// Which mode the app starts in is decided by sesionService.resolveStartMode() (a Drive authorization wins over the demo flag; a
// demo left open is closed when a Client ID appears).
//
// Everything concrete is injected (no localStorage, document or clock in here; js/modo.js composes the real adapters):
//   store     club store: initDemo({ demo, hoy }), cerrar(), mode
//   demo      demo storage adapter: existe(), borrar()                                  (infrastructure/demoStorage.js)
//   conexion  Drive connection: isConnected(), connect({ interactive, clientId })      (infrastructure/driveConnection.js)
//   bandera   { leer(), escribir(valor), borrar() }  the `cnl:mode` flag (the choice of demo mode; localStorage in the browser)
//   ahora     () => Date  clock; the demo data is generated relative to it
export const MODO_DEMO = 'demo';

// THE rule for the demo (the only place it is written): the demo exists to show and try the app BEFORE Google Drive is set up, so it
// is available only while there is NO Google Client ID (neither saved in this browser nor in js/config.js) and Drive is not authorised.
//   clientId  boolean-ish  a Client ID is configured (driveConnection.enabled)
//   driveAuth boolean-ish  the person already authorised Drive (driveConnection.isConnected())
export function demoDisponible({ clientId = false, driveAuth = false } = {}) {
  return !clientId && !driveAuth;
}

export function crearModoService({ store, demo, conexion, bandera, ahora = () => new Date() } = {}) {
  const sinBandera = { leer: () => null, escribir: () => {}, borrar: () => {} };
  const flag = bandera || sinBandera;

  // Can the demo be offered / opened right now? (`conexion.enabled` = a Client ID exists, `conexion.isConnected()` = Drive authorised)
  const demoDisponibleAhora = () => demoDisponible({ clientId: !!conexion.enabled, driveAuth: !!conexion.isConnected() });

  // Opens the demo club. The first time it creates it and fills it with sample data (dates relative to the clock); afterwards it
  // reopens what the person had (their edits are kept until they exit the demo). -> { ref, nuevo }
  // Throws code 'demo-con-drive' (Drive already authorised) or 'demo-con-cliente' (a Google Client ID is configured).
  async function enterDemo() {
    if (conexion.isConnected()) throw Object.assign(new Error('Drive is connected: the demo is only for people who have not connected Drive.'), { code: 'demo-con-drive' });
    if (!demoDisponibleAhora()) throw Object.assign(new Error('A Google Client ID is configured: the demo is only available while there is none.'), { code: 'demo-con-cliente' });
    const nuevo = !demo.existe();
    flag.escribir(MODO_DEMO);
    await store.initDemo({ demo, hoy: ahora() });
    return { ref: store.clubRef, nuevo };
  }

  // Leaves the demo and ERASES its data (the caller asks for confirmation first). The store is closed without flushing anything.
  async function exitDemo() {
    if (store.mode === 'demo') store.cerrar();
    await demo.borrar();
    flag.borrar();
    return { salio: true };
  }

  // "Connect Google Drive" from the start screen or from the demo banner. Opens Google's consent window (call it from a click).
  // If it fails it throws and nothing changes (the demo, if any, keeps running). If it works the demo is left and ERASED: the real
  // club starts empty and demo data never reaches it. The caller then re-runs the boot (resolveStartMode() -> 'drive').
  async function connectDrive({ clientId } = {}) {
    await conexion.connect({ interactive: true, clientId });
    if (store.mode === 'demo' || flag.leer() === MODO_DEMO || demo.existe()) await exitDemo();
    return { modo: 'drive' };
  }

  return { enterDemo, exitDemo, connectDrive, demoDisponible: demoDisponibleAhora };
}
