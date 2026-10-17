import test from 'node:test';
import assert from 'node:assert/strict';
import { crearBanadoresService } from '../../js/application/banadoresService.js';

// In-memory repository with the same interface as the store.
function repoMem(datos = {}) {
  const db = { Banadores: [], Marcas: [], ...datos };
  let n = 0;
  return {
    db,
    list: (s) => (db[s] || []).map((r) => ({ ...r })),
    get: (s, id) => {
      const r = (db[s] || []).find((x) => x.id === String(id));
      return r ? { ...r } : null;
    },
    upsert(s, row) {
      db[s] = db[s] || [];
      const fila = { ...row, id: row.id ? String(row.id) : 'g' + ++n };
      const i = db[s].findIndex((x) => x.id === fila.id);
      if (i >= 0) db[s][i] = fila;
      else db[s].push(fila);
      return fila;
    },
    remove(s, id) {
      db[s] = (db[s] || []).filter((x) => x.id !== String(id));
    },
  };
}
const nuevo = (datos) => {
  const repo = repoMem(datos);
  let i = 0;
  return { repo, svc: crearBanadoresService(repo, { generarId: () => 'bn-t' + ++i }) };
};
const fast = { tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon Core FX' };

test('crear: validates, trims, stores neutral values and starts active', () => {
  const { repo, svc } = nuevo();
  assert.deepEqual(
    svc.crear({ tipo: 'competicion', marca: '', modelo: '' }).errores.map((e) => e.codigo),
    ['marca-vacia', 'modelo-vacio'],
  );
  assert.equal(repo.db.Banadores.length, 0, 'nothing saved when invalid');
  const r = svc.crear({ ...fast, marca: '  Arena ', notas: ' sala ' });
  assert.ok(r.ok);
  assert.deepEqual(r.banador, {
    id: 'bn-t1',
    tipo: 'competicion',
    marca: 'Arena',
    modelo: 'Powerskin Carbon Core FX',
    activo: true,
    notas: 'sala',
  });
  assert.deepEqual(repo.db.Banadores[0], {
    id: 'bn-t1',
    tipo: 'competicion',
    marca: 'Arena',
    modelo: 'Powerskin Carbon Core FX',
    activo: 'true',
    notas: 'sala',
  });
  assert.equal(
    svc.crear({ ...fast, marca: 'arena', modelo: 'POWERSKIN carbon core fx' }).errores[0].codigo,
    'duplicado',
  );
  assert.ok(svc.crear({ tipo: 'entrenamiento', marca: '', modelo: '' }).ok, 'a generic training suit is valid');
});

test('editar: keeps unspecified fields, validates uniqueness against the others and can change the type', () => {
  const { svc } = nuevo();
  const a = svc.crear(fast).banador;
  const b = svc.crear({ tipo: 'competicion', marca: 'Speedo', modelo: 'LZR' }).banador;
  assert.equal(svc.editar('nada', {}).errores[0].codigo, 'no-existe');
  assert.equal(svc.editar(b.id, { marca: 'Arena', modelo: 'Powerskin Carbon Core FX' }).errores[0].codigo, 'duplicado');
  assert.ok(svc.editar(a.id, { marca: 'ARENA' }).ok, 'editing itself is not a duplicate');
  const r = svc.editar(b.id, { modelo: 'LZR Pure', notas: 'x' });
  assert.deepEqual(
    [r.banador.marca, r.banador.modelo, r.banador.tipo, r.banador.activo, r.banador.notas],
    ['Speedo', 'LZR Pure', 'competicion', true, 'x'],
  );
  assert.equal(svc.editar(b.id, { tipo: 'basura' }).errores[0].codigo, 'tipo-invalido');
});

test('activar / desactivar: inactive suits leave activos() but stay in the catalogue and keep their marks', () => {
  const { svc } = nuevo({ Marcas: [{ id: 'm1', nadadorId: 'n1', banadorId: 'bn-t1' }] });
  const b = svc.crear(fast).banador;
  assert.ok(svc.desactivar(b.id).ok);
  assert.deepEqual(svc.activos(), []);
  assert.equal(svc.banadores().length, 1);
  assert.deepEqual(
    svc.disponiblesParaMarca('bn-t1').map((x) => x.id),
    ['bn-t1'],
  );
  assert.equal(svc.usos(b.id), 1);
  assert.ok(svc.activar(b.id, true).ok);
  assert.equal(svc.activos().length, 1);
  assert.equal(svc.activar('nada').errores[0].codigo, 'no-existe');
});

test('borrar: refuses a suit referenced by marks (deactivate or merge instead); deletes an unused one; restaurar undoes it', () => {
  const { repo, svc } = nuevo({
    Marcas: [
      { id: 'm1', nadadorId: 'n1', banadorId: 'bn-t1' },
      { id: 'm2', nadadorId: 'n1', banadorId: 'bn-t1' },
    ],
  });
  const usado = svc.crear(fast).banador;
  const libre = svc.crear({ tipo: 'entrenamiento', marca: 'Speedo', modelo: 'Endurance+' }).banador;
  assert.deepEqual(svc.borrar(usado.id), { ok: false, motivo: 'en-uso', usos: 2 });
  assert.ok(svc.banador(usado.id), 'still there');
  assert.equal(svc.borrar('nada').motivo, 'no-existe');
  const r = svc.borrar(libre.id);
  assert.ok(r.ok);
  assert.equal(svc.banador(libre.id), null);
  assert.ok(svc.restaurar(r.banador).ok, 'undo');
  assert.deepEqual(svc.banador(libre.id), libre);
  assert.equal(repo.db.Banadores.length, 2);
  // the marks of the used suit were never touched
  assert.deepEqual(
    repo.db.Marcas.map((m) => m.banadorId),
    ['bn-t1', 'bn-t1'],
  );
});

test('restaurar: refuses to resurrect a suit whose (type, brand, model) was created again meanwhile', () => {
  const { svc } = nuevo();
  const b = svc.crear(fast).banador;
  svc.borrar(b.id);
  svc.crear(fast);
  const r = svc.restaurar(b);
  assert.equal(r.ok, false);
  assert.equal(r.errores[0].codigo, 'duplicado');
});

test('fusionar: moves the marks to the destination and deletes the origin', () => {
  const { repo, svc } = nuevo({
    Marcas: [
      { id: 'm1', nadadorId: 'n1', banadorId: 'bn-t1' },
      { id: 'm2', nadadorId: 'n1', banadorId: 'bn-t1' },
      { id: 'm3', nadadorId: 'n1', banadorId: 'bn-t2' },
      { id: 'm4', nadadorId: 'n1', banadorId: '' },
    ],
  });
  const a = svc.crear({ tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin' }).banador;
  const b = svc.crear({ tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon' }).banador;
  assert.equal(svc.fusionar(a.id, a.id).motivo, 'mismo');
  assert.equal(svc.fusionar(a.id, 'nada').motivo, 'no-existe');
  assert.deepEqual(svc.fusionar(a.id, b.id), { ok: true, reasignadas: 2 });
  assert.equal(svc.banador(a.id), null);
  assert.deepEqual(
    repo.db.Marcas.map((m) => m.banadorId),
    ['bn-t2', 'bn-t2', 'bn-t2', ''],
  );
  assert.equal(svc.usos(b.id), 3);
});

test('marcasDeBanador, conteoUsos, opcionesFiltro and asignarAMarca', () => {
  const { svc } = nuevo({
    Marcas: [
      { id: 'm1', nadadorId: 'n1' },
      { id: 'm2', nadadorId: 'n1', banadorId: 'bn-t2' },
    ],
  });
  const a = svc.crear(fast).banador;
  const b = svc.crear({ tipo: 'entrenamiento', marca: 'Speedo', modelo: 'Endurance+' }).banador;
  assert.deepEqual(
    svc.marcasDeBanador(b.id).map((m) => m.id),
    ['m2'],
  );
  assert.deepEqual(Object.fromEntries(svc.conteoUsos()), { [a.id]: 0, [b.id]: 1 });
  assert.equal(svc.asignarAMarca('m1', a.id).marca.banadorId, a.id);
  assert.equal(svc.asignarAMarca('m1', 'nada').errores[0].codigo, 'no-existe');
  assert.equal(svc.asignarAMarca('mX', a.id).errores[0].codigo, 'no-existe');
  assert.equal(svc.asignarAMarca('m1', '').marca.banadorId, '', 'clearing the suit');
  assert.deepEqual(svc.opcionesFiltro().tipos, [{ valor: 'entrenamiento', n: 1 }]);
  assert.equal(svc.opcionesFiltro().sinBanador, 1);
  assert.equal(svc.etiqueta(a.id), 'Arena Powerskin Carbon Core FX — fast skin');
});
