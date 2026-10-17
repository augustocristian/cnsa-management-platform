// Pure rules of the sessions list (domain/entrenamientos.js) and the unsaved-diff helpers of domain/entreno.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const E = await importApp('js/domain/entrenamientos.js');
const D = await importApp('js/domain/entreno.js');

const ses = (id, fecha, hora, extra = {}) => ({
  id,
  fecha,
  hora,
  titulo: 'T' + id,
  grupoId: 'g1',
  estado: 'planificado',
  ...extra,
});

test('week ranges: Monday to Sunday and seven consecutive days', () => {
  assert.equal(E.lunesDe('2026-10-14'), '2026-10-12'); // Wednesday
  assert.equal(E.lunesDe('2026-10-12'), '2026-10-12');
  assert.equal(E.lunesDe('2026-10-18'), '2026-10-12'); // Sunday
  assert.equal(E.finSemana('2026-10-12'), '2026-10-18');
  assert.deepEqual(E.diasDeSemana('2026-10-26'), [
    '2026-10-26',
    '2026-10-27',
    '2026-10-28',
    '2026-10-29',
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ]);
  assert.equal(E.sumarDias('2026-12-28', 7), '2027-01-04');
});

test('ordering: date, then time (also 7:30 as 07:30), then title', () => {
  const r = E.ordenarSesiones([
    ses('c', '2026-10-13', '07:00'),
    ses('a', '2026-10-12', '19:00'),
    ses('b', '2026-10-12', '7:30'),
    ses('d', '2026-10-12', '7:30', { titulo: 'A first' }),
  ]);
  assert.deepEqual(
    r.map((s) => s.id),
    ['d', 'b', 'a', 'c'],
  );
});

test('armarSemana: groups by day, filters by group and marks today', () => {
  const todas = [
    ses('1', '2026-10-12', '10:00'),
    ses('2', '2026-10-14', '09:00', { grupoId: 'g2' }),
    ses('3', '2026-10-19', '09:00'),
    ses('4', '2026-10-14', '08:00'),
  ];
  const w = E.armarSemana(todas, '2026-10-12', { hoy: '2026-10-14' });
  assert.equal(w.total, 3);
  assert.equal(w.fin, '2026-10-18');
  assert.deepEqual(
    w.dias.map((d) => d.sesiones.length),
    [1, 0, 2, 0, 0, 0, 0],
  );
  assert.deepEqual(
    w.dias.filter((d) => d.esHoy).map((d) => d.fecha),
    ['2026-10-14'],
  );
  assert.deepEqual(
    w.dias[2].sesiones.map((s) => s.id),
    ['4', '2'],
  );
  const g = E.armarSemana(todas, '2026-10-12', { grupoId: 'g2' });
  assert.equal(g.total, 1);
});

test('metaSesion: message keys and params, plan summary last', () => {
  const m = E.metaSesion(
    { duracionMin: 60, piscina: '25', volumenMin: 2000, volumenMax: '', enfoque: 'Técnica' },
    { metros: 900, tiempoMin: 25 },
  );
  assert.deepEqual(
    m.map((x) => x.clave),
    ['entre.meta-min', 'entre.meta-piscina', 'entre.meta-vol', 'entre.meta-enfoque', 'entreno.chip'],
  );
  assert.deepEqual(m[2].params, { min: 2000, max: '?' });
  assert.deepEqual(E.metaSesion({}, null), []);
  assert.deepEqual(E.metaSesion({}, { metros: 0, tiempoMin: 0 }), []);
});

test('validarFormulario: required fields, real dates, numbers and volume range', () => {
  assert.deepEqual(E.validarFormulario({ titulo: 'X', fecha: '2026-10-14' }), {});
  assert.deepEqual(E.validarFormulario({}), { titulo: 'obligatorio', fecha: 'obligatorio' });
  assert.equal(E.validarFormulario({ titulo: 'X', fecha: '2026-02-31' }).fecha, 'fecha-invalida');
  assert.equal(
    E.validarFormulario({ titulo: 'X', fecha: '2026-10-14', duracionMin: '-5' }).duracionMin,
    'numero-invalido',
  );
  assert.equal(
    E.validarFormulario({ titulo: 'X', fecha: '2026-10-14', volumenMin: 'abc' }).volumenMin,
    'numero-invalido',
  );
  assert.equal(
    E.validarFormulario({ titulo: 'X', fecha: '2026-10-14', volumenMin: '5000', volumenMax: '1000' }).volumenMax,
    'volumen-rango',
  );
  assert.deepEqual(
    E.validarFormulario({ titulo: 'X', fecha: '2026-10-14', volumenMin: '1000', volumenMax: '1000' }),
    {},
  );
  assert.deepEqual(
    E.validarFormulario({ titulo: 'X', fecha: '2026-10-14', volumenMin: '1,5' }),
    {},
    'decimal comma is accepted',
  );
});

test('duplication rules and state toggle', () => {
  const orig = ses('s1', '2026-10-14', '10:00', { estado: 'realizado', titulo: 'Original' });
  const d = E.borradorDuplicado(orig);
  assert.equal(d.id, undefined);
  assert.equal(d.estado, 'planificado');
  assert.equal(d.copiaDe, 's1');
  assert.equal(d.titulo, 'Original');
  assert.equal(orig.estado, 'realizado', 'the original is not touched');
  assert.equal(E.alternarEstado('planificado'), 'realizado');
  assert.equal(E.alternarEstado('realizado'), 'planificado');
  assert.deepEqual(E.borradorNuevo({ fecha: '2026-10-14', grupoId: 'g1' }), {
    fecha: '2026-10-14',
    grupoId: 'g1',
    estado: 'planificado',
  });
});

// ---------- unsaved-changes detection ----------
const L = (set, orden, extra = {}) => ({ set, orden, ...extra });
const base = () => ({
  tipoSesion: 'Aer',
  materialDia: '',
  notasGenerales: '',
  lineas: [L(1, 1, { series: 4, distancia: 100, ejercicio: 'Crol' }), L(1, 2, {})],
});

test('firmaPlan ignores ids, empty rows and number formatting', () => {
  const a = base();
  const b = {
    ...base(),
    lineas: [
      L(1, 1, { id: 'x', entrenamientoId: 's9', series: '4', distancia: '100', ejercicio: 'Crol' }),
      L(2, 1, {}),
      L(2, 2, {}),
    ],
  };
  assert.equal(D.planCambiado(a, b), false);
  assert.equal(D.firmaPlan(a), D.firmaPlan(b));
});

test('planCambiado detects edits in header, rows, contents and strokes, and undoing an edit', () => {
  const a = base();
  const c = (f) => {
    const x = base();
    f(x);
    return x;
  };
  assert.ok(
    D.planCambiado(
      a,
      c((x) => {
        x.tipoSesion = 'Otro';
      }),
    ),
  );
  assert.ok(
    D.planCambiado(
      a,
      c((x) => {
        x.lineas[0].series = 5;
      }),
    ),
  );
  assert.ok(
    D.planCambiado(
      a,
      c((x) => {
        x.lineas[1].notas = 'n';
      }),
    ),
    'a previously empty row now has content',
  );
  assert.ok(
    D.planCambiado(
      a,
      c((x) => {
        x.lineas[0].componentes = [{ contenido: 'Piernas', metrosPorRep: 50, modo: 'manual' }];
      }),
    ),
  );
  assert.ok(
    D.planCambiado(
      a,
      c((x) => {
        x.lineas[0].estilos = [{ estilo: 'Crol', metrosPorRep: null }];
      }),
    ),
  );
  assert.ok(
    D.planCambiado(
      a,
      c((x) => {
        x.lineas.push(L(2, 1, { series: 1, distancia: 50 }));
      }),
    ),
  );
  const x = c((y) => {
    y.lineas[0].series = 9;
  });
  x.lineas[0].series = 4;
  assert.equal(D.planCambiado(a, x), false, 'back to the original value = clean again');
  assert.equal(
    D.planCambiado(
      a,
      c((y) => {
        y.tipoSesion = ' Aer ';
      }),
    ),
    false,
    'surrounding spaces do not count',
  );
});

test('planVacio, totalesPorSet and resumenFila', () => {
  assert.equal(D.planVacio([]), true);
  assert.equal(D.planVacio([L(1, 1, {}), L(1, 2, { series: '' })]), true);
  assert.equal(D.planVacio([L(1, 1, { ejercicio: 'x' })]), false);
  assert.deepEqual(
    D.totalesPorSet([
      L(1, 1, { series: 2, distancia: 50, tiempoMin: 3 }),
      L(1, 2, { series: 1, distancia: 100 }),
      L(2, 1, {}),
    ]),
    [
      { set: 1, metros: 200, tiempoMin: 3 },
      { set: 2, metros: 0, tiempoMin: 0 },
    ],
  );
  const r = D.resumenFila(
    L(1, 1, { salida: ' C/1\'10" ', material: 'Tabla', notas: 'n', componentes: [{ contenido: 'Piernas' }] }),
  );
  assert.deepEqual(r, { salida: 'C/1\'10"', material: 'Tabla', tiempoMin: '', objetivo: '', contenidos: 1, mas: true });
});
