import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const S = await importApp('js/schema.js');

test('SHEETS contiene todas las hojas del contrato con id', () => {
  const esperadas = ['Club', 'Usuarios', 'Nadadores', 'Grupos', 'Entrenamientos', 'Asistencia', 'Cargas', 'Marcas', 'Comunicaciones', 'ObjetivosCarga', 'Banador'];
  assert.deepEqual(Object.keys(S.SHEETS).sort(), esperadas.sort());
  for (const s of S.ENTITY_SHEETS) assert.equal(S.SHEETS[s][0], 'id', s);
  assert.deepEqual(S.SHEETS.Club, ['clave', 'valor']);
  assert.ok(!S.ENTITY_SHEETS.includes('Club'));
});

test('columnas clave de cada hoja', () => {
  assert.ok(S.SHEETS.Cargas.includes('tipo'));
  assert.ok(S.SHEETS.Entrenamientos.includes('volumenMax'));
  assert.deepEqual(S.SHEETS.Marcas, ['id', 'nadadorId', 'fecha', 'prueba', 'piscina', 'tiempoMs', 'competicion', 'notas']);
});

test('CATEGORIAS en orden y ROLES', () => {
  assert.deepEqual(S.CATEGORIAS, ['Prebenjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Máster']);
  assert.deepEqual(S.ROLES, ['admin', 'entrenador', 'nadador']);
});

test('newId devuelve strings únicos', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(S.newId());
  assert.equal(ids.size, 5000);
  assert.equal(typeof S.newId(), 'string');
});
