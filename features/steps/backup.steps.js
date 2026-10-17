// Steps for the full backup (Settings > Backup). Downloads are captured with Playwright; data is inspected through the app's
// own store module (the same instance the page uses). Quoted texts are UI strings (Spanish).
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const count = (page, sheet) =>
  page.evaluate(async (h) => (await import('./js/composicion/store.js')).store.list(h).length, sheet);

async function download(world, password) {
  const page = world.page;
  if (password) {
    await page.locator('#backup-pass').fill(password);
    await page.locator('#backup-pass2').fill(password);
  }
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#backup-descargar').click()]);
  world.backup = { name: file.suggestedFilename(), text: await readFile(await file.path(), 'utf8') };
}

const choose = async (world, text, name = 'copia.json') => {
  await world.page
    .locator('#backup-archivo')
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text, 'utf8') });
};

Given('I am in the backup section', async function () {
  await this.goTo('club');
  await this.expectVisible(this.page.locator('#backup-panel'), 'The backup panel is not visible');
});

Given('I have downloaded a backup', async function () {
  await download(this);
});
When('I download the backup', async function () {
  await download(this);
});
When('I download the backup with the password {string}', async function (password) {
  await download(this, password);
});

Then('the downloaded file is a valid backup with {int} swimmers', async function (n) {
  const doc = JSON.parse(this.backup.text);
  assert.equal(doc.format, 'cnl-backup');
  assert.equal(doc.formatVersion, 1);
  assert.equal(doc.sheets.Nadadores.length, n);
  assert.equal(doc.counts.Nadadores, n);
  assert.match(doc.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.ok(doc.club.name);
  assert.ok(
    doc.sheets.Entrenamientos.length > 0 && doc.sheets.Marcas.length > 0,
    'The backup must include all the sheets',
  );
});

Then('the downloaded file name starts with {string}', async function (prefix) {
  assert.ok(this.backup.name.startsWith(prefix), this.backup.name);
  assert.match(this.backup.name, /\d{4}-\d{2}-\d{2}-\d{4}(-encrypted)?\.json$/);
});

Then('the downloaded file is encrypted and does not contain the swimmers names', async function () {
  const doc = JSON.parse(this.backup.text);
  assert.equal(doc.format, 'cnl-backup-encrypted');
  assert.equal(doc.kdf, 'PBKDF2-SHA256');
  assert.ok(!this.backup.text.includes('Lucía'));
});

When('I delete all the swimmers of the club', async function () {
  await this.page.evaluate(async () => {
    const { store } = await import('./js/composicion/store.js');
    store.removeMany(
      'Nadadores',
      store.list('Nadadores').map((n) => n.id),
    );
  });
  assert.equal(await count(this.page, 'Nadadores'), 0);
});

When('I set the club motto to {string}', async function (motto) {
  await this.page.evaluate(async (l) => {
    (await import('./js/composicion/store.js')).store.setClub({ lema: l });
  }, motto);
});

When('I choose the downloaded backup file to restore', async function () {
  await choose(this, this.backup.text, this.backup.name);
});
When('I choose to restore the downloaded backup but tampered with', async function () {
  const doc = JSON.parse(this.backup.text);
  doc.sheets.Nadadores[0].nombre = 'Nombre manipulado';
  await choose(this, JSON.stringify(doc));
});
When('I choose to restore a file that is not a backup', async function () {
  await choose(this, '{"hola":"mundo"}', 'otro.json');
});

Then('I see the preview with {int} new swimmers', async function (n) {
  const row = this.page
    .locator('#backup-tabla tbody tr')
    .filter({ has: this.page.locator('td', { hasText: /^Nadadores$/ }) });
  await this.expectVisible(row, 'The Nadadores row is not visible in the preview');
  await this.eventually(async () =>
    assert.equal((await row.first().locator('td').nth(3).innerText()).trim(), String(n)),
  );
});

Then('the default restore mode is {string}', async function (mode) {
  const checked = this.page.locator('input[name="backup-modo"]:checked');
  assert.equal(
    await checked.evaluate((el) => el.closest('label').querySelector('.backup-mode-name').textContent),
    mode,
  );
});

When('I confirm the restore by typing the club name', async function () {
  await this.page.locator('#backup-restaurar').click();
  const name = await this.page.evaluate(async () => (await import('./js/composicion/store.js')).store.club.nombre);
  await this.page.locator('#backup-confirmar-texto').fill(name);
  await this.page.locator('.sheet').getByRole('button', { name: 'Restaurar ahora' }).click();
});

When('I try to confirm the restore by typing {string}', async function (text) {
  await this.page.locator('#backup-restaurar').click();
  await this.page.locator('#backup-confirmar-texto').fill(text);
  await this.page.locator('.sheet').getByRole('button', { name: 'Restaurar ahora' }).click();
});

Then('the club has {int} swimmers', async function (n) {
  await this.eventually(async () => assert.equal(await count(this.page, 'Nadadores'), n));
});

Then('the club motto is {string}', async function (motto) {
  await this.eventually(async () =>
    assert.equal(
      await this.page.evaluate(async () => (await import('./js/composicion/store.js')).store.club.lema),
      motto,
    ),
  );
});

Then('I see the restore summary', async function () {
  await this.expectVisible(this.page.locator('#backup-exito'), 'The restore summary is not visible');
});

Then('there is an automatic prior backup in the Drive backups folder', async function () {
  await this.eventually(async () => {
    const d = await this.drive();
    assert.ok(
      d.files.some((a) => /-restore-\d{14}\.json$/.test(a.name)),
      'There is no pre-restore backup in Drive',
    );
  });
});

When('I type the password {string} to open the backup', async function (password) {
  await this.page.locator('#backup-pass-abrir').fill(password);
  await this.page.locator('#backup-desbloquear').click();
});

Then('I am asked for the backup password', async function () {
  await this.expectVisible(this.page.locator('#backup-pass-abrir'), 'The password is not requested');
});

Then('I do not see the restore button of the backup', async function () {
  await this.expectHidden(this.page.locator('#backup-restaurar'), 'The restore button should not be visible');
});
Then('I see the restore button of the backup', async function () {
  await this.expectVisible(this.page.locator('#backup-restaurar'), 'The restore button is not visible');
});

Given('there is a daily backup of the club in the Drive backups folder', async function () {
  await this.page.evaluate(async () => {
    const { store } = await import('./js/composicion/store.js');
    const { drive } = await import('./js/infrastructure/drive.js');
    await drive.backupClub(store.clubRef.name, store.documento(), { fecha: new Date(2026, 9, 14, 9, 0, 0) });
  });
});

When('I refresh the list of backups in Drive', async function () {
  await this.page.locator('#backup-drive-actualizar').click();
});

Then('the list of backups in Drive has {int} backup(s)', async function (n) {
  await this.eventually(async () => assert.equal(await this.page.locator('#backup-drive-tabla tbody tr').count(), n));
});

Then('the Drive backup says {string}', async function (text) {
  await this.eventually(async () =>
    assert.match(await this.page.locator('#backup-drive-tabla tbody tr').first().innerText(), new RegExp(text)),
  );
});

When('I press Restore on the first Drive backup', async function () {
  await this.page
    .locator('#backup-drive-tabla tbody tr')
    .first()
    .getByRole('button', { name: /^Restaurar/ })
    .click();
});

Then('the backups in Drive appear disabled with an explanation', async function () {
  await this.expectVisible(
    this.page.locator('#backup-drive-demo'),
    'It is not explained why there are no backups in Drive',
  );
  assert.equal(await this.page.locator('#backup-drive-actualizar').isDisabled(), true);
});
