import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const today = () => c.ui.isoDate(new Date());
const vista = () => renderView('marcas', c.container, [], c);
const limpiar = () => c.store.removeMany('Marcas', c.store.list('Marcas').map((m) => m.id));
const marca = (o) => c.store.upsert('Marcas', { nadadorId: 'n04', fecha: '2026-03-01', prueba: '100 Libre', piscina: '25', tiempoMs: 62000, competicion: '', notas: '', ...o });
const filtro = (n) => c.container.querySelectorAll('.mc-filters select')[n];
const opciones = (sel) => [...sel.options].map((o) => o.textContent);
const filasHistorial = () => [...c.container.querySelectorAll('.card')].find((x) => x.querySelector('h2').textContent === 'Historial').querySelectorAll('tbody tr');
const abrir = async () => { buttonByText(c.container, 'Registrar marca').click(); await tick(); return document.querySelector('.sheet'); };

test('the event filter lists each event ONCE and selecting it shows its marks (lowercase legacy names included)', async () => {
  limpiar();
  marca({ id: 'a', prueba: '100 libre', tiempoMs: 64000 });
  marca({ id: 'b', prueba: '100 Libre', tiempoMs: 62000, fecha: '2026-04-01' });
  marca({ id: 'c', prueba: '50 espalda', tiempoMs: 33000 });
  await vista();
  assert.deepEqual(opciones(filtro(1)), ['Todas las pruebas', '100 Libre', '50 Espalda']);
  setValue(filtro(1), '100 Libre');
  assert.equal(filasHistorial().length, 2, 'both spellings are found');
  assert.doesNotMatch(c.container.textContent, /Sin marcas con estos filtros/);
  assert.deepEqual(c.store.list('Marcas').map((m) => m.prueba).sort(), ['100 Libre', '100 Libre', '50 Espalda'], 'migrated to the canonical name');
});

test('no stray "null" text without active filters', async () => {
  await vista();
  assert.doesNotMatch(c.container.textContent, /null|undefined|NaN/);
});

test('the demo stores canonical event names', async () => {
  const nombres = new Set(c.store.list('Marcas').map((m) => m.prueba));
  assert.ok([...nombres].every((p) => /^\d+ [A-Z]/.test(p)), [...nombres].join());
});

test('the evolution chart is shown by default for the swimmer with most marks, with PB marked and a scroll box', async () => {
  limpiar();
  marca({ nadadorId: 'n01', prueba: '50 Libre', tiempoMs: 30000 });
  for (const [f, ms] of [['2026-01-10', 64000], ['2026-02-10', 62000], ['2026-03-10', 63000]]) marca({ nadadorId: 'n02', fecha: f, tiempoMs: ms });
  await vista();
  const svg = c.container.querySelector('svg.mc-svg');
  assert.ok(svg);
  assert.equal(svg.querySelectorAll('circle').length, 3);
  assert.equal(svg.querySelectorAll('circle.mc-dot--pb').length, 1);
  assert.ok(svg.querySelector('text.mc-pb-label'), 'PB also as text, not only colour');
  assert.ok(svg.getAttribute('aria-label'));
  assert.equal(c.container.querySelector('.mc-scroll').getAttribute('tabindex'), '0');
  assert.match(c.container.querySelector('.mc-chart-title').textContent, /Marcos|Nadador|100 Libre/);
  assert.match(c.container.querySelector('.mc-chart-title').textContent, /100 Freestyle|100 Libre/);
});

test('PB badge has accessible text and sits only on the best time of each swimmer + event + pool', async () => {
  limpiar();
  marca({ id: 'a', tiempoMs: 64000 });
  marca({ id: 'b', tiempoMs: 62000, fecha: '2026-04-01' });
  marca({ id: 'c', tiempoMs: 70000, piscina: '50' });
  await vista();
  const badges = c.container.querySelectorAll('.mc-pb');
  assert.equal(badges.length, 2);
  assert.equal(badges[0].querySelector('[aria-hidden="true"]').textContent, 'PB');
  assert.equal(badges[0].querySelector('.sr-only').textContent, 'Mejor marca personal');
  const pbRows = [...badges].map((b) => b.closest('tr').dataset.id).sort();
  assert.deepEqual(pbRows, ['b', 'c']);
});

test('history is paginated 50 at a time with "Ver más"', async () => {
  limpiar();
  c.store.upsertMany('Marcas', Array.from({ length: 120 }, (_, i) => ({ nadadorId: 'n04', fecha: `2025-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`, prueba: '100 Libre', piscina: '25', tiempoMs: 70000 + i * 10, competicion: '', notas: '' })));
  await vista();
  assert.equal(filasHistorial().length, 50);
  assert.match(c.container.textContent, /Mostrando 50 de 120/);
  buttonByText(c.container, 'Ver más (70 restantes)').click();
  assert.equal(filasHistorial().length, 100);
  buttonByText(c.container, 'Ver más (20 restantes)').click();
  assert.equal(filasHistorial().length, 120);
  assert.ok(![...c.container.querySelectorAll('button')].some((b) => /Ver más/.test(b.textContent)));
});

test('deleting a time offers Undo', async () => {
  limpiar();
  marca({ id: 'a' });
  await vista();
  c.container.querySelector('tr[data-id="a"] button[aria-label^="Eliminar la marca"]').click();
  await tick();
  assert.equal(c.store.get('Marcas', 'a'), null);
  [...document.querySelectorAll('#toasts .toast-action')].find((b) => /Deshacer/.test(b.textContent)).click();
  await tick();
  assert.equal(c.store.get('Marcas', 'a').tiempoMs, 62000);
});

test('add-time sheet: inline validation, numeric mask with live interpretation and the swimsuit select', async () => {
  limpiar();
  await vista();
  assert.ok(c.container.querySelector('.empty'), 'empty state with a call to action');
  const d = await abrir();
  buttonByText(d, 'Registrar').click();
  await tick();
  assert.deepEqual([...d.querySelectorAll('.field-error')].map((e) => e.textContent.trim()), ['Elige un nadador de la lista', 'Indica el tiempo (por ejemplo 1:02.45)']);
  const tiempo = fieldByLabel(d, 'Tiempo');
  assert.equal(tiempo.getAttribute('inputmode'), 'numeric');
  setValue(tiempo, '10245');
  assert.equal(tiempo.value, '1:02.45');
  assert.match(d.querySelector('.mc-live').textContent, /Se guardará como 01:02\.45/);
  const sel = fieldByLabel(d, 'Bañador');
  assert.deepEqual([...sel.querySelectorAll('optgroup')].map((g) => g.label.length > 0), [true, true]);
  assert.equal(sel.options[0].textContent, 'Sin indicar');
  assert.equal(sel.options[sel.options.length - 1].textContent, 'Añadir bañador…');
  setValue(fieldByLabel(d, 'Nadador'), 'Carla Menéndez');
  setValue(fieldByLabel(d, 'Fecha'), today());
  setValue(sel, 'bn3');
  buttonByText(d, 'Registrar').click();
  await tick(10);
  const m = c.store.list('Marcas')[0];
  assert.deepEqual([m.nadadorId, m.prueba, m.tiempoMs, m.banadorId], ['n04', '50 Libre', 62450, 'bn3']);
  assert.ok(c.container.querySelector('tr.is-new'));
  assert.equal(document.activeElement, c.container.querySelector('.mc-add'));
});

test('swimsuit filters: type, brand and model cascade, show as chips and drive the PB and the chart', async () => {
  limpiar();
  marca({ id: 'ent', tiempoMs: 66000, banadorId: 'bn1', fecha: '2026-01-01' });
  marca({ id: 'fast1', tiempoMs: 61000, banadorId: 'bn3', fecha: '2026-02-01' });
  marca({ id: 'fast2', tiempoMs: 62500, banadorId: 'bn4', fecha: '2026-03-01' });
  marca({ id: 'sin', tiempoMs: 64000, fecha: '2026-04-01' });
  await vista();
  const pbs = () => [...c.container.querySelectorAll('.mc-pb')].map((b) => b.closest('tr').dataset.id);
  assert.deepEqual(pbs(), ['fast1']);
  const tipo = filtro(3);
  assert.match(opciones(tipo).join('|'), /Todos.*bañador de entrenamiento \(1\).*bañador técnico \(competición\) \(2\).*Sin bañador indicado \(1\)/is);

  setValue(tipo, 'entrenamiento');
  assert.equal(filasHistorial().length, 1);
  assert.deepEqual(pbs(), ['ent'], 'the PB follows the suit filter');
  assert.equal(c.container.querySelectorAll('svg.mc-svg circle').length, 1);
  assert.ok(c.container.querySelector('.mc-chips .chip'), 'active filter as a chip');

  setValue(c.container.querySelectorAll('.mc-filters select')[3], 'competicion');
  assert.equal(filasHistorial().length, 2);
  assert.deepEqual(pbs(), ['fast1']);
  const marcas = opciones(c.container.querySelectorAll('.mc-filters select')[4]);
  assert.ok(marcas.some((x) => /^Arena/.test(x)) && marcas.some((x) => /^Speedo/.test(x)) && !marcas.some((x) => /^Mizuno/.test(x)), marcas.join());
  setValue(c.container.querySelectorAll('.mc-filters select')[4], 'speedo');
  assert.equal(filasHistorial().length, 1);
  assert.deepEqual(pbs(), ['fast2']);
  assert.match(filasHistorial()[0].textContent, /Speedo Fastskin LZR Pure Intent/, 'the suit is shown per mark');
  assert.deepEqual(opciones(c.container.querySelectorAll('.mc-filters select')[5]).length, 2);

  // remove the type chip: brand and model go with it (they no longer apply)
  const chips = [...c.container.querySelectorAll('.mc-chips .chip')];
  chips.find((x) => /Quitar filtro: .*técnico/.test(x.getAttribute('aria-label'))).click();
  assert.equal(filasHistorial().length, 4, 'removing the type chip also drops brand and model');
  setValue(c.container.querySelectorAll('.mc-filters select')[3], 'sin-banador');
  assert.equal(filasHistorial().length, 1);
  assert.match(filasHistorial()[0].textContent, /—/);
});

test('swimsuit filters persist while navigating inside the session', async () => {
  limpiar();
  marca({ id: 'ent', banadorId: 'bn1' });
  marca({ id: 'fast', banadorId: 'bn3', tiempoMs: 60000 });
  await vista();
  setValue(c.container.querySelectorAll('.mc-filters select')[3], 'competicion');
  await renderView('inicio', c.container, [], c);
  await vista();
  assert.equal(c.container.querySelectorAll('.mc-filters select')[3].value, 'competicion');
  assert.equal(filasHistorial().length, 1);
});

test('"Gestionar bañadores" opens the swimsuit catalogue', async () => {
  await vista();
  buttonByText(c.container, 'Gestionar bañadores').click();
  await tick();
  assert.ok(document.querySelector('.sheet .bn-host, .sheet'));
  assert.match(document.querySelector('.sheet').textContent, /Arena/);
});

test('the view works with no marks and in English/Italian', async () => {
  limpiar();
  await vista();
  assert.match(c.container.textContent, /Aún no hay marcas/);
  marca({});
  const { setLang } = await import('../../js/presentation/i18n/i18n.js');
  setLang('en', { persist: false });
  await vista();
  assert.match(c.container.textContent, /Personal bests/);
  assert.match(c.container.textContent, /100 Freestyle/);
  setLang('it', { persist: false });
  await vista();
  assert.match(c.container.textContent, /100 Stile libero/);
  setLang('es', { persist: false });
});
