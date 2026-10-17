// Steps of the swimsuit catalogue (training suits and competition fast skins).
// The catalogue is a dialog opened from other views (Marks, Settings). Until those entry points are the subject of their own
// scenarios, the steps open it through the same exported function the views call: abrirCatalogoBanadores(ctx).
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const exact = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const catalogue = (w) => w.page.locator('.modal.bn-catalogo');
const row = (w, name) => catalogue(w).locator('.bn-item').filter({ has: w.page.locator('.bn-nombre', { hasText: exact(name) }) });

When('I open the swimsuit catalogue', async function () {
  await this.page.evaluate(async () => {
    const [{ store }, ui, view] = await Promise.all([
      import(new URL('./js/composicion/store.js', location.href).href),
      import(new URL('./js/presentation/ui.js', location.href).href),
      import(new URL('./js/presentation/views/banadores-catalogo.js', location.href).href),
    ]);
    view.abrirCatalogoBanadores({ store, ui });
  });
  await this.expectVisible(catalogue(this), 'The swimsuit catalogue does not open');
});

When('I save a swimsuit with the data:', async function (table) {
  await catalogue(this).getByRole('button', { name: 'Nuevo bañador' }).click();
  const dialog = this.page.locator('.modal').last();
  await this.expectVisible(dialog.getByLabel('Marca'), 'The swimsuit form does not open');
  await this.fillTable(dialog, table);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
});

When('I deactivate the swimsuit {string}', async function (name) {
  await row(this, name).getByRole('button', { name: 'Desactivar' }).click();
});

When('I undo the last toast', async function () {
  await this.page.locator('#toasts .toast').getByRole('button', { name: 'Deshacer' }).last().click();
});

When('I try to delete the swimsuit {string}', async function (name) {
  await row(this, name).getByRole('button', { name: /^Eliminar/ }).click();
});

Then('I see the swimsuit {string} in the catalogue', async function (name) {
  await this.expectVisible(row(this, name), `The swimsuit "${name}" is missing`);
});

Then('I do not see the swimsuit {string} in the catalogue', async function (name) {
  await this.expectHidden(row(this, name), `The swimsuit "${name}" is still there`);
});

Then('the swimsuit {string} appears as inactive', async function (name) {
  await this.eventually(async () => assert.match(await row(this, name).first().innerText(), /Inactivo/));
});

Then('the swimsuit {string} appears as active', async function (name) {
  await this.expectVisible(row(this, name));
  await this.eventually(async () => assert.doesNotMatch(await row(this, name).first().innerText(), /Inactivo/));
});

Then('the catalogue group {string} includes {string}', async function (group, name) {
  const section = catalogue(this).locator('.bn-grupo').filter({ has: this.page.getByRole('heading', { name: group }) });
  await this.expectVisible(section.locator('.bn-nombre', { hasText: exact(name) }), `The group "${group}" does not include "${name}"`);
});

Then('I see the error {string} in the swimsuit form', async function (text) {
  await this.expectVisible(this.page.locator('.modal').last().locator('.field-error', { hasText: text }), `The error "${text}" does not appear`);
});

Then('the in-use swimsuit dialog offers to deactivate it or merge it with another', async function () {
  const dialog = this.page.locator('.modal').last();
  await this.expectVisible(dialog.getByText(/no se puede eliminar/), 'The in-use swimsuit notice does not appear');
  await this.expectVisible(dialog.getByRole('button', { name: 'Desactivar' }));
  await this.expectVisible(dialog.getByRole('button', { name: 'Unir y eliminar' }));
});
