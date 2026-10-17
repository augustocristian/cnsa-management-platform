// Calendar service: everything external is injected (no infrastructure, config or preferences singleton), disabled states carry a
// reason, view preferences go through a port, and the clock is mandatory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearCalendarioService } from '../../js/application/calendarioService.js';

const ahora = () => new Date(2026, 9, 16, 9, 0, 0);
const repo = (extra = {}) => {
  const db = {
    Entrenamientos: [
      { id: 'a', fecha: '2026-10-20', hora: '17:30', duracionMin: 60, grupoId: '', titulo: 'S', estado: 'planificado' },
    ],
    Grupos: [],
    Nadadores: [],
    Piscinas: [],
    AsignacionesCalle: [],
    EventosTemporada: [],
  };
  return {
    list: (h) => (db[h] || []).slice(),
    club: { nombre: 'Club X' },
    clubRef: { id: 'c1', name: 'Club X' },
    setClub() {},
    ...extra,
  };
};

test('the service imports no infrastructure, config or preferences singleton', () => {
  const src = readFileSync(new URL('../../js/application/calendarioService.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/^import .* from '(.+)';/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ['../domain/calendario.js', '../domain/temporada.js', '../domain/preferencias.js']);
});

test('the clock is mandatory', () => {
  assert.throws(() => crearCalendarioService({ store: repo() }), TypeError);
});

test('hoy() comes from the injected clock', () => {
  assert.equal(crearCalendarioService({ store: repo(), ahora }).hoy(), '2026-10-16');
});

test('sync is explained when unavailable: demo mode, no Drive connection, no client', () => {
  const base = { ahora, crearCliente: () => ({}) };
  assert.deepEqual(
    crearCalendarioService({ store: repo({ mode: 'demo' }), conectado: () => true, ...base }).puedeSincronizar(),
    { ok: false, motivo: 'demo' },
  );
  assert.deepEqual(crearCalendarioService({ store: repo(), conectado: () => false, ...base }).puedeSincronizar(), {
    ok: false,
    motivo: 'sin-conexion',
  });
  assert.deepEqual(crearCalendarioService({ store: repo(), conectado: () => true, ahora }).puedeSincronizar(), {
    ok: false,
    motivo: 'sin-cliente',
  });
  assert.deepEqual(crearCalendarioService({ store: repo(), conectado: () => true, ...base }).puedeSincronizar(), {
    ok: true,
    motivo: null,
  });
});

test('sync refuses to run in demo mode with a stable error code', async () => {
  const svc = crearCalendarioService({
    store: repo({ mode: 'demo' }),
    conectado: () => true,
    ahora,
    crearCliente: () => {
      throw new Error('must not be built');
    },
  });
  await assert.rejects(svc.sincronizar({}), (e) => e.code === 'demo');
  await assert.rejects(svc.dejarDeSincronizar({}), (e) => e.code === 'demo');
});

test('the Google client is built lazily from the injected factory with the calendar scope', async () => {
  const pedidos = [];
  let construido = 0;
  const cliente = {
    listarGestionados: async () => [],
    insertar: async (b) => ({ id: b.id }),
    actualizar: async () => {},
    borrar: async () => {},
  };
  const svc = crearCalendarioService({
    store: repo(),
    ahora,
    conectado: () => true,
    calendarScope: 'SCOPE-X',
    auth: {
      tokenForScope: async (scope, o) => {
        pedidos.push([scope, o.interactive]);
        return 'tok';
      },
    },
    crearCliente: ({ getToken }) => {
      construido++;
      cliente.getToken = getToken;
      return cliente;
    },
  });
  assert.equal(construido, 0);
  const r = await svc.sincronizar({ ventanaDias: 30 });
  assert.equal(construido, 1);
  assert.equal(r.creados, 1);
  assert.equal(await cliente.getToken({ force: false }), 'tok');
  assert.deepEqual(pedidos, [['SCOPE-X', true]]);
});

test('view preferences go through the injected port; without one they live in memory', () => {
  const guardado = {};
  const prefs = {
    get: (k, d) => (k in guardado ? guardado[k] : d),
    set: (k, v) => {
      guardado[k] = v;
    },
  };
  const svc = crearCalendarioService({ store: repo(), ahora, prefs });
  assert.deepEqual(svc.preferencias(), { vista: '', alarmaMin: 0, ventanaDias: 90 });
  svc.guardarPreferencia('vista', 'agenda');
  svc.guardarPreferencia('ventanaDias', 180);
  assert.equal(guardado['calendario.vista'], 'agenda');
  assert.equal(guardado['calendario.ventanaDias'], 180);
  assert.equal(svc.preferencias().vista, 'agenda');
  const sinPuerto = crearCalendarioService({ store: repo(), ahora });
  sinPuerto.guardarPreferencia('alarmaMin', 30);
  assert.equal(sinPuerto.preferencias().alarmaMin, 30);
  sinPuerto.guardarPreferencia('desconocida', 1); // ignored
});

test('exportar: the .ics uses the injected clock for DTSTAMP and the zone of the club', () => {
  const svc = crearCalendarioService({ store: repo(), ahora });
  const r = svc.exportar({ rango: { desde: '2026-10-01', hasta: '2026-10-31' } });
  assert.equal(r.count, 1);
  assert.match(r.ics, /DTSTAMP:20261016T0[79]0000Z/);
  assert.match(r.ics, /DTSTART;TZID=Europe\/Madrid:20261020T173000/);
});
