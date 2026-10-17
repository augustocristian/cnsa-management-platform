import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/inicio.js';

// Wednesday 14 Oct 2026, 18:00 local time.
const AHORA = new Date(2026, 9, 14, 18, 0);
const ses = (id, fecha, hora, extra = {}) => ({
  id,
  fecha,
  hora,
  duracionMin: 60,
  grupoId: 'g1',
  estado: 'planificado',
  ...extra,
});

test('proximaSesion compares date AND time with the clock and never returns a past session', () => {
  const entrenos = [
    ses('pasada-hoy', '2026-10-14', '10:00'), // earlier today, still "planificado"
    ses('ayer', '2026-10-13', '19:00'),
    ses('manana', '2026-10-15', '17:30'),
    ses('hoy-tarde', '2026-10-14', '20:30'),
  ];
  assert.equal(D.proximaSesion(entrenos, AHORA).id, 'hoy-tarde');
  assert.equal(D.proximaSesion(entrenos, new Date(2026, 9, 14, 21, 45)).id, 'manana');
  assert.equal(D.proximaSesion(entrenos, new Date(2026, 9, 16, 9, 0)), null);
});

test('proximaSesion skips sessions already marked as done and reports a session in progress', () => {
  const entrenos = [
    ses('hecha', '2026-10-14', '18:30', { estado: 'realizado' }),
    ses('en-curso', '2026-10-14', '17:45'),
    ses('luego', '2026-10-15', '10:00'),
  ];
  const p = D.proximaSesion(entrenos, AHORA);
  assert.equal(p.id, 'en-curso');
  assert.equal(p.momento, 'en-curso');
  assert.equal(p.dias, 0);
  assert.equal(D.proximaSesion([ses('x', '2026-10-17', '09:00')], AHORA).dias, 3);
});

test('a session without time today is still pending; momentoDe uses start and duration', () => {
  assert.equal(D.momentoDe(D.normalizarSesion(ses('a', '2026-10-14', '')), AHORA), 'pendiente');
  assert.equal(D.momentoDe(D.normalizarSesion(ses('a', '2026-10-14', '17:00')), AHORA), 'pasada'); // 17:00-18:00 ended at 18:00
  assert.equal(D.momentoDe(D.normalizarSesion(ses('a', '2026-10-14', '17:01')), AHORA), 'en-curso');
  assert.equal(D.momentoDe(D.normalizarSesion(ses('a', '2026-10-14', '18:00')), AHORA), 'en-curso');
  assert.equal(D.momentoDe(D.normalizarSesion(ses('a', '2026-10-14', '18:01')), AHORA), 'pendiente');
});

test('sesionesDeHoy is ordered by time and sesionParaAsistencia picks in-progress, then next, then last', () => {
  const hoy = D.sesionesDeHoy(
    [
      ses('c', '2026-10-14', '20:00'),
      ses('a', '2026-10-14', '10:00'),
      ses('b', '2026-10-14', '17:30'),
      ses('z', '2026-10-15', '08:00'),
    ],
    AHORA,
  );
  assert.deepEqual(
    hoy.map((s) => s.id),
    ['a', 'b', 'c'],
  );
  assert.deepEqual(
    hoy.map((s) => s.momento),
    ['pasada', 'en-curso', 'pendiente'],
  );
  assert.equal(D.sesionParaAsistencia(hoy).id, 'b');
  assert.equal(D.sesionParaAsistencia(hoy.filter((s) => s.id !== 'b')).id, 'c');
  assert.equal(D.sesionParaAsistencia(hoy.filter((s) => s.id === 'a')).id, 'a');
  assert.equal(D.sesionParaAsistencia([]), null);
});

const nads = [
  { id: 'n1', grupoId: 'g1', activo: 'true' },
  { id: 'n2', grupoId: 'g1', activo: 'true' },
  { id: 'n3', grupoId: 'g1', activo: 'true' },
  { id: 'n4', grupoId: 'g1', activo: 'false' },
  { id: 'n5', grupoId: 'g2', activo: 'true' },
];

test('expected swimmers: active ones of the group, everyone active when the session has no group', () => {
  assert.deepEqual(
    D.nadadoresEsperados({ grupoId: 'g1' }, nads).map((n) => n.id),
    ['n1', 'n2', 'n3'],
  );
  assert.equal(D.nadadoresEsperados({ grupoId: '' }, nads).length, 4);
});

test('attendance counters follow the Attendance module rules (present / absent / excused / unconfirmed)', () => {
  const asis = [
    { entrenamientoId: 's1', nadadorId: 'n1', estado: 'presente' },
    { entrenamientoId: 's1', nadadorId: 'n2', estado: 'ausente' },
    { entrenamientoId: 's1', nadadorId: 'n4', estado: 'presente' }, // inactive: not expected, does not count
    { entrenamientoId: 's1', nadadorId: 'n5', estado: 'presente' }, // other group
    { entrenamientoId: 's2', nadadorId: 'n3', estado: 'presente' }, // other session
  ];
  const a = D.asistenciaDeSesion({ id: 's1', grupoId: 'g1' }, nads, asis);
  assert.deepEqual(a, {
    sesionId: 's1',
    esperados: 3,
    presentes: 1,
    ausentes: 1,
    justificados: 0,
    sinConfirmar: 1,
    porcentaje: 33,
  });
  const j = D.asistenciaDeSesion({ id: 's1', grupoId: 'g1' }, nads, [
    { entrenamientoId: 's1', nadadorId: 'n1', estado: 'justificado' },
  ]);
  assert.equal(j.justificados, 1);
  assert.equal(j.sinConfirmar, 2);
  assert.equal(D.asistenciaDeSesion({ id: 's9', grupoId: 'nada' }, nads, []).porcentaje, null);
});

test('asistenciaDeHoy adds up the sessions of the day', () => {
  const asis = [
    { entrenamientoId: 's1', nadadorId: 'n1', estado: 'presente' },
    { entrenamientoId: 's2', nadadorId: 'n5', estado: 'presente' },
  ];
  const r = D.asistenciaDeHoy(
    [
      { id: 's1', grupoId: 'g1' },
      { id: 's2', grupoId: 'g2' },
    ],
    nads,
    asis,
  );
  assert.equal(r.sesiones.length, 2);
  assert.deepEqual(r.total, {
    esperados: 4,
    presentes: 2,
    ausentes: 0,
    justificados: 0,
    sinConfirmar: 2,
    porcentaje: 50,
  });
  assert.equal(D.asistenciaDeHoy([], nads, asis).total.porcentaje, null);
});

test('alertasDeCarga keeps only out-of-range contents, largest deviation first', () => {
  const ev = [
    { tipo: { id: 'a' }, metros: 3000, min: 1500, max: 4000, estado: 'ok', diferencia: 0 },
    { tipo: { id: 'b' }, metros: 200, min: 2500, max: 4000, estado: 'bajo', diferencia: 2300 },
    { tipo: { id: 'c' }, metros: 2700, min: 500, max: 1500, estado: 'alto', diferencia: 1200 },
  ];
  const r = D.alertasDeCarga(ev);
  assert.deepEqual(
    r.map((x) => [x.tipo.id, x.estado, x.diferencia]),
    [
      ['b', 'bajo', 2300],
      ['c', 'alto', 1200],
    ],
  );
});

test('escalaEje gives round ticks and etiquetaMetros formats thousands with k', () => {
  assert.deepEqual(D.escalaEje(0).marcas, [0, 250, 500, 750, 1000]);
  assert.deepEqual(D.escalaEje(900).marcas, [0, 200, 400, 600, 800, 1000]);
  assert.deepEqual(D.escalaEje(3700), { tope: 4000, paso: 1000, marcas: [0, 1000, 2000, 3000, 4000] });
  assert.deepEqual(D.escalaEje(9700).marcas, [0, 2500, 5000, 7500, 10000, 12500]);
  for (const v of [120, 480, 1234, 2600, 5100, 18000]) {
    const e = D.escalaEje(v);
    assert.ok(e.tope >= v && e.marcas.length <= 6, `${v}`);
    assert.ok(e.marcas.every((m) => m % 50 === 0));
  }
  assert.equal(D.etiquetaMetros(500), '500');
  assert.equal(D.etiquetaMetros(1000), '1k');
  assert.equal(D.etiquetaMetros(2500), '2.5k');
  assert.equal(D.etiquetaMetros(2500, ','), '2,5k');
  assert.equal(D.etiquetaMetros(12000), '12k');
});

test('serieSemanal: future days are not zero, the objective is one band, today is flagged', () => {
  const lunes = new Date(2026, 9, 12);
  const agregado = {
    porDia: [1000, 2000, 500, 0, 0, 0, 0],
    porDiaTipo: [{ t1: 600, '': 400 }, { t1: 2000 }, { t2: 500 }, {}, {}, {}, {}],
  };
  const s = D.serieSemanal({
    agregado,
    lunes,
    ahora: AHORA,
    ordenTipos: ['t1', 't2'],
    objetivoSemanal: { min: 7000, max: 14000 },
  });
  assert.deepEqual(
    s.dias.map((d) => d.futuro),
    [false, false, false, true, true, true, true],
  );
  assert.equal(s.dias[3].total, null);
  assert.deepEqual(s.dias[3].porTipo, []);
  assert.equal(s.dias[2].hoy, true);
  assert.deepEqual(s.dias[0].porTipo, [
    { id: 't1', metros: 600 },
    { id: '', metros: 400 },
  ]);
  assert.deepEqual(s.banda, { min: 1000, max: 2000 });
  assert.equal(s.hayCargas, true);
  assert.ok(s.eje.tope >= 2000);
  assert.equal(D.serieSemanal({ agregado, lunes, ahora: AHORA }).banda, null);
});

test('avisosRecientes: newest first, preview, recipient and whole days since', () => {
  const grupos = [{ id: 'g1', nombre: 'Alevín' }];
  const largo = 'Texto muy largo '.repeat(20);
  const r = D.avisosRecientes(
    [
      { id: 'c1', fecha: '2026-10-01', titulo: 'Viejo', texto: 'a', grupoId: '' },
      { id: 'c2', fecha: '2026-10-13', titulo: 'Ayer', texto: largo, grupoId: 'g1' },
      { id: 'c3', fecha: '2026-10-14', titulo: 'Hoy', texto: 'Hola', grupoId: 'borrado' },
    ],
    grupos,
    AHORA,
    { max: 2 },
  );
  assert.deepEqual(
    r.map((x) => x.titulo),
    ['Hoy', 'Ayer'],
  );
  assert.deepEqual(
    r.map((x) => x.dias),
    [0, 1],
  );
  assert.deepEqual(r[0].destino, { tipo: 'todos', nombre: '' });
  assert.deepEqual(r[1].destino, { tipo: 'grupo', nombre: 'Alevín' });
  assert.ok(r[1].vistaPrevia.length <= 111 && r[1].vistaPrevia.endsWith('…'));
  assert.equal(D.vistaPrevia('  uno   dos '), 'uno dos');
});

test('proximoEvento returns the first unfinished event, flagging one under way', () => {
  const ev = [
    { id: 'e1', nombre: 'Pasado', tipo: 'competicion', fechaInicio: '2026-10-01', fechaFin: '2026-10-02' },
    { id: 'e3', nombre: 'Lejano', tipo: 'test', fechaInicio: '2026-12-01', fechaFin: '2026-12-01' },
    {
      id: 'e2',
      nombre: 'Cerca',
      tipo: 'competicion',
      fechaInicio: '2026-10-20',
      fechaFin: '2026-10-21',
      prioridad: 'a',
    },
  ];
  const e = D.proximoEvento(ev, AHORA);
  assert.equal(e.nombre, 'Cerca');
  assert.equal(e.dias, 6);
  assert.equal(e.enCurso, false);
  assert.equal(e.prioridad, 'A');
  const en = D.proximoEvento(
    [{ id: 'x', nombre: 'Concentración', tipo: 'concentracion', fechaInicio: '2026-10-13', fechaFin: '2026-10-15' }],
    AHORA,
  );
  assert.equal(en.enCurso, true);
  assert.equal(D.proximoEvento([], AHORA), null);
});

test('pasosIniciales ticks the steps from the data', () => {
  const vacio = D.pasosIniciales({});
  assert.equal(vacio.hechos, 0);
  assert.equal(vacio.completo, false);
  assert.deepEqual(
    vacio.pasos.map((p) => p.clave),
    ['grupos', 'nadadores', 'piscina', 'sesion'],
  );
  const parcial = D.pasosIniciales({ grupos: 2, nadadores: 5 });
  assert.deepEqual(
    parcial.pasos.map((p) => p.hecho),
    [true, true, false, false],
  );
  assert.equal(parcial.hechos, 2);
  assert.equal(D.pasosIniciales({ grupos: 1, nadadores: 1, piscinas: 1, sesiones: 1 }).completo, true);
});

test('sesionesDeLaSemana counts sessions Monday to Sunday', () => {
  const l = [
    ses('a', '2026-10-11', '10:00'),
    ses('b', '2026-10-12', '10:00', { estado: 'realizado' }),
    ses('c', '2026-10-18', '10:00'),
    ses('d', '2026-10-19', '10:00'),
  ];
  assert.deepEqual(D.sesionesDeLaSemana(l, '2026-10-12'), { total: 2, realizadas: 1 });
});
