import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/cargas.js';

const ids = () => { let n = 0; return () => 'x' + (++n); };
const sembrado = () => D.sembrarCatalogo([]).map((t) => ({ ...t }));

test('default catalogue: 10 unique contents, stable ids, valid colours and known categories', () => {
  assert.equal(D.CATALOGO_PREDEFINIDO.length, 10);
  assert.deepEqual(D.CATALOGO_PREDEFINIDO.map((c) => c.nombre), [
    'Aeróbico ligero', 'Aeróbico medio / Umbral anaeróbico', 'Aeróbico intenso / Potencia aeróbica', 'Anaeróbico / Tolerancia al lactato',
    'Aláctico / Sprint', 'Piernas', 'Brazos', 'Técnica', 'Salidas', 'Virajes/volteos']);
  assert.equal(new Set(D.CATALOGO_PREDEFINIDO.map((c) => c.id)).size, 10);
  assert.equal(new Set(D.CATALOGO_PREDEFINIDO.map((c) => c.color)).size, 10, 'each content has its own colour');
  for (const c of D.CATALOGO_PREDEFINIDO) {
    assert.match(c.id, /^tc-/);
    assert.ok(D.colorValido(c.color));
    assert.ok(D.CATEGORIAS_TIPO.includes(c.categoria));
    assert.ok(c.descripcion.length > 20);
  }
  assert.match(D.CATALOGO_PREDEFINIDO[0].descripcion, /Borg 4-5\/10/);
});

test('normalizarNombre: no accents, capitals or extra spaces', () => {
  assert.equal(D.normalizarNombre('  AERÓBICO   Ligero '), 'aerobico ligero');
  assert.equal(D.normalizarNombre('Virajes / volteos'), D.normalizarNombre('virajes/Volteos'));
  assert.equal(D.normalizarNombre(null), '');
});

test('normalizarTipo and filaTipo: round trip, default values and targets 0 = no target', () => {
  const t = D.normalizarTipo({ id: 5, nombre: ' X ', color: 'zzz', categoria: 'rara', orden: '', activo: '', predefinido: 'TRUE', minSemanalM: 0, maxSemanalM: '1500' });
  assert.deepEqual(t, { id: '5', nombre: 'X', descripcion: '', color: D.COLOR_SIN_TIPO, categoria: 'personalizado', orden: 999, activo: true, predefinido: true, min: null, max: 1500, alias: [] });
  const f = D.filaTipo(t);
  assert.deepEqual([f.activo, f.predefinido, f.minSemanalM, f.maxSemanalM], ['true', 'true', '', 1500]);
  assert.equal(D.normalizarTipo({ id: 'a', nombre: 'a', activo: 'FALSE' }).activo, false);
  assert.equal(D.normalizarTipo({ id: 'a', nombre: 'a', activo: false }).activo, false);
});

test('validarTipo: mandatory name, unique (ignoring case and accents), length, targets and colours', () => {
  const ex = sembrado();
  const codigos = (d, o) => D.validarTipo(d, ex, o).map((e) => e.codigo);
  assert.deepEqual(codigos({ nombre: '  ' }), ['nombre-vacio']);
  assert.deepEqual(codigos({ nombre: 'AEROBICO LIGERO' }), ['nombre-duplicado']);
  assert.deepEqual(codigos({ nombre: 'virajes / VOLTEOS' }), ['nombre-duplicado']);
  assert.deepEqual(codigos({ nombre: 'Aeróbico ligero' }, { id: 'tc-aerobico-ligero' }), [], 'editing itself is not a duplicate');
  assert.deepEqual(codigos({ nombre: 'x'.repeat(61) }), ['nombre-largo']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', color: 'rojo' }), ['color-invalido']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: '-5' }), ['objetivo-invalido']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: 'abc' }), ['objetivo-invalido']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: '3000', max: '1000' }), ['minmax']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: '1000', max: '' , color: '#aabbcc' }), []);
  assert.deepEqual(codigos({ nombre: 'Nuevo', descripcion: 'd'.repeat(241) }), ['descripcion-larga']);
});

test('sembrarCatalogo: idempotent, does not duplicate or overwrite edits, respects existing names', () => {
  const primero = D.sembrarCatalogo([]);
  assert.equal(primero.length, 10);
  assert.deepEqual(D.sembrarCatalogo(primero), []);
  // the user edited a default and deleted another (e.g. by hand in the sheet): only the missing one is restored
  const editado = primero.filter((t) => t.id !== 'tc-brazos').map((t) => (t.id === 'tc-piernas' ? { ...t, color: '#123456', descripcion: 'Mía' } : t));
  const falta = D.sembrarCatalogo(editado);
  assert.deepEqual(falta.map((t) => t.id), ['tc-brazos']);
  assert.equal(editado.find((t) => t.id === 'tc-piernas').color, '#123456');
  // custom content with the same name as a default: the duplicate is not seeded
  const propio = [{ id: 'mio', nombre: 'BRAZOS', categoria: 'personalizado', orden: 50, activo: true }];
  assert.ok(!D.sembrarCatalogo(propio).some((t) => D.normalizarNombre(t.nombre) === 'brazos'));
});

test('migration: old types kept as custom, Piernas/Técnica use the default, targets moved', () => {
  const tipos = sembrado();
  const cargas = [
    { id: 'c1', tipo: 'Aeróbico' }, { id: 'c2', tipo: 'aerobico' }, { id: 'c3', tipo: 'Velocidad' }, { id: 'c4', tipo: 'Piernas' },
    { id: 'c5', tipo: 'Técnica' }, { id: 'c6', tipo: 'Fuerza' }, { id: 'c7', tipo: '' }, { id: 'c8', tipo: 'Aláctico / Sprint' },
  ];
  const objetivos = [
    { id: 'o1', tipo: 'Aeróbico', minSemanalM: 6000, maxSemanalM: 12000 },
    { id: 'o2', tipo: 'Piernas', minSemanalM: 1000, maxSemanalM: 2500 },
    { id: 'o3', tipo: 'Técnica', minSemanalM: 0, maxSemanalM: 4000 },
    { id: 'o4', tipo: 'Natación sincro', minSemanalM: 0, maxSemanalM: 0 }, // no loads and no target: creates nothing
  ];
  const r = D.migrarHeredados({ tipos, cargas, objetivos, generarId: ids() });
  assert.deepEqual(r.crear.map((t) => t.nombre).sort(), ['Aeróbico', 'Fuerza', 'Velocidad']);
  for (const t of r.crear) assert.deepEqual([t.categoria, t.predefinido, t.activo], ['personalizado', false, true]);
  const aero = r.crear.find((t) => t.nombre === 'Aeróbico');
  assert.deepEqual([aero.min, aero.max], [6000, 12000]);
  assert.deepEqual(r.actualizar.map((t) => [t.id, t.min, t.max]).sort(), [['tc-piernas', 1000, 2500], ['tc-tecnica', null, 4000]]);
  assert.deepEqual(r.eliminarObjetivos, ['o1', 'o2', 'o3', 'o4']);
});

test('migration: does not overwrite targets already defined and is idempotent (prepararCatalogo)', () => {
  const ya = sembrado().map((t) => (t.id === 'tc-piernas' ? { ...t, min: 300, max: 600 } : t));
  const r = D.migrarHeredados({ tipos: ya, objetivos: [{ id: 'o', tipo: 'Piernas', minSemanalM: 1, maxSemanalM: 2 }], generarId: ids() });
  assert.deepEqual(r.actualizar, []);
  assert.deepEqual(r.eliminarObjetivos, ['o']);

  const cargas = [{ tipo: 'Velocidad' }, { tipo: 'Piernas' }];
  const objetivos = [{ id: 'o1', tipo: 'Velocidad', minSemanalM: 100, maxSemanalM: 200 }];
  const plan = D.prepararCatalogo({ tipos: [], cargas, objetivos, generarId: ids() });
  assert.equal(plan.crear.length, 11);
  const aplicado = plan.crear.map((t) => ({ ...t }));
  const otra = D.prepararCatalogo({ tipos: aplicado, cargas, objetivos: [], generarId: ids() });
  assert.deepEqual([otra.crear, otra.actualizar, otra.eliminarObjetivos], [[], [], []]);
});

test('resolverTipo, ordenarTipos and agruparPorCategoria', () => {
  const tipos = sembrado().concat([{ ...sembrado()[0], id: 'p1', nombre: 'Aguas abiertas', categoria: 'personalizado', predefinido: false, orden: 11 }]);
  assert.equal(D.resolverTipo('  piernas', tipos).id, 'tc-piernas');
  assert.equal(D.resolverTipo('nada', tipos), null);
  const g = D.agruparPorCategoria(tipos);
  assert.deepEqual(g.map((x) => x.categoria), ['intensidad', 'especifico', 'personalizado']);
  assert.equal(g[0].tipos[0].id, 'tc-aerobico-ligero');
  assert.deepEqual(D.agruparPorCategoria([]), []);
  assert.equal(D.siguienteOrden(tipos), 12);
});

const cargas = [
  { nadadorId: 'a', fecha: '2026-10-12', metros: 2000, tipo: 'Piernas' },       // Monday
  { nadadorId: 'a', fecha: '2026-10-14', metros: 1000, tipo: 'piernas' },       // Wednesday
  { nadadorId: 'b', fecha: '2026-10-14', metros: 3000, tipo: 'Aláctico / Sprint' },
  { nadadorId: 'b', fecha: '2026-10-18', metros: 500, tipo: 'Misterioso' },     // Sunday, unclassified
  { nadadorId: 'b', fecha: '2026-10-19', metros: 9999, tipo: 'Piernas' },       // another week
];

test('agregarSemana: average per swimmer with load, per content and per day; unclassified apart', () => {
  const tipos = sembrado();
  const a = D.agregarSemana({ cargas, tipos, desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual([a.divisor, a.nadadores], [2, 2]);
  assert.equal(a.metros['tc-piernas'], 1500);
  assert.equal(a.metros['tc-alactico'], 1500);
  assert.equal(a.metros['tc-brazos'], 0);
  assert.equal(a.sinClasificar, 250);
  assert.deepEqual(a.porDia, [1000, 0, 2000, 0, 0, 0, 250]);
  assert.equal(a.porDiaTipo[2]['tc-alactico'], 1500);
  assert.equal(a.porDiaTipo[6][''], 250);
  assert.equal(a.total, 3250);
  const solo = D.agregarSemana({ cargas, tipos, desde: '2026-10-12', hasta: '2026-10-18', nadadorId: 'a' });
  assert.deepEqual([solo.divisor, solo.metros['tc-piernas']], [1, 3000]);
  const vacia = D.agregarSemana({ cargas: [], tipos, desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual([vacia.divisor, vacia.total], [1, 0]);
});

test('evaluarObjetivo and evaluarSemana: high, low, ok, no target; only active ones with a target', () => {
  assert.deepEqual(D.evaluarObjetivo(5000, 1000, 3800), { estado: 'alto', diferencia: 1200 });
  assert.deepEqual(D.evaluarObjetivo(700, 3000, null), { estado: 'bajo', diferencia: 2300 });
  assert.deepEqual(D.evaluarObjetivo(2000, 1000, 3000), { estado: 'ok', diferencia: 0 });
  assert.deepEqual(D.evaluarObjetivo(2000, null, null), { estado: 'sin-objetivo', diferencia: 0 });
  const tipos = sembrado().map((t) => {
    if (t.id === 'tc-piernas') return { ...t, min: 2000, max: 4000 };
    if (t.id === 'tc-alactico') return { ...t, max: 1000 };
    if (t.id === 'tc-brazos') return { ...t, min: 500, activo: false };
    return t;
  });
  const a = D.agregarSemana({ cargas, tipos, desde: '2026-10-12', hasta: '2026-10-18' });
  const ev = D.evaluarSemana(a, tipos);
  assert.deepEqual(ev.map((e) => [e.tipo.id, e.estado, e.diferencia]), [['tc-alactico', 'alto', 500], ['tc-piernas', 'bajo', 500]]);
  assert.deepEqual(D.objetivoTotal(tipos), { min: 2000, max: 5000 });
  assert.ok(D.tiposVisibles(a, tipos).every((t) => t.activo), 'inactive ones without metres are not shown');
  assert.ok(!D.tiposVisibles(a, tipos).some((t) => t.id === 'tc-brazos'));
});

test('week: Monday and range', () => {
  const l = D.lunesDe(new Date(2026, 9, 15)); // Thursday
  assert.equal(D.fechaIso(l), '2026-10-12');
  assert.deepEqual(D.rangoSemana(l), { desde: '2026-10-12', hasta: '2026-10-18' });
});
