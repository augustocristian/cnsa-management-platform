import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { textRegex } from '../support/world.js';

// ---- Notices ----
const notice = (world, title) => world.view.locator('.cm-item').filter({ has: world.page.locator('h3', { hasText: textRegex(title) }) });

When('I save a notice with the data:', async function (table) {
  const form = this.view.locator('form.cm-form');
  await this.fillTable(form, table);
  await form.getByRole('button', { name: 'Guardar aviso' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Aviso guardado' }));
});

When('I filter the notices by {string}', async function (option) {
  await this.view.locator('.cm-bar select').selectOption({ label: option });
});

// Deleting is undoable: no confirmation dialog, a toast with "Deshacer" instead.
When('I delete the notice {string}', async function (title) {
  await notice(this, title).first().getByRole('button', { name: 'Eliminar' }).click();
});

Then('the notice {string} shows the date {string}', async function (title, date) {
  await this.expectVisible(notice(this, title).first().locator('time', { hasText: date }));
});

Then('the notices form shows the error {string}', async function (error) {
  await this.expectVisible(this.view.locator('form.cm-form .field-error', { hasText: error }).first());
});

Then('I see the saved notice {string}', async function (title) {
  await this.expectVisible(notice(this, title), `The notice ${title} is not visible`);
});

Then('I do not see the saved notice {string}', async function (title) {
  await this.eventually(async () => assert.equal(await notice(this, title).count(), 0));
});

Then('the notice {string} is addressed to {string}', async function (title, target) {
  await this.expectVisible(notice(this, title).first().locator('.badge', { hasText: new RegExp(`^${target}$`) }));
});

When('I press the notices bell', async function () {
  await this.page.getByRole('button', { name: /^Avisos/ }).click();
});

// ---- Club: identity ----
const identity = (w) => w.view.locator('.clb-card').filter({ has: w.page.getByRole('heading', { name: 'Identidad del club' }) });

// 1x1 pixel PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

When('I customise the club identity with:', async function (table) {
  const card = identity(this);
  for (const [field, value] of table.raw()) {
    const c = card.getByLabel(field).first();
    await c.fill(value);
  }
});

When('I upload the club logo', async function () {
  await identity(this).locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await this.eventually(async () => assert.match(await identity(this).locator('img.clb-logo').getAttribute('src'), /^data:image\//));
});

When('I remove the club logo', async function () {
  await identity(this).getByRole('button', { name: 'Quitar logo' }).click();
});

When('I save the club identity', async function () {
  await identity(this).getByRole('button', { name: 'Guardar identidad' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Identidad guardada' }));
});

Then('the header shows the name {string}', async function (n) {
  await this.eventually(async () => assert.equal((await this.page.locator('.brand-name').innerText()).trim(), n));
});

Then('the header shows the motto {string}', async function (n) {
  await this.eventually(async () => assert.equal((await this.page.locator('.brand-lema').innerText()).trim(), n));
});

Then('the footer mentions {string}', async function (n) {
  await this.expectVisible(this.page.locator('footer.footer', { hasText: n }));
});

Then('the primary colour of the app is {string}', async function (c) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.style.getPropertyValue('--c-primary').trim()), c));
});

Then('the secondary colour of the app is {string}', async function (c) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.style.getPropertyValue('--c-secondary').trim()), c));
});

Then('the header shows the uploaded logo', async function () {
  await this.eventually(async () => assert.match(await this.page.locator('.brand img.logo').getAttribute('src'), /^data:image\//));
});

Then('the header shows the default logo', async function () {
  await this.eventually(async () => assert.match(await this.page.locator('.brand img.logo').getAttribute('src'), /icon\.svg$/));
});

// ---- Club: data in Drive ----
Then('the settings explain that the data is in the cnl folder in Drive', async function () {
  await this.expectVisible(this.view.getByText('carpeta «cnl» de tu Google Drive'));
  await this.expectVisible(this.view.getByRole('link', { name: 'Abrir el fichero del club en Drive' }));
});

Then('the settings offer no users, roles or sharing of the sheet', async function () {
  const txt = await this.view.innerText();
  assert.doesNotMatch(txt, /Usuarios y roles|Unirse con enlace|Compartir por email/);
});

// ---- Notices: setup ----
Given('I have saved the notice {string} for {string}', async function (title, target) {
  await this.goTo('comunicaciones');
  const form = this.view.locator('form.cm-form');
  await this.fill(form, 'Título', title);
  await this.fill(form, 'Grupo', target);
  await this.fill(form, 'Texto', `Texto de ${title}`);
  await form.getByRole('button', { name: 'Guardar aviso' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Aviso guardado' }));
});

Then('the logo in the settings is visible', async function () {
  const img = identity(this).locator('img.clb-logo');
  await this.expectVisible(img);
  await this.eventually(async () => assert.ok(await img.evaluate((el) => el.complete && el.naturalWidth > 0), 'The logo image is broken'));
});

Then('the settings offer a button to choose the logo in Spanish', async function () {
  await this.expectVisible(identity(this).getByRole('button', { name: 'Elegir imagen' }));
  assert.equal(await identity(this).locator('input[type=file]').isVisible(), false);
});

Then('the settings show {string} only once', async function (title) {
  assert.equal(await this.view.getByRole('heading', { name: title, exact: true }).count(), 1);
});

Then('the settings do not mention user accounts', async function () {
  const txt = await this.view.innerText();
  assert.doesNotMatch(txt, /@|iniciar sesión|cerrar sesión/i);
});
