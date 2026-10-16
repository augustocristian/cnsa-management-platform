// Dominio de la Planificación de temporada: lógica PURA (sin DOM, store, red, i18n ni reloj).
// Vocabulario: macrociclo = FASE, microciclo = SEMANA (de lunes a domingo).
//
// Hojas (valores guardados en español/neutros; la vista los traduce):
//  - Temporadas:       id, nombre, fechaInicio, fechaFin, activa, grupoId (opcional), notas
//  - Fases:            id, temporadaId, nombre, tipo, fechaInicio, fechaFin, objetivo, color, orden
//  - SemanasPlan:      id (= sp-<temporadaId>-<lunes>), temporadaId, lunes, volumenPrevisto, contenidos (JSON {tipoId: m}),
//                      intensidad (RPE previsto 1-10), objetivo, notas. Las semanas se GENERAN a partir de las fechas de la
//                      temporada (generarSemanas); sólo se guarda lo que el usuario edita.
//  - EventosTemporada: id, temporadaId, tipo, nombre, fechaInicio, fechaFin, lugar, prioridad (A|B|C), pruebas, categoria, grupoId, notas
// Fechas = 'YYYY-MM-DD'. Los volúmenes son METROS POR NADADOR y semana (igual que las cargas): con grupoId se comparan sólo las
// sesiones y nadadores de ese grupo; sin grupo, la media por grupo (planes) y por nadador (cargas).
import { fechaValida, aDias, deDias, addDias, lunesDe, diaSemana, COLOR_SIN_GRUPO } from './calendario.js';
import { normalizarNombre, indicePorNombre, agregarSemana, colorValido, ordenarTipos, PREFIJO_ID } from './cargas.js';
import { volumenPorContenido } from './desglose.js';

export { fechaValida, addDias, lunesDe };

export const TIPOS_FASE = ['preparacion-general', 'preparacion-especifica', 'competitiva', 'tapering', 'transicion', 'personalizado'];
export const COLOR_FASE = {
  'preparacion-general': '#4f7cac', 'preparacion-especifica': '#8a63b8', competitiva: '#c0592b',
  tapering: '#b0850b', transicion: '#4f8f7a', personalizado: '#6f7785',
};
export const TIPOS_EVENTO = ['competicion', 'concentracion', 'test', 'descanso', 'otro'];
export const PRIORIDADES = ['A', 'B', 'C'];
export const COLOR_PRIORIDAD = { A: '#b3261e', B: '#b45309', C: '#2f5f9e' };
export const COLOR_EVENTO = { competicion: '#b3261e', concentracion: '#5b4aa0', test: '#0b7285', descanso: '#2f7d52', otro: '#6f7785' };
export const MAX_SEMANAS = 110;
export const TOLERANCIA = 0.1; // ±10 % = "en rango"
export const PASO_M = 50; // los volúmenes calculados se redondean a 50 m
export const UMBRAL_CONTENIDO = 0.15; // sugerencias por contenido: desviación acumulada de ±15 %
export const MAX_SUGERENCIAS_CONTENIDO = 3; // sugerencias por contenido que se muestran a la vez
export const VENTANA_SUGERENCIAS = 4; // semanas ya transcurridas que se miran para sugerir

// ---------- Utilidades ----------
const str = (v) => (v == null ? '' : String(v));
const aBool = (v, d = false) => { if (v === true || v === false) return v; const s = str(v).trim().toLowerCase(); return s === '' ? d : !['false', 'no', '0', 'n'].includes(s); };
const aNum = (v) => { if (v === '' || v == null) return null; const n = Number(str(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const fechaIso = (v) => { const s = str(v).trim().slice(0, 10); return fechaValida(s) ? s : ''; };
export const redondear = (v, paso = PASO_M) => Math.max(0, Math.round(v / paso) * paso);
const suma = (a) => a.reduce((x, y) => x + y, 0);
const media = (a) => (a.length ? suma(a) / a.length : 0);
const solape = (a0, a1, b0, b1) => Math.max(0, Math.min(aDias(a1), aDias(b1)) - Math.max(aDias(a0), aDias(b0)) + 1);
export const diasEntre = (a, b) => aDias(b) - aDias(a);
export const idSemanaPlan = (temporadaId, lunes) => `sp-${temporadaId}-${lunes}`;

// ---------- Normalización ----------
export function normalizarTemporada(r = {}) {
  return {
    id: str(r.id), nombre: str(r.nombre).trim(), inicio: fechaIso(r.fechaInicio ?? r.inicio), fin: fechaIso(r.fechaFin ?? r.fin),
    activa: aBool(r.activa, false), grupoId: str(r.grupoId), notas: str(r.notas),
  };
}
export const filaTemporada = (t) => ({
  id: str(t.id), nombre: str(t.nombre).trim(), fechaInicio: fechaIso(t.inicio), fechaFin: fechaIso(t.fin), activa: t.activa ? 'true' : 'false',
  grupoId: str(t.grupoId), notas: str(t.notas),
});

export function normalizarFase(r = {}) {
  const tipo = TIPOS_FASE.includes(str(r.tipo)) ? str(r.tipo) : 'personalizado';
  const orden = aNum(r.orden);
  return {
    id: str(r.id), temporadaId: str(r.temporadaId), nombre: str(r.nombre).trim(), tipo,
    inicio: fechaIso(r.fechaInicio ?? r.inicio), fin: fechaIso(r.fechaFin ?? r.fin), objetivo: str(r.objetivo),
    color: colorValido(r.color) ? str(r.color).trim().toLowerCase() : COLOR_FASE[tipo], orden: orden == null ? 0 : orden,
  };
}
export const filaFase = (f) => ({
  id: str(f.id), temporadaId: str(f.temporadaId), nombre: str(f.nombre).trim(), tipo: TIPOS_FASE.includes(f.tipo) ? f.tipo : 'personalizado',
  fechaInicio: fechaIso(f.inicio), fechaFin: fechaIso(f.fin), objetivo: str(f.objetivo),
  color: colorValido(f.color) ? str(f.color).trim().toLowerCase() : '', orden: f.orden == null ? 0 : f.orden,
});

export function parseContenidos(v) {
  let o = v;
  if (typeof v === 'string') { try { o = v.trim() ? JSON.parse(v) : {}; } catch (e) { o = {}; } }
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    Object.keys(o).sort().forEach((k) => { const n = aNum(o[k]); if (n != null && n > 0) out[k] = n; });
  }
  return out;
}
export const sumaContenidos = (c) => suma(Object.values(c || {}));

export function normalizarSemanaPlan(r = {}) {
  const v = aNum(r.volumenPrevisto ?? r.volumen), i = aNum(r.intensidad);
  return {
    id: str(r.id), temporadaId: str(r.temporadaId), lunes: fechaIso(r.lunes),
    volumen: v != null && v >= 0 ? v : null, contenidos: parseContenidos(r.contenidos), intensidad: i != null && i >= 1 && i <= 10 ? i : null,
    objetivo: str(r.objetivo), notas: str(r.notas),
  };
}
export const filaSemanaPlan = (s) => ({
  id: s.id || idSemanaPlan(s.temporadaId, s.lunes), temporadaId: str(s.temporadaId), lunes: fechaIso(s.lunes),
  volumenPrevisto: s.volumen == null ? '' : s.volumen, contenidos: Object.keys(s.contenidos || {}).length ? JSON.stringify(parseContenidos(s.contenidos)) : '',
  intensidad: s.intensidad == null ? '' : s.intensidad, objetivo: str(s.objetivo), notas: str(s.notas),
});
export const semanaPlanVacia = (s) => s.volumen == null && !Object.keys(s.contenidos || {}).length && s.intensidad == null && !str(s.objetivo).trim() && !str(s.notas).trim();

export function normalizarEvento(r = {}) {
  const tipo = TIPOS_EVENTO.includes(str(r.tipo)) ? str(r.tipo) : 'otro';
  const inicio = fechaIso(r.fechaInicio ?? r.inicio);
  const fin = fechaIso(r.fechaFin ?? r.fin) || inicio;
  const prio = str(r.prioridad).trim().toUpperCase();
  return {
    id: str(r.id), temporadaId: str(r.temporadaId), tipo, nombre: str(r.nombre).trim(), inicio, fin, lugar: str(r.lugar).trim(),
    prioridad: PRIORIDADES.includes(prio) ? prio : '', pruebas: str(r.pruebas), categoria: str(r.categoria), grupoId: str(r.grupoId), notas: str(r.notas),
  };
}
export const filaEvento = (e) => ({
  id: str(e.id), temporadaId: str(e.temporadaId), tipo: TIPOS_EVENTO.includes(e.tipo) ? e.tipo : 'otro', nombre: str(e.nombre).trim(),
  fechaInicio: fechaIso(e.inicio), fechaFin: fechaIso(e.fin) || fechaIso(e.inicio), lugar: str(e.lugar).trim(),
  prioridad: PRIORIDADES.includes(str(e.prioridad).toUpperCase()) ? str(e.prioridad).toUpperCase() : '', pruebas: str(e.pruebas), categoria: str(e.categoria),
  grupoId: str(e.grupoId), notas: str(e.notas),
});

// ---------- Semanas ----------
// Semanas de lunes a domingo que tocan [inicio, fin]. La primera/última pueden ser parciales (desde/hasta recortan a la temporada).
export function generarSemanas(inicio, fin) {
  if (!fechaValida(inicio) || !fechaValida(fin) || fin < inicio) return [];
  const out = [];
  let lunes = lunesDe(inicio);
  for (let n = 1; lunes <= fin && n <= MAX_SEMANAS; n++, lunes = addDias(lunes, 7)) {
    const domingo = addDias(lunes, 6);
    out.push({ n, lunes, domingo, desde: lunes < inicio ? inicio : lunes, hasta: domingo > fin ? fin : domingo, parcial: lunes < inicio || domingo > fin });
  }
  return out;
}
// Semana (n) que contiene una fecha, o 0 si queda fuera.
export function semanaDeFecha(semanas, fecha) {
  const s = semanas.find((x) => fecha >= x.lunes && fecha <= x.domingo);
  return s ? s.n : 0;
}
const porInicio = (a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : (a.orden - b.orden) || a.nombre.localeCompare(b.nombre));
export const ordenarFases = (fases) => fases.slice().sort(porInicio);

// Fase que cubre más días de la semana (empate: la que empieza antes). null si ninguna.
export function faseDeSemana(fases, semana) {
  let mejor = null, dias = 0;
  ordenarFases(fases).forEach((f) => {
    if (!f.inicio || !f.fin) return;
    const d = solape(f.inicio, f.fin, semana.lunes, semana.domingo);
    if (d > dias) { dias = d; mejor = f; }
  });
  return mejor;
}
export const faseDeFecha = (fases, fecha) => ordenarFases(fases).find((f) => f.inicio && f.fin && fecha >= f.inicio && fecha <= f.fin) || null;

export function eventosDeSemana(eventos, semana) {
  return eventos.filter((e) => e.inicio && e.fin && e.inicio <= semana.domingo && e.fin >= semana.lunes)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.nombre.localeCompare(b.nombre)));
}
export const prioridadMayor = (eventos) => {
  const comp = eventos.filter((e) => e.tipo === 'competicion' && e.prioridad);
  return PRIORIDADES.find((p) => comp.some((e) => e.prioridad === p)) || '';
};
export function proximaCompeticion(eventos, hoy) {
  return eventos.filter((e) => e.tipo === 'competicion' && e.fin >= hoy).sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))[0] || null;
}

// ---------- Validaciones ----------
// Códigos de error [{campo, codigo}] (la vista los traduce con tp.err.<codigo>). Vacío = válido.
export function validarTemporada(d) {
  const e = [];
  if (!str(d.nombre).trim()) e.push({ campo: 'nombre', codigo: 'nombre-vacio' });
  else if (str(d.nombre).trim().length > 80) e.push({ campo: 'nombre', codigo: 'nombre-largo' });
  const i = fechaValida(str(d.inicio)), f = fechaValida(str(d.fin));
  if (!i) e.push({ campo: 'inicio', codigo: 'fecha-invalida' });
  if (!f) e.push({ campo: 'fin', codigo: 'fecha-invalida' });
  if (i && f) {
    if (d.fin < d.inicio) e.push({ campo: 'fin', codigo: 'fin-antes-inicio' });
    else if (generarSemanas(d.inicio, d.fin).length >= MAX_SEMANAS && diasEntre(lunesDe(d.inicio), d.fin) >= MAX_SEMANAS * 7) e.push({ campo: 'fin', codigo: 'duracion-excesiva' });
  }
  return e;
}
export function validarFase(d) {
  const e = [];
  if (!str(d.nombre).trim()) e.push({ campo: 'nombre', codigo: 'nombre-vacio' });
  else if (str(d.nombre).trim().length > 60) e.push({ campo: 'nombre', codigo: 'nombre-largo' });
  if (!TIPOS_FASE.includes(str(d.tipo))) e.push({ campo: 'tipo', codigo: 'tipo-invalido' });
  const i = fechaValida(str(d.inicio)), f = fechaValida(str(d.fin));
  if (!i) e.push({ campo: 'inicio', codigo: 'fecha-invalida' });
  if (!f) e.push({ campo: 'fin', codigo: 'fecha-invalida' });
  if (i && f && d.fin < d.inicio) e.push({ campo: 'fin', codigo: 'fin-antes-inicio' });
  if (str(d.color).trim() && !colorValido(d.color)) e.push({ campo: 'color', codigo: 'color-invalido' });
  return e;
}
export function validarEvento(d) {
  const e = [];
  if (!str(d.nombre).trim()) e.push({ campo: 'nombre', codigo: 'nombre-vacio' });
  else if (str(d.nombre).trim().length > 100) e.push({ campo: 'nombre', codigo: 'nombre-largo' });
  if (!TIPOS_EVENTO.includes(str(d.tipo))) e.push({ campo: 'tipo', codigo: 'tipo-invalido' });
  const i = fechaValida(str(d.inicio)), f = !str(d.fin).trim() || fechaValida(str(d.fin));
  if (!i) e.push({ campo: 'inicio', codigo: 'fecha-invalida' });
  if (!f) e.push({ campo: 'fin', codigo: 'fecha-invalida' });
  if (i && f && str(d.fin).trim() && d.fin < d.inicio) e.push({ campo: 'fin', codigo: 'fin-antes-inicio' });
  const p = str(d.prioridad).trim().toUpperCase();
  if (d.tipo === 'competicion' && !PRIORIDADES.includes(p)) e.push({ campo: 'prioridad', codigo: 'prioridad-requerida' });
  else if (p && !PRIORIDADES.includes(p)) e.push({ campo: 'prioridad', codigo: 'prioridad-invalida' });
  return e;
}
export function validarSemanaPlan(d) {
  const e = [];
  const v = str(d.volumen).trim() === '' ? null : aNum(d.volumen);
  if (str(d.volumen).trim() !== '' && (v == null || v < 0)) e.push({ campo: 'volumen', codigo: 'volumen-invalido' });
  const i = str(d.intensidad).trim() === '' ? null : aNum(d.intensidad);
  if (str(d.intensidad).trim() !== '' && (i == null || i < 1 || i > 10)) e.push({ campo: 'intensidad', codigo: 'intensidad-invalida' });
  Object.values(d.contenidos || {}).forEach((x) => { if (str(x).trim() !== '' && (aNum(x) == null || aNum(x) < 0)) e.push({ campo: 'contenidos', codigo: 'contenido-invalido' }); });
  return e;
}

// Incoherencias de la planificación -> [{tipo, severidad: error|aviso|info, params, ...ids}]; la vista traduce tp.v.<tipo>.
//  error: fases solapadas · aviso: huecos sin fase, fase fuera de la temporada, evento fuera de la temporada · info: sin fases
export function validarPlan({ temporada, fases = [], eventos = [] }) {
  const out = [];
  if (!temporada || !temporada.inicio || !temporada.fin) return out;
  const fs = ordenarFases(fases.filter((f) => f.inicio && f.fin && f.fin >= f.inicio));
  if (!fs.length) { out.push({ tipo: 'sin-fases', severidad: 'info', params: {} }); return out; }
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      if (fs[j].inicio > fs[i].fin) break;
      const desde = fs[j].inicio, hasta = fs[i].fin < fs[j].fin ? fs[i].fin : fs[j].fin;
      out.push({ tipo: 'fases-solapadas', severidad: 'error', faseIds: [fs[i].id, fs[j].id], params: { a: fs[i].nombre, b: fs[j].nombre, desde, hasta, dias: solape(desde, hasta, desde, hasta) } });
    }
  }
  fs.forEach((f) => {
    if (f.inicio < temporada.inicio || f.fin > temporada.fin) out.push({ tipo: 'fase-fuera-temporada', severidad: 'aviso', faseIds: [f.id], params: { fase: f.nombre, desde: f.inicio, hasta: f.fin } });
  });
  // Huecos: tramos de la temporada que ninguna fase cubre.
  let cubierto = addDias(temporada.inicio, -1);
  const hueco = (desde, hasta) => {
    const sem = generarSemanas(desde, hasta).length;
    out.push({ tipo: 'hueco-fases', severidad: 'aviso', params: { desde, hasta, dias: diasEntre(desde, hasta) + 1, semanas: sem } });
  };
  fs.forEach((f) => {
    if (f.fin < temporada.inicio || f.inicio > temporada.fin) return;
    const ini = f.inicio < temporada.inicio ? temporada.inicio : f.inicio;
    if (ini > addDias(cubierto, 1)) hueco(addDias(cubierto, 1), addDias(ini, -1));
    const fin = f.fin > temporada.fin ? temporada.fin : f.fin;
    if (fin > cubierto) cubierto = fin;
  });
  if (cubierto < temporada.fin) hueco(addDias(cubierto, 1), temporada.fin);
  eventos.forEach((ev) => {
    if (ev.inicio && (ev.inicio < temporada.inicio || (ev.fin || ev.inicio) > temporada.fin)) out.push({ tipo: 'evento-fuera-temporada', severidad: 'aviso', eventoId: ev.id, params: { evento: ev.nombre, desde: ev.inicio } });
  });
  return out;
}
export const hayErrores = (lista) => lista.some((v) => v.severidad === 'error');

// Fases solapadas con una candidata (para bloquear/avisar antes de guardar). -> fases[]
export function fasesQueSolapan(candidata, fases) {
  if (!candidata.inicio || !candidata.fin) return [];
  return fases.filter((f) => f.id !== candidata.id && f.inicio && f.fin && f.inicio <= candidata.fin && f.fin >= candidata.inicio);
}
export function eventoFuera(evento, temporada) {
  return !!(temporada && temporada.inicio && evento.inicio && (evento.inicio < temporada.inicio || (evento.fin || evento.inicio) > temporada.fin));
}

// Fases por defecto (preparación general/específica, competitiva, tapering y transición) repartidas en semanas completas.
// nombrePorTipo(tipo) lo pone la capa que conoce el idioma. -> [{nombre, tipo, inicio, fin, color, objetivo, orden}]
export function fasesPorDefecto(inicio, fin, nombrePorTipo = (t) => t) {
  const sem = generarSemanas(inicio, fin);
  const N = sem.length;
  const mk = (tipo, a, b, orden) => ({ nombre: nombrePorTipo(tipo), tipo, inicio: a === 0 ? inicio : sem[a].lunes, fin: b === N - 1 ? fin : sem[b].domingo, color: COLOR_FASE[tipo], objetivo: '', orden });
  if (N < 5) return N ? [mk('personalizado', 0, N - 1, 1)] : [];
  const taper = N >= 12 ? 2 : 1;
  const trans = Math.max(1, Math.round(N * 0.12));
  const resto = N - taper - trans;
  const gen = Math.max(1, Math.round(resto * 0.35)), esp = Math.max(1, Math.round(resto * 0.35)), comp = Math.max(1, resto - gen - esp);
  const largos = [['preparacion-general', gen], ['preparacion-especifica', esp], ['competitiva', comp], ['tapering', taper], ['transicion', trans]];
  const out = [];
  let k = 0;
  largos.forEach(([tipo, n], i) => { if (k >= N) return; const b = i === largos.length - 1 ? N - 1 : Math.min(N - 1, k + n - 1); out.push(mk(tipo, k, b, i + 1)); k = b + 1; });
  return out;
}

// ---------- Clasificación de las líneas de un plan de entreno por contenido ----------
const REGLAS_CONTENIDO = [
  ['aerobico-ligero', /calentamiento|vuelta a la calma|recuperacion|regenerativ|suave|soltar|enfriamiento|activacion|ligero/],
  ['aerobico-intenso', /aerobico intenso|potencia aerobica|vo2/],
  ['anaerobico', /anaerobico|lactato|lactic/],
  ['alactico', /alactico|sprint|velocidad|explosiv|maxima/],
  ['aerobico-medio', /umbral|aerobico|resistencia|\bcss\b|fondo|ritmo/],
  ['piernas', /pierna|patada|batido/],
  ['brazos', /brazo|traccion|\bpull\b|palas/],
  ['tecnica', /tecnic|\btec\b|drill/],
  ['salidas', /salida|poyete/],
  ['virajes', /viraje|volteo/],
];
// Texto libre (objetivo/bloque del plan) -> id del contenido del catálogo, o ''.
export function clasificarContenido(texto, tipos) {
  const k = normalizarNombre(texto);
  if (!k) return '';
  const idx = indicePorNombre(tipos);
  if (idx.has(k)) return idx.get(k).id;
  const custom = tipos.find((t) => !t.predefinido && t.activo && normalizarNombre(t.nombre).length >= 3 && k.includes(normalizarNombre(t.nombre)));
  if (custom) return custom.id;
  for (const [clave, re] of REGLAS_CONTENIDO) {
    if (re.test(k)) { const t = tipos.find((x) => x.id === PREFIJO_ID + clave) || idx.get(normalizarNombre(clave)); return t ? t.id : ''; }
  }
  return '';
}

// Metros de una sesión por contenido a partir de sus líneas (delega en desglose.volumenPorContenido: respeta el reparto por
// componentes de cada fila; las filas antiguas sin componentes usan su objetivo y heredan el de la fila anterior del set).
// -> {total, metros: {tipoId: m}, sinClasificar}
export function volumenPlanSesion(lineas, tipos) {
  const v = volumenPorContenido([lineas || []], { tipos });
  return { total: v.totalM, metros: v.metros, sinClasificar: v.sinClasificar };
}

const volumenEstimado = (s) => {
  const a = aNum(s.volumenMin), b = aNum(s.volumenMax);
  if (a != null && b != null && a + b > 0) return (a + b) / 2;
  return Math.max(0, a || b || 0);
};
const cero = (tipos) => Object.fromEntries(tipos.map((t) => [t.id, 0]));

// ---------- Agregados reales ----------
// Planes de entreno (Entrenamientos + EntrenoLineas, realizados y planificados) de [desde, hasta].
// Sin grupo: media por grupo con sesiones. Una sesión sin líneas usa la media de su volumen objetivo (sin clasificar).
// -> {total, metros, sinClasificar, sesiones, realizadas, planificadas, estimadas, grupos}
export function agregarPlanes({ sesiones, lineasPorSesion, tipos, desde, hasta, grupoId = '' }) {
  const metros = cero(tipos);
  let sin = 0, total = 0, n = 0, realizadas = 0, estimadas = 0;
  const grupos = new Set();
  (sesiones || []).forEach((s) => {
    const f = str(s.fecha).slice(0, 10);
    if (f < desde || f > hasta || (grupoId && str(s.grupoId) !== grupoId)) return;
    n++; if (str(s.estado) === 'realizado') realizadas++;
    grupos.add(str(s.grupoId));
    const v = volumenPlanSesion(lineasPorSesion.get(str(s.id)) || [], tipos);
    if (v.total > 0) { total += v.total; sin += v.sinClasificar; Object.keys(v.metros).forEach((k) => { if (k in metros) metros[k] += v.metros[k]; else sin += v.metros[k]; }); } else {
      const est = volumenEstimado(s);
      if (est > 0) { estimadas++; total += est; sin += est; }
    }
  });
  const div = grupoId ? 1 : Math.max(1, grupos.size);
  Object.keys(metros).forEach((k) => { metros[k] /= div; });
  return { total: total / div, metros, sinClasificar: sin / div, sesiones: n, realizadas, planificadas: n - realizadas, estimadas, grupos: grupos.size };
}

// Cargas registradas (media por nadador con carga esa semana; con grupo, sólo los nadadores de ese grupo).
export function agregarCargas({ cargas, nadadores, tipos, desde, hasta, grupoId = '' }) {
  let lista = cargas || [];
  if (grupoId) { const ids = new Set((nadadores || []).filter((n) => str(n.grupoId) === grupoId).map((n) => n.id)); lista = lista.filter((c) => ids.has(str(c.nadadorId))); }
  const a = agregarSemana({ cargas: lista, tipos, desde, hasta });
  return { total: a.total, metros: a.metros, sinClasificar: a.sinClasificar, nadadores: a.nadadores };
}

// ---------- Desviaciones ----------
// Estado: 'sin-previsto' | 'en-rango' | 'bajo' | 'alto'. pct en % (null sin previsto).
export function desviacion(previsto, real, tolerancia = TOLERANCIA) {
  const p = Number(previsto) || 0, r = Number(real) || 0;
  if (!(p > 0)) return { abs: r, pct: null, estado: 'sin-previsto' };
  const abs = r - p;
  return { abs, pct: (abs / p) * 100, estado: Math.abs(abs) / p <= tolerancia + 1e-9 ? 'en-rango' : abs < 0 ? 'bajo' : 'alto' };
}

// ---------- Resumen semana a semana ----------
// Entrada: temporada, fases, semanasPlan (normalizadas), eventos, tipos, sesiones/lineas/cargas/nadadores (filas crudas), hoy,
//          fuente ('auto' | 'planes' | 'cargas'), tolerancia.
// Salida: [{ n, lunes, domingo, desde, hasta, parcial, fase, plan:{id, volumen, contenidos, intensidad, objetivo, notas},
//            planes, cargas, real:{total, metros, sinClasificar, fuente: 'cargas'|'planes'|'ninguna'}, desv, contenidos:[{tipo, previsto, real, desv}],
//            eventos, prioridad, tiempo: 'pasada'|'actual'|'futura', estado, acumPrevisto, acumReal }]
export function resumenSemanas({ temporada, fases = [], semanasPlan = [], eventos = [], tipos = [], sesiones = [], lineas = [], cargas = [], nadadores = [], hoy = '', fuente = 'auto', tolerancia = TOLERANCIA }) {
  const semanas = generarSemanas(temporada.inicio, temporada.fin);
  const lineasPorSesion = new Map();
  lineas.forEach((l) => { const k = str(l.entrenamientoId); if (!lineasPorSesion.has(k)) lineasPorSesion.set(k, []); lineasPorSesion.get(k).push(l); });
  const planPorLunes = new Map(semanasPlan.map((p) => [p.lunes, p]));
  const orden = ordenarTipos(tipos);
  let acumP = 0, acumR = 0;
  return semanas.map((s) => {
    const sp = planPorLunes.get(s.lunes) || null;
    const plan = sp ? { id: sp.id, volumen: sp.volumen, contenidos: sp.contenidos, intensidad: sp.intensidad, objetivo: sp.objetivo, notas: sp.notas } : { id: '', volumen: null, contenidos: {}, intensidad: null, objetivo: '', notas: '' };
    const tiempo = hoy && s.domingo < hoy ? 'pasada' : hoy && s.lunes <= hoy ? 'actual' : 'futura';
    const planes = agregarPlanes({ sesiones, lineasPorSesion, tipos, desde: s.desde, hasta: s.hasta, grupoId: temporada.grupoId });
    const cg = agregarCargas({ cargas, nadadores, tipos, desde: s.desde, hasta: s.hasta, grupoId: temporada.grupoId });
    let origen = 'ninguna';
    if (fuente === 'cargas') origen = cg.total > 0 ? 'cargas' : 'ninguna';
    else if (fuente === 'planes') origen = planes.total > 0 ? 'planes' : 'ninguna';
    else origen = cg.total > 0 ? 'cargas' : planes.total > 0 ? 'planes' : 'ninguna';
    const base = origen === 'cargas' ? cg : origen === 'planes' ? planes : { total: 0, metros: cero(tipos), sinClasificar: 0 };
    const real = { total: base.total, metros: base.metros, sinClasificar: base.sinClasificar, fuente: origen };
    const desv = desviacion(plan.volumen, real.total, tolerancia);
    let estado = desv.estado;
    if (estado !== 'sin-previsto') {
      if (origen === 'ninguna' && tiempo !== 'pasada') estado = 'pendiente';
      else if (tiempo === 'actual' && origen === 'cargas' && estado === 'bajo') estado = 'en-curso';
    }
    const pendiente = estado === 'pendiente';
    const contenidoDesv = (previsto, r) => {
      if (pendiente && previsto > 0) return { abs: 0, pct: null, estado: 'pendiente' };
      const dv = desviacion(previsto, r, tolerancia);
      return tiempo === 'actual' && origen === 'cargas' && dv.estado === 'bajo' ? { ...dv, estado: 'en-curso' } : dv;
    };
    const filas = orden.filter((t) => t.activo || (plan.contenidos[t.id] || 0) > 0 || (real.metros[t.id] || 0) > 0).map((tipo) => {
      const previsto = plan.contenidos[tipo.id] || 0, r = real.metros[tipo.id] || 0;
      return { tipo, previsto, real: r, desv: contenidoDesv(previsto, r) };
    }).filter((c) => c.previsto > 0 || c.real > 0);
    const evs = eventosDeSemana(eventos, s);
    const empezada = tiempo !== 'futura';
    acumP += plan.volumen || 0;
    if (empezada) acumR += real.total;
    return {
      ...s, fase: faseDeSemana(fases, s), plan, planes, cargas: cg, real, desv: { ...desv, estado, pct: pendiente ? null : desv.pct }, contenidos: filas, eventos: evs, prioridad: prioridadMayor(evs),
      tiempo, estado, acumPrevisto: acumP, acumReal: empezada ? acumR : null,
    };
  });
}

// Totales por fase y de toda la temporada. "real" sólo suma las semanas ya empezadas y se compara con el previsto de ESAS semanas.
// -> { fases: [{fase, semanas, previsto, previstoHastaHoy, real, desv, contenidos:{tipoId:{previsto, real}}}], total: {...} }
export function totales(semanas, fases, tolerancia = TOLERANCIA) {
  const calc = (lista) => {
    const emp = lista.filter((s) => s.tiempo !== 'futura');
    const previsto = suma(lista.map((s) => s.plan.volumen || 0));
    const previstoHastaHoy = suma(emp.map((s) => s.plan.volumen || 0));
    const real = suma(emp.map((s) => s.real.total));
    const cont = {};
    lista.forEach((s) => s.contenidos.forEach((c) => {
      const o = (cont[c.tipo.id] ||= { previsto: 0, real: 0 });
      o.previsto += c.previsto;
      if (s.tiempo !== 'futura') o.real += c.real;
    }));
    return { semanas: lista.length, previsto, previstoHastaHoy, real, desv: desviacion(previstoHastaHoy, real, tolerancia), contenidos: cont };
  };
  const ids = new Set(semanas.map((s) => (s.fase ? s.fase.id : '')));
  const lista = ordenarFases(fases).filter((f) => ids.has(f.id)).map((fase) => ({ fase, ...calc(semanas.filter((s) => s.fase && s.fase.id === fase.id)) }));
  const sinFase = semanas.filter((s) => !s.fase);
  if (sinFase.length) lista.push({ fase: null, ...calc(sinFase) });
  return { fases: lista, total: calc(semanas) };
}

// ---------- Sugerencias (reglas simples y transparentes) ----------
// REDUCCION_PREVIA: % de variación del volumen base en las semanas previas a una competición (índice = semanas antes).
export const REDUCCION_PREVIA = { A: { 2: -15, 1: -30 }, B: { 1: -15 } };
export const factoresTapering = (m) => (m <= 1 ? [0.65] : Array.from({ length: m }, (_, j) => 0.8 - 0.3 * (j / (m - 1))));
const baseAntes = (semanas, idx, n = 3) => {
  const v = semanas.slice(Math.max(0, idx - n), idx).map((s) => s.plan.volumen).filter((x) => x > 0);
  return v.length ? media(v) : 0;
};

// -> [{id, codigo, severidad, semana, params, accion}] ; accion: {tipo: 'fijar'|'anadir-contenido'|'plantilla', semana, volumen?, tipoId?, metros?}
export function sugerencias({ semanas, tipos = [], hoy = '', tolerancia = TOLERANCIA, ventana = VENTANA_SUGERENCIAS }) {
  const out = [];
  const futuras = semanas.filter((s) => s.domingo >= hoy);
  // 1) Contenidos acumulados en las últimas semanas ya cerradas.
  const pasadas = semanas.filter((s) => s.tiempo === 'pasada').slice(-ventana);
  const destino = futuras.find((s) => s.tiempo === 'futura') || futuras[0];
  if (pasadas.length) {
    const acum = {};
    pasadas.forEach((s) => s.contenidos.forEach((c) => { const o = (acum[c.tipo.id] ||= { tipo: c.tipo, previsto: 0, real: 0 }); o.previsto += c.previsto; o.real += c.real; }));
    const candidatas = Object.values(acum).filter((o) => o.previsto >= 500 && Math.abs((o.real - o.previsto) / o.previsto) >= UMBRAL_CONTENIDO)
      .sort((a, b) => Math.abs(b.real - b.previsto) - Math.abs(a.real - a.previsto)).slice(0, MAX_SUGERENCIAS_CONTENIDO); // las 3 mayores desviaciones
    candidatas.sort((a, b) => a.tipo.orden - b.tipo.orden).forEach((o) => {
      const pct = ((o.real - o.previsto) / o.previsto) * 100;
      if (Math.abs(pct) < UMBRAL_CONTENIDO * 100) return;
      const dif = o.real - o.previsto; // <0: falta
      const metros = redondear(Math.abs(dif) / Math.max(1, Math.min(2, futuras.length)));
      out.push({
        id: `contenido-${dif < 0 ? 'bajo' : 'alto'}-${o.tipo.id}`, codigo: dif < 0 ? 'contenido-bajo' : 'contenido-alto', severidad: 'aviso', semana: destino ? destino.n : null,
        params: { tipoId: o.tipo.id, pct: Math.round(pct), previsto: Math.round(o.previsto), real: Math.round(o.real), semanas: pasadas.length, metros },
        accion: destino && metros > 0 ? { tipo: 'anadir-contenido', semana: destino.n, tipoId: o.tipo.id, metros: dif < 0 ? metros : -metros } : null,
      });
    });
  }
  // 2) Semanas previas a una competición A/B y 3) tapering.
  const objetivo = new Map(); // n -> sugerencia (gana la reducción más fuerte)
  const proponer = (s, idx, base, pct, extra) => {
    if (!(s.plan.volumen > 0) || s.domingo < hoy || !(base > 0)) return;
    const volumen = redondear(base * (1 + pct / 100));
    if (s.plan.volumen <= volumen * (1 + tolerancia)) return;
    const previa = objetivo.get(s.n);
    if (previa && previa.accion.volumen <= volumen) return;
    objetivo.set(s.n, {
      id: `${extra.codigo}-${s.n}`, severidad: 'aviso', semana: s.n,
      params: { ...extra.params, base: Math.round(base), previsto: s.plan.volumen, objetivo: volumen, pct: Math.round(pct), semana: s.n },
      codigo: extra.codigo, accion: { tipo: 'fijar', semana: s.n, volumen },
    });
  };
  semanas.forEach((s, k) => {
    s.eventos.filter((e) => e.tipo === 'competicion' && REDUCCION_PREVIA[e.prioridad] && e.inicio >= s.lunes).forEach((e) => {
      if (semanas.findIndex((x) => x.lunes <= e.inicio && x.domingo >= e.inicio) !== k) return;
      const mapa = REDUCCION_PREVIA[e.prioridad];
      const lejos = Math.max(...Object.keys(mapa).map(Number));
      Object.keys(mapa).forEach((antes) => {
        const idx = k - Number(antes);
        if (idx < 0 || (semanas[idx].fase && semanas[idx].fase.tipo === 'tapering')) return;
        proponer(semanas[idx], idx, baseAntes(semanas, k - lejos), mapa[antes], { codigo: 'previa-competicion', params: { evento: e.nombre, prioridad: e.prioridad, antes: Number(antes) } });
      });
    });
  });
  const vistas = new Set();
  semanas.forEach((s) => {
    if (!s.fase || s.fase.tipo !== 'tapering' || vistas.has(s.fase.id)) return;
    vistas.add(s.fase.id);
    const idxs = semanas.map((x, i) => (x.fase && x.fase.id === s.fase.id ? i : -1)).filter((i) => i >= 0);
    const base = baseAntes(semanas, idxs[0]);
    const f = factoresTapering(idxs.length);
    idxs.forEach((i, j) => proponer(semanas[i], i, base, (f[j] - 1) * 100, { codigo: 'tapering', params: { fase: s.fase.nombre } }));
  });
  out.push(...[...objetivo.values()].sort((a, b) => a.semana - b.semana));
  // 4) Semanas futuras sin volumen previsto.
  const sinPrevisto = futuras.filter((s) => !(s.plan.volumen > 0));
  if (sinPrevisto.length) out.push({ id: 'sin-previsto', codigo: 'sin-previsto', severidad: 'info', semana: sinPrevisto[0].n, params: { n: sinPrevisto.length, primera: sinPrevisto[0].n }, accion: null });
  return out;
}

// ---------- Herramientas de edición del plan (devuelven cambios; no escriben) ----------
// Campos de plan que se copian entre semanas.
export const copiarPlanSemana = (plan) => ({ volumen: plan.volumen, contenidos: { ...plan.contenidos }, intensidad: plan.intensidad, objetivo: plan.objetivo, notas: plan.notas });

const escalarContenidos = (c, f) => Object.fromEntries(Object.entries(c || {}).map(([k, v]) => [k, redondear(v * f)]).filter(([, v]) => v > 0));
// Escala (± %) el volumen previsto (y su reparto) de las semanas n en [desde, hasta]. Sólo cambia las que tienen volumen.
// -> [{n, lunes, antes, despues, contenidos}]
export function ajustarVolumenes(semanas, { desde, hasta, pct }) {
  const f = 1 + (Number(pct) || 0) / 100;
  if (f < 0) return [];
  return semanas.filter((s) => s.n >= desde && s.n <= hasta && s.plan.volumen > 0).map((s) => ({
    n: s.n, lunes: s.lunes, antes: s.plan.volumen, despues: redondear(s.plan.volumen * f), contenidos: escalarContenidos(s.plan.contenidos, f),
  }));
}
// Mueve k semanas (+ más tarde, - antes) el plan (volumen, reparto e intensidad) de las semanas [desde, hasta].
// Las semanas de origen que no reciben nada quedan vacías. -> [{n, lunes, antes, despues, contenidos, intensidad}] sólo con cambios
export function desplazarPlan(semanas, { desde, hasta, k }) {
  const mov = Math.round(Number(k) || 0);
  if (!mov) return [];
  const nuevo = new Map();
  const origen = semanas.filter((s) => s.n >= desde && s.n <= hasta);
  origen.forEach((s) => nuevo.set(s.n, { volumen: null, contenidos: {}, intensidad: null }));
  origen.forEach((s) => {
    const dest = semanas.find((x) => x.n === s.n + mov);
    if (!dest || (!(s.plan.volumen > 0) && s.plan.intensidad == null && !Object.keys(s.plan.contenidos).length)) return;
    nuevo.set(dest.n, { volumen: s.plan.volumen, contenidos: { ...s.plan.contenidos }, intensidad: s.plan.intensidad });
  });
  return [...nuevo.entries()].sort((a, b) => a[0] - b[0]).map(([n, v]) => {
    const s = semanas.find((x) => x.n === n);
    return { n, lunes: s.lunes, antes: s.plan.volumen, despues: v.volumen, contenidos: v.contenidos, intensidad: v.intensidad };
  }).filter((c) => c.antes !== c.despues);
}

// Plantillas por tipo de fase: ondulación del volumen (ciclo de semanas respecto a la base), intensidad (RPE) y reparto por contenido (%).
export const PLANTILLAS_FASE = {
  'preparacion-general': { ciclo: [0.9, 1, 1.08, 0.75], intensidad: 5, reparto: { 'aerobico-ligero': 20, 'aerobico-medio': 35, 'aerobico-intenso': 8, alactico: 2, piernas: 10, brazos: 5, tecnica: 12, salidas: 3, virajes: 5 } },
  'preparacion-especifica': { ciclo: [0.95, 1.05, 1.12, 0.8], intensidad: 6, reparto: { 'aerobico-ligero': 15, 'aerobico-medio': 28, 'aerobico-intenso': 15, anaerobico: 8, alactico: 4, piernas: 8, brazos: 4, tecnica: 8, salidas: 5, virajes: 5 } },
  competitiva: { ciclo: [1, 0.95, 1.02, 0.85], intensidad: 7, reparto: { 'aerobico-ligero': 18, 'aerobico-medio': 18, 'aerobico-intenso': 14, anaerobico: 12, alactico: 8, piernas: 6, brazos: 3, tecnica: 7, salidas: 8, virajes: 6 } },
  tapering: { ciclo: null, intensidad: 6, reparto: { 'aerobico-ligero': 28, 'aerobico-medio': 14, 'aerobico-intenso': 14, anaerobico: 8, alactico: 14, piernas: 4, brazos: 2, tecnica: 6, salidas: 6, virajes: 4 } },
  transicion: { ciclo: [0.5, 0.4], intensidad: 3, reparto: { 'aerobico-ligero': 55, 'aerobico-medio': 15, piernas: 8, brazos: 4, tecnica: 14, virajes: 4 } },
  personalizado: { ciclo: [1], intensidad: 5, reparto: { 'aerobico-ligero': 20, 'aerobico-medio': 35, 'aerobico-intenso': 8, alactico: 2, piernas: 10, brazos: 5, tecnica: 12, salidas: 3, virajes: 5 } },
};

// Reparte `volumen` entre los contenidos activos del catálogo según los porcentajes (renormalizados); el último absorbe el redondeo.
export function repartirVolumen(volumen, reparto, tipos) {
  const items = Object.entries(reparto).map(([clave, pct]) => ({ id: PREFIJO_ID + clave, pct })).filter((x) => tipos.some((t) => t.id === x.id && t.activo) && x.pct > 0);
  const tot = suma(items.map((x) => x.pct));
  if (!(volumen > 0) || !tot) return {};
  const out = {};
  let resto = redondear(volumen);
  items.forEach((x, i) => {
    const v = i === items.length - 1 ? resto : Math.min(resto, redondear((volumen * x.pct) / tot));
    if (v > 0) out[x.id] = v;
    resto -= v;
  });
  return out;
}

// Volumen base sugerido para una fase: media previsto de la fase, o de las 3 semanas previas, o la real reciente.
export function volumenBaseSugerido(semanas, nIni, nFin) {
  const dentro = semanas.filter((s) => s.n >= nIni && s.n <= nFin && s.plan.volumen > 0).map((s) => s.plan.volumen);
  if (dentro.length) return redondear(media(dentro));
  const antes = baseAntes(semanas, Math.max(0, nIni - 1));
  if (antes > 0) return redondear(antes);
  const reales = semanas.filter((s) => s.tiempo !== 'futura' && s.real.total > 0).slice(-4).map((s) => s.real.total);
  return reales.length ? redondear(media(reales)) : 0;
}

// Aplica una plantilla de fase a las semanas [nIni, nFin]: volumen ondulado sobre `volumenBase`, reparto por contenido e intensidad.
// -> [{n, lunes, volumen, contenidos, intensidad}]
export function aplicarPlantillaFase(semanas, { nIni, nFin, tipo = 'personalizado', volumenBase, tipos }) {
  const pl = PLANTILLAS_FASE[tipo] || PLANTILLAS_FASE.personalizado;
  const lista = semanas.filter((s) => s.n >= nIni && s.n <= nFin);
  const factores = pl.ciclo ? null : factoresTapering(lista.length);
  return lista.map((s, i) => {
    const f = pl.ciclo ? pl.ciclo[i % pl.ciclo.length] : factores[i];
    const volumen = redondear(volumenBase * f);
    return { n: s.n, lunes: s.lunes, volumen, contenidos: repartirVolumen(volumen, pl.reparto, tipos), intensidad: pl.intensidad };
  });
}

// Aplica una sugerencia (accion) a las semanas -> {n, lunes, volumen, contenidos} con el plan resultante, o null.
export function aplicarAccion(semanas, accion) {
  const s = accion && semanas.find((x) => x.n === accion.semana);
  if (!s) return null;
  if (accion.tipo === 'fijar') {
    const f = s.plan.volumen > 0 ? accion.volumen / s.plan.volumen : 1;
    return { n: s.n, lunes: s.lunes, volumen: accion.volumen, contenidos: escalarContenidos(s.plan.contenidos, f) };
  }
  if (accion.tipo === 'anadir-contenido') {
    const contenidos = { ...s.plan.contenidos };
    contenidos[accion.tipoId] = Math.max(0, (contenidos[accion.tipoId] || 0) + accion.metros);
    if (!(contenidos[accion.tipoId] > 0)) delete contenidos[accion.tipoId];
    return { n: s.n, lunes: s.lunes, volumen: Math.max(0, (s.plan.volumen || 0) + accion.metros), contenidos };
  }
  return null;
}

// ---------- Eventos en el calendario ----------
export const ETQ_TEMPORADA = {
  tipoEvento: (t) => ({ competicion: 'Competición', concentracion: 'Concentración', test: 'Test', descanso: 'Descanso', otro: 'Evento' }[t] || t),
  prioridad: (p) => `Prioridad ${p}`, pruebas: 'Pruebas', categoria: 'Categoría', dia: (i, n) => `Día ${i} de ${n}`,
};
// Genera los eventos de día completo de EventosTemporada (uno por día) para el calendario y el .ics.
export function eventosDeTemporada(datos, rango, etq = {}) {
  const e = { ...ETQ_TEMPORADA, ...etq };
  const grupos = datos.Grupos || [];
  const out = [];
  (datos.EventosTemporada || []).map(normalizarEvento).forEach((ev) => {
    if (!ev.inicio || !ev.nombre) return;
    const fin = ev.fin < ev.inicio ? ev.inicio : ev.fin;
    const n = diasEntre(ev.inicio, fin) + 1;
    const g = grupos.find((x) => x.id === ev.grupoId);
    const desde = ev.inicio < rango.desde ? rango.desde : ev.inicio, hasta = fin > rango.hasta ? rango.hasta : fin;
    for (let f = desde; f <= hasta && n <= 60; f = addDias(f, 1)) {
      const i = diasEntre(ev.inicio, f) + 1;
      out.push({
        id: `temp-${ev.id}-${f}`, origen: 'temporada', tipoEvento: ev.tipo, prioridad: ev.prioridad, fecha: f, hora: '', duracionMin: 0,
        titulo: ev.tipo === 'competicion' && ev.prioridad ? `${ev.nombre} (${ev.prioridad})` : ev.nombre,
        grupoId: ev.grupoId, grupoNombre: g ? g.nombre : '', piscina: '', piscinaNombre: ev.lugar, calle: '', enfoque: '', volumenMin: '', volumenMax: '',
        descripcion: [e.tipoEvento(ev.tipo) + (ev.prioridad ? ` · ${e.prioridad(ev.prioridad)}` : '') + (n > 1 ? ` · ${e.dia(i, n)}` : ''),
          ev.pruebas && `${e.pruebas}: ${ev.pruebas}`, ev.categoria && `${e.categoria}: ${ev.categoria}`, ev.notas].filter(Boolean).join('\n'),
        estado: 'planificado',
      });
    }
  });
  return out;
}
export const FUENTE_CALENDARIO = { id: 'temporada', genera: (datos, rango, etq) => eventosDeTemporada(datos, rango, etq) };
export const COLOR_CALENDARIO = { fondo: '#fbe9e7', acento: '#b3261e', texto: '#7f1d16' };
export function colorEventoCalendario(ev) {
  if (ev.origen !== 'temporada') return null;
  if (ev.tipoEvento === 'competicion') {
    const a = COLOR_PRIORIDAD[ev.prioridad] || COLOR_EVENTO.competicion;
    return { fondo: ev.prioridad === 'A' ? '#fbe3e0' : ev.prioridad === 'B' ? '#fdecd0' : '#e3edf9', acento: a, texto: ev.prioridad === 'B' ? '#6b3a00' : ev.prioridad === 'C' ? '#1c3f6e' : '#7f1d16' };
  }
  return { ...COLOR_SIN_GRUPO, acento: COLOR_EVENTO[ev.tipoEvento] || COLOR_EVENTO.otro };
}

// ---------- Datos de demostración ----------
// Temporada realista que arranca el primer lunes de septiembre (o antes, si hace falta para incluir `desdeFecha`).
// opciones: {hoy, grupoId, tipos, desdeFecha?} -> {temporada, fases, semanas, eventos} (filas de hoja listas para guardar)
export function temporadaDemo({ hoy, grupoId = '', tipos = [], desdeFecha = '' }) {
  const y = +hoy.slice(0, 4), m = +hoy.slice(5, 7);
  const anio = m >= 9 ? y : y - 1;
  let inicio = lunesDe(`${anio}-09-01`);
  if (inicio < `${anio}-09-01`) inicio = addDias(inicio, 7);
  if (desdeFecha && lunesDe(desdeFecha) < inicio) inicio = addDias(lunesDe(desdeFecha), -28);
  const w = (n) => addDias(inicio, n * 7);
  const TOTAL = 38;
  const fin = addDias(w(TOTAL), -1);
  const tid = 'tp1';
  const nombre = `Temporada ${inicio.slice(0, 4)}-${String(+inicio.slice(0, 4) + 1).slice(2)}`;
  const tramos = [
    ['fs1', 'Preparación general', 'preparacion-general', 0, 9, 'Base aeróbica y técnica; volumen creciente con descarga cada 4 semanas.'],
    ['fs2', 'Preparación específica', 'preparacion-especifica', 10, 19, 'Umbral y potencia aeróbica; trabajo específico de pruebas.'],
    ['fs3', 'Fase competitiva', 'competitiva', 20, 29, 'Mantener el nivel y competir; ritmos de prueba y salidas/virajes.'],
    ['fs4', 'Tapering', 'tapering', 30, 31, 'Reducir volumen manteniendo la intensidad antes del campeonato principal.'],
    ['fs5', 'Transición', 'transicion', 32, 37, 'Descarga activa y recuperación.'],
  ];
  const fases = tramos.map(([id, nom, tipo, a, b, obj], i) => filaFase({ id, temporadaId: tid, nombre: nom, tipo, inicio: w(a), fin: addDias(w(b + 1), -1), objetivo: obj, color: COLOR_FASE[tipo], orden: i + 1 }));
  const base = { 'preparacion-general': 10500, 'preparacion-especifica': 11500, competitiva: 11000, transicion: 5200 };
  const semanasRaw = tramos.map(([, , tipo, a, b]) => ({ tipo, a, b }));
  const semanas = [];
  const nuevas = generarSemanas(inicio, fin).map((s) => ({ ...s, plan: { volumen: null } }));
  semanasRaw.forEach(({ tipo, a, b }) => {
    const volBase = tipo === 'tapering' ? 11000 : base[tipo];
    aplicarPlantillaFase(nuevas, { nIni: a + 1, nFin: b + 1, tipo, volumenBase: volBase, tipos }).forEach((r) => {
      const obj = { 'preparacion-general': 'Construir base aeróbica', 'preparacion-especifica': 'Subir intensidad específica', competitiva: 'Competir y afinar ritmos', tapering: 'Llegar descansado al campeonato', transicion: 'Recuperar' }[tipo];
      semanas.push(filaSemanaPlan({ temporadaId: tid, lunes: r.lunes, volumen: r.volumen, contenidos: r.contenidos, intensidad: r.intensidad, objetivo: (r.n - 1 - a) % 4 === 3 && tipo !== 'tapering' && tipo !== 'transicion' ? 'Semana de descarga' : obj, notas: '' }));
    });
  });
  const ev = (id, tipo, nom, semana, dia, dias, extra = {}) => filaEvento({ id, temporadaId: tid, tipo, nombre: nom, inicio: addDias(w(semana), dia), fin: addDias(w(semana), dia + dias - 1), ...extra });
  const eventos = [
    ev('et1', 'otro', 'Reunión con las familias', 1, 3, 1, { lugar: 'Piscina Lugones', notas: 'Presentación de la temporada.' }),
    ev('et2', 'competicion', 'Torneo Social Lugones', 6, 5, 1, { prioridad: 'C', lugar: 'Piscina Lugones', pruebas: '50 libre, 50 espalda, 100 estilos', categoria: 'Infantil', grupoId: grupoId, notas: 'Competición de preparación sin descarga.' }),
    ev('et3', 'test', 'Test de umbral 5x400', 9, 2, 1, { lugar: 'Piscina Lugones', notas: 'Referencia para las zonas de ritmo.' }),
    ev('et4', 'competicion', 'Trofeo Ciudad de Gijón', 11, 5, 2, { prioridad: 'B', lugar: 'Piscina de Gijón', pruebas: '100 libre, 200 estilos, 100 mariposa', categoria: 'Infantil', grupoId: grupoId }),
    ev('et5', 'descanso', 'Vacaciones de Navidad', 16, 0, 8, { notas: 'Dos semanas sin entrenar.' }),
    ev('et6', 'concentracion', 'Concentración de tecnificación', 22, 4, 3, { lugar: 'Centro de Tecnificación', categoria: 'Infantil', grupoId: grupoId }),
    ev('et7', 'competicion', 'Copa Federación', 24, 5, 2, { prioridad: 'B', lugar: 'Piscina de Oviedo', pruebas: '200 libre, 400 libre, 200 espalda', categoria: 'Infantil', grupoId: grupoId }),
    ev('et8', 'competicion', 'Campeonato de Asturias', 31, 4, 3, { prioridad: 'A', lugar: 'Piscina de Avilés', pruebas: '100 y 200 libre, 200 estilos, 100 mariposa', categoria: 'Infantil', grupoId: grupoId, notas: 'Objetivo principal de la temporada.' }),
  ];
  const temporada = filaTemporada({ id: tid, nombre, inicio, fin, activa: true, grupoId, notas: 'Temporada de demostración.' });
  return { temporada, fases, semanas, eventos };
}
// (re-export útil para la vista)
export { deDias, diaSemana };
