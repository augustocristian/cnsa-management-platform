import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

// ---- Comunicaciones ----
const aviso = (mundo, titulo) => mundo.vista.locator('.cm-item').filter({ has: mundo.page.locator('h4', { hasText: regexTexto(titulo) }) });

When('publico un aviso con los datos:', async function (tabla) {
  const form = this.vista.locator('form.cm-form');
  await this.rellenarTabla(form, tabla);
  await form.getByRole('button', { name: 'Publicar aviso' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Aviso publicado' }));
});

When('filtro los avisos por {string}', async function (opcion) {
  await this.vista.locator('.cm-bar select').selectOption({ label: opcion });
});

When('elimino el aviso {string} y lo confirmo', async function (titulo) {
  await aviso(this, titulo).first().getByRole('button', { name: 'Eliminar' }).click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

Then('veo el aviso publicado {string}', async function (titulo) {
  await this.verVisible(aviso(this, titulo), `No se ve el aviso ${titulo}`);
});

Then('no veo el aviso publicado {string}', async function (titulo) {
  await this.eventually(async () => assert.equal(await aviso(this, titulo).count(), 0));
});

Then('el aviso {string} va dirigido a {string}', async function (titulo, destino) {
  await this.verVisible(aviso(this, titulo).first().locator('.badge', { hasText: new RegExp(`^${destino}$`) }));
});

Then('no puedo publicar avisos', async function () {
  await this.verVisible(this.vista.getByText('Avisos').first());
  assert.equal(await this.vista.locator('form.cm-form').count(), 0);
});

When('pulso la campana de avisos', async function () {
  await this.page.getByRole('button', { name: /^Avisos/ }).click();
});

// ---- Mi espacio ----
When('elijo previsualizar el espacio de {string}', async function (nombre) {
  const sel = this.vista.locator('.mie-pick select');
  await sel.selectOption({ label: nombre });
});

Then('mi espacio muestra las secciones:', async function (tabla) {
  for (const [s] of tabla.raw()) await this.verVisible(this.vista.locator('h3', { hasText: s }), `Falta "${s}"`);
});

Then('en mi espacio veo el aviso {string}', async function (titulo) {
  await this.verVisible(this.vista.locator('.mie-card strong', { hasText: regexTexto(titulo) }));
});

Then('en mi espacio no veo el aviso {string}', async function (titulo) {
  await this.page.waitForTimeout(200);
  assert.equal(await this.vista.locator('.mie-card strong', { hasText: regexTexto(titulo) }).count(), 0);
});

// ---- Club: identidad ----
const identidad = (m) => m.vista.locator('.clb-card').filter({ hasText: 'Identidad del club' });
const usuarios = (m) => m.vista.locator('.clb-card').filter({ hasText: 'Usuarios y roles' });

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

// ---- Club: usuarios ----
When('añado el usuario con:', async function (tabla) {
  const card = usuarios(this);
  for (const [campo, valor] of tabla.raw()) {
    const c = card.getByLabel(campo).first();
    const tag = await c.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') await c.selectOption({ label: valor }); else await c.fill(valor);
  }
  await card.getByRole('button', { name: 'Añadir usuario' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Usuario guardado' }));
});

Then('la lista de usuarios incluye a {string} con rol {string}', async function (email, rol) {
  const fila = usuarios(this).locator('tr').filter({ hasText: email });
  await this.verVisible(fila.locator('.badge', { hasText: new RegExp(`^${rol}$`) }));
});

Then('la configuración advierte que en modo local no hay hoja de Google que compartir', async function () {
  await this.verVisible(this.vista.getByText('En modo local no hay hoja de Google que compartir'));
});

import { Given } from '@cucumber/cucumber';

Given('que he publicado el aviso {string} para {string}', async function (titulo, destino) {
  await this.irA('comunicaciones');
  const form = this.vista.locator('form.cm-form');
  await this.rellenar(form, 'Título', titulo);
  await this.rellenar(form, 'Destinatarios', destino);
  await this.rellenar(form, 'Mensaje', `Texto de ${titulo}`);
  await form.getByRole('button', { name: 'Publicar aviso' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Aviso publicado' }));
});
