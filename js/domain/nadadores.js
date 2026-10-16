// Pure helpers about swimmer records (no DOM, no storage).
import { edadCumplida, ordenCategoria } from './categorias.js';
import { nombreCompleto, coincideBusqueda } from './nombres.js';

const FALSE_VALUES = new Set(['false', '0', 'no', 'n', 'falso', 'inactivo']);

// A swimmer is active unless `activo` is explicitly a "false-like" value.
// The stored value is the string 'true' / 'false'; spreadsheet imports may bring booleans or Spanish words.
export function esActivo(nadador) {
  if (!nadador) return false;
  const v = nadador.activo;
  if (v === false || v === 0) return false;
  return !FALSE_VALUES.has(String(v ?? '').trim().toLowerCase());
}

// ---------------------------------------------------------------------------------------------------------------------
// Swimmer list, form validation and profile summaries. Everything is pure: dates and the clock arrive as parameters.
// ---------------------------------------------------------------------------------------------------------------------
export { nombreCompleto, nombreApellidosPrimero as nombreLista, claveBusqueda as normalizarTexto } from './nombres.js';

const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'es');

// Category order (youngest first, unknown last), then surname, then name. Returns a new array.
export function ordenarNadadores(lista) {
  return [...lista].sort((a, b) => ordenCategoria(a.categoria) - ordenCategoria(b.categoria) || cmp(a.apellidos, b.apellidos) || cmp(a.nombre, b.nombre));
}

// filtros: {q, categoria, grupoId, inactivos}. Inactive swimmers only appear when `inactivos` is true.
export function filtrarNadadores(lista, { q = '', categoria = '', grupoId = '', inactivos = false } = {}) {
  return lista.filter((n) => (inactivos || esActivo(n))
    && (!categoria || n.categoria === categoria)
    && (!grupoId || n.grupoId === grupoId)
    && coincideBusqueda(`${nombreCompleto(n)} ${n.licencia || ''}`, q));
}

// Completed years on `hoyIso` ('' when the birth date is missing or invalid)
export const edadDe = (n, hoyIso) => edadCumplida(n && n.fechaNacimiento, hoyIso);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// -> [{campo, codigo}]. Codes: nombre-obligatorio, apellidos-obligatorios, email-invalido, telefono-invalido.
// The date range and the numeric limits are validated by the store (domain/validacion.js).
export function validarNadador(fila) {
  const errores = [];
  const f = fila || {};
  if (!String(f.nombre || '').trim()) errores.push({ campo: 'nombre', codigo: 'nombre-obligatorio' });
  if (!String(f.apellidos || '').trim()) errores.push({ campo: 'apellidos', codigo: 'apellidos-obligatorios' });
  const email = String(f.email || '').trim();
  if (email && !EMAIL.test(email)) errores.push({ campo: 'email', codigo: 'email-invalido' });
  const tel = String(f.telefono || '').trim();
  if (tel && (/[^\d\s+().-]/.test(tel) || tel.replace(/\D/g, '').length < 6)) errores.push({ campo: 'telefono', codigo: 'telefono-invalido' });
  return errores;
}

// Attendance records of a swimmer -> counts and percentage ("present" and "excused" count as attended).
export function resumenAsistencia(registros) {
  const cuenta = (e) => registros.filter((a) => a.estado === e).length;
  const presentes = cuenta('presente'), ausentes = cuenta('ausente'), justificados = cuenta('justificado');
  const total = registros.length;
  return { presentes, ausentes, justificados, total, porcentaje: total ? Math.round(((presentes + justificados) / total) * 100) : 0 };
}

// Most recent attendance first, each record joined with its session ({fecha, titulo}) -> [{...registro, entreno}]
export function asistenciaReciente(registros, entrenamientos, limite = 15) {
  const porId = new Map(entrenamientos.map((e) => [e.id, e]));
  return registros.map((a) => ({ ...a, entreno: porId.get(a.entrenamientoId) || {} }))
    .sort((x, y) => String(y.entreno.fecha || '').localeCompare(String(x.entreno.fecha || '')))
    .slice(0, limite);
}

const aNumero = (v) => Number(String(v ?? '').replace(',', '.')) || 0;

// Loads of a swimmer -> {sesiones, metros, rpeMedio (number|null)}
export function resumenCargas(registros) {
  const rpes = registros.map((r) => aNumero(r.rpe)).filter((x) => x > 0);
  return {
    sesiones: registros.length,
    metros: registros.reduce((s, r) => s + aNumero(r.metros), 0),
    rpeMedio: rpes.length ? rpes.reduce((s, x) => s + x, 0) / rpes.length : null,
  };
}

export const cargasRecientes = (registros, limite = 15) =>
  [...registros].sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || ''))).slice(0, limite);

// Personal bests: marks grouped by event and pool -> [{clave, prueba, piscina, lista (oldest first), mejor (ms)}]
export function marcasPorPrueba(marcas) {
  const grupos = new Map();
  marcas.filter((m) => aNumero(m.tiempoMs) > 0).forEach((m) => {
    const clave = `${m.prueba} (${m.piscina || '?'} m)`;
    if (!grupos.has(clave)) grupos.set(clave, { clave, prueba: m.prueba, piscina: m.piscina || '', lista: [] });
    grupos.get(clave).lista.push(m);
  });
  return [...grupos.values()].sort((a, b) => cmp(a.clave, b.clave)).map((g) => {
    const lista = g.lista.sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')));
    return { ...g, lista, mejor: Math.min(...lista.map((m) => aNumero(m.tiempoMs))) };
  });
}

// Chart points of a series of times (lower time = higher on the chart). -> {puntos:[[x,y]], min, max}
export function puntosEvolucion(tiempos, { ancho = 560, alto = 160, margen = 28 } = {}) {
  const min = Math.min(...tiempos), max = Math.max(...tiempos), rango = max - min || 1;
  const paso = tiempos.length > 1 ? (ancho - margen * 2) / (tiempos.length - 1) : 0;
  return { min, max, puntos: tiempos.map((v, i) => [margen + i * paso, margen + ((v - min) / rango) * (alto - margen * 2)]) };
}
