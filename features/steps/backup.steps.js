// Steps for the full backup (Settings > Backup). Downloads are captured with Playwright; data is inspected through the app's
// own store module (the same instance the page uses). Quoted texts are UI strings (Spanish).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const contar = (page, hoja) => page.evaluate(async (h) => (await import('./js/store.js')).store.list(h).length, hoja);

async function descargar(mundo, contrasena) {
  const page = mundo.page;
  if (contrasena) {
    await page.locator('#backup-pass').fill(contrasena);
    await page.locator('#backup-pass2').fill(contrasena);
  }
  const [descarga] = await Promise.all([page.waitForEvent('download'), page.locator('#backup-descargar').click()]);
  mundo.copia = { nombre: descarga.suggestedFilename(), texto: await readFile(await descarga.path(), 'utf8') };
}

const elegir = async (mundo, texto, nombre = 'copia.json') => {
  await mundo.page.locator('#backup-archivo').setInputFiles({ name: nombre, mimeType: 'application/json', buffer: Buffer.from(texto, 'utf8') });
};

Given('que estoy en la sección de copia de seguridad', async function () {
  await this.irA('club');
  await this.verVisible(this.page.locator('#backup-panel'), 'No se ve el panel de copia de seguridad');
});

Given('he descargado una copia de seguridad', async function () { await descargar(this); });
When('descargo la copia de seguridad', async function () { await descargar(this); });
When('descargo la copia de seguridad con la contraseña {string}', async function (clave) { await descargar(this, clave); });

Then('el fichero descargado es una copia de seguridad válida con {int} nadadores', async function (n) {
  const doc = JSON.parse(this.copia.texto);
  assert.equal(doc.format, 'cnl-backup');
  assert.equal(doc.formatVersion, 1);
  assert.equal(doc.sheets.Nadadores.length, n);
  assert.equal(doc.counts.Nadadores, n);
  assert.match(doc.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.ok(doc.club.name);
  assert.ok(doc.sheets.Entrenamientos.length > 0 && doc.sheets.Marcas.length > 0, 'La copia debe incluir todas las hojas');
});

Then('el nombre del fichero descargado empieza por {string}', async function (prefijo) {
  assert.ok(this.copia.nombre.startsWith(prefijo), this.copia.nombre);
  assert.match(this.copia.nombre, /\d{4}-\d{2}-\d{2}-\d{4}(-encrypted)?\.json$/);
});

Then('el fichero descargado está cifrado y no contiene los nombres de los nadadores', async function () {
  const doc = JSON.parse(this.copia.texto);
  assert.equal(doc.format, 'cnl-backup-encrypted');
  assert.equal(doc.kdf, 'PBKDF2-SHA256');
  assert.ok(!this.copia.texto.includes('Lucía'));
});

When('elimino todos los nadadores del club', async function () {
  await this.page.evaluate(async () => { const { store } = await import('./js/store.js'); store.removeMany('Nadadores', store.list('Nadadores').map((n) => n.id)); });
  assert.equal(await contar(this.page, 'Nadadores'), 0);
});

When('cambio el lema del club a {string}', async function (lema) {
  await this.page.evaluate(async (l) => { (await import('./js/store.js')).store.setClub({ lema: l }); }, lema);
});

When('elijo el archivo de la copia descargada para restaurar', async function () { await elegir(this, this.copia.texto, this.copia.nombre); });
When('elijo para restaurar la copia descargada pero alterada', async function () {
  const doc = JSON.parse(this.copia.texto);
  doc.sheets.Nadadores[0].nombre = 'Nombre manipulado';
  await elegir(this, JSON.stringify(doc));
});
When('elijo para restaurar un archivo que no es una copia', async function () { await elegir(this, '{"hola":"mundo"}', 'otro.json'); });

Then('veo la vista previa con {int} nadadores nuevos', async function (n) {
  const fila = this.page.locator('#backup-tabla tbody tr').filter({ has: this.page.locator('td', { hasText: /^Nadadores$/ }) });
  await this.verVisible(fila, 'No se ve la fila de Nadadores en la vista previa');
  await this.eventually(async () => assert.equal((await fila.first().locator('td').nth(3).innerText()).trim(), String(n)));
});

Then('el modo de restauración por defecto es {string}', async function (modo) {
  const marcado = this.page.locator('input[name="backup-modo"]:checked');
  assert.equal(await marcado.evaluate((el) => el.closest('label').querySelector('.backup-mode-name').textContent), modo);
});

When('confirmo la restauración escribiendo el nombre del club', async function () {
  await this.page.locator('#backup-restaurar').click();
  const nombre = await this.page.evaluate(async () => (await import('./js/store.js')).store.club.nombre);
  await this.page.locator('#backup-confirmar-texto').fill(nombre);
  await this.page.locator('.sheet').getByRole('button', { name: 'Restaurar ahora' }).click();
});

When('intento confirmar la restauración escribiendo {string}', async function (texto) {
  await this.page.locator('#backup-restaurar').click();
  await this.page.locator('#backup-confirmar-texto').fill(texto);
  await this.page.locator('.sheet').getByRole('button', { name: 'Restaurar ahora' }).click();
});

Then('el club tiene {int} nadadores', async function (n) {
  await this.eventually(async () => assert.equal(await contar(this.page, 'Nadadores'), n));
});

Then('el lema del club es {string}', async function (lema) {
  await this.eventually(async () => assert.equal(await this.page.evaluate(async () => (await import('./js/store.js')).store.club.lema), lema));
});

Then('veo el resumen de la restauración', async function () { await this.verVisible(this.page.locator('#backup-exito'), 'No se ve el resumen de la restauración'); });

Then('hay una copia previa automática en la carpeta de copias de Drive', async function () {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(d.archivos.some((a) => /-restore-\d{14}\.json$/.test(a.name)), 'No hay copia previa a la restauración en Drive');
  });
});

When('escribo la contraseña {string} para abrir la copia', async function (clave) {
  await this.page.locator('#backup-pass-abrir').fill(clave);
  await this.page.locator('#backup-desbloquear').click();
});

Then('se me pide la contraseña de la copia', async function () { await this.verVisible(this.page.locator('#backup-pass-abrir'), 'No se pide la contraseña'); });

Then('no veo el botón de restaurar de la copia', async function () { await this.noVer(this.page.locator('#backup-restaurar'), 'El botón de restaurar no debería verse'); });
Then('veo el botón de restaurar de la copia', async function () { await this.verVisible(this.page.locator('#backup-restaurar'), 'No se ve el botón de restaurar'); });

Given('hay una copia diaria del club en la carpeta de copias de Drive', async function () {
  await this.page.evaluate(async () => {
    const { store } = await import('./js/store.js');
    const { drive } = await import('./js/drive.js');
    await drive.backupClub(store.clubRef.name, store.documento(), { fecha: new Date(2026, 9, 14, 9, 0, 0) });
  });
});

When('actualizo la lista de copias en Drive', async function () { await this.page.locator('#backup-drive-actualizar').click(); });

Then('la lista de copias en Drive tiene {int} copia', async function (n) {
  await this.eventually(async () => assert.equal(await this.page.locator('#backup-drive-tabla tbody tr').count(), n));
});

Then('la copia de Drive indica {string}', async function (texto) {
  await this.eventually(async () => assert.match(await this.page.locator('#backup-drive-tabla tbody tr').first().innerText(), new RegExp(texto)));
});

When('pulso Restaurar en la primera copia de Drive', async function () {
  await this.page.locator('#backup-drive-tabla tbody tr').first().getByRole('button', { name: /^Restaurar/ }).click();
});

Then('las copias en Drive aparecen desactivadas con una explicación', async function () {
  await this.verVisible(this.page.locator('#backup-drive-demo'), 'No se explica por qué no hay copias en Drive');
  assert.equal(await this.page.locator('#backup-drive-actualizar').isDisabled(), true);
});
