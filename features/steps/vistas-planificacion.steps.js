// Pasos compartidos por Planificación (piscina y temporada), Calendario y el tutorial: menús de acciones, desbordamiento de la página,
// agenda en «hoy», rejilla del mes con teclado, avisos con «Deshacer» y los controles del tutorial.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

// ---- Páginas y menús ----
Then('la página no se desborda horizontalmente', async function () {
  await this.eventually(async () => {
    const m = await this.page.evaluate(() => ({ ancho: document.documentElement.scrollWidth, visible: document.documentElement.clientWidth }));
    assert.ok(m.ancho <= m.visible + 1, `La página se desborda: ${m.ancho} > ${m.visible}`);
  });
});

When('elijo la opción {string} del menú', async function (nombre) {
  await this.page.getByRole('menuitem', { name: nombre }).click();
});

Then('la opción {string} está en el menú', async function (nombre) {
  await this.verVisible(this.page.getByRole('menuitem', { name: nombre }), `No hay opción de menú «${nombre}»`);
});

When('pulso {string} en el aviso', async function (texto) {
  await this.page.locator('#toasts .toast').getByRole('button', { name: texto }).click();
});

Then('hay un único menú de exportación en la cabecera', async function () {
  assert.equal(await this.page.locator('.page-head .enp-mn-btn').count(), 1);
});

// ---- Calendario ----
Then('la primera sección de la agenda es la de hoy', async function () {
  await this.eventually(async () => {
    const primera = this.page.locator('.cal-agenda-dia').first();
    assert.equal(await primera.count(), 1);
    assert.ok((await primera.getAttribute('class')).includes('cal-hoy'), 'La agenda no empieza en hoy');
  });
});

When('enfoco el día de hoy de la rejilla del mes', async function () {
  const hoy = this.page.locator('button.cal-num[aria-current="date"]');
  await hoy.waitFor({ timeout: this.timeout });
  await hoy.focus();
});

When('pulso la tecla {string}', async function (tecla) {
  await this.page.keyboard.press(tecla);
});

Then('el día seleccionado de la rejilla es el de dentro de {int} día(s)', async function (dias) {
  const esperado = await this.page.evaluate((n) => {
    const d = new Date(); d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, dias);
  await this.eventually(async () => assert.equal(await this.page.locator('button.cal-num[aria-pressed="true"]').getAttribute('data-fecha'), esperado));
});

Then('la sincronización con Google Calendar está desactivada y se explica', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('#cal-sync').isDisabled(), true));
  await this.verVisible(this.page.locator('#cal-sync-motivo'), 'No se explica por qué está desactivada la sincronización');
});

// ---- Tutorial ----
Then('veo {int} pasos numerados de al menos 44 píxeles', async function (n) {
  const chips = this.page.locator('.tut-chip');
  await chips.first().waitFor({ timeout: this.timeout });
  assert.equal(await chips.count(), n);
  for (let i = 0; i < n; i++) {
    const caja = await chips.nth(i).boundingBox();
    assert.ok(caja.width >= 43.5 && caja.height >= 43.5, `El paso ${i + 1} mide ${caja.width}x${caja.height}`);
  }
});

Then('cada botón Copiar dice qué valor copia', async function () {
  const botones = this.page.locator('.tut-val .btn');
  await botones.first().waitFor({ timeout: this.timeout });
  const etiquetas = await botones.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label') || ''));
  assert.ok(etiquetas.length >= 1);
  etiquetas.forEach((e) => assert.match(e, /^Copiar: .{4,}/));
});

Then('el tutorial no inyecta estilos en la página', async function () {
  assert.equal(await this.page.locator('style#tut-style').count(), 0);
  assert.ok(await this.page.locator('link[data-view-css="tutorial"]').count() >= 1);
});

// Un campo (filtro, selector...) de la vista actual identificado por su etiqueta visible
Then('veo el campo {string}', async function (etiqueta) {
  await this.verVisible(this.vista.getByLabel(etiqueta), `No se ve el campo «${etiqueta}»`);
});
