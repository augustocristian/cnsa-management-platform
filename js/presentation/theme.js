// Light / dark / automatic theme. setTheme('auto'|'light'|'dark') sets data-theme on <html>, mirrors it in
// localStorage ('cnl:tema', read by js/presentation/theme-boot.js before first paint) and stores it in the user's
// preferences (js/composicion/preferencias.js -> Drive) when available.
//   - 'auto'  -> no attribute: the system prefers-color-scheme decides.
//   - 'light' -> data-theme="light";  'dark' -> data-theme="dark".
import { t, onLangChange } from './i18n/i18n.js';

export const TEMAS = ['auto', 'light', 'dark'];
export const CLAVE_LOCAL = 'cnl:tema';
const CLAVE_PREF = 'tema'; // = CLAVES.tema in domain/preferencias.js

const listeners = new Set();
let prefsLink = null; // { prefs, CLAVES } set when app.js links the preferences service
let mq = null;

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};
const valido = (x) => TEMAS.includes(x);
const root = () => (typeof document !== 'undefined' ? document.documentElement : null);

// Current preference: 'auto' | 'light' | 'dark'
export function getTheme() {
  const a = root()?.getAttribute('data-theme');
  return a === 'light' || a === 'dark' ? a : 'auto';
}

// Effective theme (what the user sees): 'light' | 'dark'
export function effectiveTheme() {
  const p = getTheme();
  if (p !== 'auto') return p;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { return 'light'; }
}

function aplicar(tema) {
  const el = root();
  if (!el) return;
  if (tema === 'auto') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', tema);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', tema === 'auto' ? 'light dark' : tema);
}

function avisar() {
  const ef = effectiveTheme();
  listeners.forEach((fn) => { try { fn(ef, getTheme()); } catch (e) { console.error(e); } });
}

// setTheme('dark') -> applied theme. { persist:false } leaves localStorage and preferences alone (e.g. when receiving the remote value).
export function setTheme(tema, { persist = true } = {}) {
  if (!valido(tema)) tema = 'auto';
  const antes = getTheme();
  aplicar(tema);
  if (persist) {
    ls.set(CLAVE_LOCAL, tema === 'auto' ? null : tema);
    guardarEnPreferencias(tema);
  }
  if (antes !== tema) avisar();
  return tema;
}

function guardarEnPreferencias(tema) {
  const valor = tema === 'auto' ? null : tema;
  if (prefsLink) { try { prefsLink.prefs.set(prefsLink.CLAVES?.tema || CLAVE_PREF, valor); } catch (e) { /* ignore */ } return; }
  // Not linked yet (the composition root links the preferences at start): the choice stays in localStorage and is picked up on the next start.
}

// Subscribe to effective-theme changes (including system changes in automatic mode). -> unsubscribe()
export function onThemeChange(fn) {
  listeners.add(fn);
  if (!mq && typeof window !== 'undefined' && window.matchMedia) {
    try {
      mq = window.matchMedia('(prefers-color-scheme: dark)');
      mq.addEventListener?.('change', () => { if (getTheme() === 'auto') avisar(); });
    } catch (e) { /* ignore */ }
  }
  return () => listeners.delete(fn);
}

// app.js links the preferences service here: applies the stored value and follows changes made on another device.
export function enlazar(prefs, CLAVES) {
  prefsLink = { prefs, CLAVES };
  const clave = CLAVES?.tema || CLAVE_PREF;
  const desdePrefs = (remoto) => {
    const v = prefs.get(clave, null);
    const tema = valido(v) ? v : (remoto ? 'auto' : null); // value deleted on another device = automatic
    if (tema && tema !== getTheme()) { aplicar(tema); ls.set(CLAVE_LOCAL, tema === 'auto' ? null : tema); avisar(); }
  };
  desdePrefs();
  prefs.on?.((e) => { if (e.tipo === 'cambio' && e.origen === 'remoto' && e.claves.includes(clave)) desdePrefs(true); });
}

// <select> (single instance, reused across header repaints) with Automatic / Light / Dark (the language control is the flag switch in js/presentation/lang-switch.js). Labelled for screen readers.
let selUnico = null;
export function themeSelect() {
  if (selUnico) return selUnico;
  const sel = document.createElement('select');
  sel.className = 'theme-select';
  const pintar = () => {
    sel.setAttribute('aria-label', t('tema.etiqueta'));
    TEMAS.forEach((x, i) => { if (sel.options[i]) sel.options[i].textContent = t('tema.' + x); });
  };
  TEMAS.forEach((x) => {
    const o = document.createElement('option');
    o.value = x;
    o.selected = x === getTheme();
    sel.appendChild(o);
  });
  pintar();
  sel.addEventListener('change', () => setTheme(sel.value));
  onThemeChange(() => { sel.value = getTheme(); });
  onLangChange(pintar);
  selUnico = sel;
  return sel;
}
