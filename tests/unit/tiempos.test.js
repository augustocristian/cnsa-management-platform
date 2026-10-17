import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtTiempo, maskTiempo, parseTiempo, interpretarTiempo } from '../../js/domain/tiempos.js';
import {
  claveBusqueda,
  coincideBusqueda,
  nombreCompleto,
  nombreApellidosPrimero,
  ordenarPorApellidos,
} from '../../js/domain/nombres.js';
import * as ui from '../../js/presentation/ui.js';

test('fmtTiempo formats milliseconds as mm:ss.cc and rejects invalid values', () => {
  assert.equal(fmtTiempo(62450), '01:02.45');
  assert.equal(fmtTiempo(0), '00:00.00');
  assert.equal(fmtTiempo(599990), '09:59.99');
  assert.equal(fmtTiempo(-1), '');
  assert.equal(fmtTiempo('x'), '');
});

test('maskTiempo: only the digits count, the last two are hundredths and the two before are seconds', () => {
  assert.equal(maskTiempo('10245'), '1:02.45');
  assert.equal(maskTiempo('2845'), '28.45');
  assert.equal(maskTiempo('545'), '5.45');
  assert.equal(maskTiempo('28'), '28');
  assert.equal(maskTiempo('1:02.45'), '1:02.45');
  assert.equal(maskTiempo('rapidísimo'), '');
  assert.equal(maskTiempo('12345678'), '12:34.56');
});

test('parseTiempo accepts the mask, mm:ss.cc, ss.cc and comma decimals; invalid input is NaN', () => {
  assert.equal(parseTiempo('10245'), 62450);
  assert.equal(parseTiempo('1:02.45'), 62450);
  assert.equal(parseTiempo('01:02.45'), 62450);
  assert.equal(parseTiempo('62,34'), 62340);
  assert.equal(parseTiempo('2845'), 28450);
  assert.ok(Number.isNaN(parseTiempo('17550')), '75 seconds with minutes is invalid');
  assert.ok(Number.isNaN(parseTiempo(maskTiempo('17550'))), 'the masked text 1:75.50 is invalid too');
  assert.equal(parseTiempo('62.34'), 62340, 'seconds beyond 59 are fine without minutes');
  for (const mala of ['', 'abc', '1:2:3', '-5', null, undefined])
    assert.ok(Number.isNaN(parseTiempo(mala)), String(mala));
});

test('parseTiempo(fmtTiempo(ms)) round-trips and the mask output always parses', () => {
  for (const ms of [10, 28450, 62450, 125500, 599990]) assert.equal(parseTiempo(fmtTiempo(ms)), ms);
  for (const d of ['545', '2845', '10245', '102345']) assert.equal(parseTiempo(maskTiempo(d)), parseTiempo(d));
});

test('ui.js re-exports the ONE implementation', () => {
  assert.equal(ui.fmtTime, fmtTiempo);
  assert.equal(ui.maskTime, maskTiempo);
  assert.equal(ui.parseTime, parseTiempo);
});

test('interpretarTiempo gives live feedback', () => {
  assert.deepEqual(interpretarTiempo(''), { estado: 'vacio', ms: NaN, texto: '' });
  assert.equal(interpretarTiempo('1:02.45').texto, '01:02.45');
  assert.equal(interpretarTiempo('10245').ms, 62450);
  assert.equal(interpretarTiempo('17550').estado, 'error');
});

test('nombres: search key ignores accents, case and extra spaces; every word must match', () => {
  assert.equal(claveBusqueda('  Lucía  FERNÁNDEZ '), 'lucia fernandez');
  assert.ok(coincideBusqueda('Lucía Fernández Roces', 'lucia roces'));
  assert.ok(coincideBusqueda('Lucía Fernández Roces', ''));
  assert.ok(!coincideBusqueda('Lucía Fernández Roces', 'noa'));
  assert.equal(nombreCompleto({ nombre: 'Noa', apellidos: 'Díaz Llano' }), 'Noa Díaz Llano');
  assert.equal(nombreApellidosPrimero({ nombre: 'Noa', apellidos: 'Díaz Llano' }), 'Díaz Llano, Noa');
  assert.deepEqual(
    ordenarPorApellidos([
      { nombre: 'B', apellidos: 'Zeta' },
      { nombre: 'A', apellidos: 'Álvarez' },
    ]).map((n) => n.apellidos),
    ['Álvarez', 'Zeta'],
  );
});
