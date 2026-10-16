// Google Calendar API v3 client (REST). No DOM and no global state: `fetch`, the token provider and the sleep function are
// injectable so it can be tested with simulated responses.
//
// Calendar used: the person's PRIMARY one ('primary'). The `calendar.events` scope cannot create secondary calendars
// (calendars.insert needs `calendar` or `calendar.app.created`), so the app's events are tagged with
// extendedProperties.private.cnlId / cnlClub and can be updated, deleted and found again without touching the rest.

export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const RAZONES_LIMITE = ['rateLimitExceeded', 'userRateLimitExceeded', 'calendarUsageLimitsExceeded', 'quotaExceeded'];

// code: 'auth' | 'permisos' | 'api-desactivada' | 'limite' | 'no-existe' | 'red' | 'servidor' | 'http'
export class GoogleCalendarError extends Error {
  constructor(message, { status = 0, code = 'http', reason = '' } = {}) {
    super(message);
    this.name = 'GoogleCalendarError';
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}

async function leerError(res) {
  try {
    const j = await res.json();
    const e = j && j.error ? j.error : {};
    return { message: e.message || '', reason: (e.errors && e.errors[0] && e.errors[0].reason) || e.status || '' };
  } catch (e) { return { message: '', reason: '' }; }
}

// getToken({force}) -> Promise<string|null>. force = true drops the cached token and asks for a new one.
export function crearClienteGoogleCalendar({
  fetch: fetchFn = (...a) => globalThis.fetch(...a),
  getToken,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  maxReintentos = 4,
  base = CALENDAR_API,
  calendarId = 'primary',
} = {}) {
  const cal = `${base}/calendars/${encodeURIComponent(calendarId)}/events`;

  async function pedir(method, url, body) {
    let renovado = false;
    for (let intento = 0; ; intento++) {
      const token = await getToken({ force: renovado && intento > 0 });
      if (!token) throw new GoogleCalendarError('No Google Calendar permission', { status: 401, code: 'auth' });
      const opts = { method, headers: { Authorization: 'Bearer ' + token } };
      if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
      let res;
      try { res = await fetchFn(url, opts); } catch (e) {
        if (intento < maxReintentos) { await sleep(500 * 2 ** intento); continue; }
        throw new GoogleCalendarError('Cannot reach Google Calendar', { code: 'red' });
      }
      if (res.ok) return res.status === 204 ? null : res.json().catch(() => null);

      const status = res.status;
      const { message, reason } = await leerError(res);
      const reintentable = status === 429 || status >= 500 || (status === 403 && RAZONES_LIMITE.includes(reason));
      if (status === 401) {
        if (!renovado) { renovado = true; continue; } // a single retry with a fresh token
        throw new GoogleCalendarError('The Google authorization has expired', { status, code: 'auth', reason });
      }
      if (reintentable && intento < maxReintentos) {
        const ra = Number(res.headers && res.headers.get && res.headers.get('Retry-After'));
        await sleep(ra > 0 ? ra * 1000 : 500 * 2 ** intento);
        continue;
      }
      if (status === 429 || (status === 403 && RAZONES_LIMITE.includes(reason))) throw new GoogleCalendarError(message || 'Google request limit reached', { status, code: 'limite', reason });
      if (status === 403) {
        const off = reason === 'accessNotConfigured' || /has not been used|is disabled|not enabled/i.test(message);
        throw new GoogleCalendarError(message || 'No permission', { status, code: off ? 'api-desactivada' : 'permisos', reason });
      }
      if (status === 404 || status === 410) throw new GoogleCalendarError(message || 'Not found', { status, code: 'no-existe', reason });
      throw new GoogleCalendarError(message || `Google error ${status}`, { status, code: status >= 500 ? 'servidor' : 'http', reason });
    }
  }

  return {
    // -> created event ({id, ...})
    insertar: (cuerpo) => pedir('POST', cal, cuerpo),
    // PATCH; `status: confirmed` reactivates an event the user deleted by hand. 404/410 -> code 'no-existe'.
    actualizar: (gid, cuerpo) => pedir('PATCH', `${cal}/${encodeURIComponent(gid)}`, { ...cuerpo, status: 'confirmed' }),
    // An event that no longer exists counts as deleted.
    async borrar(gid) {
      try { await pedir('DELETE', `${cal}/${encodeURIComponent(gid)}`); } catch (e) { if (e.code !== 'no-existe') throw e; }
    },
    // Events the app created for a club (tagged with cnlClub) -> [{gid, cnlId, fecha}]
    async listarGestionados({ clubId, timeMin = '', timeMax = '' } = {}) {
      const out = [];
      let pageToken = '';
      do {
        const qs = new URLSearchParams({ privateExtendedProperty: `cnlClub=${clubId}`, maxResults: '250', showDeleted: 'false', singleEvents: 'true' });
        if (timeMin) qs.set('timeMin', timeMin);
        if (timeMax) qs.set('timeMax', timeMax);
        if (pageToken) qs.set('pageToken', pageToken);
        const r = await pedir('GET', `${cal}?${qs}`);
        ((r && r.items) || []).forEach((it) => {
          const p = (it.extendedProperties && it.extendedProperties.private) || {};
          if (p.cnlId && it.status !== 'cancelled') {
            out.push({ gid: it.id, cnlId: p.cnlId, fecha: String((it.start && (it.start.dateTime || it.start.date)) || '').slice(0, 10) });
          }
        });
        pageToken = (r && r.nextPageToken) || '';
      } while (pageToken);
      return out;
    },
  };
}
