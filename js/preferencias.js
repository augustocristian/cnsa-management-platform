// Instancia única de las preferencias del usuario (ver application/preferenciasService.js).
// Fuente de verdad: cnl/preferencias.json en su Drive. localStorage ('cnl:prefs') sólo es caché/espejo.
import { crearPreferencias } from './application/preferenciasService.js';
import { CLAVES } from './domain/preferencias.js';

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const parse = (s) => { try { return JSON.parse(s); } catch (e) { return undefined; } };

// Claves antiguas de localStorage que se migran a las preferencias la primera vez (con la marca más antigua).
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

export const preferencias = crearPreferencias({ legado });

try {
  window.addEventListener('online', () => { preferencias.volverLaRed(); });
  // Al ocultar la pestaña se intenta subir lo pendiente (el debounce podría no llegar a dispararse).
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && preferencias.pendientes.length) preferencias.flush(); });
} catch (e) { /* entorno sin DOM */ }

export default preferencias;
export { CLAVES };
