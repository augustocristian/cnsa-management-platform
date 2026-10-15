import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { store } = await importApp('js/store.js');
const { SHEETS, ENTITY_SHEETS, CATEGORIAS } = await importApp('js/schema.js');

beforeEach(async () => {
  localStorage.clear();
  await store.init('Club Test');
});

test('init en modo local: estado local y nombre del club', () => {
  assert.equal(store.status, 'local');
  assert.equal(store.club.nombre, 'Club Test');
  for (const s of ENTITY_SHEETS) assert.deepEqual(store.list(s), []);
  assert.deepEqual(store.localClubs(), [{ name: 'Club Test', local: true }]);
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
  const off = store.on((e) => evts.push(e));
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
  const off = store.on((e) => evts.push(e));
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
  await store.init('Club Test');
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
  for (const s of ENTITY_SHEETS.filter((x) => x !== 'Usuarios')) assert.ok(counts[s] > 0, `${s} vacío`);
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
