// Autenticación con Google Identity Services (token OAuth). Sin Client ID = modo local.
import { GOOGLE_CLIENT_ID, SCOPES } from './config.js';

const TOKEN_KEY = 'cnl:token';
const USER_KEY = 'cnl:user';
const listeners = new Set();
let tokenClient = null;
let gisPromise = null;
let tokenData = null; // {access_token, expires}
let usersProvider = () => []; // lo registra el store: devuelve filas de Usuarios
let ownerProvider = () => ''; // email del propietario del club (siempre admin)

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
    s.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar Google Identity Services')); };
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

// Solicita un token; prompt '' = silencioso si ya hay consentimiento.
function requestToken(prompt) {
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(new Error(resp.error_description || resp.error));
      saveToken({ access_token: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 });
      resolve(resp.access_token);
    };
    tokenClient.error_callback = (err) => reject(new Error((err && err.type) || 'popup_error'));
    tokenClient.requestAccessToken({ prompt });
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
  demoRole: null,

  // true si hay Client ID configurado (modo Drive); false = modo local.
  get enabled() { return !!GOOGLE_CLIENT_ID; },

  async init() {
    if (!GOOGLE_CLIENT_ID) { return; }
    try {
      const saved = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null');
      if (saved && saved.expires > Date.now() + 30000) tokenData = saved;
      const u = JSON.parse(localStorage.getItem(USER_KEY) || 'null');
      if (u && tokenData) { auth.user = u; emit(); }
    } catch (e) { /* ignorar */ }
    try {
      await loadGis();
      tokenClient = window.google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: SCOPES, callback: () => {} });
    } catch (e) { console.warn(e); }
  },

  async signIn() {
    if (!GOOGLE_CLIENT_ID) return null; // modo local: no hay login
    if (!tokenClient) await auth.init();
    if (!tokenClient) throw new Error('Google no disponible (¿sin conexión?)');
    const token = await requestToken('consent');
    auth.user = await fetchUser(token);
    try { localStorage.setItem(USER_KEY, JSON.stringify(auth.user)); } catch (e) { /* ignorar */ }
    emit();
    return auth.user;
  },

  signOut() {
    const t = validToken();
    if (t && window.google && window.google.accounts) { try { window.google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* ignorar */ } }
    tokenData = null;
    auth.user = null;
    auth.demoRole = null;
    try { sessionStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) { /* ignorar */ }
    emit();
  },

  // Token vigente (síncrono) o null.
  token() { return validToken(); },

  // Token vigente o renovación silenciosa; null si no es posible.
  async ensureToken() {
    const t = validToken();
    if (t) return t;
    if (!GOOGLE_CLIENT_ID) return null;
    try {
      if (!tokenClient) await auth.init();
      if (!tokenClient) return null;
      return await requestToken('');
    } catch (e) { return null; }
  },

  invalidate() { tokenData = null; try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignorar */ } },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Sólo vista: el selector "Cambiar a rol" de la demo.
  setDemoRole(rol) { auth.demoRole = rol || null; emit(); },

  // Fila de Usuarios del usuario actual (o null).
  currentUserRow() {
    if (!auth.user) return null;
    const email = String(auth.user.email || '').toLowerCase();
    return usersProvider().find((u) => String(u.email || '').toLowerCase() === email) || null;
  },

  nadadorId() { const r = auth.currentUserRow(); return r ? r.nadadorId || '' : ''; },

  role() {
    if (auth.demoRole) return auth.demoRole;
    if (!GOOGLE_CLIENT_ID) return 'admin';
    const users = usersProvider();
    if (!users.length) return 'admin'; // club recién creado: el propietario es admin
    const row = auth.currentUserRow();
    if (!row && auth.user && String(ownerProvider() || '').toLowerCase() === String(auth.user.email || '').toLowerCase()) return 'admin';
    return row ? row.rol : 'nadador';
  },

  // Uso interno del store.
  _setUsersProvider(fn) { usersProvider = fn; },
  _setOwnerProvider(fn) { ownerProvider = fn; },
};

export default auth;
