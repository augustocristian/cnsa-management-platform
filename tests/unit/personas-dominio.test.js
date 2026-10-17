import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarNadadores, ordenarNadadores, validarNadador, resumenAsistencia, asistenciaReciente, resumenCargas, marcasPorPrueba, puntosEvolucion, nombreLista, edadDe } from '../../js/domain/nadadores.js';
import { ordenarGrupos, miembrosActivos, sinGrupo, validarGrupo, categoriaVisible, nombreDuplicado } from '../../js/domain/grupos.js';
import { filtrarAvisos, ordenarAvisos, validarAviso, fechaRelativa, diasDesde, textoParaCopiar, nuevoAviso, TODO_EL_CLUB } from '../../js/domain/comunicaciones.js';
import { escalaLogo, esDataUrlImagen, logoVisible, normalizarIdentidad, validarIdentidad, colorParaInput, LOGO_POR_DEFECTO } from '../../js/domain/club.js';

const N = (id, nombre, apellidos, extra = {}) => ({ id, nombre, apellidos, categoria: 'Alevín', grupoId: '', activo: 'true', ...extra });

test('filtrarNadadores: inactive swimmers only appear when asked, search ignores accents and word order', () => {
  const lista = [N('1', 'Lucía', 'Fernández Roces'), N('2', 'Iker', 'Díaz', { activo: 'false' }), N('3', 'Noa', 'Pérez', { categoria: 'Infantil', grupoId: 'g2', licencia: 'AB12' })];
  assert.deepEqual(filtrarNadadores(lista).map((n) => n.id), ['1', '3']);
  assert.deepEqual(filtrarNadadores(lista, { inactivos: true }).map((n) => n.id), ['1', '2', '3']);
  assert.deepEqual(filtrarNadadores(lista, { q: 'fernandez lucia' }).map((n) => n.id), ['1']);
  assert.deepEqual(filtrarNadadores(lista, { q: 'ab12' }).map((n) => n.id), ['3']);
  assert.deepEqual(filtrarNadadores(lista, { categoria: 'Infantil' }).map((n) => n.id), ['3']);
  assert.deepEqual(filtrarNadadores(lista, { grupoId: 'g2' }).map((n) => n.id), ['3']);
});

test('ordenarNadadores: category order (Master last), then surname and name; unknown categories last', () => {
  const lista = [N('a', 'Z', 'Z', { categoria: 'Master' }), N('b', 'B', 'B', { categoria: 'Benjamín' }), N('c', 'A', 'B', { categoria: 'Benjamín' }), N('d', 'X', 'X', { categoria: '' }), N('e', 'Q', 'Q', { categoria: 'Absoluto' })];
  assert.deepEqual(ordenarNadadores(lista).map((n) => n.id), ['c', 'b', 'e', 'a', 'd']);
});

test('validarNadador: required names, email and phone formats', () => {
  assert.deepEqual(validarNadador({}).map((e) => e.codigo), ['nombre-obligatorio', 'apellidos-obligatorios']);
  assert.deepEqual(validarNadador({ nombre: 'A', apellidos: 'B', email: 'x@y' }).map((e) => e.codigo), ['email-invalido']);
  assert.deepEqual(validarNadador({ nombre: 'A', apellidos: 'B', telefono: 'abc' }).map((e) => e.codigo), ['telefono-invalido']);
  assert.deepEqual(validarNadador({ nombre: 'A', apellidos: 'B', email: 'a@b.es', telefono: '+34 985 12 34 56' }), []);
});

test('resumenAsistencia: percentage counts present and excused', () => {
  const r = resumenAsistencia([{ estado: 'presente' }, { estado: 'justificado' }, { estado: 'ausente' }, { estado: 'presente' }]);
  assert.deepEqual(r, { presentes: 2, ausentes: 1, justificados: 1, total: 4, porcentaje: 75 });
  assert.equal(resumenAsistencia([]).porcentaje, 0);
});

test('asistenciaReciente: newest session first and limited', () => {
  const regs = [{ entrenamientoId: 'a' }, { entrenamientoId: 'b' }, { entrenamientoId: 'c' }];
  const ent = [{ id: 'a', fecha: '2026-01-01' }, { id: 'b', fecha: '2026-03-01' }, { id: 'c', fecha: '2026-02-01' }];
  assert.deepEqual(asistenciaReciente(regs, ent, 2).map((r) => r.entrenamientoId), ['b', 'c']);
});

test('resumenCargas and marcasPorPrueba', () => {
  assert.deepEqual(resumenCargas([{ metros: '1000', rpe: '6' }, { metros: '500,5', rpe: '' }, { metros: 0, rpe: 8 }]), { sesiones: 3, metros: 1500.5, rpeMedio: 7 });
  assert.equal(resumenCargas([]).rpeMedio, null);
  const g = marcasPorPrueba([
    { prueba: '100 Libre', piscina: '25', fecha: '2026-02-01', tiempoMs: 70000 }, { prueba: '100 Libre', piscina: '25', fecha: '2026-01-01', tiempoMs: 72000 },
    { prueba: '50 Espalda', piscina: '', fecha: '2026-01-01', tiempoMs: 40000 }, { prueba: 'Sin tiempo', piscina: '25', tiempoMs: 0 }]);
  assert.deepEqual(g.map((x) => x.clave), ['100 Libre (25 m)', '50 Espalda (? m)']);
  assert.equal(g[0].mejor, 70000);
  assert.deepEqual(g[0].lista.map((m) => m.fecha), ['2026-01-01', '2026-02-01']);
});

test('puntosEvolucion: lowest time is highest on the chart; a single point does not divide by zero', () => {
  const { puntos, min, max } = puntosEvolucion([70, 72, 71], { ancho: 100, alto: 100, margen: 10 });
  assert.equal(min, 70);
  assert.equal(max, 72);
  assert.ok(puntos[0][1] < puntos[1][1]);
  assert.equal(puntosEvolucion([5]).puntos.length, 1);
});

test('nombreLista and edadDe', () => {
  assert.equal(nombreLista({ nombre: 'Lucía', apellidos: 'Roces' }), 'Roces, Lucía');
  assert.equal(nombreLista({ nombre: 'Lucía' }), 'Lucía');
  assert.equal(edadDe({ fechaNacimiento: '2016-10-17' }, '2026-10-16'), 9);
  assert.equal(edadDe({}, '2026-10-16'), '');
});

test('grupos: ordering, members, ungrouped, validation and redundant category badge', () => {
  const grupos = [{ id: 'g2', nombre: 'Infantil', categoria: 'Infantil' }, { id: 'g1', nombre: 'Promoción', categoria: 'Benjamín' }, { id: 'g3', nombre: 'Otros', categoria: '' }];
  assert.deepEqual(ordenarGrupos(grupos).map((g) => g.id), ['g1', 'g2', 'g3']);
  const nad = [N('1', 'A', 'Z', { grupoId: 'g1' }), N('2', 'B', 'A', { grupoId: 'g1' }), N('3', 'C', 'C', { grupoId: 'g1', activo: 'false' }), N('4', 'D', 'D'), N('5', 'E', 'E', { grupoId: 'gone' })];
  assert.deepEqual(miembrosActivos(nad, 'g1').map((n) => n.id), ['2', '1']);
  assert.deepEqual(sinGrupo(nad, grupos).map((n) => n.id), ['4', '5']);
  assert.equal(categoriaVisible(grupos[0]), '');
  assert.equal(categoriaVisible(grupos[1]), 'Benjamín');
  assert.equal(categoriaVisible(grupos[2]), '');
  assert.deepEqual(validarGrupo({ nombre: ' ' }, grupos), [{ campo: 'nombre', codigo: 'nombre-obligatorio' }]);
  assert.deepEqual(validarGrupo({ nombre: 'promocion' }, grupos).map((e) => e.codigo), ['nombre-duplicado']);
  assert.deepEqual(validarGrupo({ id: 'g1', nombre: 'Promoción' }, grupos), []);
  assert.equal(nombreDuplicado(grupos, ''), false);
});

test('comunicaciones: filter, order, validation, relative dates and copy text', () => {
  const a = [{ id: '1', fecha: '2026-10-01', grupoId: '' }, { id: '2', fecha: '2026-10-05', grupoId: 'g1' }, { id: '3', fecha: '2026-10-05', grupoId: '' }];
  assert.deepEqual(filtrarAvisos(a, TODO_EL_CLUB).map((x) => x.id), ['1', '3']);
  assert.deepEqual(filtrarAvisos(a, 'g1').map((x) => x.id), ['2']);
  assert.equal(filtrarAvisos(a, '').length, 3);
  assert.deepEqual(ordenarAvisos(a).map((x) => x.id), ['3', '2', '1']);
  assert.deepEqual(validarAviso({ titulo: ' ', texto: 'x' }).map((e) => e.campo), ['titulo']);
  assert.deepEqual(validarAviso({}).map((e) => e.campo), ['titulo', 'texto']);
  const hoy = '2026-10-16';
  assert.deepEqual(fechaRelativa('2026-10-16', hoy), { tipo: 'hoy', n: 0 });
  assert.deepEqual(fechaRelativa('2026-10-15', hoy), { tipo: 'ayer', n: 1 });
  assert.deepEqual(fechaRelativa('2026-10-12', hoy), { tipo: 'dias', n: 4 });
  assert.equal(fechaRelativa('2026-10-01', hoy).tipo, 'fecha');
  assert.equal(fechaRelativa('2026-10-20', hoy).tipo, 'fecha', 'future dates are not relative');
  assert.equal(fechaRelativa('', hoy).tipo, 'fecha');
  assert.equal(diasDesde('2026-02-28', '2026-03-01'), 1);
  assert.equal(textoParaCopiar({ titulo: 'T', texto: 'X' }), 'T\n\nX');
  assert.deepEqual(nuevoAviso({ titulo: ' T ', texto: ' X ' }, { hoyIso: hoy }), { fecha: hoy, titulo: 'T', texto: 'X', grupoId: '', autor: '' });
});

test('club identity: logo scaling, data URLs, colours and validation', () => {
  assert.deepEqual(escalaLogo(512, 256), { ancho: 256, alto: 128 });
  assert.deepEqual(escalaLogo(100, 50), { ancho: 100, alto: 50 });
  assert.equal(esDataUrlImagen('data:image/png;base64,AAA'), true);
  assert.equal(esDataUrlImagen('javascript:alert(1)'), false);
  assert.equal(logoVisible(''), LOGO_POR_DEFECTO);
  assert.equal(logoVisible('data:image/png;base64,AAA'), 'data:image/png;base64,AAA');
  assert.equal(colorParaInput('#ABC', '#000000'), '#aabbcc');
  assert.equal(colorParaInput('red; background:url(x)', '#123456'), '#123456');
  const n = normalizarIdentidad({ nombre: ' Club ', lema: ' ', logo: 'http://x/y.png', colorPrimario: 'nope', colorSecundario: '#112233' });
  assert.deepEqual([n.nombre, n.lema, n.logo, n.colorSecundario], ['Club', '', '', '#112233']);
  assert.match(n.colorPrimario, /^#[0-9a-f]{6}$/);
  assert.deepEqual(validarIdentidad({ nombre: '  ' }), [{ campo: 'nombre', codigo: 'nombre-obligatorio' }]);
  assert.deepEqual(validarIdentidad({ nombre: 'x' }), []);
});
