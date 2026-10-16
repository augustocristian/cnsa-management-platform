import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const editor = (mundo) => mundo.page.locator('.enp-ov:not(.enp-prev-ov)');
const filaPlan = (mundo, set, orden) => editor(mundo).locator(`.enp-row[data-set="${set}"][data-orden="${orden}"]`);
const chip = (mundo, set, orden, nombre) => filaPlan(mundo, set, orden).locator(`.enp-c[data-contenido="${nombre}"]`);
const texto = async (loc) => ((await loc.first().textContent()) || '').replace(/\s+/g, ' ').trim();

When('añado el contenido {string} a la fila {int} del set {int}', async function (nombre, orden, set) {
  await filaPlan(this, set, orden).locator('select.enp-c-add').selectOption({ value: nombre });
  await chip(this, set, orden, nombre).waitFor({ timeout: this.timeout });
});
Then('el contenido {string} de la fila {int} del set {int} reparte {string}', async function (nombre, orden, set, parte) {
  await this.eventually(async () => assert.ok((await texto(chip(this, set, orden, nombre).locator('.enp-c-res'))).includes(parte), `No reparte «${parte}»`));
});
When('fijo {string} metros por repetición de {string} en la fila {int} del set {int}', async function (valor, nombre, orden, set) {
  await chip(this, set, orden, nombre).locator('.enp-c-val').fill(valor);
});
Then('el contenido {string} de la fila {int} del set {int} está en modo {string}', async function (nombre, orden, set, modo) {
  await this.eventually(async () => assert.equal(await texto(chip(this, set, orden, nombre).locator('.enp-c-modo')), modo));
});
When('autocompleto desde el texto la fila {int} del set {int}', async function (orden, set) {
  await filaPlan(this, set, orden).getByRole('button', { name: /Autocompletar desde el texto/ }).click();
});
Then('veo el resto sin asignar {string} en la fila {int} del set {int}', async function (parte, orden, set) {
  const resto = filaPlan(this, set, orden).locator('.enp-c-resto');
  await this.eventually(async () => {
    assert.ok(await resto.isVisible(), 'El indicador de resto no está visible');
    assert.ok((await texto(resto)).includes(parte));
  });
});
Then('no hay resto sin asignar en la fila {int} del set {int}', async function (orden, set) {
  await this.eventually(async () => assert.equal(await filaPlan(this, set, orden).locator('.enp-c-resto').isVisible(), false));
});
When('asigno el resto de la fila {int} del set {int} a {string}', async function (orden, set, nombre) {
  const resto = filaPlan(this, set, orden).locator('.enp-c-resto');
  await resto.locator('select').selectOption({ value: nombre });
  await resto.getByRole('button', { name: 'Asignar resto' }).click();
});

// El resumen se lee con textContent: en móvil el panel está plegado pero sigue en el DOM.
Then('el resumen de la sesión dice {string}', async function (parte) {
  await this.eventually(async () => assert.ok((await texto(editor(this).locator('[data-resumen="texto"]'))).includes(parte), `El resumen no dice «${parte}»`));
});
const pesa = async (mundo, panel, clave, m, pct) => {
  const li = editor(mundo).locator(`.enp-res-${panel} .enp-leg li[data-clave="${clave}"]`);
  await mundo.eventually(async () => {
    const t = await texto(li);
    assert.ok(t.includes(m) && t.includes(pct), `«${clave}»: ${t}`);
  });
};
Then('el contenido {string} pesa {string} y {string} en el resumen', async function (nombre, m, pct) { await pesa(this, 'cont', nombre, m, pct); });
Then('el estilo {string} suma {string} y {string} en el resumen', async function (nombre, m, pct) { await pesa(this, 'est', nombre, m, pct); });

When('copio el resumen de la sesión', async function () {
  await this.page.evaluate(() => {
    window.__copiado = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copiado.push(t); } }, configurable: true });
  });
  await editor(this).locator('.enp-res button', { hasText: 'Copiar resumen' }).evaluate((b) => b.click());
});
Then('el portapapeles contiene {string}', async function (parte) {
  await this.eventually(async () => {
    const t = (await this.page.evaluate(() => (window.__copiado || []).join('\n'))) || '';
    assert.ok(t.includes(parte), `Portapapeles: ${t}`);
  });
});

When('registro las cargas desde el plan', async function () {
  await editor(this).locator('.enp-res button', { hasText: 'Registrar cargas desde el plan' }).evaluate((b) => b.click());
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).evaluate((b) => b.click());
});
