// Unread-notices counter: pure rules + the service with injected ports (no browser storage, no real clock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aIso, desdeIso, contarNoLeidos } from '../../js/domain/avisos.js';
import { crearAvisosService } from '../../js/application/avisosService.js';

const AHORA = new Date(2026, 9, 14, 10, 30); // Wed 14 Oct 2026

test('aIso/desdeIso: local dates and the 7-day window', () => {
  assert.equal(aIso(AHORA), '2026-10-14');
  assert.equal(desdeIso(AHORA), '2026-10-07');
  assert.equal(desdeIso(AHORA, 14), '2026-09-30');
  assert.equal(desdeIso(new Date(2026, 0, 3)), '2025-12-27'); // across a year boundary
});

test('contarNoLeidos: window and last-seen marker', () => {
  const lista = [
    { fecha: '2026-10-14' },
    { fecha: '2026-10-10' },
    { fecha: '2026-10-07' },
    { fecha: '2026-10-06' },
    { fecha: '' },
    null,
  ];
  assert.equal(contarNoLeidos(lista, { desde: '2026-10-07' }), 3);
  assert.equal(contarNoLeidos(lista, { desde: '2026-10-07', visto: '2026-10-10' }), 1);
  assert.equal(contarNoLeidos(lista, { desde: '2026-10-07', visto: '2026-10-14' }), 0);
  assert.equal(contarNoLeidos(undefined, { desde: '2026-10-07' }), 0);
});

test('service: counts, marks as seen and never throws', () => {
  let visto = null;
  let filas = [{ fecha: '2026-10-13' }, { fecha: '2026-10-01' }];
  const s = crearAvisosService({
    listar: () => filas,
    ahora: () => AHORA,
    visto: {
      leer: () => visto,
      escribir: (d) => {
        visto = d;
      },
    },
  });
  assert.equal(s.contarNoLeidos(), 1);
  s.marcarVistos();
  assert.equal(visto, '2026-10-14');
  assert.equal(s.contarNoLeidos(), 0);
  filas = [{ fecha: '2026-10-15' }]; // written afterwards
  assert.equal(s.contarNoLeidos(), 1);

  const roto = crearAvisosService({
    listar: () => {
      throw new Error('boom');
    },
    ahora: () => AHORA,
    visto: {
      leer: () => {
        throw new Error('x');
      },
      escribir: () => {
        throw new Error('y');
      },
    },
  });
  assert.equal(roto.contarNoLeidos(), 0);
  assert.doesNotThrow(() => roto.marcarVistos());
});

test('service: works without a marker port', () => {
  const s = crearAvisosService({ listar: () => [{ fecha: '2026-10-14' }], ahora: () => AHORA });
  assert.equal(s.contarNoLeidos(), 1);
  assert.doesNotThrow(() => s.marcarVistos());
});
