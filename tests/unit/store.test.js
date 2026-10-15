import test, { describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv({ loadXlsx: true });
const { store } = await importApp('js/store.js');
const { SHEETS, ENTITY_SHEETS, CATEGORIAS } = await importApp('js/schema.js');
const { auth } = await importApp('js/auth.js');
const { drive } = await importApp('js/drive.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');

// Suite propia: los hooks no deben aplicarse a los tests de otros ficheros del mismo proceso.
// AÑADE LOS TESTS NUEVOS DENTRO (antes del cierre del final del fichero).
describe('almacén de datos (store) con Drive simulado', () => {
// El almacén se prueba contra el Drive simulado (infrastructure/fakeGoogle.js): sin Google real, sin modo local.
let fake;
let ref;
beforeEach(async () => {
  localStorage.clear();
  if (fake) fake.desinstalar();
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true } });
  await auth.init();
  ref = await drive.createClub('Club Test');
  await store.init(ref);
});
after(() => { if (fake) fake.desinstalar(); });

test('init con un club de Drive: nombre, estado y fichero vacío', async () => {
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  assert.equal(store.club.nombre, 'Club Test');
  // TiposCarga trae sembrado el catálogo predefinido de contenidos de entrenamiento
  for (const s of ENTITY_SHEETS.filter((x) => x !== 'TiposCarga')) assert.deepEqual(store.list(s), []);
  assert.equal(store.list('TiposCarga').length, 10);
  assert.deepEqual(store.clubRef, { name: 'Club Test', id: ref.id });
  assert.equal(store.localClubs, undefined, 'ya no existe el modo local');
});

test('upsert genera id, get lo recupera y list devuelve copia', () => {
  const r = store.upsert('Nadadores', { nombre: 'Ana', apellidos: 'Pérez' });
  assert.ok(r.id && typeof r.id === 'string');
  assert.equal(store.get('Nadadores', r.id).nombre, 'Ana');
  assert.equal(store.get('Nadadores', 'nope'), null);
  const l = store.list('Nadadores');
  l.push({ id: 'x' });
  assert.equal(store.list('Nadadores').length, 1);
});

test('upsert rellena todas las columnas y descarta las desconocidas', () => {
  const r = store.upsert('Grupos', { nombre: 'G', extra: 'zzz', otra: 1 });
  assert.deepEqual(Object.keys(r).sort(), [...SHEETS.Grupos].sort());
  assert.equal(r.categoria, '');
  assert.equal('extra' in r, false);
});

test('upsert con id existente actualiza, no duplica', () => {
  const a = store.upsert('Grupos', { nombre: 'Uno' });
  store.upsert('Grupos', { id: a.id, nombre: 'Dos' });
  assert.equal(store.list('Grupos').length, 1);
  assert.equal(store.get('Grupos', a.id).nombre, 'Dos');
});

test('upsert normaliza el id numérico a string', () => {
  store.upsert('Grupos', { id: 7, nombre: 'Siete' });
  assert.equal(store.get('Grupos', 7).id, '7');
});

test('upsert en hoja desconocida lanza', () => {
  assert.throws(() => store.upsert('Nada', {}), /desconocida/);
});

test('remove borra y es idempotente', () => {
  const a = store.upsert('Grupos', { nombre: 'A' });
  store.remove('Grupos', a.id);
  assert.equal(store.list('Grupos').length, 0);
  assert.doesNotThrow(() => store.remove('Grupos', a.id));
  assert.doesNotThrow(() => store.remove('Inexistente', 'x'));
});

test('on() emite eventos de cambio y se puede cancelar', () => {
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

test('remove de algo inexistente no emite evento', () => {
  const evts = [];
  const off = store.on((e) => { if (e.type !== 'status') evts.push(e); });
  store.remove('Grupos', 'no-existe');
  off();
  assert.equal(evts.length, 0);
});

test('setClub fusiona con la config existente', () => {
  store.setClub({ colorPrimario: '#123456' });
  store.setClub({ lema: 'Lema' });
  assert.equal(store.club.colorPrimario, '#123456');
  assert.equal(store.club.lema, 'Lema');
  assert.equal(store.club.nombre, 'Club Test');
});

test('persistencia en localStorage: re-init recupera los datos', async () => {
  store.upsert('Grupos', { id: 'g9', nombre: 'Persistente' });
  store.setClub({ lema: 'L' });
  await store.init(ref);
  assert.equal(store.get('Grupos', 'g9').nombre, 'Persistente');
  assert.equal(store.club.lema, 'L');
});

test('clear vacía los datos', () => {
  store.upsert('Grupos', { nombre: 'A' });
  store.clear();
  assert.equal(store.list('Grupos').length, 0);
});

test('seedDemo crea datos coherentes', () => {
  const counts = store.seedDemo();
  for (const s of ENTITY_SHEETS.filter((x) => x !== 'Usuarios' && x !== 'ObjetivosCarga')) assert.ok(counts[s] > 0, `${s} vacío`);
  assert.equal(store.club.nombre, 'Club Natación Lugones');

  const nad = new Set(store.list('Nadadores').map((n) => n.id));
  const gr = new Set(store.list('Grupos').map((g) => g.id));
  const ent = new Set(store.list('Entrenamientos').map((e) => e.id));
  for (const sheet of ['Asistencia', 'Cargas', 'Marcas', 'Banador']) {
    for (const r of store.list(sheet)) assert.ok(nad.has(r.nadadorId), `${sheet} ${r.id}: nadador ${r.nadadorId}`);
  }
  for (const sheet of ['Asistencia', 'Cargas']) {
    for (const r of store.list(sheet)) assert.ok(ent.has(r.entrenamientoId), `${sheet} ${r.id}: entrenamiento`);
  }
  for (const n of store.list('Nadadores')) {
    assert.ok(gr.has(n.grupoId));
    assert.ok(CATEGORIAS.includes(n.categoria));
  }
  for (const e of store.list('Entrenamientos')) assert.ok(gr.has(e.grupoId));
  for (const s of ENTITY_SHEETS) {
    const ids = store.list(s).map((r) => r.id);
    assert.equal(new Set(ids).size, ids.length, `ids duplicados en ${s}`);
  }
  for (const m of store.list('Marcas')) assert.ok(m.tiempoMs > 0);
  for (const c of store.list('Cargas')) assert.ok(c.metros > 0 && c.rpe >= 1 && c.rpe <= 10);
});

test('seedDemo es determinista en datos (sin contar fechas)', () => {
  store.seedDemo();
  const a = store.list('Marcas').map((m) => [m.nadadorId, m.prueba, m.tiempoMs].join('|'));
  store.seedDemo();
  const b = store.list('Marcas').map((m) => [m.nadadorId, m.prueba, m.tiempoMs].join('|'));
  assert.deepEqual(a, b);
});

test('catálogo de contenidos: se siembra al abrir, no se duplica al reabrir ni pisa ediciones', async () => {
  assert.equal(store.list('TiposCarga').length, 10);
  const piernas = store.get('TiposCarga', 'tc-piernas');
  store.upsert('TiposCarga', { ...piernas, color: '#123456', descripcion: 'Mi descripción', minSemanalM: 700 });
  store.remove('TiposCarga', 'tc-brazos'); // p. ej. borrado a mano en la hoja: se repone
  await store.init(ref);
  assert.equal(store.list('TiposCarga').length, 10);
  const p = store.get('TiposCarga', 'tc-piernas');
  assert.deepEqual([p.color, p.descripcion, p.minSemanalM], ['#123456', 'Mi descripción', 700]);
  assert.ok(store.get('TiposCarga', 'tc-brazos'));
  await store.init(ref);
  assert.equal(store.list('TiposCarga').length, 10, 'idempotente');
});

test('catálogo de contenidos: migra cargas y objetivos antiguos sin perder nada', async () => {
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
  assert.deepEqual(store.list('Cargas').map((c) => c.tipo).sort(), ['Técnica', 'Velocidad'], 'las cargas no se tocan');
  await store.init(ref);
  assert.equal(store.list('TiposCarga').length, 11, 'segunda apertura: sin cambios');
});

test('catálogo de contenidos: clear lo vuelve a sembrar', () => {
  store.clear();
  assert.equal(store.list('TiposCarga').length, 10);
});

test('init sin club de Drive falla (no hay modo local)', async () => {
  await assert.rejects(store.init('Club Test'), /Falta el club/);
  await assert.rejects(store.init(null), /Falta el club/);
});

test('sync sube el club a cnl/<Club>.json con la forma {version, club, hojas}', async () => {
  const g = store.upsert('Grupos', { nombre: 'Promoción' });
  store.setClub({ lema: 'Lema' });
  assert.equal(store.status, 'pendiente');
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  const doc = fake.club(ref.id).doc;
  assert.equal(doc.version, 1);
  assert.equal(doc.club.lema, 'Lema');
  assert.deepEqual(doc.hojas.Grupos.map((r) => r.id), [g.id]);
  assert.equal('Usuarios' in doc.hojas, false, 'sin hoja de usuarios');
});

test('refresh incorpora los cambios hechos desde otro dispositivo', async () => {
  await store.sync();
  assert.equal(await store.refresh(), false, 'sin cambios');
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'ext1', nombre: 'Externo', categoria: '', entrenador: '' }); });
  const evts = [];
  const off = store.on((e) => evts.push(e.type));
  assert.equal(await store.refresh(), true);
  off();
  assert.equal(store.get('Grupos', 'ext1').nombre, 'Externo');
  assert.ok(evts.includes('remote'));
  assert.equal(await store.refresh(), false);
});

test('sync fusiona por fila: se conservan los cambios locales y los remotos', async () => {
  await store.sync();
  store.upsert('Grupos', { id: 'loc1', nombre: 'Local' });
  fake.editarClubExterno(ref.id, (d) => { d.hojas.Grupos.push({ id: 'ext1', nombre: 'Externo', categoria: '', entrenador: '' }); });
  await store.sync();
  assert.deepEqual(store.list('Grupos').map((g) => g.id).sort(), ['ext1', 'loc1']);
  assert.deepEqual(fake.club(ref.id).doc.hojas.Grupos.map((g) => g.id).sort(), ['ext1', 'loc1']);
});

test('sin conexión los cambios quedan en la cola y se suben al volver', async () => {
  await store.sync();
  fake.opciones.fallos.escribir = 'offline';
  store.upsert('Grupos', { id: 'g1', nombre: 'Pendiente' });
  await assert.rejects(store.sync(), /conexión/);
  assert.equal(store.status, 'offline');
  assert.ok(JSON.parse(localStorage.getItem('cnl:club:' + ref.id)).dirty, 'la caché local guarda la marca de pendiente');
  assert.equal(fake.club(ref.id).doc.hojas.Grupos.length, 0);
  fake.opciones.fallos.escribir = null;
  await store.sync();
  assert.equal(store.status, 'sincronizado');
  assert.equal(fake.club(ref.id).doc.hojas.Grupos[0].nombre, 'Pendiente');
});

test('al cambiar el nombre del club se renombra el fichero en Drive', async () => {
  store.setClub({ nombre: 'Club Renombrado' });
  await store.sync();
  assert.equal(fake.club(ref.id).name, 'Club Renombrado');
  assert.equal(store.clubRef.name, 'Club Renombrado');
});

test('guardarXlsxEnDrive sube (y luego reemplaza) la copia .xlsx en cnl', async () => {
  const a = await store.guardarXlsxEnDrive();
  const b = await store.guardarXlsxEnDrive();
  assert.equal(a.id, b.id, 'no duplica el fichero');
  assert.deepEqual(fake.archivos().filter((f) => f.name.endsWith('.xlsx')).map((f) => f.name), ['Club Test.xlsx']);
});
});
