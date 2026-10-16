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

// ---------- Contenidos y estilo por ejercicio ----------
const PLAN_MULTI = {
  tipoSesion: 'Mixta',
  lineas: [
    { set: 1, orden: 1, tiempoMin: 10, series: 1, distancia: 300, objetivo: 'Calentamiento' },
    { set: 2, orden: 1, tiempoMin: 20, series: 4, distancia: 100, ejercicio: '4x100 Crol. 75 AeL-25 Tope', componentes: [{ contenido: 'Aeróbico ligero', metrosPorRep: 75, modo: 'auto' }, { contenido: 'Aláctico / Sprint', metrosPorRep: 25, modo: 'auto' }], estilos: [{ estilo: 'Crol', metrosPorRep: null }] },
  ],
};

test('guardarPlan: componentes y estilo se guardan como texto en la hoja y vuelven como estructuras', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')] });
  const svc = mk(repo);
  assert.equal(svc.guardarPlan('e1', PLAN_MULTI).ok, true);
  const fila = repo.db.EntrenoLineas.find((l) => l.ejercicio.startsWith('4x100'));
  assert.equal(typeof fila.componentes, 'string');
  assert.deepEqual(JSON.parse(fila.componentes).map((c) => c.metrosPorRep), [75, 25]);
  assert.equal(fila.estilo, 'Crol');
  assert.equal(repo.db.EntrenoLineas.find((l) => l.objetivo === 'Calentamiento').componentes, '', 'filas antiguas: sin componentes');
  const ls = svc.lineas('e1');
  assert.equal(ls[1].componentes.length, 2);
  assert.equal(ls[1].estilos[0].estilo, 'Crol');
  const d = svc.desglose('e1');
  assert.equal(d.totalM, 700);
  assert.deepEqual(d.porContenido.map((c) => [c.contenido, c.metros]), [['Aeróbico ligero', 600], ['Aláctico / Sprint', 100]]);
});

test('validar: el reparto incompleto avisa pero no bloquea guardar', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')] });
  const svc = mk(repo);
  const incompleto = { lineas: [{ set: 1, orden: 1, series: 4, distancia: 100, componentes: [{ contenido: 'Aeróbico ligero', metrosPorRep: 60, modo: 'manual' }] }] };
  const av = svc.validar('e1', incompleto.lineas);
  assert.deepEqual(av.filter((a) => a.codigo.startsWith('reparto')).map((a) => [a.codigo, a.severidad, a.params.resto]), [['reparto-incompleto', 'aviso', 40]]);
  const r = svc.guardarPlan('e1', incompleto);
  assert.equal(r.ok, true);
  assert.ok(r.avisos.some((a) => a.codigo === 'reparto-incompleto'));
});

test('ficha: incluye el catálogo y el desglose para el PDF', () => {
  const repo = repoMem({ Entrenamientos: [sesion('e1', '2026-10-15')], Grupos: [{ id: 'g2', nombre: 'Alevín' }] });
  const svc = mk(repo);
  svc.guardarPlan('e1', PLAN_MULTI);
  const f = svc.ficha('e1');
  assert.equal(f.desglose.totalM, 700);
  assert.ok(Array.isArray(f.tipos));
  assert.deepEqual(f.sets[1].lineas[0].estilos.map((e) => e.estilo), ['Crol']);
});

test('registrarCargasDesdePlan: una carga por contenido y nadador, sin duplicar y respetando la asistencia', () => {
  const repo = repoMem({
    Entrenamientos: [sesion('e1', '2026-10-15')], Grupos: [{ id: 'g2', nombre: 'Alevín' }],
    Nadadores: [{ id: 'n1', grupoId: 'g2', activo: 'true' }, { id: 'n2', grupoId: 'g2', activo: 'true' }, { id: 'n3', grupoId: 'g2', activo: 'false' }, { id: 'n4', grupoId: 'g9', activo: 'true' }],
    Asistencia: [],
  });
  const svc = mk(repo);
  svc.guardarPlan('e1', PLAN_MULTI);
  // sin asistencia: nadadores activos del grupo (n1, n2)
  let r = svc.registrarCargasDesdePlan('e1');
  assert.deepEqual([r.ok, r.creadas, r.omitidas, r.nadadores, r.contenidos], [true, 4, 0, 2, 2]);
  const cargas = repo.db.Cargas.filter((c) => c.entrenamientoId === 'e1');
  assert.equal(cargas.length, 4);
  assert.deepEqual(cargas.filter((c) => c.nadadorId === 'n1').map((c) => [c.tipo, c.metros]).sort(), [['Aeróbico ligero', 600], ['Aláctico / Sprint', 100]]);
  assert.ok(cargas.every((c) => c.fecha === '2026-10-15'));
  assert.equal(r.sinContenidoM, 0, 'el calentamiento se clasifica por su objetivo');
  // segunda vez: nada nuevo
  r = svc.registrarCargasDesdePlan('e1');
  assert.deepEqual([r.creadas, r.omitidas], [0, 4]);
  assert.equal(repo.db.Cargas.length, 4);
  // con asistencia: sólo los presentes
  repo.db.Cargas = [];
  repo.db.Asistencia = [{ id: 'a1', entrenamientoId: 'e1', nadadorId: 'n2', estado: 'presente' }, { id: 'a2', entrenamientoId: 'e1', nadadorId: 'n1', estado: 'ausente' }];
  r = svc.registrarCargasDesdePlan('e1');
  assert.deepEqual([r.creadas, r.nadadores], [2, 1]);
  assert.ok(repo.db.Cargas.every((c) => c.nadadorId === 'n2'));
  // sin sesión
  assert.equal(svc.registrarCargasDesdePlan('nada').ok, false);
});
