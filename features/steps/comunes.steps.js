// Pasos reutilizables por todas las áreas.
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ROLES, ruta, regexTexto, todasLasPalabras } from '../support/world.js';

// ---- Acceso y roles ----
Given('un club en modo local con datos de demostración', async function () {
  await this.entrarLocal();
});

Given('que la aplicación está recién abierta sin sesión', async function () {
  await this.page.goto('/');
});

Given('que entro como {string}', async function (rol) { await cambiarRol(this, rol); });
When('cambio al rol {string}', async function (rol) { await cambiarRol(this, rol); });

async function cambiarRol(mundo, rol) {
  const valor = ROLES[rol];
  assert.ok(valor, `Rol desconocido: ${rol}`);
  await mundo.page.locator('#role-select').selectOption(valor);
  await mundo.page.locator('.role-box strong').filter({ hasText: rol }).waitFor({ timeout: mundo.timeout });
}

Then('mi rol actual es {string}', async function (rol) {
  await this.eventually(async () => assert.equal((await this.page.locator('.role-box strong').innerText()).trim(), rol));
});

// ---- Navegación ----
Given('que estoy en el módulo {string}', async function (m) { await this.irA(ruta(m)); });
When('abro el módulo {string}', async function (m) { await this.irA(ruta(m)); });

When('pulso {string} en el menú', async function (m) {
  await this.page.locator(`.nav-item[data-route="${ruta(m)}"]`).click();
});

When('intento abrir directamente el módulo {string}', async function (m) {
  await this.page.evaluate((r) => { location.hash = '#/' + r; }, ruta(m));
  await this.page.waitForTimeout(300);
});

Then('estoy en el módulo {string}', async function (m) {
  await this.page.locator(`.nav-item[data-route="${ruta(m)}"].active`).waitFor({ timeout: this.timeout });
});

Then('la pantalla {string} se muestra completa y sin errores', async function (m) {
  await this.page.locator(`.nav-item[data-route="${ruta(m)}"].active`).waitFor({ timeout: this.timeout });
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
