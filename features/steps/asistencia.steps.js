import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { textRegex, allWords } from '../support/world.js';

const card = (world, name) => world.view.locator('.asi-card').filter({ hasText: allWords(name) }).first();
// Status word used in the steps -> value of data-estado (stored value, Spanish) and button label (UI, Spanish).
const STATES = {
  present: { attr: 'presente', label: 'Presente' },
  absent: { attr: 'ausente', label: 'Ausente' },
  excused: { attr: 'justificado', label: 'Justificado' },
};

When('I select the session {string} to take attendance', async function (title) {
  const sel = this.view.locator('#asi-sesion');
  const value = await sel.locator('option', { hasText: textRegex(title) }).first().getAttribute('value');
  await sel.selectOption(value);
});

// Present and absent are one tap; excused is chosen in the "more options" sheet.
When('I mark the status {word} for {string}', async function (status, name) {
  assert.ok(STATES[status], 'Invalid status: use present, absent or excused');
  const c = card(this, name);
  if (status === 'excused') {
    await c.locator('.asi-more').click();
    const dialog = this.page.locator('.sheet');
    await dialog.getByRole('button', { name: STATES[status].label, exact: true }).click();
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    return;
  }
  await c.locator(`.asi-btn[data-estado="${STATES[status].attr}"]`).click();
});

When('I tap {string} again for {string}', async function (status, name) {
  await card(this, name).locator(`.asi-btn[data-estado="${STATES[status]?.attr ?? status}"]`).click();
});

When('I mark all the swimmers as present', async function () {
  await this.view.getByRole('button', { name: 'Marcar todos presentes' }).click();
});

When('I undo the last attendance action', async function () {
  await this.page.locator('#toasts .toast-action', { hasText: 'Deshacer' }).click();
});

When('I open the attendance history', async function () {
  await this.view.getByRole('tab', { name: 'Historial' }).click();
});

When('I filter the history by the group {string}', async function (g) {
  await this.view.locator('#asi-grupo').selectOption({ label: g });
});

When('I expand the attendance detail of {string}', async function (name) {
  await this.view.locator('tbody tr.asi-fila').filter({ hasText: allWords(name) }).first().locator('.asi-name-btn').click();
});

Then('{string} appears as {string} in the list', async function (name, status) {
  await this.eventually(async () => assert.equal((await card(this, name).locator('.asi-state').innerText()).trim(), status));
});

// Counts live in the sticky summary chips (label and number may be in either order and separator).
Then('the attendance count shows {string}', async function (text) {
  const number = (text.match(/\d+/) || [''])[0];
  const label = text.replace(/[\d:]/g, '').trim();
  const re = new RegExp(String.raw`${label}\D{0,6}${number}\b|\b${number}\D{0,6}${label}`, 'i');
  await this.eventually(async () => assert.match((await this.view.locator('.asi-sticky').innerText()).replace(/\s+/g, ' '), re, `Counter ${text} not found`));
});

Then('the attendance summary says {string}', async function (text) {
  await this.expectVisible(this.view.locator('.asi-sticky', { hasText: text }));
});

Then('the list includes {int} swimmers', async function (n) {
  await this.eventually(async () => assert.equal(await this.view.locator('.asi-card').count(), n));
});

Then('every swimmer in the list has Present and Absent buttons of at least 44 pixels', async function () {
  const heights = await this.view.locator('.asi-card .asi-btn, .asi-card .asi-more').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(heights.length > 0, 'There are no buttons');
  assert.ok(heights.every((a) => a >= 44), `Buttons too short: ${heights}`);
});

Then('the history shows the attendance percentage of {string}', async function (name) {
  const row = this.view.locator('tbody tr.asi-fila').filter({ hasText: allWords(name) }).first();
  await this.expectVisible(row.locator('.asi-pct'), `No percentage for ${name}`);
});

Then('the history shows {int} swimmers', async function (n) {
  await this.eventually(async () => assert.equal(await this.view.locator('tbody tr.asi-fila').count(), n));
});

Then('the detail says {string}', async function (text) {
  await this.expectVisible(this.view.locator('.asi-det').getByText(text));
});
