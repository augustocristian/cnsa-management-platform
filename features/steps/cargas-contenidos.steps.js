// Steps of the "Training contents" manager (load catalogue) and of its use when logging loads.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { textRegex, allWords } from '../support/world.js';

const exact = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const withoutSeparators = (t) => t.replace(/[.\s,]/g, '');
const manager = (w) => w.view.locator('#cg-gestor');
const row = (w, name) =>
  manager(w)
    .locator('.tc-item')
    .filter({ has: w.page.locator('.tc-nombre', { hasText: exact(name) }) });

When('I open the training contents manager', async function () {
  const button = this.view
    .locator('.page-head')
    .getByRole('button', { name: /Contenidos de entrenamiento|Ocultar contenidos/ });
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await this.expectVisible(manager(this), 'The contents manager does not open');
});

// Fills the content form (new) and presses Save; the result is checked in the next step.
When('I save a training content with the data:', async function (table) {
  await manager(this).getByRole('button', { name: 'Nuevo contenido' }).click();
  const dialog = this.page.locator('.modal');
  await this.expectVisible(dialog, 'The content form does not open');
  await this.fillTable(dialog, table);
  await dialog.getByRole('button', { name: 'Guardar' }).click();
});

When('I deactivate the content {string}', async function (name) {
  await row(this, name).getByRole('button', { name: 'Desactivar' }).click();
  await this.expectVisible(row(this, name).locator('.tc-off'));
});

When('I activate the content {string}', async function (name) {
  await row(this, name).getByRole('button', { name: 'Activar' }).click();
  await this.expectHidden(row(this, name).locator('.tc-off'));
});

When('I try to delete the content {string}', async function (name) {
  await row(this, name).getByRole('button', { name: 'Eliminar' }).click();
});

Then('I see the predefined contents:', async function (table) {
  for (const [name] of table.raw()) {
    const f = row(this, name);
    await this.expectVisible(f, `The content "${name}" is missing`);
    assert.match(await f.first().innerText(), /Predefinido/, `"${name}" is not marked as predefined`);
  }
});

Then('the content {string} shows the description {string}', async function (name, text) {
  await this.eventually(async () => assert.match(await row(this, name).first().innerText(), textRegex(text)));
});

Then('the content {string} cannot be deleted', async function (name) {
  await this.expectVisible(row(this, name));
  assert.equal(await row(this, name).getByRole('button', { name: 'Eliminar' }).count(), 0);
});

Then('the content {string} appears as custom', async function (name) {
  await this.eventually(async () => assert.match(await row(this, name).first().innerText(), /Personalizado/));
});

Then('I see the error {string}', async function (text) {
  await this.expectVisible(
    this.page.locator('.field-error, .tc-error', { hasText: text }),
    `The error "${text}" does not appear`,
  );
});

// The content selector lives in the "Log load" sheet: open it, read the options and close it again.
async function contentOptions(world) {
  await world.view.getByRole('button', { name: 'Registrar carga', exact: true }).click();
  const sheet = world.page.locator('.sheet');
  await world.expectVisible(sheet);
  const options = (await sheet.locator('select[name="tipoId"] option').allInnerTexts()).map((o) => o.trim());
  await world.page.keyboard.press('Escape');
  await world.expectHidden(sheet);
  return options;
}

Then('the content selector offers {string}', async function (name) {
  assert.ok((await contentOptions(this)).includes(name), `The selector does not offer "${name}"`);
});

Then('the content selector does not offer {string}', async function (name) {
  assert.ok(!(await contentOptions(this)).includes(name), `The selector still offers "${name}"`);
});

Then(
  'the load of {int} metres of {string} appears linked to the session {string}',
  async function (metres, name, session) {
    const rows = this.view
      .locator('section.card')
      .filter({ has: this.page.getByRole('heading', { name: 'Cargas de la semana', exact: true }) })
      .locator('tbody tr')
      .filter({ hasText: allWords(name) });
    await this.eventually(async () => {
      const cells = await rows.evaluateAll((trs) =>
        trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())),
      );
      assert.ok(
        cells.some((c) => withoutSeparators(c[4] || '') === String(metres) && (c[3] || '').includes(session)),
        `Rows of ${name}: ${JSON.stringify(cells)}`,
      );
    });
  },
);
