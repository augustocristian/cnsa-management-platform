import test from 'node:test';
import assert from 'node:assert/strict';
import { importApp } from '../helpers/env.js';

const S = await importApp('js/schema.js');

test('SHEETS contiene todas las hojas del contrato con id', () => {
  const esperadas = ['Club', 'Nadadores', 'Grupos', 'Entrenamientos', 'Asistencia', 'Cargas', 'Marcas', 'Comunicaciones', 'ObjetivosCarga', 'Banador', 'Piscinas', 'AsignacionesCalle', 'EntrenoLineas', 'TiposCarga', 'Temporadas', 'Fases', 'SemanasPlan', 'EventosTemporada'];
  assert.deepEqual(Object.keys(S.SHEETS).sort(), esperadas.sort());
  for (const s of S.ENTITY_SHEETS) assert.equal(S.SHEETS[s][0], 'id', s);
  assert.deepEqual(S.SHEETS.Club, ['clave', 'valor']);
  assert.ok(!S.ENTITY_SHEETS.includes('Club'));
});

test('columnas clave de cada hoja', () => {
  assert.ok(S.SHEETS.Cargas.includes('tipo'));
  assert.deepEqual(S.SHEETS.TiposCarga, ['id', 'nombre', 'descripcion', 'color', 'categoria', 'orden', 'activo', 'predefinido', 'minSemanalM', 'maxSemanalM', 'alias']);
  assert.equal(S.TIPOS_CARGA.length, 10, 'TIPOS_CARGA deriva del catálogo predefinido');
  assert.ok(S.SHEETS.Entrenamientos.includes('volumenMax'));
  assert.deepEqual(S.SHEETS.Marcas, ['id', 'nadadorId', 'fecha', 'prueba', 'piscina', 'tiempoMs', 'competicion', 'notas']);
});

test('CATEGORIAS en orden; ya no hay roles ni hoja de usuarios', () => {
  assert.deepEqual(S.CATEGORIAS, ['Pre-Benjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Master']);
  assert.equal(S.ROLES, undefined);
  assert.equal('Usuarios' in S.SHEETS, false);
});

test('newId devuelve strings únicos', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(S.newId());
  assert.equal(ids.size, 5000);
  assert.equal(typeof S.newId(), 'string');
});
