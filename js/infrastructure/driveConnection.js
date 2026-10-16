// Connection to the person's Google Drive: OAuth AUTHORIZATION only (Google Identity Services token client).
//
// There is NO sign-in and NO user identity in this app. The only scope requested is
// https://www.googleapis.com/auth/drive.file (config.SCOPES); calendar.events is an optional incremental scope. No openid / email /
// profile scope, no `userinfo` request, and no name, e-mail or picture is ever displayed or stored.
//
// What is remembered between page loads is a single flag (localStorage 'cnl:drive-auth' = '1') meaning "the person already
// authorized the app": on reload the access token (kept in memory only) is renewed silently. If Google needs a click the
// connection is marked as expired and the UI offers "Reconnect".
//
// States (driveConnection.state):
//   disconnected  no previous authorization
//   connecting    a connect() is in flight
//   connected     authorized (the token is renewed on demand)
//   expired       Drive answered 401 after a renewal: the person must click "Reconnect" (connect({interactive: true}))
import * as cfg from '../config.js';
import { SCOPES } from '../config.js';
import { clasificarErrorConexion } from '../domain/erroresGoogle.js';

export const AUTH_FLAG_KEY = 'cnl:drive-auth'; // flag only: no identity
const TOKEN_KEY = 'cnl:token'; // LEGACY: tokens are never stored; the key is deleted if an earlier version left it
const LEGACY_USER_KEY = 'cnl:user'; // LEGACY: earlier versions remembered a profile here; it is deleted on init

// ms; silencioso = renewal without interaction (fails if Google does not answer); interactivo = consent window (the person takes a while)
const tiempos = { silencioso: 20000, interactivo: 180000 };
const listeners = new Set();
const expiredListeners = new Set();
const scopeTokens = new Map(); // extra scope -> {access_token, expires} (incremental consent, memory only)
let tokenClient = null;
let tokenClientId = '';
let gisPromise = null;
let tokenData = null; // {access_token, expires} IN MEMORY ONLY
let tokenInFlight = null; // token request in flight: concurrent ones share a single promise
let authorized = false; // the person already authorized the app (mirrors the localStorage flag)
let connecting = false;

const ls = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
const leerFlag = () => { try { return ls()?.getItem(AUTH_FLAG_KEY) === '1'; } catch (e) { return false; } };
function guardarFlag(on) {
  try { const s = ls(); if (s) { if (on) s.setItem(AUTH_FLAG_KEY, '1'); else s.removeItem(AUTH_FLAG_KEY); } } catch (e) { /* ignore */ }
}

function emit() {
  listeners.forEach((fn) => { try { fn(driveConnection.state); } catch (e) { console.error(e); } });
}

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(Object.assign(new Error('Could not load Google Identity Services'), { code: 'sin-gis' })); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function saveToken(t) {
  tokenData = t;
  if (driveConnection.expired) { driveConnection.expired = false; expiredListeners.forEach((fn) => { try { fn(false); } catch (e) { console.error(e); } }); }
}

function validToken() {
  return tokenData && tokenData.expires > Date.now() + 30000 ? tokenData.access_token : null;
}

// Connection error with a stable `code` (see domain/erroresGoogle.js) and the current origin for the help text.
function connectionError(raw) {
  const code = (raw && raw.code && String(raw.code).match(/^[a-z-]+$/) && raw.code) || clasificarErrorConexion(raw);
  const e = new Error((raw && (raw.message || raw.error_description || raw.error || raw.type)) || code);
  e.code = code;
  e.origin = typeof location !== 'undefined' ? location.origin : '';
  return e;
}

async function buildTokenClient(clientId) {
  await loadGis();
  tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPES, callback: () => {} });
  tokenClientId = clientId;
  return tokenClient;
}

// Requests a token. prompt: 'consent' = full consent screen (first connection), '' = Google decides (renewal that may need a click),
// 'none' = never show anything (silent renewal; fails if interaction is needed). Concurrent requests share a single promise
// (GIS only supports one callback at a time) and all of them time out: if Google does not answer it is rejected with code 'timeout'.
function requestToken(prompt) {
  if (tokenInFlight) return tokenInFlight;
  const limite = prompt === 'none' ? tiempos.silencioso : tiempos.interactivo;
  tokenInFlight = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(connectionError({ code: 'timeout', message: 'Google does not answer' })), limite);
    const fin = (fn, v) => { clearTimeout(timer); fn(v); };
    tokenClient.callback = (resp) => {
      if (resp.error) return fin(reject, connectionError(resp));
      saveToken({ access_token: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
      fin(resolve, resp.access_token);
    };
    tokenClient.error_callback = (err) => fin(reject, connectionError(err));
    try { tokenClient.requestAccessToken({ prompt }); } catch (e) { fin(reject, connectionError(e)); }
  });
  const libera = () => { tokenInFlight = null; };
  tokenInFlight.then(libera, libera);
  return tokenInFlight;
}

export const driveConnection = {
  tiempos,

  // true when a Client ID is configured (without it the app cannot connect to Drive; it can still run in demo mode).
  get enabled() { return !!cfg.GOOGLE_CLIENT_ID; },

  // disconnected | connecting | connected | expired
  get state() {
    if (connecting) return 'connecting';
    if (!driveConnection.isConnected()) return 'disconnected';
    return driveConnection.expired ? 'expired' : 'connected';
  },

  // Drive answered 401 after renewing: the UI shows "Drive connection expired: Reconnect".
  expired: false,

  // Loads the remembered-authorization flag and prepares the token client. Never requests a token by itself (a silent renewal
  // happens on the first Drive call, or explicitly with connect({interactive: false})).
  async init() {
    // Even without a Client ID Google is preloaded: so that "Test and save" opens the popup inside the click (otherwise it is blocked).
    try {
      sessionStorage.removeItem(TOKEN_KEY); // earlier versions stored the token here
      ls()?.removeItem(LEGACY_USER_KEY); // earlier versions remembered a profile here
    } catch (e) { /* ignore */ }
    if (!cfg.GOOGLE_CLIENT_ID) { authorized = false; loadGis().catch(() => {}); return; }
    authorized = leerFlag();
    if (authorized) emit();
    try { await buildTokenClient(cfg.GOOGLE_CLIENT_ID); } catch (e) { console.warn(e); }
  },

  // Has the person already authorized the app to use their Drive? (A token may still need a silent renewal: see ensureToken.)
  isConnected() { return authorized; },

  // Connects to Google Drive (authorization only).
  //  - interactive true (default): opens Google's consent window (call FROM A CLICK: the browser blocks windows not opened
  //    from one). Throws an Error with a stable `code` on failure. Also the way to "Reconnect" after the connection expired.
  //  - interactive false: silent renewal only; never throws -> true | false.
  // `clientId` = try a Client ID that is not saved yet: it is only stored in this browser if the connection works.
  async connect({ interactive = true, clientId } = {}) {
    const id = String(clientId || cfg.GOOGLE_CLIENT_ID || '').trim();
    if (!id) {
      if (!interactive) return false;
      throw connectionError({ code: 'sin-client-id', message: 'The Google Client ID is missing' });
    }
    connecting = true;
    emit();
    try {
      try {
        if (!tokenClient || tokenClientId !== id) await buildTokenClient(id);
      } catch (e) { throw connectionError(e); }
      await requestToken(interactive ? (authorized ? '' : 'consent') : 'none');
      if (id !== cfg.GOOGLE_CLIENT_ID) cfg.setClientId(id);
      authorized = true;
      guardarFlag(true);
      return true;
    } catch (e) {
      if (!interactive) return false;
      throw e;
    } finally {
      connecting = false;
      emit();
    }
  },

  // Disconnects: REVOKES the tokens (main and Calendar) and forgets the authorization flag. It does not touch the club data:
  // the safe flow (upload what is pending, offer a copy, erase every local mirror) lives in application/sesionService.js.
  disconnect() {
    const tokens = [validToken(), ...[...scopeTokens.values()].map((x) => x.access_token)].filter(Boolean);
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      tokens.forEach((tk) => { try { window.google.accounts.oauth2.revoke(tk, () => {}); } catch (e) { /* ignore */ } });
    }
    scopeTokens.clear();
    tokenData = null;
    authorized = false;
    driveConnection.expired = false;
    guardarFlag(false);
    try { sessionStorage.removeItem(TOKEN_KEY); ls()?.removeItem(LEGACY_USER_KEY); } catch (e) { /* ignore */ }
    emit();
  },

  // Spanish aliases used by the shell and older tests (same state).
  get caducada() { return driveConnection.expired; },
  set caducada(v) { driveConnection.expired = !!v; },
  marcarCaducada() { driveConnection.markExpired(); },
  reconectar() { return driveConnection.connect({ interactive: true }); },

  markExpired() {
    if (driveConnection.expired) return;
    driveConnection.expired = true;
    expiredListeners.forEach((fn) => { try { fn(true); } catch (e) { console.error(e); } });
    emit();
  },
  onExpired(fn) { expiredListeners.add(fn); return () => expiredListeners.delete(fn); },

  // Current token (synchronous) or null.
  token() { return validToken(); },

  // Current token or silent renewal; null if that is not possible (offline, no previous consent...).
  async ensureToken() {
    const t = validToken();
    if (t) return t;
    if (!cfg.GOOGLE_CLIENT_ID) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
      if (!tokenClient) await driveConnection.init();
      if (!tokenClient) return null;
      return await requestToken('none');
    } catch (e) { return null; }
  },

  // Token for an additional scope (e.g. calendar.events). interactive = true opens Google's consent window (call it from a
  // click); otherwise it tries to renew silently. force = drop the cached token. -> token | null
  async tokenForScope(scope, { interactive = false, force = false } = {}) {
    if (!cfg.GOOGLE_CLIENT_ID) return null;
    const hit = scopeTokens.get(scope);
    if (!force && hit && hit.expires > Date.now() + 30000) return hit.access_token;
    scopeTokens.delete(scope);
    try {
      await loadGis();
      return await new Promise((resolve, reject) => {
        const tc = window.google.accounts.oauth2.initTokenClient({
          client_id: cfg.GOOGLE_CLIENT_ID, scope, include_granted_scopes: true,
          callback: (resp) => {
            if (resp.error) return reject(connectionError(resp));
            scopeTokens.set(scope, { access_token: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
            resolve(resp.access_token);
          },
          error_callback: (err) => reject(connectionError(err)),
        });
        tc.requestAccessToken({ prompt: interactive ? (hit ? '' : 'consent') : 'none' });
      });
    } catch (e) { if (interactive) throw e; return null; }
  },

  invalidate() { tokenData = null; },

  // Listener of connection state changes: fn(state). -> unsubscribe
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export default driveConnection;
