import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const editor = (world) => world.page.locator('.enp-ov');
const planRow = (world, set, order) => editor(world).locator(`.enp-row[data-set="${set}"][data-orden="${order}"]`);
const chip = (world, set, order, name) => planRow(world, set, order).locator(`.enp-c[data-contenido="${name}"]`);
// The contents pane of a row opens with its chip (on wide screens it is always visible)
async function open(world, set, order) {
  const pane = planRow(world, set, order).locator('[data-pane="contenidos"]');
  if (!(await pane.isVisible())) await planRow(world, set, order).locator('[data-chip="contenidos"]').click();
}
const text = async (loc) => ((await loc.first().textContent()) || '').replace(/\s+/g, ' ').trim();

When('I add the content {string} to row {int} of set {int}', async function (name, order, set) {
  await open(this, set, order);
  await planRow(this, set, order).locator('select.enp-c-add').selectOption({ value: name });
  await chip(this, set, order, name).waitFor({ timeout: this.timeout });
});
Then('the content {string} of row {int} of set {int} distributes {string}', async function (name, order, set, part) {
  await this.eventually(async () => assert.ok((await text(chip(this, set, order, name).locator('.enp-c-res'))).includes(part), `It does not distribute «${part}»`));
});
When('I set {string} metres per repetition of {string} in row {int} of set {int}', async function (value, name, order, set) {
  await open(this, set, order);
  await chip(this, set, order, name).locator('.enp-c-val').fill(value);
});
Then('the content {string} of row {int} of set {int} is in mode {string}', async function (name, order, set, mode) {
  await this.eventually(async () => assert.equal(await text(chip(this, set, order, name).locator('.enp-c-modo')), mode));
});
When('I autocomplete row {int} of set {int} from the text', async function (order, set) {
  await open(this, set, order);
  await planRow(this, set, order).getByRole('button', { name: /Autocompletar desde el texto/ }).click();
});
Then('I see the unassigned remainder {string} in row {int} of set {int}', async function (part, order, set) {
  await open(this, set, order);
  const remainder = planRow(this, set, order).locator('.enp-c-resto');
  await this.eventually(async () => {
    assert.ok(await remainder.isVisible(), 'The remainder indicator is not visible');
    assert.ok((await text(remainder)).includes(part));
  });
});
Then('there is no unassigned remainder in row {int} of set {int}', async function (order, set) {
  await this.eventually(async () => assert.equal(await planRow(this, set, order).locator('.enp-c-resto').isVisible(), false));
});
When('I assign the remainder of row {int} of set {int} to {string}', async function (order, set, name) {
  await open(this, set, order);
  const remainder = planRow(this, set, order).locator('.enp-c-resto');
  await remainder.locator('select').selectOption({ value: name });
  await remainder.getByRole('button', { name: 'Asignar resto' }).click();
});

// The summary is read with textContent: on mobile the panel is folded but still in the DOM.
Then('the session summary says {string}', async function (part) {
  await this.eventually(async () => assert.ok((await text(editor(this).locator('[data-resumen="texto"]'))).includes(part), `The summary does not say «${part}»`));
});
const weighs = async (world, panel, key, m, pct) => {
  const li = editor(world).locator(`.enp-res-${panel} .enp-leg li[data-clave="${key}"]`);
  await world.eventually(async () => {
    const t = await text(li);
    assert.ok(t.includes(m) && t.includes(pct), `«${key}»: ${t}`);
  });
};
Then('the content {string} weighs {string} and {string} in the summary', async function (name, m, pct) { await weighs(this, 'cont', name, m, pct); });
Then('the stroke {string} adds up to {string} and {string} in the summary', async function (name, m, pct) { await weighs(this, 'est', name, m, pct); });

When('I copy the session summary', async function () {
  await this.page.evaluate(() => {
    window.__copied = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied.push(t); } }, configurable: true });
  });
  await editor(this).locator('.enp-res button', { hasText: 'Copiar resumen' }).evaluate((b) => b.click());
});
Then('the clipboard contains {string}', async function (part) {
  await this.eventually(async () => {
    const t = (await this.page.evaluate(() => (window.__copied || []).join('\n'))) || '';
    assert.ok(t.includes(part), `Clipboard: ${t}`);
  });
});

When('I log the loads from the plan', async function () {
  await editor(this).locator('.enp-res button', { hasText: 'Registrar cargas desde el plan' }).evaluate((b) => b.click());
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).evaluate((b) => b.click());
});
