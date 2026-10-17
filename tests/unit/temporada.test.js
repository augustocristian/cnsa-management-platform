import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/temporada.js';
import { sembrarCatalogo } from '../../js/domain/cargas.js';
import * as C from '../../js/domain/calendario.js';

const tipos = sembrarCatalogo([]);
const tid = (clave) => 'tc-' + clave;
const temporada = { id: 't1', nombre: 'T', inicio: '2026-09-07', fin: '2026-11-29', activa: true, grupoId: '', notas: '' }; // 12 full weeks
const fase = (id, nombre, tipo, inicio, fin, orden = 0) => D.normalizarFase({ id, temporadaId: 't1', nombre, tipo, fechaInicio: inicio, fechaFin: fin, orden });
const sp = (lunes, volumen, contenidos = {}, extra = {}) => D.normalizarSemanaPlan({ id: 'x' + lunes, temporadaId: 't1', lunes, volumenPrevisto: volumen, contenidos, ...extra });
const resumen = (o = {}) => D.resumenSemanas({ temporada, tipos, hoy: '2026-10-14', ...o });

test('generarSemanas: Monday to Sunday, numbered, across a year change', () => {
  const s = D.generarSemanas('2026-12-28', '2027-01-17');
  assert.deepEqual(s.map((x) => [x.n, x.lunes, x.domingo]), [[1, '2026-12-28', '2027-01-03'], [2, '2027-01-04', '2027-01-10'], [3, '2027-01-11', '2027-01-17']]);
  assert.ok(s.every((x) => !x.parcial));
  assert.equal(C.diaSemana(s[0].lunes), 0, 'each week starts on Monday');
});

test('generarSemanas: partial weeks at the start and end, leap year and invalid inputs', () => {
  const s = D.generarSemanas('2027-02-24', '2027-03-03'); // Wednesday to Wednesday
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].lunes, s[0].desde, s[0].hasta, s[0].parcial], ['2027-02-22', '2027-02-24', '2027-02-28', true]);
  assert.deepEqual([s[1].lunes, s[1].desde, s[1].hasta], ['2027-03-01', '2027-03-01', '2027-03-03']);
  assert.equal(D.generarSemanas('2028-02-28', '2028-03-06').length, 2); // 29 Feb 2028 exists
  assert.deepEqual(D.generarSemanas('2026-09-07', '2026-09-01'), []);
  assert.deepEqual(D.generarSemanas('nada', '2026-09-01'), []);
  assert.equal(D.generarSemanas('2026-01-01', '2036-01-01').length, D.MAX_SEMANAS, 'cap on weeks');
  assert.equal(D.semanaDeFecha(D.generarSemanas('2026-09-07', '2026-09-27'), '2026-09-15'), 2);
  assert.equal(D.semanaDeFecha(D.generarSemanas('2026-09-07', '2026-09-27'), '2026-10-15'), 0);
});

test('normalisation: round trip of season, phase, week and event', () => {
  const t = D.normalizarTemporada({ id: 5, nombre: ' A ', fechaInicio: '2026-09-07T00:00', fechaFin: '2027-05-30', activa: 'TRUE', grupoId: 'g3' });
  assert.deepEqual([t.id, t.nombre, t.inicio, t.activa], ['5', 'A', '2026-09-07', true]);
  assert.equal(D.filaTemporada(t).activa, 'true');
  const f = D.normalizarFase({ id: 'f', tipo: 'rara', fechaInicio: '2026-09-07', fechaFin: '2026-09-20', color: 'zzz' });
  assert.equal(f.tipo, 'personalizado');
  assert.equal(f.color, D.COLOR_FASE.personalizado);
  const s = D.normalizarSemanaPlan({ temporadaId: 't1', lunes: '2026-09-07', volumenPrevisto: '9500', contenidos: '{"tc-piernas":"500","x":0}', intensidad: '11' });
  assert.deepEqual([s.volumen, s.contenidos, s.intensidad], [9500, { 'tc-piernas': 500 }, null]);
  assert.equal(D.filaSemanaPlan(s).id, 'sp-t1-2026-09-07');
  assert.equal(D.semanaPlanVacia(D.normalizarSemanaPlan({})), true);
  const e = D.normalizarEvento({ tipo: 'competicion', nombre: 'X', fechaInicio: '2026-10-10', prioridad: 'b' });
  assert.deepEqual([e.fin, e.prioridad], ['2026-10-10', 'B']);
  assert.equal(D.normalizarEvento({ tipo: '??' }).tipo, 'otro');
});

test('validations of season, phase, event and week', () => {
  const cod = (e) => e.map((x) => x.codigo);
  assert.deepEqual(cod(D.validarTemporada({ nombre: '', inicio: 'x', fin: '' })), ['nombre-vacio', 'fecha-invalida', 'fecha-invalida']);
  assert.deepEqual(cod(D.validarTemporada({ nombre: 'T', inicio: '2026-09-10', fin: '2026-09-01' })), ['fin-antes-inicio']);
  assert.deepEqual(cod(D.validarTemporada({ nombre: 'T', inicio: '2026-09-01', fin: '2026-12-01' })), []);
  assert.deepEqual(cod(D.validarFase({ nombre: 'F', tipo: 'otra', inicio: '2026-09-01', fin: '2026-09-02' })), ['tipo-invalido']);
  assert.deepEqual(cod(D.validarFase({ nombre: 'F', tipo: 'competitiva', inicio: '2026-09-05', fin: '2026-09-02', color: 'rojo' })), ['fin-antes-inicio', 'color-invalido']);
  assert.deepEqual(cod(D.validarEvento({ nombre: 'C', tipo: 'competicion', inicio: '2026-10-10' })), ['prioridad-requerida']);
  assert.deepEqual(cod(D.validarEvento({ nombre: 'C', tipo: 'competicion', inicio: '2026-10-10', prioridad: 'A' })), []);
  assert.deepEqual(cod(D.validarEvento({ nombre: 'C', tipo: 'test', inicio: '2026-10-10', prioridad: 'Z' })), ['prioridad-invalida']);
  assert.deepEqual(cod(D.validarEvento({ nombre: 'C', tipo: 'test', inicio: '2026-10-10', fin: '2026-10-09' })), ['fin-antes-inicio']);
  assert.deepEqual(cod(D.validarSemanaPlan({ volumen: '-3', intensidad: '12' })), ['volumen-invalido', 'intensidad-invalida']);
  assert.deepEqual(cod(D.validarSemanaPlan({ volumen: '', intensidad: '', contenidos: { a: 'x' } })), ['contenido-invalido']);
});

test('phase of each week: the one covering most days; no phase outside ranges', () => {
  const fs = [fase('a', 'A', 'preparacion-general', '2026-09-07', '2026-09-23'), fase('b', 'B', 'competitiva', '2026-09-24', '2026-11-29')];
  const sem = D.generarSemanas(temporada.inicio, temporada.fin);
  assert.equal(D.faseDeSemana(fs, sem[0]).id, 'a');
  assert.equal(D.faseDeSemana(fs, sem[2]).id, 'b', 'week 21-27 Sep: 3 days of A and 4 of B -> B');
});

test('validarPlan: overlapping phases (error), gaps and outside the season (warning)', () => {
  const fs = [fase('a', 'A', 'preparacion-general', '2026-09-07', '2026-09-27'), fase('b', 'B', 'competitiva', '2026-09-21', '2026-10-11'), fase('c', 'C', 'tapering', '2026-10-26', '2026-12-13')];
  const ev = [D.normalizarEvento({ id: 'e', tipo: 'competicion', nombre: 'Fuera', fechaInicio: '2027-01-10', prioridad: 'A' })];
  const v = D.validarPlan({ temporada, fases: fs, eventos: ev });
  const sol = v.find((x) => x.tipo === 'fases-solapadas');
  assert.equal(sol.severidad, 'error');
  assert.deepEqual([sol.params.desde, sol.params.hasta, sol.params.dias], ['2026-09-21', '2026-09-27', 7]);
  const huecos = v.filter((x) => x.tipo === 'hueco-fases');
  assert.deepEqual(huecos.map((x) => [x.params.desde, x.params.hasta, x.params.semanas]), [['2026-10-12', '2026-10-25', 2]]);
  assert.ok(v.some((x) => x.tipo === 'fase-fuera-temporada' && x.faseIds[0] === 'c'));
  assert.ok(v.some((x) => x.tipo === 'evento-fuera-temporada' && x.eventoId === 'e'));
  assert.equal(D.hayErrores(v), true);
  assert.deepEqual(D.validarPlan({ temporada, fases: [], eventos: [] }).map((x) => x.tipo), ['sin-fases']);
  assert.deepEqual(D.fasesQueSolapan({ id: 'z', inicio: '2026-09-01', fin: '2026-09-08' }, fs).map((f) => f.id), ['a']);
});

test('fasesPorDefecto: cover the whole season with no gaps or overlaps', () => {
  for (const [i, f] of [['2026-09-07', '2027-05-30'], ['2026-12-28', '2027-03-21'], ['2026-09-09', '2026-12-06']]) {
    const fs = D.fasesPorDefecto(i, f, (t) => t).map((x, k) => D.normalizarFase({ ...x, id: 'f' + k, fechaInicio: x.inicio, fechaFin: x.fin }));
    const v = D.validarPlan({ temporada: { inicio: i, fin: f }, fases: fs, eventos: [] });
    assert.deepEqual(v.map((x) => x.tipo), [], `${i}..${f}`);
    assert.equal(fs[0].inicio, i);
    assert.equal(fs[fs.length - 1].fin, f);
  }
  assert.equal(D.fasesPorDefecto('2026-09-07', '2026-09-20').length, 1, 'short season: a single phase');
});

test('classify plan contents: exact name, rules and inheritance within the set', () => {
  assert.equal(D.clasificarContenido('Piernas', tipos), tid('piernas'));
  assert.equal(D.clasificarContenido('aerobico ligero', tipos), tid('aerobico-ligero'));
  assert.equal(D.clasificarContenido('Calentamiento', tipos), tid('aerobico-ligero'));
  assert.equal(D.clasificarContenido('Aeróbico intenso', tipos), tid('aerobico-intenso'));
  assert.equal(D.clasificarContenido('Aeróbico', tipos), tid('aerobico-medio'));
  assert.equal(D.clasificarContenido('Velocidad', tipos), tid('alactico'));
  assert.equal(D.clasificarContenido('Tec Prueba', tipos), tid('tecnica'));
  assert.equal(D.clasificarContenido('algo raro', tipos), '');
  const propio = [...tipos, { id: 'x1', nombre: 'Gimnasio', activo: true, predefinido: false, orden: 99 }];
  assert.equal(D.clasificarContenido('Sesión de gimnasio', propio), 'x1');
  const lineas = [
    { set: 1, orden: 1, objetivo: 'Calentamiento', series: 1, distancia: 300 },
    { set: 1, orden: 2, series: 4, distancia: 50 }, // inherits Calentamiento
    { set: 2, orden: 1, objetivo: 'Piernas', series: 8, distancia: 50 },
    { set: 3, orden: 1, objetivo: 'Cosa rara', series: 2, distancia: 100 },
    { set: 4, orden: 1, series: 1, distancia: 100 }, // no label: not classifiable
  ];
  const v = D.volumenPlanSesion(lineas, tipos);
  assert.equal(v.total, 300 + 200 + 400 + 200 + 100);
  assert.equal(v.metros[tid('aerobico-ligero')], 500);
  assert.equal(v.metros[tid('piernas')], 400);
  assert.equal(v.sinClasificar, 300);
});

const sesiones = [
  { id: 's1', fecha: '2026-09-08', grupoId: 'g3', estado: 'realizado', volumenMin: 3000, volumenMax: 3400 },
  { id: 's2', fecha: '2026-09-10', grupoId: 'g3', estado: 'realizado', volumenMin: '', volumenMax: '' },
  { id: 's3', fecha: '2026-09-09', grupoId: 'g1', estado: 'realizado', volumenMin: 1000, volumenMax: 1000 },
  { id: 's4', fecha: '2026-09-15', grupoId: 'g3', estado: 'planificado' },
];
const lineas = [
  { id: 'l1', entrenamientoId: 's2', set: 1, orden: 1, objetivo: 'Piernas', series: 10, distancia: 100 },
  { id: 'l2', entrenamientoId: 's4', set: 1, orden: 1, objetivo: 'Aeróbico', series: 5, distancia: 200 },
];
const nadadores = [{ id: 'n1', grupoId: 'g3' }, { id: 'n2', grupoId: 'g3' }, { id: 'n3', grupoId: 'g1' }];
const cargas = [
  { id: 'c1', nadadorId: 'n1', fecha: '2026-09-08', metros: 4000, tipo: 'Aeróbico ligero' },
  { id: 'c2', nadadorId: 'n2', fecha: '2026-09-08', metros: 3000, tipo: 'Aeróbico ligero' },
  { id: 'c3', nadadorId: 'n1', fecha: '2026-09-10', metros: 2000, tipo: 'Piernas' },
  { id: 'c4', nadadorId: 'n3', fecha: '2026-09-09', metros: 9999, tipo: 'Piernas' },
];

test('real aggregates: plans (with estimate) and loads (average per swimmer, filtering by group)', () => {
  const lpm = new Map([['s2', [lineas[0]]], ['s4', [lineas[1]]]]);
  const g3 = D.agregarPlanes({ sesiones, lineasPorSesion: lpm, tipos, desde: '2026-09-07', hasta: '2026-09-13', grupoId: 'g3' });
  assert.equal(g3.total, 3200 + 1000);
  assert.equal(g3.metros[tid('piernas')], 1000);
  assert.equal(g3.sinClasificar, 3200, 'session without lines: estimated with the average of its target volume');
  assert.deepEqual([g3.sesiones, g3.realizadas, g3.estimadas], [2, 2, 1]);
  const todos = D.agregarPlanes({ sesiones, lineasPorSesion: lpm, tipos, desde: '2026-09-07', hasta: '2026-09-13' });
  assert.equal(todos.grupos, 2);
  assert.equal(todos.total, (3200 + 1000 + 1000) / 2, 'average per group');
  const cg = D.agregarCargas({ cargas, nadadores, tipos, desde: '2026-09-07', hasta: '2026-09-13', grupoId: 'g3' });
  assert.equal(cg.total, 4500, '(4000 + 3000 + 2000) / 2 swimmers with load');
  assert.equal(cg.metros[tid('aerobico-ligero')], 3500);
  assert.equal(D.agregarCargas({ cargas, nadadores, tipos, desde: '2026-09-07', hasta: '2026-09-13', grupoId: 'gX' }).total, 0);
});

test('deviation and status: in range, low, high and no forecast', () => {
  assert.deepEqual(D.desviacion(10000, 10500), { abs: 500, pct: 5, estado: 'en-rango' });
  assert.equal(D.desviacion(10000, 11000).estado, 'en-rango', 'right at the 10 % limit');
  assert.equal(D.desviacion(10000, 8200).estado, 'bajo');
  assert.equal(D.desviacion(10000, 8200).pct, -18);
  assert.equal(D.desviacion(10000, 12000).estado, 'alto');
  assert.deepEqual(D.desviacion(0, 500), { abs: 500, pct: null, estado: 'sin-previsto' });
  assert.equal(D.desviacion(10000, 8200, 0.25).estado, 'en-rango');
});

test('resumenSemanas: forecast vs actual, source, statuses and cumulative totals', () => {
  const fs = [fase('a', 'A', 'preparacion-general', '2026-09-07', '2026-09-27'), fase('b', 'B', 'competitiva', '2026-09-28', '2026-11-29')];
  const planes = [sp('2026-09-07', 4500, { [tid('aerobico-ligero')]: 3000, [tid('piernas')]: 1500 }), sp('2026-09-14', 5000), sp('2026-09-21', 5000)];
  const r = resumen({ fases: fs, semanasPlan: planes, sesiones: sesiones.map((s) => ({ ...s })), lineas, cargas, nadadores: [...nadadores], eventos: [], hoy: '2026-09-17' });
  const temp = { ...temporada, grupoId: 'g3' };
  const r3 = D.resumenSemanas({ temporada: temp, tipos, fases: fs, semanasPlan: planes, sesiones, lineas, cargas, nadadores, eventos: [], hoy: '2026-09-17' });
  assert.equal(r3.length, 12);
  const s1 = r3[0];
  assert.deepEqual([s1.real.fuente, s1.real.total], ['cargas', 4500]);
  assert.equal(s1.desv.estado, 'en-rango');
  assert.equal(s1.tiempo, 'pasada');
  assert.equal(s1.fase.id, 'a');
  const piernas = s1.contenidos.find((c) => c.tipo.id === tid('piernas'));
  assert.deepEqual([piernas.previsto, piernas.real, piernas.desv.estado], [1500, 1000, 'bajo']);
  const ligero = s1.contenidos.find((c) => c.tipo.id === tid('aerobico-ligero'));
  assert.deepEqual([ligero.previsto, ligero.real, ligero.desv.estado], [3000, 3500, 'alto']);
  const s2 = r3[1];
  assert.deepEqual([s2.tiempo, s2.real.fuente, s2.real.total], ['actual', 'planes', 1000], 'without loads: uses the training plans');
  assert.equal(s2.estado, 'bajo');
  assert.equal(r3[2].estado, 'pendiente', 'future without data');
  assert.equal(r3[3].estado, 'sin-previsto');
  assert.equal(s1.acumPrevisto, 4500);
  assert.equal(r3[2].acumPrevisto, 14500);
  assert.equal(r3[2].acumReal, null, 'future weeks do not accumulate actuals');
  assert.equal(r3[1].acumReal, 5500);
  // forced source
  const soloPlanes = D.resumenSemanas({ temporada: temp, tipos, fases: fs, semanasPlan: planes, sesiones, lineas, cargas, nadadores, hoy: '2026-09-17', fuente: 'planes' });
  assert.equal(soloPlanes[0].real.fuente, 'planes');
  assert.equal(soloPlanes[0].real.total, 4200);
  assert.equal(r.length, 12);
});

test('totals per phase and season cumulative', () => {
  const fs = [fase('a', 'A', 'preparacion-general', '2026-09-07', '2026-09-20'), fase('b', 'B', 'competitiva', '2026-09-21', '2026-11-29')];
  const planes = [sp('2026-09-07', 4500), sp('2026-09-14', 5000), sp('2026-09-21', 6000)];
  const temp = { ...temporada, grupoId: 'g3' };
  const sem = D.resumenSemanas({ temporada: temp, tipos, fases: fs, semanasPlan: planes, sesiones, lineas, cargas, nadadores, hoy: '2026-09-17' });
  const tot = D.totales(sem, fs);
  assert.equal(tot.fases.length, 2);
  const a = tot.fases[0];
  assert.deepEqual([a.fase.id, a.semanas, a.previsto, a.previstoHastaHoy, a.real], ['a', 2, 9500, 9500, 5500]);
  assert.equal(a.desv.estado, 'bajo');
  assert.equal(tot.fases[1].previsto, 6000);
  assert.equal(tot.fases[1].real, 0, 'no actual without started weeks');
  assert.equal(tot.total.previsto, 15500);
  assert.equal(tot.total.previstoHastaHoy, 9500);
});

test('suggestions: content below target, run-up to an A competition, tapering and weeks without forecast', () => {
  // 12 weeks, today in week 7; weeks 1-6 have a forecast of 3000 medium aerobic and an actual of 2400 (-20 %).
  const fs = [fase('a', 'A', 'preparacion-general', '2026-09-07', '2026-10-25'), fase('t', 'Tapering', 'tapering', '2026-11-16', '2026-11-29')];
  const planes = [];
  for (let i = 0; i < 12; i++) planes.push(sp(C.addDias('2026-09-07', i * 7), 10000, { [tid('aerobico-medio')]: 3000 }));
  const cg = [];
  for (let i = 0; i < 6; i++) cg.push({ id: 'k' + i, nadadorId: 'n1', fecha: C.addDias('2026-09-08', i * 7), metros: 10000, tipo: 'Aeróbico medio / Umbral anaeróbico' });
  // the actual per content above: 10000 in medium aerobic => high; for the "low" case it is split with another type
  cg.forEach((c, i) => { c.metros = 2400; });
  cg.push(...Array.from({ length: 6 }, (_, i) => ({ id: 'o' + i, nadadorId: 'n1', fecha: C.addDias('2026-09-09', i * 7), metros: 7600, tipo: 'Piernas' })));
  const ev = [D.normalizarEvento({ id: 'ea', tipo: 'competicion', nombre: 'Campeonato', fechaInicio: '2026-11-08', prioridad: 'A' })];
  const sem = D.resumenSemanas({ temporada, tipos, fases: fs, semanasPlan: planes, eventos: ev, cargas: cg, nadadores: [{ id: 'n1', grupoId: 'g3' }], sesiones: [], lineas: [], hoy: '2026-10-21' });
  const sug = D.sugerencias({ semanas: sem, tipos, hoy: '2026-10-21' });
  const bajo = sug.find((s) => s.codigo === 'contenido-bajo');
  assert.ok(bajo, 'there is a medium aerobic suggestion');
  assert.equal(bajo.params.tipoId, tid('aerobico-medio'));
  assert.equal(bajo.params.pct, -20);
  assert.equal(bajo.accion.tipo, 'anadir-contenido');
  assert.ok(bajo.accion.metros > 0 && bajo.accion.metros % 50 === 0);
  // run-up to the A competition (week 9, 2 and 1 weeks before = 7 and 8): they drop 15 % and 30 % of the average of the 3 previous
  const previa = sug.filter((s) => s.codigo === 'previa-competicion');
  assert.deepEqual(previa.map((s) => [s.semana, s.accion.volumen]), [[7, 8500], [8, 7000]]);
  assert.equal(previa[0].params.evento, 'Campeonato');
  // tapering (weeks 11-12): 80 % and 50 % of the average of the 3 weeks before the phase (10000 each)
  const tap = sug.filter((s) => s.codigo === 'tapering');
  assert.deepEqual(tap.map((s) => [s.semana, s.accion.volumen]), [[11, 8000], [12, 5000]]);
  assert.ok(!sug.some((s) => s.codigo === 'sin-previsto'));
  // future weeks without forecast
  const sin = D.sugerencias({ semanas: D.resumenSemanas({ temporada, tipos, fases: fs, semanasPlan: [], hoy: '2026-10-21' }), tipos, hoy: '2026-10-21' });
  assert.deepEqual(sin.map((s) => s.codigo), ['sin-previsto']);
  assert.equal(sin[0].params.n, 6);
  // already reduced: not suggested
  const planesOk = planes.map((p) => (p.lunes === '2026-10-19' ? { ...p, volumen: 8000 } : p.lunes === '2026-10-26' ? { ...p, volumen: 6000 } : p));
  const sem2 = D.resumenSemanas({ temporada, tipos, fases: fs, semanasPlan: planesOk, eventos: ev, hoy: '2026-10-21' });
  assert.equal(D.sugerencias({ semanas: sem2, tipos, hoy: '2026-10-21' }).filter((s) => s.codigo === 'previa-competicion').length, 0);
  // apply an action
  assert.deepEqual(D.aplicarAccion(sem, previa[1].accion), { n: 8, lunes: '2026-10-26', volumen: 7000, contenidos: { [tid('aerobico-medio')]: 2100 } });
  const aniadido = D.aplicarAccion(sem, bajo.accion);
  assert.equal(aniadido.volumen, 10000 + bajo.accion.metros);
  assert.equal(aniadido.contenidos[tid('aerobico-medio')], 3000 + bajo.accion.metros);
});

test('tools: adjust ± %, move weeks, copy and phase templates', () => {
  const planes = [sp('2026-09-07', 10000, { [tid('piernas')]: 1000 }), sp('2026-09-14', 11000), sp('2026-09-28', 9000)];
  const sem = D.resumenSemanas({ temporada, tipos, semanasPlan: planes, hoy: '2026-09-01' });
  const aj = D.ajustarVolumenes(sem, { desde: 1, hasta: 4, pct: -15 });
  assert.deepEqual(aj.map((c) => [c.n, c.antes, c.despues]), [[1, 10000, 8500], [2, 11000, 9350], [4, 9000, 7650]]);
  assert.deepEqual(aj[0].contenidos, { [tid('piernas')]: 850 });
  assert.deepEqual(D.ajustarVolumenes(sem, { desde: 1, hasta: 4, pct: -150 }), []);
  const mv = D.desplazarPlan(sem, { desde: 1, hasta: 2, k: 2 });
  assert.deepEqual(mv.map((c) => [c.n, c.antes, c.despues]), [[1, 10000, null], [2, 11000, null], [3, null, 10000], [4, 9000, 11000]]);
  assert.deepEqual(D.copiarPlanSemana(sem[0].plan), { volumen: 10000, contenidos: { [tid('piernas')]: 1000 }, intensidad: null, objetivo: '', notas: '' });
  // template: the split adds up to the volume and only respects active contents
  const pl = D.aplicarPlantillaFase(sem, { nIni: 1, nFin: 4, tipo: 'preparacion-general', volumenBase: 10000, tipos });
  assert.deepEqual(pl.map((x) => x.volumen), [9000, 10000, 10800, 7500]);
  pl.forEach((x) => assert.equal(D.sumaContenidos(x.contenidos), x.volumen));
  const sinPiernas = tipos.map((t) => (t.id === tid('piernas') ? { ...t, activo: false } : t));
  const pl2 = D.aplicarPlantillaFase(sem, { nIni: 1, nFin: 1, tipo: 'competitiva', volumenBase: 10000, tipos: sinPiernas });
  assert.ok(!(tid('piernas') in pl2[0].contenidos));
  assert.equal(D.sumaContenidos(pl2[0].contenidos), 10000);
  const tap = D.aplicarPlantillaFase(sem, { nIni: 1, nFin: 2, tipo: 'tapering', volumenBase: 10000, tipos });
  assert.deepEqual(tap.map((x) => x.volumen), [8000, 5000]);
  assert.equal(D.volumenBaseSugerido(sem, 1, 4), 10000);
  assert.equal(D.volumenBaseSugerido(sem, 6, 8), 9000, 'no forecast in the phase: average of the previous weeks');
});

test('season events for the calendar and the .ics (registrable source)', () => {
  const datos = {
    Grupos: [{ id: 'g3', nombre: 'Infantil' }], Entrenamientos: [],
    EventosTemporada: [
      { id: 'e1', temporadaId: 't1', tipo: 'competicion', nombre: 'Campeonato, Asturias', fechaInicio: '2026-11-06', fechaFin: '2026-11-08', lugar: 'Avilés', prioridad: 'A', pruebas: '100 libre', grupoId: 'g3', notas: 'Principal' },
      { id: 'e2', temporadaId: 't1', tipo: 'test', nombre: 'Test', fechaInicio: '2026-12-01', fechaFin: '', prioridad: '' },
    ],
  };
  const evs = D.eventosDeTemporada(datos, { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(evs.map((e) => e.fecha), ['2026-11-06', '2026-11-07', '2026-11-08']);
  assert.equal(evs[0].titulo, 'Campeonato, Asturias (A)');
  assert.equal(evs[0].hora, '');
  assert.equal(evs[0].grupoNombre, 'Infantil');
  assert.match(evs[1].descripcion, /Día 2 de 3/);
  assert.match(evs[0].descripcion, /Pruebas: 100 libre/);
  assert.equal(D.eventosDeTemporada(datos, { desde: '2026-11-07', hasta: '2026-11-07' }).length, 1, 'only the days in the range');
  C.registrarFuente(D.FUENTE_CALENDARIO);
  C.registrarFuente(D.FUENTE_CALENDARIO);
  assert.equal(C.FUENTES_EVENTOS.filter((f) => f.id === 'temporada').length, 1, 'registering twice does not duplicate');
  const todos = C.eventosEnRango(datos, { desde: '2026-11-01', hasta: '2026-12-31' });
  assert.equal(todos.filter((e) => e.origen === 'temporada').length, 4);
  const ics = C.generarICS(todos, { ahora: new Date(Date.UTC(2026, 9, 1)) });
  assert.match(ics, /SUMMARY:Campeonato\\, Asturias \(A\)/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261107/);
  assert.match(ics, /LOCATION:Avilés/);
  assert.equal(D.colorEventoCalendario({ origen: 'sesion' }), null);
  assert.deepEqual(D.colorEventoCalendario(evs[0]), { semantico: 'danger' }, 'priority A is the danger tone (no hex in the domain)');
});

test('temporadaDemo: phases with continuous dates, weeks with forecast and events of different priority', () => {
  const d = D.temporadaDemo({ hoy: '2026-10-15', grupoId: 'g3', tipos });
  const t = D.normalizarTemporada(d.temporada);
  assert.equal(t.nombre, 'Temporada 2026-27');
  assert.equal(C.diaSemana(t.inicio), 0);
  const fs = d.fases.map(D.normalizarFase);
  const ev = d.eventos.map(D.normalizarEvento);
  assert.deepEqual(D.validarPlan({ temporada: t, fases: fs, eventos: ev }), [], 'no overlaps, gaps or events outside');
  assert.equal(d.semanas.length, D.generarSemanas(t.inicio, t.fin).length);
  assert.ok(d.semanas.every((s) => D.normalizarSemanaPlan(s).volumen > 0));
  const comps = ev.filter((e) => e.tipo === 'competicion');
  assert.ok(comps.length >= 3 && new Set(comps.map((e) => e.prioridad)).size >= 3, 'competitions A, B and C');
  assert.deepEqual(fs.map((f) => f.tipo), ['preparacion-general', 'preparacion-especifica', 'competitiva', 'tapering', 'transicion']);
  // the demo data window always falls inside the season
  const lejos = D.temporadaDemo({ hoy: '2026-07-20', tipos, desdeFecha: '2026-06-29' });
  assert.ok(lejos.temporada.fechaInicio <= '2026-06-01');
});
