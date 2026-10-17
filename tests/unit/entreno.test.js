import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const D = await importApp('js/domain/entreno.js');

// Plan from the club's sample PDF (Thursday 15/10/26, Alevín): 3060 m and 88 min
const EJEMPLO = [
  {
    set: 1,
    orden: 1,
    tiempoMin: 7,
    objetivo: 'Calentamiento',
    series: 1,
    distancia: 300,
    ejercicio: '100suave+100Lig+100prog',
  },
  { set: 1, orden: 2, tiempoMin: 6, series: 4, distancia: 50, ejercicio: '25tec/25N. 1xEstilo' },
  { set: 1, orden: 3, tiempoMin: 4, series: 2, distancia: 50, ejercicio: 'Pn. 25 flecha crol/25 Pn E' },
  { set: 1, orden: 4, tiempoMin: 6, series: 4, distancia: 50, ejercicio: 'Prog 1-4. Sin acabar atope' },
  {
    set: 2,
    orden: 1,
    tiempoMin: 12,
    objetivo: 'Piernas',
    series: 8,
    distancia: 50,
    salida: 'C/1\'10"',
    ejercicio: 'Pn C',
    material: 'Tabla',
  },
  {
    set: 3,
    orden: 1,
    tiempoMin: 14,
    objetivo: 'Aerobico',
    series: 6,
    distancia: 100,
    salida: 'd/15"',
    ejercicio: 'C AeL ritmo uniforme',
  },
  {
    set: 3,
    orden: 2,
    tiempoMin: 10,
    bloque: 'Tec Prueba',
    series: 4,
    distancia: 100,
    ejercicio: '1C/1E/1C/1X c salida',
  },
  { set: 3, orden: 3, tiempoMin: 14, series: 6, distancia: 100, ejercicio: 'Suave, tecnica perfecta' },
  { set: 4, orden: 1, tiempoMin: 10, series: 4, distancia: 15, ejercicio: 'Tomas relevos' },
  { set: 5, orden: 1, tiempoMin: 5, objetivo: 'vuelta a la calma', series: 1, distancia: 200, ejercicio: 'Suave' },
  { set: 5, orden: 2, ejercicio: 'Estiramientos' },
];

test('totals: row, set and session as in the example (88 min, 3060 m)', () => {
  assert.equal(D.distanciaBloque({ series: 4, distancia: 50 }), 200);
  assert.equal(D.distanciaBloque({ series: '6', distancia: '100' }), 600);
  assert.equal(D.distanciaBloque({ series: '', distancia: 200 }), 200, 'empty series with a distance = 1');
  assert.equal(D.distanciaBloque({ series: 4, distancia: '' }), 0);
  const sets = D.agruparSets(EJEMPLO);
  assert.deepEqual(
    sets.map((s) => s.distSet),
    [800, 400, 1600, 60, 200],
  );
  assert.deepEqual(
    sets.map((s) => s.tiempoMin),
    [23, 12, 38, 10, 5],
  );
  assert.deepEqual(D.totales(EJEMPLO), { metros: 3060, tiempoMin: 88, sets: 5, filas: 11 });
});

test('totals ignore empty rows and do not fail with non-numeric values', () => {
  const t = D.totales([
    { set: 1, orden: 1 },
    { set: 1, orden: 2, series: 2, distancia: 100, tiempoMin: 5 },
    { set: 2, orden: 1, series: 'x', distancia: 50 },
  ]);
  assert.equal(t.metros, 200);
  assert.equal(t.tiempoMin, 5);
  assert.equal(t.filas, 2);
  assert.equal(t.sets, 2);
});

test('summary: distinct objectives and breakdown per set', () => {
  const r = D.resumen(EJEMPLO);
  assert.deepEqual(r.objetivos, ['Calentamiento', 'Piernas', 'Aerobico', 'vuelta a la calma']);
  assert.equal(r.porSet.length, 5);
  assert.equal(r.porSet[2].metros, 1600);
  assert.equal(r.metros, 3060);
});

test('parsearSalida: cycle C/1\'10" and rest d/15" in their variants', () => {
  const casos = [
    ['C/1\'10"', 'ciclo', 70, 'C/1\'10"'],
    ["c/1'10''", 'ciclo', 70, 'C/1\'10"'],
    ['C/1:10', 'ciclo', 70, 'C/1\'10"'],
    ["cada 1'30", 'ciclo', 90, 'C/1\'30"'],
    ['d/15"', 'descanso', 15, 'd/15"'],
    ["D/15''", 'descanso', 15, 'd/15"'],
    ['descanso 20s', 'descanso', 20, 'd/20"'],
    ["C/2'", 'ciclo', 120, "C/2'"],
    ['1\'10"', 'ciclo', 70, 'C/1\'10"'],
    ['C/45"', 'ciclo', 45, 'C/45"'],
    ['C/1\'05"', 'ciclo', 65, 'C/1\'05"'],
  ];
  for (const [txt, tipo, seg, canon] of casos) {
    const p = D.parsearSalida(txt);
    assert.equal(p.valido, true, txt);
    assert.equal(p.tipo, tipo, txt);
    assert.equal(p.segundos, seg, txt);
    assert.equal(p.texto, canon, txt);
  }
  assert.equal(D.parsearSalida('').vacio, true);
  assert.equal(D.parsearSalida('   ').valido, true);
  for (const mal of ['xx', 'C/', 'C/abc', 'd/-', 'libre y suave'])
    assert.equal(D.parsearSalida(mal).valido, false, mal);
});

test('estimated time: only for cycle intervals', () => {
  assert.equal(D.segundosEstimados({ series: 8, distancia: 50, salida: 'C/1\'10"' }), 560);
  assert.equal(D.segundosEstimados({ series: 6, distancia: 100, salida: 'd/15"' }), 0);
  assert.equal(D.segundosEstimados({ series: 6, distancia: 100, salida: '' }), 0);
});

test('validarLinea: invalid numbers are errors and an unknown interval is a warning', () => {
  const v = D.validarLinea(
    D.normalizarLinea({ set: 1, orden: 2, series: 'cuatro', distancia: '1x', tiempoMin: 'ya', salida: 'rapido' }),
  );
  const por = (c) => v.find((x) => x.codigo === c);
  assert.equal(por('series-no-numerica').severidad, 'error');
  assert.equal(por('distancia-no-numerica').severidad, 'error');
  assert.equal(por('tiempo-no-numerico').severidad, 'error');
  assert.equal(por('salida-invalida').severidad, 'aviso');
  assert.deepEqual([por('series-no-numerica').set, por('series-no-numerica').orden], [1, 2]);
  assert.deepEqual(D.validarLinea(D.normalizarLinea({ series: 4, distancia: 50, tiempoMin: 6, salida: 'd/15"' })), []);
  assert.equal(D.validarLinea(D.normalizarLinea({ series: -2, distancia: 50 }))[0].codigo, 'numero-negativo');
  assert.equal(D.validarLinea(D.normalizarLinea({ series: 1.5, distancia: 50 }))[0].codigo, 'series-no-numerica');
  assert.equal(D.validarLinea(D.normalizarLinea({ series: 4 }))[0].codigo, 'sin-distancia');
  // decimal comma accepted in time
  assert.deepEqual(D.validarLinea(D.normalizarLinea({ series: 1, distancia: 50, tiempoMin: '2,5' })), []);
});

test('validarSesion: warning if the total distance differs from the recorded load (10 % tolerance)', () => {
  const lin = EJEMPLO;
  const ok = D.validarSesion({ lineas: lin, cargaMedia: 3100 });
  assert.equal(
    ok.some((a) => a.codigo === 'distancia-difiere-carga'),
    false,
  );
  const dif = D.validarSesion({ lineas: lin, cargaMedia: 2000 });
  const aviso = dif.find((a) => a.codigo === 'distancia-difiere-carga');
  assert.equal(aviso.severidad, 'aviso');
  assert.deepEqual(aviso.params, { total: 3060, registrada: 2000 });
  assert.equal(D.validarSesion({ lineas: lin, cargaMedia: 0 }).length, 0, 'no warning without a recorded load');
  assert.equal(
    D.validarSesion({ lineas: [] }).some((a) => a.codigo === 'sin-lineas'),
    true,
  );
});

test('validarSesion: target volume and session duration', () => {
  const v = D.validarSesion({ sesion: { volumenMin: 3500, volumenMax: 4000, duracionMin: 60 }, lineas: EJEMPLO });
  assert.ok(v.some((a) => a.codigo === 'fuera-volumen-objetivo'));
  assert.ok(v.some((a) => a.codigo === 'tiempo-supera-duracion'));
  const bien = D.validarSesion({ sesion: { volumenMin: 3000, volumenMax: 3200, duracionMin: 90 }, lineas: EJEMPLO });
  assert.deepEqual(bien, []);
  assert.equal(D.hayErrores(D.validarSesion({ lineas: [{ set: 1, orden: 1, series: 'x', distancia: 5 }] })), true);
  assert.equal(D.hayErrores(bien), false);
});

test('cargaRegistrada: average metres of the session', () => {
  const cargas = [
    { entrenamientoId: 'e1', metros: 3000 },
    { entrenamientoId: 'e1', metros: 3200 },
    { entrenamientoId: 'e2', metros: 100 },
    { entrenamientoId: 'e1', metros: '' },
  ];
  assert.equal(D.cargaRegistrada(cargas, 'e1'), 3100);
  assert.equal(D.cargaRegistrada(cargas, 'e9'), 0);
});

test('renumerar: consecutive sets and orders keeping the order', () => {
  const r = D.renumerar([
    { set: 7, orden: 3, ejercicio: 'c' },
    { set: 2, orden: 9, ejercicio: 'b' },
    { set: 2, orden: 1, ejercicio: 'a' },
  ]);
  assert.deepEqual(
    r.map((l) => [l.set, l.orden, l.ejercicio]),
    [
      [1, 1, 'a'],
      [1, 2, 'b'],
      [2, 1, 'c'],
    ],
  );
});

test('editing: add, remove and move rows and sets', () => {
  let ls = D.anadirSet([]);
  assert.equal(ls.length, 1);
  ls[0].ejercicio = 'A';
  ls = D.anadirFila(ls, 1);
  ls[1].ejercicio = 'B';
  ls = D.anadirFila(ls, 1);
  ls[2].ejercicio = 'C';
  ls = D.anadirSet(ls);
  ls[3].ejercicio = 'D';
  const nombres = (x) => x.map((l) => `${l.set}.${l.orden}${l.ejercicio}`).join(' ');
  assert.equal(nombres(ls), '1.1A 1.2B 1.3C 2.1D');
  assert.equal(nombres(D.moverFila(ls, 1, 2, -1)), '1.1B 1.2A 1.3C 2.1D');
  assert.equal(nombres(D.moverFila(ls, 1, 2, 1)), '1.1A 1.2C 1.3B 2.1D');
  assert.equal(
    nombres(D.moverFila(ls, 1, 3, 1)),
    '1.1A 1.2B 2.1C 2.2D',
    'moving down from the edge goes to the next set',
  );
  assert.equal(
    nombres(D.moverFila(ls, 2, 1, -1)),
    '1.1A 1.2B 1.3C 1.4D',
    'moving up from the edge goes to the previous set',
  );
  assert.equal(nombres(D.moverFila(ls, 1, 1, -1)), nombres(ls), 'the first row does not move up');
  assert.equal(nombres(D.quitarFila(ls, 1, 2)), '1.1A 1.2C 2.1D');
  assert.equal(nombres(D.quitarSet(ls, 1)), '1.1D');
  assert.equal(nombres(D.moverSet(ls, 1, 1)), '1.1D 2.1A 2.2B 2.3C');
  assert.equal(nombres(D.moverSet(ls, 2, 1)), nombres(ls), 'the last set does not move down');
  assert.equal(
    nombres(D.anadirFila(ls, 1, { set: 1, orden: 1 })).startsWith('1.1A 1.2 1.3B'),
    true,
    'insert after a given row',
  );
});

test('duplicate set and row: copy right after and assign new ids', () => {
  let n = 0;
  const gen = () => 'nuevo' + ++n;
  const base = D.renumerar([
    { id: 'a', set: 1, orden: 1, ejercicio: 'A', series: 2, distancia: 50 },
    { id: 'b', set: 1, orden: 2, ejercicio: 'B' },
    { id: 'c', set: 2, orden: 1, ejercicio: 'C' },
  ]);
  const dup = D.duplicarSet(base, 1, gen);
  assert.deepEqual(
    dup.map((l) => `${l.set}.${l.orden}${l.ejercicio}`),
    ['1.1A', '1.2B', '2.1A', '2.2B', '3.1C'],
  );
  assert.deepEqual(
    dup.map((l) => l.id),
    ['a', 'b', 'nuevo1', 'nuevo2', 'c'],
  );
  assert.equal(D.totales(dup).metros, 200);
  const dupFila = D.duplicarFila(base, 1, 1, gen);
  assert.deepEqual(
    dupFila.map((l) => `${l.set}.${l.orden}${l.ejercicio}`),
    ['1.1A', '1.2A', '1.3B', '2.1C'],
  );
  assert.equal(dupFila[1].id, 'nuevo3');
});

test('duplicarSesion: copies the plan without ids and goes back to planned; the original does not change', () => {
  const sesion = {
    id: 'e1',
    fecha: '2026-10-15',
    hora: '19:50',
    titulo: 'Alevín',
    estado: 'realizado',
    tipoSesion: 'Aer+Ritmo',
    materialDia: 'JJDD',
    notasGenerales: 'Tabla',
  };
  const original = D.renumerar(EJEMPLO.map((l, i) => ({ ...l, id: 'l' + i, entrenamientoId: 'e1' })));
  const d = D.duplicarSesion(sesion, original, { fecha: '2026-10-22' });
  assert.equal(d.sesion.id, '');
  assert.equal(d.sesion.fecha, '2026-10-22');
  assert.equal(d.sesion.estado, 'planificado');
  assert.equal(d.sesion.tipoSesion, 'Aer+Ritmo');
  assert.equal(d.lineas.length, 11);
  assert.ok(d.lineas.every((l) => l.id === '' && l.entrenamientoId === ''));
  assert.equal(D.totales(d.lineas).metros, 3060);
  assert.equal(sesion.estado, 'realizado');
  assert.equal(original[0].id, 'l0');
});

test('templates: all are valid plans and planDemo fits the volume', () => {
  assert.ok(D.PLANTILLAS.length >= 3);
  for (const p of D.PLANTILLAS) {
    const ls = D.lineasDePlantilla(p.id);
    assert.ok(ls.length >= 4, p.id);
    assert.deepEqual(D.validarSesion({ lineas: ls }), [], p.id);
    assert.ok(D.totales(ls).metros > 1000, p.id);
  }
  assert.deepEqual(D.lineasDePlantilla('no-existe'), []);
  for (const v of [0, 1, 2, 3]) {
    for (const vol of [1800, 2600, 3800, 4500]) {
      const plan = D.planDemo(v, vol, 90);
      assert.ok(Math.abs(D.totales(plan.lineas).metros - vol) <= 25, `${v}/${vol}: ${D.totales(plan.lineas).metros}`);
      assert.ok(D.totales(plan.lineas).tiempoMin <= 90, 'fits within the duration');
      assert.deepEqual(D.validarSesion({ lineas: plan.lineas }), []);
      assert.ok(!('ajusta' in plan.lineas[0]));
    }
  }
});

test('suggestions: most frequent first, without duplicates and with default values last', () => {
  const ls = [
    { objetivo: 'Piernas' },
    { objetivo: 'piernas' },
    { objetivo: 'Aeróbico' },
    { objetivo: '' },
    { objetivo: 'Piernas' },
  ];
  assert.deepEqual(D.sugerencias(ls, 'objetivo'), ['Piernas', 'Aeróbico']);
  assert.deepEqual(D.sugerencias(ls, 'objetivo', { extra: ['aeróbico', 'Velocidad'] }), [
    'Piernas',
    'Aeróbico',
    'Velocidad',
  ]);
  assert.deepEqual(D.sugerencias(ls, 'objetivo', { limite: 1 }), ['Piernas']);
});

test('file names and time', () => {
  assert.equal(
    D.nombreFichero({ grupo: 'Alevín', fecha: '2026-10-15', dia: 'jueves' }),
    'Alevin-2026-10-15-jueves.pdf',
  );
  assert.equal(
    D.nombreFichero({ grupo: 'Infantil-Junior', fecha: '2026-10-16T10:00', dia: 'Viernes' }),
    'Infantil-Junior-2026-10-16-viernes.pdf',
  );
  assert.equal(D.nombreFichero({ fecha: '2026-10-15' }), 'Entreno-2026-10-15.pdf');
  assert.equal(D.nombreFicheroSemana({ grupo: 'Alevín', lunes: '2026-10-12' }), 'Alevin-semana-2026-10-12.pdf');
  assert.equal(D.nombreFicheroSemana({ lunes: '2026-10-12' }), 'Club-semana-2026-10-12.pdf');
  assert.equal(D.horaTexto('19:50:00'), '19:50');
  assert.equal(D.horaTexto('7:05'), '07:05');
  assert.equal(D.horaTexto(0.5), '12:00');
});
