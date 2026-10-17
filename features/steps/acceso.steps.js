// Steps for the Google sign-in and the first start. They use the test adapter (fakeGoogle.js): this.drive() reads the
// simulated "Drive" of the page (window.__CNL_FAKE__).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Given('I have created the club {string} with the wizard', async function (name) {
  await this.page.getByRole('button', { name: 'Conectar Google Drive' }).click();
  await this.fill(this.page, 'Nombre del club', name);
  await this.page.getByRole('button', { name: 'Siguiente' }).click();
  await this.page.getByRole('button', { name: 'Crear mi club' }).click();
  await this.waitForShell();
});

Then('Drive contains the club {string}', async function (name) {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.clubs.some((c) => c.name === name), `There is no club "${name}" in cnl: ${d.clubs.map((c) => c.name).join(', ')}`);
  });
});

Then('the swimmers list is empty', async function () {
  await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
  await this.eventually(async () => assert.equal(await this.view.locator('tr.nad-row').count(), 0));
});

Then('the home panel offers the first steps:', async function (table) {
  const card = this.view.locator('#primeros-pasos');
  await this.expectVisible(card, 'The first steps card is not visible');
  for (const [step] of table.raw()) await this.expectVisible(card.getByRole('link', { name: step }), `The step "${step}" is missing`);
});

Then('the field {string} contains {string}', async function (label, value) {
  await this.eventually(async () => assert.equal(await this.page.getByLabel(label).first().inputValue(), value));
});

Then('the Drive preferences store {string} with the value {string}', async function (key, value) {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.prefs, 'cnl/preferencias.json does not exist yet');
    assert.equal(d.prefs.valores[key], value);
  });
});

Then('I see the origin of this page to copy it', async function () {
  const origin = new URL(this.page.url()).origin;
  await this.expectVisible(this.page.locator('[data-codigo] code', { hasText: origin }), `The origin ${origin} is not shown`);
});

Then('the club file in Drive does not contain the swimmer {string}', async function (name) {
  await this.page.waitForTimeout(2500); // longer than the upload debounce (1.5 s): if it were going to be uploaded it already would have
  const d = await this.drive();
  assert.ok(!d.clubs.some((c) => (c.doc.hojas.Nadadores || []).some((n) => n.nombre === name)), `"${name}" should not be in Drive yet`);
});

Then('the sync indicator shows {string}', async function (text) {
  await this.openAccountMenu();
  await this.eventually(async () => assert.equal((await this.page.locator('.status-chip .status-text').innerText()).trim(), text));
});

When('I recover the connection', async function () {
  await this.context.setOffline(false);
});

// ---- Start screen ----
When('I choose the language {string}', async function (language) {
  await this.page.locator('.acc-foot').getByRole('radio', { name: language }).click();
});

Then('the start screen does not mention accounts or signing in', async function () {
  const txt = (await this.page.locator('main').innerText()).toLowerCase();
  for (const word of ['iniciar sesión', 'inicia sesión', 'cuenta', 'correo', 'bienvenido de nuevo']) assert.ok(!txt.includes(word), `The screen mentions "${word}"`);
});

Then('the language selector of the start screen is in the card footer', async function () {
  await this.expectVisible(this.page.locator('.acc-foot .lang-switch'));
  const r = await this.page.evaluate(() => {
    const card = document.querySelector('main.auth-card');
    const children = [...card.children].filter((e) => getComputedStyle(e).display !== 'none');
    const foot = card.querySelector('.acc-foot');
    return { first: children[0].matches('.acc-foot, .auth-lang'), last: children[children.length - 1] === foot };
  });
  assert.equal(r.first, false, 'The language is the first thing in the card');
  assert.equal(r.last, true, 'The language is not at the end of the card');
});

Then('the start screen has no language dropdown', async function () {
  assert.equal(await this.page.locator('main select:visible').count(), 0);
});

Then('the origin of this page and its Copy button are aligned', async function () {
  const box = this.page.locator('.acc-copy').first();
  await this.expectVisible(box);
  const r = await box.evaluate((el) => {
    const a = el.querySelector('code').getBoundingClientRect();
    const b = el.querySelector('button').getBoundingClientRect();
    return { dy: Math.abs(a.top - b.top), dh: Math.abs(a.height - b.height), sameRow: a.bottom > b.top && b.bottom > a.top };
  });
  assert.ok(r.sameRow && r.dy <= 1 && r.dh <= 1, `Field and button are misaligned: ${JSON.stringify(r)}`);
});

Then('the club preview uses the chosen colour', async function () {
  await this.page.locator('#as-color1').evaluate((el) => { el.value = '#d81b60'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await this.eventually(async () => {
    const v = await this.page.locator('.acc-prev').evaluate((el) => el.style.getPropertyValue('--c-action'));
    assert.match(v, /^#[0-9a-f]{6}$/i);
    assert.notEqual(v.toLowerCase(), '#1a73e8');
  });
});
