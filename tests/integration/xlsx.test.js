import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick } from '../helpers/app.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const snapshot = (store) => JSON.parse(JSON.stringify(Object.fromEntries(
  ['Nadadores', 'Grupos', 'Entrenamientos', 'Asistencia', 'Cargas', 'Marcas', 'Comunicaciones', 'ObjetivosCarga', 'Banador']
    .map((s) => [s, store.list(s)]))));

test('exportXlsx genera un libro con una hoja por entidad y cabeceras exactas', async () => {
  const blob = await c.store.exportXlsx();
  assert.ok(blob.size > 1000);
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  const { SHEETS } = await import('../../js/schema.js');
  assert.deepEqual([...wb.SheetNames].sort(), Object.keys(SHEETS).sort());
  for (const [name, cols] of Object.entries(SHEETS)) {
    const header = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 })[0];
    assert.deepEqual(header, cols, name);
  }
});

test('round-trip export -> clear -> import conserva todos los datos', async () => {
  const antes = snapshot(c.store);
  const club = { ...c.store.club };
  const blob = await c.store.exportXlsx();
  c.store.clear();
  assert.equal(c.store.list('Nadadores').length, 0);
  await c.store.importXlsx(blob);
  assert.deepEqual(snapshot(c.store), antes);
  assert.equal(c.store.club.nombre, club.nombre);
  assert.equal(c.store.club.lema, club.lema);
  assert.equal(c.store.club.colorPrimario, club.colorPrimario);
});

test('importar un xlsx de datos mínimos rellena columnas ausentes y descarta filas sin id', async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ id: 1, nombre: 'Solo', apellidos: 'Nombre' }, { nombre: 'sin id' }]), 'Nadadores');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  await c.store.importXlsx(new Blob([buf]));
  const l = c.store.list('Nadadores');
  assert.equal(l.length, 1);
  assert.equal(l[0].id, '1');
  assert.equal(l[0].categoria, '');
  assert.equal(c.store.list('Marcas').length, 0);
});

test('tras importar, las vistas renderizan los datos importados', async () => {
  const blob = await c.store.exportXlsx();
  c.store.clear();
  await c.store.importXlsx(blob);
  await renderView('nadadores', c.container, [], c);
  assert.match(c.container.textContent, /12 nadadores/);
  await renderView('marcas', c.container, [], c);
  assert.ok(c.container.querySelectorAll('.mc-time').length > 0);
});

test('club: botón Importar reemplaza datos tras confirmar', async () => {
  const blob = await c.store.exportXlsx();
  c.store.clear();
  await renderView('club', c.container, [], c);
  const input = c.container.querySelector('input[type=file][accept=".xlsx"]');
  Object.defineProperty(input, 'files', { value: [blob], configurable: true });
  input.dispatchEvent(new window.Event('change'));
  await tick(60);
  assert.match(document.querySelector('#import-previa').textContent, /Nadadores/, 'vista previa con el recuento por hoja');
  assert.equal(c.store.list('Nadadores').length, 0, 'nada cambia hasta confirmar');
  [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent === 'Importar y sustituir').click();
  await tick(150);
  assert.equal(c.store.list('Nadadores').length, 12);
});
