import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const nadador = (mundo, nombre) => mundo.vista.locator('.asi-sw').filter({ hasText: todasLasPalabras(nombre) }).first();

When('selecciono la sesión {string} para pasar lista', async function (titulo) {
  const sel = this.vista.locator('select').first();
  const valor = await sel.locator('option', { hasText: regexTexto(titulo) }).first().getAttribute('value');
  await sel.selectOption(valor);
});

When('marco como {word} a {string}', async function (estado, nombre) {
  const veces = { presente: 1, ausente: 2, justificado: 3 }[estado];
  assert.ok(veces, 'Estado no válido: usa presente, ausente o justificado');
  for (let i = 0; i < veces; i++) await nadador(this, nombre).click();
});

When('marco a todos los nadadores como presentes', async function () {
  await this.vista.getByRole('button', { name: 'Marcar todos presentes' }).click();
});

When('consulto el historial de asistencia', async function () {
  await this.vista.getByRole('button', { name: 'Historial' }).click();
});

When('filtro el historial por el grupo {string}', async function (g) {
  await this.vista.locator('select').first().selectOption({ label: g });
});

When('despliego el detalle de asistencia de {string}', async function (nombre) {
  await this.vista.locator('tbody tr').filter({ hasText: todasLasPalabras(nombre) }).first().click();
});

Then('{string} figura como {string} en la lista', async function (nombre, estado) {
  await this.eventually(async () => assert.match(await nadador(this, nombre).innerText(), regexTexto(estado)));
});

Then('el recuento de asistencia muestra {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.asi-sum .badge', { hasText: texto }));
});

Then('la lista incluye a {int} nadadores', async function (n) {
  await this.eventually(async () => assert.equal(await this.vista.locator('.asi-sw').count(), n));
});

Then('el historial muestra el porcentaje de asistencia de {string}', async function (nombre) {
  const fila = this.vista.locator('tbody tr').filter({ hasText: todasLasPalabras(nombre) }).first();
  await this.verVisible(fila.locator('.asi-pct'), `Sin porcentaje para ${nombre}`);
});

Then('el historial muestra {int} nadadores', async function (n) {
  await this.eventually(async () => assert.equal(await this.vista.locator('tbody tr').count(), n));
});

Then('el detalle indica {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.asi-det').getByText(texto));
});
