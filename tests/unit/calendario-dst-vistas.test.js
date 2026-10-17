// Calendar domain: daylight-saving edge cases (Europe/Madrid) and the pure view-model helpers (agenda window, month grid, keyboard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/calendario.js';

// ---------- Daylight saving ----------
test('resolverHoraLocal: a normal time is untouched', () => {
  const r = D.resolverHoraLocal('Europe/Madrid', '2026-07-01', '10:00');
  assert.deepEqual([r.estado, r.fecha, r.hora, r.offsetMin], ['normal', '2026-07-01', '10:00', 120]);
  assert.equal(new Date(r.ms).toISOString(), '2026-07-01T08:00:00.000Z');
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-01-15', '10:00').offsetMin, 60);
});

test('resolverHoraLocal: 2026-03-29 02:30 does not exist -> 03:30 summer time (RFC 5545: offset before the gap)', () => {
  const r = D.resolverHoraLocal('Europe/Madrid', '2026-03-29', '02:30');
  assert.equal(r.estado, 'inexistente');
  assert.deepEqual([r.fecha, r.hora, r.offsetMin], ['2026-03-29', '03:30', 120]);
  assert.equal(new Date(r.ms).toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-03-29', '01:59').estado, 'normal');
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-03-29', '03:00').estado, 'normal');
});

test('resolverHoraLocal: 2026-10-25 02:30 happens twice -> the FIRST occurrence (summer offset +02:00)', () => {
  const r = D.resolverHoraLocal('Europe/Madrid', '2026-10-25', '02:30');
  assert.equal(r.estado, 'ambigua');
  assert.deepEqual([r.fecha, r.hora, r.offsetMin], ['2026-10-25', '02:30', 120]);
  assert.equal(new Date(r.ms).toISOString(), '2026-10-25T00:30:00.000Z');
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-10-25', '03:00').estado, 'normal');
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-10-25', '01:30').estado, 'normal');
});

test('resolverHoraLocal: a zone without DST never has edge cases; invalid input gives null', () => {
  assert.equal(D.resolverHoraLocal('America/Bogota', '2026-03-29', '02:30').estado, 'normal');
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-02-30', '10:00'), null);
  assert.equal(D.resolverHoraLocal('Europe/Madrid', '2026-03-29', 'xx'), null);
});

const EV = (fecha, hora = '02:30', dur = 60) => ({
  id: 'dst',
  origen: 'sesion',
  fecha,
  hora,
  duracionMin: dur,
  titulo: 'DST',
  grupoId: '',
  grupoNombre: '',
  piscina: '',
  piscinaNombre: '',
  calle: '',
  enfoque: '',
  volumenMin: '',
  volumenMax: '',
  descripcion: '',
  estado: 'planificado',
});

test('generarICS: a non-existent time is written with the wall time of the real instant (03:30)', () => {
  const out = D.generarICS([EV('2026-03-29')], { ahora: new Date(Date.UTC(2026, 2, 1)), zona: 'Europe/Madrid' });
  assert.match(out, /DTSTART;TZID=Europe\/Madrid:20260329T033000/);
  assert.match(
    out,
    /DTEND;TZID=Europe\/Madrid:20260329T043000/,
    'a 60 min event that starts in the gap ends 60 real minutes after 03:30',
  );
});

test('generarICS: an ambiguous time is written in UTC (first occurrence) so every client agrees', () => {
  const out = D.generarICS([EV('2026-10-25')], { ahora: new Date(Date.UTC(2026, 9, 1)), zona: 'Europe/Madrid' });
  assert.match(out, /^DTSTART:20261025T003000Z$/m);
  assert.match(
    out,
    /^DTEND:20261025T013000Z$/m,
    '60 real minutes after the first 02:30 (02:30 again, now winter time)',
  );
});

test('generarICS: "ahora" is mandatory (the domain never reads the clock)', () => {
  assert.throws(() => D.generarICS([EV('2026-10-25')], {}), TypeError);
});

test('aEventoGoogle: DST edge cases get a deterministic dateTime', () => {
  assert.equal(
    D.aEventoGoogle(EV('2026-07-01', '10:00'), { zona: 'Europe/Madrid' }).start.dateTime,
    '2026-07-01T10:00:00',
  );
  assert.equal(D.aEventoGoogle(EV('2026-03-29'), { zona: 'Europe/Madrid' }).start.dateTime, '2026-03-29T03:30:00');
  const doble = D.aEventoGoogle(EV('2026-10-25'), { zona: 'Europe/Madrid' });
  assert.equal(doble.start.dateTime, '2026-10-25T02:30:00+02:00');
  assert.equal(doble.start.timeZone, 'Europe/Madrid');
  assert.equal(doble.end.dateTime, '2026-10-25T02:30:00+01:00', 'elapsed 60 minutes: the end is the second 02:30');
  assert.equal(D.aEventoGoogle(EV('2026-03-29'), { zona: 'Europe/Madrid' }).end.dateTime, '2026-03-29T04:30:00+02:00');
});

// ---------- View model ----------
test('vistaInicial: Agenda on a phone by default, a stored "month" is ignored there', () => {
  assert.equal(D.vistaInicial({ guardada: undefined, movil: true }), 'agenda');
  assert.equal(D.vistaInicial({ guardada: undefined, movil: false }), 'mes');
  assert.equal(D.vistaInicial({ guardada: 'mes', movil: true }), 'agenda');
  assert.equal(D.vistaInicial({ guardada: 'semana', movil: true }), 'semana');
  assert.equal(D.vistaInicial({ guardada: 'mes', movil: false }), 'mes');
  assert.equal(D.vistaInicial({ guardada: 'nonsense', movil: false }), 'mes');
});

test('the agenda window STARTS at the cursor (today), not at the first of the month', () => {
  assert.deepEqual(D.rangoVista('agenda', '2026-10-16'), { desde: '2026-10-16', hasta: '2026-11-14' });
  assert.deepEqual(D.rangoVista('semana', '2026-10-16'), { desde: '2026-10-12', hasta: '2026-10-18' });
  assert.deepEqual(D.rangoVista('mes', '2026-10-16'), { desde: '2026-09-28', hasta: '2026-11-01' });
  assert.equal(D.moverCursor('agenda', '2026-10-16', 1), '2026-11-15');
  assert.equal(D.moverCursor('agenda', '2026-10-16', -1), '2026-09-16');
  assert.equal(D.moverCursor('semana', '2026-10-16', 1), '2026-10-23');
  assert.equal(D.moverCursor('mes', '2026-10-16', 1), '2026-11-01');
  assert.equal(D.seleccionTrasMover('mes', '2026-10-01', '2026-10-16'), '2026-10-16');
  assert.equal(D.seleccionTrasMover('mes', '2026-11-01', '2026-10-16'), '2026-11-01');
});

test('diasDeAgenda: the days with events, plus the anchor day when it is today', () => {
  const porDia = D.agruparPorDia([
    { fecha: '2026-10-20', id: 'a' },
    { fecha: '2026-10-18', id: 'b' },
    { fecha: '2026-10-20', id: 'c' },
  ]);
  assert.deepEqual(D.diasDeAgenda(porDia, '2026-10-16', '2026-10-16'), ['2026-10-16', '2026-10-18', '2026-10-20']);
  assert.deepEqual(D.diasDeAgenda(porDia, '2026-10-17', '2026-10-16'), ['2026-10-18', '2026-10-20']);
  assert.equal(porDia.get('2026-10-20').length, 2);
});

test('matrizMes: whole weeks, Monday first', () => {
  const m = D.matrizMes('2026-10-16');
  assert.equal(m.length, 5);
  assert.ok(m.every((s) => s.length === 7));
  assert.equal(m[0][0], '2026-09-28');
  assert.equal(m[4][6], '2026-11-01');
});

test('fechaTrasTecla: arrows, Home/End and PageUp/PageDown keep the day within the month length', () => {
  assert.equal(D.fechaTrasTecla('ArrowRight', '2026-10-31'), '2026-11-01');
  assert.equal(D.fechaTrasTecla('ArrowUp', '2026-10-05'), '2026-09-28');
  assert.equal(D.fechaTrasTecla('Home', '2026-10-16'), '2026-10-12');
  assert.equal(D.fechaTrasTecla('End', '2026-10-16'), '2026-10-18');
  assert.equal(D.fechaTrasTecla('PageDown', '2026-01-31'), '2026-02-28');
  assert.equal(D.fechaTrasTecla('PageUp', '2026-03-31'), '2026-02-28');
  assert.equal(D.fechaTrasTecla('a', '2026-10-16'), null);
});

test('rangoExportacion: month in view, season and next 90 days with their file suffix', () => {
  assert.deepEqual(D.rangoExportacion('mes', '2026-10-16', '2026-11-20'), {
    rango: { desde: '2026-11-01', hasta: '2026-11-30' },
    sufijo: '2026-11',
  });
  assert.equal(D.rangoExportacion('temporada', '2026-10-16', '2026-10-16').sufijo, 'temporada');
  assert.equal(D.rangoExportacion('proximos90', '2026-10-16', '2026-10-16').rango.hasta, '2027-01-13');
});
