import { Before, Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto } from '../support/world.js';

// Desktop browsers download the PDF; touch devices may open the share sheet. The e2e scenarios of this area that capture the
// download switch Web Share off so the same steps work in both profiles (a dedicated scenario enables a fake share sheet).
Before({ tags: '@entreno or @entrenamientos or @entreno-pdf or @entreno-contenidos or @entreno-demo' }, async function () {
  await this.contexto.addInitScript(() => {
    try { Object.defineProperty(Navigator.prototype, 'canShare', { value: undefined, configurable: true }); } catch (e) { /* ignore */ }
  });
});

export const sesion = (mundo, titulo) => mundo.vista.locator('.ent-sess').filter({ hasText: regexTexto(titulo) });
// The form of a session is a sheet (bottom sheet on mobile)
export const formulario = (mundo) => mundo.page.locator('.sheet');

// Opens the "more actions" menu of a session card and clicks an item by its id (estado, editar, duplicar, pdf, eliminar)
export async function elegirEnMenu(mundo, fila, id) {
  await fila.first().locator('button[aria-haspopup="menu"]').click();
  await mundo.page.locator(`.enp-mn [data-accion="${id}"]`).click();
}

async function guardarSesion(mundo) {
  await formulario(mundo).getByRole('button', { name: 'Guardar' }).click();
  await mundo.verVisible(mundo.page.locator('#toasts .toast', { hasText: 'Sesión guardada' }));
}

When('creo la sesión de entrenamiento con los datos:', async function (tabla) {
  await this.vista.getByRole('button', { name: 'Nueva sesión' }).first().click();
  await formulario(this).waitFor({ timeout: this.timeout });
  await this.rellenarTabla(formulario(this), tabla);
  await guardarSesion(this);
});

When('edito la sesión {string} con los datos:', async function (titulo, tabla) {
  await elegirEnMenu(this, sesion(this, titulo), 'editar');
  await this.rellenarTabla(formulario(this), tabla);
  await guardarSesion(this);
});

When('duplico la sesión {string}', async function (titulo) {
  await elegirEnMenu(this, sesion(this, titulo), 'duplicar');
  await guardarSesion(this);
});

When('marco la sesión {string} como realizada', async function (titulo) {
  await elegirEnMenu(this, sesion(this, titulo), 'estado');
});

When('elimino la sesión {string}', async function (titulo) {
  await elegirEnMenu(this, sesion(this, titulo), 'eliminar');
});

When('deshago la eliminación', async function () {
  await this.page.locator('#toasts .toast').getByRole('button', { name: 'Deshacer' }).click();
});

When('paso a la semana anterior', async function () {
  await this.vista.locator('[data-accion="semana-anterior"]').click();
});
When('paso a la semana siguiente', async function () {
  await this.vista.locator('[data-accion="semana-siguiente"]').click();
});
When('vuelvo a la semana actual', async function () {
  await this.vista.locator('[data-accion="hoy"]').click();
});

When('filtro las sesiones por el grupo {string}', async function (g) {
  await this.vista.locator('.ent-bar select').selectOption({ label: g });
});

Then('la sesión {string} aparece en el calendario semanal', async function (titulo) {
  await this.verVisible(sesion(this, titulo), `No aparece la sesión ${titulo}`);
});

Then('la sesión {string} no aparece en el calendario semanal', async function (titulo) {
  await this.eventually(async () => assert.equal(await sesion(this, titulo).count(), 0));
});

Then('hay {int} sesiones llamadas {string}', async function (n, titulo) {
  await this.eventually(async () => assert.equal(await sesion(this, titulo).count(), n));
});

Then('la sesión {string} figura como {string}', async function (titulo, estado) {
  await this.verVisible(sesion(this, titulo).first().locator('.badge', { hasText: new RegExp(`^${estado}$`) }));
});

Then('la sesión {string} muestra {string}', async function (titulo, texto) {
  await this.verVisible(sesion(this, titulo).first().getByText(texto));
});

Then('la sesión {string} tiene una sola acción principal {string}', async function (titulo, accion) {
  const fila = sesion(this, titulo).first();
  await this.verVisible(fila.getByRole('button', { name: new RegExp(`^${accion}`) }));
  assert.equal(await fila.locator('.btn--primary').count(), 1);
  assert.equal(await fila.getByRole('button').count(), 2, 'Debe haber solo la acción principal y el menú de más acciones');
});

Then('la semana muestra sesiones {string}', async function (estado) {
  await this.verVisible(this.vista.locator('.ent-sess .badge', { hasText: new RegExp(`^${estado}$`) }), `Sin sesiones ${estado}`);
});

Then('las sesiones previstas indican su volumen objetivo', async function () {
  await this.verVisible(this.vista.locator('.ent-sess .ent-meta span', { hasText: 'Vol.' }));
});

Then('todas las sesiones mostradas son del grupo {string}', async function (g) {
  await this.eventually(async () => {
    const grupos = await this.vista.locator('.ent-sess .ent-meta .badge:first-child').allInnerTexts();
    assert.ok(grupos.length > 0, 'No hay sesiones');
    assert.ok(grupos.every((x) => x.trim() === g), `Grupos: ${[...new Set(grupos)]}`);
  });
});

Then('el título de la semana muestra un intervalo de fechas', async function () {
  await this.verVisible(this.vista.locator('.ent-week', { hasText: /\d.*–.*\d{4}/ }));
});

Then('veo {int} sesiones esta semana', async function (n) {
  await this.verVisible(this.vista.getByText(`${n} sesiones esta semana`));
});

Then('veo el error de campo {string}', async function (texto) {
  await this.verVisible(this.page.locator('.field-error', { hasText: texto }), `No hay error de campo «${texto}»`);
});

Given('que he creado la sesión {string} para el grupo {string}', async function (titulo, grupo) {
  await this.irA('entrenamientos');
  await this.vista.getByRole('button', { name: 'Nueva sesión' }).first().click();
  await formulario(this).waitFor({ timeout: this.timeout });
  await this.rellenar(formulario(this), 'Título', titulo);
  await this.rellenar(formulario(this), 'Grupo', grupo);
  await guardarSesion(this);
  await this.verVisible(sesion(this, titulo));
});
