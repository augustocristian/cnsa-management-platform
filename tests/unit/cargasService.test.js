import test from 'node:test';
import assert from 'node:assert/strict';
import { crearCargasService } from '../../js/application/cargasService.js';

// Repositorio en memoria con la misma interfaz que el store.
function repoMem(datos = {}) {
  const db = { TiposCarga: [], Cargas: [], ObjetivosCarga: [], Nadadores: [{ id: 'n1' }, { id: 'n2' }], Entrenamientos: [{ id: 'e1', fecha: '2026-10-12', hora: '17:00', titulo: 'Sesión 1' }], ...datos };
  let n = 0;
  return {
    db,
    list: (s) => (db[s] || []).map((r) => ({ ...r })),
    get: (s, id) => { const r = (db[s] || []).find((x) => x.id === String(id)); return r ? { ...r } : null; },
    upsert(s, row) {
      db[s] = db[s] || [];
      const fila = { ...row, id: row.id ? String(row.id) : 'g' + (++n) };
      const i = db[s].findIndex((x) => x.id === fila.id);
      if (i >= 0) db[s][i] = fila; else db[s].push(fila);
      return fila;
    },
    remove(s, id) { db[s] = (db[s] || []).filter((x) => x.id !== String(id)); },
  };
}
const nuevo = (opts, datos) => { const repo = repoMem(datos); const svc = crearCargasService(repo, { generarId: (() => { let i = 0; return () => 'tc-p' + (++i); })(), ...opts }); svc.asegurarCatalogo(); return { repo, svc }; };
const carga = (o) => ({ nadadorId: 'n1', fecha: '2026-10-12', metros: 1000, ...o });

test('asegurarCatalogo siembra los predefinidos una sola vez y migra objetivos antiguos', () => {
  const repo = repoMem({ ObjetivosCarga: [{ id: 'o1', tipo: 'Técnica', minSemanalM: 100, maxSemanalM: 900 }, { id: 'o2', tipo: 'Fuerza', minSemanalM: 5, maxSemanalM: 50 }], Cargas: [{ id: 'c1', tipo: 'Fuerza' }] });
  const svc = crearCargasService(repo, { generarId: () => 'tc-heredado' });
  assert.ok(svc.asegurarCatalogo() > 0);
  assert.equal(svc.asegurarCatalogo(), 0, 'segunda vez: nada que hacer');
  assert.equal(svc.tipos().length, 11);
  assert.deepEqual(repo.db.ObjetivosCarga, []);
  const tec = svc.resolver('Técnica');
  assert.deepEqual([tec.min, tec.max], [100, 900]);
  const fuerza = svc.resolver('Fuerza');
  assert.deepEqual([fuerza.predefinido, fuerza.categoria, fuerza.min], [false, 'personalizado', 5]);
  assert.equal(svc.usos(fuerza.id), 1);
});

test('crear: valida nombre obligatorio y único, asigna personalizado/activo al final', () => {
  const { svc } = nuevo();
  assert.deepEqual(svc.crear({ nombre: '' }).errores, [{ campo: 'nombre', codigo: 'nombre-vacio' }]);
  assert.equal(svc.crear({ nombre: 'TÉCNICA' }).errores[0].codigo, 'nombre-duplicado');
  const r = svc.crear({ nombre: 'Aguas abiertas', descripcion: ' Mar ', color: '#112233', min: '1000', max: '' });
  assert.ok(r.ok);
  assert.equal(r.tipo.categoria, 'personalizado');
  assert.deepEqual([r.tipo.activo, r.tipo.predefinido, r.tipo.descripcion, r.tipo.min, r.tipo.max], [true, false, 'Mar', 1000, null]);
  assert.equal(svc.crear({ nombre: 'aguas ABIERTAS' }).errores[0].codigo, 'nombre-duplicado');
  assert.equal(svc.tipos().at(-1).nombre, 'Aguas abiertas');
});

test('editar: predefinido conserva el nombre; personalizado renombrado arrastra sus cargas', () => {
  const { svc, repo } = nuevo();
  const pred = svc.resolver('Piernas');
  const r = svc.editar(pred.id, { nombre: 'Otro nombre', descripcion: 'Nueva', color: '#abcdef', min: 100, max: 200 });
  assert.ok(r.ok);
  assert.deepEqual([r.tipo.nombre, r.tipo.descripcion, r.tipo.color, r.tipo.min, r.tipo.max], ['Piernas', 'Nueva', '#abcdef', 100, 200]);
  const mio = svc.crear({ nombre: 'Mío' }).tipo;
  svc.registrarCarga(carga({ tipoId: mio.id }));
  const edit = svc.editar(mio.id, { nombre: 'Renombrado' });
  assert.ok(edit.ok);
  assert.equal(repo.db.Cargas[0].tipo, 'Renombrado');
  assert.equal(svc.editar(mio.id, { nombre: 'Piernas' }).errores[0].codigo, 'nombre-duplicado');
  assert.equal(svc.editar(mio.id, { min: 5000, max: 100 }).errores[0].codigo, 'minmax');
  assert.equal(svc.editar('nada', {}).errores[0].codigo, 'no-existe');
});

test('activar/desactivar: los inactivos no se ofrecen y no admiten cargas nuevas', () => {
  const { svc } = nuevo();
  const t = svc.resolver('Brazos');
  svc.activar(t.id, false);
  assert.ok(!svc.activos().some((x) => x.id === t.id));
  assert.equal(svc.registrarCarga(carga({ tipoId: t.id })).errores[0].codigo, 'tipo-inactivo');
  svc.activar(t.id, true);
  assert.ok(svc.registrarCarga(carga({ tipoId: t.id })).ok);
});

test('mover: reordena dentro de su categoría y no sale de los extremos', () => {
  const { svc } = nuevo();
  const orden = () => svc.grupos()[0].tipos.map((t) => t.nombre);
  const antes = orden();
  assert.deepEqual(svc.mover(svc.resolver('Aeróbico ligero').id, -1), { ok: true, movido: false });
  svc.mover(svc.resolver('Aeróbico ligero').id, 1);
  assert.deepEqual(orden().slice(0, 2), [antes[1], antes[0]]);
  svc.mover(svc.resolver('Aeróbico ligero').id, -1);
  assert.deepEqual(orden(), antes);
  const a = svc.crear({ nombre: 'A' }).tipo, b = svc.crear({ nombre: 'B' }).tipo;
  svc.mover(b.id, -1);
  assert.deepEqual(svc.grupos().at(-1).tipos.map((t) => t.nombre), ['B', 'A']);
  void a;
});

test('borrar: no los predefinidos ni los que tienen cargas; sí los personalizados sin uso', () => {
  const { svc } = nuevo();
  assert.deepEqual(svc.borrar(svc.resolver('Piernas').id), { ok: false, motivo: 'predefinido' });
  const mio = svc.crear({ nombre: 'Temporal' }).tipo;
  svc.registrarCarga(carga({ tipoId: mio.id }));
  assert.deepEqual(svc.borrar(mio.id), { ok: false, motivo: 'en-uso', usos: 1 });
  assert.ok(svc.tipo(mio.id));
  const libre = svc.crear({ nombre: 'Sin uso' }).tipo;
  assert.deepEqual(svc.borrar(libre.id), { ok: true });
  assert.equal(svc.tipo(libre.id), null);
});

test('fusionar: reasigna las cargas al destino y elimina el origen personalizado', () => {
  const { svc, repo } = nuevo();
  const o = svc.crear({ nombre: 'Origen' }).tipo;
  const d = svc.resolver('Técnica');
  svc.registrarCarga(carga({ tipoId: o.id })); svc.registrarCarga(carga({ tipoId: o.id, metros: 500 }));
  assert.deepEqual(svc.fusionar(d.id, o.id).motivo, 'predefinido');
  assert.deepEqual(svc.fusionar(o.id, o.id).motivo, 'mismo');
  assert.deepEqual(svc.fusionar(o.id, d.id), { ok: true, reasignadas: 2 });
  assert.deepEqual(repo.db.Cargas.map((c) => c.tipo), ['Técnica', 'Técnica']);
  assert.equal(svc.tipo(o.id), null);
  assert.equal(svc.usos(d.id), 2);
});

test('registrarCarga: valida campos y guarda el nombre del contenido y la sesión opcional', () => {
  const { svc, repo } = nuevo();
  const t = svc.resolver('Salidas');
  const codigos = (d) => svc.registrarCarga(d).errores.map((e) => e.codigo);
  assert.deepEqual(codigos({ ...carga({ tipoId: t.id }), nadadorId: 'zz' }), ['nadador']);
  assert.deepEqual(codigos(carga({ tipoId: t.id, metros: 0 })), ['metros']);
  assert.deepEqual(codigos(carga({ tipoId: t.id, fecha: '12/10/2026' })), ['fecha']);
  assert.deepEqual(codigos(carga({ tipoId: t.id, rpe: 11 })), ['rpe']);
  assert.deepEqual(codigos(carga({ tipoId: t.id, minutos: 0 })), ['minutos']);
  assert.deepEqual(codigos(carga({})), ['tipo-inexistente']);
  assert.deepEqual(codigos(carga({ tipoId: t.id, entrenamientoId: 'no' })), ['sesion-inexistente']);
  const r = svc.registrarCarga(carga({ tipo: 'salidas', rpe: '7', minutos: '60', entrenamientoId: 'e1', notas: ' ok ' }));
  assert.ok(r.ok);
  assert.deepEqual([r.carga.tipo, r.carga.rpe, r.carga.minutos, r.carga.entrenamientoId, r.carga.notas], ['Salidas', 7, 60, 'e1', 'ok']);
  assert.equal(repo.db.Cargas.length, 1);
});

test('semana: evaluación de objetivos y permisos de sólo lectura', () => {
  const { svc } = nuevo();
  const p = svc.resolver('Piernas');
  svc.guardarObjetivo(p.id, 3000, 4000);
  svc.registrarCarga(carga({ tipoId: p.id, metros: 1000 }));
  const s = svc.semana(new Date(2026, 9, 12));
  assert.equal(s.agregado.metros[p.id], 1000);
  assert.deepEqual(s.evaluacion.map((e) => [e.tipo.nombre, e.estado, e.diferencia]), [['Piernas', 'bajo', 2000]]);

  const ro = crearCargasService(repoMem(), { puedeEditar: () => false });
  assert.equal(ro.puedeEditar(), false);
  for (const fn of [() => ro.crear({ nombre: 'x' }), () => ro.registrarCarga({}), () => ro.borrar('a'), () => ro.activar('a', true), () => ro.mover('a', 1), () => ro.fusionar('a', 'b'), () => ro.editar('a', {})]) {
    assert.throws(fn, (e) => e.code === 'sin-permiso');
  }
});
