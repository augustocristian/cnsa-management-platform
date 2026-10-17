import test from 'node:test';
import assert from 'node:assert/strict';
import { crearInicioService } from '../../js/application/inicioService.js';
import { crearCargasService } from '../../js/application/cargasService.js';

// In-memory repository with the same interface as the store.
function repoMem(datos = {}, extra = {}) {
  const db = { ...datos };
  return {
    club: { nombre: 'Club Test', lema: 'Lema' },
    clubRef: { id: 'club-1', name: 'Club Test' },
    ...extra,
    list: (s) => (db[s] || []).map((r) => ({ ...r })),
    get: (s, id) => (db[s] || []).find((x) => x.id === id) || null,
    upsert(s, row) {
      db[s] = db[s] || [];
      const i = db[s].findIndex((x) => x.id === row.id);
      if (i >= 0) db[s][i] = row;
      else db[s].push(row);
      return row;
    },
    remove(s, id) {
      db[s] = (db[s] || []).filter((x) => x.id !== id);
    },
  };
}

// Wednesday 14 Oct 2026, 18:00.
const AHORA = () => new Date(2026, 9, 14, 18, 0);
const datos = () => ({
  Grupos: [
    { id: 'g1', nombre: 'Promoción' },
    { id: 'g2', nombre: 'Alevín' },
  ],
  Nadadores: [
    { id: 'n1', grupoId: 'g1', activo: 'true' },
    { id: 'n2', grupoId: 'g1', activo: 'true' },
    { id: 'n3', grupoId: 'g2', activo: 'true' },
    { id: 'n4', grupoId: 'g2', activo: 'false' },
  ],
  Entrenamientos: [
    {
      id: 'e1',
      fecha: '2026-10-14',
      hora: '17:30',
      duracionMin: 60,
      grupoId: 'g1',
      estado: 'planificado',
      piscina: '25',
      volumenMin: 1800,
      volumenMax: 2200,
      enfoque: 'Técnica',
    },
    {
      id: 'e2',
      fecha: '2026-10-14',
      hora: '19:30',
      duracionMin: 90,
      grupoId: 'g2',
      estado: 'planificado',
      piscina: '50',
    },
    { id: 'e3', fecha: '2026-10-12', hora: '17:30', grupoId: 'g1', estado: 'realizado' },
    { id: 'e4', fecha: '2026-10-15', hora: '17:30', grupoId: 'g1', estado: 'planificado' },
  ],
  Asistencia: [
    { entrenamientoId: 'e1', nadadorId: 'n1', estado: 'presente' },
    { entrenamientoId: 'e1', nadadorId: 'n2', estado: 'justificado' },
  ],
  Cargas: [
    { id: 'c1', nadadorId: 'n1', fecha: '2026-10-12', metros: 2000, tipo: 'Piernas', entrenamientoId: 'e3' },
    { id: 'c2', nadadorId: 'n2', fecha: '2026-10-13', metros: 800, tipo: 'Piernas', entrenamientoId: '' },
  ],
  Comunicaciones: [
    { id: 'm1', fecha: '2026-10-13', titulo: 'Horarios', texto: 'Cambios en la piscina', grupoId: 'g2' },
  ],
  EventosTemporada: [
    {
      id: 'ev1',
      nombre: 'Trofeo',
      tipo: 'competicion',
      fechaInicio: '2026-10-24',
      fechaFin: '2026-10-25',
      prioridad: 'A',
    },
  ],
  Piscinas: [{ id: 'p1' }],
});

function crear(d = datos(), opts = {}) {
  const repo = repoMem(d);
  crearCargasService(repo).asegurarCatalogo();
  // objective for "Piernas": 500-1500 per swimmer per week
  const piernas = repo.list('TiposCarga').find((t) => t.nombre === 'Piernas');
  repo.upsert('TiposCarga', { ...piernas, minSemanalM: 3000, maxSemanalM: 5000 });
  return { repo, svc: crearInicioService(repo, { ahora: AHORA, ...opts }) };
}

test('panel: today, in-progress session, attendance and headline numbers', () => {
  const { svc } = crear();
  const m = svc.panel();
  assert.equal(m.hoy, '2026-10-14');
  assert.equal(m.club.nombre, 'Club Test');
  assert.deepEqual(
    m.hoySesiones.map((s) => [s.id, s.momento, s.grupoNombre]),
    [
      ['e1', 'en-curso', 'Promoción'],
      ['e2', 'pendiente', 'Alevín'],
    ],
  );
  assert.deepEqual(m.titular, { sesiones: 2, esperados: 3 }); // g1: 2 swimmers + g2: 1 active
  assert.equal(m.sesionAsistencia.id, 'e1');
  assert.deepEqual(m.hoySesiones[0].asistencia, {
    sesionId: 'e1',
    esperados: 2,
    presentes: 1,
    ausentes: 0,
    justificados: 1,
    sinConfirmar: 0,
    porcentaje: 50,
  });
  assert.deepEqual(m.asistencia.total, {
    esperados: 3,
    presentes: 1,
    ausentes: 0,
    justificados: 1,
    sinConfirmar: 1,
    porcentaje: 33,
  });
  assert.equal(m.kpis.nadadoresActivos, 3);
  assert.deepEqual(m.kpis.semana, { total: 4, realizadas: 1 }); // e1..e4 all fall in Mon 12 - Sun 18 Oct
});

test('panel: the next session is never in the past', () => {
  const { svc } = crear();
  assert.equal(svc.panel().proxima.id, 'e1'); // in progress at 18:00
  const tarde = crearInicioService(repoMem(datos()), {
    ahora: () => new Date(2026, 9, 14, 21, 30),
    cargas: crearCargasService(repoMem(datos())),
  });
  const p = tarde.panel().proxima;
  assert.equal(p.id, 'e4');
  assert.equal(p.dias, 1);
  assert.equal(p.grupoNombre, 'Promoción');
});

test('panel: weekly load chart has future days empty and alerts with the module texts data', () => {
  const { svc } = crear();
  const c = svc.panel().carga;
  assert.equal(c.serie.dias.filter((d) => d.futuro).length, 4);
  assert.equal(c.serie.hayCargas, true);
  assert.equal(c.hayObjetivos, true);
  const a = c.alertas.find((x) => x.tipo.nombre === 'Piernas');
  assert.equal(a.estado, 'bajo'); // average 1400 per swimmer (2000 + 800) / 2 vs minimum 3000
  assert.equal(a.diferencia, 1600);
});

test('panel: recent notes, next event and complete first steps', () => {
  const { svc } = crear();
  const m = svc.panel();
  assert.deepEqual(
    m.avisos.map((a) => [a.titulo, a.dias, a.destino.nombre]),
    [['Horarios', 1, 'Alevín']],
  );
  assert.equal(m.evento.nombre, 'Trofeo');
  assert.equal(m.evento.dias, 10);
  assert.equal(m.primerosPasos.completo, true);
});

test('empty club: no sessions, no events, first steps pending and dismissible per club', () => {
  const guardado = new Map();
  const prefs = {
    get: (k, d) => (guardado.has(k) ? guardado.get(k) : d),
    set: (k, v) => {
      if (v === null) guardado.delete(k);
      else guardado.set(k, v);
    },
  };
  const { svc } = crear({}, { prefs });
  const m = svc.panel();
  assert.deepEqual(m.titular, { sesiones: 0, esperados: 0 });
  assert.equal(m.proxima, null);
  assert.equal(m.evento, null);
  assert.deepEqual(m.avisos, []);
  assert.equal(m.sesionAsistencia, null);
  assert.equal(m.primerosPasos.hechos, 0);
  assert.equal(m.primerosPasos.oculto, false);
  svc.ocultarPasos();
  assert.equal(svc.panel().primerosPasos.oculto, true);
  assert.ok([...guardado.keys()][0].endsWith('club-1'));
  svc.ocultarPasos(false);
  assert.equal(svc.panel().primerosPasos.oculto, false);
});

test('without a preferences port the first steps card is simply never dismissed', () => {
  const { svc } = crear({});
  svc.ocultarPasos();
  assert.equal(svc.pasosOcultos(), false);
});
