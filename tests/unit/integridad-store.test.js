// Store data integrity against the simulated Drive: concurrency, backups, future version, damaged file,
// full cache, performance, import, GDPR, expired session and simultaneous tabs.
import test, { describe, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupEnv, importApp, ROOT } from '../helpers/env.js';

setupEnv({ loadXlsx: true });
const { store } = await importApp('js/store.js');
const { auth } = await importApp('js/auth.js');
const { drive, nombreBackup } = await importApp('js/drive.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');
const { newId } = await importApp('js/schema.js');
const { cache, limpiarDatosLocales } = await importApp('js/cache.js');
const { loadXLSX } = await importApp('js/lazy.js');
const { pruebasPermitidas } = await importApp('js/infrastructure/entornoPruebas.js');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Waits (up to 3 s) for the condition to hold: timers may be delayed when the process is busy.
const hasta = async (cond, ms = 3000) => { const fin = Date.now() + ms; while (!cond() && Date.now() < fin) await esperar(10); };
const ids = (hoja) => store.list(hoja).map((r) => r.id).sort();
const claveCache = (ref) => 'cnl:club:' + ref.id;
// Object on which to patch setItem: the Storage prototype (jsdom) or the store itself if it is a plain object
// (in the test index other files share the process and may have replaced localStorage).
const objetivoStorage = () => (Object.prototype.hasOwnProperty.call(localStorage, 'setItem') ? localStorage : Object.getPrototypeOf(localStorage));

describe('store data integrity (simulated Drive)', () => {
let fake;
let ref;
beforeEach(async () => {
  localStorage.clear();
  auth.caducada = false;
  if (fake) fake.desinstalar();
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true } });
  await auth.init();
  ref = await drive.createClub('Club Test');
  await store.init(ref);
});
afterEach(() => { store.config.watchdogMs = 90000; });
after(() => { if (fake) fake.desinstalar(); });

// ---------- P0-1: concurrency ----------
test('P0-1: if another device writes between our read and our write, its revision is recovered, merged and rewritten', async () => {
  store.upsert('Grupos', { id: 'base', nombre: 'Base' });
  await store.sync();
  store.upsert('Grupos', { id: 'loc', nombre: 'Local' });
  fake.escribirAntes(() => fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'ext', nombre: 'Externo', categoria: '', entrenador: '' }); }));
  await store.sync();
  assert.deepEqual(ids('Grupos'), ['base', 'ext', 'loc'], 'all three are in memory');
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id).sort(), ['base', 'ext', 'loc'], 'also in Drive: nothing is lost');
  assert.equal(store.status, 'sincronizado');
  assert.equal(store.pendiente, false);
});

test('P0-1: without an in-between write the revision history is not queried and there is a single write', async () => {
  await store.sync();
  let previas = 0;
  const original = drive.revisionPrevia;
  drive.revisionPrevia = async (...a) => { previas++; return original(...a); };
  const escrituras = fake.revisionesDe(ref.id).length;
  store.upsert('Grupos', { id: 'g', nombre: 'G' });
  await store.sync();
  drive.revisionPrevia = original;
  assert.equal(previas, 0);
  assert.equal(fake.revisionesDe(ref.id).length, escrituras + 1);
});

test('P0-1: two consecutive in-between writes are also recovered', async () => {
  store.upsert('Grupos', { id: 'a', nombre: 'A' });
  await store.sync();
  store.upsert('Grupos', { id: 'loc', nombre: 'Local' });
  fake.escribirAntes(() => {
    fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'x1', nombre: 'X1', categoria: '', entrenador: '' }); });
    fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'x2', nombre: 'X2', categoria: '', entrenador: '' }); });
  });
  await store.sync();
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id).sort(), ['a', 'loc', 'x1', 'x2']);
});

test('P0-1: renaming the club (which also bumps Drive\'s version) does not trigger false recoveries', async () => {
  store.setClub({ nombre: 'Otro Nombre' });
  await store.sync();
  let previas = 0;
  const original = drive.revisionPrevia;
  drive.revisionPrevia = async (...a) => { previas++; return original(...a); };
  store.upsert('Grupos', { id: 'g', nombre: 'G' });
  await store.sync();
  drive.revisionPrevia = original;
  assert.equal(previas, 0, 'the version after renaming is recorded: the next write is version+1');
});

test('daily backup: the first write of the day saves the PREVIOUS content to cnl/backups/<club>-YYYYMMDD.json and is not repeated', async () => {
  store.upsert('Grupos', { id: 'v1', nombre: 'Primero' });
  await store.sync();
  assert.deepEqual(fake.archivos().filter((a) => /backups/.test(a.name) || /-\d{8}\.json$/.test(a.name)), [], 'nothing to back up the first time');
  store.upsert('Grupos', { id: 'v2', nombre: 'Segundo' });
  await store.sync();
  const hoy = nombreBackup('Club Test');
  const copias = fake.archivos().filter((a) => a.name === hoy);
  assert.equal(copias.length, 1);
  const doc = JSON.parse(copias[0].contenido);
  assert.deepEqual(doc.hojas.Grupos.map((g) => g.id), ['v1'], 'contains the state from before the write');
  store.upsert('Grupos', { id: 'v3', nombre: 'Tercero' });
  await store.sync();
  assert.equal(fake.archivos().filter((a) => a.name === hoy).length, 1, 'same copy, not rewritten within the day');
  assert.deepEqual(JSON.parse(fake.archivos().find((a) => a.name === hoy).contenido).hojas.Grupos.map((g) => g.id), ['v1']);
});

test('rotating backups: only the last 14 are kept', async () => {
  for (let d = 1; d <= 16; d++) await drive.backupClub('Club Test', { version: 1, club: {}, hojas: { Grupos: [{ id: 'g' + d }] } }, { fecha: new Date(2026, 0, d) });
  const nombres = (await drive.listarBackups('Club Test')).map((b) => b.name);
  assert.equal(nombres.length, 14);
  assert.equal(nombres[0], 'Club Test-20260116.json');
  assert.equal(nombres[13], 'Club Test-20260103.json');
  assert.equal(fake.archivos().filter((a) => /-2026010[12]\.json$/.test(a.name)).length, 0, 'the two oldest were deleted');
});

// ---------- P0-2: future version and unknown data ----------
test('P0-2: a future-version file becomes read-only (with a notice) and is NOT rewritten', async () => {
  fake.editarClubExterno(ref.id, (d) => {
    d.version = 2;
    d.club = { nombre: 'Club Futuro' };
    d.hojas.Nadadores = [{ id: 'n1', nombre: 'Ana', apellidos: 'P', campoNuevo: 'zzz' }];
    d.hojas.HojaDelFuturo = [{ id: 'q', x: 1 }];
  });
  const antes = JSON.stringify(fake.club(ref.id).doc);
  localStorage.clear();
  await store.init(ref);
  assert.deepEqual(store.soloLectura, { version: 2 });
  assert.equal(store.get('Nadadores', 'n1').nombre, 'Ana', 'it can be read');
  assert.throws(() => store.upsert('Grupos', { nombre: 'X' }), (e) => e.code === 'solo-lectura');
  assert.throws(() => store.remove('Nadadores', 'n1'), (e) => e.code === 'solo-lectura');
  assert.throws(() => store.setClub({ lema: 'x' }), (e) => e.code === 'solo-lectura');
  assert.throws(() => store.clear(), (e) => e.code === 'solo-lectura');
  await store.sync();
  assert.equal(JSON.stringify(fake.club(ref.id).doc), antes, 'the file does not change by a single byte');
});

test('P0-2: what the app does not know (extra columns and sheets) survives a normal edit', async () => {
  fake.editarClubExterno(ref.id, (d) => {
    d.club = { nombre: 'Club Test' };
    d.hojas.Nadadores = [{ id: 'n1', nombre: 'Ana', apellidos: 'P', columnaExtra: { a: [1, 2] } }];
    d.hojas.HojaExtra = [{ id: 'h1', valor: 'conservar' }];
    d.claveSuperior = 'x';
  });
  localStorage.clear();
  await store.init(ref);
  store.upsert('Grupos', { id: 'g', nombre: 'G' });
  await store.sync();
  const doc = fake.club(ref.id).doc;
  assert.deepEqual(doc.hojas.Nadadores[0].columnaExtra, { a: [1, 2] });
  assert.deepEqual(doc.hojas.HojaExtra, [{ id: 'h1', valor: 'conservar' }]);
  assert.equal(doc.claveSuperior, 'x');
  assert.equal(doc.hojas.Grupos[0].id, 'g');
});

// ---------- P0-3: types ----------
test('P0-3: a name/motto that is not text in the file opens as text', async () => {
  fake.editarClubExterno(ref.id, (d) => { d.club = { nombre: 12345, lema: { raro: true }, logo: null }; });
  localStorage.clear();
  await store.init(ref);
  assert.equal(store.club.nombre, '12345');
  assert.equal(typeof store.club.lema, 'string');
  assert.equal(store.club.logo, '');
  assert.equal(String(store.club.nombre ?? '').trim(), '12345');
});

// ---------- P0-4: sync that does not answer ----------
test('P0-4: the watchdog releases `syncing` if a request does not answer, reports the error and allows a retry', async () => {
  store.config.watchdogMs = 40;
  const originalMeta = drive.meta;
  drive.meta = () => new Promise(() => {});
  store.upsert('Grupos', { id: 'g', nombre: 'G' });
  await assert.rejects(store.sync(), (e) => e.code === 'timeout');
  assert.equal(store.status, 'error');
  drive.meta = originalMeta;
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  assert.equal(fake.club(ref.id).doc.hojas.Grupos[0].id, 'g');
});

// ---------- P1-2: devices ----------
test('P1-2: another device edits ANOTHER field of the same row -> both changes are kept', async () => {
  store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'Pérez', telefono: '111' });
  await store.sync();
  store.upsert('Nadadores', { ...store.get('Nadadores', 'n1'), telefono: '999' });
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Nadadores[0].email = 'ana@club.es'; });
  await store.sync();
  const n = store.get('Nadadores', 'n1');
  assert.deepEqual([n.telefono, n.email], ['999', 'ana@club.es']);
  const r = fake.club(ref.id).doc.hojas.Nadadores[0];
  assert.deepEqual([r.telefono, r.email], ['999', 'ana@club.es']);
});

test('P1-2: another device deletes a swimmer while loads are added here -> no orphans remain', async () => {
  store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'P' });
  store.upsert('Cargas', { id: 'c1', nadadorId: 'n1', fecha: '2026-10-01', metros: 100 });
  await store.sync();
  store.upsert('Cargas', { id: 'c2', nadadorId: 'n1', fecha: '2026-10-02', metros: 200 });
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Nadadores = []; d.hojas.Cargas = []; d.sync = { reloj: 50, sellos: {}, lapidas: { Nadadores: { n1: { s: '50@otro' } }, Cargas: { c1: { s: '50@otro' } } } }; });
  await store.sync();
  assert.equal(store.get('Nadadores', 'n1'), null);
  assert.deepEqual(store.list('Cargas'), [], 'neither c1 nor c2');
  assert.deepEqual(fake.club(ref.id).doc.hojas.Cargas, []);
});

// ---------- P1-3: damaged / empty file ----------
test('P1-3: unreadable file and no local copy -> "danado" problem; nothing is written until decided; the latest backup can be restored', async () => {
  store.upsert('Grupos', { id: 'viejo', nombre: 'Viejo' });
  await store.sync();
  store.upsert('Grupos', { id: 'nuevo', nombre: 'Nuevo' });
  await store.sync(); // creates the day's backup with 'viejo'
  fake.corromperClub(ref.id, '{ this is not json');
  localStorage.clear();
  await store.init(ref);
  assert.equal(store.problema.tipo, 'danado');
  assert.equal(store.problema.tieneCopiaLocal, false);
  await assert.rejects(store.sync(), (e) => e.code === 'problema-fichero');
  assert.equal(fake.estado().clubs[ref.id].docRaw, '{ this is not json', 'the damaged file is not touched');
  assert.equal((await store.listarBackups()).length, 1);
  await store.resolverProblema('backup');
  assert.equal(store.problema, null);
  assert.deepEqual(ids('Grupos'), ['viejo']);
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id), ['viejo']);
  assert.ok(fake.archivos().some((a) => /-danado-\d{14}\.json$/.test(a.name)), 'the damaged file is archived before being overwritten');
});

test('P1-3: unreadable file with a local copy -> restoring it is offered and it is uploaded again', async () => {
  store.upsert('Grupos', { id: 'g1', nombre: 'Local' });
  await store.sync();
  fake.corromperClub(ref.id);
  await store.init(ref); // the (synced) local cache has the data
  assert.equal(store.problema.tipo, 'danado');
  assert.equal(store.problema.tieneCopiaLocal, true);
  assert.deepEqual(ids('Grupos'), ['g1']);
  await store.resolverProblema('copia-local');
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id), ['g1']);
  assert.equal(store.status, 'sincronizado');
});

test('P1-3: a valid but empty JSON ({}) is NOT a new club if the local cache has data: it asks to decide', async () => {
  store.upsert('Grupos', { id: 'g1', nombre: 'Importante' });
  store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'P' });
  await store.sync();
  fake.vaciarClub(ref.id, {});
  await store.init(ref);
  assert.equal(store.problema.tipo, 'vacio');
  assert.deepEqual(ids('Grupos'), ['g1'], 'local data is still in memory');
  await assert.rejects(store.sync(), (e) => e.code === 'problema-fichero');
  assert.deepEqual(fake.club(ref.id).doc, {}, 'it is not overwritten without confirmation');
  await store.resolverProblema('copia-local');
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id), ['g1']);
});

test('P1-3: {} / null with no local cache or backups is a new club (not blocked)', async () => {
  fake.vaciarClub(ref.id, null);
  localStorage.clear();
  await store.init(ref);
  assert.equal(store.problema, null);
  assert.equal(store.club.nombre, 'Club Test');
});

test('P1-3: if the file is emptied while the app is open, the sync does not treat it as a mass deletion', async () => {
  store.upsert('Grupos', { id: 'g1', nombre: 'G' });
  await store.sync();
  fake.vaciarClub(ref.id, {});
  store.upsert('Grupos', { id: 'g2', nombre: 'H' });
  await assert.rejects(store.sync(), (e) => e.code === 'problema-fichero');
  assert.equal(store.problema.tipo, 'vacio');
  assert.deepEqual(ids('Grupos'), ['g1', 'g2']);
});

// ---------- P1-4: full cache ----------
test('P1-4: if localStorage refuses to save, the status becomes "error" with a notice and the data stays in memory', async () => {
  const proto = objetivoStorage();
  const original = proto.setItem;
  proto.setItem = function (k, v) { if (String(k).startsWith('cnl:club:')) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); };
  const eventos = [];
  const off = store.on((e) => eventos.push(e.type));
  try {
    store.upsert('Grupos', { id: 'g', nombre: 'G' });
    await hasta(() => eventos.includes('cache-error'));
    assert.equal(store.status, 'error');
    assert.equal(store.lastError.code, 'cache-llena');
    assert.ok(eventos.includes('cache-error'));
    assert.equal(store.get('Grupos', 'g').nombre, 'G');
    store.upsert('Grupos', { id: 'g2', nombre: 'H' });
    assert.equal(store.status, 'error', 'editing does not hide the notice');
  } finally { proto.setItem = original; }
  store.upsert('Grupos', { id: 'g3', nombre: 'I' });
  await hasta(() => eventos.includes('cache-ok'));
  off();
  assert.ok(eventos.includes('cache-ok'));
  assert.notEqual(store.status, 'error');
});

test('P1-4: if localStorage is full the cache overflows to IndexedDB and is recovered on reopening', async () => {
  const mapa = new Map();
  const dbFalsa = {
    createObjectStore() {},
    close() {},
    transaction() {
      const tx = {};
      const fin = () => setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
      const st = {
        put(v, k) { mapa.set(k, v); fin(); return {}; },
        get(k) { const r = { result: mapa.get(k) }; fin(); return r; },
        delete(k) { mapa.delete(k); fin(); return {}; },
        clear() { mapa.clear(); fin(); return {}; },
      };
      tx.objectStore = () => st;
      return tx;
    },
  };
  const previo = globalThis.indexedDB;
  globalThis.indexedDB = { open() { const req = {}; setTimeout(() => { req.result = dbFalsa; req.onupgradeneeded && req.onupgradeneeded(); req.onsuccess && req.onsuccess(); }, 0); return req; } };
  const proto = objetivoStorage();
  const original = proto.setItem;
  proto.setItem = function (k, v) { if (String(k).startsWith('cnl:club:')) throw new DOMException('full', 'QuotaExceededError'); return original.call(this, k, v); };
  try {
    store.upsert('Grupos', { id: 'g', nombre: 'Desbordada' });
    await hasta(() => mapa.has(claveCache(ref)) && localStorage.getItem(claveCache(ref)) === null);
    assert.notEqual(store.status, 'error', 'IndexedDB absorbs it: no notice');
    assert.ok(mapa.has(claveCache(ref)), 'the cache is in IndexedDB ');
    assert.equal(localStorage.getItem(claveCache(ref)), null);
    await store.init(ref);
    assert.equal(store.get('Grupos', 'g').nombre, 'Desbordada', 'recovered from IndexedDB, with its pending mark');
  } finally { proto.setItem = original; globalThis.indexedDB = previo; await cache.limpiar(['cnl:club:']); }
});

// ---------- P1-5: performance ----------
test('P1-5: saveCache with debounce (200 ms): many edits = one write; flushed when the tab is hidden', async () => {
  let escrituras = 0;
  const proto = objetivoStorage();
  const original = proto.setItem;
  proto.setItem = function (k, v) { if (k === claveCache(ref)) escrituras++; return original.call(this, k, v); };
  try {
    for (let i = 0; i < 60; i++) store.upsert('Grupos', { id: 'g' + i, nombre: 'G' + i });
    assert.equal(escrituras, 0, 'nothing synchronous');
    await hasta(() => escrituras >= 1);
    await esperar(60);
    assert.equal(escrituras, 1);
    store.upsert('Grupos', { id: 'otro', nombre: 'O' });
    assert.equal(escrituras, 1);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(escrituras, 2, 'hiding the tab flushes immediately');
  } finally {
    proto.setItem = original;
    delete document.visibilityState;
    await store.sync();
  }
});

test('P1-5: upsertMany / removeMany make ONE change, validate all-or-nothing and ids are UUIDs', () => {
  const eventos = [];
  const off = store.on((e) => { if (e.type === 'change') eventos.push(e); });
  const filas = store.upsertMany('Grupos', Array.from({ length: 30 }, (_, i) => ({ id: 'g' + i, nombre: 'G' + i })));
  assert.equal(filas.length, 30);
  assert.equal(eventos.length, 1);
  assert.equal(store.list('Grupos').length, 30);
  assert.equal(store.removeMany('Grupos', ['g0', 'g1', 'g2', 'no-existe']), 3);
  assert.equal(eventos.length, 2);
  assert.equal(store.removeMany('Grupos', ['nada']), 0);
  assert.equal(eventos.length, 2, 'no changes, no event');
  assert.throws(() => store.upsertMany('Nadadores', [{ nombre: 'Ok', apellidos: 'x' }, { nombre: 'Mal', fechaNacimiento: '2015-02-30' }]), (e) => e.code === 'validacion');
  assert.equal(store.list('Nadadores').length, 0, 'all or nothing');
  off();
  assert.match(newId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(newId(), newId());
});

// ---------- P1-6: Excel import ----------
const libro = (hojas) => {
  const wb = XLSX.utils.book_new();
  Object.entries(hojas).forEach(([n, filas]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), n));
  return new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]);
};

test('P1-6: per-sheet preview changes nothing; normalises types (phone to text, serial date -> ISO, club text only)', async () => {
  store.upsert('Grupos', { id: 'g1', nombre: 'Actual' });
  const f = libro({
    Club: [{ clave: 'nombre', valor: 4242 }, { clave: 'lema', valor: 'Lema' }],
    Nadadores: [{ id: 1, nombre: 'Repetida', apellidos: 'Q' }, { id: 1, nombre: 'Ana', apellidos: 'P', telefono: 600111222, licencia: 77, fechaNacimiento: 44927 }, { id: 2, nombre: 'Bea', apellidos: 'R', fechaNacimiento: 'no-es-fecha' }],
    Grupos: [{ id: 'g9', nombre: 'Nuevo' }],
  });
  const previa = await store.previsualizarXlsx(f);
  const hoja = (n) => previa.hojas.find((h) => h.nombre === n);
  assert.deepEqual([hoja('Nadadores').filas, hoja('Grupos').filas, hoja('Grupos').actuales], [2, 1, 1]);
  assert.equal(previa.duplicados.length, 1);
  assert.equal(previa.invalidas, 1);
  assert.deepEqual(ids('Grupos'), ['g1'], 'previewing changes nothing');
  await store.importXlsx(previa);
  assert.equal(store.club.nombre, '4242');
  const a = store.get('Nadadores', '1');
  assert.deepEqual([a.telefono, a.licencia, a.fechaNacimiento, a.nombre], ['600111222', '77', '2023-01-01', 'Ana']);
  assert.deepEqual(ids('Grupos'), ['g9']);
});

test('P1-6: a copy is saved to cnl/backups before importing; if it cannot be saved, nothing is imported', async () => {
  store.upsert('Grupos', { id: 'g1', nombre: 'Actual' });
  await store.sync();
  const f = libro({ Grupos: [{ id: 'g2', nombre: 'Importado' }] });
  fake.opciones.fallos.subir = 'offline';
  await assert.rejects(store.importXlsx(f), (e) => e.code === 'import-sin-copia');
  assert.deepEqual(ids('Grupos'), ['g1'], 'data intact');
  fake.opciones.fallos.subir = null;
  await store.importXlsx(f);
  assert.deepEqual(ids('Grupos'), ['g2']);
  const copia = fake.archivos().find((a) => /-import-\d{14}\.json$/.test(a.name));
  assert.ok(copia, 'copy taken before the import');
  assert.deepEqual(JSON.parse(copia.contenido).hojas.Grupos.map((g) => g.id), ['g1']);
  await store.importXlsx(libro({ Grupos: [{ id: 'g3', nombre: 'Otro' }] }), { sinCopia: true });
  assert.deepEqual(ids('Grupos'), ['g3']);
});

test('P1-6: limits: 20 MB and 50,000 rows', async () => {
  await assert.rejects(store.previsualizarXlsx({ size: 21 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) }), (e) => e.code === 'import-demasiado-grande');
  const grande = libro({ Nadadores: Array.from({ length: 50001 }, (_, i) => ({ id: 'n' + i, nombre: 'x', apellidos: 'y' })) });
  await assert.rejects(store.previsualizarXlsx(grande), (e) => e.code === 'import-demasiadas-filas');
  assert.equal(store.list('Nadadores').length, 0);
});

// ---------- P1-7: GDPR ----------
const sembrarNadadores = () => {
  store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'Pérez', fechaNacimiento: '2012-05-04', telefono: '600' });
  store.upsert('Nadadores', { id: 'n2', nombre: 'Bea', apellidos: 'Ruiz', fechaNacimiento: '2013-05-04' });
  store.upsert('Entrenamientos', { id: 'e1', fecha: '2026-10-01', titulo: 'T' });
  store.upsert('Cargas', { id: 'c1', nadadorId: 'n1', entrenamientoId: 'e1', fecha: '2026-10-01', metros: 1000 });
  store.upsert('Cargas', { id: 'c2', nadadorId: 'n2', entrenamientoId: 'e1', fecha: '2026-10-01', metros: 900 });
  store.upsert('Marcas', { id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '50 libre', tiempoMs: 30000 });
  store.upsert('Banador', { id: 'b1', nadadorId: 'n1', talla: 'M' });
  store.upsert('Asistencia', { id: 'a1', nadadorId: 'n1', entrenamientoId: 'e1', estado: 'presente' });
};

test('P1-7: exportNadador returns all of the swimmer\'s rows (profile, attendance, loads, times, swimsuit) and only theirs', () => {
  sembrarNadadores();
  const { datos, nombre } = store.exportNadador('n1', { descargar: false });
  assert.equal(datos.nadador.nombre, 'Ana');
  assert.deepEqual(Object.keys(datos.hojas).sort(), ['Asistencia', 'Banador', 'Cargas', 'Marcas']);
  assert.deepEqual(datos.hojas.Cargas.map((c) => c.id), ['c1']);
  assert.equal(datos.hojas.Marcas.length, 1);
  assert.match(nombre, /^nadador-Ana-P.*\.json$/);
  assert.throws(() => store.exportNadador('nadie', { descargar: false }), /no encontrado/);
});

test('P1-7: purgarNadador cascades, rewrites the JSON, deletes Drive .xlsx copies, backups and old revisions', async () => {
  sembrarNadadores();
  await store.sync();
  await store.guardarXlsxEnDrive();
  store.upsert('Grupos', { id: 'g1', nombre: 'G' });
  await store.sync(); // creates the day's backup (which contains n1)
  assert.ok(fake.archivos().some((a) => /-\d{8}\.json$/.test(a.name)), 'there is a daily backup');
  assert.ok(fake.archivos().some((a) => a.name === 'Club Test.xlsx'));
  const r = await store.purgarNadador('n1');
  assert.equal(r.sincronizado, true);
  assert.equal(r.filas, 5);
  assert.equal(store.get('Nadadores', 'n1'), null);
  for (const h of ['Cargas', 'Marcas', 'Banador', 'Asistencia']) assert.ok(store.list(h).every((x) => x.nadadorId !== 'n1'), h);
  assert.ok(store.get('Nadadores', 'n2') && store.get('Cargas', 'c2'), 'the rest is untouched');
  const doc = fake.club(ref.id).doc;
  assert.deepEqual(doc.hojas.Nadadores.map((n) => n.id), ['n2']);
  assert.equal(doc.sync.lapidas.Nadadores.n1.h, 1, 'permanent tombstone');
  assert.equal(fake.archivos().filter((a) => a.name.endsWith('.xlsx') || /-\d{8}\.json$/.test(a.name)).length, 0, 'no .xlsx copies or backups holding their data');
  assert.ok(r.copiasBorradas >= 2);
  assert.equal(r.avisoRevisiones, true);
  assert.equal(fake.revisionesDe(ref.id).length, 1, 'only the current revision remains');
  assert.ok(!/"nombre":"Ana"|Pérez/.test(JSON.stringify(fake.revisionesDe(ref.id)[0].doc)), 'the remaining revision holds none of their data (only the id in the tombstone)');
  assert.ok(!/"nombre":"Ana"|Pérez/.test(JSON.stringify(fake.archivos())), 'nothing in Drive keeps their name');
});

test('P1-7: after purging, a device with old pending data cannot resurrect the swimmer', async () => {
  sembrarNadadores();
  await store.sync();
  await hasta(() => { const c = (() => { try { return JSON.parse(localStorage.getItem(claveCache(ref))); } catch (e) { return null; } })(); return c && !c.dirty && c.db.Nadadores.some((x) => x.id === 'n1'); });
  const viejo = JSON.parse(localStorage.getItem(claveCache(ref)));
  await store.purgarNadador('n1');
  viejo.dirty = true;
  viejo.base = JSON.parse(JSON.stringify({ db: viejo.db, club: viejo.club }));
  viejo.db.Nadadores.find((n) => n.id === 'n1').telefono = 'editado en el otro dispositivo';
  localStorage.setItem(claveCache(ref), JSON.stringify(viejo));
  await store.init(ref);
  assert.ok(viejo.db.Nadadores.some((n) => n.id === 'n1'), 'the other device still has them');
  await store.sync();
  assert.equal(store.get('Nadadores', 'n1'), null);
  assert.ok(fake.club(ref.id).doc.hojas.Nadadores.every((n) => n.id !== 'n1'));
  assert.ok(fake.club(ref.id).doc.hojas.Cargas.every((c) => c.nadadorId !== 'n1'));
});

test('P1-7: validation in upsert: impossible date, non-finite number, age out of range; the row is not saved', () => {
  assert.throws(() => store.upsert('Nadadores', { nombre: 'A', apellidos: 'B', fechaNacimiento: '2015-02-30' }), (e) => e.code === 'validacion' && e.errores[0].campo === 'fechaNacimiento');
  assert.throws(() => store.upsert('Nadadores', { nombre: 'A', apellidos: 'B', fechaNacimiento: '2999-01-01' }), (e) => e.code === 'validacion');
  assert.throws(() => store.upsert('Cargas', { nadadorId: 'x', metros: Infinity }), (e) => e.code === 'validacion');
  assert.throws(() => store.upsert('Cargas', { nadadorId: 'x', rpe: 99 }), (e) => e.code === 'validacion');
  assert.equal(store.list('Nadadores').length + store.list('Cargas').length, 0);
  assert.doesNotThrow(() => store.upsert('Nadadores', { nombre: 'A', apellidos: 'B', fechaNacimiento: '2015-03-02' }));
});

test('P1-7: duplicated ids in the file are reported (not silently "last wins")', async () => {
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos = [{ id: 'g', nombre: 'Uno' }, { id: 'g', nombre: 'Dos' }, { nombre: 'sin id' }]; });
  localStorage.clear();
  await store.init(ref);
  assert.deepEqual(store.avisos.map((a) => a.tipo).sort(), ['duplicado', 'sin-id']);
  assert.equal(store.get('Grupos', 'g').nombre, 'Dos');
});

// ---------- P2 ----------
test('P2: expired session: sync fails without losing anything, a notice is raised (auth.caducada) and after reconnecting it uploads', async () => {
  const avisos = [];
  const off = auth.onExpired((v) => avisos.push(v));
  store.upsert('Grupos', { id: 'g', nombre: 'G' });
  fake.caducarSesion();
  await assert.rejects(store.sync(), (e) => e.code === 'sesion-caducada');
  assert.deepEqual(avisos, [true]);
  assert.equal(auth.caducada, true);
  assert.equal(store.pendiente, true);
  assert.equal(store.status, 'error');
  await auth.reconectar();
  await store.sync();
  off();
  assert.equal(fake.club(ref.id).doc.hojas.Grupos[0].id, 'g');
  assert.equal(store.pendiente, false);
});

test('P2: two tabs of the same browser: the storage event merges the other\'s cache without overwriting our own changes', async () => {
  store.upsert('Grupos', { id: 'mio', nombre: 'Mio' });
  await store.sync();
  store.upsert('Grupos', { id: 'g-local', nombre: 'Local' });
  await hasta(() => { const c = (() => { try { return JSON.parse(localStorage.getItem(claveCache(ref))); } catch (e) { return null; } })(); return c && c.db.Grupos.some((x) => x.id === 'g-local'); });
  const key = claveCache(ref);
  const suya = JSON.parse(localStorage.getItem(key));
  suya.db.Grupos = suya.db.Grupos.filter((g) => g.id !== 'g-local');
  suya.db.Grupos.push({ id: 'g-otra', nombre: 'De la otra pestaña', categoria: '', entrenador: '' });
  suya.dirty = true;
  window.dispatchEvent(new window.StorageEvent('storage', { key, newValue: JSON.stringify(suya) }));
  assert.deepEqual(ids('Grupos'), ['g-local', 'g-otra', 'mio']);
  assert.equal(store.pendiente, true);
  await store.sync();
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id).sort(), ['g-local', 'g-otra', 'mio']);
});

test('P2: signing out erases EVERY local mirror of personal data (and keeps what is not)', async () => {
  store.upsert('Grupos', { id: 'g', nombre: 'G' });
  await hasta(() => Object.keys(localStorage).some((k) => k.startsWith('cnl:club:')));
  localStorage.setItem('cnl:user', '{"email":"a@b.c"}');
  localStorage.setItem('cnl:prefs', '{}');
  localStorage.setItem('cnl:cal-sync:club:a@b.c', '{"items":{}}');
  localStorage.setItem('cnl:token', 'x');
  localStorage.setItem('cnl:lang', 'en');
  localStorage.setItem('cnl:tema', 'dark');
  sessionStorage.setItem('cnl:elegir', '1');
  assert.ok(Object.keys(localStorage).some((k) => k.startsWith('cnl:club:')));
  await limpiarDatosLocales();
  const quedan = Object.keys(localStorage);
  assert.ok(!quedan.some((k) => k.startsWith('cnl:club:') || ['cnl:user', 'cnl:prefs', 'cnl:token'].includes(k) || k.startsWith('cnl:cal-sync:')), quedan.join(','));
  assert.equal(sessionStorage.getItem('cnl:elegir'), null);
  assert.ok(quedan.includes('cnl:lang') && quedan.includes('cnl:tema'));
});

test('P2: loadXLSX downloads nothing if already loaded; otherwise injects the script on demand; index.html no longer loads it', async () => {
  assert.equal(await loadXLSX(), globalThis.XLSX);
  const guardado = globalThis.XLSX;
  globalThis.XLSX = undefined;
  const insertados = [];
  const append = document.head.appendChild.bind(document.head);
  document.head.appendChild = (el) => { insertados.push(el.src); globalThis.XLSX = guardado; setTimeout(() => el.onload && el.onload(), 0); return append(el); };
  try {
    assert.equal(await loadXLSX(), guardado);
    assert.equal(insertados.length, 1);
    assert.match(insertados[0], /vendor\/xlsx\.full\.min\.js$/);
  } finally { document.head.appendChild = append; globalThis.XLSX = guardado; }
  const html = readFileSync(ROOT + '/index.html', 'utf8');
  assert.ok(!/xlsx/i.test(html), 'index.html does not load SheetJS');
  assert.ok(readFileSync(ROOT + '/sw.js', 'utf8').includes('./vendor/xlsx.full.min.js'), 'the service worker precaches it');
});

test('P2: the Google simulator is only activated on localhost/127.0.0.1 (or with __CNL_TEST__ injected)', () => {
  const ls = (v) => ({ getItem: () => v });
  assert.equal(pruebasPermitidas({ location: { hostname: 'localhost' }, localStorage: ls('1') }), true);
  assert.equal(pruebasPermitidas({ location: { hostname: '127.0.0.1' }, localStorage: ls('1') }), true);
  assert.equal(pruebasPermitidas({ location: { hostname: 'miclub.github.io' }, localStorage: ls('1') }), false, 'a stale localStorage value does not replace Google in production');
  assert.equal(pruebasPermitidas({ location: { hostname: 'localhost' }, localStorage: ls(null) }), false);
  assert.equal(pruebasPermitidas({ location: { hostname: 'miclub.github.io' }, localStorage: ls(null), __CNL_TEST__: { sesion: true } }), true, 'Playwright injects it with addInitScript');
  assert.equal(pruebasPermitidas({ location: { hostname: 'evil.com' }, localStorage: { getItem() { throw new Error('bloqueado'); } } }), false);
});
});
