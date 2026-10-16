// Pasos reutilizables por todas las áreas.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ruta, regexTexto, todasLasPalabras } from '../support/world.js';

// ---- Acceso: sesión de Google, club y primer arranque (adaptador de pruebas, sin Google real) ----
Given('un club con datos de demostración', async function () {
  await this.entrarConClub({ demo: true });
});

// Misma cosa, dicho desde la perspectiva de Drive (la sesión de Google es simulada).
Given('un club de demostración con la sesión de Google iniciada', async function () {
  await this.entrarConClub({ demo: true });
});

Given('un club vacío con la sesión de Google iniciada', async function () {
  await this.entrarConClub({ demo: false });
});

Given('que la aplicación está recién abierta sin sesión', async function () {
  await this.abrirApp({ sesion: false });
});

Given('que la aplicación está abierta sin Client ID de Google', async function () {
  await this.abrirApp({ sinClientId: true });
});

Given('que la aplicación está abierta y Google rechaza el inicio de sesión con {string}', async function (codigo) {
  await this.abrirApp({ sesion: false, errorLogin: codigo });
});

Then('veo el botón {string}', async function (nombre) {
  await this.verVisible(this.page.getByRole('button', { name: nombre }), `No se ve el botón "${nombre}"`);
});

Then('no veo el botón {string}', async function (nombre) {
  assert.equal(await this.page.getByRole('button', { name: nombre }).count(), 0, `Se ve el botón "${nombre}"`);
});

Then('no veo ningún texto sobre el modo local', async function () {
  const txt = (await this.page.locator('body').innerText()).toLowerCase();
  assert.ok(!txt.includes('modo local') && !txt.includes('probar en modo'), 'Aparece texto sobre el modo local');
});

Then('el menú de la aplicación no se muestra', async function () {
  assert.equal(await this.page.locator('nav.sidebar').count(), 0);
});

Then('mi sesión es la de {string}', async function (email) {
  await this.eventually(async () => assert.equal((await this.page.locator('#user-box strong').innerText()).trim(), email));
});

// ---- Navegación ----
Given('que estoy en el módulo {string}', async function (m) { await this.irA(ruta(m)); });
When('abro el módulo {string}', async function (m) { await this.irA(ruta(m)); });

When('pulso {string} en el menú', async function (m) {
  await this.pulsarEnMenu(ruta(m));
});

When('intento abrir directamente el módulo {string}', async function (m) {
  await this.page.evaluate((r) => { location.hash = '#/' + r; }, ruta(m));
  await this.page.waitForTimeout(300);
});

Then('estoy en el módulo {string}', async function (m) {
  await this.esperarRutaActiva(ruta(m));
});

Then('la pantalla {string} se muestra completa y sin errores', async function (m) {
  await this.esperarRutaActiva(ruta(m));
  await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
  await this.noVer(this.page.getByText('Error al mostrar la vista'));
  await this.noVer(this.page.getByText('Próximamente'));
  assert.ok((await this.vista.innerText()).trim().length > 0, 'La pantalla está vacía');
});

Then('el menú {word} el módulo {string}', async function (accion, m) {
  const item = this.page.locator(`.nav-item[data-route="${ruta(m)}"]`);
  if (accion === 'muestra') await item.first().waitFor({ state: 'attached', timeout: this.timeout });
  else { assert.equal(accion, 'oculta', 'Usa "muestra" u "oculta"'); await this.eventually(async () => assert.equal(await item.count(), 0)); }
});

// ---- Acciones genéricas ----
When('pulso {string}', async function (texto) {
  const ambito = await this.ambito();
  const boton = ambito.getByRole('button', { name: texto }).or(ambito.getByRole('link', { name: texto })).first();
  await boton.click();
});

When('acepto la confirmación', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

When('relleno {string} con {string}', async function (campo, valor) {
  await this.rellenar(await this.ambito(), campo, valor);
});

When('elijo {string} en {string}', async function (valor, campo) {
  await this.rellenar(await this.ambito(), campo, valor);
});

// ---- Comprobaciones genéricas ----
Then('veo el texto {string}', async function (t) {
  await this.verVisible(this.page.locator('body').getByText(t), `No se ve el texto "${t}"`);
});

Then('no veo el texto {string}', async function (t) {
  await this.noVer(this.vista.getByText(t), `Se ve el texto "${t}"`);
});

Then('veo el encabezado {string}', async function (t) {
  await this.verVisible(this.page.getByRole('heading', { name: t }), `No se ve el encabezado "${t}"`);
});

Then('veo el aviso {string}', async function (t) {
  await this.verVisible(this.page.locator('#toasts .toast').filter({ hasText: t }), `No aparece el aviso "${t}"`);
});

Then('veo los encabezados:', async function (tabla) {
  for (const [t] of tabla.raw()) await this.verVisible(this.page.getByRole('heading', { name: t }), `Falta el encabezado "${t}"`);
});

Then('veo en pantalla a alguien llamado {string}', async function (nombre) {
  await this.verVisible(this.vista.locator('tr, li, .card, button').filter({ hasText: todasLasPalabras(nombre) }));
});

Then('la fila que contiene {string} muestra {string}', async function (clave, texto) {
  const fila = this.vista.locator('tr').filter({ hasText: regexTexto(clave) });
  await this.eventually(async () => assert.match(await fila.first().innerText(), regexTexto(texto)));
});

Then('no existe el selector para cambiar de rol', async function () {
  assert.equal(await this.page.locator('#role-select').count(), 0);
});
