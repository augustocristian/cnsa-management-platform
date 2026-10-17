// Steps for the Drive connection and the demo mode (there is no sign-in and no user identity).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const keys = (page) => page.evaluate(() => Object.keys(localStorage));

// ---- Drive connected / not connected ----
Given('the app has just been opened without Drive connected', async function () {
  await this.openApp({ connected: false });
});

Given('a club with Drive connected and demo data', async function () {
  await this.enterClub({ demo: true });
});

Given('an empty club with Drive connected', async function () {
  await this.enterClub({ demo: false });
});

Given('the app is open and Google rejects the connection with {string}', async function (code) {
  await this.openApp({ connected: false, connectionError: code });
});

// ---- Demo mode ----
When('I press {string} in the demo notice', async function (text) {
  await this.page.locator('#cnl-avisos [data-aviso="demo"]').getByRole('button', { name: text }).click();
});

When('I confirm that I want to leave the demo', async function () {
  await this.page.locator('.sheet, .modal').getByRole('button', { name: 'Salir de la demo' }).click();
});

Then('the demo notice is visible', async function () {
  await this.expectVisible(this.page.locator('#cnl-avisos [data-aviso="demo"]'), 'The demo mode notice is not visible');
});

Then('the demo notice is not visible', async function () {
  assert.equal(await this.page.locator('#cnl-avisos [data-aviso="demo"]').count(), 0);
});

Then('the demo data only exists in this browser', async function () {
  await this.eventually(async () => {
    const k = await keys(this.page);
    assert.ok(k.includes('cnl:mode') && k.some((x) => x.startsWith('cnl:demo:')), `The local demo data is missing: ${k.join(', ')}`);
    assert.ok(!k.some((x) => x.startsWith('cnl:club:')), 'The demo must not use the mirror of a real club');
  });
});

Then('the browser stores no demo data', async function () {
  await this.eventually(async () => {
    const k = await keys(this.page);
    const demo = k.filter((x) => x === 'cnl:mode' || x.startsWith('cnl:demo:'));
    assert.deepEqual(demo, [], 'Demo data is left: ' + demo.join(', '));
  });
});

Then('Drive contains no club', async function () {
  const d = await this.drive();
  assert.deepEqual(d.clubs, [], 'Drive received data it should not have');
  assert.deepEqual(d.files, []);
});

Then('Drive is connected', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => localStorage.getItem('cnl:drive-auth')), '1'));
});

When('I reload the start screen', async function () {
  await this.page.reload();
  await this.page.locator('main.auth-card').waitFor({ timeout: this.timeout });
});

// ---- The demo is only offered while there is no Google Client ID ----
Given('the app is open without a Google Client ID and Google rejects the connection with {string}', async function (code) {
  await this.openApp({ noClientId: true, connectionError: code });
});

When('a Google client ID is configured and I reload the app', async function () {
  // The fake adapter reads its options from localStorage on every load: this is what pasting a Client ID (or setting
  // BUILTIN_CLIENT_ID) means for it.
  await this.page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('cnl:test:opts') || '{}');
    o.sinClientId = false;
    localStorage.setItem('cnl:test:opts', JSON.stringify(o));
  });
  await this.page.reload();
});

Then('the demo is the first action of the screen', async function () {
  const first = await this.page.locator('main.auth-card').evaluate((card) => {
    const actions = [...card.querySelectorAll('button, a[href]')].filter((e) => e.offsetParent !== null);
    return actions[0]?.id || null;
  });
  assert.equal(first, 'btn-demo', 'The first action of the screen is not "Probar la demo"');
});

Then('the demo notice offers {string}', async function (text) {
  await this.expectVisible(this.page.locator('#cnl-avisos [data-aviso="demo"]').getByRole('button', { name: text }), `The demo notice does not offer "${text}"`);
});

Then('the demo notice does not offer {string}', async function (text) {
  assert.equal(await this.page.locator('#cnl-avisos [data-aviso="demo"]').getByRole('button', { name: text }).count(), 0);
});

Then('the start screen does not mention the demo', async function () {
  const txt = (await this.page.locator('main.auth-card').innerText()).toLowerCase();
  assert.ok(!txt.includes('demo'), 'The start screen mentions the demo');
});

Then('the start screen does not show the closed-demo notice', async function () {
  assert.equal(await this.page.locator('#acc-aviso').count(), 0);
});
