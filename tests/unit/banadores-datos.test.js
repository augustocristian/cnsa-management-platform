// Pure data side of the swimsuit catalogue: schema, the retired "Banador" sheet (old files still load, the sheet is dropped and its
// personal data is not written back) and text normalisation. Store-level cases: tests/integration/banadores-datos.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv({ loadXlsx: true });
const { docToData, dataToDoc, mergeData, RELACIONES } = await importApp('js/domain/sheetdata.js');
const { SHEETS, ENTITY_SHEETS, HOJAS_RETIRADAS } = await importApp('js/domain/schema.js');
const { validarFila } = await importApp('js/domain/validacion.js');

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
