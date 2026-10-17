// Steps for data integrity and GDPR. They use the simulated Drive of the page (window.__CNL_FAKE__).
// The quoted texts are UI strings (Spanish); the step wording itself is English.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const storageKeys = (page) => page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));

Given('the club file in Drive contains the swimmer {string}', async function (name) {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.clubs.some((c) => (c.doc.hojas.Nadadores || []).some((n) => n.nombre === name)), `"${name}" is not in the Drive file yet`);
  });
});

Then('the club file in Drive no longer contains the swimmer {string}', async function (name) {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.clubs.length, 'There is no club in Drive');
    assert.ok(!d.clubs.some((c) => (c.doc.hojas.Nadadores || []).some((n) => n.nombre === name)), `"${name}" is still in the Drive file`);
  });
});

Then('the club file in Drive still holds the other swimmers', async function () {
  const d = await this.drive();
  assert.ok(d.clubs[0].doc.hojas.Nadadores.length >= 10, 'More swimmers than the deleted one are gone');
});

Given('Drive rejects writes', async function () {
  await this.page.evaluate(() => { window.__CNL_FAKE__.opciones.fallos.escribir = 'offline'; });
});

When('I change the club motto to {string}', async function (motto) {
  await this.goTo('club');
  await this.fill(this.view, 'Lema', motto);
  await this.view.getByRole('button', { name: 'Guardar identidad' }).click();
});

When('I disconnect Drive', async function () {
  await this.disconnectDrive();
});

Then('the browser holds no local club or session copies', async function () {
  await this.page.locator('body').waitFor();
  await this.eventually(async () => {
    const { local, session } = await storageKeys(this.page);
    const personal = [...local, ...session].filter((k) => k.startsWith('cnl:club:') || k.startsWith('cnl:cal-sync:') || ['cnl:user', 'cnl:prefs', 'cnl:token', 'cnl:drive-auth', 'cnl:mode'].includes(k) || k.startsWith('cnl:demo:'));
    assert.deepEqual(personal, [], 'Personal data is left in the browser: ' + personal.join(', '));
  });
});

Then('the screen does not show the text {string}', async function (text) {
  await this.expectHidden(this.page.locator('body').getByText(text), `The text "${text}" is visible`);
});

When('I press the confirmation button {string}', async function (name) {
  await this.page.locator('.modal').getByRole('button', { name }).click();
});

When('I press {string} in the notices bar', async function (name) {
  await this.page.locator('#cnl-avisos').getByRole('button', { name }).click();
});

When('the club file in Drive gets damaged and the page reloads', async function () {
  await this.page.evaluate(() => { const f = window.__CNL_FAKE__; f.corromperClub(f.clubs()[0].id, '{ this is not json'); });
  await this.page.reload();
});

Then('the app shell opens', async function () {
  await this.waitForShell();
  await this.expectVisible(this.page.locator('.nav-item.active:visible'), 'The menu has no active item');
});

When('another device saves the club with the name {int} and a non-text motto', async function (n) {
  await this.page.evaluate((name) => {
    const f = window.__CNL_FAKE__;
    f.editarClubExterno(f.clubs()[0].id, (d) => { d.club = { ...d.club, nombre: name, lema: { no: 'es texto' }, logo: null }; });
  }, n);
});

Then('the club name in the header is {string}', async function (name) {
  await this.eventually(async () => assert.equal((await this.page.locator('.topbar .brand-name').innerText()).trim(), name));
});

When('the Drive connection expires', async function () {
  await this.page.evaluate(() => window.__CNL_FAKE__.caducarSesion());
});

Then('Drive preferences store the privacy acceptance', async function () {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.prefs && d.prefs.valores && d.prefs.valores.privacidadAceptada === true, 'The acceptance has not been stored yet');
  });
});
