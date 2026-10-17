// Attendance rules (pure: no DOM, no store, no i18n, no clock - "today" arrives as a parameter).
// Stored states (Asistencia.estado) are neutral Spanish values: presente | ausente | justificado.
// A swimmer with NO record is "unmarked" (estado '').
import { esActivo } from './nadadores.js';
import { coincideBusqueda, ordenarPorApellidos } from './nombres.js';

export const ESTADOS = Object.freeze(['presente', 'ausente', 'justificado']);
export const esEstado = (e) => ESTADOS.includes(e);

// The two states reachable with ONE tap on the deck. "justificado" lives behind the "..." menu.
export const ESTADOS_RAPIDOS = Object.freeze(['presente', 'ausente']);

const dia = (f) => String(f ?? '').slice(0, 10);

// Result of tapping the `objetivo` button on a swimmer whose current state is `actual`:
// first tap sets it, tapping the same state again clears it (back to unmarked). No multi-state cycling.
export function estadoTrasToque(actual, objetivo) {
  if (!esEstado(objetivo)) return esEstado(actual) ? actual : '';
  return actual === objetivo ? '' : objetivo;
}

// Active swimmers that take part in a session: its group (all active swimmers if the session has no group),
// sorted by surname.
export function nadadoresDeSesion(sesion, nadadores, locale = 'es') {
  if (!sesion) return [];
  const lista = nadadores.filter((n) => esActivo(n) && (!sesion.grupoId || n.grupoId === sesion.grupoId));
  return ordenarPorApellidos(lista, locale);
}

// Counts per state of a list of records (unknown states are ignored).
export function contar(registros) {
  const c = { presente: 0, ausente: 0, justificado: 0 };
  for (const r of registros) if (esEstado(r.estado)) c[r.estado] += 1;
  return c;
}

// Roll-call summary for the sticky bar.
// -> { total, marcados, sinMarcar, presente, ausente, justificado, porcentajeMarcado }
export function resumenSesion(nadadores, registros) {
  const porNadador = new Map(registros.map((r) => [r.nadadorId, r]));
  const c = contar(nadadores.map((n) => porNadador.get(n.id)).filter(Boolean));
  const marcados = c.presente + c.ausente + c.justificado;
  const total = nadadores.length;
  return {
    total,
    marcados,
    sinMarcar: total - marcados,
    ...c,
    porcentajeMarcado: total ? Math.round((marcados / total) * 100) : 0,
  };
}

// Attendance percentage = present / sessions with a record. null when there is no record yet.
export function porcentajeAsistencia({ presente = 0, ausente = 0, justificado = 0 }) {
  const total = presente + ausente + justificado;
  return total ? Math.round((presente / total) * 100) : null;
}

// Rows to create so that every unmarked swimmer gets `estado`. Existing records are never overwritten.
export function planMarcarTodos(nadadores, registros, sesionId, estado = 'presente') {
  const con = new Set(registros.filter((r) => esEstado(r.estado)).map((r) => r.nadadorId));
  return nadadores
    .filter((n) => !con.has(n.id))
    .map((n) => ({ entrenamientoId: sesionId, nadadorId: n.id, estado, nota: '' }));
}

// ---------- Sessions ----------
const claveSesion = (s) => dia(s.fecha) + ' ' + String(s.hora || '');

// Newest first.
export function ordenarSesiones(sesiones) {
  return sesiones.slice().sort((a, b) => claveSesion(b).localeCompare(claveSesion(a)));
}

// Session to open by default: today's (the latest one), else the most recent past one, else the first (the next one).
export function sesionPorDefecto(sesiones, hoy) {
  const orden = ordenarSesiones(sesiones);
  const deHoy = orden.find((s) => dia(s.fecha) === hoy);
  if (deHoy) return deHoy.id;
  const pasada = orden.find((s) => dia(s.fecha) <= hoy);
  return (pasada || orden[orden.length - 1] || {}).id || '';
}

// Previous / next session in the displayed order (newest first). delta -1 = newer, +1 = older.
export function sesionVecina(sesiones, id, delta) {
  const orden = ordenarSesiones(sesiones);
  const i = orden.findIndex((s) => s.id === id);
  const j = i + delta;
  return i < 0 || j < 0 || j >= orden.length ? null : orden[j].id;
}

// Searchable session selector: `etiqueta(sesion)` is the text shown to the user (date, title, group...).
// The selected session is always kept so the <select> never loses its value while filtering.
export function filtrarSesiones(sesiones, consulta, etiqueta, seleccionada = '') {
  const orden = ordenarSesiones(sesiones);
  if (!String(consulta ?? '').trim()) return orden;
  return orden.filter((s) => s.id === seleccionada || coincideBusqueda(etiqueta(s), consulta));
}
export const MUCHAS_SESIONES = 10;

// ---------- History ----------
// One row per active swimmer (optionally of one group): counts, percentage and the detail of each record, newest first.
export function historial({ nadadores, sesiones, registros, grupoId = '', locale = 'es' }) {
  const sesPorId = new Map(sesiones.map((s) => [s.id, s]));
  const porNadador = new Map();
  for (const r of registros) {
    if (!sesPorId.has(r.entrenamientoId) || !esEstado(r.estado)) continue;
    if (!porNadador.has(r.nadadorId)) porNadador.set(r.nadadorId, []);
    porNadador.get(r.nadadorId).push(r);
  }
  const lista = ordenarPorApellidos(
    nadadores.filter((n) => esActivo(n) && (!grupoId || n.grupoId === grupoId)),
    locale,
  );
  return lista.map((nadador) => {
    const recs = porNadador.get(nadador.id) || [];
    const c = contar(recs);
    const detalle = recs
      .map((registro) => ({ registro, sesion: sesPorId.get(registro.entrenamientoId) }))
      .sort((a, b) => claveSesion(b.sesion).localeCompare(claveSesion(a.sesion)));
    return { nadador, ...c, total: recs.length, pct: porcentajeAsistencia(c), detalle };
  });
}
