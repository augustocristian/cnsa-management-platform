// Unit tests for <module>: pure domain + service with an in-memory repository. Never depends on today's date.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/<module>.js';
import { crear<Module>Service } from '../../js/application/<module>Service.js';

// In-memory repository with the same interface as the store (list/get/upsert/remove).
function repoMemoria(inicial = {}) {
  const db = {};
  let n = 0;
  const hoja = (h) => (db[h] ||= []);
  Object.entries(inicial).forEach(([h, filas]) => { db[h] = filas.map((f) => ({ ...f })); });
  return {
    db,
    list: (h) => hoja(h).slice(),
    get: (h, id) => hoja(h).find((r) => r.id === String(id)) || null,
    upsert(h, fila) {
      const r = { ...fila, id: fila.id ? String(fila.id) : 'r' + (++n) };
      const i = hoja(h).findIndex((x) => x.id === r.id);
      if (i >= 0) hoja(h)[i] = r; else hoja(h).push(r);
      return r;
    },
    remove(h, id) { db[h] = hoja(h).filter((r) => r.id !== String(id)); },
  };
}

const valido = { nombre: 'Ejemplo', fecha: '2026-10-15', estado: 'activo' };

test('<module>: normalizar tolerates odd data and returns to text', () => {
  const n = D.normalizar({ nombre: '  X ', fecha: 'no-fecha', estado: 'otro' });
  assert.equal(n.nombre, 'X');
  assert.equal(n.fecha, '');
  assert.equal(n.estado, 'activo');
});

test('<module>: validar - errors block saving, warnings do not', () => {
  assert.deepEqual(D.validar({}).errores.map((e) => e.codigo), ['nombre-vacio', 'fecha-invalida']);
  const r = D.validar(valido, { existentes: [{ id: 'x', nombre: 'ejemplo' }] });
  assert.equal(r.errores.length, 0);
  assert.deepEqual(r.avisos.map((a) => a.codigo), ['nombre-repetido']);
});

test('<module>: the service saves, requires forzar with warnings and deletes', () => {
  const repo = repoMemoria();
  const svc = crear<Module>Service(repo);
  const g = svc.guardar(valido);
  assert.ok(g.id);
  assert.throws(() => svc.guardar(valido), (e) => e.codigo === 'avisos');
  assert.ok(svc.guardar(valido, { forzar: true }).id);
  assert.throws(() => svc.guardar({}), (e) => e.codigo === 'validacion');
  assert.equal(svc.eliminar(g.id).id, g.id);
  assert.equal(svc.obtener(g.id), null);
});

test('<module>: without permission nothing is written', () => {
  const repo = repoMemoria();
  const svc = crear<Module>Service(repo, { puedeEditar: () => false });
  assert.throws(() => svc.guardar(valido), /sin-permiso/);
  assert.equal(repo.list(D.HOJA).length, 0);
});
