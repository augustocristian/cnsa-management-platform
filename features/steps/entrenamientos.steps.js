import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const sesion = (mundo, titulo) => mundo.vista.locator('.ent-sess').filter({ hasText: regexTexto(titulo) });

async function guardarSesion(mundo) {
  await mundo.page.locator('.ent-modal').getByRole('button', { name: 'Guardar' }).click();
  await mundo.verVisible(mundo.page.locator('#toasts .toast', { hasText: 'Sesión guardada' }));
}

When('creo la sesión de entrenamiento con los datos:', async function (tabla) {
  await this.vista.getByRole('button', { name: 'Nueva sesión' }).click();
  const m = this.page.locator('.ent-modal');
  await m.waitFor({ timeout: this.timeout });
  await this.rellenarTabla(m, tabla);
  await guardarSesion(this);
});

When('edito la sesión {string} con los datos:', async function (titulo, tabla) {
  await sesion(this, titulo).first().getByRole('button', { name: 'Editar' }).click();
  await this.rellenarTabla(this.page.locator('.ent-modal'), tabla);
  await guardarSesion(this);
});

When('duplico la sesión {string}', async function (titulo) {
  await sesion(this, titulo).first().getByRole('button', { name: 'Duplicar' }).click();
  await guardarSesion(this);
});

When('marco la sesión {string} como realizada', async function (titulo) {
  await sesion(this, titulo).first().getByRole('button', { name: 'Marcar realizado' }).click();
});

When('elimino la sesión {string} y lo confirmo', async function (titulo) {
  await sesion(this, titulo).first().getByRole('button', { name: 'Eliminar' }).click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

When('paso a la semana anterior', async function () {
  await this.vista.locator('.ent-nav button', { hasText: '‹' }).click();
});
When('paso a la semana siguiente', async function () {
  await this.vista.locator('.ent-nav button', { hasText: '›' }).click();
});
When('vuelvo a la semana actual', async function () {
  await this.vista.locator('.ent-nav button', { hasText: 'Hoy' }).click();
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

Given('que he creado la sesión {string} para el grupo {string}', async function (titulo, grupo) {
  await this.irA('entrenamientos');
  await this.vista.getByRole('button', { name: 'Nueva sesión' }).click();
  const m = this.page.locator('.ent-modal');
  await m.waitFor({ timeout: this.timeout });
  await this.rellenar(m, 'Título', titulo);
  await this.rellenar(m, 'Grupo', grupo);
  await guardarSesion(this);
  await this.verVisible(sesion(this, titulo));
});
