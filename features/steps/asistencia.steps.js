import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const tarjeta = (mundo, nombre) => mundo.vista.locator('.asi-card').filter({ hasText: todasLasPalabras(nombre) }).first();
const ETIQUETA = { presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado' };

When('selecciono la sesión {string} para pasar lista', async function (titulo) {
  const sel = this.vista.locator('#asi-sesion');
  const valor = await sel.locator('option', { hasText: regexTexto(titulo) }).first().getAttribute('value');
  await sel.selectOption(valor);
});

// Present and absent are one tap; excused is chosen in the "more options" sheet.
When('marco como {word} a {string}', async function (estado, nombre) {
  assert.ok(ETIQUETA[estado], 'Estado no válido: usa presente, ausente o justificado');
  const t = tarjeta(this, nombre);
  if (estado === 'justificado') {
    await t.locator('.asi-more').click();
    const dialogo = this.page.locator('.sheet');
    await dialogo.getByRole('button', { name: ETIQUETA[estado], exact: true }).click();
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    return;
  }
  await t.locator(`.asi-btn[data-estado="${estado}"]`).click();
});

When('toco de nuevo {string} en {string}', async function (estado, nombre) {
  await tarjeta(this, nombre).locator(`.asi-btn[data-estado="${estado}"]`).click();
});

When('marco a todos los nadadores como presentes', async function () {
  await this.vista.getByRole('button', { name: 'Marcar todos presentes' }).click();
});

When('deshago la última acción de asistencia', async function () {
  await this.page.locator('#toasts .toast-action', { hasText: 'Deshacer' }).click();
});

When('consulto el historial de asistencia', async function () {
  await this.vista.getByRole('tab', { name: 'Historial' }).click();
});

When('filtro el historial por el grupo {string}', async function (g) {
  await this.vista.locator('#asi-grupo').selectOption({ label: g });
});

When('despliego el detalle de asistencia de {string}', async function (nombre) {
  await this.vista.locator('tbody tr.asi-fila').filter({ hasText: todasLasPalabras(nombre) }).first().locator('.asi-name-btn').click();
});

Then('{string} figura como {string} en la lista', async function (nombre, estado) {
  await this.eventually(async () => assert.equal((await tarjeta(this, nombre).locator('.asi-state').innerText()).trim(), estado));
});

// Counts live in the sticky summary chips (label and number may be in either order and separator).
Then('el recuento de asistencia muestra {string}', async function (texto) {
  const numero = (texto.match(/\d+/) || [''])[0];
  const etiqueta = texto.replace(/[\d:]/g, '').trim();
  const re = new RegExp(String.raw`${etiqueta}\D{0,6}${numero}\b|\b${numero}\D{0,6}${etiqueta}`, 'i');
  await this.eventually(async () => assert.match((await this.vista.locator('.asi-sticky').innerText()).replace(/\s+/g, ' '), re, `Counter ${texto} not found`));
});

Then('el resumen de asistencia indica {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.asi-sticky', { hasText: texto }));
});

Then('la lista incluye a {int} nadadores', async function (n) {
  await this.eventually(async () => assert.equal(await this.vista.locator('.asi-card').count(), n));
});

Then('cada nadador de la lista tiene botones de Presente y Ausente de al menos 44 píxeles', async function () {
  const alturas = await this.vista.locator('.asi-card .asi-btn, .asi-card .asi-more').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(alturas.length > 0, 'No hay botones');
  assert.ok(alturas.every((a) => a >= 44), `Botones demasiado bajos: ${alturas}`);
});

Then('el historial muestra el porcentaje de asistencia de {string}', async function (nombre) {
  const fila = this.vista.locator('tbody tr.asi-fila').filter({ hasText: todasLasPalabras(nombre) }).first();
  await this.verVisible(fila.locator('.asi-pct'), `Sin porcentaje para ${nombre}`);
});

Then('el historial muestra {int} nadadores', async function (n) {
  await this.eventually(async () => assert.equal(await this.vista.locator('tbody tr.asi-fila').count(), n));
});

Then('el detalle indica {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.asi-det').getByText(texto));
});
