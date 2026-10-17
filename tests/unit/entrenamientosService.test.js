// Sessions list service: in-memory repository, injected clock, fake PDF port and fake Drive. No DOM, no real clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const { crearEntrenamientosService } = await importApp('js/application/entrenamientosService.js');
const { crearEntrenoService } = await importApp('js/application/entrenoService.js');
const { crearBorradorPlan } = await importApp('js/application/borradorPlan.js');

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
const s = (id, fecha, extra = {}) => ({ id, fecha, hora: '19:00', titulo: 'S' + id, grupoId: 'g1', estado: 'planificado', ...extra });
const lin = (idS, set, orden, extra = {}) => ({ id: `${idS}-${set}-${orden}`, entrenamientoId: idS, set, orden, ...extra });
const AHORA = new Date(2026, 9, 14, 10, 30); // Wed 14 Oct 2026, local time

function montar({ drive = null, pdf = null, datos = {} } = {}) {
  const repo = repoMem({
    Grupos: [{ id: 'g1', nombre: 'Alevín' }, { id: 'g2', nombre: 'Promo' }],
    Entrenamientos: [s('a', '2026-10-12'), s('b', '2026-10-14', { grupoId: 'g2' }), s('c', '2026-10-21')],
    EntrenoLineas: [lin('a', 1, 1, { series: 4, distancia: 100, tiempoMin: 10, ejercicio: 'Crol' })],
    ...datos,
  });
  let n = 0;
  const entreno = crearEntrenoService(repo, { genId: () => 'N' + (++n), club: () => ({ nombre: 'Club' }) });
  const llamadas = [];
  const pdfFalso = pdf || { generar: async (fichas, etiquetas) => { llamadas.push({ fichas, etiquetas }); return { blob: new Blob(['%PDF']), paginas: fichas.length }; } };
  const svc = crearEntrenamientosService(repo, { entreno, ahora: () => AHORA, pdf: pdfFalso, drive, nombreDia: () => 'miercoles' });
  return { repo, svc, entreno, llamadas };
}

test('clock is injected: hoy() and lunesActual() come from it', () => {
  const { svc } = montar();
  assert.equal(svc.hoy(), '2026-10-14');
  assert.equal(svc.lunesActual(), '2026-10-12');
  assert.equal(svc.semanaAnterior('2026-10-12'), '2026-10-05');
  assert.equal(svc.semanaSiguiente('2026-10-12'), '2026-10-19');
});

test('semana: sessions of the week with plan summary only where there is a plan', () => {
  const { svc } = montar();
  const w = svc.semana('2026-10-12');
  assert.equal(w.total, 2);
  const a = w.dias[0].sesiones[0];
  assert.equal(a.resumen.metros, 400);
  assert.equal(w.dias[2].sesiones[0].resumen, null);
  assert.ok(w.dias[2].esHoy);
  assert.equal(svc.semana('2026-10-12', { grupoId: 'g2' }).total, 1);
});

test('guardar: validates, creates, edits and copies the plan of the original into a new duplicate', () => {
  const { svc, repo } = montar();
  const mal = svc.guardar({ titulo: '', fecha: '2026-10-14' });
  assert.equal(mal.ok, false);
  assert.equal(mal.errores.titulo, 'obligatorio');
  assert.equal(repo.db.Entrenamientos.length, 3, 'nothing is saved when invalid');
  const rango = svc.guardar({ titulo: 'X', fecha: '2026-10-14', volumenMin: '5000', volumenMax: '1000' });
  assert.equal(rango.errores.volumenMax, 'volumen-rango');

  const dup = svc.borradorDuplicado('a');
  assert.equal(dup.copiaDe, 'a');
  const ok = svc.guardar(dup);
  assert.equal(ok.ok, true);
  assert.ok(ok.sesion.id && ok.sesion.id !== 'a');
  assert.equal(repo.db.EntrenoLineas.filter((l) => l.entrenamientoId === ok.sesion.id).length, 1, 'the plan is copied');
  assert.equal(repo.get('Entrenamientos', ok.sesion.id).copiaDe, undefined, 'copiaDe is not stored');

  const edit = svc.guardar({ ...repo.get('Entrenamientos', 'b'), titulo: 'Renamed' });
  assert.equal(edit.ok, true);
  assert.equal(repo.get('Entrenamientos', 'b').titulo, 'Renamed');
  assert.equal(repo.db.Entrenamientos.length, 4);
});

test('alternarEstado toggles planificado and realizado', () => {
  const { svc, repo } = montar();
  svc.alternarEstado('a');
  assert.equal(repo.get('Entrenamientos', 'a').estado, 'realizado');
  svc.alternarEstado('a');
  assert.equal(repo.get('Entrenamientos', 'a').estado, 'planificado');
  assert.equal(svc.alternarEstado('zz'), null);
});

test('eliminar returns a snapshot and restaurar puts back session and plan with the same ids', () => {
  const { svc, repo } = montar();
  const snap = svc.eliminar('a');
  assert.equal(repo.get('Entrenamientos', 'a'), null);
  assert.equal(repo.db.EntrenoLineas.length, 0);
  svc.restaurar(snap);
  assert.equal(repo.get('Entrenamientos', 'a').titulo, 'Sa');
  assert.deepEqual(repo.db.EntrenoLineas.map((l) => l.id), ['a-1-1']);
  assert.equal(svc.eliminar('nope'), null);
});

test('pdfSesion: empty plan needs permission, names the file Group-date-day.pdf and passes the labels through', async () => {
  const { svc, llamadas } = montar();
  const etiquetas = { marca: 'E' };
  const vacio = await svc.pdfSesion('b', { etiquetas });
  assert.deepEqual(vacio, { ok: false, codigo: 'plan-vacio' });
  assert.equal(llamadas.length, 0);
  const forzado = await svc.pdfSesion('b', { etiquetas, permitirVacio: true });
  assert.equal(forzado.ok, true);
  assert.equal(forzado.nombre, 'Promo-2026-10-14-miercoles.pdf');
  const r = await svc.pdfSesion('a', { etiquetas });
  assert.equal(r.nombre, 'Alevin-2026-10-12-miercoles.pdf');
  assert.equal(llamadas.at(-1).etiquetas, etiquetas);
  assert.equal(llamadas.at(-1).fichas[0].totales.metros, 400);
  assert.equal((await svc.pdfSesion('zz', { etiquetas })).codigo, 'sesion-inexistente');
});

test('pdfSesion with a draft uses the draft, not the saved plan', async () => {
  const { svc, llamadas } = montar();
  const borrador = crearBorradorPlan({ lineas: [{ set: 1, orden: 1, series: 2, distancia: 50, ejercicio: 'Draft' }] }).estado;
  await svc.pdfSesion('b', { borrador, etiquetas: {} });
  assert.equal(llamadas.at(-1).fichas[0].totales.metros, 100);
  assert.equal(svc.planVacio('b'), true);
  assert.equal(svc.planVacio('b', borrador), false);
  assert.equal(svc.planVacio('a'), false);
});

test('pdfSemana: no sessions, all plans empty (needs permission) and the file name', async () => {
  const { svc, llamadas } = montar();
  assert.equal((await svc.pdfSemana('2026-11-02', { etiquetas: {} })).codigo, 'sin-sesiones');
  const soloSinPlan = await svc.pdfSemana('2026-10-12', { grupoId: 'g2', etiquetas: {} });
  assert.equal(soloSinPlan.codigo, 'plan-vacio');
  const ok = await svc.pdfSemana('2026-10-12', { etiquetas: {} });
  assert.equal(ok.nombre, 'Club-semana-2026-10-12.pdf');
  assert.equal(llamadas.at(-1).fichas.length, 2);
  const grupo = await svc.pdfSemana('2026-10-12', { grupoId: 'g2', etiquetas: {}, permitirVacio: true });
  assert.equal(grupo.nombre, 'Promo-semana-2026-10-12.pdf');
});

test('without a PDF port the service says so; Drive is only available when injected', async () => {
  const repo = repoMem({ Entrenamientos: [s('a', '2026-10-12')] });
  const entreno = crearEntrenoService(repo);
  const svc = crearEntrenamientosService(repo, { entreno, ahora: () => AHORA });
  assert.equal((await svc.pdfSesion('a', { etiquetas: {} })).codigo, 'sin-pdf');
  assert.equal(svc.driveDisponible(), false);
  await assert.rejects(() => svc.guardarEnDrive({ blob: new Blob(['x']), nombre: 'a.pdf' }), /drive-no-disponible/);
  const { svc: conDrive } = montar({ drive: { guardar: async ({ nombre }) => ({ actualizado: false, nombre }) } });
  assert.equal(conDrive.driveDisponible(), true);
  assert.deepEqual(await conDrive.guardarEnDrive({ blob: new Blob(['x']), nombre: 'a.pdf' }), { actualizado: false, nombre: 'a.pdf' });
});

// ---------- draft ----------
test('borradorPlan: starts clean, a change makes it dirty, undoing the change makes it clean, saving resets', () => {
  const b = crearBorradorPlan({ tipoSesion: 'A', lineas: [{ set: 1, orden: 1, series: 2, distancia: 50 }] });
  let avisos = 0;
  b.alCambiar(() => { avisos++; });
  assert.equal(b.sucio(), false);
  b.estado.lineas[0].series = 3;
  b.cambio();
  assert.equal(b.sucio(), true);
  assert.equal(avisos, 1);
  b.estado.lineas[0].series = 2;
  b.cambio();
  assert.equal(b.sucio(), false);
  b.estado.tipoSesion = 'B';
  assert.equal(b.sucio(), true);
  b.marcarGuardado();
  assert.equal(b.sucio(), false);
  assert.equal(b.vacio(), false);
});

test('borradorPlan: an empty plan starts with one empty set; operar and cargar notify and mark dirty', () => {
  const b = crearBorradorPlan({});
  assert.equal(b.estado.lineas.length, 1);
  assert.equal(b.vacio(), true);
  assert.equal(b.sucio(), false);
  b.cargar({ tipoSesion: 'T', lineas: [{ set: 1, orden: 1, series: 1, distancia: 200 }] });
  assert.equal(b.estado.tipoSesion, 'T');
  assert.equal(b.sucio(), true);
  assert.equal(b.vacio(), false);
  b.marcarGuardado();
  b.operar((ls) => ls.concat({ set: 2, orden: 1, series: 1, distancia: 50 }));
  assert.equal(b.sucio(), true);
});
