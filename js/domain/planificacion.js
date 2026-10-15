// Dominio de la planificación de piscina: lógica pura (sin DOM, sin store, sin fetch, sin i18n).
// Días de la semana: 1 = lunes ... 7 = domingo. Horas "HH:MM". Calles numeradas desde 1.
// Los conflictos se devuelven como códigos + parámetros; la presentación los traduce.

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
export const PALETA = [210, 150, 28, 280, 350, 180, 55, 320, 100, 240]; // tonos HSL para colorear cursos

// ---------- Horas y fechas ----------
export function aMin(v) {
  if (typeof v === 'number') return v >= 0 && v < 1 ? Math.round(v * 1440) : NaN; // Sheets puede devolver fracción de día
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
const utc = (f) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(f ?? ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null; // rechaza 2026-02-31
};
export const fechaValida = (f) => !!utc(f);
export function diaDeFecha(f) {
  const d = utc(f);
  return d ? ((d.getUTCDay() + 6) % 7) + 1 : NaN;
}
export function sumarDias(f, n) {
  const d = utc(f);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const lunesDe = (f) => { const d = diaDeFecha(f); return isNaN(d) ? '' : sumarDias(f, -(d - 1)); };
export const fechaDeDia = (lunes, dia) => sumarDias(lunes, dia - 1);

// ---------- Normalización ----------
export function horarioPorDefecto(abre = '07:00', cierra = '22:00') {
  const h = {};
  DIAS.forEach((d) => { h[d] = d === 7 ? null : { abre, cierra }; });
  return h;
}
// raw: JSON (string) u objeto -> {1..7: {abre,cierra}|null}. Cualquier dato roto cae al horario por defecto.
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

// ---------- Validación de piscina ----------
// -> lista de códigos de error ([] = válida)
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

// ¿Se dan las dos asignaciones el mismo día real? (recurrente + recurrente, recurrente + fecha, misma fecha)
export function mismoDia(a, b) {
  if (a.dia !== b.dia) return false;
  return !a.fecha || !b.fecha || a.fecha === b.fecha;
}
const tiempoValido = (a) => !isNaN(a.ini) && !isNaN(a.fin) && a.fin > a.ini;
export const coinciden = (a, b) => tiempoValido(a) && tiempoValido(b) && mismoDia(a, b) && solapan(a.ini, a.fin, b.ini, b.fin);

// ---------- Detección de conflictos ----------
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

// Huecos libres (info): por piscina y día, sólo con asignaciones recurrentes; calles contiguas con el mismo hueco se agrupan.
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
    const abiertos = new Map(); // "ini-fin" -> tramo de calles en curso
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

// Todos los conflictos del conjunto. opciones.huecos=true añade los huecos libres (info).
export function detectarConflictos(datos, { huecos = false } = {}) {
  const cx = contexto(datos);
  const out = [];
  cx.as.forEach((a) => conflictosIndividuales(a, cx, out));
  for (let i = 0; i < cx.as.length; i++) for (let j = i + 1; j < cx.as.length; j++) conflictosPareja(cx.as[i], cx.as[j], cx, out);
  if (huecos) cx.ps.forEach((p) => out.push(...huecosLibres(p, cx.as)));
  return ordenar(out);
}

export const ID_NUEVA = '__nueva__';
// Conflictos (error/aviso) en los que participaría una asignación candidata frente al resto.
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
// Mapa id de asignación -> peor severidad ('error' | 'aviso'); las asignaciones sin conflicto no aparecen.
export function severidadPorAsignacion(conflictos) {
  const m = new Map();
  conflictos.forEach((c) => c.asignaciones.forEach((id) => {
    if (c.severidad === 'info') return;
    if (!m.has(id) || RANGO_SEV[c.severidad] > RANGO_SEV[m.get(id)]) m.set(id, c.severidad);
  }));
  return m;
}

// ---------- Rejilla y ocupación ----------
// Asignaciones (normalizadas) de una piscina para un día; con `fecha` incluye también las puntuales de esa fecha.
export function delDia(asignaciones, { piscinaId, dia, fecha = '' }) {
  const d = fecha ? diaDeFecha(fecha) : dia;
  return asignaciones.map((a) => (a.ini === undefined ? normalizarAsignacion(a) : a))
    .filter((a) => a.piscinaId === String(piscinaId) && a.dia === d && (!a.fecha || (fecha && a.fecha === fecha)));
}
// Rango horario visible de un día (minutos), alineado al intervalo; incluye asignaciones fuera de horario.
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
// Nivel de apilado de cada asignación (0,1,..) para dibujar bloques que se solapan en calle y hora.
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
// Ocupación entre abre y cierra (minutos): minutos-calle ocupados / disponibles, sin contar doble solape.
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

// ---------- Cambio del número de calles ----------
// -> { recortadas: [fila con calleHasta = numCalles], fuera: [filas totalmente fuera de rango] }
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

// ---------- Sugerencia de distribución ----------
// Reparte grupos en calles libres de un día, sin conflictos de tipo error. Determinista:
// grupos por nº de nadadores (desc) y nombre; horas ascendentes (o más cercanas a preferencias[grupoId]); calles ascendentes.
// Calles necesarias = ceil(nadadores / maxPorCalle); si no caben se prueba con menos (propuesta.reducida = true).
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
