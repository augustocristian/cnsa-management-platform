import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const { crearEntrenoService } = await importApp('js/application/entrenoService.js');

// Repositorio en memoria con la misma interfaz que el store
function repoMem(datos = {}) {
  const db = { Entrenamientos: [], EntrenoLineas: [], Grupos: [], Cargas: [], ...datos };
  let n = 0;
  return {
    db,
    list: (h) => (db[h] || []).slice(),
    get: (h, id) => (db[h] || []).find((r) => r.id === String(id)) || null,
    upsert(h, row) {
      const fila = { ...row, id: row.id ? String(row.id) : 'auto' + (++n) };
      const i = db[h].findIndex((r) => r.id === fila.id);
      if (i >= 0) db[h][i] = fila; else db[h].push(fila);
      return fila;
    },
    remove(h, id) { db[h] = db[h].filter((r) => r.id !== String(id)); },
  };
}

const sesion = (id, fecha, extra = {}) => ({ id, fecha, hora: '19:50', grupoId: 'g2', titulo: 'Sesión ' + id, estado: 'planificado', piscina: '50', ...extra });
const plan = {
  tipoSesion: 'Aer+Ritmo', materialDia: 'JJDD', notasGenerales: 'Tabla',
  lineas: [
    { set: 1, orden: 1, tiempoMin: 7, objetivo: 'Calentamiento', series: 1, distancia: 300, ejercicio: 'Suave' },
    { set: 2, orden: 1, tiempoMin: 12, objetivo: 'Piernas', series: 8, distancia: 50, salida: "C/1'10\"", ejercicio: 'Pn C', material: 'Tabla' },
  ],
};
let ids = 0;
const mk = (repo, opts = {}) => crearEntrenoService(repo, { genId: () => 'L' + (++ids), club: () => ({ nombre: 'Club Test' }), ...opts });

test('guardarPlan: guarda campos de la sesión y líneas, y las lee ordenadas', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')], Grupos: [{ id: 'g2', nombre: 'Alevín' }] });
  const svc = mk(repo);
  const r = svc.guardarPlan('e1', plan);
  assert.equal(r.ok, true);
  assert.equal(repo.get('Entrenamientos', 'e1').tipoSesion, 'Aer+Ritmo');
  assert.equal(repo.get('Entrenamientos', 'e1').titulo, 'Sesión e1', 'conserva el resto de campos');
  const ls = svc.lineas('e1');
  assert.equal(ls.length, 2);
  assert.deepEqual(ls.map((l) => l.objetivo), ['Calentamiento', 'Piernas']);
  assert.ok(ls.every((l) => l.id && l.entrenamientoId === 'e1'));
  assert.equal(svc.resumen('e1').metros, 700);
  assert.equal(svc.tienePlan('e1'), true);
});

test('guardarPlan: sustituye las líneas anteriores (quita las borradas, conserva ids de las que siguen)', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  const [a] = svc.lineas('e1');
  svc.guardarPlan('e1', { ...plan, lineas: [a, { set: 2, orden: 1, series: 4, distancia: 100 }, { set: 3, orden: 1 }] }); // la última está vacía y se descarta
  const ls = svc.lineas('e1');
  assert.equal(ls.length, 2);
  assert.equal(ls[0].id, a.id);
  assert.equal(repo.list('EntrenoLineas').length, 2);
});

test('guardarPlan: errores de validación impiden guardar; los avisos no', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15', { volumenMin: 100, volumenMax: 200 })] });
  const svc = mk(repo);
  const mal = svc.guardarPlan('e1', { lineas: [{ set: 1, orden: 1, series: 'x', distancia: 50 }] });
  assert.equal(mal.ok, false);
  assert.equal(mal.errores[0].codigo, 'series-no-numerica');
  assert.equal(repo.list('EntrenoLineas').length, 0);
  const aviso = svc.guardarPlan('e1', plan);
  assert.equal(aviso.ok, true);
  assert.ok(aviso.avisos.some((a) => a.codigo === 'fuera-volumen-objetivo'));
  assert.equal(svc.guardarPlan('no-existe', plan).ok, false);
});

test('validar: avisa si el total difiere de la carga registrada', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')], Cargas: [{ entrenamientoId: 'e1', metros: 2000 }, { entrenamientoId: 'e1', metros: 2200 }] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  const av = svc.validar('e1', svc.lineas('e1'));
  const a = av.find((x) => x.codigo === 'distancia-difiere-carga');
  assert.deepEqual(a.params, { total: 700, registrada: 2100 });
});

test('permisos: un nadador no puede escribir', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')] });
  const svc = mk(repo, { puedeEditar: () => false });
  assert.equal(svc.puedeEditar(), false);
  for (const fn of [() => svc.guardarPlan('e1', plan), () => svc.eliminarSesion('e1'), () => svc.duplicarSesion('e1'), () => svc.copiarPlan('e1', 'e1')]) {
    assert.throws(fn, (e) => e.code === 'sin-permiso');
  }
  assert.doesNotThrow(() => svc.ficha('e1'));
});

test('duplicarSesion: copia sesión y plan con ids nuevos', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15', { estado: 'realizado' })] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  const nueva = svc.duplicarSesion('e1', { fecha: '2026-10-22' });
  assert.notEqual(nueva.id, 'e1');
  assert.equal(nueva.fecha, '2026-10-22');
  assert.equal(nueva.estado, 'planificado');
  assert.equal(nueva.tipoSesion, 'Aer+Ritmo');
  const ls = svc.lineas(nueva.id);
  assert.equal(ls.length, 2);
  assert.ok(ls.every((l) => l.entrenamientoId === nueva.id));
  const originales = new Set(svc.lineas('e1').map((l) => l.id));
  assert.ok(ls.every((l) => !originales.has(l.id)));
  assert.equal(svc.lineas('e1').length, 2);
  assert.equal(svc.duplicarSesion('nada'), null);
});

test('copiarPlan, planDesdeSesion y planDesdePlantilla', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15'), sesion('e2', '2026-10-16')] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  assert.equal(svc.copiarPlan('e1', 'e2').ok, true);
  assert.equal(svc.resumen('e2').metros, 700);
  assert.equal(repo.get('Entrenamientos', 'e2').materialDia, 'JJDD');
  const pd = svc.planDesdeSesion('e1');
  assert.ok(pd.lineas.every((l) => l.id === ''), 'el plan copiado no arrastra ids');
  assert.equal(svc.planDesdeSesion('nada'), null);
  const pt = svc.planDesdePlantilla('aerobico');
  assert.ok(pt.lineas.length >= 4);
  assert.equal(svc.planDesdePlantilla('nada'), null);
  assert.ok(svc.plantillas().length >= 3);
  assert.deepEqual(svc.sesionesConPlan({ salvo: 'e1' }).map((s) => s.id), ['e2']);
});

test('eliminarSesion borra también el plan', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15'), sesion('e2', '2026-10-16')] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  svc.guardarPlan('e2', plan);
  svc.eliminarSesion('e1');
  assert.equal(repo.get('Entrenamientos', 'e1'), null);
  assert.equal(repo.list('EntrenoLineas').filter((l) => l.entrenamientoId === 'e1').length, 0);
  assert.equal(svc.lineas('e2').length, 2);
});

test('sugerencias de lo usado antes', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  assert.deepEqual(svc.sugerencias('objetivo'), ['Calentamiento', 'Piernas']);
  assert.deepEqual(svc.sugerencias('material', ['Aletas']), ['Tabla', 'Aletas']);
});

test('ficha: datos para el PDF (club, grupo, sets, totales) y borrador sin guardar', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15T00:00:00')], Grupos: [{ id: 'g2', nombre: 'Alevín' }] });
  const svc = mk(repo);
  svc.guardarPlan('e1', plan);
  const f = svc.ficha('e1');
  assert.equal(f.club.nombre, 'Club Test');
  assert.equal(f.sesion.grupo, 'Alevín');
  assert.equal(f.sesion.fecha, '2026-10-15');
  assert.equal(f.sesion.piscina, '50 m');
  assert.equal(f.sesion.tipoSesion, 'Aer+Ritmo');
  assert.equal(f.sets.length, 2);
  assert.deepEqual(f.totales, { metros: 700, tiempoMin: 19, sets: 2, filas: 2 });
  const b = svc.ficha('e1', { tipoSesion: 'Otro', lineas: [{ set: 1, orden: 1, series: 2, distancia: 25 }] });
  assert.equal(b.sesion.tipoSesion, 'Otro');
  assert.equal(b.totales.metros, 50);
  assert.equal(svc.lineas('e1').length, 2, 'el borrador no se guarda');
  assert.equal(svc.ficha('nada'), null);
});

test('fichasSemana: sesiones de la semana (opcionalmente de un grupo) ordenadas', () => {
  const repo = repoMem({
    Entrenamientos: [
      sesion('a', '2026-10-13', { hora: '18:30' }), sesion('b', '2026-10-15', { hora: '19:50' }), sesion('c', '2026-10-15', { hora: '17:30', grupoId: 'g1' }),
      sesion('d', '2026-10-19'), sesion('e', '2026-10-11'), sesion('f', '2026-10-18'),
    ],
    Grupos: [{ id: 'g1', nombre: 'Promoción' }, { id: 'g2', nombre: 'Alevín' }],
  });
  const svc = mk(repo);
  assert.deepEqual(svc.fichasSemana('2026-10-12').map((f) => f.sesion.id), ['a', 'c', 'b', 'f']);
  assert.deepEqual(svc.fichasSemana('2026-10-12', { grupoId: 'g2' }).map((f) => f.sesion.id), ['a', 'b', 'f']);
  assert.deepEqual(svc.fichasSemana('2030-01-01'), []);
});
