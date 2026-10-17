// Pool planning domain: pure logic (no DOM, no store, no fetch, no i18n, no clock).
// Days of the week: 1 = Monday ... 7 = Sunday. Times "HH:MM". Lanes numbered from 1.
// Conflicts are returned as codes + parameters; the presentation translates them.

import { parseFecha, diaSemana, addDias, lunesDe as lunesDeCal } from './calendario.js';

export const DIAS = [1, 2, 3, 4, 5, 6, 7];
export const LONGITUDES = [25, 50];
export const INTERVALOS = [15, 30];
export const MAX_CALLES = 20;
export const TIPOS_CONFLICTO = {
  'calle-solapada': 'error', 'grupo-doble': 'error', 'entrenador-doble': 'error', 'calle-fuera-rango': 'error',
  'fuera-horario': 'error', 'hora-invalida': 'error', 'dia-invalido': 'error', 'piscina-inexistente': 'error', 'sin-grupo': 'error',
  capacidad: 'aviso', 'sin-entrenador': 'aviso', 'grupo-inexistente': 'aviso', 'hueco-libre': 'info',
};
const RANGO_SEV = { error: 3, aviso: 2, info: 1 };
export const PALETA = [210, 150, 28, 280, 350, 180, 55, 320, 100, 240]; // HSL hues to colour courses

// ---------- Times and dates ----------
export function aMin(v) {
  if (typeof v === 'number') return v >= 0 && v < 1 ? Math.round(v * 1440) : NaN; // Sheets may return a fraction of a day
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim());
  if (!m) return NaN;
  const h = Number(m[1]), mi = Number(m[2]);
  if (mi > 59 || h > 24 || (h === 24 && mi > 0)) return NaN;
  return h * 60 + mi;
}
export function deMin(n) {
  n = Math.max(0, Math.round(Number(n) || 0));
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}
// Date arithmetic is shared with the calendar domain (one implementation of Monday-of-week, add-days, validity).
const valida = (f) => parseFecha(f) !== null;
export const fechaValida = valida;
// 1 = Monday ... 7 = Sunday (NaN for an invalid date)
export const diaDeFecha = (f) => (valida(f) ? diaSemana(String(f).slice(0, 10)) + 1 : NaN);
export const sumarDias = (f, n) => (valida(f) ? addDias(String(f).slice(0, 10), n) : '');
export const lunesDe = (f) => (valida(f) ? lunesDeCal(String(f).slice(0, 10)) : '');
export const fechaDeDia = (lunes, dia) => sumarDias(lunes, dia - 1);

// ---------- Normalisation ----------
export function horarioPorDefecto(abre = '07:00', cierra = '22:00') {
  const h = {};
  DIAS.forEach((d) => { h[d] = d === 7 ? null : { abre, cierra }; });
  return h;
}
// raw: JSON (string) or object -> {1..7: {abre,cierra}|null}. Any broken data falls back to the default schedule.
export function parseHorario(raw) {
  let o = raw;
  if (typeof raw === 'string') { try { o = raw.trim() ? JSON.parse(raw) : null; } catch (e) { o = null; } }
  if (!o || typeof o !== 'object') return horarioPorDefecto();
  const h = {};
  DIAS.forEach((d) => {
    const v = o[d] ?? o[String(d)];
    h[d] = v && typeof v === 'object' ? { abre: String(v.abre ?? ''), cierra: String(v.cierra ?? '') } : null;
  });
  return h;
}
export const stringifyHorario = (h) => JSON.stringify(parseHorario(h));

const entero = (v, def) => { const n = Math.round(Number(v)); return Number.isFinite(n) && String(v ?? '') !== '' ? n : def; };

export function normalizarPiscina(r) {
  return {
    id: String(r.id ?? ''), nombre: String(r.nombre ?? '').trim(),
    longitudM: entero(r.longitudM, 25), numCalles: entero(r.numCalles, 6),
    intervaloMin: entero(r.intervaloMin, 30), maxPorCalle: entero(r.maxPorCalle, 8),
    horario: parseHorario(r.horario),
  };
}
export function normalizarAsignacion(r) {
  const fecha = String(r.fecha ?? '').trim().slice(0, 10);
  const hora = (v) => (typeof v === 'number' ? deMin(aMin(v)) : String(v ?? '').trim());
  const horaInicio = hora(r.horaInicio), horaFin = hora(r.horaFin);
  return {
    id: String(r.id ?? ''), piscinaId: String(r.piscinaId ?? ''), fecha,
    dia: fecha ? diaDeFecha(fecha) : entero(r.dia, NaN),
    horaInicio, horaFin, ini: aMin(horaInicio), fin: aMin(horaFin),
    calleDesde: entero(r.calleDesde, NaN), calleHasta: entero(r.calleHasta, NaN),
    grupoId: String(r.grupoId ?? ''), entrenadorId: String(r.entrenadorId ?? '').trim(), notas: String(r.notas ?? ''),
  };
}
const activo = (n) => !(n.activo === false || String(n.activo).toLowerCase() === 'false');
export function nadadoresPorGrupo(nadadores = []) {
  const m = {};
  nadadores.forEach((n) => { if (n.grupoId && activo(n)) m[n.grupoId] = (m[n.grupoId] || 0) + 1; });
  return m;
}

// ---------- Pool validation ----------
// -> list of error codes ([] = valid)
export function validarPiscina(p) {
  const e = [];
  const n = normalizarPiscina(p);
  if (!n.nombre) e.push('nombre-vacio');
  if (!LONGITUDES.includes(n.longitudM)) e.push('longitud');
  if (!(n.numCalles >= 1 && n.numCalles <= MAX_CALLES)) e.push('calles');
  if (!INTERVALOS.includes(n.intervaloMin)) e.push('intervalo');
  if (!(n.maxPorCalle >= 1 && n.maxPorCalle <= 99)) e.push('max-por-calle');
  let abiertos = 0, malo = false;
  DIAS.forEach((d) => {
    const x = n.horario[d];
    if (!x) return;
    abiertos++;
    const a = aMin(x.abre), c = aMin(x.cierra);
    if (isNaN(a) || isNaN(c) || c <= a) malo = true;
  });
  if (malo) e.push('horario');
  if (!abiertos) e.push('sin-dias');
  return e;
}

// ---------- Solapes ----------
export const solapan = (a1, a2, b1, b2) => a1 < b2 && b1 < a2; // intervalos [ini, fin)
export const callesSolapan = (a, b) => a.calleDesde <= b.calleHasta && b.calleDesde <= a.calleHasta; // inclusivo

// Do the two assignments fall on the same real day? (recurring + recurring, recurring + date, same date)
export function mismoDia(a, b) {
  if (a.dia !== b.dia) return false;
  return !a.fecha || !b.fecha || a.fecha === b.fecha;
}
const tiempoValido = (a) => !isNaN(a.ini) && !isNaN(a.fin) && a.fin > a.ini;
export const coinciden = (a, b) => tiempoValido(a) && tiempoValido(b) && mismoDia(a, b) && solapan(a.ini, a.fin, b.ini, b.fin);

// ---------- Conflict detection ----------
function contexto({ piscinas = [], asignaciones = [], grupos = [], nadadores = [] }) {
  return {
    ps: new Map(piscinas.map(normalizarPiscina).map((p) => [p.id, p])),
    as: asignaciones.map(normalizarAsignacion),
    gs: new Map(grupos.map((g) => [String(g.id), g])),
    nad: nadadoresPorGrupo(nadadores),
  };
}
const nombreGrupo = (cx, a) => (cx.gs.get(a.grupoId) || {}).nombre || '?';
const claveEnt = (s) => String(s || '').trim().toLowerCase();

function conflicto(tipo, a, extra = {}, otros = []) {
  const ids = [a, ...otros].map((x) => x.id);
  return {
    tipo, severidad: TIPOS_CONFLICTO[tipo], asignaciones: ids, piscinaId: a.piscinaId, dia: a.dia, fecha: a.fecha,
    params: { horaInicio: a.horaInicio, horaFin: a.horaFin, ...extra },
    clave: tipo + '|' + ids.slice().sort().join(','),
  };
}

function conflictosIndividuales(a, cx, out) {
  const p = cx.ps.get(a.piscinaId);
  if (!p) { out.push(conflicto('piscina-inexistente', a)); return; }
  const base = { grupo: nombreGrupo(cx, a), piscina: p.nombre };
  if (!(a.dia >= 1 && a.dia <= 7)) out.push(conflicto('dia-invalido', a, base));
  const horaOk = tiempoValido(a);
  if (!horaOk) out.push(conflicto('hora-invalida', a, base));
  if (!(a.calleDesde >= 1 && a.calleHasta >= a.calleDesde && a.calleHasta <= p.numCalles)) {
    out.push(conflicto('calle-fuera-rango', a, { ...base, desde: a.calleDesde, hasta: a.calleHasta, numCalles: p.numCalles }));
  }
  if (horaOk && a.dia >= 1 && a.dia <= 7) {
    const h = p.horario[a.dia];
    if (!h) out.push(conflicto('fuera-horario', a, { ...base, cerrado: true }));
    else {
      const abre = aMin(h.abre), cierra = aMin(h.cierra);
      if (a.ini < abre || a.fin > cierra) out.push(conflicto('fuera-horario', a, { ...base, abre: h.abre, cierra: h.cierra }));
    }
  }
  if (!a.grupoId) out.push(conflicto('sin-grupo', a, base));
  else if (!cx.gs.has(a.grupoId)) out.push(conflicto('grupo-inexistente', a, base));
  if (!a.entrenadorId) out.push(conflicto('sin-entrenador', a, base));
  if (a.grupoId && p.maxPorCalle > 0 && a.calleHasta >= a.calleDesde) {
    const n = cx.nad[a.grupoId] || 0;
    const calles = a.calleHasta - a.calleDesde + 1;
    if (n / calles > p.maxPorCalle) out.push(conflicto('capacidad', a, { ...base, nadadores: n, calles, max: p.maxPorCalle, porCalle: Math.ceil((n / calles) * 10) / 10 }));
  }
}

function conflictosPareja(a, b, cx, out) {
  if (!coinciden(a, b)) return;
  const ex = { a: nombreGrupo(cx, a), b: nombreGrupo(cx, b), desdeHora: deMin(Math.max(a.ini, b.ini)), hastaHora: deMin(Math.min(a.fin, b.fin)) };
  if (a.piscinaId === b.piscinaId && callesSolapan(a, b)) {
    out.push(conflicto('calle-solapada', a, { ...ex, desde: Math.max(a.calleDesde, b.calleDesde), hasta: Math.min(a.calleHasta, b.calleHasta), piscina: (cx.ps.get(a.piscinaId) || {}).nombre || '' }, [b]));
  }
  if (a.grupoId && a.grupoId === b.grupoId) out.push(conflicto('grupo-doble', a, ex, [b]));
  if (a.entrenadorId && claveEnt(a.entrenadorId) === claveEnt(b.entrenadorId)) out.push(conflicto('entrenador-doble', a, { ...ex, entrenador: a.entrenadorId }, [b]));
}

// Free gaps (info): per pool and day, only with recurring assignments; contiguous lanes with the same gap are grouped.
export function huecosLibres(piscina, asignaciones) {
  const p = normalizarPiscina(piscina);
  const as = asignaciones.map((x) => (x.ini === undefined ? normalizarAsignacion(x) : x)).filter((a) => a.piscinaId === p.id && !a.fecha && tiempoValido(a));
  const out = [];
  DIAS.forEach((dia) => {
    const h = p.horario[dia];
    if (!h) return;
    const abre = aMin(h.abre), cierra = aMin(h.cierra);
    if (isNaN(abre) || isNaN(cierra) || cierra <= abre) return;
    const porCalle = [];
    for (let c = 1; c <= p.numCalles; c++) {
      const ocup = as.filter((a) => a.dia === dia && a.calleDesde <= c && c <= a.calleHasta).sort((x, y) => x.ini - y.ini);
      const libres = [];
      let cur = abre;
      ocup.forEach((a) => { if (a.ini > cur) libres.push([cur, Math.min(a.ini, cierra)]); cur = Math.max(cur, a.fin); });
      if (cur < cierra) libres.push([cur, cierra]);
      porCalle.push(libres.filter(([i, f]) => f - i >= p.intervaloMin));
    }
    const abiertos = new Map(); // "ini-fin" -> lane range in progress
    const cerrar = (t) => out.push({
      tipo: 'hueco-libre', severidad: 'info', asignaciones: [], piscinaId: p.id, dia, fecha: '',
      params: { piscina: p.nombre, desde: t.desde, hasta: t.hasta, horaInicio: deMin(t.ini), horaFin: deMin(t.fin) },
      clave: `hueco|${p.id}|${dia}|${t.desde}-${t.hasta}|${t.ini}-${t.fin}`,
    });
    for (let c = 1; c <= p.numCalles + 1; c++) {
      const libres = porCalle[c - 1] || [];
      const keys = new Set(libres.map(([i, f]) => i + '-' + f));
      [...abiertos.keys()].forEach((k) => { if (!keys.has(k)) { cerrar(abiertos.get(k)); abiertos.delete(k); } });
      libres.forEach(([i, f]) => {
        const k = i + '-' + f;
        if (abiertos.has(k)) abiertos.get(k).hasta = c; else abiertos.set(k, { desde: c, hasta: c, ini: i, fin: f });
      });
    }
  });
  return out;
}

const ordenar = (l) => l.sort((x, y) => RANGO_SEV[y.severidad] - RANGO_SEV[x.severidad] || x.tipo.localeCompare(y.tipo) || x.clave.localeCompare(y.clave));

// All conflicts of the set. opciones.huecos=true adds the free gaps (info).
export function detectarConflictos(datos, { huecos = false } = {}) {
  const cx = contexto(datos);
  const out = [];
  cx.as.forEach((a) => conflictosIndividuales(a, cx, out));
  for (let i = 0; i < cx.as.length; i++) for (let j = i + 1; j < cx.as.length; j++) conflictosPareja(cx.as[i], cx.as[j], cx, out);
  if (huecos) cx.ps.forEach((p) => out.push(...huecosLibres(p, cx.as)));
  return ordenar(out);
}

export const ID_NUEVA = '__nueva__';
// Conflicts (error/warning) in which a candidate assignment would take part against the rest.
export function conflictosDe(candidata, datos) {
  const id = candidata.id ? String(candidata.id) : ID_NUEVA;
  const cx = contexto({ ...datos, asignaciones: (datos.asignaciones || []).filter((a) => String(a.id) !== id) });
  const c = normalizarAsignacion({ ...candidata, id });
  const out = [];
  conflictosIndividuales(c, cx, out);
  cx.as.forEach((o) => conflictosPareja(c, o, cx, out));
  return ordenar(out);
}
export const bloqueante = (conflictos) => conflictos.some((c) => c.severidad === 'error');
export const soloAvisos = (conflictos) => conflictos.length > 0 && !bloqueante(conflictos);
export function resumenConflictos(conflictos) {
  const r = { error: 0, aviso: 0, info: 0 };
  conflictos.forEach((c) => { r[c.severidad]++; });
  return r;
}
// Map assignment id -> worst severity ('error' | 'aviso'); assignments without conflict do not appear.
export function severidadPorAsignacion(conflictos) {
  const m = new Map();
  conflictos.forEach((c) => c.asignaciones.forEach((id) => {
    if (c.severidad === 'info') return;
    if (!m.has(id) || RANGO_SEV[c.severidad] > RANGO_SEV[m.get(id)]) m.set(id, c.severidad);
  }));
  return m;
}

// ---------- Grid and occupancy ----------
// Assignments (normalised) of a pool for a day; with `fecha` it also includes the one-off ones of that date.
export function delDia(asignaciones, { piscinaId, dia, fecha = '' }) {
  const d = fecha ? diaDeFecha(fecha) : dia;
  return asignaciones.map((a) => (a.ini === undefined ? normalizarAsignacion(a) : a))
    .filter((a) => a.piscinaId === String(piscinaId) && a.dia === d && (!a.fecha || (fecha && a.fecha === fecha)));
}
// Visible time range of a day (minutes), aligned to the interval; includes out-of-hours assignments.
export function rangoDia(piscina, dia, asignacionesDia = []) {
  const p = normalizarPiscina(piscina);
  const abiertos = DIAS.map((d) => p.horario[d]).filter(Boolean).map((h) => [aMin(h.abre), aMin(h.cierra)]).filter(([a, c]) => !isNaN(a) && !isNaN(c) && c > a);
  const h = p.horario[dia];
  let desde, hasta;
  if (h && aMin(h.cierra) > aMin(h.abre)) { desde = aMin(h.abre); hasta = aMin(h.cierra); }
  else if (abiertos.length) { desde = Math.min(...abiertos.map((x) => x[0])); hasta = Math.max(...abiertos.map((x) => x[1])); }
  else { desde = 420; hasta = 1320; }
  asignacionesDia.filter(tiempoValido).forEach((a) => { desde = Math.min(desde, a.ini); hasta = Math.max(hasta, a.fin); });
  const s = p.intervaloMin;
  return { desde: Math.floor(desde / s) * s, hasta: Math.ceil(hasta / s) * s };
}
export function franjas(desde, hasta, intervalo) {
  const f = [];
  for (let m = desde; m < hasta; m += intervalo) f.push(m);
  return f;
}
// Stacking level of each assignment (0,1,..) to draw blocks that overlap in lane and time.
export function niveles(asigs) {
  const orden = asigs.filter(tiempoValido).slice().sort((x, y) => x.ini - y.ini || x.id.localeCompare(y.id));
  const nivel = new Map();
  const colocadas = [];
  orden.forEach((a) => {
    let n = 0;
    while (colocadas.some((b) => nivel.get(b.id) === n && callesSolapan(a, b) && solapan(a.ini, a.fin, b.ini, b.fin))) n++;
    nivel.set(a.id, n);
    colocadas.push(a);
  });
  return nivel;
}
// Occupancy between abre and cierra (minutes): lane-minutes occupied / available, without counting double overlap.
export function ocupacion(piscina, asigs, abre, cierra) {
  const p = normalizarPiscina(piscina);
  if (isNaN(abre) || isNaN(cierra) || cierra <= abre) return { total: 0, ocupado: 0, pct: 0 };
  let ocupado = 0;
  for (let c = 1; c <= p.numCalles; c++) {
    const iv = asigs.filter((a) => tiempoValido(a) && a.calleDesde <= c && c <= a.calleHasta)
      .map((a) => [Math.max(a.ini, abre), Math.min(a.fin, cierra)]).filter(([i, f]) => f > i).sort((x, y) => x[0] - y[0]);
    let cur = abre;
    iv.forEach(([i, f]) => { const s = Math.max(i, cur); if (f > s) { ocupado += f - s; cur = f; } });
  }
  const total = p.numCalles * (cierra - abre);
  return { total, ocupado, pct: total ? Math.round((ocupado / total) * 100) : 0 };
}
export const colorTono = (grupoId, grupos = []) => {
  const i = grupos.findIndex((g) => String(g.id) === String(grupoId));
  return PALETA[(i < 0 ? 0 : i) % PALETA.length];
};

// ---------- Change of the number of lanes ----------
// -> { recortadas: [row with calleHasta = numCalles], fuera: [rows entirely out of range] }
export function ajustarAlReducir(asignaciones, piscinaId, numCalles) {
  const recortadas = [], fuera = [];
  asignaciones.filter((a) => String(a.piscinaId) === String(piscinaId)).forEach((a) => {
    const n = normalizarAsignacion(a);
    if (n.calleHasta <= numCalles) return;
    if (n.calleDesde > numCalles) fuera.push(a);
    else recortadas.push({ ...a, calleHasta: numCalles });
  });
  return { recortadas, fuera };
}

// ---------- Distribution suggestion ----------
// Distributes groups into free lanes of a day, without error-type conflicts. Deterministic:
// groups by number of swimmers (desc) and name; ascending times (or closest to preferencias[grupoId]); ascending lanes.
// Lanes needed = ceil(swimmers / maxPorCalle); if they do not fit, fewer are tried (propuesta.reducida = true).
export function sugerirDistribucion({ piscina, dia, grupos = [], nadadores = [], asignaciones = [], duracionMin = 60, desde, hasta, preferencias = {}, soloGrupos = null }) {
  const p = normalizarPiscina(piscina);
  const nad = nadadoresPorGrupo(nadadores);
  const propuestas = [], sinHueco = [];
  const h = p.horario[dia];
  const colocados = asignaciones.map(normalizarAsignacion).filter((a) => a.piscinaId === p.id && a.dia === dia && !a.fecha).map((a) => a.grupoId);
  const lista = grupos.filter((g) => (soloGrupos ? soloGrupos.includes(String(g.id)) : !colocados.includes(String(g.id))))
    .slice().sort((x, y) => (nad[y.id] || 0) - (nad[x.id] || 0) || String(x.nombre).localeCompare(String(y.nombre)) || String(x.id).localeCompare(String(y.id)));
  if (!h) { lista.forEach((g) => sinHueco.push({ grupoId: String(g.id), motivo: 'cerrado' })); return { propuestas, sinHueco }; }
  const d0 = desde == null || desde === '' ? NaN : aMin(desde), h0 = hasta == null || hasta === '' ? NaN : aMin(hasta);
  const ini0 = Math.max(aMin(h.abre), isNaN(d0) ? 0 : d0);
  const fin0 = Math.min(aMin(h.cierra), isNaN(h0) ? 1440 : h0);
  const dur = Math.max(p.intervaloMin, Math.ceil(duracionMin / p.intervaloMin) * p.intervaloMin);
  const datosBase = { piscinas: [p], grupos, nadadores };
  let trabajo = asignaciones.slice();
  lista.forEach((g, k) => {
    const gid = String(g.id);
    const necesarias = Math.min(p.numCalles, Math.max(1, Math.ceil((nad[gid] || 0) / p.maxPorCalle)));
    const pref = preferencias[gid] != null ? aMin(preferencias[gid]) : NaN;
    const starts = [];
    for (let s = ini0; s + dur <= fin0; s += p.intervaloMin) starts.push(s);
    if (!isNaN(pref)) starts.sort((x, y) => Math.abs(x - pref) - Math.abs(y - pref) || x - y);
    for (let calles = necesarias; calles >= 1; calles--) {
      for (const s of starts) {
        for (let c = 1; c + calles - 1 <= p.numCalles; c++) {
          const cand = { id: 'sug' + k, piscinaId: p.id, dia, fecha: '', horaInicio: deMin(s), horaFin: deMin(s + dur), calleDesde: c, calleHasta: c + calles - 1, grupoId: gid, entrenadorId: g.entrenador || '', notas: '' };
          if (bloqueante(conflictosDe(cand, { ...datosBase, asignaciones: trabajo }))) continue;
          propuestas.push({ ...cand, id: '', reducida: calles < necesarias });
          trabajo = trabajo.concat([cand]);
          return;
        }
      }
    }
    sinHueco.push({ grupoId: gid, motivo: 'sin-hueco' });
  });
  return { propuestas, sinHueco };
}

// ---------- View model helpers (pure; moved out of the view) ----------
// Usual start time of each group according to its sessions (the most frequent one; ties resolved by the earliest). It guides the
// distribution suggestion. sesiones: rows of Entrenamientos -> {grupoId: 'HH:MM'}
export function preferenciasHora(sesiones = []) {
  const cuenta = {};
  sesiones.forEach((e) => {
    if (!e.grupoId || !/^\d{1,2}:\d{2}$/.test(String(e.hora || ''))) return;
    const c = (cuenta[e.grupoId] ||= {});
    c[e.hora] = (c[e.hora] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(cuenta).map(([g, c]) => [g, Object.entries(c).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]]));
}

// Conflicts split by severity for the panel: {errores, avisos, infos}
export function agruparConflictos(conflictos = []) {
  return {
    errores: conflictos.filter((c) => c.severidad === 'error'),
    avisos: conflictos.filter((c) => c.severidad === 'aviso'),
    infos: conflictos.filter((c) => c.severidad === 'info'),
  };
}

// An assignment fits the grid when its lanes are inside the pool and its times are valid.
export const cabeEnRejilla = (a, piscina) => !Number.isNaN(a.ini) && a.fin > a.ini && a.calleDesde >= 1 && a.calleHasta <= piscina.numCalles && a.calleHasta >= a.calleDesde;
// Lanes that do not exist in the pool at all (shown apart as a problem).
export const fueraDeCalles = (a, piscina) => !(a.calleDesde >= 1 && a.calleHasta <= piscina.numCalles && a.calleHasta >= a.calleDesde);

// Grid row (0-based from the first slot) and number of rows of an assignment.
export function posicionBloque(a, desde, intervalo) {
  return { fila: Math.floor((a.ini - desde) / intervalo), filas: Math.max(1, Math.round((a.fin - a.ini) / intervalo)) };
}

// Is the pool open for the whole slot starting at minute m on this day?
export function franjaAbierta(piscina, dia, m) {
  const h = piscina.horario[dia];
  if (!h) return false;
  const abre = aMin(h.abre), cierra = aMin(h.cierra);
  return !Number.isNaN(abre) && m >= abre && m + piscina.intervaloMin <= cierra;
}

// Default end of a new assignment started from an empty slot: one hour, never past the visible range.
export const finPorDefecto = (m, hastaRango, intervalo) => Math.max(Math.min(m + 60, hastaRango), m + intervalo);
