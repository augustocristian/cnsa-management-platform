import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const etiqueta = (c) => (c === 'Nombre' || c === 'Apellidos' ? `${c} *` : c);
async function rellenarNadador(mundo, tabla) {
  const ambito = mundo.page.locator('.nad-modal');
  await ambito.waitFor({ timeout: mundo.timeout });
  for (const [campo, valor] of tabla.raw()) {
    const c = ambito.getByLabel(etiqueta(campo)).first();
    const tag = await c.evaluate((el) => el.tagName.toLowerCase());
    if (tag === 'select') await c.selectOption({ label: valor }); else await c.fill(valor);
  }
}
const fila = (mundo, nombre) => mundo.vista.locator('tr.nad-row').filter({ hasText: todasLasPalabras(nombre) });

// ---- Alta, edición, ficha ----
When('doy de alta al nadador con los datos:', async function (tabla) {
  await this.vista.getByRole('button', { name: 'Nuevo nadador' }).click();
  await rellenarNadador(this, tabla);
  await this.page.locator('.nad-modal').getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
});

When('intento dar de alta a un nadador sin apellidos', async function () {
  await this.vista.getByRole('button', { name: 'Nuevo nadador' }).click();
  await rellenarNadador(this, { raw: () => [['Nombre', 'Solo']] });
  await this.page.locator('.nad-modal').getByRole('button', { name: 'Guardar' }).click();
});

Then('el formulario sigue abierto', async function () {
  await this.verVisible(this.page.locator('.nad-modal'));
});

When('abro la ficha de {string}', async function (nombre) {
  await fila(this, nombre).first().click();
  await this.verVisible(this.vista.getByRole('heading', { level: 1 }).filter({ hasText: todasLasPalabras(nombre) }));
});

When('edito al nadador con los datos:', async function (tabla) {
  await this.vista.getByRole('button', { name: 'Editar' }).click();
  await rellenarNadador(this, tabla);
  await this.page.locator('.nad-modal').getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
});

When('elimino al nadador y lo confirmo', async function () {
  await this.vista.getByRole('button', { name: 'Eliminar' }).click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

Then('el listado de nadadores incluye a {string}', async function (nombre) {
  await this.verVisible(fila(this, nombre), `${nombre} no está en el listado`);
});

Then('el listado de nadadores no incluye a {string}', async function (nombre) {
  await this.eventually(async () => assert.equal(await fila(this, nombre).count(), 0));
});

Then('veo la ficha de {string}', async function (nombre) {
  await this.verVisible(this.vista.getByRole('heading', { level: 1 }).filter({ hasText: todasLasPalabras(nombre) }));
});

Then('la ficha muestra los datos personales:', async function (tabla) {
  for (const [dato] of tabla.raw()) await this.verVisible(this.vista.locator('dt', { hasText: dato }), `Falta el dato "${dato}"`);
});

Then('la ficha muestra el valor {string}', async function (v) {
  await this.verVisible(this.vista.locator('dd', { hasText: regexTexto(v) }), `Falta el valor "${v}"`);
});

Then('la ficha incluye las secciones del perfil deportivo:', async function (tabla) {
  for (const [s] of tabla.raw()) await this.verVisible(this.vista.locator('h2', { hasText: s }), `Falta la sección "${s}"`);
});

Then('la ficha muestra su porcentaje de asistencia', async function () {
  await this.verVisible(this.vista.locator('.nad-stat').filter({ hasText: 'Asistencia' }).filter({ hasText: '%' }));
});

Then('la ficha muestra la mejor marca {string} en {string}', async function (tiempo, prueba) {
  const bloque = this.vista.locator('.nad-chartbox').filter({ hasText: prueba });
  await this.verVisible(bloque.locator('.badge', { hasText: `PB ${tiempo}` }), `No hay PB ${tiempo} en ${prueba}`);
});

// ---- Consulta ----
When('busco nadadores por {string}', async function (texto) {
  await this.vista.locator('input[type=search]').fill(texto);
});

When('filtro los nadadores por la categoría {string}', async function (c) {
  await this.vista.locator('.nad-filters select').nth(0).selectOption({ label: c });
});

When('filtro los nadadores por el grupo {string}', async function (g) {
  await this.vista.locator('.nad-filters select').nth(1).selectOption({ label: g });
});

Then('el listado muestra {int} nadador(es)', async function (n) {
  await this.eventually(async () => assert.equal((await this.vista.locator('span.nad-muted').first().innerText()).trim(), `${n} nadador${n === 1 ? '' : 'es'}`));
});

Then('todos los nadadores listados son de la categoría {string}', async function (c) {
  const badges = this.vista.locator('tr.nad-row td:nth-child(2)');
  await this.eventually(async () => {
    const t = await badges.allInnerTexts();
    assert.ok(t.length > 0, 'Sin filas');
    assert.ok(t.every((x) => x.trim() === c), `Categorías: ${t}`);
  });
});

// ---- Orden de categorías ----
Then('la categoría {string} ocupa la posición {int} en el filtro de categorías', async function (cat, pos) {
  const opciones = (await this.vista.locator('.nad-filters select').nth(0).locator('option').allInnerTexts()).map((x) => x.trim()).slice(1);
  assert.equal(opciones.indexOf(cat) + 1, pos, `Orden actual: ${opciones.join(', ')}`);
});

Then('el filtro de categorías ofrece, en este orden:', async function (tabla) {
  const esperado = tabla.raw().map((r) => r[0]);
  const opciones = (await this.vista.locator('.nad-filters select').nth(0).locator('option').allInnerTexts()).map((x) => x.trim()).slice(1);
  assert.deepEqual(opciones, esperado);
});

Then('en el listado los nadadores de {string} aparecen antes que los de {string}', async function (a, b) {
  const cats = (await this.vista.locator('tr.nad-row td:nth-child(2)').allInnerTexts()).map((x) => x.trim());
  const ultimaA = cats.lastIndexOf(a), primeraB = cats.indexOf(b);
  assert.ok(ultimaA >= 0 && primeraB >= 0, `El listado no contiene ${a} y ${b}: ${[...new Set(cats)]}`);
  assert.ok(ultimaA < primeraB, `${a} debería ir antes que ${b}: ${[...new Set(cats)]}`);
});

// ---- Grupos ----
const tarjetaGrupo = (mundo, nombre) => mundo.vista.locator('.grp-card').filter({ has: mundo.page.locator('h2', { hasText: nombre }) });

When('creo el grupo con los datos:', async function (tabla) {
  await this.vista.getByRole('button', { name: 'Nuevo grupo' }).click();
  const m = this.page.locator('.grp-modal');
  await m.waitFor({ timeout: this.timeout });
  await this.rellenarTabla(m, tabla);
  await m.getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Grupo guardado' }));
});

When('edito el grupo {string} con los datos:', async function (nombre, tabla) {
  await tarjetaGrupo(this, nombre).first().getByRole('button', { name: 'Editar' }).click();
  const m = this.page.locator('.grp-modal');
  await this.rellenarTabla(m, tabla);
  await m.getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Grupo guardado' }));
});

When('elimino el grupo {string} y lo confirmo', async function (nombre) {
  await tarjetaGrupo(this, nombre).first().getByRole('button', { name: 'Eliminar' }).click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});

Then('veo el grupo {string}', async function (nombre) {
  await this.verVisible(tarjetaGrupo(this, nombre), `No existe el grupo ${nombre}`);
});

Then('no veo el grupo {string}', async function (nombre) {
  await this.eventually(async () => assert.equal(await tarjetaGrupo(this, nombre).count(), 0));
});

Then('el grupo {string} tiene {int} nadador(es)', async function (nombre, n) {
  const t = tarjetaGrupo(this, nombre).first();
  await this.eventually(async () => assert.match(await t.innerText(), new RegExp(`· ${n} nadador(es)?`)));
});

Then('el grupo {string} incluye a {string}', async function (grupo, nadador) {
  await this.verVisible(tarjetaGrupo(this, grupo).first().locator('li', { hasText: todasLasPalabras(nadador) }));
});

Then('el grupo {string} está a cargo de {string}', async function (grupo, entrenador) {
  await this.verVisible(tarjetaGrupo(this, grupo).first().getByText(`Entrenador: ${entrenador}`));
});

Then('{string} figura entre los nadadores sin grupo', async function (nadador) {
  const t = this.vista.locator('.grp-card').filter({ has: this.page.locator('h2', { hasText: 'Sin grupo' }) });
  await this.verVisible(t.locator('li', { hasText: todasLasPalabras(nadador) }));
});
