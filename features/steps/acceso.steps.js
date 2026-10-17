// Pasos del acceso con Google y el primer arranque. Usan el adaptador de pruebas (fakeGoogle.js): this.drive() lee el
// "Drive" simulado de la página (window.__CNL_FAKE__).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

Given('que he creado el club {string} con el asistente', async function (nombre) {
  await this.page.getByRole('button', { name: 'Conectar Google Drive' }).click();
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
  await this.abrirMenuCuenta();
  await this.eventually(async () => assert.equal((await this.page.locator('.status-chip .status-text').innerText()).trim(), texto));
});

When('recupero la conexión', async function () {
  await this.contexto.setOffline(false);
});

// Disconnect Drive from the account menu of the shell (asks for confirmation).
When('desconecto Drive', async function () {
  await this.page.locator('.topbar .account-btn').click();
  await this.page.locator('.account-panel').getByRole('button', { name: 'Desconectar Drive' }).click();
  await this.page.locator('.sheet').getByRole('button', { name: 'Desconectar Drive' }).click();
});

// ---- Start screen ----
When('elijo el idioma {string}', async function (idioma) {
  await this.page.locator('.acc-foot').getByRole('radio', { name: idioma }).click();
});

Then('la pantalla de inicio no habla de cuentas ni de iniciar sesión', async function () {
  const txt = (await this.page.locator('main').innerText()).toLowerCase();
  for (const palabra of ['iniciar sesión', 'inicia sesión', 'cuenta', 'correo', 'bienvenido de nuevo']) assert.ok(!txt.includes(palabra), `La pantalla menciona "${palabra}"`);
});

Then('el selector de idioma de la pantalla de inicio está en el pie de la tarjeta', async function () {
  await this.verVisible(this.page.locator('.acc-foot .lang-switch'));
  const r = await this.page.evaluate(() => {
    const card = document.querySelector('main.auth-card');
    const hijos = [...card.children].filter((e) => getComputedStyle(e).display !== 'none');
    const pie = card.querySelector('.acc-foot');
    return { primero: hijos[0].matches('.acc-foot, .auth-lang'), ultimo: hijos[hijos.length - 1] === pie };
  });
  assert.equal(r.primero, false, 'El idioma es lo primero de la tarjeta');
  assert.equal(r.ultimo, true, 'El idioma no está al final de la tarjeta');
});

Then('la pantalla de inicio no tiene ningún desplegable de idioma', async function () {
  assert.equal(await this.page.locator('main select:visible').count(), 0);
});

Then('el origen de esta página y su botón Copiar están alineados', async function () {
  const caja = this.page.locator('.acc-copy').first();
  await this.verVisible(caja);
  const r = await caja.evaluate((el) => {
    const a = el.querySelector('code').getBoundingClientRect();
    const b = el.querySelector('button').getBoundingClientRect();
    return { dy: Math.abs(a.top - b.top), dh: Math.abs(a.height - b.height), mismaFila: a.bottom > b.top && b.bottom > a.top };
  });
  assert.ok(r.mismaFila && r.dy <= 1 && r.dh <= 1, `Campo y botón desalineados: ${JSON.stringify(r)}`);
});

Then('la vista previa del club usa el color elegido', async function () {
  await this.page.locator('#as-color1').evaluate((el) => { el.value = '#d81b60'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await this.eventually(async () => {
    const v = await this.page.locator('.acc-prev').evaluate((el) => el.style.getPropertyValue('--c-action'));
    assert.match(v, /^#[0-9a-f]{6}$/i);
    assert.notEqual(v.toLowerCase(), '#1a73e8');
  });
});
