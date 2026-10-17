import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/marcas.js';
import { crearMarcasService } from '../../js/application/marcasService.js';

const m = (o) => ({
  id: 'm' + Math.random().toString(36).slice(2, 8),
  nadadorId: 'n1',
  fecha: '2026-03-01',
  prueba: '100 Libre',
  piscina: '25',
  tiempoMs: 62000,
  ...o,
});

test('descomponerPrueba: spelling, case, accents and unit variants give ONE key and a canonical name', () => {
  for (const v of [
    '100 libre',
    '100 Libre',
    '100  LIBRE',
    '100m libre',
    '100 m Libre',
    '100 mts libre',
    ' 100 crol ',
  ]) {
    const d = D.descomponerPrueba(v);
    assert.deepEqual([d.clave, d.nombre, d.distancia, d.estilo], ['100-libre', '100 Libre', 100, 'libre'], v);
  }
  assert.equal(D.descomponerPrueba('100 mariposa').nombre, '100 Mariposa', '"m" of mariposa is not a unit');
  assert.equal(D.descomponerPrueba('200 estilos').clave, '200-estilos');
  assert.equal(D.descomponerPrueba('50 Pecho').nombre, '50 Braza');
  const raro = D.descomponerPrueba('  Aguas abiertas 5k ');
  assert.deepEqual([raro.estilo, raro.nombre, raro.clave], [null, 'Aguas abiertas 5k', 'aguas abiertas 5k']);
});

test('opcionesPruebas lists every event once (the old filter listed each event twice)', () => {
  const marcas = [m({ prueba: '100 libre' }), m({ prueba: '100 Libre' }), m({ prueba: '50 espalda' })];
  assert.deepEqual(
    D.opcionesPruebas(marcas).map((o) => o.valor),
    ['100 Libre', '50 Espalda'],
  );
  const todas = D.opcionesPruebas(marcas, { conPredefinidas: true });
  assert.equal(todas.filter((o) => o.clave === '100-libre').length, 1);
  assert.equal(todas.length, D.PRUEBAS.length);
  assert.equal(todas[0].valor, '50 Libre');
});

test('filtrarMarcas: selecting a canonical event finds rows stored in any spelling', () => {
  const marcas = [
    m({ id: 'a', prueba: '100 libre' }),
    m({ id: 'b', prueba: '100 Libre', nadadorId: 'n2' }),
    m({ id: 'c', prueba: '50 libre' }),
    m({ id: 'd', tiempoMs: 0 }),
  ];
  assert.deepEqual(
    D.filtrarMarcas(marcas, { prueba: '100 Libre' }).map((x) => x.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    D.filtrarMarcas(marcas, { prueba: '100 Libre', nadadorId: 'n2' }).map((x) => x.id),
    ['b'],
  );
  assert.deepEqual(D.filtrarMarcas(marcas, { piscina: '50' }), []);
});

test('mejoresMarcas / idsMejorMarca: best per swimmer + event + pool, ties keep the earliest', () => {
  const marcas = [
    m({ id: 'a', tiempoMs: 65000, fecha: '2026-01-01' }),
    m({ id: 'b', tiempoMs: 62000, fecha: '2026-03-01' }),
    m({ id: 'c', tiempoMs: 62000, fecha: '2026-05-01' }),
    m({ id: 'd', prueba: '100 libre', tiempoMs: 70000, fecha: '2026-02-01', piscina: '50' }),
    m({ id: 'e', nadadorId: 'n2', tiempoMs: 80000 }),
  ];
  assert.deepEqual([...D.idsMejorMarca(marcas)].sort(), ['b', 'd', 'e']);
  assert.deepEqual(
    D.mejoresMarcas(marcas)
      .map((x) => x.id)
      .sort(),
    ['b', 'd', 'e'],
  );
});

test('visibles: "see more" pagination of 50', () => {
  const lista = Array.from({ length: 120 }, (_, i) => i);
  assert.deepEqual(
    [D.visibles(lista, 1).items.length, D.visibles(lista, 1).restantes, D.visibles(lista, 1).hayMas],
    [50, 70, true],
  );
  assert.equal(D.visibles(lista, 3).items.length, 120);
  assert.equal(D.visibles(lista, 3).hayMas, false);
  assert.equal(D.visibles([], 1).items.length, 0);
});

test('elegirSerie: defaults to the swimmer with most marks, his main event and the most used pool', () => {
  const marcas = [
    m({ nadadorId: 'n1', prueba: '50 Libre', fecha: '2026-01-01' }),
    m({ nadadorId: 'n2', prueba: '100 libre', fecha: '2026-01-01' }),
    m({ nadadorId: 'n2', prueba: '100 Libre', fecha: '2026-02-01', tiempoMs: 61000 }),
    m({ nadadorId: 'n2', prueba: '100 Libre', fecha: '2026-03-01', tiempoMs: 60000 }),
    m({ nadadorId: 'n2', prueba: '100 Libre', fecha: '2026-03-02', piscina: '50' }),
    m({ nadadorId: 'n2', prueba: '50 Espalda' }),
  ];
  const s = D.elegirSerie(marcas);
  assert.deepEqual([s.nadadorId, s.prueba, s.piscina, s.marcas.length], ['n2', '100 Libre', '25', 3]);
  assert.deepEqual(
    s.marcas.map((x) => x.fecha),
    ['2026-01-01', '2026-02-01', '2026-03-01'],
    'chronological',
  );
  assert.equal(D.elegirSerie(marcas, { nadadorId: 'n1' }).prueba, '50 Libre');
  assert.equal(D.elegirSerie(marcas, { prueba: '50 espalda' }).nadadorId, 'n2');
  assert.equal(D.elegirSerie(marcas, { piscina: '50' }).marcas.length, 1);
  assert.equal(D.elegirSerie([], {}), null);
  assert.equal(D.elegirSerie(marcas, { nadadorId: 'nadie' }), null);
});

test('escalaEvolucion: faster times are higher, points follow the dates, PB is flagged and labels do not overlap', () => {
  const serie = [
    m({ fecha: '2026-01-01', tiempoMs: 65000 }),
    m({ fecha: '2026-01-02', tiempoMs: 60000 }),
    m({ fecha: '2026-06-01', tiempoMs: 62000 }),
  ];
  const g = D.escalaEvolucion(serie);
  assert.equal(g.puntos.length, 3);
  assert.ok(g.puntos[1].y < g.puntos[0].y, 'the faster time is drawn higher');
  assert.deepEqual(
    g.puntos.map((p) => p.mejor),
    [false, true, false],
  );
  assert.ok(g.puntos[2].x > g.puntos[1].x + 100, 'proportional to the date');
  assert.ok(g.puntos.every((p) => p.x >= g.area.x0 && p.x <= g.area.x1 && p.y >= g.area.y0 && p.y <= g.area.y1));
  for (let i = 1; i < g.ejeX.length; i++) assert.ok(g.ejeX[i].x - g.ejeX[i - 1].x >= 64);
  assert.equal(g.ejeY.length, 5);
  const uno = D.escalaEvolucion([m({})]);
  assert.equal(uno.puntos.length, 1);
  assert.ok(Number.isFinite(uno.puntos[0].x) && Number.isFinite(uno.puntos[0].y));
});

test('validarMarca: field-level error codes', () => {
  const ok = { nadadorId: 'n1', fecha: '2026-03-01', prueba: '100 Libre', piscina: '25', tiempo: '10245' };
  assert.deepEqual(D.validarMarca(ok), { errores: [], tiempoMs: 62450 });
  const codigos = (d) =>
    D.validarMarca({ ...ok, ...d }, { nadadorExiste: (id) => id === 'n1' }).errores.map((e) => e.codigo);
  assert.deepEqual(codigos({ nadadorId: '' }), ['nadador']);
  assert.deepEqual(codigos({ nadadorId: 'n9' }), ['nadador']);
  assert.deepEqual(codigos({ fecha: '2026-02-30' }), ['fecha']);
  assert.deepEqual(codigos({ prueba: '  ' }), ['prueba']);
  assert.deepEqual(codigos({ piscina: '33' }), ['piscina']);
  assert.deepEqual(codigos({ tiempo: '' }), ['tiempo-vacio']);
  assert.deepEqual(codigos({ tiempo: '17550' }), ['tiempo']);
  assert.deepEqual(codigos({ tiempo: 'rapidísimo' }), ['tiempo']);
});

test('migrarPruebas rewrites only recognised, non-canonical names', () => {
  const cambios = D.migrarPruebas([
    m({ id: 'a', prueba: '100 libre' }),
    m({ id: 'b', prueba: '100 Libre' }),
    m({ id: 'c', prueba: 'Aguas abiertas' }),
  ]);
  assert.deepEqual(cambios, [{ id: 'a', prueba: '100 Libre' }]);
});

// ---- swimsuit filter ----
const BANADORES = [
  { id: 'b1', tipo: 'entrenamiento', marca: 'Arena', modelo: 'Solid', activo: true, notas: '' },
  { id: 'b2', tipo: 'competicion', marca: 'Arena', modelo: 'Carbon Core FX', activo: true, notas: '' },
  { id: 'b3', tipo: 'competicion', marca: 'Speedo', modelo: 'LZR Pure', activo: true, notas: '' },
];
const CON_BANADOR = [
  m({ id: 'a', tiempoMs: 64000, banadorId: 'b1', fecha: '2026-01-01' }),
  m({ id: 'b', tiempoMs: 61000, banadorId: 'b2', fecha: '2026-02-01' }),
  m({ id: 'c', tiempoMs: 62000, banadorId: 'b3', fecha: '2026-03-01' }),
  m({ id: 'd', tiempoMs: 63000, fecha: '2026-04-01' }),
];

test('filtrarMarcasCompleto combines swimmer, event, pool and suit; PB follows the suit filter', () => {
  const ids = (f) =>
    D.filtrarMarcasCompleto(CON_BANADOR, f, BANADORES)
      .map((x) => x.id)
      .sort();
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ tipo: 'competicion' }), ['b', 'c']);
  assert.deepEqual(ids({ tipo: 'competicion', marca: 'arena' }), ['b']);
  assert.deepEqual(ids({ tipo: 'competicion', marca: 'arena', modelo: 'carbon core fx' }), ['b']);
  assert.deepEqual(ids({ tipo: 'entrenamiento', prueba: '100 libre' }), ['a']);
  assert.deepEqual(ids({ tipo: 'sin-banador' }), ['d']);
  // overall PB is b (61 s); with the training filter the PB is a (64 s)
  assert.deepEqual([...D.idsMejorMarca(D.filtrarPorBanador(CON_BANADOR, BANADORES, {}))], ['b']);
  assert.deepEqual([...D.idsMejorMarca(D.filtrarPorBanador(CON_BANADOR, BANADORES, { tipo: 'entrenamiento' }))], ['a']);
  assert.deepEqual(
    [...D.idsMejorMarca(D.filtrarPorBanador(CON_BANADOR, BANADORES, { tipo: 'competicion', marca: 'speedo' }))],
    ['c'],
  );
});

test('ajustarFiltroBanador drops a brand/model that the new type does not offer', () => {
  const r = D.ajustarFiltroBanador(
    { tipo: 'entrenamiento', marca: 'speedo', modelo: 'lzr pure' },
    BANADORES,
    CON_BANADOR,
  );
  assert.deepEqual(r.filtro, { tipo: 'entrenamiento', marca: '', modelo: '' });
  assert.deepEqual(
    r.opciones.marcas.map((o) => o.valor),
    ['arena'],
  );
  const k = D.ajustarFiltroBanador({ tipo: 'competicion', marca: 'arena', modelo: 'solid' }, BANADORES, CON_BANADOR);
  assert.deepEqual(k.filtro, { tipo: 'competicion', marca: 'arena', modelo: '' });
  assert.equal(D.hayFiltroBanador(k.filtro), true);
  assert.equal(D.hayFiltroBanador({}), false);
});

// ---- service ----
function repoMem(datos = {}) {
  const db = { Marcas: [], Nadadores: [{ id: 'n1' }], ...datos };
  let n = 0;
  return {
    db,
    list: (s) => (db[s] || []).map((r) => ({ ...r })),
    get: (s, id) => {
      const r = (db[s] || []).find((x) => x.id === String(id));
      return r ? { ...r } : null;
    },
    upsert(s, row) {
      const f = { ...row, id: row.id ? String(row.id) : 'g' + ++n };
      const i = db[s].findIndex((x) => x.id === f.id);
      if (i >= 0) db[s][i] = f;
      else db[s].push(f);
      return { ...f };
    },
    remove(s, id) {
      db[s] = db[s].filter((x) => x.id !== String(id));
    },
  };
}

test('service.registrar stores the canonical event, parsed milliseconds and the optional suit; errors are returned per field', () => {
  const repo = repoMem();
  const svc = crearMarcasService(repo);
  const r = svc.registrar({
    nadadorId: 'n1',
    fecha: '2026-03-01',
    prueba: '100 libre',
    piscina: '50',
    tiempo: '10245',
    competicion: ' Copa ',
    banadorId: 'b2',
  });
  assert.ok(r.ok);
  assert.deepEqual(
    [r.marca.prueba, r.marca.tiempoMs, r.marca.piscina, r.marca.competicion, r.marca.banadorId],
    ['100 Libre', 62450, '50', 'Copa', 'b2'],
  );
  const sin = svc.registrar({ nadadorId: 'n1', fecha: '2026-03-02', prueba: '50 Libre', tiempo: '2845' });
  assert.equal(sin.marca.piscina, '25');
  assert.equal('banadorId' in sin.marca, false);
  const mala = svc.registrar({ nadadorId: 'n1', fecha: '2026-03-01', prueba: '100 Libre', tiempo: '17550' });
  assert.deepEqual(mala, { ok: false, errores: [{ campo: 'tiempo', codigo: 'tiempo' }] });
  assert.equal(repo.db.Marcas.length, 2);
});

test('service.eliminar returns the row so Undo can restore it; migrarPruebas is idempotent', () => {
  const repo = repoMem({
    Marcas: [{ id: 'a', nadadorId: 'n1', fecha: '2026-01-01', prueba: '100 libre', piscina: '25', tiempoMs: 62000 }],
  });
  const svc = crearMarcasService(repo);
  assert.equal(svc.migrarPruebas(), 1);
  assert.equal(svc.migrarPruebas(), 0);
  assert.equal(repo.db.Marcas[0].prueba, '100 Libre');
  const fila = svc.eliminar('a');
  assert.equal(repo.db.Marcas.length, 0);
  svc.restaurar(fila);
  assert.equal(repo.db.Marcas[0].id, 'a');
});
