import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { textRegex, allWords } from '../support/world.js';

// The swimmer form shows the essential fields first; the rest sit under "Más datos" (opened on demand).
async function fillSwimmer(world, table) {
  const scope = world.page.locator('.nad-modal');
  await scope.waitFor({ timeout: world.timeout });
  for (const [field, value] of table.raw()) {
    let c = scope.getByLabel(field).first();
    if (!(await c.isVisible())) {
      await scope.locator('summary', { hasText: 'Más datos' }).click();
      c = scope.getByLabel(field).first();
    }
    const tag = await c.evaluate((el) => el.tagName.toLowerCase() + (el.type === 'checkbox' ? ':checkbox' : ''));
    if (tag === 'select') await c.selectOption({ label: value });
    else if (tag === 'input:checkbox') await c.setChecked(/^(s[ií]|yes|true)$/i.test(value));
    else await c.fill(value);
  }
}
const saveForm = (world) => world.page.locator('.nad-modal').getByRole('button', { name: 'Guardar', exact: true }).click();
const swimmerRow = (world, name) => world.view.locator('tr.nad-row').filter({ hasText: allWords(name) });

// ---- Create, edit, profile ----
When('I register the swimmer with the data:', async function (table) {
  await this.view.getByRole('button', { name: 'Nuevo nadador' }).click();
  await fillSwimmer(this, table);
  await saveForm(this);
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
});

When('I try to register a swimmer without surnames', async function () {
  await this.view.getByRole('button', { name: 'Nuevo nadador' }).click();
  await fillSwimmer(this, { raw: () => [['Nombre', 'Solo']] });
  await saveForm(this);
});

Then('the form is still open', async function () {
  await this.expectVisible(this.page.locator('.nad-modal'));
});

When('I open the profile of {string}', async function (name) {
  await swimmerRow(this, name).first().click();
  await this.expectVisible(this.view.getByRole('heading', { level: 1 }).filter({ hasText: allWords(name) }));
});

When('I edit the swimmer with the data:', async function (table) {
  await this.view.getByRole('button', { name: 'Editar' }).click();
  await fillSwimmer(this, table);
  await saveForm(this);
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
});

// Deleting is undoable: no confirmation dialog, a toast with "Deshacer" instead.
When('I delete the swimmer', async function () {
  await this.view.getByRole('button', { name: 'Eliminar', exact: true }).click();
});

Then('the form shows the error {string} in the field {string}', async function (error, field) {
  const f = this.page.locator('.nad-modal, .grp-modal').locator('.field').filter({ has: this.page.getByLabel(field) });
  await this.expectVisible(f.locator('.field-error', { hasText: error }).first(), `The error "${error}" is not visible next to "${field}"`);
});

When('I fill the swimmer form with the data:', async function (table) {
  await fillSwimmer(this, table);
});

When('I save and add another swimmer', async function () {
  await this.page.locator('.nad-modal').getByRole('button', { name: 'Guardar y añadir otro' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
});

Then('the form is still open with the name empty', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('.nad-modal').getByLabel('Nombre').first().inputValue(), ''));
});

When('I close the form', async function () {
  await this.page.locator('.nad-modal').getByRole('button', { name: 'Cancelar' }).click();
});

When('I tick show inactive swimmers', async function () {
  await openFilters(this);
  await this.view.getByLabel('Mostrar inactivos').check();
});

Then('the swimmers list includes {string}', async function (name) {
  await this.expectVisible(swimmerRow(this, name), `${name} is not in the list`);
});

Then('the swimmers list does not include {string}', async function (name) {
  await this.eventually(async () => assert.equal(await swimmerRow(this, name).count(), 0));
});

Then('I see the profile of {string}', async function (name) {
  await this.expectVisible(this.view.getByRole('heading', { level: 1 }).filter({ hasText: allWords(name) }));
});

Then('the profile shows the personal data:', async function (table) {
  for (const [item] of table.raw()) await this.expectVisible(this.view.locator('dt', { hasText: item }), `The item "${item}" is missing`);
});

Then('the profile shows the value {string}', async function (v) {
  await this.expectVisible(this.view.locator('dd', { hasText: textRegex(v) }), `The value "${v}" is missing`);
});

Then('the profile includes the sports profile sections:', async function (table) {
  for (const [s] of table.raw()) await this.expectVisible(this.view.locator('h2', { hasText: s }), `The section "${s}" is missing`);
});

Then('the profile shows its attendance percentage', async function () {
  await this.expectVisible(this.view.locator('.nad-stat').filter({ hasText: 'Asistencia' }).filter({ hasText: '%' }));
});

Then('the profile shows the best time {string} in {string}', async function (time, event) {
  const block = this.view.locator('.nad-chartbox').filter({ hasText: event });
  await this.expectVisible(block.locator('.badge', { hasText: `PB ${time}` }), `There is no PB ${time} in ${event}`);
});

// ---- Search ----
// On mobile the filters fold under a "Filtros" button.
async function openFilters(world) {
  const toggle = world.view.locator('.nad-filter-toggle');
  if (await toggle.isVisible() && (await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}
When('I search swimmers by {string}', async function (text) {
  await this.view.locator('input[type=search]').fill(text);
});

When('I filter the swimmers by the category {string}', async function (c) {
  await openFilters(this);
  await this.view.locator('.nad-filters select').nth(0).selectOption({ label: c });
});

When('I filter the swimmers by the group {string}', async function (g) {
  await openFilters(this);
  await this.view.locator('.nad-filters select').nth(1).selectOption({ label: g });
});

Then('the list shows {int} swimmer(s)', async function (n) {
  await this.eventually(async () => assert.equal((await this.view.locator('p.nad-count').first().innerText()).trim(), `${n} nadador${n === 1 ? '' : 'es'}`));
});

Then('all the listed swimmers are of the category {string}', async function (c) {
  const badges = this.view.locator('tr.nad-row td:nth-child(2) .badge:first-child');
  await this.eventually(async () => {
    const t = await badges.allInnerTexts();
    assert.ok(t.length > 0, 'No rows');
    assert.ok(t.every((x) => x.trim() === c), `Categories: ${t}`);
  });
});

// ---- Category order ----
Then('the category {string} is in position {int} in the category filter', async function (cat, pos) {
  const options = (await this.view.locator('.nad-filters select').nth(0).locator('option').allInnerTexts()).map((x) => x.trim()).slice(1);
  assert.equal(options.indexOf(cat) + 1, pos, `Current order: ${options.join(', ')}`);
});

Then('the category filter offers, in this order:', async function (table) {
  const expected = table.raw().map((r) => r[0]);
  const options = (await this.view.locator('.nad-filters select').nth(0).locator('option').allInnerTexts()).map((x) => x.trim()).slice(1);
  assert.deepEqual(options, expected);
});

Then('in the list the swimmers of {string} appear before those of {string}', async function (a, b) {
  const cats = (await this.view.locator('tr.nad-row td:nth-child(2) .badge:first-child').allInnerTexts()).map((x) => x.trim());
  const lastA = cats.lastIndexOf(a), firstB = cats.indexOf(b);
  assert.ok(lastA >= 0 && firstB >= 0, `The list does not contain ${a} and ${b}: ${[...new Set(cats)]}`);
  assert.ok(lastA < firstB, `${a} should come before ${b}: ${[...new Set(cats)]}`);
});

// ---- Categories per season ----
// Sets the current season of the club (settings) and recalculates the categories, using the same modules as the app.
Given('the current season is {string}', async function (season) {
  await this.page.evaluate(async (t) => {
    const { store } = await import('/js/store.js');
    const { crearCategoriasService } = await import('/js/application/categoriasService.js');
    store.setClub({ ...store.club, temporadaActual: t });
    crearCategoriasService(store).recalcular();
  }, season);
});

const categoryOf = (world, name) => swimmerRow(world, name).first().locator('td:nth-child(2) .badge').first();

Then('the swimmer {string} appears in the category {string}', async function (name, cat) {
  await this.eventually(async () => assert.equal((await categoryOf(this, name).innerText()).trim(), cat));
});

Then('the swimmer {string} has the badge {string}', async function (name, text) {
  await this.expectVisible(swimmerRow(this, name).first().locator('.nad-manual', { hasText: text }), `${name} does not have the badge "${text}"`);
});

Then('the swimmer {string} does not have the badge {string}', async function (name, text) {
  await this.expectVisible(swimmerRow(this, name).first());
  assert.equal(await swimmerRow(this, name).first().locator('.nad-manual', { hasText: text }).count(), 0);
});

async function quickRegister(world, name, surnames, born, manual) {
  await world.view.getByRole('button', { name: 'Nuevo nadador' }).click();
  const rows = [['Nombre', name], ['Apellidos', surnames], ['Fecha de nacimiento', born]];
  if (manual) rows.push(['Categoría manual', 'Sí'], ['Categoría elegida', manual]);
  await fillSwimmer(world, { raw: () => rows });
  await saveForm(world);
  await world.expectVisible(world.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
}
Given('I have registered the swimmer {string} born on {string}', async function (name, born) {
  const [n, ...a] = name.split(' ');
  await quickRegister(this, n, a.join(' '), born, null);
});
Given('I have registered the swimmer {string} born on {string} with the manual category {string}', async function (name, born, cat) {
  const [n, ...a] = name.split(' ');
  await quickRegister(this, n, a.join(' '), born, cat);
});

When('I open the new swimmer form', async function () {
  await this.view.getByRole('button', { name: 'Nuevo nadador' }).click();
  await this.expectVisible(this.page.locator('.nad-modal'));
});

When('I enter the birth date {string}', async function (date) {
  await this.page.locator('.nad-modal').getByLabel('Fecha de nacimiento').fill(date);
});

const live = (world) => world.page.locator('.nad-modal [data-testid=categoria-auto]');
Then('the form asks for the birth date to calculate the category', async function () {
  await this.eventually(async () => assert.match(await live(this).innerText(), /Indica la fecha de nacimiento/));
});

Then('the form shows the automatic category {string} for those born in {string}', async function (cat, range) {
  await this.eventually(async () => {
    const txt = await live(this).innerText();
    assert.ok(txt.includes(`${cat} · nacidos en ${range}`), `Current text: ${txt}`);
  });
  assert.equal(await this.page.locator('.nad-modal [data-testid=categoria-auto] input, .nad-modal [data-testid=categoria-auto] select').count(), 0, 'the automatic category is read-only');
});

// ---- Settings: categories panel ----
Then('I see the panel {string}', async function (title) {
  await this.expectVisible(this.view.locator('.catp h2', { hasText: title }), `The panel "${title}" is not visible`);
});

Then('the categories table shows:', async function (table) {
  const rows = this.view.locator('.catp table[aria-label] tbody tr');
  for (const [cat, range] of table.raw()) {
    const f = rows.filter({ has: this.page.locator('th', { hasText: new RegExp(`^\s*${cat}\s*$`) }) }).first();
    await this.eventually(async () => assert.equal((await f.locator('td').first().innerText()).trim(), range, cat));
  }
});

When('I choose the season {string} and press {string}', async function (season, button) {
  await this.view.locator('#catp-temporada').selectOption({ label: season });
  await this.view.locator('.catp').getByRole('button', { name: button }).click();
});

Then('the preview says that {string} goes from {string} to {string}', async function (name, from, to) {
  const m = this.page.locator('.modal');
  await this.expectVisible(m.locator('tbody tr', { hasText: allWords(name) }), `${name} is not in the preview`);
  const cells = (await m.locator('tbody tr', { hasText: allWords(name) }).first().locator('td').allInnerTexts()).map((x) => x.replace('↑', '').trim());
  assert.deepEqual(cells.slice(1), [from, to]);
});

Then('the preview does not include {string}', async function (name) {
  await this.expectVisible(this.page.locator('.modal tbody tr').first());
  assert.equal(await this.page.locator('.modal tbody tr', { hasText: allWords(name) }).count(), 0);
});

When('I apply the season change', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Aplicar cambio de temporada' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'aplicada' }));
});

// ---- Groups ----
const groupCard = (world, name) => world.view.locator('.grp-card').filter({ has: world.page.locator('h2', { hasText: name }) });

When('I create the group with the data:', async function (table) {
  await this.view.getByRole('button', { name: 'Nuevo grupo' }).click();
  const m = this.page.locator('.grp-modal');
  await m.waitFor({ timeout: this.timeout });
  await this.fillTable(m, table);
  await m.getByRole('button', { name: 'Guardar' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Grupo guardado' }));
});

When('I edit the group {string} with the data:', async function (name, table) {
  await groupCard(this, name).first().getByRole('button', { name: 'Editar' }).click();
  const m = this.page.locator('.grp-modal');
  await this.fillTable(m, table);
  await m.getByRole('button', { name: 'Guardar' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Grupo guardado' }));
});

When('I delete the group {string}', async function (name) {
  await groupCard(this, name).first().getByRole('button', { name: 'Eliminar' }).click();
});

Then('the groups page does not show {string}', async function (text) {
  const txt = await this.view.innerText();
  assert.ok(!txt.includes(text), `"${text}" appears in Groups`);
});

Then('I see the group {string}', async function (name) {
  await this.expectVisible(groupCard(this, name), `The group ${name} does not exist`);
});

Then('I do not see the group {string}', async function (name) {
  await this.eventually(async () => assert.equal(await groupCard(this, name).count(), 0));
});

Then('the group {string} has {int} swimmer(s)', async function (name, n) {
  const t = groupCard(this, name).first();
  await this.eventually(async () => assert.match(await t.innerText(), new RegExp(`· ${n} nadador(es)?`)));
});

Then('the group {string} includes {string}', async function (group, swimmer) {
  await this.expectVisible(groupCard(this, group).first().locator('li', { hasText: allWords(swimmer) }));
});

Then('the group {string} is in charge of {string}', async function (group, coach) {
  await this.expectVisible(groupCard(this, group).first().getByText(`Entrenador: ${coach}`));
});

Then('{string} appears among the swimmers without a group', async function (swimmer) {
  const t = this.view.locator('.grp-card').filter({ has: this.page.locator('h2', { hasText: 'Sin grupo' }) });
  await this.expectVisible(t.locator('li', { hasText: allWords(swimmer) }));
});
