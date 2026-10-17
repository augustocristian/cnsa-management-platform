// Season planning, part 1 (model): normalisation, weeks, validations, real aggregates and the week-by-week summary.
// Part 2 (suggestions, editing tools, calendar events, demo) is temporada-plan.js; temporada.js re-exports both.
// Domain of Season Planning: PURE logic (no DOM, store, network, i18n or clock).
// Vocabulary: macrocycle = FASE (phase), microcycle = SEMANA (week, Monday to Sunday).
//
// Sheets (stored values are Spanish/neutral; the view translates them):
//  - Temporadas:       id, nombre, fechaInicio, fechaFin, activa, grupoId (opcional), notas
//  - Fases:            id, temporadaId, nombre, tipo, fechaInicio, fechaFin, objetivo, color, orden
//  - SemanasPlan:      id (= sp-<temporadaId>-<lunes>), temporadaId, lunes, volumenPrevisto, contenidos (JSON {tipoId: m}),
//                      intensidad (planned RPE 1-10), objetivo, notas. The weeks are GENERATED from the dates of the
//                      season (generarSemanas); only what the user edits is stored.
//  - EventosTemporada: id, temporadaId, tipo, nombre, fechaInicio, fechaFin, lugar, prioridad (A|B|C), pruebas, categoria, grupoId, notas
// Dates = 'YYYY-MM-DD'. Volumes are METRES PER SWIMMER per week (like the loads): with grupoId only the sessions and
// swimmers of that group are compared; without a group, the average per group (plans) and per swimmer (loads).
import { fechaValida, aDias, addDias, lunesDe } from './calendario.js';
import { normalizarNombre, indicePorNombre, agregarSemana, colorValido, ordenarTipos, PREFIJO_ID } from './cargas.js';
import { volumenPorContenido } from './desglose.js';

export { fechaValida, addDias, lunesDe };

export const TIPOS_FASE = [
  'preparacion-general',
  'preparacion-especifica',
  'competitiva',
  'tapering',
  'transicion',
  'personalizado',
];
// Default colours of the phases: these are STORED values (the user can change them with a colour picker), not styling.
export const COLOR_FASE = {
  'preparacion-general': '#4f7cac',
  'preparacion-especifica': '#8a63b8',
  competitiva: '#c0592b',
  tapering: '#b0850b',
  transicion: '#4f8f7a',
  personalizado: '#6f7785',
};
export const TIPOS_EVENTO = ['competicion', 'concentracion', 'test', 'descanso', 'otro'];
export const PRIORIDADES = ['A', 'B', 'C'];
// Semantic tone of each event kind. The domain holds no colours: the presentation maps a tone to the design tokens
// (danger, warn, info, ok, neutral, accent), and events are ALSO told apart by shape and text (see temporada-grafico.js).
export const TONO_PRIORIDAD = { A: 'danger', B: 'warn', C: 'info' };
export const TONO_EVENTO = {
  competicion: 'danger',
  concentracion: 'accent',
  test: 'ok',
  descanso: 'neutral',
  otro: 'neutral',
};
export const tonoEvento = (e) =>
  e.tipo === 'competicion'
    ? TONO_PRIORIDAD[e.prioridad] || TONO_EVENTO.competicion
    : TONO_EVENTO[e.tipo] || TONO_EVENTO.otro;
export const MAX_SEMANAS = 110;
export const TOLERANCIA = 0.1; // ±10 % = "in range"
export const PASO_M = 50; // calculated volumes are rounded to 50 m
export const UMBRAL_CONTENIDO = 0.15; // per-content suggestions: accumulated deviation of ±15 %
export const MAX_SUGERENCIAS_CONTENIDO = 3; // per-content suggestions shown at the same time
export const VENTANA_SUGERENCIAS = 4; // weeks already elapsed that are looked at to suggest

// ---------- Utilidades ----------
export const str = (v) => (v == null ? '' : String(v));
const aBool = (v, d = false) => {
  if (v === true || v === false) return v;
  const s = str(v).trim().toLowerCase();
  return s === '' ? d : !['false', 'no', '0', 'n'].includes(s);
};
const aNum = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(str(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fechaIso = (v) => {
  const s = str(v).trim().slice(0, 10);
  return fechaValida(s) ? s : '';
};
export const redondear = (v, paso = PASO_M) => Math.max(0, Math.round(v / paso) * paso);
export const suma = (a) => a.reduce((x, y) => x + y, 0);
export const media = (a) => (a.length ? suma(a) / a.length : 0);
const solape = (a0, a1, b0, b1) => Math.max(0, Math.min(aDias(a1), aDias(b1)) - Math.max(aDias(a0), aDias(b0)) + 1);
export const diasEntre = (a, b) => aDias(b) - aDias(a);
export const idSemanaPlan = (temporadaId, lunes) => `sp-${temporadaId}-${lunes}`;

// ---------- Normalisation ----------
export function normalizarTemporada(r = {}) {
  return {
    id: str(r.id),
    nombre: str(r.nombre).trim(),
    inicio: fechaIso(r.fechaInicio ?? r.inicio),
    fin: fechaIso(r.fechaFin ?? r.fin),
    activa: aBool(r.activa, false),
    grupoId: str(r.grupoId),
    notas: str(r.notas),
  };
}
export const filaTemporada = (t) => ({
  id: str(t.id),
  nombre: str(t.nombre).trim(),
  fechaInicio: fechaIso(t.inicio),
  fechaFin: fechaIso(t.fin),
  activa: t.activa ? 'true' : 'false',
  grupoId: str(t.grupoId),
  notas: str(t.notas),
});

export function normalizarFase(r = {}) {
  const tipo = TIPOS_FASE.includes(str(r.tipo)) ? str(r.tipo) : 'personalizado';
  const orden = aNum(r.orden);
  return {
    id: str(r.id),
    temporadaId: str(r.temporadaId),
    nombre: str(r.nombre).trim(),
    tipo,
    inicio: fechaIso(r.fechaInicio ?? r.inicio),
    fin: fechaIso(r.fechaFin ?? r.fin),
    objetivo: str(r.objetivo),
    color: colorValido(r.color) ? str(r.color).trim().toLowerCase() : COLOR_FASE[tipo],
    orden: orden == null ? 0 : orden,
  };
}
export const filaFase = (f) => ({
  id: str(f.id),
  temporadaId: str(f.temporadaId),
  nombre: str(f.nombre).trim(),
  tipo: TIPOS_FASE.includes(f.tipo) ? f.tipo : 'personalizado',
  fechaInicio: fechaIso(f.inicio),
  fechaFin: fechaIso(f.fin),
  objetivo: str(f.objetivo),
  color: colorValido(f.color) ? str(f.color).trim().toLowerCase() : '',
  orden: f.orden == null ? 0 : f.orden,
});

export function parseContenidos(v) {
  let o = v;
  if (typeof v === 'string') {
    try {
      o = v.trim() ? JSON.parse(v) : {};
    } catch (e) {
      o = {};
    }
  }
  const out = {};
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    Object.keys(o)
      .sort()
      .forEach((k) => {
        const n = aNum(o[k]);
        if (n != null && n > 0) out[k] = n;
      });
  }
  return out;
}
export const sumaContenidos = (c) => suma(Object.values(c || {}));

export function normalizarSemanaPlan(r = {}) {
  const v = aNum(r.volumenPrevisto ?? r.volumen),
    i = aNum(r.intensidad);
  return {
    id: str(r.id),
    temporadaId: str(r.temporadaId),
    lunes: fechaIso(r.lunes),
    volumen: v != null && v >= 0 ? v : null,
    contenidos: parseContenidos(r.contenidos),
    intensidad: i != null && i >= 1 && i <= 10 ? i : null,
    objetivo: str(r.objetivo),
    notas: str(r.notas),
  };
}
export const filaSemanaPlan = (s) => ({
  id: s.id || idSemanaPlan(s.temporadaId, s.lunes),
  temporadaId: str(s.temporadaId),
  lunes: fechaIso(s.lunes),
  volumenPrevisto: s.volumen == null ? '' : s.volumen,
  contenidos: Object.keys(s.contenidos || {}).length ? JSON.stringify(parseContenidos(s.contenidos)) : '',
  intensidad: s.intensidad == null ? '' : s.intensidad,
  objetivo: str(s.objetivo),
  notas: str(s.notas),
});
export const semanaPlanVacia = (s) =>
  s.volumen == null &&
  !Object.keys(s.contenidos || {}).length &&
  s.intensidad == null &&
  !str(s.objetivo).trim() &&
  !str(s.notas).trim();

export function normalizarEvento(r = {}) {
  const tipo = TIPOS_EVENTO.includes(str(r.tipo)) ? str(r.tipo) : 'otro';
  const inicio = fechaIso(r.fechaInicio ?? r.inicio);
  const fin = fechaIso(r.fechaFin ?? r.fin) || inicio;
  const prio = str(r.prioridad).trim().toUpperCase();
  return {
    id: str(r.id),
    temporadaId: str(r.temporadaId),
    tipo,
    nombre: str(r.nombre).trim(),
    inicio,
    fin,
    lugar: str(r.lugar).trim(),
    prioridad: PRIORIDADES.includes(prio) ? prio : '',
    pruebas: str(r.pruebas),
    categoria: str(r.categoria),
    grupoId: str(r.grupoId),
    notas: str(r.notas),
  };
}
export const filaEvento = (e) => ({
  id: str(e.id),
  temporadaId: str(e.temporadaId),
  tipo: TIPOS_EVENTO.includes(e.tipo) ? e.tipo : 'otro',
  nombre: str(e.nombre).trim(),
  fechaInicio: fechaIso(e.inicio),
  fechaFin: fechaIso(e.fin) || fechaIso(e.inicio),
  lugar: str(e.lugar).trim(),
  prioridad: PRIORIDADES.includes(str(e.prioridad).toUpperCase()) ? str(e.prioridad).toUpperCase() : '',
  pruebas: str(e.pruebas),
  categoria: str(e.categoria),
  grupoId: str(e.grupoId),
  notas: str(e.notas),
});

// ---------- Weeks ----------
// Monday-to-Sunday weeks that touch [inicio, fin]. The first/last may be partial (desde/hasta are clipped to the season).
export function generarSemanas(inicio, fin) {
  if (!fechaValida(inicio) || !fechaValida(fin) || fin < inicio) return [];
  const out = [];
  let lunes = lunesDe(inicio);
  for (let n = 1; lunes <= fin && n <= MAX_SEMANAS; n++, lunes = addDias(lunes, 7)) {
    const domingo = addDias(lunes, 6);
    out.push({
      n,
      lunes,
      domingo,
      desde: lunes < inicio ? inicio : lunes,
      hasta: domingo > fin ? fin : domingo,
      parcial: lunes < inicio || domingo > fin,
    });
  }
  return out;
}
// Week (n) that contains a date, or 0 if it falls outside.
export function semanaDeFecha(semanas, fecha) {
  const s = semanas.find((x) => fecha >= x.lunes && fecha <= x.domingo);
  return s ? s.n : 0;
}
const porInicio = (a, b) =>
  a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.orden - b.orden || a.nombre.localeCompare(b.nombre);
export const ordenarFases = (fases) => fases.slice().sort(porInicio);

// Phase that covers most days of the week (tie: the one that starts earlier). null if none.
export function faseDeSemana(fases, semana) {
  let mejor = null,
    dias = 0;
  ordenarFases(fases).forEach((f) => {
    if (!f.inicio || !f.fin) return;
    const d = solape(f.inicio, f.fin, semana.lunes, semana.domingo);
    if (d > dias) {
      dias = d;
      mejor = f;
    }
  });
  return mejor;
}
export const faseDeFecha = (fases, fecha) =>
  ordenarFases(fases).find((f) => f.inicio && f.fin && fecha >= f.inicio && fecha <= f.fin) || null;

export function eventosDeSemana(eventos, semana) {
  return eventos
    .filter((e) => e.inicio && e.fin && e.inicio <= semana.domingo && e.fin >= semana.lunes)
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : a.nombre.localeCompare(b.nombre)));
}
export const prioridadMayor = (eventos) => {
  const comp = eventos.filter((e) => e.tipo === 'competicion' && e.prioridad);
  return PRIORIDADES.find((p) => comp.some((e) => e.prioridad === p)) || '';
};
export function proximaCompeticion(eventos, hoy) {
  return (
    eventos
      .filter((e) => e.tipo === 'competicion' && e.fin >= hoy)
      .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0))[0] || null
  );
}

// ---------- Validaciones ----------
// Error codes [{campo, codigo}] (the view translates them with tp.err.<codigo>). Empty = valid.
export function validarTemporada(d) {
  const e = [];
  if (!str(d.nombre).trim()) e.push({ campo: 'nombre', codigo: 'nombre-vacio' });
  else if (str(d.nombre).trim().length > 80) e.push({ campo: 'nombre', codigo: 'nombre-largo' });
  const i = fechaValida(str(d.inicio)),
    f = fechaValida(str(d.fin));
  if (!i) e.push({ campo: 'inicio', codigo: 'fecha-invalida' });
  if (!f) e.push({ campo: 'fin', codigo: 'fecha-invalida' });
  if (i && f) {
    if (d.fin < d.inicio) e.push({ campo: 'fin', codigo: 'fin-antes-inicio' });
    else if (
      generarSemanas(d.inicio, d.fin).length >= MAX_SEMANAS &&
      diasEntre(lunesDe(d.inicio), d.fin) >= MAX_SEMANAS * 7
    )
      e.push({ campo: 'fin', codigo: 'duracion-excesiva' });
  }
  return e;
}
export function validarFase(d) {
  const e = [];
  if (!str(d.nombre).trim()) e.push({ campo: 'nombre', codigo: 'nombre-vacio' });
  else if (str(d.nombre).trim().length > 60) e.push({ campo: 'nombre', codigo: 'nombre-largo' });
  if (!TIPOS_FASE.includes(str(d.tipo))) e.push({ campo: 'tipo', codigo: 'tipo-invalido' });
  const i = fechaValida(str(d.inicio)),
    f = fechaValida(str(d.fin));
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
  const i = fechaValida(str(d.inicio)),
    f = !str(d.fin).trim() || fechaValida(str(d.fin));
  if (!i) e.push({ campo: 'inicio', codigo: 'fecha-invalida' });
  if (!f) e.push({ campo: 'fin', codigo: 'fecha-invalida' });
  if (i && f && str(d.fin).trim() && d.fin < d.inicio) e.push({ campo: 'fin', codigo: 'fin-antes-inicio' });
  const p = str(d.prioridad).trim().toUpperCase();
  if (d.tipo === 'competicion' && !PRIORIDADES.includes(p))
    e.push({ campo: 'prioridad', codigo: 'prioridad-requerida' });
  else if (p && !PRIORIDADES.includes(p)) e.push({ campo: 'prioridad', codigo: 'prioridad-invalida' });
  return e;
}
export function validarSemanaPlan(d) {
  const e = [];
  const v = str(d.volumen).trim() === '' ? null : aNum(d.volumen);
  if (str(d.volumen).trim() !== '' && (v == null || v < 0)) e.push({ campo: 'volumen', codigo: 'volumen-invalido' });
  const i = str(d.intensidad).trim() === '' ? null : aNum(d.intensidad);
  if (str(d.intensidad).trim() !== '' && (i == null || i < 1 || i > 10))
    e.push({ campo: 'intensidad', codigo: 'intensidad-invalida' });
  Object.values(d.contenidos || {}).forEach((x) => {
    if (str(x).trim() !== '' && (aNum(x) == null || aNum(x) < 0))
      e.push({ campo: 'contenidos', codigo: 'contenido-invalido' });
  });
  return e;
}

// Inconsistencies of the plan -> [{tipo, severidad: error|aviso|info, params, ...ids}]; the view translates tp.v.<tipo>.
//  error: overlapping phases · aviso: gaps without a phase, phase outside the season, event outside the season · info: no phases
export function validarPlan({ temporada, fases = [], eventos = [] }) {
  const out = [];
  if (!temporada || !temporada.inicio || !temporada.fin) return out;
  const fs = ordenarFases(fases.filter((f) => f.inicio && f.fin && f.fin >= f.inicio));
  if (!fs.length) {
    out.push({ tipo: 'sin-fases', severidad: 'info', params: {} });
    return out;
  }
  for (let i = 0; i < fs.length; i++) {
    for (let j = i + 1; j < fs.length; j++) {
      if (fs[j].inicio > fs[i].fin) break;
      const desde = fs[j].inicio,
        hasta = fs[i].fin < fs[j].fin ? fs[i].fin : fs[j].fin;
      out.push({
        tipo: 'fases-solapadas',
        severidad: 'error',
        faseIds: [fs[i].id, fs[j].id],
        params: { a: fs[i].nombre, b: fs[j].nombre, desde, hasta, dias: solape(desde, hasta, desde, hasta) },
      });
    }
  }
  fs.forEach((f) => {
    if (f.inicio < temporada.inicio || f.fin > temporada.fin)
      out.push({
        tipo: 'fase-fuera-temporada',
        severidad: 'aviso',
        faseIds: [f.id],
        params: { fase: f.nombre, desde: f.inicio, hasta: f.fin },
      });
  });
  // Gaps: stretches of the season that no phase covers.
  let cubierto = addDias(temporada.inicio, -1);
  const hueco = (desde, hasta) => {
    const sem = generarSemanas(desde, hasta).length;
    out.push({
      tipo: 'hueco-fases',
      severidad: 'aviso',
      params: { desde, hasta, dias: diasEntre(desde, hasta) + 1, semanas: sem },
    });
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
    if (ev.inicio && (ev.inicio < temporada.inicio || (ev.fin || ev.inicio) > temporada.fin))
      out.push({
        tipo: 'evento-fuera-temporada',
        severidad: 'aviso',
        eventoId: ev.id,
        params: { evento: ev.nombre, desde: ev.inicio },
      });
  });
  return out;
}
export const hayErrores = (lista) => lista.some((v) => v.severidad === 'error');

// Phases overlapping a candidate (to block/warn before saving). -> fases[]
export function fasesQueSolapan(candidata, fases) {
  if (!candidata.inicio || !candidata.fin) return [];
  return fases.filter(
    (f) => f.id !== candidata.id && f.inicio && f.fin && f.inicio <= candidata.fin && f.fin >= candidata.inicio,
  );
}
export function eventoFuera(evento, temporada) {
  return !!(
    temporada &&
    temporada.inicio &&
    evento.inicio &&
    (evento.inicio < temporada.inicio || (evento.fin || evento.inicio) > temporada.fin)
  );
}

// Default phases (general/specific preparation, competitive, tapering and transition) spread over whole weeks.
// nombrePorTipo(tipo) is supplied by the layer that knows the language. -> [{nombre, tipo, inicio, fin, color, objetivo, orden}]
export function fasesPorDefecto(inicio, fin, nombrePorTipo = (t) => t) {
  const sem = generarSemanas(inicio, fin);
  const N = sem.length;
  const mk = (tipo, a, b, orden) => ({
    nombre: nombrePorTipo(tipo),
    tipo,
    inicio: a === 0 ? inicio : sem[a].lunes,
    fin: b === N - 1 ? fin : sem[b].domingo,
    color: COLOR_FASE[tipo],
    objetivo: '',
    orden,
  });
  if (N < 5) return N ? [mk('personalizado', 0, N - 1, 1)] : [];
  const taper = N >= 12 ? 2 : 1;
  const trans = Math.max(1, Math.round(N * 0.12));
  const resto = N - taper - trans;
  const gen = Math.max(1, Math.round(resto * 0.35)),
    esp = Math.max(1, Math.round(resto * 0.35)),
    comp = Math.max(1, resto - gen - esp);
  const largos = [
    ['preparacion-general', gen],
    ['preparacion-especifica', esp],
    ['competitiva', comp],
    ['tapering', taper],
    ['transicion', trans],
  ];
  const out = [];
  let k = 0;
  largos.forEach(([tipo, n], i) => {
    if (k >= N) return;
    const b = i === largos.length - 1 ? N - 1 : Math.min(N - 1, k + n - 1);
    out.push(mk(tipo, k, b, i + 1));
    k = b + 1;
  });
  return out;
}

// ---------- Classification of the lines of a training plan by content ----------
const REGLAS_CONTENIDO = [
  [
    'aerobico-ligero',
    /calentamiento|vuelta a la calma|recuperacion|regenerativ|suave|soltar|enfriamiento|activacion|ligero/,
  ],
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
// Free text (goal/block of the plan) -> catalogue content id, or ''.
export function clasificarContenido(texto, tipos) {
  const k = normalizarNombre(texto);
  if (!k) return '';
  const idx = indicePorNombre(tipos);
  if (idx.has(k)) return idx.get(k).id;
  const custom = tipos.find(
    (t) =>
      !t.predefinido && t.activo && normalizarNombre(t.nombre).length >= 3 && k.includes(normalizarNombre(t.nombre)),
  );
  if (custom) return custom.id;
  for (const [clave, re] of REGLAS_CONTENIDO) {
    if (re.test(k)) {
      const t = tipos.find((x) => x.id === PREFIJO_ID + clave) || idx.get(normalizarNombre(clave));
      return t ? t.id : '';
    }
  }
  return '';
}

// Metres of a session per content from its lines (delegates to desglose.volumenPorContenido: respects the split by
// components of each row; legacy rows without components use their goal and inherit that of the previous row of the set).
// -> {total, metros: {tipoId: m}, sinClasificar}
export function volumenPlanSesion(lineas, tipos) {
  const v = volumenPorContenido([lineas || []], { tipos });
  return { total: v.totalM, metros: v.metros, sinClasificar: v.sinClasificar };
}

const volumenEstimado = (s) => {
  const a = aNum(s.volumenMin),
    b = aNum(s.volumenMax);
  if (a != null && b != null && a + b > 0) return (a + b) / 2;
  return Math.max(0, a || b || 0);
};
const cero = (tipos) => Object.fromEntries(tipos.map((t) => [t.id, 0]));

// ---------- Agregados reales ----------
// Training plans (Entrenamientos + EntrenoLineas, done and planned) of [desde, hasta].
// Without a group: average per group with sessions. A session without lines uses the average of its target volume (unclassified).
// -> {total, metros, sinClasificar, sesiones, realizadas, planificadas, estimadas, grupos}
export function agregarPlanes({ sesiones, lineasPorSesion, tipos, desde, hasta, grupoId = '' }) {
  const metros = cero(tipos);
  let sin = 0,
    total = 0,
    n = 0,
    realizadas = 0,
    estimadas = 0;
  const grupos = new Set();
  (sesiones || []).forEach((s) => {
    const f = str(s.fecha).slice(0, 10);
    if (f < desde || f > hasta || (grupoId && str(s.grupoId) !== grupoId)) return;
    n++;
    if (str(s.estado) === 'realizado') realizadas++;
    grupos.add(str(s.grupoId));
    const v = volumenPlanSesion(lineasPorSesion.get(str(s.id)) || [], tipos);
    if (v.total > 0) {
      total += v.total;
      sin += v.sinClasificar;
      Object.keys(v.metros).forEach((k) => {
        if (k in metros) metros[k] += v.metros[k];
        else sin += v.metros[k];
      });
    } else {
      const est = volumenEstimado(s);
      if (est > 0) {
        estimadas++;
        total += est;
        sin += est;
      }
    }
  });
  const div = grupoId ? 1 : Math.max(1, grupos.size);
  Object.keys(metros).forEach((k) => {
    metros[k] /= div;
  });
  return {
    total: total / div,
    metros,
    sinClasificar: sin / div,
    sesiones: n,
    realizadas,
    planificadas: n - realizadas,
    estimadas,
    grupos: grupos.size,
  };
}

// Recorded loads (average per swimmer with a load that week; with a group, only the swimmers of that group).
export function agregarCargas({ cargas, nadadores, tipos, desde, hasta, grupoId = '' }) {
  let lista = cargas || [];
  if (grupoId) {
    const ids = new Set((nadadores || []).filter((n) => str(n.grupoId) === grupoId).map((n) => n.id));
    lista = lista.filter((c) => ids.has(str(c.nadadorId)));
  }
  const a = agregarSemana({ cargas: lista, tipos, desde, hasta });
  return { total: a.total, metros: a.metros, sinClasificar: a.sinClasificar, nadadores: a.nadadores };
}

// ---------- Desviaciones ----------
// Status: 'sin-previsto' | 'en-rango' | 'bajo' | 'alto'. pct in % (null when nothing is planned).
export function desviacion(previsto, real, tolerancia = TOLERANCIA) {
  const p = Number(previsto) || 0,
    r = Number(real) || 0;
  if (!(p > 0)) return { abs: r, pct: null, estado: 'sin-previsto' };
  const abs = r - p;
  return {
    abs,
    pct: (abs / p) * 100,
    estado: Math.abs(abs) / p <= tolerancia + 1e-9 ? 'en-rango' : abs < 0 ? 'bajo' : 'alto',
  };
}

// ---------- Week-by-week summary ----------
// Input: temporada, fases, semanasPlan (normalised), eventos, tipos, sesiones/lineas/cargas/nadadores (raw rows), hoy,
//          fuente ('auto' | 'planes' | 'cargas'), tolerancia.
// Output: [{ n, lunes, domingo, desde, hasta, parcial, fase, plan:{id, volumen, contenidos, intensidad, objetivo, notas},
//            planes, cargas, real:{total, metros, sinClasificar, fuente: 'cargas'|'planes'|'ninguna'}, desv, contenidos:[{tipo, previsto, real, desv}],
//            eventos, prioridad, tiempo: 'pasada'|'actual'|'futura', estado, acumPrevisto, acumReal }]
export function resumenSemanas({
  temporada,
  fases = [],
  semanasPlan = [],
  eventos = [],
  tipos = [],
  sesiones = [],
  lineas = [],
  cargas = [],
  nadadores = [],
  hoy = '',
  fuente = 'auto',
  tolerancia = TOLERANCIA,
}) {
  const semanas = generarSemanas(temporada.inicio, temporada.fin);
  const lineasPorSesion = new Map();
  lineas.forEach((l) => {
    const k = str(l.entrenamientoId);
    if (!lineasPorSesion.has(k)) lineasPorSesion.set(k, []);
    lineasPorSesion.get(k).push(l);
  });
  const planPorLunes = new Map(semanasPlan.map((p) => [p.lunes, p]));
  const orden = ordenarTipos(tipos);
  let acumP = 0,
    acumR = 0;
  return semanas.map((s) => {
    const sp = planPorLunes.get(s.lunes) || null;
    const plan = sp
      ? {
          id: sp.id,
          volumen: sp.volumen,
          contenidos: sp.contenidos,
          intensidad: sp.intensidad,
          objetivo: sp.objetivo,
          notas: sp.notas,
        }
      : { id: '', volumen: null, contenidos: {}, intensidad: null, objetivo: '', notas: '' };
    const tiempo = hoy && s.domingo < hoy ? 'pasada' : hoy && s.lunes <= hoy ? 'actual' : 'futura';
    const planes = agregarPlanes({
      sesiones,
      lineasPorSesion,
      tipos,
      desde: s.desde,
      hasta: s.hasta,
      grupoId: temporada.grupoId,
    });
    const cg = agregarCargas({ cargas, nadadores, tipos, desde: s.desde, hasta: s.hasta, grupoId: temporada.grupoId });
    let origen = 'ninguna';
    if (fuente === 'cargas') origen = cg.total > 0 ? 'cargas' : 'ninguna';
    else if (fuente === 'planes') origen = planes.total > 0 ? 'planes' : 'ninguna';
    else origen = cg.total > 0 ? 'cargas' : planes.total > 0 ? 'planes' : 'ninguna';
    const base =
      origen === 'cargas' ? cg : origen === 'planes' ? planes : { total: 0, metros: cero(tipos), sinClasificar: 0 };
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
    const filas = orden
      .filter((t) => t.activo || (plan.contenidos[t.id] || 0) > 0 || (real.metros[t.id] || 0) > 0)
      .map((tipo) => {
        const previsto = plan.contenidos[tipo.id] || 0,
          r = real.metros[tipo.id] || 0;
        return { tipo, previsto, real: r, desv: contenidoDesv(previsto, r) };
      })
      .filter((c) => c.previsto > 0 || c.real > 0);
    const evs = eventosDeSemana(eventos, s);
    const empezada = tiempo !== 'futura';
    acumP += plan.volumen || 0;
    if (empezada) acumR += real.total;
    return {
      ...s,
      fase: faseDeSemana(fases, s),
      plan,
      planes,
      cargas: cg,
      real,
      desv: { ...desv, estado, pct: pendiente ? null : desv.pct },
      contenidos: filas,
      eventos: evs,
      prioridad: prioridadMayor(evs),
      tiempo,
      estado,
      acumPrevisto: acumP,
      acumReal: empezada ? acumR : null,
    };
  });
}

// Totals per phase and for the whole season. "real" only adds the weeks already started and is compared with the planned volume of THOSE weeks.
// -> { fases: [{fase, semanas, previsto, previstoHastaHoy, real, desv, contenidos:{tipoId:{previsto, real}}}], total: {...} }
export function totales(semanas, fases, tolerancia = TOLERANCIA) {
  const calc = (lista) => {
    const emp = lista.filter((s) => s.tiempo !== 'futura');
    const previsto = suma(lista.map((s) => s.plan.volumen || 0));
    const previstoHastaHoy = suma(emp.map((s) => s.plan.volumen || 0));
    const real = suma(emp.map((s) => s.real.total));
    const cont = {};
    lista.forEach((s) =>
      s.contenidos.forEach((c) => {
        const o = (cont[c.tipo.id] ||= { previsto: 0, real: 0 });
        o.previsto += c.previsto;
        if (s.tiempo !== 'futura') o.real += c.real;
      }),
    );
    return {
      semanas: lista.length,
      previsto,
      previstoHastaHoy,
      real,
      desv: desviacion(previstoHastaHoy, real, tolerancia),
      contenidos: cont,
    };
  };
  const ids = new Set(semanas.map((s) => (s.fase ? s.fase.id : '')));
  const lista = ordenarFases(fases)
    .filter((f) => ids.has(f.id))
    .map((fase) => ({ fase, ...calc(semanas.filter((s) => s.fase && s.fase.id === fase.id)) }));
  const sinFase = semanas.filter((s) => !s.fase);
  if (sinFase.length) lista.push({ fase: null, ...calc(sinFase) });
  return { fases: lista, total: calc(semanas) };
}
