// Clasificación PURA de los errores típicos de Google (login con GIS y REST de Drive) en códigos estables.
// La interfaz traduce cada código con la clave i18n 'gerr.<codigo>' (y puede añadir ayuda: origen actual, enlaces).

export const CODIGOS = [
  'popup-bloqueado', 'popup-cerrado', 'acceso-denegado', 'origen-no-autorizado', 'sin-gis', 'sin-conexion',
  'api-desactivada', 'sin-permiso', 'sesion-caducada', 'limite', 'no-encontrado', 'desconocido',
];

const texto = (x) => String((x && (x.message || x.error_description || x.error || x.type)) || x || '').toLowerCase();

// Error del flujo de inicio de sesión (GIS) -> código.
// GIS entrega `type` ('popup_failed_to_open' | 'popup_closed' | 'unknown') en error_callback y `error` en la respuesta.
export function clasificarErrorLogin(err) {
  const s = texto(err);
  const tipo = String((err && (err.type || err.code || err.error)) || '').toLowerCase();
  if (err && err.offline) return 'sin-conexion';
  if (tipo === 'popup_failed_to_open' || s.includes('popup_failed_to_open')) return 'popup-bloqueado';
  if (s.includes('origin_mismatch') || s.includes('redirect_uri_mismatch') || s.includes('invalid_request') || s.includes('idpiframe_initialization_failed')) return 'origen-no-autorizado';
  if (tipo === 'access_denied' || s.includes('access_denied') || s.includes('access_blocked') || s.includes('app_not_verified')) return 'acceso-denegado';
  if (tipo === 'popup_closed' || s.includes('popup_closed')) return 'popup-cerrado';
  if (s.includes('no se pudo cargar google identity') || s.includes('google no disponible') || s.includes('sin-gis')) return 'sin-gis';
  if (s.includes('failed to fetch') || s.includes('network') || s.includes('sin conexión')) return 'sin-conexion';
  return 'desconocido';
}

// Respuesta HTTP de error de la API de Drive/Calendar -> {codigo, enlace?, servicio?}
// `cuerpo` es el texto o el objeto JSON de la respuesta.
export function clasificarErrorApi(status, cuerpo) {
  let j = cuerpo;
  if (typeof cuerpo === 'string') { try { j = JSON.parse(cuerpo); } catch (e) { j = null; } }
  const err = (j && j.error) || {};
  const razones = [];
  (err.errors || []).forEach((e) => razones.push(String(e.reason || '')));
  let enlace = '';
  let servicio = '';
  (err.details || []).forEach((d) => {
    if (d && d.reason) razones.push(String(d.reason));
    const m = d && d.metadata;
    if (m) { enlace = enlace || m.activationUrl || ''; servicio = servicio || m.serviceTitle || m.service || ''; }
  });
  const msg = String(err.message || (typeof cuerpo === 'string' ? cuerpo : '') || '');
  if (razones.some((r) => /accessNotConfigured|SERVICE_DISABLED/i.test(r)) || /has not been used in project|is disabled|API has not been used/i.test(msg)) {
    const proyecto = (/project[ =]+(\d+)/i.exec(msg) || [])[1] || '';
    return { codigo: 'api-desactivada', enlace: enlace || (proyecto ? `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${proyecto}` : 'https://console.cloud.google.com/apis/library/drive.googleapis.com'), servicio: servicio || 'Google Drive API' };
  }
  if (status === 401) return { codigo: 'sesion-caducada' };
  if (status === 403 && razones.some((r) => /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(r))) return { codigo: 'limite' };
  if (status === 429) return { codigo: 'limite' };
  if (status === 403) return { codigo: 'sin-permiso' };
  if (status === 404) return { codigo: 'no-encontrado' };
  return { codigo: 'desconocido' };
}
