// Pasos del gestor de "Contenidos de entrenamiento" (catálogo de cargas) y de su uso al registrar cargas.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const exacto = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const sinSeparadores = (t) => t.replace(/[.\s  ,]/g, '');
const gestor = (m) => m.vista.locator('#cg-gestor');
const fila = (m, nombre) => gestor(m).locator('.tc-item').filter({ has: m.page.locator('.tc-nombre', { hasText: exacto(nombre) }) });

When('abro el gestor de contenidos de entrenamiento', async function () {
  const boton = this.vista.locator('.page-head').getByRole('button', { name: /Contenidos de entrenamiento|Ocultar contenidos/ });
  if ((await boton.getAttribute('aria-expanded')) !== 'true') await boton.click();
  await this.verVisible(gestor(this), 'No se abre el gestor de contenidos');
});

// Rellena el formulario de contenido (alta) y pulsa Guardar; el resultado se comprueba en el paso siguiente.
When('guardo un contenido de entrenamiento con los datos:', async function (tabla) {
  await gestor(this).getByRole('button', { name: 'Nuevo contenido' }).click();
  const dialogo = this.page.locator('.modal');
  await this.verVisible(dialogo, 'No se abre el formulario de contenido');
  await this.rellenarTabla(dialogo, tabla);
  await dialogo.getByRole('button', { name: 'Guardar' }).click();
});

When('desactivo el contenido {string}', async function (nombre) {
  await fila(this, nombre).getByRole('button', { name: 'Desactivar' }).click();
  await this.verVisible(fila(this, nombre).locator('.tc-off'));
});

When('activo el contenido {string}', async function (nombre) {
  await fila(this, nombre).getByRole('button', { name: 'Activar' }).click();
  await this.noVer(fila(this, nombre).locator('.tc-off'));
});

When('intento eliminar el contenido {string}', async function (nombre) {
  await fila(this, nombre).getByRole('button', { name: 'Eliminar' }).click();
});

Then('veo los contenidos predefinidos:', async function (tabla) {
  for (const [nombre] of tabla.raw()) {
    const f = fila(this, nombre);
    await this.verVisible(f, `Falta el contenido "${nombre}"`);
    assert.match(await f.first().innerText(), /Predefinido/, `"${nombre}" no figura como predefinido`);
  }
});

Then('el contenido {string} muestra la descripción {string}', async function (nombre, texto) {
  await this.eventually(async () => assert.match(await fila(this, nombre).first().innerText(), regexTexto(texto)));
});

Then('el contenido {string} no se puede eliminar', async function (nombre) {
  await this.verVisible(fila(this, nombre));
  assert.equal(await fila(this, nombre).getByRole('button', { name: 'Eliminar' }).count(), 0);
});

Then('el contenido {string} aparece como personalizado', async function (nombre) {
  await this.eventually(async () => assert.match(await fila(this, nombre).first().innerText(), /Personalizado/));
});

Then('veo el error {string}', async function (texto) {
  await this.verVisible(this.page.locator('.field-error, .tc-error', { hasText: texto }), `No aparece el error "${texto}"`);
});

// The content selector lives in the "Log load" sheet: open it, read the options and close it again.
async function opcionesDeContenido(mundo) {
  await mundo.vista.getByRole('button', { name: 'Registrar carga', exact: true }).click();
  const hoja = mundo.page.locator('.sheet');
  await mundo.verVisible(hoja);
  const opciones = (await hoja.locator('select[name="tipoId"] option').allInnerTexts()).map((o) => o.trim());
  await mundo.page.keyboard.press('Escape');
  await mundo.noVer(hoja);
  return opciones;
}

Then('el selector de contenido ofrece {string}', async function (nombre) {
  assert.ok((await opcionesDeContenido(this)).includes(nombre), `El selector no ofrece "${nombre}"`);
});

Then('el selector de contenido no ofrece {string}', async function (nombre) {
  assert.ok(!(await opcionesDeContenido(this)).includes(nombre), `El selector aún ofrece "${nombre}"`);
});

Then('la carga de {int} metros de {string} aparece vinculada a la sesión {string}', async function (metros, nombre, sesion) {
  const filas = this.vista.locator('section.card').filter({ has: this.page.getByRole('heading', { name: 'Cargas de la semana', exact: true }) }).locator('tbody tr').filter({ hasText: todasLasPalabras(nombre) });
  await this.eventually(async () => {
    const celdas = await filas.evaluateAll((trs) => trs.map((tr) => [...tr.children].map((td) => td.textContent.trim())));
    assert.ok(celdas.some((c) => sinSeparadores(c[4] || '') === String(metros) && (c[3] || '').includes(sesion)), `Filas de ${nombre}: ${JSON.stringify(celdas)}`);
  });
});
