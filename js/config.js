// Configuración global.
// El Client ID de Google es obligatorio (la app sólo funciona con una cuenta de Google y guarda todo en su Drive).
// Lo fija el propietario UNA vez en BUILTIN_CLIENT_ID (publicación). Mientras esté vacío, la pantalla "Configuración necesaria"
// y el tutorial permiten probar uno en este navegador (localStorage 'cnl:clientId'). No puede vivir en Drive: hace falta
// ANTES de iniciar sesión.
const BUILTIN_CLIENT_ID = '';
export const CLIENT_ID_KEY = 'cnl:clientId';
export const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

function readClientId() {
  try { return (localStorage.getItem(CLIENT_ID_KEY) || '').trim() || BUILTIN_CLIENT_ID; }
  catch (e) { return BUILTIN_CLIENT_ID; }
}
// Binding vivo: se actualiza con setClientId() sin recargar.
export let GOOGLE_CLIENT_ID = readClientId();

export const isValidClientId = (v) => /^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(String(v || '').trim());

// Guarda (o borra con '') el Client ID de este navegador. Devuelve el ID efectivo.
export function setClientId(value) {
  const v = String(value || '').trim();
  try { if (v) localStorage.setItem(CLIENT_ID_KEY, v); else localStorage.removeItem(CLIENT_ID_KEY); } catch (e) { /* ignorar */ }
  GOOGLE_CLIENT_ID = readClientId();
  return GOOGLE_CLIENT_ID;
}
// true si el ID viene fijado en este fichero (no se puede borrar desde la UI).
export const HAS_BUILTIN_CLIENT_ID = !!BUILTIN_CLIENT_ID;

export const APP_VERSION = '1.0.0';
export const DRIVE_FOLDER = 'cnl';
export const PREFS_FILE = 'preferencias.json';
// Único permiso de datos: drive.file (sólo ficheros que crea la propia app). No es sensible: no requiere verificación de Google.
export const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email profile';
// Consentimiento incremental: sólo se solicita al activar la sincronización con Google Calendar (no forma parte de SCOPES).
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
