// Demo mode: the local storage adapter, the mode service and the store running in demo mode (never touching Drive).
import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { store } = await importApp('js/store.js');
const { drive } = await importApp('js/drive.js');
const { driveConnection } = await importApp('js/infrastructure/driveConnection.js');
const { crearDemoStorage, DEMO_PREFIX } = await importApp('js/infrastructure/demoStorage.js');
const { crearModoService, demoDisponible } = await importApp('js/application/modoService.js');
const { crearSesionService } = await importApp('js/application/sesionService.js');
const { limpiarDatosLocales } = await importApp('js/cache.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');

const CLIENT_ID = '123456-abc.apps.googleusercontent.com';
const HOY = new Date(2026, 9, 14, 10, 30); // Wednesday 14-Oct-2026
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hasta = async (fn, ms = 2000) => { const fin = Date.now() + ms; while (!fn()) { if (Date.now() > fin) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); } };

let llamadasDrive;
let restaurar = [];
let fake = null;
let demo;
let modo;
let flag;

// Every Drive method is spied: demo mode must never call any of them.
function espiarDrive() {
  llamadasDrive = [];
  for (const k of Object.keys(drive)) {
    if (typeof drive[k] !== 'function') continue;
    const orig = drive[k];
    drive[k] = (...a) => { llamadasDrive.push(k); return orig.apply(drive, a); };
    restaurar.push(() => { drive[k] = orig; });
  }
  const f = globalThis.fetch;
  globalThis.fetch = async (u) => { llamadasDrive.push('fetch ' + u); throw new Error('no network'); };
  restaurar.push(() => { globalThis.fetch = f; });
}

describe('demo mode', () => {
beforeEach(() => {
  localStorage.clear();
  store.cerrar();
  espiarDrive();
  demo = crearDemoStorage();
  flag = {
    leer: () => localStorage.getItem('cnl:mode'),
    escribir: (v) => localStorage.setItem('cnl:mode', v),
    borrar: () => localStorage.removeItem('cnl:mode'),
  };
  modo = crearModoService({ store, demo, conexion: driveConnection, bandera: flag, ahora: () => HOY });
});
afterEach(async () => {
  store.cerrar();
  restaurar.forEach((f) => f());
  restaurar = [];
  if (fake) { fake.desinstalar(); fake = null; }
});

test('adapter: isolated under cnl:demo:*, with its own document and no backups or Drive', async () => {
  assert.equal(demo.existe(), false);
  const { ref, nuevo } = demo.asegurar('Demo');
  assert.equal(nuevo, true);
  assert.equal(demo.asegurar().nuevo, false);
  const m1 = await demo.meta(ref.id);
  const w = await demo.write(ref.id, { version: 1, club: { nombre: 'X' }, hojas: {} });
  assert.ok(w.version > m1.version);
  assert.equal((await demo.read(ref.id)).doc.club.nombre, 'X');
  assert.deepEqual(await demo.listarBackups(), []);
  assert.equal((await demo.backupClub()).creado, false);
  await assert.rejects(demo.upload(), (e) => e.code === 'demo-sin-drive');
  await assert.rejects(demo.ensureFolder(), (e) => e.code === 'demo-sin-drive');
  assert.deepEqual(Object.keys(localStorage).filter((k) => !k.startsWith(DEMO_PREFIX)), []);
  assert.deepEqual(llamadasDrive, []);
  await demo.borrar();
  assert.equal(demo.existe(), false);
  assert.deepEqual(Object.keys(localStorage), []);
});

test('entering the demo: store.mode demo, sample data relative to the clock, cnl:mode flag and NO Drive call', async () => {
  assert.equal(store.mode, 'drive');
  const r = await modo.enterDemo();
  assert.equal(r.nuevo, true);
  assert.equal(store.mode, 'demo');
  assert.equal(flag.leer(), 'demo');
  assert.ok(store.list('Nadadores').length >= 10);
  assert.ok(store.list('Entrenamientos').length > 20);
  assert.equal(store.status, 'sincronizado');
  // dates are relative to the injected clock (not to the real one)
  const fechas = store.list('Entrenamientos').map((e) => e.fecha).sort();
  const lunes = new Date(HOY); lunes.setDate(HOY.getDate() - 2);
  assert.ok(fechas[0] < ymd(HOY) && fechas.at(-1) > ymd(HOY));
  assert.ok(fechas.includes(ymd(lunes)), 'there is a session on the Monday of the clock\'s week');
  assert.deepEqual(llamadasDrive, [], 'the demo never touches Drive');
  const claves = Object.keys(localStorage);
  assert.ok(claves.some((k) => k.startsWith('cnl:demo:club:')), 'local mirror of the demo');
  assert.ok(!claves.some((k) => k.startsWith('cnl:club:')), 'not mixed with the real clubs');
});

test('edits in the demo are saved locally, survive a "reload" and upload nothing', async () => {
  await modo.enterDemo();
  store.upsert('Grupos', { id: 'g-nuevo', nombre: 'Mi grupo' });
  await store.sync();
  assert.equal(store.pendiente, false);
  assert.equal(store.status, 'sincronizado');
  store.cerrar();
  const otra = await modo.enterDemo(); // "reload"
  assert.equal(otra.nuevo, false, 'it is not seeded again');
  assert.ok(store.get('Grupos', 'g-nuevo'));
  assert.deepEqual(llamadasDrive, []);
});

test('in the demo: Excel, calendar PDF and data work; copy to Drive and backups are disabled', async () => {
  await modo.enterDemo();
  await assert.rejects(store.guardarXlsxEnDrive(), (e) => e.code === 'demo-sin-drive');
  assert.deepEqual(await store.listarBackups(), []);
  const res = await store.purgarNadador(store.list('Nadadores')[0].id);
  assert.deepEqual(res.errores, [], 'deleting a swimmer in the demo does not try to touch Drive');
  assert.deepEqual(llamadasDrive, []);
});

test('leaving the demo deletes ALL the demo data and the flag, and leaves the store in drive mode', async () => {
  localStorage.setItem('cnl:lang', 'en');
  await modo.enterDemo();
  store.upsert('Grupos', { id: 'g-x', nombre: 'X' });
  assert.deepEqual(await modo.exitDemo(), { salio: true });
  assert.equal(store.mode, 'drive');
  assert.equal(store.clubRef, null);
  assert.equal(demo.existe(), false);
  assert.equal(flag.leer(), null);
  assert.deepEqual(Object.keys(localStorage), ['cnl:lang'], 'only what is not demo data remains');
  await new Promise((r) => setTimeout(r, 400)); // a late flush must not resurrect anything
  assert.deepEqual(Object.keys(localStorage), ['cnl:lang']);
});

test('connecting Drive from the demo: authorization is requested, the demo is deleted and the real club starts empty', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { sinClientId: true } });
  await driveConnection.init();
  await modo.enterDemo();
  const marcador = store.list('Nadadores').length;
  assert.ok(marcador > 0);
  assert.equal(modo.demoDisponible(), true);
  assert.equal((await modo.connectDrive({ clientId: CLIENT_ID })).modo, 'drive');
  assert.equal(driveConnection.isConnected(), true);
  assert.equal(store.mode, 'drive');
  assert.equal(demo.existe(), false);
  assert.equal(flag.leer(), null);
  assert.deepEqual(await drive.listClubs(), [], 'Drive receives nothing from the demo: the wizard will create an empty club');
  const ref = await drive.createClub('Real');
  await store.init(ref);
  assert.equal(store.mode, 'drive');
  assert.equal(store.list('Nadadores').length, 0);
  assert.equal(store.list('Entrenamientos').length, 0);
});

test('if connecting Drive fails, the demo stays intact', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { sinClientId: true, errorConexion: 'popup-cerrado' } });
  await modo.enterDemo();
  await assert.rejects(modo.connectDrive({ clientId: CLIENT_ID }), (e) => e.code === 'popup-cerrado');
  assert.equal(driveConnection.enabled, false, 'a Client ID that could not connect is not kept');
  assert.equal(modo.demoDisponible(), true, 'the demo keeps being available');
  assert.equal(store.mode, 'demo');
  assert.ok(store.list('Nadadores').length > 0);
  assert.equal(demo.existe(), true);
});

test('the demo cannot be opened with Drive connected', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { conectado: true } });
  await driveConnection.init();
  await assert.rejects(modo.enterDemo(), (e) => e.code === 'demo-con-drive');
});

test('enterDemo throws demo-con-cliente when a Google Client ID is configured and writes nothing', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { conectado: false } }); // the simulator has a Client ID
  await driveConnection.init();
  assert.equal(driveConnection.enabled, true);
  assert.equal(modo.demoDisponible(), false);
  await assert.rejects(modo.enterDemo(), (e) => e.code === 'demo-con-cliente');
  assert.equal(flag.leer(), null);
  assert.equal(demo.existe(), false);
  assert.deepEqual(Object.keys(localStorage).filter((k) => k.startsWith('cnl:demo:') || k === 'cnl:mode'), []);
});

test('a demo left open is closed and wiped when a Google Client ID appears', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { sinClientId: true } });
  await driveConnection.init();
  const sesion = crearSesionService({ auth: driveConnection, store, banderas: { demoGuardada: () => flag.leer() === 'demo' }, limpiarDatosLocales });
  await modo.enterDemo();
  assert.equal(sesion.decidirArranque(), 'demo');
  fake.opciones.sinClientId = false; // the owner pasted a Client ID (or set BUILTIN_CLIENT_ID)
  assert.equal(modo.demoDisponible(), false);
  assert.equal(sesion.decidirArranque(), 'demo-cerrada');
  await modo.exitDemo(); // what the boot does before showing the notice
  assert.equal(demo.existe(), false);
  assert.equal(flag.leer(), null);
  assert.deepEqual(Object.keys(localStorage).filter((k) => k.startsWith('cnl:demo:') || k === 'cnl:mode'), []);
  assert.equal(sesion.decidirArranque(), 'inicio');
});

test('demoDisponible: only without a Client ID and without authorised Drive (full matrix)', () => {
  for (const clientId of [false, true]) {
    for (const driveAuth of [false, true]) {
      assert.equal(demoDisponible({ clientId, driveAuth }), !clientId && !driveAuth, JSON.stringify({ clientId, driveAuth }));
    }
  }
  assert.equal(demoDisponible(), true);
  assert.equal(demoDisponible({ clientId: 'x.apps.googleusercontent.com' }), false);
  assert.equal(demoDisponible({ clientId: '' }), true);
});

test('startup: the Drive authorization wins over the demo flag (sesionService.resolveStartMode)', async () => {
  let conectado = false;
  const sesion = crearSesionService({
    auth: { isConnected: () => conectado, enabled: false }, store, banderas: { demoGuardada: () => flag.leer() === 'demo', guardarDemo() {} }, limpiarDatosLocales,
  });
  assert.equal(sesion.resolveStartMode(), 'start');
  flag.escribir('demo');
  assert.equal(sesion.resolveStartMode(), 'demo');
  conectado = true;
  assert.equal(sesion.resolveStartMode(), 'drive');
});

test('the local wipe on close/exit (limpiarDatosLocales) also removes the whole demo', async () => {
  await modo.enterDemo();
  await hasta(() => Object.keys(localStorage).some((k) => k.startsWith('cnl:demo:club:')));
  store.cerrar();
  await limpiarDatosLocales();
  assert.deepEqual(Object.keys(localStorage), []);
});
});
