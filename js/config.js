// Configuración global.
// The Google Client ID is needed to connect to Drive (the app stores everything in the person's own Drive; it has no sign-in and
// no user identity). The deployment owner sets it ONCE in BUILTIN_CLIENT_ID (publication); end users only connect Google Drive.
// While it is empty, the "Setup needed" screen and the tutorial let the owner test one in this browser (localStorage
// 'cnl:clientId'). It cannot live in Drive: it is needed BEFORE connecting. Without it the demo mode still works.
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
// The ONLY data scope: drive.file (files the app itself creates). It is not sensitive: no Google verification needed. There is no
// openid / email / profile scope: the app never knows who the person is.
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';
// Consentimiento incremental: sólo se solicita al activar la sincronización con Google Calendar (no forma parte de SCOPES).
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
