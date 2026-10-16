// Training sessions list: pure rules (no DOM, no clock, no i18n). Weeks are Monday..Sunday and every date is a
// 'YYYY-MM-DD' string; "today" always arrives as a parameter.
//   - week ranges and ordering of sessions
//   - what a session card shows (as message keys + params; the view translates them)
//   - validation of the session form (error codes per field)
//   - duplication rules
import { sumarDias, lunesDe, fechaValida } from './planificacion.js';
import { horaTexto, num } from './entreno.js';

export { sumarDias, lunesDe, fechaValida };

export const dia10 = (f) => String(f ?? '').slice(0, 10);
export const finSemana = (lunes) => sumarDias(lunes, 6);
export const diasDeSemana = (lunes) => Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));

// Sessions sorted by date, then time, then title (copy).
export function ordenarSesiones(sesiones) {
  return (sesiones || []).slice().sort((a, b) =>
    dia10(a.fecha).localeCompare(dia10(b.fecha))
    || horaTexto(a.hora).localeCompare(horaTexto(b.hora))
    || String(a.titulo ?? '').localeCompare(String(b.titulo ?? '')));
}

// Sessions of the week starting at `lunes` (optionally of one group), ordered.
export function sesionesDeSemana(sesiones, lunes, { grupoId = '' } = {}) {
  const fin = finSemana(lunes);
  return ordenarSesiones((sesiones || []).filter((s) => {
    const f = dia10(s.fecha);
    return f >= lunes && f <= fin && (!grupoId || s.grupoId === grupoId);
  }));
}

// Week model for the list: { lunes, fin, total, dias: [{ fecha, esHoy, sesiones }] }.
export function armarSemana(sesiones, lunes, { grupoId = '', hoy = '' } = {}) {
  const delaSemana = sesionesDeSemana(sesiones, lunes, { grupoId });
  return {
    lunes,
    fin: finSemana(lunes),
    total: delaSemana.length,
    dias: diasDeSemana(lunes).map((fecha) => ({ fecha, esHoy: fecha === hoy, sesiones: delaSemana.filter((s) => dia10(s.fecha) === fecha) })),
  };
}

// What the card of a session shows besides title/group/state: [{ clave, params }] (keys of the entre.* / entreno.* dictionaries).
export function metaSesion(s, resumenPlan = null) {
  const meta = [];
  if (s.duracionMin) meta.push({ clave: 'entre.meta-min', params: { n: s.duracionMin } });
  if (s.piscina) meta.push({ clave: 'entre.meta-piscina', params: { n: s.piscina } });
  if (s.volumenMin || s.volumenMax) meta.push({ clave: 'entre.meta-vol', params: { min: s.volumenMin || '?', max: s.volumenMax || '?' } });
  if (s.enfoque) meta.push({ clave: 'entre.meta-enfoque', params: { v: s.enfoque } });
  if (resumenPlan && resumenPlan.metros) meta.push({ clave: 'entreno.chip', params: { m: resumenPlan.metros, min: resumenPlan.tiempoMin } });
  return meta;
}

// ---------- Form ----------
const vacio = (v) => String(v ?? '').trim() === '';

// -> { campo: codigo } (empty object = valid). Codes: obligatorio, fecha-invalida, numero-invalido, volumen-rango.
export function validarFormulario(v = {}) {
  const e = {};
  if (vacio(v.titulo)) e.titulo = 'obligatorio';
  if (vacio(v.fecha)) e.fecha = 'obligatorio';
  else if (!fechaValida(v.fecha)) e.fecha = 'fecha-invalida';
  for (const c of ['duracionMin', 'volumenMin', 'volumenMax']) {
    if (!vacio(v[c]) && !(Number.isFinite(num(v[c])) && num(v[c]) >= 0)) e[c] = 'numero-invalido';
  }
  if (!e.volumenMin && !e.volumenMax && !vacio(v.volumenMin) && !vacio(v.volumenMax) && num(v.volumenMin) > num(v.volumenMax)) e.volumenMax = 'volumen-rango';
  return e;
}

// Empty draft for "New session".
export const borradorNuevo = ({ fecha = '', grupoId = '' } = {}) => ({ fecha, grupoId, estado: 'planificado' });

// Duplication rule: same data, back to 'planificado', no id; `copiaDe` tells the service to copy the detailed plan too.
export function borradorDuplicado(sesion) {
  return { ...sesion, id: undefined, estado: 'planificado', copiaDe: sesion.id };
}

export const alternarEstado = (estado) => (estado === 'realizado' ? 'planificado' : 'realizado');
