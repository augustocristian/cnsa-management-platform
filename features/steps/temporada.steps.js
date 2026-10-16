// Pasos de la Planificación de temporada (apartado Temporada de Planificación).
// En escritorio el resumen es una tabla (tr[data-n]); en móvil, una lista de tarjetas (button.tp-wk[data-n]).
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const SEMANAS = 'table[data-tabla=semanas] tbody tr, button.tp-wk';
const botonSemana = (mundo, n) => mundo.page.locator(`table[data-tabla=semanas] tr[data-n="${n}"] .tp-sem-btn, button.tp-wk[data-n="${n}"]`).first();
const fechaLocal = (dias = 0) => {
  const d = new Date(); d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

When('abro el apartado {string}', async function (nombre) {
  await this.page.getByRole('tab', { name: nombre, exact: true }).click();
});

Then('estoy en el apartado {string}', async function (nombre) {
  await this.eventually(async () => assert.equal(await this.page.getByRole('tab', { name: nombre, exact: true }).getAttribute('aria-selected'), 'true'));
});

Then('el resumen semanal lista {int} semanas', async function (n) {
  await this.eventually(async () => assert.equal(await this.page.locator(SEMANAS).count(), n));
});

Then('veo {int} fases en la temporada', async function (n) {
  await this.eventually(async () => assert.equal(await this.page.locator('.tp-fases > li').count(), n));
});

When('abro la semana {int} de la temporada', async function (n) {
  await botonSemana(this, n).click();
  await this.eventually(async () => assert.match(await this.page.locator('#tp-h-det').innerText(), new RegExp(`Semana ${n} `)));
});

When('abro la semana anterior a la actual de la temporada', async function () {
  const actual = this.page.locator('table[data-tabla=semanas] tr.tp-act .tp-sem-btn, button.tp-wk.tp-act').first();
  await actual.waitFor({ timeout: this.timeout });
  const n = Number(await this.page.evaluate(() => (document.querySelector('table[data-tabla=semanas] tr.tp-act, button.tp-wk.tp-act') || {}).dataset.n));
  assert.ok(n > 1, 'la semana actual no es la primera');
  await botonSemana(this, n - 1).click();
});

When('relleno {string} con la fecha de dentro de {int} días', async function (campo, dias) {
  await this.rellenar(await this.ambito(), campo, fechaLocal(dias));
});

When('añado una competición {string} de prioridad {string} para hoy', async function (nombre, prioridad) {
  await this.vista.getByRole('button', { name: 'Añadir evento' }).first().click();
  const m = this.page.locator('.modal').last();
  await m.waitFor({ timeout: this.timeout });
  await this.rellenar(m, 'Nombre', nombre);
  await this.rellenar(m, 'Prioridad', `Prioridad ${prioridad}`);
  await this.rellenar(m, 'Fecha de inicio', fechaLocal(0));
  await m.getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Evento guardado' }));
});

Then('la semana actual marca la competición {string}', async function (nombre) {
  await this.verVisible(this.page.locator('tr.tp-act .tp-evchip, button.tp-wk.tp-act .tp-evchip').filter({ hasText: nombre }), `La semana actual no marca "${nombre}"`);
});

Then('la semana {int} muestra un volumen previsto de {string}', async function (n, texto) {
  const fila = this.page.locator(`table[data-tabla=semanas] tr[data-n="${n}"], button.tp-wk[data-n="${n}"]`).first();
  await this.eventually(async () => assert.match(await fila.innerText(), new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))));
});

Then('el detalle de la semana muestra {string}', async function (texto) {
  await this.verVisible(this.page.locator('#tp-detalle').getByText(texto), `El detalle de la semana no muestra "${texto}"`);
});

Then('el gráfico de la temporada es accesible', async function () {
  const m = await this.page.evaluate(() => ({
    svg: !!document.querySelector('svg.tp-svg[aria-label]'), cols: document.querySelectorAll('svg.tp-svg g.tp-col[aria-label]').length,
    movil: !!document.querySelector('ol.tp-lista'),
  }));
  if (m.movil) return; // en móvil se muestra la lista de semanas con mini-barras
  assert.ok(m.svg && m.cols > 10, 'El gráfico no tiene nombre accesible o columnas por semana');
});
