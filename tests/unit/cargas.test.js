import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/cargas.js';

const ids = () => { let n = 0; return () => 'x' + (++n); };
const sembrado = () => D.sembrarCatalogo([]).map((t) => ({ ...t }));

test('catálogo predefinido: 10 contenidos únicos, ids estables, colores válidos y categorías conocidas', () => {
  assert.equal(D.CATALOGO_PREDEFINIDO.length, 10);
  assert.deepEqual(D.CATALOGO_PREDEFINIDO.map((c) => c.nombre), [
    'Aeróbico ligero', 'Aeróbico medio / Umbral anaeróbico', 'Aeróbico intenso / Potencia aeróbica', 'Anaeróbico / Tolerancia al lactato',
    'Aláctico / Sprint', 'Piernas', 'Brazos', 'Técnica', 'Salidas', 'Virajes/volteos']);
  assert.equal(new Set(D.CATALOGO_PREDEFINIDO.map((c) => c.id)).size, 10);
  assert.equal(new Set(D.CATALOGO_PREDEFINIDO.map((c) => c.color)).size, 10, 'cada contenido con color propio');
  for (const c of D.CATALOGO_PREDEFINIDO) {
    assert.match(c.id, /^tc-/);
    assert.ok(D.colorValido(c.color));
    assert.ok(D.CATEGORIAS_TIPO.includes(c.categoria));
    assert.ok(c.descripcion.length > 20);
  }
  assert.match(D.CATALOGO_PREDEFINIDO[0].descripcion, /Borg 4-5\/10/);
});

test('normalizarNombre: sin tildes, mayúsculas ni espacios de más', () => {
  assert.equal(D.normalizarNombre('  AERÓBICO   Ligero '), 'aerobico ligero');
  assert.equal(D.normalizarNombre('Virajes / volteos'), D.normalizarNombre('virajes/Volteos'));
  assert.equal(D.normalizarNombre(null), '');
});

test('normalizarTipo y filaTipo: ida y vuelta, valores por defecto y objetivos 0 = sin objetivo', () => {
  const t = D.normalizarTipo({ id: 5, nombre: ' X ', color: 'zzz', categoria: 'rara', orden: '', activo: '', predefinido: 'TRUE', minSemanalM: 0, maxSemanalM: '1500' });
  assert.deepEqual(t, { id: '5', nombre: 'X', descripcion: '', color: D.COLOR_SIN_TIPO, categoria: 'personalizado', orden: 999, activo: true, predefinido: true, min: null, max: 1500, alias: [] });
  const f = D.filaTipo(t);
  assert.deepEqual([f.activo, f.predefinido, f.minSemanalM, f.maxSemanalM], ['true', 'true', '', 1500]);
  assert.equal(D.normalizarTipo({ id: 'a', nombre: 'a', activo: 'FALSE' }).activo, false);
  assert.equal(D.normalizarTipo({ id: 'a', nombre: 'a', activo: false }).activo, false);
});

test('validarTipo: nombre obligatorio, único (sin mayúsculas ni tildes), largo, objetivos y colores', () => {
  const ex = sembrado();
  const codigos = (d, o) => D.validarTipo(d, ex, o).map((e) => e.codigo);
  assert.deepEqual(codigos({ nombre: '  ' }), ['nombre-vacio']);
  assert.deepEqual(codigos({ nombre: 'AEROBICO LIGERO' }), ['nombre-duplicado']);
  assert.deepEqual(codigos({ nombre: 'virajes / VOLTEOS' }), ['nombre-duplicado']);
  assert.deepEqual(codigos({ nombre: 'Aeróbico ligero' }, { id: 'tc-aerobico-ligero' }), [], 'editarse a sí mismo no es duplicado');
  assert.deepEqual(codigos({ nombre: 'x'.repeat(61) }), ['nombre-largo']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', color: 'rojo' }), ['color-invalido']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: '-5' }), ['objetivo-invalido']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: 'abc' }), ['objetivo-invalido']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: '3000', max: '1000' }), ['minmax']);
  assert.deepEqual(codigos({ nombre: 'Nuevo', min: '1000', max: '' , color: '#aabbcc' }), []);
  assert.deepEqual(codigos({ nombre: 'Nuevo', descripcion: 'd'.repeat(241) }), ['descripcion-larga']);
});

test('sembrarCatalogo: idempotente, no duplica ni pisa ediciones, respeta nombres ya existentes', () => {
  const primero = D.sembrarCatalogo([]);
  assert.equal(primero.length, 10);
  assert.deepEqual(D.sembrarCatalogo(primero), []);
  // el usuario editó un predefinido y borró otro (p. ej. a mano en la hoja): sólo se repone el que falta
  const editado = primero.filter((t) => t.id !== 'tc-brazos').map((t) => (t.id === 'tc-piernas' ? { ...t, color: '#123456', descripcion: 'Mía' } : t));
  const falta = D.sembrarCatalogo(editado);
  assert.deepEqual(falta.map((t) => t.id), ['tc-brazos']);
  assert.equal(editado.find((t) => t.id === 'tc-piernas').color, '#123456');
  // contenido personalizado con el mismo nombre que un predefinido: no se siembra el duplicado
  const propio = [{ id: 'mio', nombre: 'BRAZOS', categoria: 'personalizado', orden: 50, activo: true }];
  assert.ok(!D.sembrarCatalogo(propio).some((t) => D.normalizarNombre(t.nombre) === 'brazos'));
});

test('migración: tipos antiguos conservados como personalizados, Piernas/Técnica usan el predefinido, objetivos movidos', () => {
  const tipos = sembrado();
  const cargas = [
    { id: 'c1', tipo: 'Aeróbico' }, { id: 'c2', tipo: 'aerobico' }, { id: 'c3', tipo: 'Velocidad' }, { id: 'c4', tipo: 'Piernas' },
    { id: 'c5', tipo: 'Técnica' }, { id: 'c6', tipo: 'Fuerza' }, { id: 'c7', tipo: '' }, { id: 'c8', tipo: 'Aláctico / Sprint' },
  ];
  const objetivos = [
    { id: 'o1', tipo: 'Aeróbico', minSemanalM: 6000, maxSemanalM: 12000 },
    { id: 'o2', tipo: 'Piernas', minSemanalM: 1000, maxSemanalM: 2500 },
    { id: 'o3', tipo: 'Técnica', minSemanalM: 0, maxSemanalM: 4000 },
    { id: 'o4', tipo: 'Natación sincro', minSemanalM: 0, maxSemanalM: 0 }, // sin cargas ni objetivo: no crea nada
  ];
  const r = D.migrarHeredados({ tipos, cargas, objetivos, generarId: ids() });
  assert.deepEqual(r.crear.map((t) => t.nombre).sort(), ['Aeróbico', 'Fuerza', 'Velocidad']);
  for (const t of r.crear) assert.deepEqual([t.categoria, t.predefinido, t.activo], ['personalizado', false, true]);
  const aero = r.crear.find((t) => t.nombre === 'Aeróbico');
  assert.deepEqual([aero.min, aero.max], [6000, 12000]);
  assert.deepEqual(r.actualizar.map((t) => [t.id, t.min, t.max]).sort(), [['tc-piernas', 1000, 2500], ['tc-tecnica', null, 4000]]);
  assert.deepEqual(r.eliminarObjetivos, ['o1', 'o2', 'o3', 'o4']);
});

test('migración: no pisa objetivos ya definidos y es idempotente (prepararCatalogo)', () => {
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

test('resolverTipo, ordenarTipos y agruparPorCategoria', () => {
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
  { nadadorId: 'a', fecha: '2026-10-12', metros: 2000, tipo: 'Piernas' },       // lunes
  { nadadorId: 'a', fecha: '2026-10-14', metros: 1000, tipo: 'piernas' },       // miércoles
  { nadadorId: 'b', fecha: '2026-10-14', metros: 3000, tipo: 'Aláctico / Sprint' },
  { nadadorId: 'b', fecha: '2026-10-18', metros: 500, tipo: 'Misterioso' },     // domingo, sin clasificar
  { nadadorId: 'b', fecha: '2026-10-19', metros: 9999, tipo: 'Piernas' },       // otra semana
];

test('agregarSemana: media por nadador con carga, por contenido y por día; sin clasificar aparte', () => {
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

test('evaluarObjetivo y evaluarSemana: alto, bajo, ok, sin objetivo; sólo activos con objetivo', () => {
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
  assert.ok(D.tiposVisibles(a, tipos).every((t) => t.activo), 'inactivos sin metros no se muestran');
  assert.ok(!D.tiposVisibles(a, tipos).some((t) => t.id === 'tc-brazos'));
});

test('semana: lunes y rango', () => {
  const l = D.lunesDe(new Date(2026, 9, 15)); // jueves
  assert.equal(D.fechaIso(l), '2026-10-12');
  assert.deepEqual(D.rangoSemana(l), { desde: '2026-10-12', hasta: '2026-10-18' });
});
