// Single instance of the user's preferences (see application/preferenciasService.js).
// Source of truth: cnl/preferencias.json in their Drive. localStorage ('cnl:prefs') is only a cache/mirror.
import { crearPreferencias } from '../application/preferenciasService.js';
import { CLAVES } from '../domain/preferencias.js';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return undefined; } };

// Old localStorage keys that are migrated to the preferences the first time (with the oldest timestamp).
function legado() {
  const out = {};
  const lang = lsGet('cnl:lang');
  if (lang) out[CLAVES.idioma] = lang;
  const tut = parse(lsGet('cnl:tutorial'));
  if (tut) out[CLAVES.tutorial] = tut;
  const vista = lsGet('cnl:cal-vista');
  if (vista) out[CLAVES.calVista] = vista;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('cnl:cal-sync:')) { const v = parse(localStorage.getItem(k)); if (v) out[CLAVES.calSync + k] = v; }
    }
  } catch (e) { /* ignorar */ }
  return out;
}

const almacen = (() => { try { return globalThis.localStorage || null; } catch (e) { return null; } })();
const temporizador = {
  set: (fn, ms) => { const id = setTimeout(fn, ms); if (id && id.unref) id.unref(); return id; },
  clear: (id) => clearTimeout(id),
};
const enLinea = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false);

export const preferencias = crearPreferencias({ almacen, ahora: () => Date.now(), temporizador, enLinea, legado, log: console });

try {
  window.addEventListener('online', () => { preferencias.volverLaRed(); });
  // When the tab is hidden, pending changes are uploaded (the debounce might never fire).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && preferencias.pendientes.length) preferencias.flush(); });
} catch (e) { /* environment without DOM */ }

export default preferencias;
export { CLAVES };
