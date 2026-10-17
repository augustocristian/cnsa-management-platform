import { Before, Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { textRegex } from '../support/world.js';

// Desktop browsers download the PDF; touch devices may open the share sheet. The e2e scenarios of this area that capture the
// download switch Web Share off so the same steps work in both profiles (a dedicated scenario enables a fake share sheet).
Before({ tags: '@training or @trainings or @training-pdf or @training-contents or @training-demo' }, async function () {
  await this.context.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true });
    } catch (e) {
      /* ignore */
    }
  });
});

export const sessionCard = (world, title) => world.view.locator('.ent-sess').filter({ hasText: textRegex(title) });
// The form of a session is a sheet (bottom sheet on mobile)
export const sessionForm = (world) => world.page.locator('.sheet');

// Opens the "more actions" menu of a session card and clicks an item by its id (estado, editar, duplicar, pdf, eliminar)
export async function chooseInMenu(world, row, id) {
  await row.first().locator('button[aria-haspopup="menu"]').click();
  await world.page.locator(`.enp-mn [data-accion="${id}"]`).click();
}

async function saveSession(world) {
  await sessionForm(world).getByRole('button', { name: 'Guardar' }).click();
  await world.expectVisible(world.page.locator('#toasts .toast', { hasText: 'Sesión guardada' }));
}

When('I create the training session with the data:', async function (table) {
  await this.view.getByRole('button', { name: 'Nueva sesión' }).first().click();
  await sessionForm(this).waitFor({ timeout: this.timeout });
  await this.fillTable(sessionForm(this), table);
  await saveSession(this);
});

When('I edit the session {string} with the data:', async function (title, table) {
  await chooseInMenu(this, sessionCard(this, title), 'editar');
  await this.fillTable(sessionForm(this), table);
  await saveSession(this);
});

When('I duplicate the session {string}', async function (title) {
  await chooseInMenu(this, sessionCard(this, title), 'duplicar');
  await saveSession(this);
});

When('I mark the session {string} as done', async function (title) {
  await chooseInMenu(this, sessionCard(this, title), 'estado');
});

When('I delete the session {string}', async function (title) {
  await chooseInMenu(this, sessionCard(this, title), 'eliminar');
});

When('I undo the deletion', async function () {
  await this.page.locator('#toasts .toast').getByRole('button', { name: 'Deshacer' }).click();
});

When('I go to the previous week', async function () {
  await this.view.locator('[data-accion="semana-anterior"]').click();
});
When('I go to the next week', async function () {
  await this.view.locator('[data-accion="semana-siguiente"]').click();
});
When('I go back to the current week', async function () {
  await this.view.locator('[data-accion="hoy"]').click();
});

When('I filter the sessions by the group {string}', async function (g) {
  await this.view.locator('.ent-bar select').selectOption({ label: g });
});

Then('the session {string} appears in the weekly calendar', async function (title) {
  await this.expectVisible(sessionCard(this, title), `The session ${title} does not appear`);
});

Then('the session {string} does not appear in the weekly calendar', async function (title) {
  await this.eventually(async () => assert.equal(await sessionCard(this, title).count(), 0));
});

Then('there are {int} sessions named {string}', async function (n, title) {
  await this.eventually(async () => assert.equal(await sessionCard(this, title).count(), n));
});

Then('the session {string} appears as {string}', async function (title, status) {
  await this.expectVisible(
    sessionCard(this, title)
      .first()
      .locator('.badge', { hasText: new RegExp(`^${status}$`) }),
  );
});

Then('the session {string} shows {string}', async function (title, text) {
  await this.expectVisible(sessionCard(this, title).first().getByText(text));
});

Then('the session {string} has a single main action {string}', async function (title, action) {
  const row = sessionCard(this, title).first();
  await this.expectVisible(row.getByRole('button', { name: new RegExp(`^${action}`) }));
  assert.equal(await row.locator('.btn--primary').count(), 1);
  assert.equal(
    await row.getByRole('button').count(),
    2,
    'There must be only the main action and the more-actions menu',
  );
});

Then('the week shows {string} sessions', async function (status) {
  await this.expectVisible(
    this.view.locator('.ent-sess .badge', { hasText: new RegExp(`^${status}$`) }),
    `No ${status} sessions`,
  );
});

Then('the planned sessions show their target volume', async function () {
  await this.expectVisible(this.view.locator('.ent-sess .ent-meta span', { hasText: 'Vol.' }));
});

Then('all the sessions shown are of the group {string}', async function (g) {
  await this.eventually(async () => {
    const groups = await this.view.locator('.ent-sess .ent-meta .badge:first-child').allInnerTexts();
    assert.ok(groups.length > 0, 'There are no sessions');
    assert.ok(
      groups.every((x) => x.trim() === g),
      `Groups: ${[...new Set(groups)]}`,
    );
  });
});

Then('the week title shows a date range', async function () {
  await this.expectVisible(this.view.locator('.ent-week', { hasText: /\d.*–.*\d{4}/ }));
});

Then('I see {int} sessions this week', async function (n) {
  await this.expectVisible(this.view.getByText(`${n} sesiones esta semana`));
});

Then('I see the field error {string}', async function (text) {
  await this.expectVisible(this.page.locator('.field-error', { hasText: text }), `There is no field error «${text}»`);
});

Given('I have created the session {string} for the group {string}', async function (title, group) {
  await this.goTo('entrenamientos');
  await this.view.getByRole('button', { name: 'Nueva sesión' }).first().click();
  await sessionForm(this).waitFor({ timeout: this.timeout });
  await this.fill(sessionForm(this), 'Título', title);
  await this.fill(sessionForm(this), 'Grupo', group);
  await saveSession(this);
  await this.expectVisible(sessionCard(this, title));
});
