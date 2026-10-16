// Shell navigation steps: bottom bar + "More" sheet, sidebar groups, route-change accessibility (title, focus, aria-current),
// footer in Settings only, offline banner and the settings/connection menu.
import { When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

const lista = (txt) => txt.split(',').map((x) => x.trim()).filter(Boolean);

// ---- Bottom bar and "More" sheet (mobile) ----
Then('la barra inferior muestra los accesos {string}', async function (esperados) {
  await this.eventually(async () => {
    const textos = await this.page.locator('nav.sidebar .nav-item').evaluateAll((els) => els
      .filter((e) => e.getBoundingClientRect().height > 0)
      // the visible label (the short one when there is one), not the hidden full label
      .map((e) => {
        const corto = e.querySelector('.nav-label-short');
        const visible = corto && getComputedStyle(corto).display !== 'none' ? corto : e.querySelector('.nav-label');
        return visible.textContent.trim();
      }));
    assert.deepEqual(textos, lista(esperados));
  });
});

When('abro la hoja {string} del menú', async function (nombre) {
  await this.page.locator('nav.sidebar .nav-more').click();
  await this.page.locator('.sheet').waitFor({ timeout: this.timeout });
  assert.equal(nombre, 'Más', 'Only the "Más" sheet exists');
});

Then('la hoja del menú tiene el grupo {string} con {string}', async function (grupo, items) {
  const hoja = this.page.locator('.sheet');
  await this.verVisible(hoja.locator('.nav-group-title', { hasText: new RegExp(`^${grupo}$`) }), `The sheet has no group "${grupo}"`);
  const lista_ = await hoja.locator('.mas-group').filter({ has: this.page.locator('.nav-group-title', { hasText: new RegExp(`^${grupo}$`) }) })
    .locator('.mas-item').allInnerTexts();
  assert.deepEqual(lista_.map((x) => x.trim()), lista(items));
});

Then('la hoja del menú no ofrece {string}', async function (nombre) {
  assert.equal(await this.page.locator('.sheet .mas-item', { hasText: nombre }).count(), 0, `The sheet offers "${nombre}"`);
});

Then('el botón Más está marcado como activo', async function () {
  await this.eventually(async () => assert.match(await this.page.locator('nav.sidebar .nav-more').getAttribute('class'), /\bactive\b/));
});

// ---- Sidebar (desktop) ----
Then('el menú lateral tiene los encabezados {string}', async function (esperados) {
  const textos = await this.page.locator('nav.sidebar .nav-group-title').allInnerTexts();
  assert.deepEqual(textos.map((x) => x.trim().toLowerCase()), lista(esperados).map((x) => x.toLowerCase()));
});

// ---- Route change accessibility ----
Then('el título del documento empieza por {string}', async function (texto) {
  await this.eventually(async () => assert.ok((await this.page.title()).startsWith(texto), `Title: ${await this.page.title()}`));
});

Then('el foco está en el encabezado de la pantalla', async function () {
  await this.eventually(async () => {
    const f = await this.page.evaluate(() => { const a = document.activeElement; return { tag: a?.tagName, enVista: !!a?.closest('#view'), id: a?.id }; });
    assert.ok(f.tag === 'H1' && f.enVista, `Focus is on ${JSON.stringify(f)}`);
  });
});

Then('el elemento actual del menú es {string}', async function (nombre) {
  await this.eventually(async () => {
    const actual = await this.page.locator('nav.sidebar a.nav-item[aria-current="page"]').evaluateAll((els) => els.map((e) => e.textContent.trim()));
    assert.equal(actual.length, 1, `aria-current items: ${actual}`);
    assert.match(actual[0], new RegExp(nombre));
  });
});

// ---- Footer ----
Then('no hay pie de página', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('footer.footer').count(), 0));
});

Then('hay pie de página', async function () {
  await this.verVisible(this.page.locator('footer.footer'), 'The footer is missing in Settings');
});

// ---- Offline banner ----
Then('veo el banner de sin conexión', async function () {
  await this.verVisible(this.page.locator('#cnl-avisos [data-aviso="sin-conexion"]'), 'No offline banner');
});

Then('el banner de sin conexión desaparece', async function () {
  await this.eventually(async () => assert.equal(await this.page.locator('#cnl-avisos [data-aviso="sin-conexion"]').count(), 0));
});

// ---- Settings and connection menu ----
When('abro el menú de ajustes y conexión', async function () {
  await this.abrirMenuCuenta();
});

Then('el menú de ajustes ofrece el idioma, el tema, el estado de Drive y el botón {string}', async function (boton) {
  const panel = this.page.locator('.account-panel');
  await this.verVisible(panel.locator('.lang-switch'), 'No language switch in the menu');
  await this.verVisible(panel.locator('.theme-select'), 'No theme selector in the menu');
  await this.verVisible(panel.locator('.status-row .status-text'), 'No Drive status in the menu');
  await this.verVisible(panel.getByRole('button', { name: boton }), `No "${boton}" button`);
});

Then('el menú de ajustes no muestra ninguna identidad de usuario', async function () {
  const panel = this.page.locator('.account-panel');
  const txt = await panel.innerText();
  assert.ok(!/@/.test(txt), 'An e-mail address is shown in the menu');
  assert.equal(await this.page.locator('#user-box, .account-panel .avatar, .account-btn .avatar').count(), 0);
});
