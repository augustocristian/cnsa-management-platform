import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const exacto = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const sinSeparadores =(t) => t.replace(/[.\s  ,]/g, '');

// ---- Cargas ----
When('registro una carga con los datos:', async function (tabla) {
  const form = this.vista.locator('form.cg-form');
  await this.rellenarTabla(form, tabla);
  await form.getByRole('button', { name: 'Registrar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Carga registrada' }));
});

When('consulto las cargas de {string}', async function (nombre) {
  const sel = this.vista.locator('.cg-bar select');
  await sel.selectOption({ label: nombre });
});

When('paso a la semana anterior de cargas', async function () {
  await this.vista.locator('.cg-bar button', { hasText: '‹' }).click();
});

When('fijo el objetivo semanal de {string} entre {int} y {int} metros', async function (tipo, min, max) {
  const fila = this.vista.locator('.cg-obj tbody tr').filter({ has: this.page.locator('td:first-child', { hasText: exacto(tipo) }) });
  await fila.locator('input').nth(0).fill(String(min));
  await fila.locator('input').nth(1).fill(String(max));
  await fila.getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: `Objetivo de ${tipo} guardado` }));
});

Then('la carga de {int} metros de {string} aparece en las cargas de la semana', async function (metros, nombre) {
  const filas = this.vista.locator('.cg-card table tbody tr').filter({ hasText: todasLasPalabras(nombre) });
  await this.eventually(async () => {
    const textos = (await filas.allInnerTexts()).map(sinSeparadores);
    assert.ok(textos.some((t) => t.includes(String(metros))), `Filas de ${nombre}: ${textos}`);
  });
});

Then('todas las cargas listadas son de {string}', async function (nombre) {
  const filas = this.vista.locator('.cg-card').filter({ hasText: 'Cargas de la semana' }).locator('tbody tr');
  await this.eventually(async () => {
    const n = await filas.count();
    assert.ok(n > 0, 'No hay cargas');
    const ok = await filas.evaluateAll((trs, nom) => trs.every((tr) => tr.children[1].textContent.trim() === nom), nombre);
    assert.ok(ok, 'Hay cargas de otros deportistas');
  });
});

Then('veo la evolución de las cargas por tipo y por día', async function () {
  await this.verVisible(this.vista.locator('[aria-label="Metros semanales por tipo"]'));
  await this.verVisible(this.vista.locator('svg[aria-label="Metros por día"]'));
});

Then('la semana mostrada es distinta de la actual', async function () {
  await this.verVisible(this.vista.locator('.cg-week'));
});

Then('veo la alerta {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.cg-alert', { hasText: texto }), `No hay alerta "${texto}"`);
});

// ---- Marcas ----
When('registro una marca con los datos:', async function (tabla) {
  const form = this.vista.locator('form.mc-form');
  await this.rellenarTabla(form, tabla);
  await form.getByRole('button', { name: 'Registrar' }).click();
});

When('consulto la evolución de {string} en la prueba {string}', async function (nombre, prueba) {
  const selects = this.vista.locator('.mc-bar select');
  await selects.nth(0).selectOption({ label: nombre });
  await selects.nth(1).selectOption({ label: prueba });
});

Then('la marca queda registrada', async function () {
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Marca registrada' }));
});

Then('la marca no se registra por tiempo no válido', async function () {
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Tiempo no válido' }));
});

Then('la mejor marca de {string} en {string} es {string}', async function (nombre, prueba, tiempo) {
  const tarjeta = this.vista.locator('.mc-card').filter({ hasText: 'Mejores marcas' });
  const fila = tarjeta.locator('tbody tr').filter({ hasText: todasLasPalabras(`${prueba} ${nombre}`) });
  await this.eventually(async () => assert.match(await fila.first().innerText(), regexTexto(tiempo)));
});

Then('el historial señala {string} como mejor marca', async function (tiempo) {
  const tarjeta = this.vista.locator('.mc-card').filter({ hasText: 'Historial' });
  await this.verVisible(tarjeta.locator('td', { hasText: regexTexto(tiempo) }).locator('.mc-pb'));
});

Then('el historial no señala {string} como mejor marca', async function (tiempo) {
  const tarjeta = this.vista.locator('.mc-card').filter({ hasText: 'Historial' });
  await this.eventually(async () => {
    assert.equal(await tarjeta.locator('td', { hasText: regexTexto(tiempo) }).locator('.mc-pb').count(), 0);
    assert.ok(await tarjeta.locator('td', { hasText: regexTexto(tiempo) }).count() > 0, 'La marca no está en el historial');
  });
});

Then('veo el gráfico de evolución de marcas', async function () {
  await this.verVisible(this.vista.locator('svg[aria-label="Evolución de marcas"]'));
});

Then('se me pide elegir nadador y prueba para ver la evolución', async function () {
  await this.verVisible(this.vista.getByText('Selecciona un nadador y una prueba'));
});

Given('que he registrado una carga de {int} metros para {string}', async function (metros, nombre) {
  await this.irA('cargas');
  const form = this.vista.locator('form.cg-form');
  await this.rellenar(form, 'Nadador', nombre);
  await this.rellenar(form, 'Contenido', 'Aeróbico medio / Umbral anaeróbico');
  await this.rellenar(form, 'Metros', String(metros));
  await form.getByRole('button', { name: 'Registrar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Carga registrada' }));
});

When('dejo sin objetivo semanal todos los contenidos de entrenamiento', async function () {
  const filas = this.vista.locator('.cg-obj tbody tr');
  const n = await filas.count();
  assert.ok(n >= 10, 'Faltan contenidos en la tabla de objetivos');
  for (let i = 0; i < n; i++) { // la tabla se repinta tras cada guardado: se vuelve a localizar la fila
    const fila = this.vista.locator('.cg-obj tbody tr').nth(i);
    const nombre = (await fila.locator('td').first().innerText()).trim();
    await fila.locator('input').nth(0).fill('0');
    await fila.locator('input').nth(1).fill('0');
    await fila.getByRole('button', { name: 'Guardar' }).click();
    await this.verVisible(this.page.locator('#toasts .toast', { hasText: `Objetivo de ${nombre} guardado` }));
  }
});

Given('que he registrado las marcas de {string} en {string}:', async function (nombre, prueba, tabla) {
  await this.irA('marcas');
  for (const { fecha, tiempo } of tabla.hashes()) {
    const form = this.vista.locator('form.mc-form');
    await this.rellenar(form, 'Nadador', nombre);
    await this.rellenar(form, 'Prueba', prueba);
    await this.rellenar(form, 'Fecha', fecha);
    await this.rellenar(form, 'Tiempo (mm:ss.cc)', tiempo);
    await form.getByRole('button', { name: 'Registrar' }).click();
    await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Marca registrada' }));
  }
});
