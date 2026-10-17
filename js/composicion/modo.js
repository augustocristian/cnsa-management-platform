// Single instance of the mode service (Drive mode vs demo mode): wiring of the real adapters. Composition root, like preferencias.js.
// Use: `modo.resolveStartMode()` -> 'drive' | 'demo' | 'start'; `modo.enterDemo()`; `modo.exitDemo()`; `modo.connectDrive()`.
import { crearModoService } from '../application/modoService.js';
import { store } from './store.js';
import { demoStorage, DEMO_MODE_KEY } from '../infrastructure/demoStorage.js';
import { driveConnection } from '../infrastructure/driveConnection.js';

const ls = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };

// The choice of demo mode lives in localStorage['cnl:mode'] (it is not a Drive preference: demo never touches Drive).
const bandera = {
  leer: () => { try { return ls()?.getItem(DEMO_MODE_KEY) ?? null; } catch (e) { return null; } },
  escribir: (v) => { try { ls()?.setItem(DEMO_MODE_KEY, v); } catch (e) { /* ignore */ } },
  borrar: () => { try { ls()?.removeItem(DEMO_MODE_KEY); } catch (e) { /* ignore */ } },
};

export const modo = crearModoService({ store, demo: demoStorage, conexion: driveConnection, bandera, ahora: () => new Date() });
export default modo;
