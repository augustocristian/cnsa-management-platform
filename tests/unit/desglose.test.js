// Breakdown by content and stroke: text parser, auto/manual split, validation, totals and percentages, migration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const G = await importApp('js/domain/desglose.js');
const D = await importApp('js/domain/entreno.js');
const C = await importApp('js/domain/cargas.js');

const AEL = 'Aeróbico ligero';
const AEM = 'Aeróbico medio / Umbral anaeróbico';
const AEI = 'Aeróbico intenso / Potencia aeróbica';
const SPR = 'Aláctico / Sprint';
const LAC = 'Anaeróbico / Tolerancia al lactato';
const comp = (contenido, metrosPorRep = null, modo = 'auto', pct = null) => ({ contenido, metrosPorRep, modo, pct });
const suma = (l, k) => Math.round(l.reduce((a, x) => a + x[k], 0) * 100) / 100;
const nombres = (p) => p.componentes.map((c) => c.contenido);

// ---------- Parser ----------
test('parser: the coach\'s example "4x100 Crol. 75 AeL-25 Tope"', () => {
  const p = G.parsearEjercicio('4x100 Crol. 75 AeL-25 Tope');
  assert.equal(p.ok, true);
  assert.equal(p.series, 4);
  assert.equal(p.distancia, 100);
  assert.deepEqual(p.componentes, [comp(AEL, 75), comp(SPR, 25)]);
  assert.deepEqual(p.estilos, [{ estilo: 'Crol', metrosPorRep: null }]);
  assert.deepEqual(p.sinReconocer, []);
});

test('parser: parentheses, sums and a single content', () => {
  let p = G.parsearEjercicio('8x50 (25 Sprint+25 AeL)');
  assert.deepEqual([p.series, p.distancia], [8, 50]);
  assert.deepEqual(p.componentes, [comp(SPR, 25), comp(AEL, 25)]);
  p = G.parsearEjercicio('6x100 AeL');
  assert.deepEqual([p.series, p.distancia], [6, 100]);
  assert.deepEqual(p.componentes, [comp(AEL)], 'no number: takes the rest (the whole distance)');
  p = G.parsearEjercicio('3x(200 AeM + 100 AeI)');
  assert.deepEqual([p.series, p.distancia], [3, 300], 'the distance is the sum inside the parentheses');
  assert.deepEqual(p.componentes, [comp(AEM, 200), comp(AEI, 100)]);
});

test('parser: aliases, full names and slash-separated name parts, without accents or capitals', () => {
  assert.deepEqual(nombres(G.parsearEjercicio('2x100 Pn + 2x0')), [], 'several blocks are not interpreted');
  assert.deepEqual(nombres(G.parsearEjercicio('4X100 AERÓBICO LIGERO')), [AEL]);
  assert.deepEqual(nombres(G.parsearEjercicio('4x50 Aláctico / Sprint')), [SPR]);
  assert.deepEqual(nombres(G.parsearEjercicio('4x50 Tope')), [SPR]);
  assert.deepEqual(nombres(G.parsearEjercicio('4x50 lactico')), [LAC]);
  assert.deepEqual(nombres(G.parsearEjercicio('8x50 25 Pies + 25 Br')), ['Piernas', 'Brazos']);
  assert.deepEqual(nombres(G.parsearEjercicio('6x50 25 Téc + 25 Sal')), ['Técnica', 'Salidas']);
  assert.deepEqual(nombres(G.parsearEjercicio('4x50 Vir')), ['Virajes/volteos']);
  assert.deepEqual(nombres(G.parsearEjercicio('4x100 umbral')), [AEM]);
  assert.deepEqual(nombres(G.parsearEjercicio('4x100 tolerancia al lactato')), [LAC]);
  assert.deepEqual(
    nombres(G.parsearEjercicio('4x100 Sprint/Alactico')),
    [SPR],
    'two aliases of the same content = one',
  );
});

test('parser: "m" units, decimals and strokes with a split', () => {
  let p = G.parsearEjercicio('4x100m Crol');
  assert.deepEqual([p.series, p.distancia, p.estilos[0].estilo], [4, 100, 'Crol']);
  p = G.parsearEjercicio('2x(12,5 Sprint + 37,5 AeL)');
  assert.equal(p.distancia, 50);
  assert.deepEqual(
    p.componentes.map((c) => c.metrosPorRep),
    [12.5, 37.5],
  );
  p = G.parsearEjercicio('4x100 50 Crol + 50 Espalda');
  assert.deepEqual(p.estilos, [
    { estilo: 'Crol', metrosPorRep: 50 },
    { estilo: 'Espalda', metrosPorRep: 50 },
  ]);
  p = G.parsearEjercicio('4x100 25 mariposa + 25 espalda + 25 braza + 25 libre');
  assert.deepEqual(
    p.estilos.map((e) => e.estilo),
    ['Mariposa', 'Espalda', 'Braza', 'Crol'],
    'the "m" of mariposa is not the unit',
  );
  assert.deepEqual(G.parsearEjercicio('100 Free').estilos[0].estilo, 'Crol');
  assert.equal(G.canonicoEstilo('backstroke'), 'Espalda');
  assert.equal(G.canonicoEstilo('Tortuga'), 'Tortuga', 'free-text stroke unchanged');
});

test('parser: odd and invalid inputs do not throw', () => {
  for (const x of [
    '',
    '   ',
    null,
    undefined,
    'hola',
    '4x',
    'x100',
    '0x100 AeL',
    '4x100 xyz',
    '---',
    '😀',
    '4x100 AeL AeL AeL',
  ]) {
    assert.doesNotThrow(() => G.parsearEjercicio(x), String(x));
  }
  assert.equal(G.parsearEjercicio('').codigo, 'vacio');
  assert.equal(G.parsearEjercicio('hola').ok, false);
  assert.equal(G.parsearEjercicio('hola').codigo, 'sin-datos');
  assert.equal(G.parsearEjercicio('2x100 AeL + 3x50 Pn').codigo, 'varios-bloques');
  const p = G.parsearEjercicio('4x100 25 flecha');
  assert.equal(p.ok, true, 'there are series and distance');
  assert.deepEqual(p.sinReconocer, ['flecha'], 'what follows a number and is not recognised is listed');
  assert.deepEqual(G.parsearEjercicio('4x100 AeL AeL AeL').componentes, [comp(AEL)], 'repeated: one');
  assert.deepEqual(
    G.parsearEjercicio('4x100 75 AeL').componentes,
    [comp(AEL, 75, 'manual')],
    'a number that does not add up is respected (manual)',
  );
});

test('parser: uses the club catalogue aliases (editable) and its own contents', () => {
  const tipos = C.sembrarCatalogo([]).concat([
    {
      id: 'x1',
      nombre: 'Fuerza en seco',
      alias: ['FZ'],
      color: '#112233',
      activo: true,
      predefinido: false,
      categoria: 'personalizado',
      orden: 50,
    },
  ]);
  tipos.find((t) => t.id === 'tc-aerobico-ligero').alias = ['Suavecito'];
  const p = G.parsearEjercicio('4x100 50 Suavecito + 50 FZ', { tipos });
  assert.deepEqual(p.componentes, [comp(AEL, 50), comp('Fuerza en seco', 50)]);
  assert.deepEqual(
    G.parsearEjercicio('4x100 AeL', { tipos }).componentes,
    [],
    'AeL is no longer an alias in that catalogue',
  );
});

// ---------- Split ----------
test('repartir: one content gets the whole distance; several automatic ones, in equal parts', () => {
  assert.deepEqual(G.repartir([{ modo: 'auto' }], 100).m, [100]);
  assert.deepEqual(G.repartir([{ modo: 'auto' }, { modo: 'auto' }], 100).m, [50, 50]);
  const tres = G.repartir([{ modo: 'auto' }, { modo: 'auto' }, { modo: 'auto' }], 100);
  assert.equal(
    suma([{ m: tres.m[0] }, { m: tres.m[1] }, { m: tres.m[2] }], 'm'),
    100,
    'the last one absorbs the rounding',
  );
  assert.deepEqual(G.repartir([], 100), { m: [], asignado: 0, resto: 100, exceso: 0 });
});

test('repartir: manual by metres or by percentage; automatic ones share the rest', () => {
  const r = G.repartir([{ metrosPorRep: 30, modo: 'manual' }, { modo: 'auto' }, { modo: 'auto' }], 100);
  assert.deepEqual(r.m, [30, 35, 35]);
  assert.deepEqual([r.resto, r.exceso], [0, 0]);
  const p = G.repartir([{ pct: 25, modo: 'manual' }, { modo: 'auto' }], 200);
  assert.deepEqual(p.m, [50, 150]);
  const fijo = G.repartir([{ metrosPorRep: 60, modo: 'manual' }], 100);
  assert.deepEqual([fijo.m[0], fijo.resto], [60, 40], 'a single manual one is not stretched: a remainder is left');
});

test('repartir: unassigned remainder and excess', () => {
  const r = G.repartir(
    [
      { metrosPorRep: 75, modo: 'auto' },
      { metrosPorRep: 20, modo: 'auto' },
    ],
    100,
  );
  assert.deepEqual([r.resto, r.exceso], [5, 0]);
  const e = G.repartir(
    [
      { metrosPorRep: 80, modo: 'manual' },
      { metrosPorRep: 40, modo: 'manual' },
    ],
    100,
  );
  assert.deepEqual([e.resto, e.exceso], [0, 20]);
  const sobra = G.repartir([{ metrosPorRep: 120, modo: 'manual' }, { modo: 'auto' }], 100);
  assert.deepEqual([sobra.m[1], sobra.exceso], [0, 20], 'with nothing left to share the automatic one gets 0');
});

test('manual wins over auto: autocompleting from the text does not touch manual components', () => {
  const l = {
    series: '',
    distancia: '',
    ejercicio: '4x100 Crol. 75 AeL-25 Tope',
    componentes: [comp(SPR, 30, 'manual')],
  };
  const r = G.autocompletarLinea(l);
  assert.deepEqual([r.linea.series, r.linea.distancia], [4, 100], 'fills in empty series and distance');
  assert.deepEqual(r.linea.componentes, [comp(SPR, 30, 'manual'), comp(AEL, 75)]);
  assert.deepEqual(r.linea.estilos, [{ estilo: 'Crol', metrosPorRep: null }]);
  assert.equal(r.cambios.componentes, true);
  // "NxM" in the text takes precedence over the row's series/distance; existing strokes are respected
  const dos = G.autocompletarLinea({
    series: 2,
    distancia: 200,
    ejercicio: '4x100 Crol. 75 AeL-25 Tope',
    estilos: [{ estilo: 'Braza', metrosPorRep: null }],
  });
  assert.deepEqual([dos.linea.series, dos.linea.distancia, dos.linea.estilos[0].estilo], [4, 100, 'Braza']);
  assert.deepEqual([dos.cambios.series, dos.cambios.distancia, dos.cambios.estilos], [true, true, false]);
  // without "NxM" (split only) nothing in the row is overwritten: the deduced distance (100) only fills in if empty
  const sinPrefijo = G.autocompletarLinea({ series: 2, distancia: 200, ejercicio: '75 AeL + 25 Tope' });
  assert.deepEqual([sinPrefijo.linea.series, sinPrefijo.linea.distancia], [2, 200]);
  assert.equal(G.autocompletarLinea({ ejercicio: '75 AeL + 25 Tope' }).linea.distancia, 100);
  // text with nothing recognisable: unchanged
  const nada = G.autocompletarLinea({
    series: 1,
    distancia: 50,
    ejercicio: 'hola',
    componentes: [comp(AEL, 50, 'manual')],
  });
  assert.equal(nada.parse.ok, false);
  assert.deepEqual(nada.linea.componentes, [comp(AEL, 50, 'manual')]);
});

test('editing components: add, pin (manual), release (auto), equalise and remove', () => {
  let cs = G.anadirComponente([], AEL);
  cs = G.anadirComponente(cs, 'aerobico LIGERO');
  assert.equal(cs.length, 1, 'the same content is not repeated');
  cs = G.anadirComponente(cs, SPR);
  cs = G.fijarComponente(cs, SPR, { metrosPorRep: 20 });
  assert.deepEqual(cs[1], comp(SPR, 20, 'manual'));
  cs = G.fijarComponente(cs, SPR, { pct: 25 });
  assert.deepEqual(cs[1], comp(SPR, null, 'manual', 25));
  cs = G.liberarComponente(cs, SPR);
  assert.deepEqual(cs[1], comp(SPR));
  cs = G.repartirIgual([comp(AEL, 70), comp(SPR, 10, 'manual')]);
  assert.deepEqual(cs, [comp(AEL), comp(SPR, 10, 'manual')], 'manual ones are not touched');
  assert.deepEqual(G.quitarComponente(cs, 'sprint').length, 2, 'remove by exact name; "sprint" is not the name');
  assert.deepEqual(
    G.quitarComponente(cs, SPR).map((c) => c.contenido),
    [AEL],
  );
});

test('pinning by hand rebalances the automatic ones with metres (proportionally) and leaves the other cases alone', () => {
  const base = { series: 4, distancia: 100 };
  let cs = G.fijarReequilibrando({ ...base, componentes: [comp(AEL, 75), comp(SPR, 25)] }, SPR, { metrosPorRep: 40 });
  assert.deepEqual(cs, [comp(AEL, 60), comp(SPR, 40, 'manual')]);
  assert.deepEqual(G.validarReparto({ ...base, set: 1, orden: 1, componentes: cs }), []);
  cs = G.fijarReequilibrando({ ...base, componentes: [comp(AEL, 50), comp(AEM, 30), comp(SPR, 20)] }, SPR, {
    metrosPorRep: 40,
  });
  assert.deepEqual(
    cs.map((c) => c.metrosPorRep),
    [37.5, 22.5, 40],
  );
  cs = G.fijarReequilibrando({ ...base, componentes: [comp(AEL, 50), comp(AEM, 30), comp(SPR, 20)] }, SPR, { pct: 10 });
  assert.deepEqual(
    cs.map((c) => c.metrosPorRep),
    [56.25, 33.75, null],
  );
  assert.deepEqual(cs[2], comp(SPR, null, 'manual', 10));
  // with an automatic one without metres it absorbs the difference: nothing else is touched
  cs = G.fijarReequilibrando({ ...base, componentes: [comp(AEL), comp(SPR, 25)] }, SPR, { metrosPorRep: 40 });
  assert.deepEqual(cs, [comp(AEL), comp(SPR, 40, 'manual')]);
  // with no other automatic ones, or no distance, it is only pinned
  assert.deepEqual(
    G.fijarReequilibrando({ ...base, componentes: [comp(AEL, 10, 'manual'), comp(SPR, 90, 'manual')] }, SPR, {
      metrosPorRep: 20,
    }).map((c) => c.metrosPorRep),
    [10, 20],
  );
  assert.deepEqual(
    G.fijarReequilibrando({ componentes: [comp(AEL, 75), comp(SPR, 25)] }, SPR, { metrosPorRep: 40 }).map(
      (c) => c.metrosPorRep,
    ),
    [75, 40],
  );
  // pinning more than there is: the automatic ones end up at 0
  assert.deepEqual(
    G.fijarReequilibrando({ ...base, componentes: [comp(AEL, 75), comp(SPR, 25)] }, SPR, { metrosPorRep: 120 }).map(
      (c) => c.metrosPorRep,
    ),
    [0, 120],
  );
});

test('validation: unassigned remainder, excess and assigning the remainder', () => {
  const l = { set: 1, orden: 2, series: 4, distancia: 100, componentes: [comp(AEL, 75), comp(SPR, 20)] };
  const v = G.validarReparto(l);
  assert.deepEqual(
    v.map((x) => x.codigo),
    ['reparto-incompleto'],
  );
  assert.deepEqual(v[0].params, { resto: 5, distancia: 100 });
  assert.deepEqual([v[0].set, v[0].orden], [1, 2]);
  // assign the remainder to an existing or a new component; it becomes manual
  const a = G.asignarResto(l, SPR);
  assert.deepEqual(a[1], comp(SPR, 25, 'manual'));
  assert.deepEqual(G.validarReparto({ ...l, componentes: a }), []);
  const b = G.asignarResto(l, 'Piernas');
  assert.deepEqual(b[2], comp('Piernas', 5, 'manual'));
  assert.deepEqual(
    G.asignarResto({ ...l, componentes: [comp(AEL)] }, SPR),
    [comp(AEL)],
    'with no remainder nothing changes',
  );
  const ex = G.validarReparto({ ...l, componentes: [comp(AEL, 80, 'manual'), comp(SPR, 40, 'manual')] });
  assert.deepEqual(
    ex.map((x) => x.codigo),
    ['reparto-excede'],
  );
  assert.equal(ex[0].params.exceso, 20);
  assert.equal(G.validarReparto({ set: 1, orden: 1, componentes: [comp(AEL)] })[0].codigo, 'reparto-sin-distancia');
  assert.deepEqual(
    G.validarReparto({ set: 1, orden: 1, series: 1, distancia: 50 }),
    [],
    'with no components there is nothing to validate',
  );
  const est = G.validarReparto({
    set: 1,
    orden: 1,
    series: 2,
    distancia: 100,
    estilos: [
      { estilo: 'Crol', metrosPorRep: 30 },
      { estilo: 'Espalda', metrosPorRep: 30 },
    ],
  });
  assert.deepEqual(
    est.map((x) => x.codigo),
    ['estilo-incompleto'],
  );
  assert.equal(
    G.validarRepartoSesion([
      { set: 1, orden: 1, series: 4, distancia: 100, componentes: [comp(AEL, 10, 'manual')] },
      { set: 1, orden: 2 },
    ]).length,
    1,
  );
});

// ---------- Totals and percentages ----------
test('percentages always add up to 100 (largest remainder)', () => {
  assert.deepEqual(G.porcentajes([1, 1, 1]), [33.4, 33.3, 33.3]);
  assert.deepEqual(G.porcentajes([300, 100]), [75, 25]);
  assert.deepEqual(G.porcentajes([0, 0]), [0, 0]);
  assert.deepEqual(G.porcentajes([]), []);
  assert.deepEqual(G.porcentajes([2, 1], 0), [67, 33]);
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return semilla / 2147483647;
  };
  for (let i = 0; i < 300; i++) {
    const v = Array.from({ length: 1 + Math.floor(azar() * 9) }, () => Math.round(azar() * 1500));
    if (!v.some((x) => x > 0)) continue;
    const p = G.porcentajes(v);
    assert.equal(Math.round(p.reduce((a, x) => a + x, 0) * 10) / 10, 100, JSON.stringify(v));
  }
});

test("desgloseSesion: the coach's example (400 m, AeL 300, Sprint 100, Crol 400)", () => {
  const l = G.autocompletarLinea({ set: 1, orden: 1, ejercicio: '4x100 Crol. 75 AeL-25 Tope' }).linea;
  const d = G.desgloseSesion([l]);
  assert.equal(d.totalM, 400);
  assert.deepEqual(
    d.porContenido.map((c) => [c.contenido, c.metros, c.pct]),
    [
      [AEL, 300, 75],
      [SPR, 100, 25],
    ],
  );
  assert.deepEqual(
    d.porEstilo.map((e) => [e.estilo, e.metros, e.pct]),
    [['Crol', 400, 100]],
  );
  assert.deepEqual(
    d.porContenido.map((c) => c.corto),
    ['AeL', 'Sprint'],
  );
  const txt = G.textoResumen(d);
  assert.equal(txt, 'Volumen total: 400 m (AeL 300 m · Sprint 100 m) · Por estilo: Crol 400 m');
  assert.equal(
    G.textoResumen(d, { conPct: true }).split('\n')[1],
    '% por contenido: AeL 75 % · Sprint 25 % · % por estilo: Crol 100 %',
  );
  assert.equal(G.textoEjercicio(l), '75 AeL + 25 Sprint  ·  Crol');
  assert.equal(G.textoEjercicio({ ...l, componentes: [comp(AEL)] }), 'AeL  ·  Crol');
  assert.equal(G.textoEjercicio({ series: 1, distancia: 50 }), '');
});

test('desgloseSesion: rows, sets and session add up to the total; manual and auto content, remainder and strokes', () => {
  const lineas = [
    { set: 1, orden: 1, series: 1, distancia: 300, objetivo: 'Calentamiento' }, // old row: AeL via "Calentamiento"
    {
      set: 2,
      orden: 1,
      series: 8,
      distancia: 50,
      componentes: [comp('Piernas', 30, 'manual'), comp(SPR)],
      estilos: [
        { estilo: 'Mariposa', metrosPorRep: 20 },
        { estilo: 'Crol', metrosPorRep: 30 },
      ],
    },
    { set: 2, orden: 2, series: 4, distancia: 100, componentes: [comp(AEL, 60, 'manual')] }, // 40 m/rep unassigned
    { set: 3, orden: 1, series: 2, distancia: 25, componentes: [comp(AEM), comp(AEI), comp(SPR)] }, // 3 to split: 8.33...
  ];
  const d = G.desgloseSesion(lineas);
  assert.equal(d.totalM, 300 + 400 + 400 + 50);
  assert.equal(suma(d.porContenido, 'metros'), d.totalM, 'the metres per content add up to the total');
  assert.equal(Math.round(suma(d.porContenido, 'pct') * 10) / 10, 100);
  assert.equal(Math.round(suma(d.porEstilo, 'pct') * 10) / 10, 100);
  assert.equal(suma(d.porEstilo, 'metros'), d.totalM);
  const por = Object.fromEntries(d.porContenido.map((c) => [c.contenido || '(sin)', c.metros]));
  assert.equal(por.Piernas, 240);
  assert.equal(por[AEL], 300 + 240);
  assert.equal(por['(sin)'], 160, 'what is unassigned is counted as "no content"');
  assert.equal(d.porContenido[d.porContenido.length - 1].contenido, '', 'and goes last');
  assert.deepEqual(
    d.porEstilo.map((e) => e.estilo),
    ['Crol', 'Mariposa', ''],
    'order: by metres, no stroke last',
  );
  const set2 = d.porSet.find((s) => s.set === 2);
  assert.equal(set2.totalM, 800);
  assert.equal(
    suma(
      d.porSet.map((s) => ({ m: s.totalM })),
      'm',
    ),
    d.totalM,
  );
  assert.equal(d.filas.length, 4);
  assert.equal(d.filas[2].resolucion.resto, 40);
});

test('desgloseSesion: exceeding the distance is adjusted proportionally and still adds up to the total', () => {
  const d = G.desgloseSesion([
    { set: 1, orden: 1, series: 2, distancia: 100, componentes: [comp(AEL, 100, 'manual'), comp(SPR, 100, 'manual')] },
  ]);
  assert.equal(d.totalM, 200);
  assert.deepEqual(
    d.porContenido.map((c) => [c.metros, c.pct]),
    [
      [100, 50],
      [100, 50],
    ],
  );
});

test('migration: old rows without components go to the objective\'s content (inherited within the set) or to "no content"', () => {
  const EJEMPLO = [
    { set: 1, orden: 1, series: 1, distancia: 300, objetivo: 'Calentamiento' },
    { set: 1, orden: 2, series: 4, distancia: 50, ejercicio: 'tec' },
    { set: 2, orden: 1, series: 8, distancia: 50, objetivo: 'Piernas' },
    { set: 3, orden: 1, series: 6, distancia: 100, objetivo: 'Aeróbico' },
    { set: 3, orden: 2, series: 4, distancia: 100, bloque: 'Tec Prueba' },
    { set: 4, orden: 1, series: 4, distancia: 15, ejercicio: 'Tomas relevos' },
  ];
  const d = G.desgloseSesion(EJEMPLO);
  const por = Object.fromEntries(d.porContenido.map((c) => [c.contenido || '(sin)', c.metros]));
  assert.equal(por[AEL], 300 + 200, 'inherits the objective of the previous row in the set');
  assert.equal(por.Piernas, 400);
  assert.equal(por[AEM], 600);
  assert.equal(por['Técnica'], 400);
  assert.equal(por['(sin)'], 60);
  assert.equal(d.porEstilo.length, 1);
  assert.equal(d.porEstilo[0].estilo, '', 'no stroke');
  assert.equal(d.totalM, D.totales(EJEMPLO).metros, 'the total is still the sum of Dist. Bloque');
});

test('volumenPorContenido: aggregates of several sessions (for season planning)', () => {
  const a = [{ set: 1, orden: 1, series: 4, distancia: 100, componentes: [comp(AEL, 75), comp(SPR, 25)] }];
  const b = {
    lineas: [
      { set: 1, orden: 1, series: 2, distancia: 200, objetivo: 'Piernas' },
      { set: 2, orden: 1, series: 1, distancia: 100, ejercicio: 'x' },
    ],
  };
  const v = G.volumenPorContenido([a, b]);
  assert.equal(v.totalM, 400 + 400 + 100);
  assert.equal(v.metros['tc-aerobico-ligero'], 300);
  assert.equal(v.metros['tc-alactico'], 100);
  assert.equal(v.metros['tc-piernas'], 400);
  assert.equal(v.sinClasificar, 100);
  assert.deepEqual(G.volumenPorContenido([]).porContenido, []);
  assert.equal(G.volumenPorContenido(null).totalM, 0);
  // with its own catalogue: contents from another catalogue are not recognised
  const sinCatalogo = G.volumenPorContenido([a], {
    tipos: [{ id: 'z', nombre: 'Otro', alias: [], activo: true, predefinido: false }],
  });
  assert.equal(sinCatalogo.sinClasificar, 400);
});

// ---------- Columns, normalisation and aliases ----------
test('components and stroke: reading/writing the columns, invalid JSON and normalizarLinea', () => {
  assert.deepEqual(D.leerComponentes('no es json'), []);
  assert.deepEqual(D.leerComponentes('[1,2,{"contenido":""}]'), []);
  assert.deepEqual(D.leerComponentes('[{"contenido":"A","metrosPorRep":"25","modo":"manual","pct":"10"}]'), [
    comp('A', 25, 'manual', 10),
  ]);
  assert.equal(D.escribirComponentes([]), '');
  const json = D.escribirComponentes([comp(AEL, 75), comp(SPR, null, 'manual', 25)]);
  assert.deepEqual(D.leerComponentes(json), [comp(AEL, 75), comp(SPR, null, 'manual', 25)]);
  assert.equal(
    D.escribirEstilos([{ estilo: 'Crol', metrosPorRep: null }]),
    'Crol',
    'a stroke without a split = its name',
  );
  assert.deepEqual(D.leerEstilos('Crol'), [{ estilo: 'Crol', metrosPorRep: null }]);
  const dos = D.escribirEstilos([
    { estilo: 'Crol', metrosPorRep: 50 },
    { estilo: 'Espalda', metrosPorRep: 50 },
  ]);
  assert.match(dos, /^\[/);
  assert.deepEqual(
    D.leerEstilos(dos).map((e) => e.estilo),
    ['Crol', 'Espalda'],
  );
  assert.deepEqual(D.leerEstilos(''), []);
  const n = D.normalizarLinea({ set: 1, orden: 1, componentes: json, estilo: 'Braza' });
  assert.deepEqual([n.componentes.length, n.estilos[0].estilo], [2, 'Braza']);
  assert.deepEqual(D.normalizarLinea({}).componentes, []);
  // round trip to the sheet row
  const fila = D.serializarLinea(n);
  assert.equal(typeof fila.componentes, 'string');
  assert.equal(fila.estilo, 'Braza');
  assert.equal('estilos' in fila, false);
  assert.deepEqual(D.normalizarLinea(fila).componentes, n.componentes);
  // renumbering, duplicating and cloning keep the split without sharing references
  const copia = D.duplicarFila([n], 1, 1)[1];
  assert.deepEqual(copia.componentes, n.componentes);
  assert.notEqual(copia.componentes, n.componentes);
});

test('templates and the demo plan bring consistent multi-content exercises (the split adds up to the distance)', () => {
  const d = G.desgloseSesion(D.lineasDePlantilla('aerobico'));
  assert.ok(d.porContenido.length >= 3);
  assert.equal(d.porContenido.find((c) => c.contenido === '')?.metros ?? 0, 0, 'no unassigned metres');
  const ejemplo = D.lineasDePlantilla('aerobico').find((l) => l.ejercicio === '4x100 Crol. 75 AeL-25 Tope');
  assert.ok(ejemplo, "includes the coach's example");
  assert.deepEqual(G.validarReparto(ejemplo), []);
  for (const p of D.PLANTILLAS) {
    assert.deepEqual(G.validarRepartoSesion(D.lineasDePlantilla(p.id)), [], p.id);
    for (const v of [0, 1, 2, 3]) {
      const plan = D.planDemo(v, 2600, 75);
      assert.deepEqual(G.validarRepartoSesion(plan.lineas), [], `demo ${v}`);
      const dd = G.desgloseSesion(plan.lineas);
      assert.equal(dd.totalM, D.totales(plan.lineas).metros);
      assert.ok(dd.porEstilo.some((e) => e.estilo === 'Crol'));
    }
  }
  const mixta = G.desgloseSesion(D.lineasDePlantilla('mixta'));
  assert.ok(mixta.porEstilo.length >= 3, 'strokes with a split: freestyle, medley, butterfly');
});

test('aliases in the catalogue: reading, factory values, validation and seeding', () => {
  assert.deepEqual(C.parseAlias('AeL, Ae1 ;  ael |  Tope\nX'), ['AeL', 'Ae1', 'Tope', 'X']);
  assert.deepEqual(C.parseAlias(null), []);
  const pre = C.normalizarTipo({ id: 'tc-piernas', nombre: 'Piernas', predefinido: 'true' });
  assert.deepEqual(pre.alias, ['Pn', 'Pies'], 'a predefined one without aliases uses the factory ones');
  assert.deepEqual(
    C.normalizarTipo({ id: 'tc-piernas', nombre: 'Piernas', predefinido: 'true', alias: 'Patada' }).alias,
    ['Patada'],
  );
  assert.deepEqual(C.normalizarTipo({ id: 'p1', nombre: 'Fuerza' }).alias, [], 'custom ones come without aliases');
  assert.equal(C.filaTipo({ ...pre, min: null, max: null }).alias, 'Pn, Pies');
  const sembrados = C.sembrarCatalogo([]);
  assert.ok(sembrados.every((t) => t.alias.length >= 1));
  const existentes = sembrados.map((t) => ({ ...t }));
  const cod = (d, id = '') => C.validarTipo({ nombre: 'Nuevo', ...d }, existentes, { id }).map((e) => e.codigo);
  assert.deepEqual(cod({ alias: 'FZ, Fuerza' }), []);
  assert.deepEqual(cod({ alias: 'AeL' }), ['alias-duplicado']);
  assert.deepEqual(cod({ alias: 'piernas' }), ['alias-duplicado'], 'nor the name of another content');
  assert.deepEqual(cod({ alias: 'a'.repeat(25) }), ['alias-largo']);
  assert.deepEqual(cod({ alias: 'a,b,c,d,e,f,g,h,i' }), ['alias-muchos']);
  assert.deepEqual(cod({ alias: 'AeL' }, 'tc-aerobico-ligero'), [], 'keep its own aliases when editing');
  assert.deepEqual(cod({}), [], 'without an alias field nothing is validated');
});

test('renaming or merging a content updates the stored components', () => {
  const json = D.escribirComponentes([comp('Fuerza', 25), comp(AEL, 75)]);
  assert.deepEqual(
    D.leerComponentes(G.renombrarEnComponentes(json, 'fuerza', 'Fuerza en seco')).map((c) => c.contenido),
    ['Fuerza en seco', AEL],
  );
  assert.equal(G.renombrarEnComponentes(json, 'Otro', 'X'), null, 'if it does not use it, there is nothing to change');
  assert.equal(G.renombrarEnComponentes('', 'Fuerza', 'X'), null);
  const fusion = D.leerComponentes(G.renombrarEnComponentes(json, 'Fuerza', AEL));
  assert.deepEqual(fusion, [comp(AEL, 100)], 'if they end up being the same content they are added together');
});
