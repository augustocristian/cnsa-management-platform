import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { regexTexto, todasLasPalabras } from '../support/world.js';

const exacto = (s) => new RegExp('^' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
const sinSeparadores = (t) => t.replace(/[.\s  ,]/g, '');
const tarjeta = (mundo, titulo) => mundo.vista.locator('section.card').filter({ has: mundo.page.getByRole('heading', { name: titulo, exact: true }) });
const hoja = (mundo) => mundo.page.locator('.sheet');

// ---- Loads ----
async function abrirRegistroCarga(mundo) {
  await mundo.vista.getByRole('button', { name: 'Registrar carga', exact: true }).click();
  await mundo.verVisible(hoja(mundo), 'No se abre el formulario de registro');
}
async function registrarCarga(mundo, tabla) {
  await abrirRegistroCarga(mundo);
  await mundo.rellenarTabla(hoja(mundo), tabla);
  await hoja(mundo).getByRole('button', { name: 'Registrar', exact: true }).click();
  await mundo.verVisible(mundo.page.locator('#toasts .toast', { hasText: 'Carga registrada' }));
}

When('registro una carga con los datos:', async function (tabla) { await registrarCarga(this, tabla); });

When('abro el formulario para registrar una carga', async function () { await abrirRegistroCarga(this); });

When('consulto las cargas de {string}', async function (nombre) {
  await this.vista.locator('#cg-nadador').selectOption({ label: nombre });
});

When('paso a la semana anterior de cargas', async function () {
  await this.vista.getByRole('button', { name: 'Semana anterior' }).click();
});

When('fijo el objetivo semanal de {string} entre {int} y {int} metros', async function (tipo, min, max) {
  const fila = this.vista.locator('.cg-obj tbody tr').filter({ has: this.page.locator('td:first-child', { hasText: exacto(tipo) }) });
  await fila.locator('input').nth(0).fill(String(min));
  await fila.locator('input').nth(1).fill(String(max));
  await this.vista.locator('.cg-obj').getByRole('button', { name: 'Guardar objetivos' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Objetivos guardados' }));
});

When('dejo sin objetivo semanal todos los contenidos de entrenamiento', async function () {
  const filas = this.vista.locator('.cg-obj tbody tr');
  assert.ok(await filas.count() >= 10, 'Faltan contenidos en la tabla de objetivos');
  const inputs = this.vista.locator('.cg-obj tbody input');
  for (let i = 0; i < await inputs.count(); i++) await inputs.nth(i).fill('0'); // ONE save for the whole table
  await this.vista.locator('.cg-obj').getByRole('button', { name: 'Guardar objetivos' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: /Objetivos guardados|No hay cambios/ }));
});

When('deshago el último borrado', async function () {
  await this.page.locator('#toasts .toast-action', { hasText: 'Deshacer' }).click();
});

When('elimino la carga de {int} metros de {string}', async function (metros, nombre) {
  const fila = tarjeta(this, 'Cargas de la semana').locator('tbody tr').filter({ hasText: todasLasPalabras(nombre) }).filter({ hasText: sinSeparadoresRegex(metros) }).first();
  await fila.getByRole('button', { name: /^Eliminar la carga/ }).click();
});
const sinSeparadoresRegex = (n) => new RegExp(String(n).replace(/(\d)(?=(\d{3})+$)/g, '$1\\.?'));

Then('la carga de {int} metros de {string} aparece en las cargas de la semana', async function (metros, nombre) {
  const filas = tarjeta(this, 'Cargas de la semana').locator('tbody tr').filter({ hasText: todasLasPalabras(nombre) });
  await this.eventually(async () => {
    const textos = (await filas.allInnerTexts()).map(sinSeparadores);
    assert.ok(textos.some((t) => t.includes(String(metros))), `Filas de ${nombre}: ${textos}`);
  });
});

Then('la carga de {int} metros de {string} no aparece en las cargas de la semana', async function (metros, nombre) {
  const filas = tarjeta(this, 'Cargas de la semana').locator('tbody tr').filter({ hasText: todasLasPalabras(nombre) });
  await this.eventually(async () => {
    const textos = (await filas.allInnerTexts()).map(sinSeparadores);
    assert.ok(!textos.some((t) => t.includes(String(metros))), `Sigue la carga: ${textos}`);
  });
});

Then('la carga recién registrada aparece resaltada', async function () {
  await this.verVisible(tarjeta(this, 'Cargas de la semana').locator('tbody tr.is-new'));
});

Then('todas las cargas listadas son de {string}', async function (nombre) {
  const filas = tarjeta(this, 'Cargas de la semana').locator('tbody tr');
  await this.eventually(async () => {
    const n = await filas.count();
    assert.ok(n > 0, 'No hay cargas');
    const ok = await filas.evaluateAll((trs, nom) => trs.every((tr) => tr.children[1].textContent.trim() === nom), nombre);
    assert.ok(ok, 'Hay cargas de otros deportistas');
  });
});

Then('veo la evolución de las cargas por tipo y por día', async function () {
  await this.verVisible(this.vista.locator('[aria-label="Metros semanales por tipo"]'));
  await this.verVisible(this.vista.locator('[aria-label="Metros por día"]'));
});

Then('la semana mostrada es distinta de la actual', async function () {
  await this.verVisible(this.vista.locator('.cg-week'));
});

Then('veo la alerta {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.alert', { hasText: texto }), `No hay alerta "${texto}"`);
});

Then('veo el error en el campo {string}: {string}', async function (campo, texto) {
  const ambito = (await this.page.locator('.sheet').count()) ? this.page.locator('.sheet') : this.vista;
  await this.verVisible(ambito.locator('.field-error', { hasText: texto }), `No aparece el error "${texto}"`);
  assert.equal(await ambito.getByLabel(campo).first().getAttribute('aria-invalid'), 'true', `"${campo}" no está marcado como inválido`);
});

Given('que he registrado una carga de {int} metros para {string}', async function (metros, nombre) {
  await this.irA('cargas');
  await registrarCarga(this, { raw: () => [['Nadador', nombre], ['Contenido', 'Aeróbico medio / Umbral anaeróbico'], ['Metros', String(metros)]] });
});

// ---- Times ----
async function abrirRegistroMarca(mundo) {
  await mundo.vista.getByRole('button', { name: 'Registrar marca', exact: true }).click();
  await mundo.verVisible(hoja(mundo), 'No se abre el formulario de marca');
}

When('registro una marca con los datos:', async function (tabla) {
  await abrirRegistroMarca(this);
  await this.rellenarTabla(hoja(this), tabla);
  await hoja(this).getByRole('button', { name: 'Registrar', exact: true }).click();
});

When('abro el formulario para registrar una marca', async function () { await abrirRegistroMarca(this); });

When('consulto la evolución de {string} en la prueba {string}', async function (nombre, prueba) {
  const selects = this.vista.locator('.mc-filters select');
  await selects.nth(0).selectOption({ label: nombre });
  await selects.nth(1).selectOption({ label: prueba });
});

When('filtro las marcas por {string} {string}', async function (campo, valor) {
  await this.rellenar(this.vista.locator('.mc-filters'), campo, valor);
});

When('quito el filtro {string}', async function (texto) {
  await this.vista.locator('.mc-chips').getByRole('button', { name: new RegExp('Quitar filtro: ' + texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click();
});

When('pido ver más marcas del historial', async function () {
  await this.vista.getByRole('button', { name: /^Ver más/ }).click();
});

Then('la marca queda registrada', async function () {
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Marca registrada' }));
});

Then('la marca no se registra por tiempo no válido', async function () {
  await this.verVisible(hoja(this).locator('.field-error', { hasText: 'Tiempo no válido' }));
});

Then('el formulario pide indicar el tiempo', async function () {
  await this.verVisible(hoja(this).locator('.field-error', { hasText: 'Indica el tiempo' }));
});

Then('el tiempo escrito {string} se interpreta como {string}', async function (escrito, interpretado) {
  const campo = hoja(this).getByLabel('Tiempo (mm:ss.cc)').first();
  await campo.fill(escrito);
  await this.verVisible(hoja(this).locator('.mc-live', { hasText: interpretado }));
});

Then('la mejor marca de {string} en {string} es {string}', async function (nombre, prueba, tiempo) {
  const fila = tarjeta(this, 'Mejores marcas').locator('tbody tr').filter({ hasText: todasLasPalabras(`${prueba} ${nombre}`) });
  await this.eventually(async () => assert.match(await fila.first().innerText(), regexTexto(tiempo)));
});

Then('la mejor marca mostrada es {string}', async function (tiempo) {
  await this.eventually(async () => assert.match(await tarjeta(this, 'Mejores marcas').locator('tbody').innerText(), regexTexto(tiempo)));
});

Then('el historial señala {string} como mejor marca', async function (tiempo) {
  await this.verVisible(tarjeta(this, 'Historial').locator('td', { hasText: regexTexto(tiempo) }).locator('.mc-pb'));
});

Then('el historial no señala {string} como mejor marca', async function (tiempo) {
  const t = tarjeta(this, 'Historial');
  await this.eventually(async () => {
    assert.equal(await t.locator('td', { hasText: regexTexto(tiempo) }).locator('.mc-pb').count(), 0);
    assert.ok(await t.locator('td', { hasText: regexTexto(tiempo) }).count() > 0, 'La marca no está en el historial');
  });
});

Then('el historial no incluye la marca {string}', async function (tiempo) {
  await this.eventually(async () => assert.equal(await tarjeta(this, 'Historial').locator('td', { hasText: regexTexto(tiempo) }).count(), 0));
});

Then('el historial incluye la marca {string}', async function (tiempo) {
  await this.verVisible(tarjeta(this, 'Historial').locator('td', { hasText: regexTexto(tiempo) }));
});

Then('el historial muestra {int} marcas', async function (n) {
  await this.eventually(async () => assert.equal(await tarjeta(this, 'Historial').locator('tbody tr').count(), n));
});

Then('el historial muestra el bañador {string} en la marca {string}', async function (banador, tiempo) {
  const fila = tarjeta(this, 'Historial').locator('tbody tr').filter({ hasText: regexTexto(tiempo) }).first();
  await this.eventually(async () => assert.match(await fila.innerText(), regexTexto(banador)));
});

Then('veo el gráfico de evolución de marcas', async function () {
  await this.verVisible(this.vista.locator('svg[aria-label="Evolución de marcas"]'));
});

Then('el gráfico de evolución de marcas se muestra sin elegir nada', async function () {
  await this.verVisible(this.vista.locator('svg[aria-label="Evolución de marcas"]'));
});

Then('hay un filtro activo {string}', async function (texto) {
  await this.verVisible(this.vista.locator('.mc-chips .chip', { hasText: texto }));
});

Given('que he registrado las marcas de {string} en {string}:', async function (nombre, prueba, tabla) {
  await this.irA('marcas');
  for (const fila of tabla.hashes()) {
    await abrirRegistroMarca(this);
    const d = hoja(this);
    await this.rellenar(d, 'Nadador', nombre);
    await this.rellenar(d, 'Prueba', prueba);
    await this.rellenar(d, 'Fecha', fila.fecha);
    await this.rellenar(d, 'Tiempo (mm:ss.cc)', fila.tiempo);
    if (fila.bañador) await this.rellenar(d, 'Bañador', fila.bañador);
    await d.getByRole('button', { name: 'Registrar', exact: true }).click();
    await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Marca registrada' }));
    await this.noVer(d, 'La hoja no se cierra');
  }
});
