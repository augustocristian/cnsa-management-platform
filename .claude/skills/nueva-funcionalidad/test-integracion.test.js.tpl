// Integration of the <module> view: jsdom + store + simulated Google (tests/helpers/app.js). Clean state in every test.
// Button and field texts below are the app's Spanish UI strings (the default language in tests): adapt them to your locale keys.
import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, buttonByText, fieldByLabel, setValue } from '../helpers/app.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh({ demo: true }); return fn(t); });
const abrir = async () => { await renderView('<module>', c.container, [], c); };
const modal = () => document.querySelector('.modal');

test('<module>: with no data it shows the empty state with a call to action and a single h1', async () => {
  await abrir();
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.ok(c.container.querySelector('.empty'));
});

test('<module>: creating through the form saves the row and the list', async () => {
  await abrir();
  buttonByText(c.container, 'Nuevo').click();
  await tick();
  setValue(fieldByLabel(modal(), 'Nombre'), 'Ejemplo');
  setValue(fieldByLabel(modal(), 'Fecha'), '2026-10-15');
  buttonByText(modal(), 'Guardar').click();
  await tick(); await tick();
  assert.equal(c.store.list('<Hoja>').length, 1);
  assert.match(c.container.textContent, /Ejemplo/);
});

test('<module>: the empty form marks errors inline (no alert)', async () => {
  await abrir();
  buttonByText(c.container, 'Nuevo').click();
  await tick();
  buttonByText(modal(), 'Guardar').click();
  await tick();
  assert.ok(modal().querySelector('[aria-invalid="true"]'));
  assert.equal(c.store.list('<Hoja>').length, 0);
});
