// Configuración global. Con GOOGLE_CLIENT_ID vacío la app funciona en modo local.
// El ID puede fijarse aquí (publicación) o en este navegador desde el tutorial (localStorage 'cnl:clientId').
const BUILTIN_CLIENT_ID = '';
function readClientId() {
  try { return (localStorage.getItem('cnl:clientId') || '').trim() || BUILTIN_CLIENT_ID; }
  catch (e) { return BUILTIN_CLIENT_ID; }
}
export const GOOGLE_CLIENT_ID = readClientId();
export const APP_VERSION = '1.0.0';
export const DRIVE_FOLDER = 'cnl';
export const SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file openid email profile';
// Consentimiento incremental: sólo se solicita al activar la sincronización con Google Calendar (no forma parte de SCOPES).
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
