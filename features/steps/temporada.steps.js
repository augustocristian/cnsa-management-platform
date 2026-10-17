// Steps of the season planning (Season section of Planning).
// On desktop the summary is a table (tr[data-n]); on mobile, a list of cards (button.tp-wk[data-n]).
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const WEEKS = 'table[data-tabla=semanas] tbody tr, button.tp-wk';
const weekButton = (world, n) => world.page.locator(`table[data-tabla=semanas] tr[data-n="${n}"] .tp-sem-btn, button.tp-wk[data-n="${n}"]`).first();
const localDate = (days = 0) => {
  const d = new Date(); d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

When('I open the section {string}', async function (name) {
  await this.page.getByRole('tab', { name: name, exact: true }).click();
});

Then('I am in the section {string}', async function (name) {
  await this.eventually(async () => assert.equal(await this.page.getByRole('tab', { name: name, exact: true }).getAttribute('aria-selected'), 'true'));
});

Then('the weekly summary lists {int} weeks', async function (n) {
  await this.eventually(async () => assert.equal(await this.page.locator(WEEKS).count(), n));
});

Then('I see {int} phases in the season', async function (n) {
  await this.eventually(async () => assert.equal(await this.page.locator('.tp-fases > li').count(), n));
});

When('I open week {int} of the season', async function (n) {
  await weekButton(this, n).click();
  await this.eventually(async () => assert.match(await this.page.locator('#tp-h-det').innerText(), new RegExp(`Semana ${n} `)));
});

When('I open the week before the current one of the season', async function () {
  const current = this.page.locator('table[data-tabla=semanas] tr.tp-act .tp-sem-btn, button.tp-wk.tp-act').first();
  await current.waitFor({ timeout: this.timeout });
  const n = Number(await this.page.evaluate(() => (document.querySelector('table[data-tabla=semanas] tr.tp-act, button.tp-wk.tp-act') || {}).dataset.n));
  assert.ok(n > 1, 'the current week is not the first one');
  await weekButton(this, n - 1).click();
});

When('I fill {string} with the date {int} days from now', async function (field, days) {
  await this.fill(await this.scope(), field, localDate(days));
});

When('I add a competition {string} with priority {string} for today', async function (name, priority) {
  await this.view.getByRole('button', { name: 'Añadir evento' }).first().click();
  const m = this.page.locator('.modal').last();
  await m.waitFor({ timeout: this.timeout });
  await this.fill(m, 'Nombre', name);
  await this.fill(m, 'Prioridad', `Prioridad ${priority}`);
  await this.fill(m, 'Fecha de inicio', localDate(0));
  await m.getByRole('button', { name: 'Guardar' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Evento guardado' }));
});

Then('the current week marks the competition {string}', async function (name) {
  await this.expectVisible(this.page.locator('tr.tp-act .tp-evchip, button.tp-wk.tp-act .tp-evchip').filter({ hasText: name }), `The current week does not mark "${name}"`);
});

Then('week {int} shows a planned volume of {string}', async function (n, text) {
  const row = this.page.locator(`table[data-tabla=semanas] tr[data-n="${n}"], button.tp-wk[data-n="${n}"]`).first();
  await this.eventually(async () => assert.match(await row.innerText(), new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

Then('the week detail shows {string}', async function (text) {
  await this.expectVisible(this.page.locator('#tp-detalle').getByText(text), `The week detail does not show "${text}"`);
});

Then('the season chart is accessible', async function () {
  const m = await this.page.evaluate(() => ({
    svg: !!document.querySelector('svg.tp-svg[aria-label]'), cols: document.querySelectorAll('svg.tp-svg g.tp-col[aria-label]').length,
    mobile: !!document.querySelector('ol.tp-lista'),
  }));
  if (m.mobile) return; // on mobile the list of weeks with mini bars is shown
  assert.ok(m.svg && m.cols > 10, 'The chart has no accessible name or columns per week');
});
