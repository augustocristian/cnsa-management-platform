// Autenticación con Google Identity Services (token OAuth, scope drive.file). Sin Client ID la app no puede iniciar sesión.
// App de uso individual: quien inicia sesión es el entrenador y tiene todos los permisos (no hay roles ni usuarios).
import * as cfg from './config.js';
import { SCOPES } from './config.js';
import { clasificarErrorLogin } from './domain/erroresGoogle.js';

const scopeTokens = new Map(); // scope adicional -> {access_token, expires} (consentimiento incremental, sólo en memoria)

const TOKEN_KEY = 'cnl:token';
const USER_KEY = 'cnl:user';
const listeners = new Set();
let tokenClient = null;
let tokenClientId = '';
let gisPromise = null;
let tokenData = null; // {access_token, expires}

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
  try { sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); } catch (e) { /* ignorar */ }
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

// Solicita un token; prompt '' = silencioso si ya hay consentimiento.
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(loginError(resp));
      saveToken({ access_token: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
      resolve(resp.access_token);
    };
    tokenClient.error_callback = (err) => reject(loginError(err));
    try { tokenClient.requestAccessToken({ prompt }); } catch (e) { reject(loginError(e)); }
  });
}

async function fetchUser(token) {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('userinfo ' + r.status);
  const j = await r.json();
  return { email: j.email, name: j.name || j.email, picture: j.picture || '' };
}

export const auth = {
  user: null,

  // true si hay Client ID configurado (sin él no se puede iniciar sesión).
  get enabled() { return !!cfg.GOOGLE_CLIENT_ID; },

  async init() {
    // Sin Client ID aún se precarga Google: así 'Probar y guardar' abre el popup dentro del clic (si no, el navegador lo bloquea).
    if (!cfg.GOOGLE_CLIENT_ID) { loadGis().catch(() => {}); return; }
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (saved && saved.expires > Date.now() + 30000) tokenData = saved;
      const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      // Sesión recordada; sin conexión se acepta el usuario guardado para abrir los datos en caché.
      if (u && (tokenData || (typeof navigator !== 'undefined' && navigator.onLine === false))) { auth.user = u; emit(); }
    } catch (e) { /* ignorar */ }
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
    try { localStorage.setItem(USER_KEY, JSON.stringify(auth.user)); } catch (e) { /* ignorar */ }
    emit();
    return auth.user;
  },

  // Cierra la sesión y REVOCA los tokens (principal y de Calendar).
  signOut() {
    const tokens = [validToken(), ...[...scopeTokens.values()].map((x) => x.access_token)].filter(Boolean);
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      tokens.forEach((tk) => { try { window.google.accounts.oauth2.revoke(tk, () => {}); } catch (e) { /* ignorar */ } });
    }
    scopeTokens.clear();
    tokenData = null;
    auth.user = null;
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* ignorar */ }
    emit();
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

  invalidate() { tokenData = null; try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignorar */ } },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Compatibilidad: app de un solo usuario, siempre con todos los permisos.
  role() { return 'entrenador'; },
};

export default auth;
