// Internacionalización ligera: es | en | it. Sin dependencias.
// Los valores guardados en Excel/Sheet (categorías, estados, tipos) siguen en español:
// las traducciones son sólo de visualización (tCat, tEstado, tTipo, tNav).
import es from './locales/es.js';
import en from './locales/en.js';
import it from './locales/it.js';
import vistasAes from './locales/vistas-a.es.js';
import vistasAen from './locales/vistas-a.en.js';
import vistasAit from './locales/vistas-a.it.js';
import vistasBes from './locales/vistas-b.es.js';
import vistasBen from './locales/vistas-b.en.js';
import vistasBit from './locales/vistas-b.it.js';
import vistasCes from './locales/vistas-c.es.js';
import vistasCen from './locales/vistas-c.en.js';
import vistasCit from './locales/vistas-c.it.js';
import planES from './locales/planificacion.es.js';
import planEN from './locales/planificacion.en.js';
import planIT from './locales/planificacion.it.js';
import entES from './locales/entreno.es.js';
import entEN from './locales/entreno.en.js';
import entIT from './locales/entreno.it.js';
import calES from './locales/calendario.es.js';
import calEN from './locales/calendario.en.js';
import calIT from './locales/calendario.it.js';
import accES from './locales/acceso.es.js';
import accEN from './locales/acceso.en.js';
import accIT from './locales/acceso.it.js';
import catES from './locales/categorias.es.js';
import catEN from './locales/categorias.en.js';
import catIT from './locales/categorias.it.js';
import tcES from './locales/cargas-tipos.es.js';
import tcEN from './locales/cargas-tipos.en.js';
import tcIT from './locales/cargas-tipos.it.js';
import disES from './locales/diseno.es.js';
import datES from './locales/datos.es.js';
import datEN from './locales/datos.en.js';
import datIT from './locales/datos.it.js';
import disEN from './locales/diseno.en.js';
import disIT from './locales/diseno.it.js';
import tpES from './locales/temporada.es.js';
import tpEN from './locales/temporada.en.js';
import tpIT from './locales/temporada.it.js';
import bnES from './locales/banadores.es.js';
import bnEN from './locales/banadores.en.js';
import bnIT from './locales/banadores.it.js';
import homeES from './locales/inicio.es.js';
import homeEN from './locales/inicio.en.js';
import homeIT from './locales/inicio.it.js';
import bkES from './locales/backup.es.js';
import bkEN from './locales/backup.en.js';
import bkIT from './locales/backup.it.js';
import tutES from './locales/tutorial.es.js';
import tutEN from './locales/tutorial.en.js';
import tutIT from './locales/tutorial.it.js';
import { normalizarNombre } from './domain/cargas.js';

export const LANGS = [
  { code: 'es', label: 'Español' },
  { code: 'en', label: 'English' },
  { code: 'it', label: 'Italiano' }
];
export const LANG_KEY = 'cnl:lang';
const DICTS = { es: { ...es, ...vistasAes, ...vistasBes, ...vistasCes, ...planES, ...calES, ...entES, ...tcES , ...accES, ...disES, ...tpES, ...catES, ...datES, ...bnES, ...homeES, ...bkES, ...tutES }, en: { ...en, ...vistasAen, ...vistasBen, ...vistasCen, ...planEN, ...calEN, ...entEN, ...tcEN , ...accEN, ...disEN, ...tpEN, ...catEN, ...datEN, ...bnEN, ...homeEN, ...bkEN, ...tutEN }, it: { ...it, ...vistasAit, ...vistasBit, ...vistasCit, ...planIT, ...calIT, ...entIT, ...tcIT , ...accIT, ...disIT, ...tpIT, ...catIT, ...datIT, ...bnIT, ...homeIT, ...bkIT, ...tutIT } };
const INTL = { es: 'es-ES', en: 'en-GB', it: 'it-IT' };
const listeners = new Set();

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignorar */ } }
};
const valid = (c) => LANGS.some((l) => l.code === c);

function detect() {
  const saved = ls.get(LANG_KEY);
  if (valid(saved)) return saved;
  const nav = (typeof navigator !== 'undefined' && (navigator.languages?.[0] || navigator.language)) || '';
  const short = String(nav).toLowerCase().slice(0, 2);
  return valid(short) ? short : 'es';
}

let lang = detect();
function applyDocLang() {
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
}
applyDocLang();

export function getLang() { return lang; }

export function setLang(code, { persist = true } = {}) {
  if (!valid(code)) code = 'es';
  const changed = code !== lang;
  lang = code;
  if (persist) ls.set(LANG_KEY, code);
  applyDocLang();
  if (changed) listeners.forEach((fn) => { try { fn(lang); } catch (e) { console.error(e); } });
  return lang;
}

// Devuelve una función para cancelar la suscripción.
export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// t('clave', {nombre: 'x'}) -> idioma actual -> es -> la propia clave
export function t(key, vars) {
  let s = DICTS[lang]?.[key];
  if (s == null || s === '') s = DICTS.es[key];
  if (s == null || s === '') return key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

export function hasKey(key) { return key in DICTS.es; }

// --- Valores internos (español) -> texto visible ---
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, '-');
function tVal(ns, value) {
  if (value == null || value === '') return '';
  const key = `${ns}.${norm(value)}`;
  return hasKey(key) ? t(key) : String(value);
}
export const tCat = (v) => tVal('cat', v);
export const tEstado = (v) => tVal('estado', v);
// Contenidos de entrenamiento. Los predefinidos se traducen con `tc.<clave>.nombre|desc`; los personalizados
// (y los heredados) se muestran tal cual los escribió el usuario.
let nombresPredef = null;
function clavePredefinida(nombre) {
  if (!nombresPredef) {
    nombresPredef = new Map();
    for (const k of Object.keys(DICTS.es)) {
      const m = /^tc\.([\w-]+)\.nombre$/.exec(k);
      if (m) nombresPredef.set(normalizarNombre(DICTS.es[k]), m[1]);
    }
  }
  return nombresPredef.get(normalizarNombre(nombre)) || null;
}
// Nombre guardado (p. ej. Cargas.tipo) -> texto visible. Admite los tipos antiguos (Aeróbico, Velocidad...).
export function tTipo(v) {
  if (v == null || v === '') return '';
  const clave = clavePredefinida(v);
  return clave ? t(`tc.${clave}.nombre`) : tVal('tipo', v);
}
const slugContenido = (r) => String(r.id || '').replace(/^tc-/, '');
// Fila de TiposCarga normalizada ({id, nombre, descripcion, predefinido}) -> nombre visible.
export function tContenido(r) {
  if (!r) return '';
  const k = `tc.${slugContenido(r)}.nombre`;
  return r.predefinido && hasKey(k) ? t(k) : r.nombre;
}
// Descripción visible: la traducida mientras siga siendo la original en español; si el usuario la editó, la suya.
export function tContenidoDesc(r) {
  if (!r) return '';
  const k = `tc.${slugContenido(r)}.desc`;
  if (r.predefinido && hasKey(k) && (!r.descripcion || r.descripcion === DICTS.es[k])) return t(k);
  return r.descripcion || '';
}
export const tNav = (v) => tVal('nav', v);

// --- Intl por idioma ---
export const locale = () => INTL[lang];

function toDate(d) {
  if (d instanceof Date) return d;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, dd] = d.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, dd);
  }
  return new Date(d);
}

// tDate(d) -> 15/10/2026 ; tDate(d,'long') -> "jueves, 15 de octubre de 2026" (según idioma)
export function tDate(d, mode) {
  if (d === '' || d == null) return '';
  const x = toDate(d);
  if (isNaN(x)) return String(d);
  const opts = mode === 'long'
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Intl.DateTimeFormat(locale(), opts).format(x);
}

export function tNum(n, opts) {
  const x = Number(n);
  if (!isFinite(x)) return String(n ?? '');
  return new Intl.NumberFormat(locale(), opts).format(x);
}
