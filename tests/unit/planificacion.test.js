import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const D = await importApp('js/domain/planificacion.js');
const { crearPlanificacionService } = await importApp('js/application/planificacionService.js');
const es = (await importApp('js/locales/planificacion.es.js')).default;
const en = (await importApp('js/locales/planificacion.en.js')).default;
const it = (await importApp('js/locales/planificacion.it.js')).default;

const piscina = (o = {}) => ({ id: 'p1', nombre: 'Lugones', longitudM: 25, numCalles: 6, intervaloMin: 30, maxPorCalle: 8, horario: D.horarioPorDefecto(), ...o });
const grupos = [
  { id: 'g1', nombre: 'Promoción', entrenador: 'Ana' },
  { id: 'g2', nombre: 'Alevín', entrenador: 'Bruno' },
  { id: 'g3', nombre: 'Infantil', entrenador: 'Ana' },
];
const nad = (grupoId, n, activo = 'true') => Array.from({ length: n }, (_, i) => ({ id: grupoId + i, grupoId, activo }));
const asig = (o) => ({ id: 'a' + Math.random().toString(36).slice(2, 7), piscinaId: 'p1', dia: 1, fecha: '', horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 2, grupoId: 'g1', entrenadorId: 'Ana', notas: '', ...o });
const datos = (asignaciones, extra = {}) => ({ piscinas: [piscina()], asignaciones, grupos, nadadores: [], ...extra });
const tipos = (cs) => cs.map((c) => c.tipo).sort();
const sin = (cs, ...t) => cs.filter((c) => !t.includes(c.tipo));

test('aMin/deMin: horas válidas, bordes y fracciones de día', () => {
  assert.equal(D.aMin('00:00'), 0);
  assert.equal(D.aMin('7:05'), 425);
  assert.equal(D.aMin('24:00'), 1440);
  assert.ok(Number.isNaN(D.aMin('24:01')));
  assert.ok(Number.isNaN(D.aMin('12:60')));
  assert.ok(Number.isNaN(D.aMin('')));
  assert.ok(Number.isNaN(D.aMin('abc')));
  assert.equal(D.aMin('08:30:00'), 510);
  assert.equal(D.aMin(0.5), 720);
  assert.equal(D.deMin(425), '07:05');
});

test('fechas: día de la semana, lunes y suma de días', () => {
  assert.equal(D.diaDeFecha('2026-10-12'), 1); // lunes
  assert.equal(D.diaDeFecha('2026-10-18'), 7);
  assert.ok(Number.isNaN(D.diaDeFecha('2026-02-31')));
  assert.equal(D.lunesDe('2026-10-15'), '2026-10-12');
  assert.equal(D.lunesDe('2026-10-18'), '2026-10-12');
  assert.equal(D.sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(D.fechaDeDia('2026-10-12', 3), '2026-10-14');
});

test('parseHorario tolera JSON roto y objetos; stringify es estable', () => {
  assert.deepEqual(D.parseHorario('no json'), D.horarioPorDefecto());
  assert.deepEqual(D.parseHorario(''), D.horarioPorDefecto());
  const h = D.parseHorario('{"1":{"abre":"08:00","cierra":"20:00"},"2":null}');
  assert.deepEqual(h[1], { abre: '08:00', cierra: '20:00' });
  assert.equal(h[2], null);
  assert.equal(h[3], null);
  assert.deepEqual(D.parseHorario(D.stringifyHorario(h)), h);
});

test('validarPiscina: todos los errores', () => {
  assert.deepEqual(D.validarPiscina(piscina()), []);
  assert.ok(D.validarPiscina(piscina({ nombre: ' ' })).includes('nombre-vacio'));
  assert.ok(D.validarPiscina(piscina({ longitudM: 33 })).includes('longitud'));
  assert.ok(D.validarPiscina(piscina({ numCalles: 0 })).includes('calles'));
  assert.ok(D.validarPiscina(piscina({ numCalles: 21 })).includes('calles'));
  assert.ok(D.validarPiscina(piscina({ intervaloMin: 20 })).includes('intervalo'));
  assert.ok(D.validarPiscina(piscina({ maxPorCalle: 0 })).includes('max-por-calle'));
  assert.ok(D.validarPiscina(piscina({ horario: { 1: { abre: '10:00', cierra: '09:00' } } })).includes('horario'));
  assert.ok(D.validarPiscina(piscina({ horario: {} })).includes('sin-dias'));
});

test('solape de horas: [ini, fin) permite asignaciones consecutivas', () => {
  assert.equal(D.solapan(60, 120, 120, 180), false);
  assert.equal(D.solapan(60, 121, 120, 180), true);
  assert.equal(D.solapan(60, 180, 90, 100), true);
});

test('calle solapada: error; calles contiguas o horas consecutivas no', () => {
  const a = asig({ id: 'a', calleDesde: 1, calleHasta: 3, grupoId: 'g1', entrenadorId: 'Ana' });
  const b = asig({ id: 'b', calleDesde: 3, calleHasta: 4, grupoId: 'g2', entrenadorId: 'Bruno', horaInicio: '17:30', horaFin: '18:30' });
  const c = detect([a, b]);
  assert.deepEqual(tipos(c), ['calle-solapada']);
  assert.equal(c[0].severidad, 'error');
  assert.deepEqual(c[0].params.desde, 3);
  assert.deepEqual(c[0].params.hasta, 3);
  assert.deepEqual(c[0].asignaciones.sort(), ['a', 'b']);
  assert.deepEqual(detect([a, { ...b, calleDesde: 4, calleHasta: 5 }]), []);
  assert.deepEqual(detect([a, { ...b, horaInicio: '18:00', horaFin: '19:00' }]), []);
  assert.deepEqual(detect([a, { ...b, dia: 2 }]), []);
});
function detect(as, extra, opts) { return D.detectarConflictos(datos(as, extra), opts); }

test('misma calle en otra piscina no choca, pero sí el mismo grupo/entrenador', () => {
  const ps = [piscina(), piscina({ id: 'p2', nombre: 'Otra' })];
  const a = asig({ id: 'a' });
  const b = asig({ id: 'b', piscinaId: 'p2' });
  const c = detect([a, b], { piscinas: ps });
  assert.deepEqual(tipos(c), ['entrenador-doble', 'grupo-doble']);
});

test('grupo en dos sitios a la vez: error', () => {
  const c = detect([asig({ id: 'a', calleDesde: 1, calleHasta: 1 }), asig({ id: 'b', calleDesde: 4, calleHasta: 4, entrenadorId: 'Bruno' })]);
  assert.deepEqual(tipos(c), ['grupo-doble']);
});

test('mismo entrenador a la vez (sin distinguir mayúsculas): error', () => {
  const c = detect([asig({ id: 'a', calleDesde: 1, calleHasta: 1 }), asig({ id: 'b', calleDesde: 4, calleHasta: 4, grupoId: 'g2', entrenadorId: ' ana ' })]);
  assert.deepEqual(tipos(c), ['entrenador-doble']);
  assert.equal(c[0].params.entrenador, 'Ana');
});

test('entrenador vacío en dos asignaciones no cuenta como entrenador-doble', () => {
  const c = detect([asig({ id: 'a', entrenadorId: '' }), asig({ id: 'b', calleDesde: 4, calleHasta: 4, grupoId: 'g2', entrenadorId: '' })]);
  assert.deepEqual(tipos(c), ['sin-entrenador', 'sin-entrenador']);
});

test('calle fuera de rango: más allá de numCalles, cero, invertida y no numérica', () => {
  for (const [d, h] of [[5, 7], [0, 2], [3, 2], ['x', 'y']]) {
    const c = detect([asig({ id: 'a', calleDesde: d, calleHasta: h })]);
    assert.deepEqual(tipos(c), ['calle-fuera-rango'], `${d}-${h}`);
  }
  assert.deepEqual(detect([asig({ calleDesde: 6, calleHasta: 6 })]), []); // la última calle es válida
  assert.deepEqual(detect([asig({ calleDesde: 1, calleHasta: 6 })]), []);
});

test('horario de apertura: bordes exactos válidos, fuera y día cerrado erróneos', () => {
  assert.deepEqual(detect([asig({ horaInicio: '07:00', horaFin: '08:00' })]), []);
  assert.deepEqual(detect([asig({ horaInicio: '21:00', horaFin: '22:00' })]), []);
  assert.deepEqual(tipos(detect([asig({ horaInicio: '06:30', horaFin: '08:00' })])), ['fuera-horario']);
  assert.deepEqual(tipos(detect([asig({ horaInicio: '21:30', horaFin: '22:30' })])), ['fuera-horario']);
  const dom = detect([asig({ dia: 7 })]);
  assert.deepEqual(tipos(dom), ['fuera-horario']);
  assert.equal(dom[0].params.cerrado, true);
});

test('hora de fin <= inicio y horas ilegibles: hora-invalida (sin duplicar fuera-horario)', () => {
  for (const [i, f] of [['18:00', '18:00'], ['18:00', '17:00'], ['', '18:00'], ['17:00', '25:00']]) {
    assert.deepEqual(tipos(detect([asig({ horaInicio: i, horaFin: f })])), ['hora-invalida'], `${i}-${f}`);
  }
});

test('día inválido y piscina inexistente', () => {
  assert.ok(tipos(detect([asig({ dia: 9 })])).includes('dia-invalido'));
  assert.ok(tipos(detect([asig({ dia: '' })])).includes('dia-invalido'));
  assert.deepEqual(tipos(detect([asig({ piscinaId: 'zz' })])), ['piscina-inexistente']);
});

test('capacidad por calle: aviso solo si se supera el máximo; usa nadadores activos', () => {
  const dos = (n, extra = {}) => detect([asig({ calleDesde: 1, calleHasta: 2 })], { nadadores: nad('g1', n), ...extra });
  assert.deepEqual(dos(16), []); // 8 por calle = máximo
  const c = dos(17);
  assert.deepEqual(tipos(c), ['capacidad']);
  assert.equal(c[0].severidad, 'aviso');
  assert.equal(c[0].params.nadadores, 17);
  assert.equal(c[0].params.calles, 2);
  assert.equal(c[0].params.max, 8);
  // inactivos no cuentan
  assert.deepEqual(detect([asig({})], { nadadores: [...nad('g1', 16), ...nad('g1', 5, 'false').map((x) => ({ ...x, id: x.id + 'i' }))] }), []);
  // maxPorCalle configurable
  assert.deepEqual(tipos(detect([asig({})], { piscinas: [piscina({ maxPorCalle: 3 })], nadadores: nad('g1', 7) })), ['capacidad']);
});

test('asignación sin entrenador: aviso; sin grupo: error; grupo inexistente: aviso', () => {
  const c = detect([asig({ entrenadorId: '' })]);
  assert.deepEqual(tipos(c), ['sin-entrenador']);
  assert.equal(c[0].severidad, 'aviso');
  assert.deepEqual(tipos(detect([asig({ grupoId: '' })])), ['sin-grupo']);
  assert.deepEqual(tipos(detect([asig({ grupoId: 'gX' })])), ['grupo-inexistente']);
});

test('excepciones puntuales: solo chocan con recurrentes del mismo día real o con la misma fecha', () => {
  const rec = asig({ id: 'r', dia: 1 });
  const lunes = asig({ id: 'x', fecha: '2026-10-12', dia: 5 }); // el día se deriva de la fecha (lunes)
  assert.deepEqual(tipos(detect([rec, lunes])), ['calle-solapada', 'entrenador-doble', 'grupo-doble']);
  const otraSemana = asig({ id: 'y', fecha: '2026-10-19' });
  assert.deepEqual(tipos(detect([lunes, otraSemana])), []);
  const mismaFecha = asig({ id: 'z', fecha: '2026-10-12' });
  assert.ok(tipos(detect([lunes, mismaFecha])).includes('calle-solapada'));
  const martes = asig({ id: 'w', fecha: '2026-10-13' });
  assert.deepEqual(detect([rec, martes]), []);
});

test('severidades y orden: errores antes que avisos y que info', () => {
  const as = [asig({ id: 'a', entrenadorId: '' }), asig({ id: 'b', grupoId: 'g2', entrenadorId: 'Bruno', horaInicio: '17:30', horaFin: '18:30' })];
  const c = detect(as, {}, { huecos: true });
  const sev = c.map((x) => x.severidad);
  assert.deepEqual(sev, [...sev].sort((x, y) => ({ error: 0, aviso: 1, info: 2 }[x] - { error: 0, aviso: 1, info: 2 }[y])));
  assert.deepEqual(D.resumenConflictos(c), { error: 1, aviso: 1, info: c.filter((x) => x.severidad === 'info').length });
  const m = D.severidadPorAsignacion(c);
  assert.equal(m.get('a'), 'error');
  assert.equal(m.get('b'), 'error');
});

test('huecos libres: se agrupan calles contiguas y respetan el intervalo mínimo', () => {
  const ps = [piscina({ numCalles: 3, horario: { 1: { abre: '08:00', cierra: '10:00' } } })];
  const h = (as) => D.detectarConflictos(datos(as, { piscinas: ps }), { huecos: true }).filter((c) => c.tipo === 'hueco-libre');
  // vacío: un hueco único para las 3 calles
  let r = h([]);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].params.desde, r[0].params.hasta, r[0].params.horaInicio, r[0].params.horaFin], [1, 3, '08:00', '10:00']);
  assert.equal(r[0].severidad, 'info');
  // una asignación en la calle 2 de 08:30 a 09:30
  r = h([asig({ calleDesde: 2, calleHasta: 2, horaInicio: '08:30', horaFin: '09:30', entrenadorId: 'Ana' })]);
  const txt = r.map((c) => `${c.params.desde}-${c.params.hasta} ${c.params.horaInicio}-${c.params.horaFin}`).sort();
  assert.deepEqual(txt, ['1-1 08:00-10:00', '2-2 08:00-08:30', '2-2 09:30-10:00', '3-3 08:00-10:00']);
  // asignación en la calle 3: las calles 1 y 2 libres comparten hueco y se agrupan
  r = h([asig({ calleDesde: 3, calleHasta: 3, horaInicio: '08:00', horaFin: '09:00' })]);
  assert.deepEqual(r.map((c) => `${c.params.desde}-${c.params.hasta} ${c.params.horaInicio}-${c.params.horaFin}`).sort(), ['1-2 08:00-10:00', '3-3 09:00-10:00']);
  // el hueco de 15 min no cuenta con intervalo 30
  r = h([asig({ calleDesde: 1, calleHasta: 3, horaInicio: '08:15', horaFin: '10:00' })]);
  assert.equal(r.length, 0);
  // las puntuales no cuentan para los huecos
  assert.equal(h([asig({ fecha: '2026-10-12' })]).length, 1);
});

test('conflictosDe: evalúa una candidata frente al resto, ignorando su propia versión', () => {
  const existentes = [asig({ id: 'a', calleDesde: 1, calleHasta: 2 })];
  const cand = asig({ id: '', calleDesde: 2, calleHasta: 3, grupoId: 'g2', entrenadorId: 'Bruno' });
  const c = D.conflictosDe(cand, datos(existentes));
  assert.deepEqual(tipos(c), ['calle-solapada']);
  assert.ok(c[0].asignaciones.includes(D.ID_NUEVA));
  // editarse a sí misma no choca consigo misma
  assert.deepEqual(D.conflictosDe({ ...existentes[0] }, datos(existentes)), []);
  assert.equal(D.bloqueante(c), true);
  assert.equal(D.soloAvisos(D.conflictosDe(asig({ id: 'n', entrenadorId: '', horaInicio: '19:00', horaFin: '20:00' }), datos(existentes))), true);
});

test('rejilla: rangoDia, franjas, niveles y ocupación', () => {
  const p = piscina({ horario: { 1: { abre: '08:00', cierra: '10:00' }, 2: { abre: '09:00', cierra: '12:00' } } });
  assert.deepEqual(D.rangoDia(p, 1), { desde: 480, hasta: 600 });
  assert.deepEqual(D.rangoDia(p, 3), { desde: 480, hasta: 720 }); // día cerrado: rango global
  const fuera = D.normalizarAsignacion(asig({ horaInicio: '07:00', horaFin: '08:00' }));
  assert.deepEqual(D.rangoDia(p, 1, [fuera]), { desde: 420, hasta: 600 });
  assert.deepEqual(D.franjas(480, 600, 30), [480, 510, 540, 570]);
  const a = D.normalizarAsignacion(asig({ id: 'a', horaInicio: '08:00', horaFin: '09:00', calleDesde: 1, calleHasta: 2 }));
  const b = D.normalizarAsignacion(asig({ id: 'b', horaInicio: '08:30', horaFin: '09:30', calleDesde: 2, calleHasta: 3 }));
  const c = D.normalizarAsignacion(asig({ id: 'c', horaInicio: '09:00', horaFin: '10:00', calleDesde: 1, calleHasta: 1 }));
  const n = D.niveles([a, b, c]);
  assert.equal(n.get('a'), 0);
  assert.equal(n.get('b'), 1);
  assert.equal(n.get('c'), 0);
  const p2 = piscina({ numCalles: 2 });
  const o = D.ocupacion(p2, [D.normalizarAsignacion(asig({ calleDesde: 1, calleHasta: 1, horaInicio: '08:00', horaFin: '09:00' }))], 480, 600);
  assert.deepEqual(o, { total: 240, ocupado: 60, pct: 25 });
  // el doble solape no cuenta dos veces
  const dup = [a, D.normalizarAsignacion(asig({ id: 'a2', horaInicio: '08:00', horaFin: '09:00', calleDesde: 1, calleHasta: 2 }))];
  assert.equal(D.ocupacion(p2, dup, 480, 600).ocupado, 120);
  assert.equal(D.ocupacion(p2, [], NaN, 600).pct, 0);
});

test('delDia: recurrentes del día + puntuales de esa fecha', () => {
  const as = [asig({ id: 'r', dia: 3 }), asig({ id: 'p', fecha: '2026-10-14' }), asig({ id: 'q', fecha: '2026-10-21' }), asig({ id: 'o', dia: 4 }), asig({ id: 'x', piscinaId: 'p9', dia: 3 })];
  assert.deepEqual(D.delDia(as, { piscinaId: 'p1', dia: 3, fecha: '2026-10-14' }).map((a) => a.id).sort(), ['p', 'r']);
  assert.deepEqual(D.delDia(as, { piscinaId: 'p1', dia: 3 }).map((a) => a.id), ['r']);
});

test('ajustarAlReducir: recorta las que sobresalen y marca las totalmente fuera', () => {
  const as = [asig({ id: 'a', calleDesde: 1, calleHasta: 2 }), asig({ id: 'b', calleDesde: 3, calleHasta: 5 }), asig({ id: 'c', calleDesde: 5, calleHasta: 6 }), asig({ id: 'd', piscinaId: 'p2', calleDesde: 5, calleHasta: 6 })];
  const r = D.ajustarAlReducir(as, 'p1', 4);
  assert.deepEqual(r.recortadas.map((x) => [x.id, x.calleHasta]), [['b', 4]]);
  assert.deepEqual(r.fuera.map((x) => x.id), ['c']);
  assert.deepEqual(D.ajustarAlReducir(as, 'p1', 6).fuera, []);
});

test('sugerirDistribucion: reparte sin conflictos de error y es determinista', () => {
  const nadadores = [...nad('g1', 10), ...nad('g2', 20), ...nad('g3', 4)];
  const entrada = { piscina: piscina(), dia: 2, grupos, nadadores, asignaciones: [], duracionMin: 60, desde: '17:00', hasta: '20:00' };
  const r = D.sugerirDistribucion(entrada);
  assert.deepEqual(r.sinHueco, []);
  assert.equal(r.propuestas.length, 3);
  // g2 (20 nadadores / 8 = 3 calles) se coloca primero; g1 (10 -> 2 calles) y g3 (1 calle)
  assert.equal(r.propuestas[0].grupoId, 'g2');
  assert.equal(r.propuestas[0].calleHasta - r.propuestas[0].calleDesde + 1, 3);
  assert.equal(r.propuestas[0].horaInicio, '17:00');
  // g1 y g3 comparten entrenador (Ana): no pueden coincidir en el tiempo
  const [p1, p3] = [r.propuestas.find((p) => p.grupoId === 'g1'), r.propuestas.find((p) => p.grupoId === 'g3')];
  assert.ok(!D.solapan(D.aMin(p1.horaInicio), D.aMin(p1.horaFin), D.aMin(p3.horaInicio), D.aMin(p3.horaFin)));
  const todas = r.propuestas.map((p, i) => ({ ...p, id: 's' + i }));
  assert.equal(D.bloqueante(D.detectarConflictos(datos(todas, { nadadores }))), false);
  assert.deepEqual(D.sugerirDistribucion(entrada), r);
});

test('sugerirDistribucion: respeta lo existente, día cerrado, falta de hueco y preferencias', () => {
  const nadadores = [...nad('g1', 6), ...nad('g2', 6)];
  const base = { piscina: piscina({ numCalles: 2 }), dia: 1, grupos: grupos.slice(0, 2), nadadores, duracionMin: 60, desde: '17:00', hasta: '19:00' };
  // g1 ya asignado: sólo se coloca g2 (no se repite)
  const existente = asig({ id: 'e', grupoId: 'g1', calleDesde: 1, calleHasta: 1, horaInicio: '17:00', horaFin: '18:00' });
  const r = D.sugerirDistribucion({ ...base, asignaciones: [existente] });
  assert.deepEqual(r.propuestas.map((p) => p.grupoId), ['g2']);
  assert.ok(!D.bloqueante(D.conflictosDe(r.propuestas[0], datos([existente], { piscinas: [base.piscina], nadadores }))));
  // día cerrado
  assert.deepEqual(D.sugerirDistribucion({ ...base, dia: 7, asignaciones: [] }).sinHueco.map((s) => s.motivo), ['cerrado', 'cerrado']);
  // ventana de una hora, dos calles, dos grupos de entrenador distinto: caben (una calle cada uno); un tercero no
  const tres = [{ id: 'g1', nombre: 'A', entrenador: 'X' }, { id: 'g2', nombre: 'B', entrenador: 'Y' }, { id: 'g3', nombre: 'C', entrenador: 'Z' }];
  const apretado = D.sugerirDistribucion({ ...base, grupos: tres, nadadores: [...nad('g1', 6), ...nad('g2', 6), ...nad('g3', 6)], hasta: '18:00', asignaciones: [] });
  assert.equal(apretado.propuestas.length, 2);
  assert.deepEqual(apretado.sinHueco, [{ grupoId: 'g3', motivo: 'sin-hueco' }]);
  // preferencias: g2 prefiere las 18:00
  const pref = D.sugerirDistribucion({ ...base, asignaciones: [], soloGrupos: ['g2'], preferencias: { g2: '18:00' } });
  assert.equal(pref.propuestas[0].horaInicio, '18:00');
  // sin sitio para el nº de calles recomendado: usa menos y lo señala
  const reducida = D.sugerirDistribucion({ ...base, piscina: piscina({ numCalles: 2, maxPorCalle: 1 }), grupos: [grupos[0]], nadadores: nad('g1', 5), asignaciones: [], soloGrupos: ['g1'] });
  assert.equal(reducida.propuestas[0].calleHasta - reducida.propuestas[0].calleDesde + 1, 2);
});

test('paridad i18n de planificación: mismas claves y variables en es/en/it', () => {
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [name, d] of [['en', en], ['it', it]]) {
    assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), [], 'faltan en ' + name);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), [], 'huérfanas en ' + name);
    for (const k of Object.keys(es)) assert.equal(vars(d[k]), vars(es[k]), `${name}:${k}`);
  }
  for (const d of [es, en, it]) for (const [k, v] of Object.entries(d)) assert.ok(typeof v === 'string' && v.trim(), k);
});

test('cada tipo de conflicto y error de piscina tiene mensaje traducido', () => {
  for (const tipo of Object.keys(D.TIPOS_CONFLICTO)) assert.ok(es['plan.c.' + tipo], tipo);
  assert.ok(es['plan.c.fuera-horario-cerrado']);
  for (const e of ['nombre-vacio', 'longitud', 'calles', 'intervalo', 'max-por-calle', 'horario', 'sin-dias']) assert.ok(es['plan.err.' + e], e);
  for (const s of ['error', 'aviso', 'info']) assert.ok(es['plan.sev.' + s]);
});

// ---------- Servicio con repositorio en memoria ----------
function repoMemoria() {
  const db = { Piscinas: [], AsignacionesCalle: [], Grupos: grupos.map((g) => ({ ...g })), Nadadores: [], Usuarios: [] };
  let n = 0;
  return {
    db,
    list: (s) => db[s].slice(),
    get: (s, id) => db[s].find((r) => r.id === String(id)) || null,
    upsert(s, row) {
      const r = { ...row, id: row.id ? String(row.id) : 'id' + ++n };
      const i = db[s].findIndex((x) => x.id === r.id);
      if (i >= 0) db[s][i] = r; else db[s].push(r);
      return r;
    },
    remove(s, id) { db[s] = db[s].filter((r) => r.id !== String(id)); },
  };
}

test('servicio: crea piscina, valida y persiste el horario como JSON', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  assert.deepEqual(svc.guardarPiscina({ ...piscina({ id: '' }), numCalles: 0 }).errores, ['calles']);
  const r = svc.guardarPiscina(piscina({ id: '' }));
  assert.ok(r.ok);
  assert.equal(typeof repo.db.Piscinas[0].horario, 'string');
  assert.equal(svc.piscinas()[0].horario[1].abre, '07:00');
});

test('servicio: guardar asignación bloquea errores y exige forzar los avisos', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  const base = { piscinaId: 'p1', dia: 1, horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 2, grupoId: 'g1', entrenadorId: 'Ana' };
  assert.ok(svc.guardarAsignacion(base).ok);
  const choque = svc.guardarAsignacion({ ...base, grupoId: 'g2', entrenadorId: 'Bruno', calleDesde: 2, calleHasta: 3 });
  assert.equal(choque.ok, false);
  assert.equal(choque.bloqueado, true);
  assert.equal(repo.db.AsignacionesCalle.length, 1);
  const aviso = svc.guardarAsignacion({ ...base, grupoId: 'g2', entrenadorId: '', horaInicio: '19:00', horaFin: '20:00' });
  assert.equal(aviso.ok, false);
  assert.equal(aviso.requiereForzar, true);
  assert.equal(repo.db.AsignacionesCalle.length, 1);
  const forzada = svc.guardarAsignacion({ ...base, grupoId: 'g2', entrenadorId: '', horaInicio: '19:00', horaFin: '20:00' }, { forzar: true });
  assert.ok(forzada.ok);
  assert.equal(repo.db.AsignacionesCalle.length, 2);
  // forzar nunca salta un error
  assert.equal(svc.guardarAsignacion({ ...base, horaFin: '17:00' }, { forzar: true }).ok, false);
});

test('servicio: reducir calles recorta y señala las que quedan fuera', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  const mk = (grupoId, d, h, ent, ini = '17:00', fin = '18:00') => svc.guardarAsignacion({ piscinaId: 'p1', dia: 1, horaInicio: ini, horaFin: fin, calleDesde: d, calleHasta: h, grupoId, entrenadorId: ent });
  mk('g1', 1, 2, 'Ana'); mk('g2', 3, 5, 'Bruno');
  repo.upsert('Grupos', { id: 'g9', nombre: 'Z', entrenador: 'Zoe' });
  assert.ok(mk('g9', 5, 6, 'Zoe', '18:00', '19:00').ok);
  const r = svc.guardarPiscina({ ...piscina(), numCalles: 4 });
  assert.equal(r.recortadas, 1);
  assert.equal(r.fuera, 1);
  const as = svc.asignaciones();
  assert.equal(as.find((a) => a.grupoId === 'g2').calleHasta, 4);
  assert.equal(as.find((a) => a.grupoId === 'g9').calleHasta, 6); // sigue guardada, ahora en error
  assert.ok(svc.conflictos().some((c) => c.tipo === 'calle-fuera-rango' && c.severidad === 'error'));
});

test('servicio: mover, duplicar, borrar y borrar piscina en cascada', () => {
  const repo = repoMemoria();
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  const a = svc.guardarAsignacion({ piscinaId: 'p1', dia: 1, horaInicio: '17:00', horaFin: '18:00', calleDesde: 1, calleHasta: 2, grupoId: 'g1', entrenadorId: 'Ana' }).asignacion;
  assert.ok(svc.mover(a.id, { dia: 2 }).ok);
  assert.equal(svc.asignaciones()[0].dia, 2);
  assert.equal(svc.duplicar(a.id).ok, false); // mismo hueco: choca consigo mismo
  const d = svc.duplicar(a.id, { dia: 3 });
  assert.ok(d.ok);
  assert.notEqual(d.asignacion.id, a.id);
  assert.equal(svc.mover('nope', {}).inexistente, true);
  svc.borrarAsignacion(a.id);
  assert.equal(svc.asignaciones().length, 1);
  svc.borrarPiscina('p1');
  assert.equal(svc.asignaciones().length, 0);
  assert.equal(svc.piscinas().length, 0);
});

test('servicio: sin permiso de edición no escribe (solo lectura)', () => {
  const repo = repoMemoria();
  let edita = true;
  const svc = crearPlanificacionService(repo, { puedeEditar: () => edita });
  svc.guardarPiscina(piscina());
  edita = false;
  assert.equal(svc.puedeEditar(), false);
  for (const f of [() => svc.guardarPiscina(piscina()), () => svc.guardarAsignacion({}), () => svc.borrarAsignacion('x'), () => svc.borrarPiscina('p1'), () => svc.aplicarSugerencia([])]) {
    assert.throws(f, (e) => e.code === 'sin-permiso');
  }
  assert.equal(svc.piscinas().length, 1); // la lectura sigue funcionando
});

test('servicio: sugerir y aplicar crea asignaciones sin errores; entrenadores sin duplicados', () => {
  const repo = repoMemoria();
  repo.db.Nadadores = [...nad('g1', 10), ...nad('g2', 5)];
  repo.db.Usuarios = [{ id: 'u1', rol: 'entrenador', nombre: 'ana' }, { id: 'u2', rol: 'admin', nombre: 'Jefe' }];
  const svc = crearPlanificacionService(repo);
  svc.guardarPiscina(piscina());
  assert.deepEqual(svc.entrenadores(), ['Ana', 'Bruno']);
  const r = svc.sugerir({ piscinaId: 'p1', dia: 3, soloGrupos: ['g1', 'g2'], desde: '17:00', hasta: '20:00' });
  assert.equal(r.propuestas.length, 2);
  assert.equal(svc.aplicarSugerencia(r.propuestas), 2);
  assert.equal(svc.conflictos().filter((c) => c.severidad === 'error').length, 0);
  assert.deepEqual(svc.sugerir({ piscinaId: 'nope', dia: 1 }), { propuestas: [], sinHueco: [] });
});
