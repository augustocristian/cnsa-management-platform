// Tests del dominio del calendario (js/domain/calendario.js): lógica pura, sin DOM ni red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/calendario.js';

const GRUPOS = [
  { id: 'g1', nombre: 'Promoción', entrenador: 'Marta Valdés' },
  { id: 'g2', nombre: 'Alevín', entrenador: 'jorge@club.es' },
  { id: 'g3', nombre: 'Absoluto', entrenador: 'Otro Entrenador' },
];
const ses = (id, fecha, hora, grupoId, extra = {}) => ({ id, fecha, hora, duracionMin: 60, grupoId, titulo: 'S' + id, descripcion: '', estado: 'planificado', piscina: '25', volumenMin: '', volumenMax: '', enfoque: '', ...extra });
const DATOS = {
  Grupos: GRUPOS,
  Nadadores: [{ id: 'n1', grupoId: 'g1', email: '' }, { id: 'n2', grupoId: 'g2', email: 'otro@x.es' }],
  Entrenamientos: [ses('e1', '2026-10-20', '17:30', 'g1'), ses('e2', '2026-10-21', '18:30', 'g2'), ses('e3', '2026-10-22', '19:00', '')],
  Piscinas: [{ id: 'p1', nombre: 'Piscina Lugones', longitudM: 25 }],
  AsignacionesCalle: [],
};
const RANGO = { desde: '2026-10-01', hasta: '2026-10-31' };

// ---------- fechas ----------
test('fechas: aritmética por días, lunes y fin de mes', () => {
  assert.equal(D.addDias('2026-10-31', 1), '2026-11-01');
  assert.equal(D.lunesDe('2026-10-18'), '2026-10-12'); // domingo -> lunes anterior
  assert.equal(D.diaSemana('2026-10-19'), 0);
  assert.equal(D.finMes('2028-02-10'), '2028-02-29');
  assert.equal(D.addMeses('2026-12-15', 1), '2027-01-01');
  assert.equal(D.parseFecha('2026-02-30'), null);
});

test('rangoPredefinido: mes, temporada (sep-ago) y próximos 90 días', () => {
  assert.deepEqual(D.rangoPredefinido('mes', '2026-10-15', '2026-11-20'), { desde: '2026-11-01', hasta: '2026-11-30' });
  assert.deepEqual(D.rangoPredefinido('temporada', '2026-10-15'), { desde: '2026-09-01', hasta: '2027-08-31' });
  assert.deepEqual(D.rangoPredefinido('temporada', '2027-03-01'), { desde: '2026-09-01', hasta: '2027-08-31' });
  assert.deepEqual(D.rangoPredefinido('proximos90', '2026-10-15'), { desde: '2026-10-15', hasta: '2027-01-12' });
});

// ---------- fuentes y recurrencias ----------
test('sesiones: sólo las del rango, con grupo y fin calculado', () => {
  const evs = D.eventosEnRango(DATOS, { desde: '2026-10-20', hasta: '2026-10-21' });
  assert.deepEqual(evs.map((e) => e.id), ['ses-e1', 'ses-e2']);
  assert.equal(evs[0].grupoNombre, 'Promoción');
  assert.deepEqual(D.finEvento(evs[0]), { fecha: '2026-10-20', hora: '18:30' });
  assert.deepEqual(D.finEvento({ fecha: '2026-10-20', hora: '23:30', duracionMin: 60 }), { fecha: '2026-10-21', hora: '00:30' });
});

test('asignaciones semanales: se expanden a fechas concretas con nº de calle', () => {
  const datos = { ...DATOS, Entrenamientos: [], AsignacionesCalle: [{ id: 'a1', piscinaId: 'p1', dia: 2, fecha: '', horaInicio: '18:00', horaFin: '19:30', calleDesde: 3, calleHasta: 4, grupoId: 'g1', notas: 'n' }] };
  const evs = D.eventosEnRango(datos, RANGO);
  assert.deepEqual(evs.map((e) => e.fecha), ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27']); // martes
  assert.equal(evs[0].calle, '3-4');
  assert.equal(evs[0].duracionMin, 90);
  assert.equal(evs[0].piscina, '25');
  assert.match(evs[0].titulo, /Promoción · Calle 3-4/);
  assert.equal(D.ubicacionEvento(evs[0]), 'Piscina Lugones (25 m), Calle 3-4');
});

test('asignaciones: se omiten las fechas con sesión concreta del mismo grupo y manda la excepción puntual', () => {
  const datos = {
    ...DATOS,
    Entrenamientos: [ses('e1', '2026-10-20', '17:30', 'g1')],
    AsignacionesCalle: [
      { id: 'a1', piscinaId: 'p1', dia: 2, fecha: '', horaInicio: '18:00', horaFin: '19:00', calleDesde: 1, calleHasta: 1, grupoId: 'g1' },
      { id: 'a2', piscinaId: 'p1', dia: 2, fecha: '2026-10-13', horaInicio: '20:00', horaFin: '21:00', calleDesde: 5, calleHasta: 5, grupoId: 'g1' },
      { id: 'a3', piscinaId: 'p1', dia: 2, fecha: '', horaInicio: '18:00', horaFin: '19:00', calleDesde: 2, calleHasta: 2, grupoId: 'g2' },
    ],
  };
  const calle = D.eventosEnRango(datos, RANGO).filter((e) => e.origen === 'calle');
  const g1 = calle.filter((e) => e.grupoId === 'g1').map((e) => `${e.fecha}@${e.calle}`);
  assert.deepEqual(g1, ['2026-10-06@1', '2026-10-13@5', '2026-10-27@1']); // 20 omitido por sesión; 13 sustituido por la excepción
  assert.equal(calle.filter((e) => e.grupoId === 'g2').length, 4); // otro grupo no se ve afectado
});

test('fuentes: punto de extensión registrarFuente y una fuente rota no tumba el resto', () => {
  const fuentes = [...D.FUENTES_EVENTOS, { id: 'rota', genera: () => { throw new Error('x'); } },
    { id: 'extra', genera: () => [{ id: 'x-1', origen: 'extra', fecha: '2026-10-05', hora: '', titulo: 'Extra', grupoId: '', grupoNombre: '' }] }];
  const evs = D.eventosEnRango(DATOS, RANGO, { fuentes });
  assert.ok(evs.some((e) => e.id === 'x-1'));
  assert.ok(evs.some((e) => e.id === 'ses-e1'));
});

// ---------- filtros (app de un solo usuario: sin ámbito por rol) ----------
test('no existe el ámbito por rol (el entrenador lo ve todo y filtra por grupo)', () => {
  assert.equal(D.ambitoUsuario, undefined);
});

test('filtrarEventos: por grupos (los generales siempre) y por piscina', () => {
  const evs = D.eventosEnRango(DATOS, RANGO);
  assert.deepEqual(D.filtrarEventos(evs, { grupoIds: ['g1'] }).map((e) => e.id), ['ses-e1', 'ses-e3']);
  assert.equal(D.filtrarEventos(evs, { grupoIds: null }).length, 3);
  assert.equal(D.filtrarEventos(evs, { piscina: '50' }).length, 0);
});

test('colorGrupo: a stable hue per group (no hex in the domain) and neutral for the whole club', () => {
  assert.deepEqual(D.colorGrupo('g1', GRUPOS), D.colorGrupo('g1', GRUPOS));
  assert.notDeepEqual(D.colorGrupo('g1', GRUPOS), D.colorGrupo('g2', GRUPOS));
  assert.ok(Number.isInteger(D.colorGrupo('g1', GRUPOS).tono));
  assert.deepEqual(D.colorGrupo('', GRUPOS), D.COLOR_SIN_GRUPO);
  assert.doesNotMatch(JSON.stringify(D.TONOS_GRUPO), /#/);
});

// ---------- iCalendar ----------
test('escaparTexto escapa \\ ; , y saltos de línea', () => {
  assert.equal(D.escaparTexto('a,b;c\\d\ne\r\nf'), 'a\\,b\\;c\\\\d\\ne\\nf');
});

test('plegarLinea: <= 75 octetos, continuación con espacio y sin partir caracteres UTF-8', () => {
  const larga = 'DESCRIPTION:' + 'ñandú€😀'.repeat(30);
  const plegada = D.plegarLinea(larga);
  const trozos = plegada.split('\r\n');
  assert.ok(trozos.length > 1);
  const enc = new TextEncoder();
  trozos.forEach((l, i) => { assert.ok(enc.encode(l).length <= 75, `línea ${i}`); if (i) assert.ok(l.startsWith(' ')); });
  assert.equal(trozos.map((l, i) => (i ? l.slice(1) : l)).join(''), larga); // desplegar = original
  assert.equal(D.plegarLinea('corta'), 'corta');
});

const AHORA = new Date(Date.UTC(2026, 9, 15, 10, 30, 0));
function ics(eventos, extra = {}) { return D.generarICS(eventos, { nombreCalendario: 'CNL – Club, "Test"', zona: 'Europe/Madrid', ahora: AHORA, secuencia: 7, ...extra }); }
// Desplega el .ics y devuelve las líneas lógicas.
const lineas = (txt) => txt.replace(/\r\n[ \t]/g, '').split('\r\n').filter(Boolean);

test('generarICS: estructura RFC 5545, CRLF, UID estable, TZID, DTSTAMP y SEQUENCE', () => {
  const evs = D.eventosEnRango(DATOS, RANGO).slice(0, 2);
  const txt = ics(evs);
  assert.ok(txt.endsWith('\r\n'));
  assert.ok(!/[^\r]\n/.test(txt), 'sólo CRLF');
  const ls = lineas(txt);
  assert.equal(ls[0], 'BEGIN:VCALENDAR');
  assert.equal(ls.at(-1), 'END:VCALENDAR');
  assert.ok(ls.includes('VERSION:2.0'));
  assert.ok(ls.some((l) => l.startsWith('PRODID:')));
  assert.ok(ls.includes('X-WR-CALNAME:CNL – Club\\, "Test"'));
  assert.equal(ls.filter((l) => l === 'BEGIN:VEVENT').length, 2);
  assert.equal(ls.filter((l) => l === 'END:VEVENT').length, 2);
  assert.ok(ls.includes('UID:ses-e1@cnl-plataforma'));
  assert.ok(ls.includes('DTSTAMP:20261015T103000Z'));
  assert.ok(ls.includes('SEQUENCE:7'));
  assert.ok(ls.includes('DTSTART;TZID=Europe/Madrid:20261020T173000'));
  assert.ok(ls.includes('DTEND;TZID=Europe/Madrid:20261020T183000'));
  assert.ok(ls.some((l) => l === 'LOCATION:Piscina 25 m'));
  assert.ok(ls.includes('CATEGORIES:Promoción'));
  // begin/end equilibrados
  const pila = [];
  ls.forEach((l) => { if (l.startsWith('BEGIN:')) pila.push(l.slice(6)); else if (l.startsWith('END:')) assert.equal(pila.pop(), l.slice(4)); });
  assert.equal(pila.length, 0);
});

test('generarICS: el UID es idéntico entre exportaciones (reimportar actualiza, no duplica)', () => {
  const evs = D.eventosEnRango(DATOS, RANGO);
  const uids = (t) => lineas(t).filter((l) => l.startsWith('UID:'));
  assert.deepEqual(uids(ics(evs)), uids(ics(evs, { ahora: new Date(2030, 0, 1), secuencia: 99 })));
});

test('generarICS: VTIMEZONE de Europe/Madrid con las transiciones reales y TZID coincidente', () => {
  const evs = [{ id: 'a', fecha: '2026-03-20', hora: '10:00', duracionMin: 60, titulo: 'x', grupoId: '', grupoNombre: '' },
    { id: 'b', fecha: '2026-11-02', hora: '10:00', duracionMin: 60, titulo: 'y', grupoId: '', grupoNombre: '' }];
  const ls = lineas(ics(evs));
  const i = ls.indexOf('BEGIN:VTIMEZONE');
  assert.ok(i >= 0);
  const tz = ls.slice(i, ls.indexOf('END:VTIMEZONE') + 1);
  assert.ok(tz.includes('TZID:Europe/Madrid'));
  assert.ok(tz.includes('TZOFFSETFROM:+0100') && tz.includes('TZOFFSETTO:+0200')); // salto a verano (29 mar 2026 02:00 local)
  assert.ok(tz.includes('DTSTART:20260329T020000'));
  assert.ok(tz.includes('DTSTART:20261025T030000')); // vuelta a invierno
  assert.ok(tz.includes('BEGIN:DAYLIGHT') && tz.includes('BEGIN:STANDARD'));
});

test('generarICS: zona sin horario de verano y zona inválida cae a Europe/Madrid', () => {
  const ev = [{ id: 'a', fecha: '2026-06-10', hora: '10:00', duracionMin: 30, titulo: 'x', grupoId: '', grupoNombre: '' }];
  assert.ok(lineas(ics(ev, { zona: 'Atlantic/Reykjavik' })).includes('DTSTART;TZID=Atlantic/Reykjavik:20260610T100000'));
  assert.ok(lineas(ics(ev, { zona: 'No/Existe' })).includes('DTSTART;TZID=Europe/Madrid:20260610T100000'));
  assert.equal(D.zonaValida('America/Argentina/Buenos_Aires'), true);
  assert.equal(D.offsetMin('Europe/Madrid', Date.UTC(2026, 6, 1)), 120);
  assert.equal(D.offsetMin('Europe/Madrid', Date.UTC(2026, 0, 1)), 60);
});

test('generarICS: VALARM opcional, evento de día completo y escapes en campos', () => {
  const evs = [
    { id: 'a', origen: 'sesion', fecha: '2026-10-20', hora: '17:30', duracionMin: 60, titulo: 'Series; 4x100, "mixtas"', grupoId: 'g1', grupoNombre: 'A, B', piscina: '25', piscinaNombre: '', calle: '2', enfoque: 'Velocidad', volumenMin: '1800', volumenMax: '2200', descripcion: 'Línea1\nLínea2' },
    { id: 'b', origen: 'sesion', fecha: '2026-10-21', hora: '', duracionMin: '', titulo: 'Día libre', grupoId: '', grupoNombre: '' },
  ];
  const sin = lineas(ics(evs));
  assert.ok(!sin.includes('BEGIN:VALARM'));
  const con = lineas(ics(evs, { alarmaMin: 30 }));
  assert.equal(con.filter((l) => l === 'BEGIN:VALARM').length, 1); // el de día completo no lleva aviso
  assert.ok(con.includes('TRIGGER:-PT30M'));
  assert.ok(con.includes('ACTION:DISPLAY'));
  assert.ok(con.includes('SUMMARY:Series\\; 4x100\\, "mixtas"'));
  assert.ok(con.includes('CATEGORIES:A\\, B'));
  assert.ok(con.includes('LOCATION:Piscina 25 m\\, Calle 2'));
  assert.ok(con.some((l) => l.startsWith('DESCRIPTION:') && l.includes('Volumen: 1800-2200 m') && l.includes('Línea1\\nLínea2')));
  assert.ok(con.includes('DTSTART;VALUE=DATE:20261021'));
  assert.ok(con.includes('DTEND;VALUE=DATE:20261022'));
});

test('generarICS: calendario vacío sigue siendo válido (sin VTIMEZONE)', () => {
  const ls = lineas(ics([]));
  assert.ok(!ls.includes('BEGIN:VTIMEZONE'));
  assert.equal(ls.at(-1), 'END:VCALENDAR');
});

test('nombreFicheroICS: sin tildes ni caracteres raros', () => {
  assert.equal(D.nombreFicheroICS('Club Natación Lugones', '2026-10'), 'club-natacion-lugones-2026-10.ics');
  assert.equal(D.nombreFicheroICS('', ''), 'calendario.ics');
});

// ---------- Google / sincronización ----------
const evGoogle = { id: 'ses-e1', fecha: '2026-10-20', hora: '17:30', duracionMin: 60, titulo: 'T', grupoId: 'g1', grupoNombre: 'Promoción', piscina: '25', calle: '', enfoque: '', volumenMin: '', volumenMax: '', descripcion: '' };

test('aEventoGoogle: dateTime con zona, recordatorio y marca cnlId/cnlClub', () => {
  const b = D.aEventoGoogle(evGoogle, { zona: 'Europe/Madrid', alarmaMin: 60, clubId: 'club1' });
  assert.deepEqual(b.start, { dateTime: '2026-10-20T17:30:00', timeZone: 'Europe/Madrid' });
  assert.deepEqual(b.end, { dateTime: '2026-10-20T18:30:00', timeZone: 'Europe/Madrid' });
  assert.deepEqual(b.reminders, { useDefault: false, overrides: [{ method: 'popup', minutes: 60 }] });
  assert.deepEqual(b.extendedProperties.private, { cnlId: 'ses-e1', cnlClub: 'club1' });
  assert.deepEqual(D.aEventoGoogle({ ...evGoogle, hora: '' }).start, { date: '2026-10-20' });
  assert.deepEqual(D.aEventoGoogle(evGoogle, {}).reminders.overrides, []);
});

test('diffSync: crea, actualiza, borra futuros y conserva lo pasado', () => {
  const mk = (id, fecha, titulo) => ({ id, fecha, cuerpo: D.aEventoGoogle({ ...evGoogle, id, fecha, titulo }, { clubId: 'c' }) });
  const nuevo = mk('n', '2026-10-25', 'N');
  const igual = mk('i', '2026-10-26', 'I');
  const cambia = mk('c', '2026-10-27', 'C2');
  const antes = D.aEventoGoogle({ ...evGoogle, id: 'c', fecha: '2026-10-27', titulo: 'C1' }, { clubId: 'c' });
  const mapa = {
    i: { gid: 'gi', huella: D.huella(igual.cuerpo), fecha: igual.fecha },
    c: { gid: 'gc', huella: D.huella(antes), fecha: cambia.fecha },
    borrar: { gid: 'gb', huella: 'x', fecha: '2026-10-30' },
    pasado: { gid: 'gp', huella: 'x', fecha: '2026-09-01' },
  };
  const d = D.diffSync([nuevo, igual, cambia], mapa, '2026-10-15');
  assert.deepEqual(d.crear.map((x) => x.id), ['n']);
  assert.deepEqual(d.actualizar.map((x) => [x.id, x.gid]), [['c', 'gc']]);
  assert.deepEqual(d.borrar.map((x) => x.gid), ['gb']); // 'pasado' queda intacto
  assert.equal(d.iguales, 1);
  // idempotente: con el mapa resultante no hay nada que hacer
  const mapa2 = { n: { gid: 'gn', huella: D.huella(nuevo.cuerpo), fecha: nuevo.fecha }, i: mapa.i, c: { gid: 'gc', huella: D.huella(cambia.cuerpo), fecha: cambia.fecha } };
  const d2 = D.diffSync([nuevo, igual, cambia], mapa2, '2026-10-15');
  assert.equal(d2.crear.length + d2.actualizar.length + d2.borrar.length, 0);
});
