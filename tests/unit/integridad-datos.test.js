// Data integrity (pure, no network): type normalisation, lossless round trip, future versions,
// per-field merge with logical stamps and tombstones, orphan cleanup and row validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHEETS, ENTITY_SHEETS } from '../../js/domain/schema.js';
import {
  dataToDoc,
  docToData,
  mergeData,
  isEmptyData,
  pareceDocumentoClub,
  normalizarValor,
  normalizarClub,
  fechaDeSerieExcel,
  metaVacia,
  purgarLapidas,
  cmpSello,
  DOC_VERSION,
} from '../../js/domain/sheetdata.js';
import { validarFila, esFechaReal, edadEnAnios, idsDuplicados } from '../../js/domain/validacion.js';

const vacio = () => {
  const d = docToData({});
  d.meta = metaVacia();
  return d;
};
const con = (hoja, filas, club = {}) => {
  const d = vacio();
  d.db[hoja] = filas.map((f) => {
    const o = {};
    SHEETS[hoja].forEach((c) => {
      o[c] = f[c] === undefined ? '' : f[c];
    });
    return o;
  });
  d.club = club;
  return d;
};
const sellar = (d, hoja, id, sello) => {
  (d.meta.sellos[hoja] ||= {})[id] = sello;
  return d;
};
const lapida = (d, hoja, id, sello, h) => {
  (d.meta.lapidas[hoja] ||= {})[id] = { s: sello, ...(h ? { h: 1 } : {}) };
  return d;
};

// ---------- P0-3: types ----------
test('normalises types: phone/licence to text, club values text only, Excel serial date -> ISO, time fraction -> HH:MM', () => {
  assert.equal(normalizarValor('telefono', 612345678), '612345678');
  assert.equal(normalizarValor('licencia', 4001), '4001');
  assert.equal(normalizarValor('activo', true), 'true');
  assert.equal(normalizarValor('piscina', 25), '25');
  assert.equal(normalizarValor('grupoId', 7), '7');
  assert.equal(normalizarValor('metros', 1500), 1500, 'numeric columns are left alone');
  assert.equal(normalizarValor('fechaNacimiento', 44927), '2023-01-01');
  assert.equal(normalizarValor('fecha', '2026-03-04'), '2026-03-04');
  assert.equal(normalizarValor('horaInicio', 0.75), '18:00');
  assert.equal(normalizarValor('nombre', null), '');
  assert.equal(fechaDeSerieExcel(25569), '1970-01-01');
  assert.equal(fechaDeSerieExcel('x'), '');
  assert.equal(normalizarClub(123), '123');
  assert.equal(normalizarClub(null), '');
  assert.equal(normalizarClub(undefined), '');
  assert.equal(normalizarClub({ a: 1 }), '{"a":1}');
  assert.equal(normalizarClub(true), 'true');
});

test('docToData normalises a hand-edited file: numeric/object club name, phones and serial dates', () => {
  const d = docToData({
    version: 1,
    club: { nombre: 4242, lema: { x: 1 }, logo: null },
    hojas: {
      Nadadores: [
        {
          id: 5,
          nombre: 'Ana',
          apellidos: 'P',
          telefono: 600111222,
          licencia: 99,
          fechaNacimiento: 44927,
          activo: true,
        },
      ],
    },
  });
  assert.equal(typeof d.club.nombre, 'string');
  assert.equal(d.club.nombre, '4242');
  assert.equal(typeof d.club.lema, 'string');
  assert.equal(d.club.logo, '');
  const n = d.db.Nadadores[0];
  assert.deepEqual(
    [n.id, n.telefono, n.licencia, n.fechaNacimiento, n.activo],
    ['5', '600111222', '99', '2023-01-01', 'true'],
  );
});

// ---------- P0-2: future version and unknown data ----------
test('future version: detected; unknown sheets, columns and keys make a lossless round trip', () => {
  const doc = {
    version: DOC_VERSION + 1,
    club: { nombre: 'X' },
    hojas: {
      Nadadores: [{ id: 'n1', nombre: 'A', apellidos: 'B', futuraColumna: { deep: [1, 2] }, otra: 7 }],
      HojaFutura: [{ id: 'z', dato: 'valor' }],
    },
    claveSuperior: { a: 1 },
  };
  const d = docToData(JSON.parse(JSON.stringify(doc)));
  assert.equal(d.versionFutura, DOC_VERSION + 1);
  const vuelta = dataToDoc(d);
  assert.equal(vuelta.hojas.HojaFutura[0].dato, 'valor');
  assert.deepEqual(vuelta.hojas.Nadadores[0].futuraColumna, { deep: [1, 2] });
  assert.equal(vuelta.hojas.Nadadores[0].otra, 7);
  assert.deepEqual(vuelta.claveSuperior, { a: 1 });
  // the other known sheets are emitted empty but the unknown sheet and the extra columns survive
  assert.equal(JSON.stringify(docToData(vuelta).extra), JSON.stringify(d.extra));
  assert.equal(
    isEmptyData(docToData({ version: 9, hojas: { HojaFutura: [{ id: 1 }] } })),
    false,
    'unknown data counts as data',
  );
});

test('read warnings: repeated ids (the last wins) and rows without id are reported, not lost silently', () => {
  const d = docToData({
    hojas: { Grupos: [{ nombre: 'sin id' }, { id: 1, nombre: 'Uno' }, { id: '1', nombre: 'Uno bis' }] },
  });
  assert.deepEqual(
    d.db.Grupos.map((g) => g.nombre),
    ['Uno bis'],
  );
  assert.deepEqual(d.avisos.map((a) => a.tipo).sort(), ['duplicado', 'sin-id']);
});

test('pareceDocumentoClub tells an empty club apart from {} / null', () => {
  assert.equal(pareceDocumentoClub({ version: 1, club: {}, hojas: {} }), true);
  assert.equal(pareceDocumentoClub({}), false);
  assert.equal(pareceDocumentoClub(null), false);
  assert.equal(pareceDocumentoClub([]), false);
});

// ---------- P1-2: per-field merge ----------
test('merge: different fields of the SAME row are both kept', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'Pérez', telefono: '1', email: 'a@a.es' };
  const base = con('Nadadores', [fila]);
  const local = con('Nadadores', [{ ...fila, telefono: '999' }]);
  const remote = con('Nadadores', [{ ...fila, email: 'nuevo@a.es', nombre: 'Anita' }]);
  const m = mergeData(base, local, remote);
  assert.deepEqual(
    [m.db.Nadadores[0].telefono, m.db.Nadadores[0].email, m.db.Nadadores[0].nombre],
    ['999', 'nuevo@a.es', 'Anita'],
  );
});

test('merge: the same field edited on both sides is won by the highest logical stamp (no wall clock); without stamps, the local one', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'P' };
  const base = con('Nadadores', [fila]);
  const local = sellar(con('Nadadores', [{ ...fila, nombre: 'LOCAL' }]), 'Nadadores', 'n1', '5@a');
  const remote = sellar(con('Nadadores', [{ ...fila, nombre: 'REMOTO' }]), 'Nadadores', 'n1', '9@b');
  assert.equal(mergeData(base, local, remote).db.Nadadores[0].nombre, 'REMOTO');
  const local2 = sellar(con('Nadadores', [{ ...fila, nombre: 'LOCAL' }]), 'Nadadores', 'n1', '12@a');
  assert.equal(mergeData(base, local2, remote).db.Nadadores[0].nombre, 'LOCAL');
  assert.equal(
    mergeData(base, con('Nadadores', [{ ...fila, nombre: 'LOCAL' }]), con('Nadadores', [{ ...fila, nombre: 'REMOTO' }]))
      .db.Nadadores[0].nombre,
    'LOCAL',
  );
  assert.ok(cmpSello('10@a', '9@z') > 0 && cmpSello('9@a', '9@b') < 0, 'compared as numbers, the device breaks ties');
});

test('merge: local deletion vs remote edit -> the edit is not lost', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'P', telefono: '1' };
  const base = con('Nadadores', [fila]);
  const local = con('Nadadores', []); // local deletion
  const remote = con('Nadadores', [{ ...fila, telefono: '777' }]); // remote edit
  const m = mergeData(base, local, remote);
  assert.deepEqual(
    m.db.Nadadores.map((n) => [n.id, n.telefono]),
    [['n1', '777']],
  );
});

test('merge: remote deletion vs local edit -> the edit is not lost', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'P', telefono: '1' };
  const base = con('Nadadores', [fila]);
  const local = con('Nadadores', [{ ...fila, telefono: '555' }]);
  const remote = con('Nadadores', []);
  assert.deepEqual(
    mergeData(base, local, remote).db.Nadadores.map((n) => n.telefono),
    ['555'],
  );
});

test('merge: a deletion without a competing edit is applied (both directions) and leaves a tombstone', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'P' };
  const base = con('Nadadores', [fila]);
  const a = mergeData(base, con('Nadadores', []), con('Nadadores', [fila]));
  assert.deepEqual(a.db.Nadadores, []);
  assert.ok(a.meta.lapidas.Nadadores.n1, 'tombstone');
  const b = mergeData(base, con('Nadadores', [fila]), con('Nadadores', []));
  assert.deepEqual(b.db.Nadadores, []);
  assert.ok(b.meta.lapidas.Nadadores.n1);
});

test('merge without base: tombstones prevent resurrecting deleted rows; a later edit (higher stamp) overrides them', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'P' };
  const remote = lapida(con('Nadadores', []), 'Nadadores', 'n1', '8@b');
  assert.deepEqual(
    mergeData(null, sellar(con('Nadadores', [fila]), 'Nadadores', 'n1', '3@a'), remote).db.Nadadores,
    [],
    'the deletion is later',
  );
  assert.equal(
    mergeData(null, sellar(con('Nadadores', [{ ...fila, nombre: 'Nueva' }]), 'Nadadores', 'n1', '20@a'), remote).db
      .Nadadores[0].nombre,
    'Nueva',
    'edited after the deletion',
  );
});

test('merge: a GDPR purge tombstone (h) is never resurrected, even by a later edit', () => {
  const fila = { id: 'n1', nombre: 'Ana', apellidos: 'P' };
  const remote = lapida(con('Nadadores', []), 'Nadadores', 'n1', '2@b', true);
  const m = mergeData(
    con('Nadadores', [fila]),
    sellar(con('Nadadores', [{ ...fila, nombre: 'X' }]), 'Nadadores', 'n1', '99@a'),
    remote,
  );
  assert.deepEqual(m.db.Nadadores, []);
  assert.equal(m.meta.lapidas.Nadadores.n1.h, 1, 'the permanent tombstone is kept');
});

test('merge: orphans of a deleted parent are removed (loads, attendance, times, swimsuit, lines, phases...)', () => {
  const nad = { id: 'n1', nombre: 'Ana', apellidos: 'P' };
  const base = vacio();
  base.db.Nadadores = [con('Nadadores', [nad]).db.Nadadores[0]];
  base.db.Cargas = con('Cargas', [{ id: 'c1', nadadorId: 'n1', metros: 100 }]).db.Cargas;
  const remote = vacio(); // another device deleted the swimmer (and their rows)
  lapida(remote, 'Nadadores', 'n1', '4@b');
  const local = vacio(); // this device added new data for that swimmer in the meantime
  local.db.Nadadores = base.db.Nadadores;
  local.db.Cargas = con('Cargas', [
    { id: 'c1', nadadorId: 'n1', metros: 100 },
    { id: 'c2', nadadorId: 'n1', metros: 50 },
  ]).db.Cargas;
  local.db.Marcas = con('Marcas', [{ id: 'm1', nadadorId: 'n1', tiempoMs: 30000 }]).db.Marcas;
  local.db.Asistencia = con('Asistencia', [{ id: 'a1', nadadorId: 'n1', entrenamientoId: 'e9' }]).db.Asistencia;
  const m = mergeData(base, local, remote);
  assert.deepEqual(m.db.Nadadores, []);
  for (const h of ['Cargas', 'Marcas', 'Asistencia']) assert.deepEqual(m.db[h], [], h + ' has no orphans');
  assert.ok(m.meta.lapidas.Cargas.c2, 'removed orphans also leave a tombstone');
});

test('merge: a child whose parent NEVER existed is left alone (it is not a deletion)', () => {
  const local = vacio();
  local.db.Cargas = con('Cargas', [{ id: 'c1', nadadorId: 'fantasma', metros: 1 }]).db.Cargas;
  const m = mergeData(vacio(), local, vacio());
  assert.equal(m.db.Cargas.length, 1);
});

test('merge: the club merges key by key and the logical clock advances to the highest seen', () => {
  const base = con('Grupos', [], { nombre: 'X', lema: 'a' });
  const local = con('Grupos', [], { nombre: 'X', lema: 'a', colorPrimario: '#111111' });
  const remote = con('Grupos', [], { nombre: 'X', lema: 'b' });
  remote.meta.reloj = 40;
  const m = mergeData(base, local, remote);
  assert.deepEqual(m.club, { nombre: 'X', lema: 'b', colorPrimario: '#111111' });
  assert.ok(m.meta.reloj >= 40);
});

test("merge keeps the remote's unknown content (extra)", () => {
  const remote = docToData({ version: 1, hojas: { HojaFutura: [{ id: 'z' }] }, otraClave: 1 });
  const m = mergeData(vacio(), vacio(), remote);
  assert.deepEqual(m.extra.hojas.HojaFutura, [{ id: 'z' }]);
  assert.equal(m.extra.top.otraClave, 1);
});

test('purgarLapidas removes old soft tombstones and keeps GDPR purge ones', () => {
  const m = metaVacia();
  m.reloj = 100000;
  m.lapidas.Nadadores = { viejo: { s: '3@a' }, reciente: { s: '99990@a' }, rgpd: { s: '2@a', h: 1 } };
  assert.equal(purgarLapidas(m), 1);
  assert.deepEqual(Object.keys(m.lapidas.Nadadores).sort(), ['reciente', 'rgpd']);
});

test('every sheet is emitted in the document even when empty', () => {
  const doc = dataToDoc(vacio());
  assert.deepEqual(Object.keys(doc.hojas).sort(), [...ENTITY_SHEETS].sort());
});

// ---------- P1-7: validation ----------
test('validation: real dates, numeric ranges, Number.isFinite and a reasonable age', () => {
  const hoy = '2026-10-15';
  assert.equal(esFechaReal('2026-02-28'), true);
  assert.equal(esFechaReal('2026-02-31'), false);
  assert.equal(esFechaReal('2026-13-01'), false);
  assert.equal(esFechaReal('12/03/2015'), false);
  assert.equal(edadEnAnios('2015-10-16', hoy), 10);
  assert.deepEqual(validarFila('Nadadores', { fechaNacimiento: '2015-03-12' }, { hoy }), []);
  assert.deepEqual(validarFila('Nadadores', { fechaNacimiento: '' }, { hoy }), [], 'empty is valid');
  const cod = (s, r) => validarFila(s, r, { hoy }).map((e) => e.campo + ':' + e.codigo);
  assert.deepEqual(cod('Nadadores', { fechaNacimiento: '2015-02-30' }), ['fechaNacimiento:fecha-invalida']);
  assert.deepEqual(cod('Nadadores', { fechaNacimiento: '2027-01-01' }), ['fechaNacimiento:fecha-futura']);
  assert.deepEqual(cod('Nadadores', { fechaNacimiento: '2026-06-01' }), ['fechaNacimiento:edad-minima']);
  assert.deepEqual(cod('Nadadores', { fechaNacimiento: '1850-01-01' }), ['fechaNacimiento:edad-maxima']);
  assert.deepEqual(cod('Cargas', { fecha: '2026-10-01', metros: 1500, rpe: 7, minutos: 60 }), []);
  assert.deepEqual(cod('Cargas', { metros: 'mucho' }), ['metros:numero-invalido']);
  assert.deepEqual(cod('Cargas', { metros: Infinity }), ['metros:numero-invalido']);
  assert.deepEqual(cod('Cargas', { metros: NaN }), ['metros:numero-invalido']);
  assert.deepEqual(cod('Cargas', { rpe: 11 }), ['rpe:fuera-de-rango']);
  assert.deepEqual(cod('Cargas', { metros: -5 }), ['metros:fuera-de-rango']);
  assert.deepEqual(cod('Marcas', { tiempoMs: 0 }), ['tiempoMs:fuera-de-rango']);
  assert.deepEqual(cod('Marcas', { tiempoMs: '28500' }), []);
  assert.deepEqual(cod('Entrenamientos', { hora: '25:00' }), ['hora:hora-invalida']);
  assert.deepEqual(idsDuplicados([{ id: 'a' }, { id: 'b' }, { id: 'a' }, { id: 'a' }]), ['a']);
});
