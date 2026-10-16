import test from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../../js/domain/banadores.js';

const fila = (o) => D.normalizarBanador({ id: 'x', tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon Core FX', activo: 'true', ...o });
const codigos = (errs) => errs.map((e) => `${e.campo}:${e.codigo}`);

const BANADORES = [
  fila({ id: 'b1', tipo: 'entrenamiento', marca: 'Speedo', modelo: 'Endurance+' }),
  fila({ id: 'b2', tipo: 'entrenamiento', marca: 'Arena', modelo: 'Solid' }),
  fila({ id: 'b3', tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon Core FX' }),
  fila({ id: 'b4', tipo: 'competicion', marca: 'Speedo', modelo: 'Fastskin LZR Pure Intent' }),
  fila({ id: 'b5', tipo: 'competicion', marca: 'Mizuno', modelo: 'GX Sonic V', activo: 'false' }),
];
const marca = (id, banadorId) => ({ id, nadadorId: 'n1', banadorId });
const MARCAS = [marca('m1', 'b1'), marca('m2', 'b1'), marca('m3', 'b3'), marca('m4', 'b3'), marca('m5', 'b3'), marca('m6', 'b4'), marca('m7', ''), marca('m8', 'borrado'), { id: 'm9', nadadorId: 'n1' }];
const ids = (l) => l.map((m) => m.id);

test('TIPOS_BANADOR: neutral Spanish stored values', () => {
  assert.deepEqual([...D.TIPOS_BANADOR], ['entrenamiento', 'competicion']);
});

test('normalizarBanador / filaBanador: types, trimming, active flag round trip', () => {
  const b = D.normalizarBanador({ id: 7, tipo: ' Competición ', marca: '  Arena  ', modelo: 'Powerskin   Carbon', activo: '', notas: ' x ' });
  assert.deepEqual(b, { id: '7', tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon', activo: true, notas: 'x' });
  assert.equal(D.normalizarBanador({ tipo: 'otro' }).tipo, '');
  assert.equal(D.normalizarBanador({ activo: 'false' }).activo, false);
  assert.deepEqual(D.filaBanador({ ...b, activo: false }), { id: '7', tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon', activo: 'false', notas: 'x' });
});

test('validarBanador: competition suit needs brand and model, training suit does not', () => {
  assert.deepEqual(codigos(D.validarBanador({ tipo: 'competicion', marca: '', modelo: '' })), ['marca:marca-vacia', 'modelo:modelo-vacio']);
  assert.deepEqual(codigos(D.validarBanador({ tipo: 'competicion', marca: 'Arena', modelo: '' })), ['modelo:modelo-vacio']);
  assert.deepEqual(D.validarBanador({ tipo: 'competicion', marca: 'Arena', modelo: 'X' }), []);
  assert.deepEqual(D.validarBanador({ tipo: 'entrenamiento', marca: '', modelo: '' }), [], 'generic training suit');
  assert.deepEqual(D.validarBanador({ tipo: 'entrenamiento', marca: 'Arena', modelo: '' }), []);
  assert.deepEqual(codigos(D.validarBanador({ tipo: '', marca: 'Arena', modelo: 'X' })), ['tipo:tipo-invalido']);
  assert.deepEqual(codigos(D.validarBanador({ tipo: 'entrenamiento', marca: 'a'.repeat(41), modelo: 'b'.repeat(61), notas: 'n'.repeat(241) })),
    ['marca:marca-larga', 'modelo:modelo-largo', 'notas:notas-largas']);
});

test('validarBanador: (type, brand, model) is unique ignoring accents, case and spaces; the suit being edited is excluded', () => {
  const dup = { tipo: 'competicion', marca: ' ARENA ', modelo: 'powerskin  carbon core fx' };
  assert.deepEqual(codigos(D.validarBanador(dup, BANADORES)), ['modelo:duplicado']);
  assert.deepEqual(D.validarBanador(dup, BANADORES, { id: 'b3' }), [], 'editing itself');
  assert.deepEqual(D.validarBanador({ ...dup, tipo: 'entrenamiento' }, BANADORES), [], 'same text but another type is a different suit');
  assert.deepEqual(codigos(D.validarBanador({ tipo: 'competicion', marca: 'Mizuno', modelo: 'GX Sónic V' }, BANADORES)), ['modelo:duplicado'], 'accent-insensitive');
  const generico = [fila({ id: 'g', tipo: 'entrenamiento', marca: '', modelo: '' })];
  assert.deepEqual(codigos(D.validarBanador({ tipo: 'entrenamiento', marca: '', modelo: '' }, generico)), ['marca:duplicado']);
});

test('etiquetaBanador: "brand model — type" with default or translated type words', () => {
  assert.equal(D.etiquetaBanador(BANADORES[2]), 'Arena Powerskin Carbon Core FX — fast skin');
  assert.equal(D.etiquetaBanador(BANADORES[0]), 'Speedo Endurance+ — training');
  assert.equal(D.etiquetaBanador(BANADORES[2], { entrenamiento: 'allenamento', competicion: 'costume tecnico' }), 'Arena Powerskin Carbon Core FX — costume tecnico');
  assert.equal(D.etiquetaBanador(fila({ tipo: 'entrenamiento', marca: '', modelo: '' })), 'training');
  assert.equal(D.etiquetaBanador(fila({ tipo: 'entrenamiento', marca: 'Arena', modelo: '' })), 'Arena — training');
  assert.equal(D.etiquetaBanador(null), '');
});

test('ordenarBanadores / agruparBanadores: by type, active first, then brand and model', () => {
  const g = D.agruparBanadores(BANADORES);
  assert.deepEqual(g.map((x) => x.tipo), ['entrenamiento', 'competicion']);
  assert.deepEqual(ids(g[0].banadores), ['b2', 'b1']);
  assert.deepEqual(ids(g[1].banadores), ['b3', 'b4', 'b5'], 'inactive last');
  assert.deepEqual(D.agruparBanadores([]).map((x) => x.banadores.length), [0, 0], 'both groups even if empty');
  assert.deepEqual(ids(D.disponiblesParaMarca(BANADORES)), ['b2', 'b1', 'b3', 'b4']);
  assert.deepEqual(ids(D.disponiblesParaMarca(BANADORES, 'b5')), ['b2', 'b1', 'b3', 'b4', 'b5'], 'the suit the mark already has stays offered');
});

test('banadorDeMarca / marcasDeBanador / conteo: dangling ids count as no suit', () => {
  assert.equal(D.banadorDeMarca(MARCAS[2], BANADORES).id, 'b3');
  assert.equal(D.banadorDeMarca(MARCAS[7], BANADORES), null, 'deleted suit');
  assert.equal(D.banadorDeMarca(MARCAS[8], BANADORES), null, 'no column');
  assert.deepEqual(ids(D.marcasDeBanador(MARCAS, 'b3')), ['m3', 'm4', 'm5']);
  assert.deepEqual([...D.conteoMarcasPorBanador(BANADORES, MARCAS)], [['b1', 2], ['b2', 0], ['b3', 3], ['b4', 1], ['b5', 0]]);
});

test('filtrarMarcasPorBanador: type, brand and model (accent/case-insensitive), combinable', () => {
  const f = (c) => ids(D.filtrarMarcasPorBanador(MARCAS, BANADORES, c));
  assert.deepEqual(f({}), ids(MARCAS), 'no criteria = everything');
  assert.deepEqual(f({ tipo: 'entrenamiento' }), ['m1', 'm2']);
  assert.deepEqual(f({ tipo: 'competicion' }), ['m3', 'm4', 'm5', 'm6']);
  assert.deepEqual(f({ tipo: 'competicion', marca: 'ARENA' }), ['m3', 'm4', 'm5']);
  assert.deepEqual(f({ marca: 'speedo' }), ['m1', 'm2', 'm6'], 'brand across types');
  assert.deepEqual(f({ tipo: 'competicion', marca: 'speedo' }), ['m6']);
  assert.deepEqual(f({ modelo: 'Fastskin LZR Pure Intent' }), ['m6']);
  assert.deepEqual(f({ tipo: 'entrenamiento', marca: 'Arena', modelo: 'Solid' }), [], 'training suit used by no mark');
  assert.deepEqual(f({ tipo: D.SIN_BANADOR }), ['m7', 'm8', 'm9']);
  assert.deepEqual(f({ tipo: 'inventado' }), [], 'unknown type matches nothing');
  assert.deepEqual(f({ marca: 'Nike' }), []);
  assert.equal(D.filtrarMarcasPorBanador(MARCAS, BANADORES, {}) !== MARCAS, true, 'returns a copy');
  assert.deepEqual(D.filtrarMarcasPorBanador(null, null, { tipo: 'competicion' }), []);
});

test('opcionesFiltro: types, brands and models with mark counts, narrowed by the selection', () => {
  const o = D.opcionesFiltro(BANADORES, MARCAS);
  assert.deepEqual(o.tipos, [{ valor: 'entrenamiento', n: 2 }, { valor: 'competicion', n: 4 }]);
  assert.deepEqual(o.marcas.map((x) => [x.valor, x.etiqueta, x.n]), [['arena', 'Arena', 3], ['speedo', 'Speedo', 3]], 'Mizuno has no marks; Arena Solid has none');
  assert.deepEqual(o.modelos.map((x) => [x.etiqueta, x.marca, x.n]), [['Endurance+', 'Speedo', 2], ['Fastskin LZR Pure Intent', 'Speedo', 1], ['Powerskin Carbon Core FX', 'Arena', 3]]);
  assert.equal(o.sinBanador, 3);
  assert.equal(o.conBanador, 6);

  const comp = D.opcionesFiltro(BANADORES, MARCAS, { tipo: 'competicion' });
  assert.deepEqual(comp.marcas.map((x) => [x.etiqueta, x.n]), [['Arena', 3], ['Speedo', 1]]);
  assert.deepEqual(comp.modelos.map((x) => x.etiqueta), ['Fastskin LZR Pure Intent', 'Powerskin Carbon Core FX']);
  const arena = D.opcionesFiltro(BANADORES, MARCAS, { tipo: 'competicion', marca: 'arena' });
  assert.deepEqual(arena.modelos.map((x) => [x.etiqueta, x.n]), [['Powerskin Carbon Core FX', 3]]);

  const todo = D.opcionesFiltro(BANADORES, MARCAS, {}, { incluirVacios: true });
  assert.deepEqual(todo.marcas.map((x) => x.etiqueta), ['Arena', 'Mizuno', 'Speedo']);
  assert.equal(D.opcionesFiltro([], []).sinBanador, 0);
});

test('every option value of opcionesFiltro is accepted by filtrarMarcasPorBanador', () => {
  const o = D.opcionesFiltro(BANADORES, MARCAS);
  for (const t of o.tipos) assert.equal(D.filtrarMarcasPorBanador(MARCAS, BANADORES, { tipo: t.valor }).length, t.n);
  for (const m of o.marcas) assert.equal(D.filtrarMarcasPorBanador(MARCAS, BANADORES, { marca: m.valor }).length, m.n);
  for (const m of o.modelos) assert.equal(D.filtrarMarcasPorBanador(MARCAS, BANADORES, { modelo: m.valor }).length, m.n);
});
