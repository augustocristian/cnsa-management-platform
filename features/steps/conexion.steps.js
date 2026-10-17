// Steps for the Drive connection and the demo mode (there is no sign-in and no user identity). Spanish phrases kept in sync
// with the older "sesión" ones in comunes.steps.js, which stay as aliases for features that have not been reworded yet.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const claves = (page) => page.evaluate(() => Object.keys(localStorage));

// ---- Drive connected / not connected ----
Given('que la aplicación está recién abierta sin Drive conectado', async function () {
  await this.abrirApp({ conectado: false });
});

Given('un club con Drive conectado y datos de demostración', async function () {
  await this.entrarConClub({ demo: true });
});

Given('un club vacío con Drive conectado', async function () {
  await this.entrarConClub({ demo: false });
});

Given('que la aplicación está abierta y Google rechaza la conexión con {string}', async function (codigo) {
  await this.abrirApp({ conectado: false, errorConexion: codigo });
});

// ---- Demo mode ----
When('pulso {string} en el aviso de la demo', async function (texto) {
  await this.page.locator('#cnl-avisos [data-aviso="demo"]').getByRole('button', { name: texto }).click();
});

When('confirmo que quiero salir de la demo', async function () {
  await this.page.locator('.sheet, .modal').getByRole('button', { name: 'Salir de la demo' }).click();
});

Then('el aviso de la demo está visible', async function () {
  await this.verVisible(this.page.locator('#cnl-avisos [data-aviso="demo"]'), 'No se ve el aviso de modo demostración');
});

Then('no se ve el aviso de la demo', async function () {
  assert.equal(await this.page.locator('#cnl-avisos [data-aviso="demo"]').count(), 0);
});

Then('los datos de la demo solo existen en este navegador', async function () {
  await this.eventually(async () => {
    const k = await claves(this.page);
    assert.ok(k.includes('cnl:mode') && k.some((x) => x.startsWith('cnl:demo:')), `Faltan los datos locales de la demo: ${k.join(', ')}`);
    assert.ok(!k.some((x) => x.startsWith('cnl:club:')), 'La demo no debe usar el espejo de un club real');
  });
});

Then('el navegador no guarda ningún dato de la demo', async function () {
  await this.eventually(async () => {
    const k = await claves(this.page);
    const demo = k.filter((x) => x === 'cnl:mode' || x.startsWith('cnl:demo:'));
    assert.deepEqual(demo, [], 'Quedan datos de la demo: ' + demo.join(', '));
  });
});

Then('Drive no contiene ningún club', async function () {
  const d = await this.drive();
  assert.deepEqual(d.clubs, [], 'Drive recibió datos que no debía');
  assert.deepEqual(d.archivos, []);
});

Then('Drive está conectado', async function () {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => localStorage.getItem('cnl:drive-auth')), '1'));
});

When('recargo la pantalla de inicio', async function () {
  await this.page.reload();
  await this.page.locator('main.auth-card').waitFor({ timeout: this.timeout });
});

// ---- The demo is only offered while there is no Google Client ID ----
Given('que la aplicación está abierta sin Client ID de Google y Google rechaza la conexión con {string}', async function (codigo) {
  await this.abrirApp({ sinClientId: true, errorConexion: codigo });
});

When('se configura un ID de cliente de Google y recargo la aplicación', async function () {
  // The fake adapter reads its options from localStorage on every load: this is what pasting a Client ID (or setting
  // BUILTIN_CLIENT_ID) means for it.
  await this.page.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('cnl:test:opts') || '{}');
    o.sinClientId = false;
    localStorage.setItem('cnl:test:opts', JSON.stringify(o));
  });
  await this.page.reload();
});

Then('la demo es la primera acción de la pantalla', async function () {
  const primero = await this.page.locator('main.auth-card').evaluate((card) => {
    const acciones = [...card.querySelectorAll('button, a[href]')].filter((e) => e.offsetParent !== null);
    return acciones[0]?.id || null;
  });
  assert.equal(primero, 'btn-demo', 'La primera acción de la pantalla no es "Probar la demo"');
});

Then('el aviso de la demo ofrece {string}', async function (texto) {
  await this.verVisible(this.page.locator('#cnl-avisos [data-aviso="demo"]').getByRole('button', { name: texto }), `El aviso de la demo no ofrece "${texto}"`);
});

Then('el aviso de la demo no ofrece {string}', async function (texto) {
  assert.equal(await this.page.locator('#cnl-avisos [data-aviso="demo"]').getByRole('button', { name: texto }).count(), 0);
});

Then('la pantalla de inicio no menciona la demo', async function () {
  const txt = (await this.page.locator('main.auth-card').innerText()).toLowerCase();
  assert.ok(!txt.includes('demo'), 'La pantalla de inicio menciona la demo');
});

Then('la pantalla de inicio no muestra el aviso de demo cerrada', async function () {
  assert.equal(await this.page.locator('#acc-aviso').count(), 0);
});
