import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';

let c;
let vista;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); vista = await import('../../js/views/banadores-catalogo.js'); return fn(t); });

const abrir = async (opts) => { const h = vista.abrirCatalogoBanadores({ store: c.store, ui: c.ui }, opts); await tick(); return h; };
// The catalogue dialog is the first sheet; a form/delete dialog opened on top of it is the last one.
const dialogos = () => [...document.querySelectorAll('.modal')];
const catalogo = () => dialogos()[0];
const superior = () => dialogos().at(-1);
const item = (nombre) => [...catalogo().querySelectorAll('.bn-item')].find((li) => li.querySelector('.bn-nombre').textContent === nombre);
const boton = (li, prefijo) => [...li.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent).startsWith(prefijo));
const nombres = (tipo) => [...catalogo().querySelectorAll(`.bn-grupo[data-tipo="${tipo}"] .bn-nombre`)].map((n) => n.textContent);
const porNombre = (marca, modelo) => c.store.list('Banadores').find((b) => b.marca === marca && b.modelo === modelo);

async function crear({ tipo, marca, modelo, notas }) {
  buttonByText(catalogo(), 'Nuevo bañador').click();
  await tick();
  const m = superior();
  if (tipo) setValue(fieldByLabel(m, 'Tipo'), tipo);
  setValue(fieldByLabel(m, 'Marca'), marca ?? '');
  setValue(fieldByLabel(m, 'Modelo'), modelo ?? '');
  if (notas) setValue(fieldByLabel(m, 'Notas'), notas);
  buttonByText(m, 'Guardar').click();
  await tick(10);
}

test('lists the demo catalogue grouped by type, with the number of marks each suit has', async () => {
  await abrir();
  assert.deepEqual([...catalogo().querySelectorAll('.bn-grupo-titulo')].map((h) => h.textContent), ['Entrenamiento', 'Competición (bañadores técnicos)']);
  assert.deepEqual(nombres('entrenamiento'), ['Arena Solid', 'Speedo Endurance+']);
  assert.deepEqual(nombres('competicion'), ['Arena Powerskin Carbon Core FX', 'Mizuno GX Sonic V', 'Speedo Fastskin LZR Pure Intent']);
  const fast = porNombre('Arena', 'Powerskin Carbon Core FX');
  const n = c.store.list('Marcas').filter((m) => m.banadorId === fast.id).length;
  assert.ok(n > 0);
  assert.match(item('Arena Powerskin Carbon Core FX').querySelector('.bn-usos').textContent, new RegExp(`^${n} marca`));
});

test('create: a competition suit needs brand and model (inline errors), then it is saved and listed', async () => {
  await abrir();
  buttonByText(catalogo(), 'Nuevo bañador').click();
  await tick();
  const m = superior();
  setValue(fieldByLabel(m, 'Tipo'), 'competicion');
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.ok(superior() === m, 'the form stays open');
  const errores = [...m.querySelectorAll('.field-error')].map((e) => e.textContent);
  assert.equal(errores.length, 2);
  assert.match(errores[0], /marca es obligatoria/);
  assert.match(errores[1], /modelo es obligatorio/);
  assert.equal(fieldByLabel(m, 'Marca').getAttribute('aria-invalid'), 'true');
  assert.equal(c.store.list('Banadores').length, 5);
  setValue(fieldByLabel(m, 'Marca'), 'TYR');
  setValue(fieldByLabel(m, 'Modelo'), 'Venzo Genesis');
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.equal(dialogos().length, 1, 'the form closes');
  const b = porNombre('TYR', 'Venzo Genesis');
  assert.deepEqual([b.tipo, b.activo], ['competicion', 'true']);
  assert.ok(item('TYR Venzo Genesis'));
  assert.match(document.querySelector('#toasts').textContent, /Bañador «TYR Venzo Genesis» creado/);
});

test('create: a training suit may be generic or have only a brand; a duplicate (case/accent-insensitive) is rejected', async () => {
  await abrir();
  await crear({ tipo: 'entrenamiento', marca: 'Finis', modelo: '' });
  assert.ok(porNombre('Finis', ''));
  assert.ok(item('Finis'));
  await crear({ tipo: 'entrenamiento', marca: 'ARENA', modelo: 'solid' });
  assert.equal(dialogos().length, 2, 'form still open');
  assert.match(superior().querySelector('.field-error').textContent, /Ya existe un bañador de este tipo con la misma marca y modelo/);
  assert.equal(c.store.list('Banadores').filter((b) => b.modelo === 'Solid').length, 1);
});

test('edit: changes brand and model and refreshes the list; onCambio is notified', async () => {
  let avisos = 0;
  await abrir({ onCambio: () => { avisos++; } });
  boton(item('Mizuno GX Sonic V'), 'Editar').click();
  await tick();
  const m = superior();
  assert.equal(fieldByLabel(m, 'Marca').value, 'Mizuno');
  setValue(fieldByLabel(m, 'Modelo'), 'GX Sonic VI');
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.ok(item('Mizuno GX Sonic VI'));
  assert.equal(item('Mizuno GX Sonic V'), undefined);
  assert.equal(avisos, 1);
});

test('deactivate with undo: the suit stays listed as inactive and the toast can undo it', async () => {
  await abrir();
  boton(item('Speedo Endurance+'), 'Desactivar').click();
  await tick();
  const b = porNombre('Speedo', 'Endurance+');
  assert.equal(b.activo, 'false');
  assert.ok(item('Speedo Endurance+').classList.contains('bn-inactivo'));
  assert.match(item('Speedo Endurance+').textContent, /Inactivo/);
  assert.deepEqual(nombres('entrenamiento'), ['Arena Solid', 'Speedo Endurance+'], 'inactive last in its group');
  [...document.querySelectorAll('#toasts button')].find((x) => x.textContent === 'Deshacer').click();
  await tick(10);
  assert.equal(porNombre('Speedo', 'Endurance+').activo, 'true');
  assert.equal(item('Speedo Endurance+').classList.contains('bn-inactivo'), false);
});

test('delete an unused suit with undo; restoring brings it back with the same id', async () => {
  await abrir();
  const antes = porNombre('Mizuno', 'GX Sonic V');
  c.store.list('Marcas').filter((m) => m.banadorId === antes.id).forEach((m) => c.store.upsert('Marcas', { ...m, banadorId: '' }));
  boton(item('Mizuno GX Sonic V'), 'Eliminar').click();
  await tick(10);
  assert.equal(dialogos().length, 1, 'no confirmation: undo instead');
  assert.equal(porNombre('Mizuno', 'GX Sonic V'), undefined);
  assert.equal(item('Mizuno GX Sonic V'), undefined);
  [...document.querySelectorAll('#toasts button')].find((x) => x.textContent === 'Deshacer').click();
  await tick(10);
  assert.equal(porNombre('Mizuno', 'GX Sonic V').id, antes.id);
  assert.ok(item('Mizuno GX Sonic V'));
});

test('delete guard: a suit used by marks cannot be deleted; offer to deactivate or merge (marks are reassigned)', async () => {
  await abrir();
  const origen = porNombre('Arena', 'Powerskin Carbon Core FX');
  const destino = porNombre('Speedo', 'Fastskin LZR Pure Intent');
  const n = c.store.list('Marcas').filter((m) => m.banadorId === origen.id).length;
  const nDestino = c.store.list('Marcas').filter((m) => m.banadorId === destino.id).length;
  boton(item('Arena Powerskin Carbon Core FX'), 'Eliminar').click();
  await tick(10);
  const m = superior();
  assert.notEqual(m, catalogo());
  assert.match(m.textContent, new RegExp(`figura en ${n} marcas, así que no se puede eliminar`));
  assert.ok(c.store.get('Banadores', origen.id), 'not deleted');
  // merge
  const sel = m.querySelector('select');
  setValue(sel, destino.id);
  buttonByText(m, 'Unir y eliminar').click();
  await tick(10);
  assert.equal(c.store.get('Banadores', origen.id), null);
  assert.equal(c.store.list('Marcas').filter((x) => x.banadorId === destino.id).length, n + nDestino);
  assert.equal(c.store.list('Marcas').filter((x) => x.banadorId === origen.id).length, 0);
  assert.ok(item('Speedo Fastskin LZR Pure Intent'));
});

test('delete guard: "Deactivate" from the in-use dialog keeps the suit and its marks', async () => {
  await abrir();
  const b = porNombre('Speedo', 'Fastskin LZR Pure Intent');
  const n = c.store.list('Marcas').filter((m) => m.banadorId === b.id).length;
  boton(item('Speedo Fastskin LZR Pure Intent'), 'Eliminar').click();
  await tick(10);
  buttonByText(superior(), 'Desactivar').click();
  await tick(10);
  assert.equal(c.store.get('Banadores', b.id).activo, 'false');
  assert.equal(c.store.list('Marcas').filter((m) => m.banadorId === b.id).length, n);
  assert.ok(item('Speedo Fastskin LZR Pure Intent').classList.contains('bn-inactivo'));
});

test('empty catalogue: empty state with a call to action that opens the form', async () => {
  c.store.list('Banadores').forEach((b) => c.store.remove('Banadores', b.id));
  await abrir();
  assert.match(catalogo().querySelector('.empty-title').textContent, /Todavía no hay bañadores/);
  buttonByText(catalogo(), 'Nuevo bañador').click();
  await tick();
  assert.equal(dialogos().length, 2);
});

test('display helpers: translated label and type names follow the language', async () => {
  const { setLang } = await import('../../js/i18n.js');
  const b = c.store.list('Banadores').find((x) => x.tipo === 'competicion');
  const D = await import('../../js/domain/banadores.js');
  const nb = D.normalizarBanador(b);
  assert.match(vista.etiquetaBanadorTraducida(nb), /— bañador técnico$/);
  setLang('en', { persist: false });
  assert.match(vista.etiquetaBanadorTraducida(nb), /— fast skin$/);
  assert.equal(vista.etiquetaTipoBanador('entrenamiento'), 'Training suit');
  assert.equal(vista.etiquetaTipoBanador('competicion'), 'Fast skin (competition)');
  setLang('es', { persist: false });
});
