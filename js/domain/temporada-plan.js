// Season planning, part 2: suggestions, plan editing tools, events for the calendar and demo data (pure; see temporada-modelo.js for the model).
import { deDias, addDias, lunesDe, diaSemana } from './calendario.js';
import { PREFIJO_ID } from './cargas.js';
import {
  COLOR_FASE,
  tonoEvento,
  TOLERANCIA,
  UMBRAL_CONTENIDO,
  MAX_SUGERENCIAS_CONTENIDO,
  VENTANA_SUGERENCIAS,
  str,
  redondear,
  suma,
  media,
  diasEntre,
  filaTemporada,
  filaFase,
  filaSemanaPlan,
  normalizarEvento,
  filaEvento,
  generarSemanas,
} from './temporada-modelo.js';

// ---------- Suggestions (simple, transparent rules) ----------
// REDUCCION_PREVIA: % variation of the base volume in the weeks before a competition (index = weeks before).
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
  // 1) Contents accumulated in the last closed weeks.
  const pasadas = semanas.filter((s) => s.tiempo === 'pasada').slice(-ventana);
  const destino = futuras.find((s) => s.tiempo === 'futura') || futuras[0];
  if (pasadas.length) {
    const acum = {};
    pasadas.forEach((s) => s.contenidos.forEach((c) => { const o = (acum[c.tipo.id] ||= { tipo: c.tipo, previsto: 0, real: 0 }); o.previsto += c.previsto; o.real += c.real; }));
    const candidatas = Object.values(acum).filter((o) => o.previsto >= 500 && Math.abs((o.real - o.previsto) / o.previsto) >= UMBRAL_CONTENIDO)
      .sort((a, b) => Math.abs(b.real - b.previsto) - Math.abs(a.real - a.previsto)).slice(0, MAX_SUGERENCIAS_CONTENIDO); // the 3 largest deviations
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
  // 2) Weeks before an A/B competition and 3) tapering.
  const objetivo = new Map(); // n -> suggestion (the strongest reduction wins)
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
  // 4) Future weeks without planned volume.
  const sinPrevisto = futuras.filter((s) => !(s.plan.volumen > 0));
  if (sinPrevisto.length) out.push({ id: 'sin-previsto', codigo: 'sin-previsto', severidad: 'info', semana: sinPrevisto[0].n, params: { n: sinPrevisto.length, primera: sinPrevisto[0].n }, accion: null });
  return out;
}

// ---------- Plan editing tools (they return changes; they do not write) ----------
// Plan fields that are copied between weeks.
export const copiarPlanSemana = (plan) => ({ volumen: plan.volumen, contenidos: { ...plan.contenidos }, intensidad: plan.intensidad, objetivo: plan.objetivo, notas: plan.notas });

const escalarContenidos = (c, f) => Object.fromEntries(Object.entries(c || {}).map(([k, v]) => [k, redondear(v * f)]).filter(([, v]) => v > 0));
// Scales (± %) the planned volume (and its split) of weeks n in [desde, hasta]. Only changes those that have volume.
// -> [{n, lunes, antes, despues, contenidos}]
export function ajustarVolumenes(semanas, { desde, hasta, pct }) {
  const f = 1 + (Number(pct) || 0) / 100;
  if (f < 0) return [];
  return semanas.filter((s) => s.n >= desde && s.n <= hasta && s.plan.volumen > 0).map((s) => ({
    n: s.n, lunes: s.lunes, antes: s.plan.volumen, despues: redondear(s.plan.volumen * f), contenidos: escalarContenidos(s.plan.contenidos, f),
  }));
}
// Moves the plan (volume, split and intensity) of weeks [desde, hasta] by k weeks (+ later, - earlier).
// Source weeks that receive nothing are left empty. -> [{n, lunes, antes, despues, contenidos, intensidad}] only with changes
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

// Templates per phase type: volume undulation (cycle of weeks relative to the base), intensity (RPE) and split by content (%).
export const PLANTILLAS_FASE = {
  'preparacion-general': { ciclo: [0.9, 1, 1.08, 0.75], intensidad: 5, reparto: { 'aerobico-ligero': 20, 'aerobico-medio': 35, 'aerobico-intenso': 8, alactico: 2, piernas: 10, brazos: 5, tecnica: 12, salidas: 3, virajes: 5 } },
  'preparacion-especifica': { ciclo: [0.95, 1.05, 1.12, 0.8], intensidad: 6, reparto: { 'aerobico-ligero': 15, 'aerobico-medio': 28, 'aerobico-intenso': 15, anaerobico: 8, alactico: 4, piernas: 8, brazos: 4, tecnica: 8, salidas: 5, virajes: 5 } },
  competitiva: { ciclo: [1, 0.95, 1.02, 0.85], intensidad: 7, reparto: { 'aerobico-ligero': 18, 'aerobico-medio': 18, 'aerobico-intenso': 14, anaerobico: 12, alactico: 8, piernas: 6, brazos: 3, tecnica: 7, salidas: 8, virajes: 6 } },
  tapering: { ciclo: null, intensidad: 6, reparto: { 'aerobico-ligero': 28, 'aerobico-medio': 14, 'aerobico-intenso': 14, anaerobico: 8, alactico: 14, piernas: 4, brazos: 2, tecnica: 6, salidas: 6, virajes: 4 } },
  transicion: { ciclo: [0.5, 0.4], intensidad: 3, reparto: { 'aerobico-ligero': 55, 'aerobico-medio': 15, piernas: 8, brazos: 4, tecnica: 14, virajes: 4 } },
  personalizado: { ciclo: [1], intensidad: 5, reparto: { 'aerobico-ligero': 20, 'aerobico-medio': 35, 'aerobico-intenso': 8, alactico: 2, piernas: 10, brazos: 5, tecnica: 12, salidas: 3, virajes: 5 } },
};

// Distributes `volumen` among the active contents of the catalogue according to the percentages (renormalised); the last one absorbs the rounding.
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

// Suggested base volume for a phase: average planned of the phase, or of the 3 previous weeks, or the recent actual.
export function volumenBaseSugerido(semanas, nIni, nFin) {
  const dentro = semanas.filter((s) => s.n >= nIni && s.n <= nFin && s.plan.volumen > 0).map((s) => s.plan.volumen);
  if (dentro.length) return redondear(media(dentro));
  const antes = baseAntes(semanas, Math.max(0, nIni - 1));
  if (antes > 0) return redondear(antes);
  const reales = semanas.filter((s) => s.tiempo !== 'futura' && s.real.total > 0).slice(-4).map((s) => s.real.total);
  return reales.length ? redondear(media(reales)) : 0;
}

// Applies a phase template to weeks [nIni, nFin]: undulating volume over `volumenBase`, split by content and intensity.
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

// Applies a suggestion (accion) to the weeks -> {n, lunes, volumen, contenidos} with the resulting plan, or null.
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

// ---------- Events in the calendar ----------
export const ETQ_TEMPORADA = {
  tipoEvento: (t) => ({ competicion: 'Competición', concentracion: 'Concentración', test: 'Test', descanso: 'Descanso', otro: 'Evento' }[t] || t),
  prioridad: (p) => `Prioridad ${p}`, pruebas: 'Pruebas', categoria: 'Categoría', dia: (i, n) => `Día ${i} de ${n}`,
};
// Generates the all-day events of EventosTemporada (one per day) for the calendar and the .ics.
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
// Colour of a season event in the calendar: a semantic tone (see above); null for events that are not from the season.
export function colorEventoCalendario(ev) {
  if (ev.origen !== 'temporada') return null;
  return { semantico: tonoEvento({ tipo: ev.tipoEvento, prioridad: ev.prioridad }) };
}

// ---------- Demo data ----------
// Realistic season starting on the first Monday of September (or earlier, if needed to include `desdeFecha`).
// opciones: {hoy, grupoId, tipos, desdeFecha?} -> {temporada, fases, semanas, eventos} (sheet rows ready to save)
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
// ---------- View model helpers (pure; moved out of the view) ----------
// Defaults for a new season: the swimming year starts on the first Monday on or after 1 September (38 weeks).
// -> {anio, inicio, fin}; `hoy` is the caller's today.
export function propuestaTemporada(hoy) {
  const y = +hoy.slice(0, 4);
  const anio = +hoy.slice(5, 7) >= 9 ? y : y - 1;
  let inicio = lunesDe(`${anio}-09-01`);
  if (inicio < `${anio}-09-01`) inicio = addDias(inicio, 7);
  return { anio, inicio, fin: addDias(inicio, 7 * 38 - 1) };
}
// Proposed dates for a new phase: the first gap without a phase, otherwise from the selected week; 4 weeks long, never past the season.
export function propuestaFase(m, nSel) {
  const hueco = m.validaciones.find((x) => x.tipo === 'hueco-fases');
  const sem = m.semanas.find((s) => s.n === nSel) || m.semanas[0];
  const inicio = hueco ? hueco.params.desde : sem.lunes;
  let fin = addDias(inicio, 27);
  if (hueco && fin > hueco.params.hasta) fin = hueco.params.hasta;
  if (fin > m.temporada.fin) fin = m.temporada.fin;
  return { inicio, fin };
}
// Proposed start of a new event: the Saturday of the selected week (clamped to the season end).
export function propuestaEvento(m, nSel) {
  const sem = m.semanas.find((s) => s.n === nSel) || m.semanas[0];
  const sab = addDias(sem.lunes, 5);
  return { inicio: sab > m.temporada.fin ? m.temporada.fin : sab };
}
// First and last week number of a phase.
export function semanasDeFase(m, faseId) {
  const ns = m.semanas.filter((s) => s.fase && s.fase.id === faseId).map((s) => s.n);
  return ns.length ? { desde: ns[0], hasta: ns[ns.length - 1] } : null;
}
// The week in which an event starts (null when it is outside the season).
export const semanaDelEvento = (m, e) => m.semanas.find((s) => e.inicio >= s.lunes && e.inicio <= s.domingo) || null;
// Weeks shown by the chart/table for a zoom range.
export const semanasEnRango = (m, desde, hasta) => m.semanas.filter((s) => s.n >= desde && s.n <= hasta);
// Y axis of the stacked chart: a round top and its ticks for a maximum volume.
export function escalaEjeY(max) {
  const pasos = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000];
  const paso = pasos.find((p) => max / p <= 5) || 20000;
  const top = Math.max(paso, Math.ceil(max / paso) * paso);
  const ticks = [];
  for (let v = 0; v <= top; v += paso) ticks.push(v);
  return { top, ticks };
}
// Consecutive weeks of the same phase grouped into bands: [{fase, ini, fin}] (indexes into `semanas`).
export function bandasDeFase(semanas) {
  const grupos = [];
  semanas.forEach((s, i) => {
    const ult = grupos[grupos.length - 1];
    if (ult && ult.fase && s.fase && ult.fase.id === s.fase.id) ult.fin = i; else grupos.push({ fase: s.fase, ini: i, fin: i });
  });
  return grupos;
}
// Greedy placement of markers in rows so they do not overlap: returns the row index for x, mutating `filas` (arrays of x).
export function filaLibre(filas, x, separacion) {
  const i = filas.findIndex((f) => f.every((v) => Math.abs(v - x) > separacion));
  const r = i < 0 ? filas.length - 1 : i;
  filas[r].push(x);
  return r;
}

// (useful re-export for the view)
export { deDias, diaSemana };
