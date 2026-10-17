import test from 'node:test';
import assert from 'node:assert/strict';
import { esActivo } from '../../js/domain/nadadores.js';

test('esActivo: missing or truthy values are active', () => {
  for (const activo of [undefined, null, '', 'true', 'TRUE', true, 1, 'si', 'yes'])
    assert.equal(esActivo({ activo }), true, String(activo));
});

test('esActivo: explicit false-like values (the form stores the string "false") are inactive', () => {
  for (const activo of ['false', 'FALSE', 'False', false, 0, '0', 'no', 'No', 'n', 'falso', 'inactivo', ' false '])
    assert.equal(esActivo({ activo }), false, String(activo));
});

test('esActivo: no record means not active', () => {
  assert.equal(esActivo(null), false);
  assert.equal(esActivo(undefined), false);
});
