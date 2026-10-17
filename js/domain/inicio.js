// Home dashboard logic: PURE (no DOM, storage, i18n or clock; the current moment always arrives as a Date argument).
// Everything the view needs to decide lives here so it can be unit tested: which session is next, who is expected,
// the attendance counters (same rules as the Attendance module), chart scales, recent notes and the first steps.
import { nadadoresDeSesion, resumenSesion } from './asistencia.js';
import { normalizarEvento } from './temporada.js';

export const DURACION_POR_DEFECTO_MIN = 60;
export const PASOS_INICIALES = ['grupos', 'nadadores', 'piscina', 'sesion'];

const pad = (n) => String(n).padStart(2, '0');
const texto = (x) => String(x ?? '');

// ---------- Dates and times ----------
export const fechaIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fechaDe = (iso) => {
  const [y, m, d] = texto(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const minutosDeHora = (hora) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(texto(hora).trim());
  if (!m) return null;
  const h = Number(m[1]),
    mm = Number(m[2]);
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};
// Whole days from `desde` to `hasta` (both YYYY-MM-DD). Negative when `hasta` is earlier.
export const diasEntre = (desde, hasta) => {
  const a = fechaDe(desde),
    b = fechaDe(hasta);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) /
      86400000,
  );
};
const ordenFecha = (a, b) =>
  a.fecha.localeCompare(b.fecha) || (a.inicioMin ?? 1e4) - (b.inicioMin ?? 1e4) || a.id.localeCompare(b.id);

// ---------- Sessions ----------
// Training row -> {id, fecha, hora, inicioMin, finMin, ...}. A session without a valid time has no start/end.
export function normalizarSesion(e = {}) {
  const inicioMin = minutosDeHora(e.hora);
  const dur = Number(e.duracionMin);
  const duracionMin = dur > 0 ? dur : DURACION_POR_DEFECTO_MIN;
  return {
    id: texto(e.id),
    fecha: texto(e.fecha).slice(0, 10),
    hora: inicioMin == null ? '' : `${pad(Math.floor(inicioMin / 60))}:${pad(inicioMin % 60)}`,
    inicioMin,
    finMin: inicioMin == null ? null : inicioMin + duracionMin,
    duracionMin,
    grupoId: texto(e.grupoId),
    estado: texto(e.estado),
    titulo: texto(e.titulo),
    piscina: texto(e.piscina),
    volumenMin: Number(e.volumenMin) || 0,
    volumenMax: Number(e.volumenMax) || 0,
    enfoque: texto(e.enfoque),
  };
}

// Where a session is relative to `ahora`: 'pasada' | 'en-curso' | 'pendiente'.
// A session without a time on today's date counts as pending (it can still happen today).
export function momentoDe(sesion, ahora) {
  const hoy = fechaIso(ahora);
  if (sesion.fecha < hoy) return 'pasada';
  if (sesion.fecha > hoy) return 'pendiente';
  if (sesion.inicioMin == null) return 'pendiente';
  const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
  if (ahoraMin < sesion.inicioMin) return 'pendiente';
  return ahoraMin < sesion.finMin ? 'en-curso' : 'pasada';
}

// Today's sessions in time order, each with its `momento`.
export function sesionesDeHoy(entrenos, ahora) {
  const hoy = fechaIso(ahora);
  return (entrenos || [])
    .map(normalizarSesion)
    .filter((s) => s.fecha === hoy)
    .sort(ordenFecha)
    .map((s) => ({ ...s, momento: momentoDe(s, ahora) }));
}

// First session that is not finished and not marked as done, by date and time. Never a past session.
// A session in progress still counts (momento 'en-curso'). -> session with `momento` and `dias` from today, or null.
export function proximaSesion(entrenos, ahora) {
  const hoy = fechaIso(ahora);
  const s = (entrenos || [])
    .map(normalizarSesion)
    .filter((x) => x.fecha && x.estado !== 'realizado' && momentoDe(x, ahora) !== 'pasada')
    .sort(ordenFecha)[0];
  return s ? { ...s, momento: momentoDe(s, ahora), dias: diasEntre(hoy, s.fecha) } : null;
}

// Session to take attendance for today: the one in progress, else the next one, else the last one finished.
export function sesionParaAsistencia(sesionesHoy) {
  const l = sesionesHoy || [];
  return l.find((s) => s.momento === 'en-curso') || l.find((s) => s.momento === 'pendiente') || l[l.length - 1] || null;
}

// Sessions of the Monday-to-Sunday week that starts on `lunesIso`. -> {total, realizadas}
export function sesionesDeLaSemana(entrenos, lunesIso) {
  const lunes = fechaDe(lunesIso);
  const fin = fechaIso(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6));
  const l = (entrenos || []).map(normalizarSesion).filter((s) => s.fecha >= lunesIso && s.fecha <= fin);
  return { total: l.length, realizadas: l.filter((s) => s.estado === 'realizado').length };
}

// ---------- Attendance (same rules as the Attendance module: domain/asistencia.js) ----------
// Expected = active swimmers of the session's group (every active swimmer when the session has no group).
export function nadadoresEsperados(sesion, nadadores) {
  return nadadoresDeSesion(sesion, nadadores);
}

// Counters of one session. Only records of expected swimmers count; `sinConfirmar` = expected without a record.
export function asistenciaDeSesion(sesion, nadadores, asistencias) {
  const esperados = nadadoresEsperados(sesion, nadadores);
  const r = resumenSesion(
    esperados,
    (asistencias || []).filter((a) => a.entrenamientoId === sesion.id),
  );
  return {
    sesionId: sesion.id,
    esperados: r.total,
    presentes: r.presente,
    ausentes: r.ausente,
    justificados: r.justificado,
    sinConfirmar: r.sinMarcar,
    porcentaje: r.total ? Math.round((r.presente / r.total) * 100) : null,
  };
}

// Attendance of a set of sessions (today's). -> {sesiones: [counters], total: counters}
export function asistenciaDeHoy(sesiones, nadadores, asistencias) {
  const filas = (sesiones || []).map((s) => asistenciaDeSesion(s, nadadores, asistencias));
  const suma = (k) => filas.reduce((a, f) => a + f[k], 0);
  const esperados = suma('esperados'),
    presentes = suma('presentes');
  return {
    sesiones: filas,
    total: {
      esperados,
      presentes,
      ausentes: suma('ausentes'),
      justificados: suma('justificados'),
      sinConfirmar: suma('sinConfirmar'),
      porcentaje: esperados ? Math.round((presentes / esperados) * 100) : null,
    },
  };
}

// ---------- Training load alerts ----------
// evaluacion (from domain/cargas.evaluarSemana) -> only the contents out of range, worst first.
export function alertasDeCarga(evaluacion) {
  return (evaluacion || [])
    .filter((e) => e.estado === 'alto' || e.estado === 'bajo')
    .map((e) => ({
      tipo: e.tipo,
      estado: e.estado,
      metros: e.metros,
      min: e.min,
      max: e.max,
      diferencia: e.diferencia,
    }))
    .sort((a, b) => b.diferencia - a.diferencia);
}

// ---------- Weekly chart ----------
const PASOS_EJE = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];

// Round axis for a maximum value: step 100/200/250/500/1000... and at most `maxMarcas` gridlines above zero.
// -> {tope, paso, marcas: [0, paso, ... tope]}
export function escalaEje(maximo, { maxMarcas = 5 } = {}) {
  const v = Math.max(0, Number(maximo) || 0) * 1.05;
  if (v <= 0) return { tope: 1000, paso: 250, marcas: [0, 250, 500, 750, 1000] };
  const paso = PASOS_EJE.find((p) => Math.ceil(v / p) <= maxMarcas) || PASOS_EJE[PASOS_EJE.length - 1];
  const n = Math.max(2, Math.ceil(v / paso));
  return { tope: n * paso, paso, marcas: Array.from({ length: n + 1 }, (_, i) => i * paso) };
}

// 500 -> '500', 1000 -> '1k', 2500 -> '2.5k' (`decimal` is the locale's decimal separator).
export function etiquetaMetros(v, decimal = '.') {
  const n = Math.round(Number(v) || 0);
  if (n < 1000) return String(n);
  const k = Math.round(n / 100) / 10;
  return `${String(k).replace('.', decimal)}k`;
}

// One bar per day of the week. Future days carry `futuro: true` and no value (they are not zero, they have not happened).
// agregado: from domain/cargas.agregarSemana. objetivoSemanal: {min, max} per swimmer (domain/cargas.objetivoTotal).
export function serieSemanal({ agregado, lunes, ahora, ordenTipos = [], objetivoSemanal = { min: 0, max: 0 } }) {
  const hoy = fechaIso(ahora);
  const orden = [...ordenTipos, ''];
  const dias = Array.from({ length: 7 }, (_, i) => {
    const fecha = fechaIso(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i));
    const futuro = fecha > hoy;
    const porTipo = futuro
      ? []
      : orden.map((id) => ({ id, metros: (agregado.porDiaTipo[i] || {})[id] || 0 })).filter((x) => x.metros > 0);
    return { indice: i, fecha, hoy: fecha === hoy, futuro, total: futuro ? null : agregado.porDia[i] || 0, porTipo };
  });
  const min = (objetivoSemanal.min || 0) / 7,
    max = (objetivoSemanal.max || 0) / 7;
  const banda = min || max ? { min, max } : null;
  const maximo = Math.max(0, ...dias.map((d) => d.total || 0), max, min);
  return { dias, banda, eje: escalaEje(maximo), hayCargas: dias.some((d) => d.total > 0) };
}

// ---------- Recent notes ----------
export function vistaPrevia(txt, max = 110) {
  const t = texto(txt).replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).trimEnd().replace(/[.,;:]$/, '')}…`;
}

// Newest first. `dias` = whole days before today (0 = today, never negative). destino: the whole club or one group.
export function avisosRecientes(comunicaciones, grupos, ahora, { max = 4 } = {}) {
  const hoy = fechaIso(ahora);
  const nombre = new Map((grupos || []).map((g) => [g.id, texto(g.nombre)]));
  return (comunicaciones || [])
    .map((c) => ({ ...c, fecha: texto(c.fecha).slice(0, 10) }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || texto(b.id).localeCompare(texto(a.id)))
    .slice(0, max)
    .map((c) => ({
      id: texto(c.id),
      titulo: texto(c.titulo).trim(),
      vistaPrevia: vistaPrevia(c.texto),
      fecha: c.fecha,
      dias: c.fecha ? Math.max(0, diasEntre(c.fecha, hoy)) : null,
      destino:
        c.grupoId && nombre.has(c.grupoId)
          ? { tipo: 'grupo', nombre: nombre.get(c.grupoId) }
          : { tipo: 'todos', nombre: '' },
    }));
}

// ---------- Season ----------
// First event that has not finished. `dias` until it starts (negative or 0 = already started: `enCurso`).
export function proximoEvento(eventos, ahora) {
  const hoy = fechaIso(ahora);
  const e = (eventos || [])
    .map(normalizarEvento)
    .filter((x) => x.inicio && x.nombre && (x.fin || x.inicio) >= hoy)
    .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.id.localeCompare(b.id))[0];
  if (!e) return null;
  const dias = diasEntre(hoy, e.inicio);
  return { ...e, dias, enCurso: dias <= 0 };
}

// ---------- First steps ----------
// Steps tick themselves from the data. -> {pasos: [{clave, href, hecho}], hechos, total, completo}
export function pasosIniciales({ grupos = 0, nadadores = 0, piscinas = 0, sesiones = 0 } = {}) {
  const hechos = { grupos: grupos > 0, nadadores: nadadores > 0, piscina: piscinas > 0, sesion: sesiones > 0 };
  const href = {
    grupos: '#/grupos',
    nadadores: '#/nadadores',
    piscina: '#/planificacion/piscina',
    sesion: '#/entrenamientos',
  };
  const pasos = PASOS_INICIALES.map((clave) => ({ clave, href: href[clave], hecho: hechos[clave] }));
  const n = pasos.filter((p) => p.hecho).length;
  return { pasos, hechos: n, total: pasos.length, completo: n === pasos.length };
}
