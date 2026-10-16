// Steps for data integrity and GDPR. They use the simulated Drive of the page (window.__CNL_FAKE__).
// The quoted texts are UI strings (Spanish); the step wording itself is English.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ruta, todasLasPalabras } from '../support/world.js';

const storageKeys = (page) => page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }));

Given('a demo club is open', async function () {
  await this.entrarConClub({ demo: true });
});

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
  await this.irA('club');
  await this.rellenar(this.vista, 'Lema', motto);
  await this.vista.getByRole('button', { name: 'Guardar identidad' }).click();
});

When('I sign out', async function () {
  await this.page.locator('.topbar').getByRole('button', { name: 'Salir' }).click();
});

Then('the browser holds no local club or session copies', async function () {
  await this.page.locator('body').waitFor();
  await this.eventually(async () => {
    const { local, session } = await storageKeys(this.page);
    const personal = [...local, ...session].filter((k) => k.startsWith('cnl:club:') || k.startsWith('cnl:cal-sync:') || ['cnl:user', 'cnl:prefs', 'cnl:token'].includes(k));
    assert.deepEqual(personal, [], 'Personal data is left in the browser: ' + personal.join(', '));
  });
});

Then('the screen shows the text {string}', async function (text) {
  await this.verVisible(this.page.locator('body').getByText(text), `The text "${text}" is not visible`);
});

Then('the screen does not show the text {string}', async function (text) {
  await this.noVer(this.page.locator('body').getByText(text), `The text "${text}" is visible`);
});

Then('the screen offers the button {string}', async function (name) {
  await this.verVisible(this.page.getByRole('button', { name }), `The button "${name}" is not visible`);
});

// Buttons: inside an open dialog if there is one, otherwise on the view or the page (recovery screens have no #view).
When('I press the button {string}', async function (name) {
  const scope = await this.ambito();
  await scope.getByRole('button', { name }).or(scope.getByRole('link', { name })).first().click();
});

When('I press the confirmation button {string}', async function (name) {
  await this.page.locator('.modal').getByRole('button', { name }).click();
});

When('I press {string} in the notices bar', async function (name) {
  await this.page.locator('#cnl-avisos').getByRole('button', { name }).click();
});

Then('I am in the {string} module', async function (module) {
  await this.page.locator(`.nav-item[data-route="${ruta(module)}"].active`).waitFor({ timeout: this.timeout });
});

When('I open the {string} module', async function (module) {
  await this.irA(ruta(module));
});

When('I open the profile of the swimmer {string}', async function (name) {
  await this.vista.locator('tr.nad-row').filter({ hasText: todasLasPalabras(name) }).first().click();
  await this.verVisible(this.vista.getByRole('heading', { level: 1 }).filter({ hasText: todasLasPalabras(name) }));
});

When('the club file in Drive gets damaged and the page reloads', async function () {
  await this.page.evaluate(() => { const f = window.__CNL_FAKE__; f.corromperClub(f.clubs()[0].id, '{ this is not json'); });
  await this.page.reload();
});

Then('the app shell opens', async function () {
  await this.esperarShell();
  await this.verVisible(this.page.locator('.nav-item.active'), 'The menu has no active item');
});

When('another device saves the club with the name {int} and a non-text motto', async function (n) {
  await this.page.evaluate((name) => {
    const f = window.__CNL_FAKE__;
    f.editarClubExterno(f.clubs()[0].id, (d) => { d.club = { ...d.club, nombre: name, lema: { no: 'es texto' }, logo: null }; });
  }, n);
});

When('I reload the app', async function () {
  await this.page.reload();
  await this.esperarShell();
});

Then('the club name in the header is {string}', async function (name) {
  await this.eventually(async () => assert.equal((await this.page.locator('.topbar .brand-name').innerText()).trim(), name));
});

When('the Google session expires', async function () {
  await this.page.evaluate(() => window.__CNL_FAKE__.caducarSesion());
});

Then('Drive preferences store the privacy acceptance', async function () {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.prefs && d.prefs.valores && d.prefs.valores.privacidadAceptada === true, 'The acceptance has not been stored yet');
  });
});

// Spanish alias kept because features/uso-individual.feature (Spanish Gherkin) uses this assertion.
Then('el navegador no guarda copias locales de datos del club ni de la sesión', async function () {
  await this.page.locator('body').waitFor();
  await this.eventually(async () => {
    const { local, session } = await storageKeys(this.page);
    const personal = [...local, ...session].filter((k) => k.startsWith('cnl:club:') || k.startsWith('cnl:cal-sync:') || ['cnl:user', 'cnl:prefs', 'cnl:token'].includes(k));
    assert.deepEqual(personal, [], 'Personal data is left in the browser: ' + personal.join(', '));
  });
});
