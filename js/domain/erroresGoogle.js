// PURE classification of typical Google errors (GIS authorisation and Drive REST) into stable codes.
// The UI translates each code with the i18n key 'gerr.<codigo>' (and may add help: current origin, links).

export const CODIGOS = [
  'popup-bloqueado',
  'popup-cerrado',
  'acceso-denegado',
  'origen-no-autorizado',
  'sin-gis',
  'sin-conexion',
  'api-desactivada',
  'sin-permiso',
  'sesion-caducada',
  'limite',
  'no-encontrado',
  'timeout',
  'cuota-drive',
  'desconocido',
];

const texto = (x) => String((x && (x.message || x.error_description || x.error || x.type)) || x || '').toLowerCase();

// Error of the Google Drive connection flow (GIS, authorisation only) -> code.
// GIS delivers `type` ('popup_failed_to_open' | 'popup_closed' | 'unknown') in error_callback and `error` in the response.
export function clasificarErrorConexion(err) {
  const s = texto(err);
  const tipo = String((err && (err.type || err.code || err.error)) || '').toLowerCase();
  if (err && err.offline) return 'sin-conexion';
  if (tipo === 'popup_failed_to_open' || s.includes('popup_failed_to_open')) return 'popup-bloqueado';
  if (
    s.includes('origin_mismatch') ||
    s.includes('redirect_uri_mismatch') ||
    s.includes('invalid_request') ||
    s.includes('idpiframe_initialization_failed')
  )
    return 'origen-no-autorizado';
  if (
    tipo === 'access_denied' ||
    s.includes('access_denied') ||
    s.includes('access_blocked') ||
    s.includes('app_not_verified')
  )
    return 'acceso-denegado';
  if (tipo === 'popup_closed' || s.includes('popup_closed')) return 'popup-cerrado';
  if (
    s.includes('no se pudo cargar google identity') ||
    s.includes('could not load google identity') ||
    s.includes('google no disponible') ||
    s.includes('sin-gis')
  )
    return 'sin-gis';
  if (s.includes('failed to fetch') || s.includes('network') || s.includes('sin conexión')) return 'sin-conexion';
  return 'desconocido';
}

// Deprecated alias (kept so views written before the sign-in removal keep working).
export const clasificarErrorLogin = clasificarErrorConexion;

// HTTP error response of the Drive/Calendar API -> {codigo, enlace?, servicio?}
// `cuerpo` is the text or the JSON object of the response.
export function clasificarErrorApi(status, cuerpo) {
  let j = cuerpo;
  if (typeof cuerpo === 'string') {
    try {
      j = JSON.parse(cuerpo);
    } catch (e) {
      j = null;
    }
  }
  const err = (j && j.error) || {};
  const razones = [];
  (err.errors || []).forEach((e) => razones.push(String(e.reason || '')));
  let enlace = '';
  let servicio = '';
  (err.details || []).forEach((d) => {
    if (d && d.reason) razones.push(String(d.reason));
    const m = d && d.metadata;
    if (m) {
      enlace = enlace || m.activationUrl || '';
      servicio = servicio || m.serviceTitle || m.service || '';
    }
  });
  const msg = String(err.message || (typeof cuerpo === 'string' ? cuerpo : '') || '');
  if (
    razones.some((r) => /accessNotConfigured|SERVICE_DISABLED/i.test(r)) ||
    /has not been used in project|is disabled|API has not been used/i.test(msg)
  ) {
    const proyecto = (/project[ =]+(\d+)/i.exec(msg) || [])[1] || '';
    return {
      codigo: 'api-desactivada',
      enlace:
        enlace ||
        (proyecto
          ? `https://console.cloud.google.com/apis/library/drive.googleapis.com?project=${proyecto}`
          : 'https://console.cloud.google.com/apis/library/drive.googleapis.com'),
      servicio: servicio || 'Google Drive API',
    };
  }
  if (status === 401) return { codigo: 'sesion-caducada' };
  // Drive full (account storage): different from a request rate limit, waiting will not fix it.
  if (status === 403 && razones.some((r) => /storageQuotaExceeded/i.test(r))) return { codigo: 'cuota-drive' };
  if (status === 403 && razones.some((r) => /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(r)))
    return { codigo: 'limite' };
  if (status === 429) return { codigo: 'limite' };
  if (status === 403) return { codigo: 'sin-permiso' };
  if (status === 404) return { codigo: 'no-encontrado' };
  return { codigo: 'desconocido' };
}
