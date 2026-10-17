// Global configuration.
// The Google Client ID is needed to connect to Drive (the app stores everything in the person's own Drive; it has no sign-in and
// no user identity). The deployment owner sets it ONCE in BUILTIN_CLIENT_ID (publication); end users only connect Google Drive.
// While it is empty, the "Setup needed" screen and the tutorial let the owner test one in this browser (localStorage
// 'cnl:clientId'). It cannot live in Drive: it is needed BEFORE connecting. Without it the demo mode still works.
import { CLIENT_ID_KEY, CLIENT_ID_SUFFIX, isValidClientId } from '../domain/clienteGoogle.js';

const BUILTIN_CLIENT_ID = '';

export { CLIENT_ID_KEY, CLIENT_ID_SUFFIX, isValidClientId };

function readClientId() {
  try {
    return (localStorage.getItem(CLIENT_ID_KEY) || '').trim() || BUILTIN_CLIENT_ID;
  } catch (e) {
    return BUILTIN_CLIENT_ID;
  }
}
// Live binding: updated by setClientId() without reloading.
export let GOOGLE_CLIENT_ID = readClientId();

// Saves (or clears with '') the Client ID of this browser. Returns the effective ID.
export function setClientId(value) {
  const v = String(value || '').trim();
  try {
    if (v) localStorage.setItem(CLIENT_ID_KEY, v);
    else localStorage.removeItem(CLIENT_ID_KEY);
  } catch (e) {
    /* ignorar */
  }
  GOOGLE_CLIENT_ID = readClientId();
  return GOOGLE_CLIENT_ID;
}
// true if the ID is fixed in this file (it cannot be removed from the UI).
export const HAS_BUILTIN_CLIENT_ID = !!BUILTIN_CLIENT_ID;

export const APP_VERSION = '1.0.0';
export const DRIVE_FOLDER = 'cnl';
export const PREFS_FILE = 'preferencias.json';
// The ONLY data scope: drive.file (files the app itself creates). It is not sensitive: no Google verification needed. There is no
// openid / email / profile scope: the app never knows who the person is.
export const SCOPES = 'https://www.googleapis.com/auth/drive.file';
// Incremental consent: only requested when Google Calendar sync is turned on (it is not part of SCOPES).
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
