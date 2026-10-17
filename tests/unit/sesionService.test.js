// Connection/session use cases with injected ports: deciding the start screen, resolving the club, reconnecting,
// leaving the demo and disconnecting Drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearSesionService } from '../../js/application/sesionService.js';

const CLAVES = { clubes: 'clubes', ultimoClub: 'ultimoClub' };
const sinLog = { warn() {} };

function entorno({ conectado = true, enabled = true, demo = false, clubes = [], listError = null, ultimo = null, forzar = false, pendiente = false, soloLectura = false, modo = 'drive', syncLento = false } = {}) {
  const log = [];
  const valores = new Map([[CLAVES.ultimoClub, ultimo]]);
  const estado = { forzar, demo, falla: false };
  const auth = {
    enabled, isConnected: () => conectado,
    connect: async ({ interactive }) => { log.push('connect:' + interactive); if (estado.falla) throw new Error('denied'); },
    disconnect: () => log.push('disconnect'),
  };
  const drive = {
    preferencias: { id: 'p' }, reset: () => log.push('drive.reset'),
    listClubs: async () => { if (listError) throw listError; return clubes; },
  };
  const prefs = {
    conectar: async (o) => { log.push('prefs.conectar:' + JSON.stringify(Object.keys(o))); },
    get: (k, def) => (valores.has(k) && valores.get(k) != null ? valores.get(k) : def), set: (k, v) => valores.set(k, v),
    flush: async () => log.push('prefs.flush'), desconectar: () => log.push('prefs.desconectar'),
  };
  const store = {
    mode: modo, clubRef: { id: 'c1' }, soloLectura, pendiente,
    sync: () => { log.push('sync'); return syncLento ? new Promise(() => {}) : Promise.resolve(); },
    cerrar: () => log.push('store.cerrar'),
  };
  const banderas = {
    selectorForzado: () => estado.forzar, limpiarSelectorForzado: () => { estado.forzar = false; },
    demoGuardada: () => estado.demo,
  };
  const svc = crearSesionService({
    auth, drive, prefs, CLAVES, store, banderas, limpiarDatosLocales: async () => log.push('limpiar'),
    espera: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5))), log: sinLog,
  });
  return { svc, log, valores, estado };
}

test('decidirArranque: drive, demo left open, config, start screen and tutorial', () => {
  assert.equal(entorno({ conectado: true }).svc.decidirArranque(), 'drive');
  assert.equal(entorno({ conectado: false, enabled: false, demo: true }).svc.decidirArranque(), 'demo');
  assert.equal(entorno({ conectado: false, enabled: false }).svc.decidirArranque(), 'config');
  assert.equal(entorno({ conectado: false, enabled: false }).svc.decidirArranque({ tutorial: true }), 'tutorial');
  assert.equal(entorno({ conectado: false }).svc.decidirArranque(), 'inicio');
  assert.equal(entorno({ conectado: false }).svc.decidirArranque({ tutorial: true }), 'tutorial');
  // an authorized Drive wins over a stale demo flag
  assert.equal(entorno({ conectado: true, demo: true }).svc.decidirArranque(), 'drive');
});

test('start mode matrix: client ID x Drive authorisation x demo flag', () => {
  const casos = [
    // conectado, enabled (Client ID), demo flag -> resolveStartMode / decidirArranque
    [false, false, false, 'start', 'config'],        // no Client ID: Configuration needed (offers the demo)
    [false, false, true, 'demo', 'demo'],            // demo left open and still allowed: straight into the demo
    [false, true, false, 'start', 'inicio'],         // Client ID set: only "Connect Google Drive"
    [false, true, true, 'demo-cerrada', 'demo-cerrada'], // a Client ID appeared while the demo was open: it is closed
    [true, true, false, 'drive', 'drive'],
    [true, true, true, 'drive', 'drive'],            // Drive wins over a stale demo flag
    [true, false, false, 'drive', 'drive'],
    [true, false, true, 'drive', 'drive'],
  ];
  for (const [conectado, enabled, demo, modo, arranque] of casos) {
    const { svc } = entorno({ conectado, enabled, demo });
    const quien = JSON.stringify({ conectado, enabled, demo });
    assert.equal(svc.resolveStartMode(), modo, 'resolveStartMode ' + quien);
    assert.equal(svc.decidirArranque(), arranque, 'decidirArranque ' + quien);
  }
  // the tutorial is still reachable before connecting, but a demo that must be closed is closed first
  assert.equal(entorno({ conectado: false, enabled: true, demo: true }).svc.decidirArranque({ tutorial: true }), 'demo-cerrada');
});

test('resolverClub: no clubs -> wizard; one club or the last one -> open; several -> picker', async () => {
  assert.deepEqual(await entorno({ clubes: [] }).svc.resolverClub(), { accion: 'crear' });
  const a = { id: 'a', name: 'A' };
  const b = { id: 'b', name: 'B' };
  assert.deepEqual(await entorno({ clubes: [a] }).svc.resolverClub(), { accion: 'abrir', ref: a });
  assert.deepEqual(await entorno({ clubes: [a, b], ultimo: 'b' }).svc.resolverClub(), { accion: 'abrir', ref: b });
  assert.deepEqual(await entorno({ clubes: [a, b], ultimo: 'zzz' }).svc.resolverClub(), { accion: 'elegir', clubes: [a, b] });
});

test('resolverClub: connects the preferences without any identity and mirrors the club list', async () => {
  const e = entorno({ clubes: [{ id: 'a', name: 'A', extra: 1 }] });
  await e.svc.resolverClub();
  assert.ok(e.log.includes('prefs.conectar:["remoto"]'), 'only the remote port is passed: ' + e.log);
  assert.deepEqual(e.valores.get(CLAVES.clubes), [{ id: 'a', name: 'A' }]);
});

test('resolverClub: the forced picker flag is consumed once', async () => {
  const a = { id: 'a', name: 'A' };
  const e = entorno({ clubes: [a], forzar: true });
  assert.deepEqual(await e.svc.resolverClub(), { accion: 'elegir', clubes: [a] });
  assert.equal(e.estado.forzar, false);
  assert.deepEqual(await e.svc.resolverClub(), { accion: 'abrir', ref: a });
});

test('resolverClub: offline or expired -> mirrored clubs; other errors -> error', async () => {
  const espejo = [{ id: 'a', name: 'A' }];
  for (const err of [Object.assign(new Error('x'), { offline: true }), Object.assign(new Error('x'), { code: 'sesion-caducada' })]) {
    const e = entorno({ listError: err });
    e.valores.set(CLAVES.clubes, espejo);
    const r = await e.svc.resolverClub();
    assert.deepEqual(r, { accion: 'abrir', ref: { id: 'a', name: 'A', unverified: true } });
  }
  const sinEspejo = await entorno({ listError: Object.assign(new Error('x'), { offline: true }) }).svc.resolverClub();
  assert.equal(sinEspejo.accion, 'error');
  const otro = await entorno({ listError: Object.assign(new Error('boom'), { code: 'limite' }) }).svc.resolverClub();
  assert.equal(otro.accion, 'error');
  assert.equal(otro.error.code, 'limite');
});

test('reconectar: interactive connect, then sync; failure is reported', async () => {
  const e = entorno();
  assert.deepEqual(await e.svc.reconectar(), { ok: true });
  assert.equal(e.log[0], 'connect:true');
  assert.ok(e.log.includes('sync') && e.log.includes('prefs.flush'));
  const f = entorno();
  f.estado.falla = true;
  const r = await f.svc.reconectar();
  assert.equal(r.ok, false);
  assert.equal(r.error.message, 'denied');
});

test('cerrarSesion: syncs, disconnects Drive and erases the local copies', async () => {
  const e = entorno();
  assert.deepEqual(await e.svc.cerrarSesion(), { salio: true });
  for (const paso of ['sync', 'prefs.desconectar', 'disconnect', 'drive.reset', 'store.cerrar', 'limpiar']) assert.ok(e.log.includes(paso), 'missing ' + paso + ': ' + e.log);
  assert.ok(e.log.indexOf('sync') < e.log.indexOf('disconnect'), 'upload before revoking');
  assert.ok(e.log.indexOf('disconnect') < e.log.indexOf('limpiar'));
});

test('cerrarSesion: unsynced changes ask first; cancelling keeps everything', async () => {
  const e = entorno({ pendiente: true });
  let preguntas = 0;
  assert.deepEqual(await e.svc.cerrarSesion({ preguntarPendientes: async () => { preguntas++; return 'cancelar'; } }), { salio: false });
  assert.equal(preguntas, 1);
  assert.ok(!e.log.includes('disconnect') && !e.log.includes('limpiar'));
  // no handler = cancel (never discards silently)
  assert.deepEqual(await entorno({ pendiente: true }).svc.cerrarSesion(), { salio: false });
  // discard and leave
  const d = entorno({ pendiente: true });
  assert.deepEqual(await d.svc.cerrarSesion({ preguntarPendientes: async () => 'salir' }), { salio: true });
  assert.ok(d.log.includes('disconnect') && d.log.includes('limpiar'));
});

test('cerrarSesion: a hung upload does not block leaving (deadline) and the demo never uploads', async () => {
  const lento = entorno({ syncLento: true });
  assert.deepEqual(await lento.svc.cerrarSesion(), { salio: true });
  const demo = entorno({ modo: 'demo', pendiente: true });
  assert.deepEqual(await demo.svc.cerrarSesion(), { salio: true });
  assert.ok(!demo.log.includes('sync'), 'no sync in demo mode');
});

test('resolveStartMode: drive wins over a stale demo flag; demo; start', () => {
  assert.equal(entorno({ conectado: true, demo: true }).svc.resolveStartMode(), 'drive');
  assert.equal(entorno({ conectado: false, enabled: false, demo: true }).svc.resolveStartMode(), 'demo');
  assert.equal(entorno({ conectado: false }).svc.resolveStartMode(), 'start');
});
