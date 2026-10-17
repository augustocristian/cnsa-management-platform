import test from 'node:test';
import assert from 'node:assert/strict';
import { crearTemporadaService } from '../../js/application/temporadaService.js';
import { sembrarCatalogo, filaTipo } from '../../js/domain/cargas.js';

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
const tipos = sembrarCatalogo([]).map(filaTipo);
const ahora = () => new Date(2026, 9, 14); // 14 Oct 2026
const nueva = (repo, extra = {}) => crearTemporadaService(repo, { ahora, nombreFase: (t) => 'F-' + t, ...extra });
const datos = { nombre: 'T 26', inicio: '2026-09-07', fin: '2026-11-29', grupoId: '' };

test('create season: validates, the first one becomes active and the default phases can be created', () => {
  const repo = repoMemoria({ TiposCarga: tipos });
  const s = nueva(repo);
  assert.deepEqual(s.guardarTemporada({ ...datos, nombre: '' }).errores.map((e) => e.codigo), ['nombre-vacio']);
  assert.equal(repo.list('Temporadas').length, 0);
  const r = s.guardarTemporada(datos, { conFases: true });
  assert.ok(r.ok);
  assert.equal(r.temporada.activa, true);
  const fases = s.fases(r.temporada.id);
  assert.ok(fases.length >= 4);
  assert.ok(fases[0].nombre.startsWith('F-'));
  assert.equal(s.resumen(r.temporada.id).validaciones.length, 0, 'the default phases leave no gaps or overlaps');
});

test('only one active season and cascade delete', () => {
  const repo = repoMemoria({ TiposCarga: tipos });
  const s = nueva(repo);
  const a = s.guardarTemporada(datos).temporada;
  const b = s.guardarTemporada({ ...datos, nombre: 'T 27', inicio: '2027-09-06', fin: '2027-12-26', activa: true }).temporada;
  assert.deepEqual(s.temporadas().filter((t) => t.activa).map((t) => t.id), [b.id]);
  assert.equal(s.activa().id, b.id);
  s.activar(a.id);
  assert.equal(s.activa().id, a.id);
  s.guardarFase({ temporadaId: a.id, nombre: 'F', tipo: 'competitiva', inicio: '2026-09-07', fin: '2026-09-20' });
  s.guardarEvento({ temporadaId: a.id, tipo: 'test', nombre: 'Test', inicio: '2026-09-10' });
  s.guardarSemana(a.id, '2026-09-07', { volumen: 9000 });
  s.borrarTemporada(a.id);
  assert.equal(repo.list('Fases').length + repo.list('EventosTemporada').length + repo.list('SemanasPlan').length, 0);
  assert.equal(s.activa().id, b.id, 'when the active one is deleted the remaining one becomes active');
});

test('phases: validation, overlaps need forcing and warning if they fall outside the season', () => {
  const repo = repoMemoria({ TiposCarga: tipos });
  const s = nueva(repo);
  const t = s.guardarTemporada(datos).temporada;
  const f = (extra) => ({ temporadaId: t.id, nombre: 'F', tipo: 'preparacion-general', inicio: '2026-09-07', fin: '2026-09-27', ...extra });
  assert.deepEqual(s.guardarFase(f({ nombre: '' })).errores.map((e) => e.codigo), ['nombre-vacio']);
  const a = s.guardarFase(f());
  assert.ok(a.ok);
  const solapada = s.guardarFase(f({ nombre: 'B', inicio: '2026-09-21', fin: '2026-10-11' }));
  assert.equal(solapada.ok, false);
  assert.equal(solapada.requiereForzar, true);
  assert.equal(s.fases(t.id).length, 1);
  assert.ok(s.guardarFase(f({ nombre: 'B', inicio: '2026-09-21', fin: '2026-10-11' }), { forzar: true }).ok);
  assert.equal(s.resumen(t.id).validaciones.filter((v) => v.tipo === 'fases-solapadas').length, 1);
  const fuera = s.guardarFase(f({ nombre: 'C', inicio: '2026-11-02', fin: '2026-12-13' }));
  assert.ok(fuera.ok);
  assert.equal(fuera.avisos[0].tipo, 'fase-fuera-temporada');
  // editing a phase does not clash with itself
  assert.ok(s.guardarFase({ ...f({ fin: '2026-09-20' }), id: a.fase.id, objetivo: 'Base' }).ok);
  s.borrarFase(a.fase.id);
  assert.equal(s.fases(t.id).length, 2);
});

test('events: they are saved, warn if outside the season and appear in the week summary', () => {
  const repo = repoMemoria({ TiposCarga: tipos });
  const s = nueva(repo);
  const t = s.guardarTemporada(datos).temporada;
  assert.deepEqual(s.guardarEvento({ temporadaId: t.id, tipo: 'competicion', nombre: 'Gijón', inicio: '2026-10-17' }).errores.map((e) => e.codigo), ['prioridad-requerida']);
  const ok = s.guardarEvento({ temporadaId: t.id, tipo: 'competicion', nombre: 'Gijón', inicio: '2026-10-17', fin: '2026-10-18', prioridad: 'B', lugar: 'Gijón' });
  assert.ok(ok.ok);
  assert.deepEqual(ok.avisos, []);
  const fuera = s.guardarEvento({ temporadaId: t.id, tipo: 'test', nombre: 'Tarde', inicio: '2027-02-01' });
  assert.equal(fuera.avisos[0].tipo, 'evento-fuera-temporada');
  const m = s.resumen(t.id);
  const semana = m.semanas.find((x) => x.lunes === '2026-10-12');
  assert.deepEqual(semana.eventos.map((e) => e.nombre), ['Gijón']);
  assert.equal(semana.prioridad, 'B');
  assert.equal(m.proxima.nombre, 'Gijón');
  s.borrarEvento(ok.evento.id);
  assert.equal(s.eventos(t.id).length, 1);
});

test('weeks: partial save, merge and delete the row when emptied; adjustments with preview', () => {
  const repo = repoMemoria({ TiposCarga: tipos });
  const s = nueva(repo);
  const t = s.guardarTemporada(datos).temporada;
  assert.equal(s.guardarSemana(t.id, '2026-09-07', { volumen: -5 }).ok, false);
  assert.ok(s.guardarSemana(t.id, '2026-09-07', { volumen: 9000, contenidos: { 'tc-piernas': 1000 } }).ok);
  assert.ok(s.guardarSemana(t.id, '2026-09-07', { objetivo: 'Base' }).ok);
  const fila = s.semanasPlan(t.id)[0];
  assert.deepEqual([fila.volumen, fila.objetivo, fila.contenidos], [9000, 'Base', { 'tc-piernas': 1000 }]);
  assert.equal(repo.list('SemanasPlan')[0].id, `sp-${t.id}-2026-09-07`, 'deterministic id: edits are not duplicated');
  s.guardarSemana(t.id, '2026-09-14', { volumen: 10000 });
  const prev = s.ajustarVolumen(t.id, { desde: 1, hasta: 3, pct: 10 });
  assert.deepEqual(prev.cambios.map((c) => [c.n, c.antes, c.despues]), [[1, 9000, 9900], [2, 10000, 11000]]);
  assert.equal(s.semanasPlan(t.id).find((x) => x.lunes === '2026-09-07').volumen, 9000, 'previewing does not write');
  s.ajustarVolumen(t.id, { desde: 1, hasta: 3, pct: 10, aplicar: true });
  assert.deepEqual(s.semanasPlan(t.id).map((x) => x.volumen).sort(), [11000, 9900]);
  assert.equal(s.semanasPlan(t.id).find((x) => x.lunes === '2026-09-07').contenidos['tc-piernas'], 1100);
  const mov = s.ajustarVolumen(t.id, { desde: 1, hasta: 2, mover: 1, aplicar: true });
  assert.ok(mov.cambios.length >= 2);
  assert.deepEqual(s.semanasPlan(t.id).map((x) => [x.lunes, x.volumen]).filter(([, v]) => v != null).sort(), [['2026-09-14', 9900], ['2026-09-21', 11000]]);
  s.guardarSemana(t.id, '2026-09-14', { volumen: null, contenidos: {}, intensidad: null, objetivo: '', notas: '' });
  assert.equal(s.semanasPlan(t.id).length, 2, 'a week without data is removed');
});

test('copy week, phase template and apply suggestion', () => {
  const repo = repoMemoria({ TiposCarga: tipos });
  const s = nueva(repo);
  const t = s.guardarTemporada(datos, { conFases: true }).temporada;
  s.guardarSemana(t.id, '2026-09-07', { volumen: 9000, intensidad: 5, objetivo: 'Base', contenidos: { 'tc-piernas': 900 } });
  assert.ok(s.copiarSemana(t.id, 1, 4).ok);
  const copia = s.semanasPlan(t.id).find((x) => x.lunes === '2026-09-28');
  assert.deepEqual([copia.volumen, copia.objetivo, copia.intensidad], [9000, 'Base', 5]);
  assert.equal(s.copiarSemana(t.id, 1, 1).ok, false);
  const fase = s.fases(t.id)[0];
  const prev = s.plantillaFase(t.id, fase.id, { volumenBase: 10000, aplicar: false });
  assert.ok(prev.ok && prev.cambios.length >= 2);
  const escritas = repo.list('SemanasPlan').length;
  s.plantillaFase(t.id, fase.id, { volumenBase: 10000 });
  assert.ok(repo.list('SemanasPlan').length >= escritas);
  const m = s.resumen(t.id);
  const w1 = m.semanas.find((x) => x.fase && x.fase.id === fase.id);
  assert.equal(w1.plan.volumen, 9000, 'the first week of the general template is 90 % of the base');
  assert.equal(Object.values(w1.plan.contenidos).reduce((a, b) => a + b, 0), 9000);
  const sug = { accion: { tipo: 'fijar', semana: 2, volumen: 5000 } };
  assert.ok(s.aplicarSugerencia(t.id, sug).ok);
  assert.equal(s.resumen(t.id).semanas[1].plan.volumen, 5000);
  assert.equal(s.aplicarSugerencia(t.id, { accion: null }).ok, false);
});

test('only writes with permission and entrenosDeSemana lists the sessions with their total', () => {
  const repo = repoMemoria({
    TiposCarga: tipos, Grupos: [{ id: 'g3', nombre: 'Infantil' }],
    Entrenamientos: [
      { id: 's1', fecha: '2026-10-12', hora: '19:30', grupoId: 'g3', titulo: 'Aeróbico', estado: 'realizado', volumenMin: 3000, volumenMax: 3400 },
      { id: 's2', fecha: '2026-10-14', hora: '19:30', grupoId: 'g3', titulo: 'Técnica', estado: 'planificado' },
      { id: 's3', fecha: '2026-10-14', hora: '19:30', grupoId: 'g1', titulo: 'Otro grupo', estado: 'planificado' },
    ],
    EntrenoLineas: [{ id: 'l1', entrenamientoId: 's2', set: 1, orden: 1, objetivo: 'Técnica', series: 4, distancia: 100, tiempoMin: 10 }],
  });
  const s = nueva(repo);
  const t = s.guardarTemporada({ ...datos, grupoId: 'g3' }).temporada;
  const e = s.entrenosDeSemana(t.id, '2026-10-12');
  assert.deepEqual(e.map((x) => [x.id, x.metros, x.conPlan, x.grupoNombre]), [['s1', 3200, false, 'Infantil'], ['s2', 400, true, 'Infantil']]);
  assert.ok(s.resumen(t.id));
});
