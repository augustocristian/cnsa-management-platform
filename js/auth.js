// Autenticación con Google Identity Services (token OAuth, scope drive.file). Sin Client ID la app no puede iniciar sesión.
// Individual-use app: each person signs in with their own Google account and only sees their own data (in their Drive).
import * as cfg from './config.js';
import { SCOPES } from './config.js';
import { clasificarErrorLogin } from './domain/erroresGoogle.js';

const scopeTokens = new Map(); // scope adicional -> {access_token, expires} (consentimiento incremental, sólo en memoria)

const TOKEN_KEY = 'cnl:token'; // LEGACY: the token is no longer stored anywhere (memory only); it is deleted if present
const USER_KEY = 'cnl:user';
const tiempos = { silencioso: 20000, interactivo: 180000 }; // ms; silencioso = renewal without interaction (fails if Google does not answer); interactivo = consent window (the user takes a while)
const listeners = new Set();
const expiredListeners = new Set();
let tokenClient = null;
let tokenClientId = '';
let gisPromise = null;
let tokenData = null; // {access_token, expires} IN MEMORY ONLY
let tokenInFlight = null; // token request in flight: concurrent ones share a single promise

function emit() {
  listeners.forEach((fn) => { try { fn(auth.user); } catch (e) { console.error(e); } });
}

function loadGis() {
  if (window.google && window.google.accounts && window.google.accounts.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisPromise = null; reject(Object.assign(new Error('No se pudo cargar Google Identity Services'), { code: 'sin-gis' })); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

function saveToken(t) {
  tokenData = t;
  if (auth.caducada) { auth.caducada = false; expiredListeners.forEach((fn) => { try { fn(false); } catch (e) { console.error(e); } }); }
}

function validToken() {
  return tokenData && tokenData.expires > Date.now() + 30000 ? tokenData.access_token : null;
}

// Error de inicio de sesión con `code` estable (ver domain/erroresGoogle.js) y el origen actual para la ayuda.
function loginError(raw) {
  const code = (raw && raw.code && String(raw.code).match(/^[a-z-]+$/) && raw.code) || clasificarErrorLogin(raw);
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

// Requests a token; prompt '' = silent if consent already exists. Concurrent requests share a single promise
// (GIS only supports one callback at a time) and all of them time out: if Google does not answer it is rejected with code 'timeout'.
function requestToken(prompt) {
  if (tokenInFlight) return tokenInFlight;
  const limite = prompt ? tiempos.interactivo : tiempos.silencioso;
  tokenInFlight = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(loginError({ code: 'timeout', message: 'Google no responde' })), limite);
    const fin = (fn, v) => { clearTimeout(timer); fn(v); };
    tokenClient.callback = (resp) => {
      if (resp.error) return fin(reject, loginError(resp));
      saveToken({ access_token: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
      fin(resolve, resp.access_token);
    };
    tokenClient.error_callback = (err) => fin(reject, loginError(err));
    try { tokenClient.requestAccessToken({ prompt }); } catch (e) { fin(reject, loginError(e)); }
  });
  const libera = () => { tokenInFlight = null; };
  tokenInFlight.then(libera, libera);
  return tokenInFlight;
}

async function fetchUser(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('userinfo ' + r.status);
  const j = await r.json();
  return { email: j.email, name: j.name || j.email, picture: j.picture || '' };
}

export const auth = {
  user: null,
  tiempos,

  // true si hay Client ID configurado (sin él no se puede iniciar sesión).
  get enabled() { return !!cfg.GOOGLE_CLIENT_ID; },

  async init() {
    // Sin Client ID aún se precarga Google: así 'Probar y guardar' abre el popup dentro del clic (si no, el navegador lo bloquea).
    if (!cfg.GOOGLE_CLIENT_ID) { loadGis().catch(() => {}); return; }
    try {
      try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ } // earlier versions stored the token here
      const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      // Remembered session: the token lives in memory only, so after a reload it is renewed silently and, if Google requires it,
      // the UI shows "Session expired: Reconnect" (a click is needed: the browser blocks windows not opened from one).
      if (u) { auth.user = u; emit(); }
    } catch (e) { /* ignore */ }
    try { await buildTokenClient(cfg.GOOGLE_CLIENT_ID); } catch (e) { console.warn(e); }
  },

  // Inicia sesión (abre el popup de Google; llamar desde un clic). `clientId` = probar un ID aún no guardado:
  // sólo se guarda en este navegador si el inicio de sesión funciona.
  async signIn({ clientId } = {}) {
    const id = String(clientId || cfg.GOOGLE_CLIENT_ID || '').trim();
    if (!id) throw loginError({ code: 'sin-client-id', message: 'Falta el Client ID' });
    try {
      if (!tokenClient || tokenClientId !== id) await buildTokenClient(id);
    } catch (e) { throw loginError(e); }
    const token = await requestToken('consent');
    auth.user = await fetchUser(token).catch((e) => { throw loginError(e); });
    if (id !== cfg.GOOGLE_CLIENT_ID) cfg.setClientId(id);
    try { localStorage.setItem(USER_KEY, JSON.stringify(auth.user)); } catch (e) { /* ignore */ }
    emit();
    return auth.user;
  },

  // Cierra la sesión y REVOCA los tokens (principal y de Calendar).
  signOut() {
    const tokens = [validToken(), ...[...scopeTokens.values()].map((x) => x.access_token)].filter(Boolean);
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      tokens.forEach((tk) => { try { window.google.accounts.oauth2.revoke(tk, () => {}); } catch (e) { /* ignore */ } });
    }
    scopeTokens.clear();
    tokenData = null;
    auth.user = null;
    auth.caducada = false;
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* ignore */ }
    emit();
  },

  // Expired session: Drive returned 401 after renewing. The UI shows a notice with "Reconnect".
  caducada: false,
  marcarCaducada() {
    if (auth.caducada) return;
    auth.caducada = true;
    expiredListeners.forEach((fn) => { try { fn(true); } catch (e) { console.error(e); } });
  },
  onExpired(fn) { expiredListeners.add(fn); return () => expiredListeners.delete(fn); },

  // Renews the token for the already consenting user; call FROM A CLICK (opens a window if Google needs one). -> token
  async reconectar() {
    if (!cfg.GOOGLE_CLIENT_ID) throw loginError({ code: 'sin-client-id', message: 'Falta el Client ID' });
    if (!tokenClient) await buildTokenClient(cfg.GOOGLE_CLIENT_ID);
    return requestToken('');
  },

  // Token vigente (síncrono) o null.
  token() { return validToken(); },

  // Token vigente o renovación silenciosa; null si no es posible (sin red, sin consentimiento previo...).
  async ensureToken() {
    const t = validToken();
    if (t) return t;
    if (!cfg.GOOGLE_CLIENT_ID) return null;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
    try {
      if (!tokenClient) await auth.init();
      if (!tokenClient) return null;
      return await requestToken('');
    } catch (e) { return null; }
  },

  // Token para un scope adicional (p. ej. calendar.events). interactive = true abre el consentimiento de Google
  // (debe llamarse desde un clic); si no, intenta renovar en silencio. force = descarta el token en caché. -> token|null
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
          hint: auth.user ? auth.user.email : undefined,
          callback: (resp) => {
            if (resp.error) return reject(loginError(resp));
            scopeTokens.set(scope, { access_token: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
            resolve(resp.access_token);
          },
          error_callback: (err) => reject(loginError(err)),
        });
        tc.requestAccessToken({ prompt: interactive ? (hit ? '' : 'consent') : '' });
      });
    } catch (e) { if (interactive) throw e; return null; }
  },

  invalidate() { tokenData = null; },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};

export default auth;
