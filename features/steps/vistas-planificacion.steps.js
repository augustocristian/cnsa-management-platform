// Steps shared by Planning (pool and season), Calendar and the tutorial: action menus, page overflow,
// agenda at "today", month grid with keyboard, toasts with "Deshacer" and the tutorial controls.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// ---- Pages and menus ----
Then('the page does not overflow horizontally', async function () {
  await this.eventually(async () => {
    const m = await this.page.evaluate(() => ({ width: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }));
    assert.ok(m.width <= m.visible + 1, `The page overflows: ${m.width} > ${m.visible}`);
  });
});

When('I choose the option {string} of the menu', async function (name) {
  await this.page.getByRole('menuitem', { name: name }).click();
});

Then('the option {string} is in the menu', async function (name) {
  await this.expectVisible(this.page.getByRole('menuitem', { name: name }), `There is no menu option «${name}»`);
});

When('I press {string} in the toast', async function (text) {
  await this.page.locator('#toasts .toast').getByRole('button', { name: text }).click();
});

Then('there is a single export menu in the header', async function () {
  assert.equal(await this.page.locator('.page-head .enp-mn-btn').count(), 1);
});

// ---- Calendar ----
Then('the first section of the agenda is today', async function () {
  await this.eventually(async () => {
    const first = this.page.locator('.cal-agenda-dia').first();
    assert.equal(await first.count(), 1);
    assert.ok((await first.getAttribute('class')).includes('cal-hoy'), 'The agenda does not start today');
  });
});

When('I focus today in the month grid', async function () {
  const today = this.page.locator('button.cal-num[aria-current="date"]');
  await today.waitFor({ timeout: this.timeout });
  await today.focus();
});

When('I press the key {string}', async function (key) {
  await this.page.keyboard.press(key);
});

Then('the selected day of the grid is the one {int} day(s) from now', async function (days) {
  const expected = await this.page.evaluate((n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);
  await this.eventually(async () => assert.equal(await this.page.locator('button.cal-num[aria-pressed="true"]').getAttribute('data-fecha'), expected));
});

Then('the Google Calendar sync is disabled and explained', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('#cal-sync').isDisabled(), true));
  await this.expectVisible(this.page.locator('#cal-sync-motivo'), 'It is not explained why the sync is disabled');
});

// ---- Tutorial ----
Then('I see {int} numbered steps of at least 44 pixels', async function (n) {
  const chips = this.page.locator('.tut-chip');
  await chips.first().waitFor({ timeout: this.timeout });
  assert.equal(await chips.count(), n);
  for (let i = 0; i < n; i++) {
    const box = await chips.nth(i).boundingBox();
    assert.ok(box.width >= 43.5 && box.height >= 43.5, `Step ${i + 1} measures ${box.width}x${box.height}`);
  }
});

Then('each Copy button says which value it copies', async function () {
  const buttons = this.page.locator('.tut-val .btn');
  await buttons.first().waitFor({ timeout: this.timeout });
  const labels = await buttons.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || ''));
  assert.ok(labels.length >= 1);
  labels.forEach((e) => assert.match(e, /^Copiar: .{4,}/));
});

Then('the tutorial does not inject styles into the page', async function () {
  assert.equal(await this.page.locator('style#tut-style').count(), 0);
  assert.ok(await this.page.locator('link[data-view-css="tutorial"]').count() >= 1);
});

// A field (filter, selector...) of the current view identified by its visible label
Then('I see the field {string}', async function (label) {
  await this.expectVisible(this.view.getByLabel(label), `The field is not visible: «${label}»`);
});
