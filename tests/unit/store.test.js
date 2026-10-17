import test, { describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv({ loadXlsx: true });
const { store } = await importApp('js/composicion/store.js');
const { SHEETS, ENTITY_SHEETS, CATEGORIAS } = await importApp('js/domain/schema.js');
const { driveConnection: auth } = await importApp('js/infrastructure/driveConnection.js');
const { drive } = await importApp('js/infrastructure/drive.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');

// Own suite: the hooks must not apply to the tests of other files in the same process.
// ADD NEW TESTS INSIDE IT (before the closing at the end of the file).
describe('data store (store) with simulated Drive', () => {
// The store is tested against the simulated Drive (infrastructure/fakeGoogle.js): no real Google, no local mode.
let fake;
let ref;
beforeEach(async () => {
  localStorage.clear();
  if (fake) fake.desinstalar();
  fake = instalarFakeGoogle({ auth, drive, opciones: { conectado: true } });
  await auth.init();
  ref = await drive.createClub('Club Test');
  await store.init(ref);
});
after(() => { if (fake) fake.desinstalar(); });

test('init with a Drive club: name, status and empty file', async () => {
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  assert.equal(store.club.nombre, 'Club Test');
  // TiposCarga comes seeded with the predefined catalogue of training contents
  for (const s of ENTITY_SHEETS.filter((x) => x !== 'TiposCarga')) assert.deepEqual(store.list(s), []);
  assert.equal(store.list('TiposCarga').length, 10);
  assert.deepEqual(store.clubRef, { name: 'Club Test', id: ref.id });
  assert.equal(store.localClubs, undefined, 'local mode no longer exists');
});

test('upsert generates an id, get retrieves it and list returns a copy', () => {
  const r = store.upsert('Nadadores', { nombre: 'Ana', apellidos: 'Pérez' });
  assert.ok(r.id && typeof r.id === 'string');
  assert.equal(store.get('Nadadores', r.id).nombre, 'Ana');
  assert.equal(store.get('Nadadores', 'nope'), null);
  const l = store.list('Nadadores');
  l.push({ id: 'x' });
  assert.equal(store.list('Nadadores').length, 1);
});

test('upsert fills in all columns and discards unknown ones', () => {
  const r = store.upsert('Grupos', { nombre: 'G', extra: 'zzz', otra: 1 });
  assert.deepEqual(Object.keys(r).sort(), [...SHEETS.Grupos].sort());
  assert.equal(r.categoria, '');
  assert.equal('extra' in r, false);
});

test('upsert with an existing id updates, does not duplicate', () => {
  const a = store.upsert('Grupos', { nombre: 'Uno' });
  store.upsert('Grupos', { id: a.id, nombre: 'Dos' });
  assert.equal(store.list('Grupos').length, 1);
  assert.equal(store.get('Grupos', a.id).nombre, 'Dos');
});

test('upsert normalises a numeric id to a string', () => {
  store.upsert('Grupos', { id: 7, nombre: 'Siete' });
  assert.equal(store.get('Grupos', 7).id, '7');
});

test('upsert on an unknown sheet throws', () => {
  assert.throws(() => store.upsert('Nada', {}), /desconocida/);
});

test('remove deletes and is idempotent', () => {
  const a = store.upsert('Grupos', { nombre: 'A' });
  store.remove('Grupos', a.id);
  assert.equal(store.list('Grupos').length, 0);
  assert.doesNotThrow(() => store.remove('Grupos', a.id));
  assert.doesNotThrow(() => store.remove('Inexistente', 'x'));
});

test('on() emits change events and can be cancelled', () => {
  const evts = [];
  const off = store.on((e) => { if (e.type !== 'status') evts.push(e); });
  const a = store.upsert('Grupos', { nombre: 'A' });
  store.remove('Grupos', a.id);
  store.setClub({ lema: 'hola' });
  assert.deepEqual(evts.map((e) => e.type), ['change', 'change', 'club']);
  assert.equal(evts[0].sheet, 'Grupos');
  off();
  store.upsert('Grupos', { nombre: 'B' });
  assert.equal(evts.length, 3);
});

test('remove of something non-existent emits no event', () => {
  const evts = [];
  const off = store.on((e) => { if (e.type !== 'status') evts.push(e); });
  store.remove('Grupos', 'no-existe');
  off();
  assert.equal(evts.length, 0);
});

test('setClub merges with the existing config', () => {
  store.setClub({ colorPrimario: '#123456' });
  store.setClub({ lema: 'Lema' });
  assert.equal(store.club.colorPrimario, '#123456');
  assert.equal(store.club.lema, 'Lema');
  assert.equal(store.club.nombre, 'Club Test');
});

test('persistence in localStorage: re-init recovers the data', async () => {
  store.upsert('Grupos', { id: 'g9', nombre: 'Persistente' });
  store.setClub({ lema: 'L' });
  await store.init(ref);
  assert.equal(store.get('Grupos', 'g9').nombre, 'Persistente');
  assert.equal(store.club.lema, 'L');
});

test('clear empties the data', () => {
  store.upsert('Grupos', { nombre: 'A' });
  store.clear();
  assert.equal(store.list('Grupos').length, 0);
});

test('seedDemo creates coherent data', () => {
  const counts = store.seedDemo();
  for (const s of ENTITY_SHEETS.filter((x) => x !== 'Usuarios' && x !== 'ObjetivosCarga')) assert.ok(counts[s] > 0, `${s} empty`);
  assert.equal(store.club.nombre, 'Club Natación Lugones');

  const nad = new Set(store.list('Nadadores').map((n) => n.id));
  const gr = new Set(store.list('Grupos').map((g) => g.id));
  const ent = new Set(store.list('Entrenamientos').map((e) => e.id));
  for (const sheet of ['Asistencia', 'Cargas', 'Marcas']) {
    for (const r of store.list(sheet)) assert.ok(nad.has(r.nadadorId), `${sheet} ${r.id}: swimmer ${r.nadadorId}`);
  }
  for (const sheet of ['Asistencia', 'Cargas']) {
    for (const r of store.list(sheet)) assert.ok(ent.has(r.entrenamientoId), `${sheet} ${r.id}: training session`);
  }
  for (const n of store.list('Nadadores')) {
    assert.ok(gr.has(n.grupoId));
    assert.ok(CATEGORIAS.includes(n.categoria));
  }
  for (const e of store.list('Entrenamientos')) assert.ok(gr.has(e.grupoId));
  for (const s of ENTITY_SHEETS) {
    const ids = store.list(s).map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate ids in ${s}`);
  }
  for (const m of store.list('Marcas')) assert.ok(m.tiempoMs > 0);
  for (const c of store.list('Cargas')) assert.ok(c.metros > 0 && c.rpe >= 1 && c.rpe <= 10);
});

test('seedDemo is deterministic in data (not counting dates)', () => {
  store.seedDemo();
  const a = store.list('Marcas').map((m) => [m.nadadorId, m.prueba, m.tiempoMs].join('|'));
  store.seedDemo();
  const b = store.list('Marcas').map((m) => [m.nadadorId, m.prueba, m.tiempoMs].join('|'));
  assert.deepEqual(a, b);
});

test('contents catalogue: seeded on open, not duplicated on reopen and does not overwrite edits', async () => {
  assert.equal(store.list('TiposCarga').length, 10);
  const piernas = store.get('TiposCarga', 'tc-piernas');
  store.upsert('TiposCarga', { ...piernas, color: '#123456', descripcion: 'Mi descripción', minSemanalM: 700 });
  store.remove('TiposCarga', 'tc-brazos'); // e.g. deleted by hand in the sheet: it is restored
  await store.init(ref);
  assert.equal(store.list('TiposCarga').length, 10);
  const p = store.get('TiposCarga', 'tc-piernas');
  assert.deepEqual([p.color, p.descripcion, p.minSemanalM], ['#123456', 'Mi descripción', 700]);
  assert.ok(store.get('TiposCarga', 'tc-brazos'));
  await store.init(ref);
  assert.equal(store.list('TiposCarga').length, 10, 'idempotent');
});

test('contents catalogue: migrates old loads and goals without losing anything', async () => {
  store.upsert('Cargas', { id: 'c1', nadadorId: 'n', fecha: '2026-10-12', metros: 1000, tipo: 'Velocidad' });
  store.upsert('Cargas', { id: 'c2', nadadorId: 'n', fecha: '2026-10-12', metros: 500, tipo: 'Técnica' });
  store.upsert('ObjetivosCarga', { id: 'o1', tipo: 'Velocidad', minSemanalM: 1500, maxSemanalM: 3500 });
  store.upsert('ObjetivosCarga', { id: 'o2', tipo: 'Técnica', minSemanalM: 2000, maxSemanalM: 4000 });
  await store.init(ref);
  const vel = store.list('TiposCarga').find((t) => t.nombre === 'Velocidad');
  assert.deepEqual([vel.categoria, vel.predefinido, vel.minSemanalM, vel.maxSemanalM], ['personalizado', 'false', 1500, 3500]);
  const tec = store.get('TiposCarga', 'tc-tecnica');
  assert.deepEqual([tec.minSemanalM, tec.maxSemanalM], [2000, 4000]);
  assert.equal(store.list('ObjetivosCarga').length, 0);
  assert.deepEqual(store.list('Cargas').map((c) => c.tipo).sort(), ['Técnica', 'Velocidad'], 'loads are left untouched');
  await store.init(ref);
  assert.equal(store.list('TiposCarga').length, 11, 'second open: no changes');
});

test('contents catalogue: clear seeds it again', () => {
  store.clear();
  assert.equal(store.list('TiposCarga').length, 10);
});

test('init without a Drive club fails (there is no local mode)', async () => {
  await assert.rejects(store.init('Club Test'), /Falta el club/);
  await assert.rejects(store.init(null), /Falta el club/);
});

test('sync uploads the club to cnl/<Club>.json with the shape {version, club, hojas}', async () => {
  const g = store.upsert('Grupos', { nombre: 'Promoción' });
  store.setClub({ lema: 'Lema' });
  assert.equal(store.status, 'pendiente');
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  const doc = fake.club(ref.id).doc;
  assert.equal(doc.version, 1);
  assert.equal(doc.club.lema, 'Lema');
  assert.deepEqual(doc.hojas.Grupos.map((r) => r.id), [g.id]);
  assert.equal('Usuarios' in doc.hojas, false, 'no users sheet');
});

test('refresh picks up changes made from another device', async () => {
  await store.sync();
  assert.equal(await store.refresh(), false, 'no changes');
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'ext1', nombre: 'Externo', categoria: '', entrenador: '' }); });
  const evts = [];
  const off = store.on((e) => evts.push(e.type));
  assert.equal(await store.refresh(), true);
  off();
  assert.equal(store.get('Grupos', 'ext1').nombre, 'Externo');
  assert.ok(evts.includes('remote'));
  assert.equal(await store.refresh(), false);
});

test('sync merges per row: local and remote changes are both kept', async () => {
  await store.sync();
  store.upsert('Grupos', { id: 'loc1', nombre: 'Local' });
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'ext1', nombre: 'Externo', categoria: '', entrenador: '' }); });
  await store.sync();
  assert.deepEqual(store.list('Grupos').map((g) => g.id).sort(), ['ext1', 'loc1']);
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id).sort(), ['ext1', 'loc1']);
});

test('offline, changes stay in the queue and are uploaded on return', async () => {
  await store.sync();
  fake.opciones.fallos.escribir = 'offline';
  store.upsert('Grupos', { id: 'g1', nombre: 'Pendiente' });
  await assert.rejects(store.sync(), /conexión/);
  assert.equal(store.status, 'offline');
  assert.ok(JSON.parse(localStorage.getItem('cnl:club:' + ref.id)).dirty, 'the local cache keeps the pending flag');
  assert.equal(fake.club(ref.id).doc.hojas.Grupos.length, 0);
  fake.opciones.fallos.escribir = null;
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  assert.equal(fake.club(ref.id).doc.hojas.Grupos[0].nombre, 'Pendiente');
});

test('renaming the club renames the file on Drive', async () => {
  store.setClub({ nombre: 'Club Renombrado' });
  await store.sync();
  assert.equal(fake.club(ref.id).name, 'Club Renombrado');
  assert.equal(store.clubRef.name, 'Club Renombrado');
});

test('guardarXlsxEnDrive uploads (and then replaces) the .xlsx copy in cnl', async () => {
  const a = await store.guardarXlsxEnDrive();
  const b = await store.guardarXlsxEnDrive();
  assert.equal(a.id, b.id, 'does not duplicate the file');
  assert.deepEqual(fake.archivos().filter((f) => f.name.endsWith('.xlsx')).map((f) => f.name), ['Club Test.xlsx']);
});
});
