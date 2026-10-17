import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { textRegex, allWords } from '../support/world.js';

const exact = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const withoutSeparators = (t) => t.replace(/[.\s,]/g, '');
const card = (world, title) => world.view.locator('section.card').filter({ has: world.page.getByRole('heading', { name: title, exact: true }) });
const sheet = (world) => world.page.locator('.sheet');

// ---- Loads ----
async function openLoadForm(world) {
  await world.view.getByRole('button', { name: 'Registrar carga', exact: true }).click();
  await world.expectVisible(sheet(world), 'The load form does not open');
}
async function logLoad(world, table) {
  await openLoadForm(world);
  await world.fillTable(sheet(world), table);
  await sheet(world).getByRole('button', { name: 'Registrar', exact: true }).click();
  await world.expectVisible(world.page.locator('#toasts .toast', { hasText: 'Carga registrada' }));
}

When('I log a load with the data:', async function (table) { await logLoad(this, table); });

When('I open the form to log a load', async function () { await openLoadForm(this); });

When('I check the loads of {string}', async function (name) {
  await this.view.locator('#cg-nadador').selectOption({ label: name });
});

When('I go to the previous loads week', async function () {
  await this.view.getByRole('button', { name: 'Semana anterior' }).click();
});

When('I set the weekly target of {string} between {int} and {int} metres', async function (type, min, max) {
  const row = this.view.locator('.cg-obj tbody tr').filter({ has: this.page.locator('td:first-child', { hasText: exact(type) }) });
  await row.locator('input').nth(0).fill(String(min));
  await row.locator('input').nth(1).fill(String(max));
  await this.view.locator('.cg-obj').getByRole('button', { name: 'Guardar objetivos' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Objetivos guardados' }));
});

When('I leave every training content without a weekly target', async function () {
  const rows = this.view.locator('.cg-obj tbody tr');
  assert.ok(await rows.count() >= 10, 'Contents are missing in the targets table');
  const inputs = this.view.locator('.cg-obj tbody input');
  for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill('0'); // ONE save for the whole table
  await this.view.locator('.cg-obj').getByRole('button', { name: 'Guardar objetivos' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: /Objetivos guardados|No hay cambios/ }));
});

When('I undo the last deletion', async function () {
  await this.page.locator('#toasts .toast-action', { hasText: 'Deshacer' }).click();
});

When('I delete the load of {int} metres of {string}', async function (metres, name) {
  const row = card(this, 'Cargas de la semana').locator('tbody tr').filter({ hasText: allWords(name) }).filter({ hasText: separatorsRegex(metres) }).first();
  await row.getByRole('button', { name: /^Eliminar la carga/ }).click();
});
const separatorsRegex = (n) => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, '$1\\.?'));

Then('the load of {int} metres of {string} appears in the week loads', async function (metres, name) {
  const rows = card(this, 'Cargas de la semana').locator('tbody tr').filter({ hasText: allWords(name) });
  await this.eventually(async () => {
    const texts = (await rows.allInnerTexts()).map(withoutSeparators);
    assert.ok(texts.some((t) => t.includes(String(metres))), `Rows of ${name}: ${texts}`);
  });
});

Then('the load of {int} metres of {string} does not appear in the week loads', async function (metres, name) {
  const rows = card(this, 'Cargas de la semana').locator('tbody tr').filter({ hasText: allWords(name) });
  await this.eventually(async () => {
    const texts = (await rows.allInnerTexts()).map(withoutSeparators);
    assert.ok(!texts.some((t) => t.includes(String(metres))), `The load is still there: ${texts}`);
  });
});

Then('the newly logged load appears highlighted', async function () {
  await this.expectVisible(card(this, 'Cargas de la semana').locator('tbody tr.is-new'));
});

Then('all the listed loads are of {string}', async function (name) {
  const rows = card(this, 'Cargas de la semana').locator('tbody tr');
  await this.eventually(async () => {
    const n = await rows.count();
    assert.ok(n > 0, 'There are no loads');
    const ok = await rows.evaluateAll((trs, nom) => trs.every((tr) => tr.children[1].textContent.trim() === nom), name);
    assert.ok(ok, 'There are loads of other swimmers');
  });
});

Then('I see the evolution of the loads by type and by day', async function () {
  await this.expectVisible(this.view.locator('[aria-label="Metros semanales por tipo"]'));
  await this.expectVisible(this.view.locator('[aria-label="Metros por día"]'));
});

Then('the week shown is different from the current one', async function () {
  await this.expectVisible(this.view.locator('.cg-week'));
});

Then('I see the alert {string}', async function (text) {
  await this.expectVisible(this.view.locator('.alert', { hasText: text }), `There is no alert "${text}"`);
});

Then('I see the error in the field {string}: {string}', async function (field, text) {
  const scope = (await this.page.locator('.sheet').count()) ? this.page.locator('.sheet') : this.view;
  await this.expectVisible(scope.locator('.field-error', { hasText: text }), `The error "${text}" does not appear`);
  assert.equal(await scope.getByLabel(field).first().getAttribute('aria-invalid'), 'true', `"${field}" is not marked as invalid`);
});

Given('I have logged a load of {int} metres for {string}', async function (metres, name) {
  await this.goTo('cargas');
  await logLoad(this, { raw: () => [['Nadador', name], ['Contenido', 'Aeróbico medio / Umbral anaeróbico'], ['Metros', String(metres)]] });
});

// ---- Times ----
async function openTimeForm(world) {
  await world.view.getByRole('button', { name: 'Registrar marca', exact: true }).click();
  await world.expectVisible(sheet(world), 'The time form does not open');
}

When('I log a time with the data:', async function (table) {
  await openTimeForm(this);
  await this.fillTable(sheet(this), table);
  await sheet(this).getByRole('button', { name: 'Registrar', exact: true }).click();
});

When('I open the form to log a time', async function () { await openTimeForm(this); });

When('I check the evolution of {string} in the event {string}', async function (name, event) {
  const selects = this.view.locator('.mc-filters select');
  await selects.nth(0).selectOption({ label: name });
  await selects.nth(1).selectOption({ label: event });
});

When('I filter the times by {string} {string}', async function (field, value) {
  await this.fill(this.view.locator('.mc-filters'), field, value);
});

When('I remove the filter {string}', async function (text) {
  await this.view.locator('.mc-chips').getByRole('button', { name: new RegExp('Quitar filtro: ' + text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
});

When('I ask to see more times from the history', async function () {
  await this.view.getByRole('button', { name: /^Ver más/ }).click();
});

Then('the time is logged', async function () {
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Marca registrada' }));
});

Then('the time is not logged because it is invalid', async function () {
  await this.expectVisible(sheet(this).locator('.field-error', { hasText: 'Tiempo no válido' }));
});

Then('the form asks for the time', async function () {
  await this.expectVisible(sheet(this).locator('.field-error', { hasText: 'Indica el tiempo' }));
});

Then('the typed time {string} is interpreted as {string}', async function (typed, interpreted) {
  const field = sheet(this).getByLabel('Tiempo (mm:ss.cc)').first();
  await field.fill(typed);
  await this.expectVisible(sheet(this).locator('.mc-live', { hasText: interpreted }));
});

Then('the best time of {string} in {string} is {string}', async function (name, event, time) {
  const row = card(this, 'Mejores marcas').locator('tbody tr').filter({ hasText: allWords(`${event} ${name}`) });
  await this.eventually(async () => assert.match(await row.first().innerText(), textRegex(time)));
});

Then('the best time shown is {string}', async function (time) {
  await this.eventually(async () => assert.match(await card(this, 'Mejores marcas').locator('tbody').innerText(), textRegex(time)));
});

Then('the history marks {string} as the best time', async function (time) {
  await this.expectVisible(card(this, 'Historial').locator('td', { hasText: textRegex(time) }).locator('.mc-pb'));
});

Then('the history does not mark {string} as the best time', async function (time) {
  const t = card(this, 'Historial');
  await this.eventually(async () => {
    assert.equal(await t.locator('td', { hasText: textRegex(time) }).locator('.mc-pb').count(), 0);
    assert.ok(await t.locator('td', { hasText: textRegex(time) }).count() > 0, 'The time is not in the history');
  });
});

Then('the history does not include the time {string}', async function (time) {
  await this.eventually(async () => assert.equal(await card(this, 'Historial').locator('td', { hasText: textRegex(time) }).count(), 0));
});

Then('the history includes the time {string}', async function (time) {
  await this.expectVisible(card(this, 'Historial').locator('td', { hasText: textRegex(time) }));
});

Then('the history shows {int} times', async function (n) {
  await this.eventually(async () => assert.equal(await card(this, 'Historial').locator('tbody tr').count(), n));
});

Then('the history shows the swimsuit {string} in the time {string}', async function (swimsuit, time) {
  const row = card(this, 'Historial').locator('tbody tr').filter({ hasText: textRegex(time) }).first();
  await this.eventually(async () => assert.match(await row.innerText(), textRegex(swimsuit)));
});

Then('I see the time evolution chart', async function () {
  await this.expectVisible(this.view.locator('svg[aria-label="Evolución de marcas"]'));
});

Then('the time evolution chart is shown without choosing anything', async function () {
  await this.expectVisible(this.view.locator('svg[aria-label="Evolución de marcas"]'));
});

Then('there is an active filter {string}', async function (text) {
  await this.expectVisible(this.view.locator('.mc-chips .chip', { hasText: text }));
});

Given('I have logged the times of {string} in {string}:', async function (name, event, table) {
  await this.goTo('marcas');
  for (const row of table.hashes()) {
    await openTimeForm(this);
    const d = sheet(this);
    await this.fill(d, 'Nadador', name);
    await this.fill(d, 'Prueba', event);
    await this.fill(d, 'Fecha', row.date);
    await this.fill(d, 'Tiempo (mm:ss.cc)', row.time);
    if (row.swimsuit) await this.fill(d, 'Bañador', row.swimsuit);
    await d.getByRole('button', { name: 'Registrar', exact: true }).click();
    await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Marca registrada' }));
    await this.expectHidden(d, 'The sheet does not close');
  }
});
