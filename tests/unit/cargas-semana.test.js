import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/cargas.js';
import { crearCargasService } from '../../js/application/cargasService.js';

const tipos = () => D.sembrarCatalogo([]).map((x) => D.normalizarTipo(D.filaTipo(x)));

test('semanaDe / desplazarSemana work with ISO dates (Monday to Sunday)', () => {
  assert.deepEqual(D.semanaDe('2026-10-14'), { lunes: '2026-10-12', desde: '2026-10-12', hasta: '2026-10-18' });
  assert.equal(D.semanaDe('2026-10-18').lunes, '2026-10-12');
  assert.equal(D.semanaDe('2026-10-19').lunes, '2026-10-19');
  assert.equal(D.desplazarSemana('2026-10-12', -1), '2026-10-05');
  assert.equal(D.desplazarSemana('2026-12-28', 1), '2027-01-04');
});

test('cargasDeSemana filters by range and swimmer, newest first', () => {
  const cargas = [
    { id: '1', fecha: '2026-10-12', nadadorId: 'a' },
    { id: '2', fecha: '2026-10-14', nadadorId: 'b' },
    { id: '3', fecha: '2026-10-19', nadadorId: 'a' },
  ];
  assert.deepEqual(
    D.cargasDeSemana(cargas, { desde: '2026-10-12', hasta: '2026-10-18' }).map((c) => c.id),
    ['2', '1'],
  );
  assert.deepEqual(
    D.cargasDeSemana(cargas, { desde: '2026-10-12', hasta: '2026-10-18', nadadorId: 'a' }).map((c) => c.id),
    ['1'],
  );
});

test('validarCarga: metres are free (no 50 m step), every field has its own code', () => {
  const tipo = tipos()[0];
  const ok = { nadadorId: 'n1', fecha: '2026-10-14', metros: 1234, rpe: '', minutos: '' };
  assert.deepEqual(D.validarCarga(ok, { tipo }), []);
  const cod = (d, ctx = {}) =>
    D.validarCarga({ ...ok, ...d }, { tipo, nadadorExiste: (id) => id === 'n1', ...ctx }).map((e) => e.codigo);
  assert.deepEqual(cod({ nadadorId: '' }), ['nadador']);
  assert.deepEqual(cod({ fecha: '' }), ['fecha']);
  assert.deepEqual(cod({ metros: 0 }), ['metros']);
  assert.deepEqual(cod({ metros: '' }), ['metros']);
  assert.deepEqual(cod({ rpe: 11 }), ['rpe']);
  assert.deepEqual(cod({ minutos: 0 }), ['minutos']);
  assert.deepEqual(cod({}, { tipo: null }), ['tipo-inexistente']);
  assert.deepEqual(cod({}, { tipo: { ...tipo, activo: false } }), ['tipo-inactivo']);
  assert.deepEqual(cod({ entrenamientoId: 'zz' }, { sesionExiste: () => false }), ['sesion-inexistente']);
});

test('validarObjetivos: validates everything first and only reports the rows that changed', () => {
  const t = tipos();
  t[0].min = 100;
  t[0].max = 900;
  const r = D.validarObjetivos(
    [
      { id: t[0].id, min: '100', max: '900' },
      { id: t[1].id, min: '500', max: '1000' },
      { id: t[2].id, min: '', max: '' },
    ],
    t,
  );
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.cambios, [{ id: t[1].id, min: 500, max: 1000 }]);
  const mala = D.validarObjetivos(
    [
      { id: t[1].id, min: '900', max: '100' },
      { id: t[2].id, min: '-5', max: '' },
      { id: t[3].id, min: 'x', max: '' },
    ],
    t,
  );
  assert.deepEqual(
    mala.errores.map((e) => [e.campo, e.codigo]),
    [
      ['max', 'minmax'],
      ['min', 'objetivo-invalido'],
      ['min', 'objetivo-invalido'],
    ],
  );
  assert.deepEqual(D.validarObjetivos([{ id: t[1].id, min: '0', max: '0' }], t).cambios, [], 'zero equals no target');
});

test('filasContenidos / segmentosPorDia give percentages of a common scale', () => {
  const t = tipos();
  const agregado = D.agregarSemana({
    cargas: [
      { nadadorId: 'a', fecha: '2026-10-12', metros: 1000, tipo: t[0].nombre },
      { nadadorId: 'a', fecha: '2026-10-13', metros: 500, tipo: 'Otro' },
    ],
    tipos: t,
    desde: '2026-10-12',
    hasta: '2026-10-18',
  });
  t[0].max = 800;
  const sem = { agregado, tipos: t, evaluacion: D.evaluarSemana(agregado, t) };
  const g = D.filasContenidos(sem);
  const fila = g.filas.find((f) => f.tipo.id === t[0].id);
  assert.deepEqual([fila.estado, fila.diferencia, fila.pctMax !== null], ['alto', 200, true]);
  assert.ok(fila.pct > 0 && fila.pct <= 100);
  assert.ok(g.sinClasificar.pct > 0 && g.sinClasificar.pct < fila.pct);
  const d = D.segmentosPorDia(sem);
  assert.equal(d.dias.length, 7);
  assert.deepEqual(
    d.dias[0].segmentos.map((s) => s.tipoId),
    [t[0].id],
  );
  assert.deepEqual(
    d.dias[1].segmentos.map((s) => s.tipoId),
    [''],
  );
  assert.equal(d.dias[2].segmentos.length, 0);
});

function repoMem() {
  const db = { TiposCarga: [], Cargas: [], ObjetivosCarga: [], Nadadores: [{ id: 'n1' }], Entrenamientos: [] };
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

test('service: guardarObjetivos is all-or-nothing; eliminarCarga/restaurarCarga support Undo; semana accepts ISO dates', () => {
  const repo = repoMem();
  const svc = crearCargasService(repo, { generarId: () => 'tc-x' });
  svc.asegurarCatalogo();
  const [a, b] = svc.activos();
  const mala = svc.guardarObjetivos([
    { id: a.id, min: 100, max: 500 },
    { id: b.id, min: 900, max: 100 },
  ]);
  assert.equal(mala.ok, false);
  assert.equal(svc.tipo(a.id).min, null, 'nothing saved when one row is invalid');
  const buena = svc.guardarObjetivos([
    { id: a.id, min: 100, max: 500 },
    { id: b.id, min: '', max: '' },
  ]);
  assert.deepEqual([buena.ok, buena.guardados], [true, 1]);
  assert.deepEqual([svc.tipo(a.id).min, svc.tipo(a.id).max], [100, 500]);
  assert.equal(svc.guardarObjetivos([{ id: a.id, min: 100, max: 500 }]).guardados, 0);

  const r = svc.registrarCarga({
    nadadorId: 'n1',
    fecha: '2026-10-14',
    tipoId: a.id,
    metros: '1234',
    rpe: '',
    minutos: '',
  });
  assert.ok(r.ok);
  assert.equal(r.carga.metros, 1234);
  assert.equal(svc.semana('2026-10-12').agregado.total > 0, true);
  const fila = svc.eliminarCarga(r.carga.id);
  assert.equal(repo.db.Cargas.length, 0);
  svc.restaurarCarga(fila);
  assert.equal(repo.db.Cargas[0].id, r.carga.id);
  assert.deepEqual(
    svc.registrarCarga({ nadadorId: '', fecha: '', tipoId: a.id, metros: 0 }).errores.map((e) => e.codigo),
    ['nadador', 'fecha', 'metros'],
  );
});

test('service: without an injected generarId the catalogue migration refuses to invent ids', () => {
  const repo = repoMem();
  repo.db.Cargas.push({ id: 'c1', tipo: 'Fuerza', nadadorId: 'n1', fecha: '2026-10-14', metros: 100 });
  assert.throws(() => crearCargasService(repo).asegurarCatalogo(), /generarId/);
});
