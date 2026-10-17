// Pool planning and season: pure view-model helpers, Undo snapshots of the services, and locale parity of the files of this area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../js/domain/planificacion.js';
import * as T from '../../js/domain/temporada.js';
import { crearPlanificacionService } from '../../js/application/planificacionService.js';
import { crearTemporadaService } from '../../js/application/temporadaService.js';

// In-memory repository with the list/get/upsert/remove contract of the store
function memoria(inicial = {}) {
  const db = Object.fromEntries(Object.entries(inicial).map(([k, v]) => [k, v.map((x) => ({ ...x }))]));
  let n = 0;
  return {
    list: (h) => (db[h] || []).map((x) => ({ ...x })),
    get: (h, id) => { const r = (db[h] || []).find((x) => x.id === String(id)); return r ? { ...r } : null; },
    upsert: (h, row) => { (db[h] ||= []); const r = { ...row, id: row.id || `n${++n}` }; const i = db[h].findIndex((x) => x.id === r.id); if (i >= 0) db[h][i] = r; else db[h].push(r); return { ...r }; },
    remove: (h, id) => { db[h] = (db[h] || []).filter((x) => x.id !== String(id)); },
  };
}

// ---------- Planning domain ----------
test('date helpers delegate to the calendar domain and keep their contract', () => {
  assert.equal(P.diaDeFecha('2026-10-12'), 1);
  assert.equal(P.diaDeFecha('2026-10-18'), 7);
  assert.ok(Number.isNaN(P.diaDeFecha('2026-02-31')));
  assert.equal(P.lunesDe('2026-10-18'), '2026-10-12');
  assert.equal(P.lunesDe('nonsense'), '');
  assert.equal(P.sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(P.sumarDias('x', 1), '');
  assert.equal(P.fechaDeDia('2026-10-12', 3), '2026-10-14');
});

test('preferenciasHora: the most frequent start time of each group (ties: the earliest)', () => {
  const ses = [
    { grupoId: 'g1', hora: '17:30' }, { grupoId: 'g1', hora: '17:30' }, { grupoId: 'g1', hora: '19:00' },
    { grupoId: 'g2', hora: '19:00' }, { grupoId: 'g2', hora: '18:00' }, { grupoId: '', hora: '10:00' }, { grupoId: 'g3', hora: 'bad' },
  ];
  assert.deepEqual(P.preferenciasHora(ses), { g1: '17:30', g2: '18:00' });
  assert.deepEqual(P.preferenciasHora(), {});
});

test('grid helpers: block position, open slots and lanes outside the pool', () => {
  const pool = P.normalizarPiscina({ id: 'p', nombre: 'P', numCalles: 4, intervaloMin: 30, horario: { 1: { abre: '08:00', cierra: '10:00' }, 7: null } });
  const a = P.normalizarAsignacion({ id: 'a', piscinaId: 'p', dia: 1, horaInicio: '09:00', horaFin: '10:00', calleDesde: 1, calleHasta: 2, grupoId: 'g' });
  assert.deepEqual(P.posicionBloque(a, 8 * 60, 30), { fila: 2, filas: 2 });
  assert.equal(P.franjaAbierta(pool, 1, 9 * 60 + 30), true);
  assert.equal(P.franjaAbierta(pool, 1, 10 * 60), false);
  assert.equal(P.franjaAbierta(pool, 7, 9 * 60), false);
  assert.equal(P.cabeEnRejilla(a, pool), true);
  assert.equal(P.fueraDeCalles({ ...a, calleHasta: 5 }, pool), true);
  assert.equal(P.finPorDefecto(9 * 60, 12 * 60, 30), 10 * 60);
  assert.equal(P.finPorDefecto(11 * 60 + 30, 12 * 60, 30), 12 * 60);
  const g = P.agruparConflictos([{ severidad: 'error' }, { severidad: 'aviso' }, { severidad: 'info' }, { severidad: 'error' }]);
  assert.deepEqual([g.errores.length, g.avisos.length, g.infos.length], [2, 1, 1]);
});

// ---------- Undo (service snapshots) ----------
test('planning service: deleting an assignment or a pool returns a snapshot that restores everything', () => {
  const repo = memoria({
    Piscinas: [{ id: 'p1', nombre: 'P', longitudM: 25, numCalles: 6, intervaloMin: 30, maxPorCalle: 8, horario: '' }],
    AsignacionesCalle: [{ id: 'a1', piscinaId: 'p1', dia: 1, fecha: '', horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 1, grupoId: 'g1', entrenadorId: 'X', notas: '' }],
    Grupos: [{ id: 'g1', nombre: 'G', entrenador: 'X' }],
  });
  const svc = crearPlanificacionService(repo);
  const fila = svc.borrarAsignacion('a1');
  assert.equal(repo.list('AsignacionesCalle').length, 0);
  svc.restaurarAsignacion(fila);
  assert.equal(repo.get('AsignacionesCalle', 'a1').horaInicio, '17:00');
  assert.equal(svc.borrarAsignacion('missing'), null);
  const snap = svc.borrarPiscina('p1');
  assert.equal(repo.list('Piscinas').length + repo.list('AsignacionesCalle').length, 0);
  svc.restaurarPiscina(snap);
  assert.equal(repo.list('Piscinas').length, 1);
  assert.equal(repo.list('AsignacionesCalle').length, 1);
  assert.deepEqual(svc.preferenciasHora(), {});
});

test('season service: deleting a season, phase or event can be undone', () => {
  const repo = memoria({ Grupos: [], TiposCarga: [] });
  const svc = crearTemporadaService(repo, { ahora: () => new Date(2026, 9, 16), nombreFase: (x) => x });
  const { temporada } = svc.guardarTemporada({ nombre: 'T1', inicio: '2026-09-07', fin: '2027-05-30', activa: true }, { conFases: true });
  const e = svc.guardarEvento({ tipo: 'competicion', nombre: 'Open', inicio: '2026-11-07', prioridad: 'A', temporadaId: temporada.id }).evento;
  svc.guardarSemana(temporada.id, '2026-09-07', { volumen: 9000 });
  const nFases = svc.fases(temporada.id).length;
  assert.ok(nFases >= 4);

  const fase = svc.borrarFase(svc.fases(temporada.id)[0].id);
  assert.equal(svc.fases(temporada.id).length, nFases - 1);
  svc.restaurarFase(fase);
  assert.equal(svc.fases(temporada.id).length, nFases);

  const ev = svc.borrarEvento(e.id);
  assert.equal(svc.eventos(temporada.id).length, 0);
  svc.restaurarEvento(ev);
  assert.equal(svc.eventos(temporada.id).length, 1);

  const snap = svc.borrarTemporada(temporada.id);
  assert.equal(svc.temporadas().length, 0);
  assert.equal(repo.list('Fases').length + repo.list('SemanasPlan').length + repo.list('EventosTemporada').length, 0);
  svc.restaurarTemporada(snap);
  assert.equal(svc.temporadas().length, 1);
  assert.equal(svc.activa().id, temporada.id);
  assert.equal(svc.fases(temporada.id).length, nFases);
  assert.equal(svc.semanasPlan(temporada.id).length, 1);
  assert.equal(svc.eventos(temporada.id).length, 1);
});

test('the season service requires the clock', () => {
  assert.throws(() => crearTemporadaService(memoria()), TypeError);
});

// ---------- Season domain ----------
test('propuestaTemporada: first Monday on or after 1 September, 38 weeks', () => {
  const p = T.propuestaTemporada('2026-10-16');
  assert.equal(p.anio, 2026);
  assert.equal(p.inicio, '2026-09-07');
  assert.equal(p.fin, '2027-05-30');
  assert.equal(T.propuestaTemporada('2027-03-01').anio, 2026);
});

test('escalaEjeY: a round top and at most ~6 ticks', () => {
  const e = T.escalaEjeY(11880);
  assert.equal(e.top, 12500);
  assert.deepEqual(e.ticks, [0, 2500, 5000, 7500, 10000, 12500]);
  assert.deepEqual(T.escalaEjeY(80).ticks, [0, 100]);
});

test('event tones are semantic names, never colours', () => {
  assert.equal(T.tonoEvento({ tipo: 'competicion', prioridad: 'A' }), 'danger');
  assert.equal(T.tonoEvento({ tipo: 'competicion', prioridad: 'B' }), 'warn');
  assert.equal(T.tonoEvento({ tipo: 'competicion', prioridad: 'C' }), 'info');
  assert.equal(T.tonoEvento({ tipo: 'test' }), 'ok');
  assert.equal(T.tonoEvento({ tipo: 'descanso' }), 'neutral');
  assert.equal(T.tonoEvento({ tipo: 'concentracion' }), 'accent');
  assert.doesNotMatch(JSON.stringify([T.TONO_PRIORIDAD, T.TONO_EVENTO]), /#/);
});

test('bandasDeFase and filaLibre', () => {
  const f1 = { id: 'a' }, f2 = { id: 'b' };
  assert.deepEqual(T.bandasDeFase([{ fase: f1 }, { fase: f1 }, { fase: f2 }, { fase: null }]).map((b) => [b.ini, b.fin]), [[0, 1], [2, 2], [3, 3]]);
  const filas = [[], []];
  assert.equal(T.filaLibre(filas, 100, 21), 0);
  assert.equal(T.filaLibre(filas, 110, 21), 1);
  assert.equal(T.filaLibre(filas, 105, 21), 1, 'no room: the last row is shared');
});

// ---------- Locale parity of this area ----------
test('locale files of planning, season, calendar and tutorial have the same keys and variables in es/en/it', async () => {
  const vars = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const area of ['planificacion', 'temporada', 'calendario', 'tutorial']) {
    const [es, en, it] = await Promise.all(['es', 'en', 'it'].map(async (l) => (await import(`../../js/locales/${area}.${l}.js`)).default));
    for (const [nombre, d] of [['en', en], ['it', it]]) {
      assert.deepEqual(Object.keys(d).sort(), Object.keys(es).sort(), `${area}.${nombre} keys`);
      Object.keys(es).forEach((k) => {
        assert.ok(String(d[k]).trim(), `${area}.${nombre} ${k} is empty`);
        assert.equal(vars(d[k]), vars(es[k]), `${area}.${nombre} ${k} variables`);
      });
    }
  }
});
