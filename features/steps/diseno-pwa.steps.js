import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { route } from '../support/world.js';

// ---- Devices ----
Given('I use a phone {int} px wide', async function (width) { await this.page.setViewportSize({ width, height: 700 }); });
Given('I use a device {int} px wide', async function (width) { await this.page.setViewportSize({ width, height: 800 }); });

Then('the {string} screen has no horizontal scroll', async function (m) {
  await this.goTo(route(m));
  const excess = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(excess <= 0, `${excess}px of excess width in ${m}`);
});

Then('the {string} screen has a title', async function (m) {
  await this.goTo(route(m));
  await this.expectVisible(this.view.locator('h1, h2'));
});

Then('the navigation menu is at the {word}', async function (position) {
  const nav = this.page.locator('nav.sidebar');
  await nav.waitFor({ state: 'visible', timeout: this.timeout });
  const box = await nav.boundingBox();
  const vp = this.page.viewportSize();
  if (position === 'bottom') {
    assert.ok(Math.abs(box.y + box.height - vp.height) <= 2, `The bar is not at the bottom: ${JSON.stringify(box)}`);
    assert.ok(box.width >= vp.width - 2, 'The bottom bar does not take the full width');
  } else {
    assert.equal(position, 'side', 'Use "bottom" or "side"');
    assert.ok(box.x <= 2 && box.width < vp.width / 2, `The menu is not at the side: ${JSON.stringify(box)}`);
  }
});

Then('the menu options are at least {int} px tall', async function (min) {
  // Only the items on screen: on mobile the routes that live in the More sheet are display:none in the bar.
  const heights = await this.page.locator('.nav-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height).filter((h) => h > 0));
  assert.ok(heights.length > 0);
  assert.ok(heights.every((h) => h >= min), `Heights: ${heights}`);
});

Then('all the fields of the open form have a label', async function () {
  const unlabelled = await this.page.locator('.nad-modal, .grp-modal, .ent-modal, .modal').last()
    .locator('input:not([type=hidden]), select, textarea')
    .evaluateAll((els) => els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).map((e) => e.outerHTML.slice(0, 60)));
  assert.deepEqual(unlabelled, []);
});

Then('all the log fields of the screen have a label', async function () {
  const unlabelled = await this.view.locator('form input:not([type=hidden]), form select, form textarea')
    .evaluateAll((els) => els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).map((e) => e.outerHTML.slice(0, 60)));
  assert.deepEqual(unlabelled, []);
});

Then('the app declares a mobile-friendly viewport', async function () {
  const meta = await this.page.locator('meta[name=viewport]').getAttribute('content');
  assert.match(meta, /width=device-width/);
});

// ---- PWA ----
Then('the app manifest is valid', async function () {
  const res = await this.page.request.get('/manifest.webmanifest');
  assert.ok(res.ok());
  const m = await res.json();
  assert.ok(m.name, 'no name');
  assert.ok(m.start_url, 'no start_url');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.length > 0, 'no icons');
  this.manifest = m;
});

Then('all the manifest icons can be downloaded', async function () {
  for (const ic of this.manifest.icons) assert.ok((await this.page.request.get('/' + ic.src)).ok(), `${ic.src} is missing`);
});

Then('the service worker is active', async function () {
  const active = await this.page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  assert.equal(active, true);
});

When('I reload the app', async function () {
  await this.page.reload();
  await this.waitForShell();
});

When('I go offline', async function () {
  await this.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // The worker takes control of the page on its first load after activating
  await this.page.reload();
  await this.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Let the worker finish caching the modules loaded in this reload before cutting the network
  await this.waitForShell();
  await this.page.waitForLoadState('networkidle');
  await this.page.waitForTimeout(500);
  await this.context.setOffline(true);
});

Then('the app is still available with its data', async function () {
  await this.page.reload();
  await this.waitForShell();
  await this.goTo('nadadores');
  await this.expectVisible(this.view.locator('tr.nad-row'));
});

Then('the club sample data is loaded', async function () {
  await this.expectVisible(this.view.locator('tr.nad-row'));
});

// ---- Language ----
When('I change the language to {string}', async function (language) {
  // Flag buttons (radio group). In the shell the switch lives in the settings menu; on the start screens it is on the page.
  const code = { English: 'en', Italiano: 'it', 'Español': 'es' }[language];
  assert.ok(code, `Unknown language ${language}`);
  if (await this.page.locator('.account-btn').count()) await this.openAccountMenu();
  await this.page.locator(`.lang-switch [data-lang="${code}"]`).first().click();
  await this.eventually(async () => assert.equal(await this.page.locator(`.lang-switch [data-lang="${code}"]`).first().getAttribute('aria-checked'), 'true'));
});

Then('the menu shows {string} for the module {string}', async function (text, m) {
  await this.eventually(async () => assert.match(await this.page.locator(`.nav-item[data-route="${route(m)}"]`).first().textContent(), new RegExp(text, 'i')));
});

Then('the document language is {string}', async function (cod) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.lang), cod));
});
