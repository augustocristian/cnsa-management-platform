import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

// ---- Comunicaciones ----
const aviso = (mundo, titulo) => mundo.vista.locator('.cm-item').filter({ has: mundo.page.locator('h4', { hasText: regexTexto(titulo) }) });

When('guardo un aviso con los datos:', async function (tabla) {
  const form = this.vista.locator('form.cm-form');
  await this.rellenarTabla(form, tabla);
  await form.getByRole('button', { name: 'Guardar aviso' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Aviso guardado' }));
});

When('filtro los avisos por {string}', async function (opcion) {
  await this.vista.locator('.cm-bar select').selectOption({ label: opcion });
});

When('elimino el aviso {string} y lo confirmo', async function (titulo) {
  await aviso(this, titulo).first().getByRole('button', { name: 'Eliminar' }).click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

Then('veo el aviso guardado {string}', async function (titulo) {
  await this.verVisible(aviso(this, titulo), `No se ve el aviso ${titulo}`);
});

Then('no veo el aviso guardado {string}', async function (titulo) {
  await this.eventually(async () => assert.equal(await aviso(this, titulo).count(), 0));
});

Then('el aviso {string} va dirigido a {string}', async function (titulo, destino) {
  await this.verVisible(aviso(this, titulo).first().locator('.badge', { hasText: new RegExp(`^${destino}$`) }));
});

When('pulso la campana de avisos', async function () {
  await this.page.getByRole('button', { name: /^Avisos/ }).click();
});

// ---- Club: identidad ----
const identidad = (m) => m.vista.locator('.clb-card').filter({ hasText: 'Identidad del club' });

// PNG de 1x1 píxel
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

When('personalizo la identidad del club con:', async function (tabla) {
  const card = identidad(this);
  for (const [campo, valor] of tabla.raw()) {
    const c = card.getByLabel(campo).first();
    await c.fill(valor);
  }
});

When('subo el logotipo del club', async function () {
  await identidad(this).locator('input[type=file]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG });
  await this.eventually(async () => assert.ok(await identidad(this).locator('img.clb-logo').getAttribute('src')));
});

When('quito el logotipo del club', async function () {
  await identidad(this).getByRole('button', { name: 'Quitar logo' }).click();
});

When('guardo la identidad del club', async function () {
  await identidad(this).getByRole('button', { name: 'Guardar identidad' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Identidad guardada' }));
});

Then('la cabecera muestra el nombre {string}', async function (n) {
  await this.eventually(async () => assert.equal((await this.page.locator('.brand-name').innerText()).trim(), n));
});

Then('la cabecera muestra el lema {string}', async function (n) {
  await this.eventually(async () => assert.equal((await this.page.locator('.brand-lema').innerText()).trim(), n));
});

Then('el pie de página menciona {string}', async function (n) {
  await this.verVisible(this.page.locator('footer.footer', { hasText: n }));
});

Then('el color principal de la aplicación es {string}', async function (c) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.style.getPropertyValue('--c-primary').trim()), c));
});

Then('el color secundario de la aplicación es {string}', async function (c) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(() => document.documentElement.style.getPropertyValue('--c-secondary').trim()), c));
});

Then('la cabecera muestra el logotipo subido', async function () {
  await this.eventually(async () => assert.match(await this.page.locator('.brand img.logo').getAttribute('src'), /^data:image\//));
});

Then('la cabecera muestra el logotipo por defecto', async function () {
  await this.eventually(async () => assert.match(await this.page.locator('.brand img.logo').getAttribute('src'), /icon\.svg$/));
});

// ---- Club: datos en Drive ----
Then('la configuración explica que los datos están en la carpeta cnl de Drive', async function () {
  await this.verVisible(this.vista.getByText('carpeta «cnl» de tu Google Drive'));
  await this.verVisible(this.vista.getByRole('link', { name: 'Abrir el fichero del club en Drive' }));
});

Then('la configuración no ofrece usuarios, roles ni compartir la hoja', async function () {
  const txt = await this.vista.innerText();
  assert.doesNotMatch(txt, /Usuarios y roles|Unirse con enlace|Compartir por email/);
});

// ---- Comunicaciones: preparación ----
Given('que he guardado el aviso {string} para {string}', async function (titulo, destino) {
  await this.irA('comunicaciones');
  const form = this.vista.locator('form.cm-form');
  await this.rellenar(form, 'Título', titulo);
  await this.rellenar(form, 'Grupo', destino);
  await this.rellenar(form, 'Texto', `Texto de ${titulo}`);
  await form.getByRole('button', { name: 'Guardar aviso' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Aviso guardado' }));
});
