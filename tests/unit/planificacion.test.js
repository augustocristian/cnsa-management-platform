import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const D = await importApp('js/domain/planificacion.js');
const { crearPlanificacionService } = await importApp('js/application/planificacionService.js');
const es = (await importApp('js/presentation/i18n/locales/planificacion.es.js')).default;
const en = (await importApp('js/presentation/i18n/locales/planificacion.en.js')).default;
const it = (await importApp('js/presentation/i18n/locales/planificacion.it.js')).default;

const piscina = (o = {}) => ({ id: 'p1', nombre: 'Lugones', longitudM: 25, numCalles: 6, intervaloMin: 30, maxPorCalle: 8, horario: D.horarioPorDefecto(), ...o });
const grupos = [
  { id: 'g1', nombre: 'Promoción', entrenador: 'Ana' },
  { id: 'g2', nombre: 'Alevín', entrenador: 'Bruno' },
  { id: 'g3', nombre: 'Infantil', entrenador: 'Ana' },
];
const nad = (grupoId, n, activo = 'true') => Array.from({ length: n }, (_, i) => ({ id: grupoId + i, grupoId, activo }));
const asig = (o) => ({ id: 'a' + Math.random().toString(36).slice(2, 7), piscinaId: 'p1', dia: 1, fecha: '', horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 2, grupoId: 'g1', entrenadorId: 'Ana', notas: '', ...o });
const datos = (asignaciones, extra = {}) => ({ piscinas: [piscina()], asignaciones, grupos, nadadores: [], ...extra });
const tipos = (cs) => cs.map((c) => c.tipo).sort();
const sin = (cs, ...t) => cs.filter((c) => !t.includes(c.tipo));

test('aMin/deMin: valid times, edges and fractions of a day', () => {
  assert.equal(D.aMin('00:00'), 0);
  assert.equal(D.aMin('7:05'), 425);
  assert.equal(D.aMin('24:00'), 1440);
  assert.ok(Number.isNaN(D.aMin('24:01')));
  assert.ok(Number.isNaN(D.aMin('12:60')));
  assert.ok(Number.isNaN(D.aMin('')));
  assert.ok(Number.isNaN(D.aMin('abc')));
  assert.equal(D.aMin('08:30:00'), 510);
  assert.equal(D.aMin(0.5), 720);
  assert.equal(D.deMin(425), '07:05');
});

test('dates: day of the week, Monday and adding days', () => {
  assert.equal(D.diaDeFecha('2026-10-12'), 1); // Monday
  assert.equal(D.diaDeFecha('2026-10-18'), 7);
  assert.ok(Number.isNaN(D.diaDeFecha('2026-02-31')));
  assert.equal(D.lunesDe('2026-10-15'), '2026-10-12');
  assert.equal(D.lunesDe('2026-10-18'), '2026-10-12');
  assert.equal(D.sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(D.fechaDeDia('2026-10-12', 3), '2026-10-14');
});

test('parseHorario tolerates broken JSON and objects; stringify is stable', () => {
  assert.deepEqual(D.parseHorario('no json'), D.horarioPorDefecto());
  assert.deepEqual(D.parseHorario(''), D.horarioPorDefecto());
  const h = D.parseHorario('{"1":{"abre":"08:00","cierra":"20:00"},"2":null}');
  assert.deepEqual(h[1], { abre: '08:00', cierra: '20:00' });
  assert.equal(h[2], null);
  assert.equal(h[3], null);
  assert.deepEqual(D.parseHorario(D.stringifyHorario(h)), h);
});

test('validarPiscina: all errors', () => {
  assert.deepEqual(D.validarPiscina(piscina()), []);
  assert.ok(D.validarPiscina(piscina({ nombre: ' ' })).includes('nombre-vacio'));
  assert.ok(D.validarPiscina(piscina({ longitudM: 33 })).includes('longitud'));
  assert.ok(D.validarPiscina(piscina({ numCalles: 0 })).includes('calles'));
  assert.ok(D.validarPiscina(piscina({ numCalles: 21 })).includes('calles'));
  assert.ok(D.validarPiscina(piscina({ intervaloMin: 20 })).includes('intervalo'));
  assert.ok(D.validarPiscina(piscina({ maxPorCalle: 0 })).includes('max-por-calle'));
  assert.ok(D.validarPiscina(piscina({ horario: { 1: { abre: '10:00', cierra: '09:00' } } })).includes('horario'));
  assert.ok(D.validarPiscina(piscina({ horario: {} })).includes('sin-dias'));
});

test('time overlap: [start, end) allows consecutive assignments', () => {
  assert.equal(D.solapan(60, 120, 120, 180), false);
  assert.equal(D.solapan(60, 121, 120, 180), true);
  assert.equal(D.solapan(60, 180, 90, 100), true);
});

test('overlapping lane: error; adjacent lanes or consecutive hours are not', () => {
  const a = asig({ id: 'a', calleDesde: 1, calleHasta: 3, grupoId: 'g1', entrenadorId: 'Ana' });
  const b = asig({ id: 'b', calleDesde: 3, calleHasta: 4, grupoId: 'g2', entrenadorId: 'Bruno', horaInicio: '17:30', horaFin: '18:30' });
  const c = detect([a, b]);
  assert.deepEqual(tipos(c), ['calle-solapada']);
  assert.equal(c[0].severidad, 'error');
  assert.deepEqual(c[0].params.desde, 3);
  assert.deepEqual(c[0].params.hasta, 3);
  assert.deepEqual(c[0].asignaciones.sort(), ['a', 'b']);
  assert.deepEqual(detect([a, { ...b, calleDesde: 4, calleHasta: 5 }]), []);
  assert.deepEqual(detect([a, { ...b, horaInicio: '18:00', horaFin: '19:00' }]), []);
  assert.deepEqual(detect([a, { ...b, dia: 2 }]), []);
});
function detect(as, extra, opts) { return D.detectarConflictos(datos(as, extra), opts); }

test('same lane in another pool does not clash, but the same group/coach does', () => {
  const ps = [piscina(), piscina({ id: 'p2', nombre: 'Otra' })];
  const a = asig({ id: 'a' });
  const b = asig({ id: 'b', piscinaId: 'p2' });
  const c = detect([a, b], { piscinas: ps });
  assert.deepEqual(tipos(c), ['entrenador-doble', 'grupo-doble']);
});

test('group in two places at once: error', () => {
  const c = detect([asig({ id: 'a', calleDesde: 1, calleHasta: 1 }), asig({ id: 'b', calleDesde: 4, calleHasta: 4, entrenadorId: 'Bruno' })]);
  assert.deepEqual(tipos(c), ['grupo-doble']);
});

test('same coach at the same time (case-insensitive): error', () => {
  const c = detect([asig({ id: 'a', calleDesde: 1, calleHasta: 1 }), asig({ id: 'b', calleDesde: 4, calleHasta: 4, grupoId: 'g2', entrenadorId: ' ana ' })]);
  assert.deepEqual(tipos(c), ['entrenador-doble']);
  assert.equal(c[0].params.entrenador, 'Ana');
});

test('empty coach in two assignments does not count as entrenador-doble', () => {
  const c = detect([asig({ id: 'a', entrenadorId: '' }), asig({ id: 'b', calleDesde: 4, calleHasta: 4, grupoId: 'g2', entrenadorId: '' })]);
  assert.deepEqual(tipos(c), ['sin-entrenador', 'sin-entrenador']);
});

test('lane out of range: beyond numCalles, zero, inverted and non-numeric', () => {
  for (const [d, h] of [[5, 7], [0, 2], [3, 2], ['x', 'y']]) {
    const c = detect([asig({ id: 'a', calleDesde: d, calleHasta: h })]);
    assert.deepEqual(tipos(c), ['calle-fuera-rango'], `${d}-${h}`);
  }
  assert.deepEqual(detect([asig({ calleDesde: 6, calleHasta: 6 })]), []); // the last lane is valid
  assert.deepEqual(detect([asig({ calleDesde: 1, calleHasta: 6 })]), []);
});

test('opening hours: exact edges valid, outside and closed day are errors', () => {
  assert.deepEqual(detect([asig({ horaInicio: '07:00', horaFin: '08:00' })]), []);
  assert.deepEqual(detect([asig({ horaInicio: '21:00', horaFin: '22:00' })]), []);
  assert.deepEqual(tipos(detect([asig({ horaInicio: '06:30', horaFin: '08:00' })])), ['fuera-horario']);
  assert.deepEqual(tipos(detect([asig({ horaInicio: '21:30', horaFin: '22:30' })])), ['fuera-horario']);
  const dom = detect([asig({ dia: 7 })]);
  assert.deepEqual(tipos(dom), ['fuera-horario']);
  assert.equal(dom[0].params.cerrado, true);
});

test('end time <= start and unreadable times: hora-invalida (without duplicating fuera-horario)', () => {
  for (const [i, f] of [['18:00', '18:00'], ['18:00', '17:00'], ['', '18:00'], ['17:00', '25:00']]) {
    assert.deepEqual(tipos(detect([asig({ horaInicio: i, horaFin: f })])), ['hora-invalida'], `${i}-${f}`);
  }
});

test('invalid day and non-existent pool', () => {
  assert.ok(tipos(detect([asig({ dia: 9 })])).includes('dia-invalido'));
  assert.ok(tipos(detect([asig({ dia: '' })])).includes('dia-invalido'));
  assert.deepEqual(tipos(detect([asig({ piscinaId: 'zz' })])), ['piscina-inexistente']);
});

test('capacity per lane: warning only if the maximum is exceeded; uses active swimmers', () => {
  const dos = (n, extra = {}) => detect([asig({ calleDesde: 1, calleHasta: 2 })], { nadadores: nad('g1', n), ...extra });
  assert.deepEqual(dos(16), []); // 8 per lane = maximum
  const c = dos(17);
  assert.deepEqual(tipos(c), ['capacidad']);
  assert.equal(c[0].severidad, 'aviso');
  assert.equal(c[0].params.nadadores, 17);
  assert.equal(c[0].params.calles, 2);
  assert.equal(c[0].params.max, 8);
  // inactive ones do not count
  assert.deepEqual(detect([asig({})], { nadadores: [...nad('g1', 16), ...nad('g1', 5, 'false').map((x) => ({ ...x, id: x.id + 'i' }))] }), []);
  // configurable maxPorCalle
  assert.deepEqual(tipos(detect([asig({})], { piscinas: [piscina({ maxPorCalle: 3 })], nadadores: nad('g1', 7) })), ['capacidad']);
});

test('assignment without coach: warning; without group: error; non-existent group: warning', () => {
  const c = detect([asig({ entrenadorId: '' })]);
  assert.deepEqual(tipos(c), ['sin-entrenador']);
  assert.equal(c[0].severidad, 'aviso');
  assert.deepEqual(tipos(detect([asig({ grupoId: '' })])), ['sin-grupo']);
  assert.deepEqual(tipos(detect([asig({ grupoId: 'gX' })])), ['grupo-inexistente']);
});

test('one-off exceptions: they only clash with recurring ones on the same real day or with the same date', () => {
  const rec = asig({ id: 'r', dia: 1 });
  const lunes = asig({ id: 'x', fecha: '2026-10-12', dia: 5 }); // the day is derived from the date (Monday)
  assert.deepEqual(tipos(detect([rec, lunes])), ['calle-solapada', 'entrenador-doble', 'grupo-doble']);
  const otraSemana = asig({ id: 'y', fecha: '2026-10-19' });
  assert.deepEqual(tipos(detect([lunes, otraSemana])), []);
  const mismaFecha = asig({ id: 'z', fecha: '2026-10-12' });
  assert.ok(tipos(detect([lunes, mismaFecha])).includes('calle-solapada'));
  const martes = asig({ id: 'w', fecha: '2026-10-13' });
  assert.deepEqual(detect([rec, martes]), []);
});

test('severities and order: errors before warnings and before info', () => {
  const as = [asig({ id: 'a', entrenadorId: '' }), asig({ id: 'b', grupoId: 'g2', entrenadorId: 'Bruno', horaInicio: '17:30', horaFin: '18:30' })];
  const c = detect(as, {}, { huecos: true });
  const sev = c.map((x) => x.severidad);
  assert.deepEqual(sev, [...sev].sort((x, y) => ({ error: 0, aviso: 1, info: 2 }[x] - { error: 0, aviso: 1, info: 2 }[y])));
  assert.deepEqual(D.resumenConflictos(c), { error: 1, aviso: 1, info: c.filter((x) => x.severidad === 'info').length });
  const m = D.severidadPorAsignacion(c);
  assert.equal(m.get('a'), 'error');
  assert.equal(m.get('b'), 'error');
});

test('free gaps: contiguous lanes are grouped and the minimum interval is respected', () => {
  const ps = [piscina({ numCalles: 3, horario: { 1: { abre: '08:00', cierra: '10:00' } } })];
  const h = (as) => D.detectarConflictos(datos(as, { piscinas: ps }), { huecos: true }).filter((c) => c.tipo === 'hueco-libre');
  // empty: a single gap for the 3 lanes
  let r = h([]);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].params.desde, r[0].params.hasta, r[0].params.horaInicio, r[0].params.horaFin], [1, 3, '08:00', '10:00']);
  assert.equal(r[0].severidad, 'info');
  // one assignment in lane 2 from 08:30 to 09:30
  r = h([asig({ calleDesde: 2, calleHasta: 2, horaInicio: '08:30', horaFin: '09:30', entrenadorId: 'Ana' })]);
  const txt = r.map((c) => `${c.params.desde}-${c.params.hasta} ${c.params.horaInicio}-${c.params.horaFin}`).sort();
  assert.deepEqual(txt, ['1-1 08:00-10:00', '2-2 08:00-08:30', '2-2 09:30-10:00', '3-3 08:00-10:00']);
  // assignment in lane 3: free lanes 1 and 2 share a gap and are grouped
  r = h([asig({ calleDesde: 3, calleHasta: 3, horaInicio: '08:00', horaFin: '09:00' })]);
  assert.deepEqual(r.map((c) => `${c.params.desde}-${c.params.hasta} ${c.params.horaInicio}-${c.params.horaFin}`).sort(), ['1-2 08:00-10:00', '3-3 09:00-10:00']);
  // the 15 min gap does not count with a 30 interval
  r = h([asig({ calleDesde: 1, calleHasta: 3, horaInicio: '08:15', horaFin: '10:00' })]);
  assert.equal(r.length, 0);
  // one-off assignments do not count towards gaps
  assert.equal(h([asig({ fecha: '2026-10-12' })]).length, 1);
});

test('conflictosDe: evaluates a candidate against the rest, ignoring its own version', () => {
  const existentes = [asig({ id: 'a', calleDesde: 1, calleHasta: 2 })];
  const cand = asig({ id: '', calleDesde: 2, calleHasta: 3, grupoId: 'g2', entrenadorId: 'Bruno' });
  const c = D.conflictosDe(cand, datos(existentes));
  assert.deepEqual(tipos(c), ['calle-solapada']);
  assert.ok(c[0].asignaciones.includes(D.ID_NUEVA));
  // editing itself does not clash with itself
  assert.deepEqual(D.conflictosDe({ ...existentes[0] }, datos(existentes)), []);
  assert.equal(D.bloqueante(c), true);
  assert.equal(D.soloAvisos(D.conflictosDe(asig({ id: 'n', entrenadorId: '', horaInicio: '19:00', horaFin: '20:00' }), datos(existentes))), true);
});

test('grid: rangoDia, franjas, niveles and occupancy', () => {
  const p = piscina({ horario: { 1: { abre: '08:00', cierra: '10:00' }, 2: { abre: '09:00', cierra: '12:00' } } });
  assert.deepEqual(D.rangoDia(p, 1), { desde: 480, hasta: 600 });
  assert.deepEqual(D.rangoDia(p, 3), { desde: 480, hasta: 720 }); // closed day: global range
  const fuera = D.normalizarAsignacion(asig({ horaInicio: '07:00', horaFin: '08:00' }));
  assert.deepEqual(D.rangoDia(p, 1, [fuera]), { desde: 420, hasta: 600 });
  assert.deepEqual(D.franjas(480, 600, 30), [480, 510, 540, 570]);
  const a = D.normalizarAsignacion(asig({ id: 'a', horaInicio: '08:00', horaFin: '09:00', calleDesde: 1, calleHasta: 2 }));
  const b = D.normalizarAsignacion(asig({ id: 'b', horaInicio: '08:30', horaFin: '09:30', calleDesde: 2, calleHasta: 3 }));
  const c = D.normalizarAsignacion(asig({ id: 'c', horaInicio: '09:00', horaFin: '10:00', calleDesde: 1, calleHasta: 1 }));
  const n = D.niveles([a, b, c]);
  assert.equal(n.get('a'), 0);
  assert.equal(n.get('b'), 1);
  assert.equal(n.get('c'), 0);
  const p2 = piscina({ numCalles: 2 });
  const o = D.ocupacion(p2, [D.normalizarAsignacion(asig({ calleDesde: 1, calleHasta: 1, horaInicio: '08:00', horaFin: '09:00' }))], 480, 600);
  assert.deepEqual(o, { total: 240, ocupado: 60, pct: 25 });
  // double overlap does not count twice
  const dup = [a, D.normalizarAsignacion(asig({ id: 'a2', horaInicio: '08:00', horaFin: '09:00', calleDesde: 1, calleHasta: 2 }))];
  assert.equal(D.ocupacion(p2, dup, 480, 600).ocupado, 120);
  assert.equal(D.ocupacion(p2, [], NaN, 600).pct, 0);
});

test('delDia: recurring ones of the day + one-off ones of that date', () => {
  const as = [asig({ id: 'r', dia: 3 }), asig({ id: 'p', fecha: '2026-10-14' }), asig({ id: 'q', fecha: '2026-10-21' }), asig({ id: 'o', dia: 4 }), asig({ id: 'x', piscinaId: 'p9', dia: 3 })];
  assert.deepEqual(D.delDia(as, { piscinaId: 'p1', dia: 3, fecha: '2026-10-14' }).map((a) => a.id).sort(), ['p', 'r']);
  assert.deepEqual(D.delDia(as, { piscinaId: 'p1', dia: 3 }).map((a) => a.id), ['r']);
});

test('ajustarAlReducir: trims those that overhang and flags those entirely outside', () => {
  const as = [asig({ id: 'a', calleDesde: 1, calleHasta: 2 }), asig({ id: 'b', calleDesde: 3, calleHasta: 5 }), asig({ id: 'c', calleDesde: 5, calleHasta: 6 }), asig({ id: 'd', piscinaId: 'p2', calleDesde: 5, calleHasta: 6 })];
  const r = D.ajustarAlReducir(as, 'p1', 4);
  assert.deepEqual(r.recortadas.map((x) => [x.id, x.calleHasta]), [['b', 4]]);
  assert.deepEqual(r.fuera.map((x) => x.id), ['c']);
  assert.deepEqual(D.ajustarAlReducir(as, 'p1', 6).fuera, []);
});

test('sugerirDistribucion: distributes without error conflicts and is deterministic', () => {
  const nadadores = [...nad('g1', 10), ...nad('g2', 20), ...nad('g3', 4)];
  const entrada = { piscina: piscina(), dia: 2, grupos, nadadores, asignaciones: [], duracionMin: 60, desde: '17:00', hasta: '20:00' };
  const r = D.sugerirDistribucion(entrada);
  assert.deepEqual(r.sinHueco, []);
  assert.equal(r.propuestas.length, 3);
  // g2 (20 swimmers / 8 = 3 lanes) is placed first; g1 (10 -> 2 lanes) and g3 (1 lane)
  assert.equal(r.propuestas[0].grupoId, 'g2');
  assert.equal(r.propuestas[0].calleHasta - r.propuestas[0].calleDesde + 1, 3);
  assert.equal(r.propuestas[0].horaInicio, '17:00');
  // g1 and g3 share a coach (Ana): they cannot coincide in time
  const [p1, p3] = [r.propuestas.find((p) => p.grupoId === 'g1'), r.propuestas.find((p) => p.grupoId === 'g3')];
  assert.ok(!D.solapan(D.aMin(p1.horaInicio), D.aMin(p1.horaFin), D.aMin(p3.horaInicio), D.aMin(p3.horaFin)));
  const todas = r.propuestas.map((p, i) => ({ ...p, id: 's' + i }));
  assert.equal(D.bloqueante(D.detectarConflictos(datos(todas, { nadadores }))), false);
  assert.deepEqual(D.sugerirDistribucion(entrada), r);
});

test('sugerirDistribucion: respects existing ones, closed day, lack of gap and preferences', () => {
  const nadadores = [...nad('g1', 6), ...nad('g2', 6)];
  const base = { piscina: piscina({ numCalles: 2 }), dia: 1, grupos: grupos.slice(0, 2), nadadores, duracionMin: 60, desde: '17:00', hasta: '19:00' };
  // g1 already assigned: only g2 is placed (no repeats)
  const existente = asig({ id: 'e', grupoId: 'g1', calleDesde: 1, calleHasta: 1, horaInicio: '17:00', horaFin: '18:00' });
  const r = D.sugerirDistribucion({ ...base, asignaciones: [existente] });
  assert.deepEqual(r.propuestas.map((p) => p.grupoId), ['g2']);
  assert.ok(!D.bloqueante(D.conflictosDe(r.propuestas[0], datos([existente], { piscinas: [base.piscina], nadadores }))));
  // closed day
  assert.deepEqual(D.sugerirDistribucion({ ...base, dia: 7, asignaciones: [] }).sinHueco.map((s) => s.motivo), ['cerrado', 'cerrado']);
  // one-hour window, two lanes, two groups with different coaches: they fit (one lane each); a third does not
  const tres = [{ id: 'g1', nombre: 'A', entrenador: 'X' }, { id: 'g2', nombre: 'B', entrenador: 'Y' }, { id: 'g3', nombre: 'C', entrenador: 'Z' }];
  const apretado = D.sugerirDistribucion({ ...base, grupos: tres, nadadores: [...nad('g1', 6), ...nad('g2', 6), ...nad('g3', 6)], hasta: '18:00', asignaciones: [] });
  assert.equal(apretado.propuestas.length, 2);
  assert.deepEqual(apretado.sinHueco, [{ grupoId: 'g3', motivo: 'sin-hueco' }]);
  // preferences: g2 prefers 18:00
  const pref = D.sugerirDistribucion({ ...base, asignaciones: [], soloGrupos: ['g2'], preferencias: { g2: '18:00' } });
  assert.equal(pref.propuestas[0].horaInicio, '18:00');
  // no room for the recommended number of lanes: uses fewer and flags it
  const reducida = D.sugerirDistribucion({ ...base, piscina: piscina({ numCalles: 2, maxPorCalle: 1 }), grupos: [grupos[0]], nadadores: nad('g1', 5), asignaciones: [], soloGrupos: ['g1'] });
  assert.equal(reducida.propuestas[0].calleHasta - reducida.propuestas[0].calleDesde + 1, 2);
});

test('planning i18n parity: same keys and variables in es/en/it', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [name, d] of [['en', en], ['it', it]]) {
    assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), [], 'missing in ' + name);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), [], 'orphans in ' + name);
    for (const k of Object.keys(es)) assert.equal(vars(d[k]), vars(es[k]), `${name}:${k}`);
  }
  for (const d of [es, en, it]) for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.trim(), k);
});

test('every conflict type and pool error has a translated message', () => {
  for (const tipo of Object.keys(D.TIPOS_CONFLICTO)) assert.ok(es['plan.c.' + tipo], tipo);
  assert.ok(es['plan.c.fuera-horario-cerrado']);
  for (const e of ['nombre-vacio', 'longitud', 'calles', 'intervalo', 'max-por-calle', 'horario', 'sin-dias']) assert.ok(es['plan.err.' + e], e);
  for (const s of ['error', 'aviso', 'info']) assert.ok(es['plan.sev.' + s]);
});

// ---------- Service with in-memory repository ----------
function repoMemoria() {
  const db = { Piscinas: [], AsignacionesCalle: [], Grupos: grupos.map((g) => ({ ...g })), Nadadores: [] };
  let n = 0;
  return {
    db,
    list: (s) => db[s].slice(),
    get: (s, id) => db[s].find((r) => r.id === String(id)) || null,
    upsert(s, row) {
      const r = { ...row, id: row.id ? String(row.id) : 'id' + ++n };
      const i = db[s].findIndex((x) => x.id === r.id);
      if (i >= 0) db[s][i] = r; else db[s].push(r);
      return r;
    },
    remove(s, id) { db[s] = db[s].filter((r) => r.id !== String(id)); },
  };
}

test('service: creates a pool, validates and persists the schedule as JSON', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  assert.deepEqual(svc.guardarPiscina({ ...piscina({ id: '' }), numCalles: 0 }).errores, ['calles']);
  const r = svc.guardarPiscina(piscina({ id: '' }));
  assert.ok(r.ok);
  assert.equal(typeof repo.db.Piscinas[0].horario, 'string');
  assert.equal(svc.piscinas()[0].horario[1].abre, '07:00');
});

test('service: saving an assignment blocks errors and requires forcing warnings', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  const base = { piscinaId: 'p1', dia: 1, horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 2, grupoId: 'g1', entrenadorId: 'Ana' };
  assert.ok(svc.guardarAsignacion(base).ok);
  const choque = svc.guardarAsignacion({ ...base, grupoId: 'g2', entrenadorId: 'Bruno', calleDesde: 2, calleHasta: 3 });
  assert.equal(choque.ok, false);
  assert.equal(choque.bloqueado, true);
  assert.equal(repo.db.AsignacionesCalle.length, 1);
  const aviso = svc.guardarAsignacion({ ...base, grupoId: 'g2', entrenadorId: '', horaInicio: '19:00', horaFin: '20:00' });
  assert.equal(aviso.ok, false);
  assert.equal(aviso.requiereForzar, true);
  assert.equal(repo.db.AsignacionesCalle.length, 1);
  const forzada = svc.guardarAsignacion({ ...base, grupoId: 'g2', entrenadorId: '', horaInicio: '19:00', horaFin: '20:00' }, { forzar: true });
  assert.ok(forzada.ok);
  assert.equal(repo.db.AsignacionesCalle.length, 2);
  // forcing never skips an error
  assert.equal(svc.guardarAsignacion({ ...base, horaFin: '17:00' }, { forzar: true }).ok, false);
});

test('service: reducing lanes trims and flags those left outside', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  const mk = (grupoId, d, h, ent, ini = '17:00', fin = '18:00') => svc.guardarAsignacion({ piscinaId: 'p1', dia: 1, horaInicio: ini, horaFin: fin, calleDesde: d, calleHasta: h, grupoId, entrenadorId: ent });
  mk('g1', 1, 2, 'Ana'); mk('g2', 3, 5, 'Bruno');
  repo.upsert('Grupos', { id: 'g9', nombre: 'Z', entrenador: 'Zoe' });
  assert.ok(mk('g9', 5, 6, 'Zoe', '18:00', '19:00').ok);
  const r = svc.guardarPiscina({ ...piscina(), numCalles: 4 });
  assert.equal(r.recortadas, 1);
  assert.equal(r.fuera, 1);
  const as = svc.asignaciones();
  assert.equal(as.find((a) => a.grupoId === 'g2').calleHasta, 4);
  assert.equal(as.find((a) => a.grupoId === 'g9').calleHasta, 6); // still saved, now in error
  assert.ok(svc.conflictos().some((c) => c.tipo === 'calle-fuera-rango' && c.severidad === 'error'));
});

test('service: move, duplicate, delete and cascade-delete a pool', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  const a = svc.guardarAsignacion({ piscinaId: 'p1', dia: 1, horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 2, grupoId: 'g1', entrenadorId: 'Ana' }).asignacion;
  assert.ok(svc.mover(a.id, { dia: 2 }).ok);
  assert.equal(svc.asignaciones()[0].dia, 2);
  assert.equal(svc.duplicar(a.id).ok, false); // same slot: clashes with itself
  const d = svc.duplicar(a.id, { dia: 3 });
  assert.ok(d.ok);
  assert.notEqual(d.asignacion.id, a.id);
  assert.equal(svc.mover('nope', {}).inexistente, true);
  svc.borrarAsignacion(a.id);
  assert.equal(svc.asignaciones().length, 1);
  svc.borrarPiscina('p1');
  assert.equal(svc.asignaciones().length, 0);
  assert.equal(svc.piscinas().length, 0);
});

test('service: suggest and apply creates assignments without errors; coaches without duplicates', () => {
  const repo = repoMemoria();
  repo.db.Nadadores = [...nad('g1', 10), ...nad('g2', 5)];
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  assert.deepEqual(svc.entrenadores(), ['Ana', 'Bruno']);
  const r = svc.sugerir({ piscinaId: 'p1', dia: 3, soloGrupos: ['g1', 'g2'], desde: '17:00', hasta: '20:00' });
  assert.equal(r.propuestas.length, 2);
  assert.equal(svc.aplicarSugerencia(r.propuestas), 2);
  assert.equal(svc.conflictos().filter((c) => c.severidad === 'error').length, 0);
  assert.deepEqual(svc.sugerir({ piscinaId: 'nope', dia: 1 }), { propuestas: [], sinHueco: [] });
});
