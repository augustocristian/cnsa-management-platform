// Steps for individual use: each person has their own data in their own Drive, and the same person sees the same
// data on every device. A second "device" is a second Playwright browser context (separate storage); the simulated
// Drive (js/infrastructure/fakeGoogle.js) lives in each page's localStorage, so "the same Drive" is shared by copying
// that mirror ('cnl:test:drive') between contexts.
import { When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { route } from '../support/world.js';

const DRIVE_KEY = 'cnl:test:drive';

// Runs `fn` with the world pointing at the other device's page (the world helpers use this.page).
async function onOtherDevice(world, fn) {
  assert.ok(world.otherPage, 'The app must be opened on another device first');
  const own = world.page;
  world.page = world.otherPage;
  try { return await fn(); } finally { world.page = own; }
}

// options: { copyDrive: boolean }. There is no identity: "the same person" means the same (simulated) Drive.
async function openOtherDevice(world, { copyDrive }) {
  const origin = new URL(world.page.url()).origin;
  let drive = null;
  if (copyDrive) {
    drive = await world.page.evaluate((k) => localStorage.getItem(k), DRIVE_KEY);
    assert.ok(drive, 'The first device has no simulated Drive');
  }
  world.otherContext = await world.context.browser().newContext({
    viewport: world.page.viewportSize(), baseURL: origin, locale: 'es-ES', acceptDownloads: true,
  });
  const otherPage = await world.otherContext.newPage();
  otherPage.setDefaultTimeout(8000);
  otherPage.on('pageerror', (e) => world.errors.push(`pageerror (other device): ${e}`));
  await otherPage.addInitScript(([d, k]) => {
    try {
      if (sessionStorage.getItem('e2e-init')) return;
      localStorage.setItem('cnl:test', '1');
      localStorage.setItem('cnl:test:opts', JSON.stringify({ conectado: true }));
      localStorage.setItem('cnl:lang', 'es');
      if (d) { // same Drive: the copied mirror plus the "already authorized" flag
        localStorage.setItem(k, d);
        localStorage.setItem('cnl:drive-auth', '1');
      }
      sessionStorage.setItem('e2e-init', '1');
    } catch (e) { /* ignore */ }
  }, [drive, DRIVE_KEY]);
  await otherPage.goto('/');
  world.otherPage = otherPage;
}

After(async function () {
  await this.otherContext?.close();
});

When('I open the app on another device with the same Drive', async function () {
  await openOtherDevice(this, { copyDrive: true });
  await onOtherDevice(this, () => this.waitForShell());
});

When('another person opens the app with their own Drive', async function () {
  await openOtherDevice(this, { copyDrive: false });
});

When('on the other device I open the {string} module', async function (module) {
  await onOtherDevice(this, () => this.goTo(route(module)));
});

When('on the other device I register the swimmer {string} {string}', async function (name, surnames) {
  await onOtherDevice(this, async () => {
    await this.view.getByRole('button', { name: 'Nuevo nadador' }).click();
    const modal = this.page.locator('.nad-modal');
    await modal.waitFor({ timeout: this.timeout });
    await modal.getByLabel('Nombre *').first().fill(name);
    await modal.getByLabel('Apellidos *').first().fill(surnames);
    await modal.getByRole('button', { name: 'Guardar', exact: true }).click();
    await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
  });
});

Then('on the other device I see someone named {string} on the screen', async function (name) {
  await onOtherDevice(this, () => this.expectVisible(this.view.locator('tr.nad-row').filter({ hasText: name }), `"${name}" is not visible on the other device`));
});

Then('on the other device I do not see someone named {string} on the screen', async function (name) {
  await onOtherDevice(this, async () => {
    await this.page.waitForTimeout(500);
    assert.equal(await this.page.locator('tr.nad-row').filter({ hasText: name }).count(), 0);
  });
});

Then('on the other device I see the heading {string}', async function (text) {
  await onOtherDevice(this, () => this.expectVisible(this.page.getByRole('heading', { name: text }), `The heading "${text}" is not visible`));
});

Then('no device shows any user identity', async function () {
  const noIdentity = async () => {
    await this.openAccountMenu();
    const txt = await this.page.locator('.topbar, .account-panel').evaluateAll((els) => els.map((e) => e.innerText).join('\n'));
    assert.ok(!/@/.test(txt), 'An e-mail address is shown: ' + txt);
    assert.equal(await this.page.locator('#user-box, .topbar .avatar, .account-panel .avatar, .account-btn .avatar').count(), 0);
    assert.equal(await this.page.evaluate(() => localStorage.getItem('cnl:user')), null);
  };
  await noIdentity();
  await onOtherDevice(this, noIdentity);
});

Then('no user identity is shown', async function () {
  await this.openAccountMenu();
  const txt = await this.page.locator('.topbar, .account-panel').evaluateAll((els) => els.map((e) => e.innerText).join('\n'));
  assert.ok(!/@/.test(txt), 'An e-mail address is shown: ' + txt);
  assert.equal(await this.page.locator('#user-box, .topbar .avatar, .account-panel .avatar, .account-btn .avatar').count(), 0);
  assert.equal(await this.page.evaluate(() => localStorage.getItem('cnl:user')), null);
});

// The first device opens the app again after the other one saved: it receives the Drive as the other device left it.
When('I go back to the first device and open it again', async function () {
  const uploaded = (d) => Object.values(JSON.parse(d).clubs || {}).some((c) => ((c.doc.hojas || {}).Nadadores || []).some((n) => n.nombre === 'Itziar'));
  await this.eventually(async () => {
    const d = await this.otherPage.evaluate((k) => localStorage.getItem(k), DRIVE_KEY);
    assert.ok(d && uploaded(d), 'The other device has not uploaded the change to Drive yet');
  });
  const drive = await this.otherPage.evaluate((k) => localStorage.getItem(k), DRIVE_KEY);
  // Written by an init script (after the old page has unloaded), so the old page cannot overwrite it while closing.
  const nonce = String(Date.now());
  await this.page.addInitScript(([k, v, n]) => {
    try {
      if (sessionStorage.getItem('e2e-drive-sync') === n) return;
      localStorage.setItem(k, v);
      sessionStorage.setItem('e2e-drive-sync', n);
    } catch (e) { /* ignore */ }
  }, [DRIVE_KEY, drive, nonce]);
  await this.page.reload();
  await this.waitForShell();
});
