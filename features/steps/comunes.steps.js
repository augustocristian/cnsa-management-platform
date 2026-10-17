// Steps reusable by all areas.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { route, textRegex, allWords } from '../support/world.js';

// ---- Access: Google session, club and first start (test adapter, no real Google) ----
Given('a club with demo data', async function () {
  await this.enterClub({ demo: true });
});

// Same thing, said from the point of view of Drive (the Google session is simulated).
Given('a demo club with the Google session started', async function () {
  await this.enterClub({ demo: true });
});

Given('an empty club with the Google session started', async function () {
  await this.enterClub({ demo: false });
});

Given('the app has just been opened without a session', async function () {
  await this.openApp({ session: false });
});

Given('the app is open without a Google Client ID', async function () {
  await this.openApp({ noClientId: true });
});

Given('the app is open and Google rejects the login with {string}', async function (code) {
  await this.openApp({ session: false, loginError: code });
});

Then('I see the button {string}', async function (name) {
  await this.expectVisible(this.page.getByRole('button', { name }), `The button "${name}" is not visible`);
});

Then('I do not see the button {string}', async function (name) {
  assert.equal(await this.page.getByRole('button', { name }).count(), 0, `The button "${name}" is visible`);
});

Then('I see no text about local mode', async function () {
  const txt = (await this.page.locator('body').innerText()).toLowerCase();
  assert.ok(!txt.includes('modo local') && !txt.includes('probar en modo'), 'Text about local mode appears');
});

Then('the app menu is not shown', async function () {
  assert.equal(await this.page.locator('nav.sidebar').count(), 0);
});

Then('my session is {string}', async function (email) {
  await this.eventually(async () => assert.equal((await this.page.locator('#user-box strong').innerText()).trim(), email));
});

// ---- Navigation ----
Given('I have the {string} module open', async function (m) { await this.goTo(route(m)); });
When('I open the {string} module', async function (m) { await this.goTo(route(m)); });

When('I press {string} in the menu', async function (m) {
  await this.clickInMenu(route(m));
});

When('I try to open the {string} module directly', async function (m) {
  await this.page.evaluate((r) => { location.hash = '#/' + r; }, route(m));
  await this.page.waitForTimeout(300);
});

Then('I am in the {string} module', async function (m) {
  await this.waitForActiveRoute(route(m));
});

Then('the {string} screen is shown complete and without errors', async function (m) {
  await this.waitForActiveRoute(route(m));
  await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
  await this.expectHidden(this.page.getByText('Error al mostrar la vista'));
  await this.expectHidden(this.page.getByText('Próximamente'));
  assert.ok((await this.view.innerText()).trim().length > 0, 'The screen is empty');
});

Then('the menu {word} the module {string}', async function (action, m) {
  const item = this.page.locator(`.nav-item[data-route="${route(m)}"]`);
  if (action === 'shows') await item.first().waitFor({ state: 'attached', timeout: this.timeout });
  else { assert.equal(action, 'hides', 'Use "shows" or "hides"'); await this.eventually(async () => assert.equal(await item.count(), 0)); }
});

// ---- Generic actions ----
// Buttons and links: inside an open dialog if there is one, otherwise on the view or the page (recovery screens have no #view).
When('I press {string}', async function (text) {
  const scope = await this.scope();
  const button = scope.getByRole('button', { name: text }).or(scope.getByRole('link', { name: text })).first();
  await button.click();
});

When('I accept the confirmation', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

When('I fill {string} with {string}', async function (field, value) {
  await this.fill(await this.scope(), field, value);
});

When('I choose {string} in {string}', async function (value, field) {
  await this.fill(await this.scope(), field, value);
});

// ---- Generic checks ----
Then('I see the text {string}', async function (t) {
  await this.expectVisible(this.page.locator('body').getByText(t), `The text "${t}" is not visible`);
});

Then('I do not see the text {string}', async function (t) {
  await this.expectHidden(this.view.getByText(t), `The text "${t}" is visible`);
});

Then('I see the heading {string}', async function (t) {
  await this.expectVisible(this.page.getByRole('heading', { name: t }), `The heading "${t}" is not visible`);
});

Then('I see the toast {string}', async function (t) {
  await this.expectVisible(this.page.locator('#toasts .toast').filter({ hasText: t }), `The toast "${t}" does not appear`);
});

Then('I see the headings:', async function (table) {
  for (const [t] of table.raw()) await this.expectVisible(this.page.getByRole('heading', { name: t }), `The heading "${t}" is missing`);
});

Then('I see someone named {string} on the screen', async function (name) {
  await this.expectVisible(this.view.locator('tr, li, .card, button').filter({ hasText: allWords(name) }));
});

Then('the row containing {string} shows {string}', async function (key, text) {
  const row = this.view.locator('tr').filter({ hasText: textRegex(key) });
  await this.eventually(async () => assert.match(await row.first().innerText(), textRegex(text)));
});

Then('there is no role selector', async function () {
  assert.equal(await this.page.locator('#role-select').count(), 0);
});
