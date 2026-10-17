// Demo mode: the local storage adapter, the mode service and the store running in demo mode (never touching Drive).
import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { store } = await importApp('js/store.js');
const { drive } = await importApp('js/drive.js');
const { driveConnection } = await importApp('js/infrastructure/driveConnection.js');
const { crearDemoStorage, DEMO_PREFIX } = await importApp('js/infrastructure/demoStorage.js');
const { crearModoService } = await importApp('js/application/modoService.js');
const { crearSesionService } = await importApp('js/application/sesionService.js');
const { limpiarDatosLocales } = await importApp('js/cache.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');

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

describe('modo demo', () => {
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

test('adaptador: aislado en cnl:demo:*, con su propio documento y sin copias de seguridad ni Drive', async () => {
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

test('entrar en la demo: store.mode demo, datos de ejemplo relativos al reloj, bandera cnl:mode y NINGUNA llamada a Drive', async () => {
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
  assert.ok(fechas.includes(ymd(lunes)), 'hay sesión el lunes de la semana del reloj');
  assert.deepEqual(llamadasDrive, [], 'la demo nunca toca Drive');
  const claves = Object.keys(localStorage);
  assert.ok(claves.some((k) => k.startsWith('cnl:demo:club:')), 'espejo local de la demo');
  assert.ok(!claves.some((k) => k.startsWith('cnl:club:')), 'no se mezcla con los clubes reales');
});

test('las ediciones en la demo se guardan localmente, sobreviven a "recargar" y no suben nada', async () => {
  await modo.enterDemo();
  store.upsert('Grupos', { id: 'g-nuevo', nombre: 'Mi grupo' });
  await store.sync();
  assert.equal(store.pendiente, false);
  assert.equal(store.status, 'sincronizado');
  store.cerrar();
  const otra = await modo.enterDemo(); // "reload"
  assert.equal(otra.nuevo, false, 'no se vuelve a sembrar');
  assert.ok(store.get('Grupos', 'g-nuevo'));
  assert.deepEqual(llamadasDrive, []);
});

test('en la demo: Excel, PDF-calendario y datos funcionan; copia en Drive y copias de seguridad están desactivadas', async () => {
  await modo.enterDemo();
  await assert.rejects(store.guardarXlsxEnDrive(), (e) => e.code === 'demo-sin-drive');
  assert.deepEqual(await store.listarBackups(), []);
  const res = await store.purgarNadador(store.list('Nadadores')[0].id);
  assert.deepEqual(res.errores, [], 'borrar un nadador en la demo no intenta tocar Drive');
  assert.deepEqual(llamadasDrive, []);
});

test('salir de la demo borra TODOS los datos de la demo, la bandera y deja el store en modo drive', async () => {
  localStorage.setItem('cnl:lang', 'en');
  await modo.enterDemo();
  store.upsert('Grupos', { id: 'g-x', nombre: 'X' });
  assert.deepEqual(await modo.exitDemo(), { salio: true });
  assert.equal(store.mode, 'drive');
  assert.equal(store.clubRef, null);
  assert.equal(demo.existe(), false);
  assert.equal(flag.leer(), null);
  assert.deepEqual(Object.keys(localStorage), ['cnl:lang'], 'sólo queda lo que no es de la demo');
  await new Promise((r) => setTimeout(r, 400)); // a late flush must not resurrect anything
  assert.deepEqual(Object.keys(localStorage), ['cnl:lang']);
});

test('conectar Drive desde la demo: se pide la autorización, la demo se borra y el club real empieza vacío', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { conectado: false } });
  await driveConnection.init();
  await modo.enterDemo();
  const marcador = store.list('Nadadores').length;
  assert.ok(marcador > 0);
  assert.equal((await modo.connectDrive()).modo, 'drive');
  assert.equal(driveConnection.isConnected(), true);
  assert.equal(store.mode, 'drive');
  assert.equal(demo.existe(), false);
  assert.equal(flag.leer(), null);
  assert.deepEqual(await drive.listClubs(), [], 'Drive no recibe nada de la demo: el asistente creará un club vacío');
  const ref = await drive.createClub('Real');
  await store.init(ref);
  assert.equal(store.mode, 'drive');
  assert.equal(store.list('Nadadores').length, 0);
  assert.equal(store.list('Entrenamientos').length, 0);
});

test('si conectar Drive falla, la demo sigue intacta', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { errorConexion: 'popup-cerrado' } });
  await modo.enterDemo();
  await assert.rejects(modo.connectDrive(), (e) => e.code === 'popup-cerrado');
  assert.equal(store.mode, 'demo');
  assert.ok(store.list('Nadadores').length > 0);
  assert.equal(demo.existe(), true);
});

test('no se puede abrir la demo con Drive conectado', async () => {
  fake = instalarFakeGoogle({ conexion: driveConnection, drive, opciones: { conectado: true } });
  await driveConnection.init();
  await assert.rejects(modo.enterDemo(), (e) => e.code === 'demo-con-drive');
});

test('arranque: la autorización de Drive manda sobre la bandera de la demo (sesionService.resolveStartMode)', async () => {
  let conectado = false;
  const sesion = crearSesionService({
    auth: { isConnected: () => conectado, enabled: true }, store, banderas: { demoGuardada: () => flag.leer() === 'demo', guardarDemo() {} }, limpiarDatosLocales,
  });
  assert.equal(sesion.resolveStartMode(), 'start');
  flag.escribir('demo');
  assert.equal(sesion.resolveStartMode(), 'demo');
  conectado = true;
  assert.equal(sesion.resolveStartMode(), 'drive');
});

test('el borrado local del cierre/salida (limpiarDatosLocales) también elimina la demo entera', async () => {
  await modo.enterDemo();
  await hasta(() => Object.keys(localStorage).some((k) => k.startsWith('cnl:demo:club:')));
  store.cerrar();
  await limpiarDatosLocales();
  assert.deepEqual(Object.keys(localStorage), []);
});
});
