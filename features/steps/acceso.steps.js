// Pasos del acceso con Google y el primer arranque. Usan el adaptador de pruebas (fakeGoogle.js): this.drive() lee el
// "Drive" simulado de la página (window.__CNL_FAKE__).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Given('que he creado el club {string} con el asistente', async function (nombre) {
  await this.page.getByRole('button', { name: 'Iniciar sesión con Google' }).click();
  await this.rellenar(this.page, 'Nombre del club', nombre);
  await this.page.getByRole('button', { name: 'Siguiente' }).click();
  await this.page.getByRole('button', { name: 'Crear mi club' }).click();
  await this.esperarShell();
});

Then('Drive contiene el club {string}', async function (nombre) {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.clubs.some((c) => c.name === nombre), `No hay club "${nombre}" en cnl: ${d.clubs.map((c) => c.name).join(', ')}`);
  });
});

Then('el listado de nadadores está vacío', async function () {
  await this.page.locator('#view .loading').waitFor({ state: 'detached', timeout: this.timeout });
  await this.eventually(async () => assert.equal(await this.vista.locator('tr.nad-row').count(), 0));
});

Then('el panel de inicio ofrece los primeros pasos:', async function (tabla) {
  const tarjeta = this.vista.locator('#primeros-pasos');
  await this.verVisible(tarjeta, 'No se ve la tarjeta de primeros pasos');
  for (const [paso] of tabla.raw()) await this.verVisible(tarjeta.getByRole('link', { name: paso }), `Falta el paso "${paso}"`);
});

Then('el campo {string} contiene {string}', async function (etiqueta, valor) {
  await this.eventually(async () => assert.equal(await this.page.getByLabel(etiqueta).first().inputValue(), valor));
});

Then('las preferencias de Drive guardan {string} con el valor {string}', async function (clave, valor) {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.prefs, 'Todavía no existe cnl/preferencias.json');
    assert.equal(d.prefs.valores[clave], valor);
  });
});

Then('veo el origen de esta página para copiarlo', async function () {
  const origen = new URL(this.page.url()).origin;
  await this.verVisible(this.page.locator('[data-codigo] code', { hasText: origen }), `No se muestra el origen ${origen}`);
});

Then('el fichero del club en Drive contiene al nadador {string}', async function (nombre) {
  await this.eventually(async () => {
    const d = await this.drive();
    const filas = d.clubs.flatMap((c) => (c.doc.hojas.Nadadores || []));
    assert.ok(filas.some((n) => n.nombre === nombre), 'El nadador aún no está en el fichero del club de Drive');
  });
});

Then('el fichero del club en Drive no contiene al nadador {string}', async function (nombre) {
  await this.page.waitForTimeout(2500); // más que el debounce de subida (1,5 s): si fuese a subirse ya lo habría hecho
  const d = await this.drive();
  assert.ok(!d.clubs.some((c) => (c.doc.hojas.Nadadores || []).some((n) => n.nombre === nombre)), `"${nombre}" no debería estar aún en Drive`);
});

Then('el indicador de sincronización muestra {string}', async function (texto) {
  await this.eventually(async () => assert.equal((await this.page.locator('.status-chip .status-text').innerText()).trim(), texto));
});

When('recupero la conexión', async function () {
  await this.contexto.setOffline(false);
});

When('cierro la sesión', async function () {
  await this.page.locator('.topbar').getByRole('button', { name: 'Salir' }).click();
});
