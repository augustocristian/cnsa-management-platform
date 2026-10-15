import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ruta } from '../support/world.js';

// ---- Dispositivos ----
Given('que uso un móvil de {int} px de ancho', async function (ancho) { await this.page.setViewportSize({ width: ancho, height: 700 }); });
Given('que uso un dispositivo de {int} px de ancho', async function (ancho) { await this.page.setViewportSize({ width: ancho, height: 800 }); });

Then('la pantalla {string} no tiene desplazamiento horizontal', async function (m) {
  await this.irA(ruta(m));
  const sobra = await this.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(sobra <= 0, `Sobran ${sobra}px de ancho en ${m}`);
});

Then('la pantalla {string} tiene un título', async function (m) {
  await this.irA(ruta(m));
  await this.verVisible(this.vista.locator('h1, h2'));
});

Then('el menú de navegación está {word}', async function (posicion) {
  const nav = this.page.locator('nav.sidebar');
  await nav.waitFor({ state: 'visible', timeout: this.timeout });
  const caja = await nav.boundingBox();
  const vp = this.page.viewportSize();
  if (posicion === 'abajo') {
    assert.ok(Math.abs(caja.y + caja.height - vp.height) <= 2, `La barra no está abajo: ${JSON.stringify(caja)}`);
    assert.ok(caja.width >= vp.width - 2, 'La barra inferior no ocupa todo el ancho');
  } else {
    assert.equal(posicion, 'lateral', 'Usa "abajo" o "lateral"');
    assert.ok(caja.x <= 2 && caja.width < vp.width / 2, `El menú no es lateral: ${JSON.stringify(caja)}`);
  }
});

Then('las opciones del menú miden al menos {int} px de alto', async function (min) {
  const cajas = await this.page.locator('.nav-item').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(cajas.length > 0);
  assert.ok(cajas.every((h) => h >= min), `Alturas: ${cajas}`);
});

Then('todos los campos del formulario abierto tienen etiqueta', async function () {
  const sinEtiqueta = await this.page.locator('.nad-modal, .grp-modal, .ent-modal, .modal').last()
    .locator('input:not([type=hidden]), select, textarea')
    .evaluateAll((els) => els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).map((e) => e.outerHTML.slice(0, 60)));
  assert.deepEqual(sinEtiqueta, []);
});

Then('todos los campos de registro de la pantalla tienen etiqueta', async function () {
  const sinEtiqueta = await this.vista.locator('form input:not([type=hidden]), form select, form textarea')
    .evaluateAll((els) => els.filter((e) => !(e.labels && e.labels.length) && !e.getAttribute('aria-label')).map((e) => e.outerHTML.slice(0, 60)));
  assert.deepEqual(sinEtiqueta, []);
});

Then('la aplicación declara una vista adaptable a móviles', async function () {
  const meta = await this.page.locator('meta[name=viewport]').getAttribute('content');
  assert.match(meta, /width=device-width/);
});

// ---- PWA ----
Then('el manifiesto de la aplicación es válido', async function () {
  const res = await this.page.request.get('/manifest.webmanifest');
  assert.ok(res.ok());
  const m = await res.json();
  assert.ok(m.name, 'sin nombre');
  assert.ok(m.start_url, 'sin start_url');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.length > 0, 'sin iconos');
  this.manifiesto = m;
});

Then('todos los iconos del manifiesto se pueden descargar', async function () {
  for (const ic of this.manifiesto.icons) assert.ok((await this.page.request.get('/' + ic.src)).ok(), `Falta ${ic.src}`);
});

Then('el service worker está activo', async function () {
  const activo = await this.page.evaluate(async () => !!(await navigator.serviceWorker.ready).active);
  assert.equal(activo, true);
});

When('recargo la aplicación', async function () {
  await this.page.reload();
  await this.page.locator('.role-box strong').waitFor({ timeout: this.timeout });
});

When('me quedo sin conexión', async function () {
  await this.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // El worker toma el control de la página en su primera carga tras activarse
  await this.page.reload();
  await this.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await this.contexto.setOffline(true);
});

Then('la aplicación sigue disponible con sus datos', async function () {
  await this.page.reload();
  await this.page.locator('.role-box strong').waitFor({ timeout: this.timeout });
  await this.irA('nadadores');
  await this.verVisible(this.vista.locator('tr.nad-row'));
});

Then('los datos de ejemplo del club están cargados', async function () {
  await this.verVisible(this.vista.locator('tr.nad-row'));
});

// ---- Idioma ----
When('cambio el idioma a {string}', async function (idioma) {
  await this.page.locator('.lang-select').first().selectOption({ label: idioma });
});

Then('el menú muestra {string} para el módulo {string}', async function (texto, m) {
  await this.eventually(async () => assert.match(await this.page.locator(`.nav-item[data-route="${ruta(m)}"]`).innerText(), new RegExp(texto, 'i')));
});

Then('el idioma del documento es {string}', async function (cod) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.lang), cod));
});
