// Data side of the swimsuit catalogue: the new sheet round trip, the retired "Banador" sheet (old files still load, the sheet is
// dropped, its personal data is not written back), demo data consistency and the soft Marcas.banadorId reference.
import test, { describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv({ loadXlsx: true });
const { store } = await importApp('js/store.js');
const { auth } = await importApp('js/auth.js');
const { drive } = await importApp('js/drive.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');
const { docToData, dataToDoc, mergeData, RELACIONES } = await importApp('js/sheetdata.js');
const { SHEETS, ENTITY_SHEETS, HOJAS_RETIRADAS } = await importApp('js/schema.js');
const { validarFila } = await importApp('js/domain/validacion.js');
const D = await importApp('js/domain/banadores.js');

const docAntiguo = () => ({
  version: 1,
  club: { nombre: 'Club Viejo' },
  hojas: {
    Nadadores: [{ id: 'n1', nombre: 'Ana', apellidos: 'Pérez', fechaNacimiento: '2012-05-04' }],
    Marcas: [{ id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '100 Libre', piscina: '25', tiempoMs: 65000, competicion: 'Copa', notas: '' }],
    Banador: [{ id: 'b1', nadadorId: 'n1', talla: 'M', estado: 'entregado', fecha: '2026-05-01', notas: 'dato personal' }],
    'Hoja Futura': [{ id: 'f1' }],
  },
  sync: { reloj: 5, sellos: { Banador: { b1: '3@x' }, Marcas: { m1: '2@x' } }, lapidas: { Banador: { b0: { s: '4@x' } } } },
});

test('schema: Banadores is an entity sheet, Banador is retired, Marcas has the optional banadorId', () => {
  assert.ok(ENTITY_SHEETS.includes('Banadores'));
  assert.equal(ENTITY_SHEETS.includes('Banador'), false);
  assert.deepEqual(HOJAS_RETIRADAS, ['Banador']);
  assert.equal(SHEETS.Marcas.at(-1), 'banadorId');
  assert.equal(RELACIONES.some(([hijo, , padre]) => hijo === 'Banador' || padre === 'Banadores'), false, 'no cascade from/to suits');
});

test('migration: a file with the old Banador sheet loads without error and the sheet is dropped (not kept as extra)', () => {
  const d = docToData(docAntiguo());
  assert.equal(d.db.Nadadores.length, 1);
  assert.equal(d.db.Marcas[0].banadorId, '', 'old marks read the new column as empty');
  assert.deepEqual(d.db.Banadores, []);
  assert.equal('Banador' in d.extra.hojas, false);
  assert.ok('Hoja Futura' in d.extra.hojas, 'other unknown sheets are still preserved');
  assert.equal('Banador' in d.meta.sellos, false);
  assert.equal('Banador' in d.meta.lapidas, false);
  assert.deepEqual(d.avisos, []);
  const doc = dataToDoc(d);
  assert.equal('Banador' in doc.hojas, false, 'not written back');
  assert.deepEqual(doc.hojas.Banadores, []);
  assert.ok('Hoja Futura' in doc.hojas);
  assert.equal(JSON.stringify(doc).includes('dato personal'), false);
});

test('migration: an old Banador sheet coming from a stale cache (extra.hojas) is not written back either', () => {
  const d = docToData(docAntiguo());
  d.extra.hojas.Banador = [{ id: 'b1', nadadorId: 'n1' }];
  assert.equal('Banador' in dataToDoc(d).hojas, false);
  const m = mergeData(null, d, docToData(docAntiguo()));
  assert.equal('Banador' in dataToDoc(m).hojas, false);
});

test('Banadores rows keep text columns as text (a numeric brand from Excel) and validate as dates-free', () => {
  const d = docToData({ version: 1, hojas: { Banadores: [{ id: 'b1', tipo: 'competicion', marca: 2020, modelo: 1, activo: true, notas: '' }] } });
  assert.deepEqual([d.db.Banadores[0].marca, d.db.Banadores[0].modelo, d.db.Banadores[0].activo], ['2020', '1', 'true']);
  assert.deepEqual(validarFila('Banadores', d.db.Banadores[0]), []);
});

describe('store with the simulated Drive', () => {
  let fake;
  let ref;
  beforeEach(async () => {
    localStorage.clear();
    auth.caducada = false;
    if (fake) fake.desinstalar();
    fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true } });
    await auth.init();
    ref = await drive.createClub('Club Viejo');
    await store.init(ref);
  });
  after(() => { if (fake) fake.desinstalar(); });

  test('opening a club file that still has the old Banador sheet works, and the next write removes it from Drive', async () => {
    fake.editarClubExterno(ref.id, (d) => Object.assign(d, docAntiguo()));
    await store.refresh();
    assert.equal(store.list('Nadadores').length, 1);
    assert.equal(store.list('Banador').length, 0, 'the sheet no longer exists in the store');
    assert.equal(store.problema, null);
    store.upsert('Banadores', { id: 'bn1', tipo: 'competicion', marca: 'Arena', modelo: 'Powerskin Carbon Core FX', activo: 'true' });
    store.upsert('Marcas', { ...store.get('Marcas', 'm1'), banadorId: 'bn1' });
    await store.sync();
    const doc = fake.club(ref.id).doc;
    assert.equal('Banador' in doc.hojas, false);
    assert.equal(doc.hojas.Banadores[0].modelo, 'Powerskin Carbon Core FX');
    assert.equal(doc.hojas.Marcas[0].banadorId, 'bn1');
  });

  test('deleting a swimmer or a suit never cascades into the other', async () => {
    store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'P', fechaNacimiento: '2012-05-04' });
    store.upsert('Banadores', { id: 'bn1', tipo: 'entrenamiento', marca: 'Speedo', modelo: 'Endurance+', activo: 'true' });
    store.upsert('Marcas', { id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '50 Libre', tiempoMs: 30000, banadorId: 'bn1' });
    await store.purgarNadador('n1', { borrarEnDrive: false });
    assert.equal(store.list('Marcas').length, 0);
    assert.equal(store.list('Banadores').length, 1, 'suits are club data, not the swimmer\'s');
    store.upsert('Nadadores', { id: 'n2', nombre: 'Bea', apellidos: 'R', fechaNacimiento: '2013-05-04' });
    assert.equal('Banadores' in store.datosNadador('n2').hojas, false, 'the swimmer\'s data export does not include the catalogue');
  });

  test('a mark whose suit was deleted on another device keeps existing (dangling id = no suit)', async () => {
    store.upsert('Nadadores', { id: 'n1', nombre: 'Ana', apellidos: 'P', fechaNacimiento: '2012-05-04' });
    store.upsert('Banadores', { id: 'bn1', tipo: 'competicion', marca: 'Arena', modelo: 'X', activo: 'true' });
    store.upsert('Marcas', { id: 'm1', nadadorId: 'n1', fecha: '2026-09-01', prueba: '50 Libre', tiempoMs: 30000, banadorId: 'bn1' });
    await store.sync();
    fake.editarClubExterno(ref.id, (d) => { d.hojas.Banadores = []; d.sync.lapidas.Banadores = { bn1: { s: '99@otro' } }; d.sync.reloj = 99; });
    await store.refresh();
    assert.equal(store.list('Banadores').length, 0);
    assert.equal(store.list('Marcas').length, 1, 'the mark survives');
    assert.equal(D.banadorDeMarca(store.list('Marcas')[0], store.list('Banadores').map(D.normalizarBanador)), null);
  });

  test('seedDemo: 5 suits (2 training, 3 fast skins), marks use them consistently and some have none', () => {
    store.seedDemo();
    const suits = store.list('Banadores').map(D.normalizarBanador);
    assert.equal(suits.length, 5);
    assert.deepEqual([suits.filter((b) => b.tipo === 'entrenamiento').length, suits.filter((b) => b.tipo === 'competicion').length], [2, 3]);
    assert.ok(suits.filter((b) => b.tipo === 'competicion').every((b) => b.marca && b.modelo));
    assert.deepEqual(D.validarBanador(suits[0], suits.slice(1), { id: suits[0].id }), []);
    assert.equal(new Set(suits.map(D.claveBanador)).size, 5, 'unique (type, brand, model)');
    const marcas = store.list('Marcas');
    const ids = new Set(suits.map((b) => b.id));
    assert.ok(marcas.every((m) => m.banadorId === '' || ids.has(m.banadorId)), 'no dangling references');
    for (const m of marcas.filter((x) => x.banadorId)) {
      const b = suits.find((s) => s.id === m.banadorId);
      assert.equal(b.tipo, m.competicion ? 'competicion' : 'entrenamiento', `${m.id}: suit type matches competition/test`);
    }
    const cuenta = D.conteoMarcasPorBanador(suits, marcas);
    assert.ok([...cuenta.values()].every((n) => n > 0), 'every demo suit is used by at least one mark');
    assert.ok(marcas.some((m) => !m.banadorId), 'some marks have no suit');
    assert.equal(store.list('Banador').length, 0);
  });
});
