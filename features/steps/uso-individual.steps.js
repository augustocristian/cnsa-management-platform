// Steps for individual use: each person has their own data in their own Drive, and the same person sees the same
// data on every device. A second "device" is a second Playwright browser context (separate storage); the simulated
// Drive (js/infrastructure/fakeGoogle.js) lives in each page's localStorage, so "the same Drive" is shared by copying
// that mirror ('cnl:test:drive') between contexts.
import { When, Then, After } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { ruta } from '../support/world.js';

const CLAVE_DRIVE = 'cnl:test:drive';

// Runs `fn` with the world pointing at the other device's page (the world helpers use this.page).
async function enOtroDispositivo(mundo, fn) {
  assert.ok(mundo.otraPagina, 'Primero hay que abrir la aplicación en otro dispositivo');
  const propia = mundo.page;
  mundo.page = mundo.otraPagina;
  try { return await fn(); } finally { mundo.page = propia; }
}

// opciones: { copiarDrive: boolean, usuario: email }
async function abrirOtroDispositivo(mundo, { copiarDrive, usuario }) {
  const origen = new URL(mundo.page.url()).origin;
  let drive = null;
  let perfil = null;
  if (copiarDrive) {
    drive = await mundo.page.evaluate((k) => localStorage.getItem(k), CLAVE_DRIVE);
    perfil = await mundo.page.evaluate(() => localStorage.getItem('cnl:user'));
    assert.ok(drive && perfil, 'El primer dispositivo no tiene sesión ni Drive simulado');
    usuario = JSON.parse(perfil).email;
  }
  mundo.contextoOtro = await mundo.contexto.browser().newContext({
    viewport: mundo.page.viewportSize(), baseURL: origen, locale: 'es-ES', acceptDownloads: true,
  });
  const pagina = await mundo.contextoOtro.newPage();
  pagina.setDefaultTimeout(8000);
  pagina.on('pageerror', (e) => mundo.errores.push(`pageerror (otro dispositivo): ${e}`));
  await pagina.addInitScript(([d, p, email, k]) => {
    try {
      if (sessionStorage.getItem('e2e-init')) return;
      localStorage.setItem('cnl:test', '1');
      localStorage.setItem('cnl:test:opts', JSON.stringify({ sesion: true, usuario: email }));
      localStorage.setItem('cnl:lang', 'es');
      if (d) { // same account: same Drive and an already signed-in session
        localStorage.setItem(k, d);
        localStorage.setItem('cnl:user', p);
        sessionStorage.setItem('cnl:token', JSON.stringify({ fake: true }));
      }
      sessionStorage.setItem('e2e-init', '1');
    } catch (e) { /* ignore */ }
  }, [drive, perfil, usuario, CLAVE_DRIVE]);
  await pagina.goto('/');
  mundo.otraPagina = pagina;
}

After(async function () {
  await this.contextoOtro?.close();
});

When('abro la aplicación en otro dispositivo con la misma cuenta de Google', async function () {
  await abrirOtroDispositivo(this, { copiarDrive: true });
  await enOtroDispositivo(this, () => this.esperarShell());
});

When('otra persona abre la aplicación con su propia cuenta de Google', async function () {
  await abrirOtroDispositivo(this, { copiarDrive: false, usuario: 'otra.persona@club.test' });
});

When('en el otro dispositivo abro el módulo {string}', async function (modulo) {
  await enOtroDispositivo(this, () => this.irA(ruta(modulo)));
});

When('en el otro dispositivo doy de alta al nadador {string} {string}', async function (nombre, apellidos) {
  await enOtroDispositivo(this, async () => {
    await this.vista.getByRole('button', { name: 'Nuevo nadador' }).click();
    const modal = this.page.locator('.nad-modal');
    await modal.waitFor({ timeout: this.timeout });
    await modal.getByLabel('Nombre *').first().fill(nombre);
    await modal.getByLabel('Apellidos *').first().fill(apellidos);
    await modal.getByRole('button', { name: 'Guardar' }).click();
    await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Nadador guardado' }));
  });
});

Then('en el otro dispositivo veo en pantalla a alguien llamado {string}', async function (nombre) {
  await enOtroDispositivo(this, () => this.verVisible(this.vista.locator('tr.nad-row').filter({ hasText: nombre }), `No se ve a "${nombre}" en el otro dispositivo`));
});

Then('en el otro dispositivo no veo en pantalla a alguien llamado {string}', async function (nombre) {
  await enOtroDispositivo(this, async () => {
    await this.page.waitForTimeout(500);
    assert.equal(await this.page.locator('tr.nad-row').filter({ hasText: nombre }).count(), 0);
  });
});

Then('en el otro dispositivo veo el encabezado {string}', async function (texto) {
  await enOtroDispositivo(this, () => this.verVisible(this.page.getByRole('heading', { name: texto }), `No se ve el encabezado "${texto}"`));
});

Then('la sesión del otro dispositivo es la de la misma cuenta', async function () {
  const mia = (await this.page.locator('#user-box strong').innerText()).trim();
  const otra = await enOtroDispositivo(this, async () => (await this.page.locator('#user-box strong').innerText()).trim());
  assert.equal(otra, mia);
});

// The first device opens the app again after the other one saved: it receives the Drive as the other device left it.
When('vuelvo al primer dispositivo y lo abro de nuevo', async function () {
  const subido = (d) => Object.values(JSON.parse(d).clubs || {}).some((c) => ((c.doc.hojas || {}).Nadadores || []).some((n) => n.nombre === 'Itziar'));
  await this.eventually(async () => {
    const d = await this.otraPagina.evaluate((k) => localStorage.getItem(k), CLAVE_DRIVE);
    assert.ok(d && subido(d), 'El otro dispositivo aún no ha subido el cambio a Drive');
  });
  const drive = await this.otraPagina.evaluate((k) => localStorage.getItem(k), CLAVE_DRIVE);
  // Written by an init script (after the old page has unloaded), so the old page cannot overwrite it while closing.
  const nonce = String(Date.now());
  await this.page.addInitScript(([k, v, n]) => {
    try {
      if (sessionStorage.getItem('e2e-drive-sync') === n) return;
      localStorage.setItem(k, v);
      sessionStorage.setItem('e2e-drive-sync', n);
    } catch (e) { /* ignore */ }
  }, [CLAVE_DRIVE, drive, nonce]);
  await this.page.reload();
  await this.esperarShell();
});
