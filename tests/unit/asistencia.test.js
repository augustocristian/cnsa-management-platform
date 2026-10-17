import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/asistencia.js';
import { crearAsistenciaService } from '../../js/application/asistenciaService.js';

// In-memory repository with the same interface as the store (including the bulk operations).
function repoMem(datos = {}) {
  const db = { Entrenamientos: [], Nadadores: [], Grupos: [], Asistencia: [], ...datos };
  let n = 0;
  return {
    db,
    escrituras: 0,
    list: (s) => (db[s] || []).map((r) => ({ ...r })),
    get(s, id) {
      const r = (db[s] || []).find((x) => x.id === String(id));
      return r ? { ...r } : null;
    },
    upsert(s, row) {
      const fila = { ...row, id: row.id ? String(row.id) : 'g' + ++n };
      const i = db[s].findIndex((x) => x.id === fila.id);
      if (i >= 0) db[s][i] = fila;
      else db[s].push(fila);
      return { ...fila };
    },
    upsertMany(s, rows) {
      this.escrituras += 1;
      return rows.map((r) => this.upsert(s, r));
    },
    remove(s, id) {
      db[s] = db[s].filter((x) => x.id !== String(id));
    },
    removeMany(s, ids) {
      this.escrituras += 1;
      ids.forEach((id) => this.remove(s, id));
    },
  };
}
const NADADORES = [
  { id: 'n1', nombre: 'Lucía', apellidos: 'Fernández', grupoId: 'g1', activo: 'true' },
  { id: 'n2', nombre: 'Álvaro', apellidos: 'Rodríguez', grupoId: 'g1', activo: 'TRUE' },
  { id: 'n3', nombre: 'Pelayo', apellidos: 'García', grupoId: 'g1', activo: 'false' },
  { id: 'n4', nombre: 'Noa', apellidos: 'Díaz', grupoId: 'g2', activo: '' },
];
const SESIONES = [
  { id: 's1', fecha: '2026-10-12', hora: '17:00', titulo: 'Lunes', grupoId: 'g1' },
  { id: 's2', fecha: '2026-10-14', hora: '17:00', titulo: 'Miércoles', grupoId: 'g1' },
  { id: 's3', fecha: '2026-10-16', hora: '09:00', titulo: 'Viernes', grupoId: 'g2' },
];
const hoy = new Date(2026, 9, 14, 10, 0);
const nuevo = (extra = {}) => {
  const repo = repoMem({
    Nadadores: NADADORES.map((n) => ({ ...n })),
    Entrenamientos: SESIONES.map((s) => ({ ...s })),
    ...extra,
  });
  return { repo, svc: crearAsistenciaService(repo, { ahora: () => hoy }) };
};

test('estadoTrasToque: first tap sets the state, tapping it again clears it; no cycling through the other states', () => {
  assert.equal(D.estadoTrasToque('', 'presente'), 'presente');
  assert.equal(D.estadoTrasToque('presente', 'presente'), '');
  assert.equal(D.estadoTrasToque('presente', 'ausente'), 'ausente');
  assert.equal(D.estadoTrasToque('justificado', 'presente'), 'presente');
  assert.equal(D.estadoTrasToque('ausente', 'raro'), 'ausente');
  assert.deepEqual([...D.ESTADOS_RAPIDOS], ['presente', 'ausente']);
});

test('nadadoresDeSesion: active swimmers of the session group sorted by surname (esActivo is the only rule)', () => {
  assert.deepEqual(
    D.nadadoresDeSesion(SESIONES[0], NADADORES).map((n) => n.id),
    ['n1', 'n2'],
  );
  assert.deepEqual(
    D.nadadoresDeSesion({ id: 'x' }, NADADORES).map((n) => n.id),
    ['n4', 'n1', 'n2'],
  );
  assert.deepEqual(D.nadadoresDeSesion(null, NADADORES), []);
});

test('resumenSesion counts only the swimmers of the list and reports the unmarked ones', () => {
  const regs = [
    { nadadorId: 'n1', estado: 'presente' },
    { nadadorId: 'n2', estado: 'justificado' },
    { nadadorId: 'n9', estado: 'ausente' },
  ];
  const r = D.resumenSesion(NADADORES.slice(0, 2), regs);
  assert.deepEqual(
    [r.total, r.marcados, r.sinMarcar, r.presente, r.ausente, r.justificado, r.porcentajeMarcado],
    [2, 2, 0, 1, 0, 1, 100],
  );
  assert.equal(D.resumenSesion([], []).porcentajeMarcado, 0);
});

test('porcentajeAsistencia: present over sessions with a record; null without records', () => {
  assert.equal(D.porcentajeAsistencia({ presente: 3, ausente: 1, justificado: 0 }), 75);
  assert.equal(D.porcentajeAsistencia({ presente: 0, ausente: 0, justificado: 0 }), null);
});

test('sesionPorDefecto: today, else the latest past session, else the next one; vecinas follow the newest-first order', () => {
  assert.equal(D.sesionPorDefecto(SESIONES, '2026-10-14'), 's2');
  assert.equal(D.sesionPorDefecto(SESIONES, '2026-10-15'), 's2');
  assert.equal(D.sesionPorDefecto(SESIONES, '2026-01-01'), 's1');
  assert.equal(D.sesionPorDefecto([], '2026-10-14'), '');
  assert.equal(D.sesionVecina(SESIONES, 's2', 1), 's1');
  assert.equal(D.sesionVecina(SESIONES, 's2', -1), 's3');
  assert.equal(D.sesionVecina(SESIONES, 's3', -1), null);
});

test('filtrarSesiones: accent/case insensitive search that never drops the selected session', () => {
  const etq = (s) => `${s.fecha} ${s.titulo}`;
  assert.deepEqual(
    D.filtrarSesiones(SESIONES, 'MIERCOLES', etq).map((s) => s.id),
    ['s2'],
  );
  assert.deepEqual(
    D.filtrarSesiones(SESIONES, 'miercoles', etq, 's1').map((s) => s.id),
    ['s2', 's1'],
  );
  assert.equal(D.filtrarSesiones(SESIONES, '', etq).length, 3);
});

test('service.lista: swimmers of the group with their state; marcar/tocar/deshacer', () => {
  const { svc, repo } = nuevo();
  const m = svc.lista('s1');
  assert.deepEqual(
    m.filas.map((f) => [f.nadador.id, f.estado]),
    [
      ['n1', ''],
      ['n2', ''],
    ],
  );
  assert.equal(m.resumen.sinMarcar, 2);

  const r1 = svc.tocar('s1', 'n1', 'presente');
  assert.equal(r1.actual.estado, 'presente');
  assert.equal(repo.db.Asistencia.length, 1);
  svc.deshacer('s1', 'n1', r1);
  assert.equal(repo.db.Asistencia.length, 0, 'undo of a first mark removes it');

  svc.tocar('s1', 'n1', 'presente');
  const r2 = svc.tocar('s1', 'n1', 'ausente');
  assert.equal(repo.db.Asistencia[0].estado, 'ausente');
  svc.deshacer('s1', 'n1', r2);
  assert.equal(repo.db.Asistencia[0].estado, 'presente', 'undo restores the previous record');

  const r3 = svc.marcar('s1', 'n1', 'justificado', 'Avisa la familia');
  assert.deepEqual([r3.actual.estado, r3.actual.nota], ['justificado', 'Avisa la familia']);
  svc.tocar('s1', 'n1', 'justificado');
  assert.equal(repo.db.Asistencia.length, 0, 'tapping the same state clears it');
  assert.throws(() => svc.marcar('s1', 'n1', 'raro'));
  assert.equal(svc.lista('nada'), null);
});

test('service.marcarTodos marks only the unmarked swimmers with ONE write and is undoable', () => {
  const { svc, repo } = nuevo();
  svc.tocar('s1', 'n2', 'ausente');
  const antes = repo.escrituras;
  const creadas = svc.marcarTodos('s1');
  assert.equal(creadas.length, 1);
  assert.equal(repo.escrituras, antes + 1, 'a single upsertMany');
  assert.deepEqual(repo.db.Asistencia.map((a) => [a.nadadorId, a.estado]).sort(), [
    ['n1', 'presente'],
    ['n2', 'ausente'],
  ]);
  svc.deshacerVarias(creadas);
  assert.deepEqual(
    repo.db.Asistencia.map((a) => a.nadadorId),
    ['n2'],
  );
  assert.deepEqual(svc.marcarTodos('s1').length, 1);
  assert.deepEqual(svc.marcarTodos('s1'), [], 'nothing left to mark');
});

test('service works with a repository without bulk operations', () => {
  const repo = repoMem({ Nadadores: NADADORES, Entrenamientos: SESIONES });
  delete repo.upsertMany;
  delete repo.removeMany;
  const svc = crearAsistenciaService(repo, { ahora: () => hoy });
  const creadas = svc.marcarTodos('s1');
  assert.equal(creadas.length, 2);
  svc.deshacerVarias(creadas);
  assert.equal(repo.db.Asistencia.length, 0);
});

test('service.sesionPorDefecto uses the injected clock', () => {
  const { svc } = nuevo();
  assert.equal(svc.sesionPorDefecto(), 's2');
  const otro = crearAsistenciaService(repoMem({ Entrenamientos: SESIONES }), { ahora: () => new Date(2026, 9, 16) });
  assert.equal(otro.sesionPorDefecto(), 's3');
});

test('historial: one row per active swimmer with counts, percentage and detail newest first', () => {
  const { svc } = nuevo();
  svc.tocar('s1', 'n1', 'presente');
  svc.tocar('s2', 'n1', 'ausente');
  svc.marcar('s2', 'n2', 'justificado', 'x');
  const h = svc.historial();
  assert.deepEqual(
    h.map((f) => f.nadador.id),
    ['n4', 'n1', 'n2'],
  );
  const n1 = h.find((f) => f.nadador.id === 'n1');
  assert.deepEqual([n1.presente, n1.ausente, n1.total, n1.pct], [1, 1, 2, 50]);
  assert.deepEqual(
    n1.detalle.map((d) => d.sesion.id),
    ['s2', 's1'],
  );
  assert.equal(h.find((f) => f.nadador.id === 'n4').pct, null);
  assert.deepEqual(
    svc.historial({ grupoId: 'g2' }).map((f) => f.nadador.id),
    ['n4'],
  );
});
