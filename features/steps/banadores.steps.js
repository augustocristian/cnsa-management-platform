// Steps of the swimsuit catalogue (training suits and competition fast skins).
// The catalogue is a dialog opened from other views (Marks, Settings). Until those entry points are the subject of their own
// scenarios, the steps open it through the same exported function the views call: abrirCatalogoBanadores(ctx).
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const exacto = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const catalogo = (m) => m.page.locator('.modal.bn-catalogo');
const fila = (m, nombre) => catalogo(m).locator('.bn-item').filter({ has: m.page.locator('.bn-nombre', { hasText: exacto(nombre) }) });

When('abro el catálogo de bañadores', async function () {
  await this.page.evaluate(async () => {
    const [{ store }, ui, vista] = await Promise.all([
      import(new URL('./js/store.js', location.href).href),
      import(new URL('./js/ui.js', location.href).href),
      import(new URL('./js/views/banadores-catalogo.js', location.href).href),
    ]);
    vista.abrirCatalogoBanadores({ store, ui });
  });
  await this.verVisible(catalogo(this), 'No se abre el catálogo de bañadores');
});

When('guardo un bañador con los datos:', async function (tabla) {
  await catalogo(this).getByRole('button', { name: 'Nuevo bañador' }).click();
  const dialogo = this.page.locator('.modal').last();
  await this.verVisible(dialogo.getByLabel('Marca'), 'No se abre el formulario de bañador');
  await this.rellenarTabla(dialogo, tabla);
  await dialogo.getByRole('button', { name: 'Guardar' }).click();
});

When('desactivo el bañador {string}', async function (nombre) {
  await fila(this, nombre).getByRole('button', { name: 'Desactivar' }).click();
});

When('deshago el último aviso', async function () {
  await this.page.locator('#toasts .toast').getByRole('button', { name: 'Deshacer' }).last().click();
});

When('intento eliminar el bañador {string}', async function (nombre) {
  await fila(this, nombre).getByRole('button', { name: /^Eliminar/ }).click();
});

Then('veo el bañador {string} en el catálogo', async function (nombre) {
  await this.verVisible(fila(this, nombre), `Falta el bañador "${nombre}"`);
});

Then('no veo el bañador {string} en el catálogo', async function (nombre) {
  await this.noVer(fila(this, nombre), `Sigue el bañador "${nombre}"`);
});

Then('el bañador {string} figura como inactivo', async function (nombre) {
  await this.eventually(async () => assert.match(await fila(this, nombre).first().innerText(), /Inactivo/));
});

Then('el bañador {string} figura como activo', async function (nombre) {
  await this.verVisible(fila(this, nombre));
  await this.eventually(async () => assert.doesNotMatch(await fila(this, nombre).first().innerText(), /Inactivo/));
});

Then('el grupo {string} del catálogo incluye {string}', async function (grupo, nombre) {
  const seccion = catalogo(this).locator('.bn-grupo').filter({ has: this.page.getByRole('heading', { name: grupo }) });
  await this.verVisible(seccion.locator('.bn-nombre', { hasText: exacto(nombre) }), `El grupo "${grupo}" no incluye "${nombre}"`);
});

Then('veo el error {string} en el formulario de bañador', async function (texto) {
  await this.verVisible(this.page.locator('.modal').last().locator('.field-error', { hasText: texto }), `No aparece el error "${texto}"`);
});

Then('el diálogo de bañador en uso me ofrece desactivarlo o unirlo con otro', async function () {
  const dialogo = this.page.locator('.modal').last();
  await this.verVisible(dialogo.getByText(/no se puede eliminar/), 'No aparece el aviso de bañador en uso');
  await this.verVisible(dialogo.getByRole('button', { name: 'Desactivar' }));
  await this.verVisible(dialogo.getByRole('button', { name: 'Unir y eliminar' }));
});
