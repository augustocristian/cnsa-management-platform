import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { infoPdf } from '../../tests/helpers/pdf.js';
import { chooseInMenu, sessionForm } from './entrenamientos.steps.js';

// Fields of a plan row (keys are the UI labels). `chip` is the chip that opens the inline pane holding the input (none = visible in the first line).
const FIELDS = {
  Tiempo: { field: 'tiempoMin', chip: 'tiempoMin' },
  Objetivo: { field: 'objetivo', chip: 'objetivo' },
  Bloques: { field: 'bloque', chip: 'mas' },
  Series: { field: 'series' },
  Distancia: { field: 'distancia' },
  Salida: { field: 'salida', chip: 'salida' },
  Ejercicio: { field: 'ejercicio' },
  Material: { field: 'material', chip: 'material' },
  Notas: { field: 'notas', chip: 'mas' },
};
const SUMMARY = /\d+ m · \d+ min/;
const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const thisMonday = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoLocal(d);
};
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compact = (s) => String(s).replace(/\s+/g, '');
const PDF_ACTION = 'pdf';

// ---------- Locators ----------
const editor = (world) => world.page.locator('.enp-ov');
const planRow = (world, set, order) => editor(world).locator(`.enp-row[data-set="${set}"][data-orden="${order}"]`);
const rowField = (world, set, order, label) => {
  const def = FIELDS[label];
  assert.ok(def, `Unknown field: ${label}`);
  return planRow(world, set, order).locator(`[data-campo="${def.field}"]`);
};
// Same, but makes sure the pane that holds the input is open (on wide screens every pane is already visible)
async function visibleField(world, set, order, label) {
  const field = rowField(world, set, order, label);
  const def = FIELDS[label];
  if (def.chip && !(await field.isVisible()))
    await planRow(world, set, order).locator(`[data-chip="${def.chip}"]`).click();
  return field;
}
async function openDetails(world, selector) {
  await editor(world)
    .locator(selector)
    .evaluate((d) => {
      d.open = true;
    });
}
async function lastSet(world) {
  const sets = await editor(world)
    .locator('.enp-set')
    .evaluateAll((els) => els.map((e) => Number(e.dataset.set)));
  assert.ok(sets.length, 'The plan has no sets');
  return Math.max(...sets);
}
const totalMetres = async (world) => {
  const txt = await editor(world).locator('.enp-tot').innerText();
  const m = /Total: (\d+) m/.exec(txt);
  assert.ok(m, 'Unreadable total: ' + txt);
  return Number(m[1]);
};
// Opens the "more" menu of the bottom bar and clicks an item by id (pdf, previa, imprimir, drive, registrar, copiar)
const editorMenu = async (world, id) => {
  await editor(world).locator('.enp-barra-mas').click();
  await world.page.locator(`.enp-mn [data-accion="${id}"]`).click();
};

// First session of the group with a plan (today or later) in the visible week or the next ones.
async function findSession(world, group) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const rows = world.view
      .locator('.ent-day .ent-sess')
      .filter({ has: world.page.locator('.ent-meta .badge:first-child', { hasText: new RegExp(`^${esc(group)}$`) }) })
      .filter({ hasText: SUMMARY });
    if (await rows.count()) {
      const row = rows.first();
      const dayText = (await row.locator('xpath=ancestor::section[contains(@class,"ent-day")]//h2').innerText()).trim();
      const title = (await row.locator('.ent-title').innerText()).trim();
      world.ref = { group, title, dayText, day: stripAccents(dayText.split(/\s+/)[0]).toLowerCase() };
      return row;
    }
    await world.view.locator('[data-accion="semana-siguiente"]').click();
    await world.page.waitForTimeout(150);
  }
  throw new Error(`There is no session of the group ${group} with a plan in the coming weeks`);
}
async function referenceRow(world) {
  assert.ok(world.ref, 'There is no reference session');
  return world.view
    .locator('.ent-day')
    .filter({ has: world.page.locator('h2', { hasText: world.ref.dayText }) })
    .locator('.ent-sess')
    .filter({ hasText: world.ref.title })
    .first();
}
async function openPlan(world, row) {
  await row.locator('[data-accion="abrir-plan"]').click();
  await editor(world).locator('.enp-panel').waitFor({ timeout: world.timeout });
}

// Runs an action and captures the resulting download
async function capture(world, action) {
  const [dl] = await Promise.all([world.page.waitForEvent('download', { timeout: 20_000 }), action()]);
  const bytes = readFileSync(await dl.path());
  world.download = { name: dl.suggestedFilename(), bytes, info: infoPdf(bytes) };
}

// ---------- Open the plan and generate PDFs from the list ----------
When('I open the plan of the next session of the group {string}', async function (group) {
  await openPlan(this, await findSession(this, group));
});
When('I open the plan of the reference session', async function () {
  await openPlan(this, await referenceRow(this));
});
When('I open the plan of the session {string}', async function (title) {
  const row = this.view
    .locator('.ent-sess')
    .filter({ has: this.page.locator('.ent-title', { hasText: title }) })
    .first();
  await openPlan(this, row);
});
When('I generate the PDF of the next session of the group {string}', async function (group) {
  const row = await findSession(this, group);
  await capture(this, () => chooseInMenu(this, row, PDF_ACTION));
});
// If every session of the week lacks a plan the app asks before generating: accept it
When('I generate the PDF of the week', async function () {
  await capture(this, async () => {
    await this.view.locator('[data-accion="pdf-semana"]').click();
    const warning = this.page.locator('.modal').getByRole('button', { name: 'Aceptar' });
    if (
      await warning.waitFor({ state: 'visible', timeout: 1500 }).then(
        () => true,
        () => false,
      )
    )
      await warning.click();
  });
});
When('I duplicate the next session of the group {string}', async function (group) {
  const row = await findSession(this, group);
  await chooseInMenu(this, row, 'duplicar');
  await sessionForm(this).getByRole('button', { name: 'Guardar' }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Sesión guardada' }));
});

// ---------- Editor ----------
Then('the plan has at least {int} sets', async function (n) {
  await this.eventually(async () =>
    assert.ok((await editor(this).locator('.enp-set').count()) >= n, `Sets: fewer than ${n}`),
  );
});
Then('the plan total matches the sum of the sets', async function () {
  await this.eventually(async () => {
    const total = await totalMetres(this);
    const sets = await editor(this).locator('.enp-set-tot').allInnerTexts();
    const sum = sets.reduce((a, s) => a + Number(/^(\d+) m/.exec(s.trim())[1]), 0);
    assert.equal(sum, total);
    assert.ok(total > 0);
  });
});
When('I note the current plan total', async function () {
  this.previousTotal = await totalMetres(this);
});
Then('the plan total has changed', async function () {
  await this.eventually(async () => assert.notEqual(await totalMetres(this), this.previousTotal));
});
When('I put {string} in {string} of row {int} of set {int}', async function (value, label, row, set) {
  await (await visibleField(this, set, row, label)).fill(value);
});
When('I put {string} in {string} of row {int} of the last set', async function (value, label, row) {
  await (await visibleField(this, await lastSet(this), row, label)).fill(value);
});
When('I put {string} in {string} of the plan', async function (value, label) {
  await openDetails(this, 'details.enp-datos');
  await editor(this).locator('.enp-meta').getByLabel(label).fill(value);
});
Then('the plan field {string} is {string}', async function (label, value) {
  await openDetails(this, 'details.enp-datos');
  await this.eventually(async () =>
    assert.equal(await editor(this).locator('.enp-meta').getByLabel(label).inputValue(), value),
  );
});
Then('row {int} of set {int} has {string} in {string}', async function (row, set, value, label) {
  await this.eventually(async () => assert.equal(await rowField(this, set, row, label).inputValue(), value));
});
Then('the block distance of row {int} of set {int} is {string}', async function (row, set, value) {
  await this.eventually(async () =>
    assert.equal((await planRow(this, set, row).locator('output').innerText()).trim(), value),
  );
});
Then('the block distance of row {int} of the last set is {string}', async function (row, value) {
  const set = await lastSet(this);
  await this.eventually(async () =>
    assert.equal((await planRow(this, set, row).locator('output').innerText()).trim(), value),
  );
});
Then('set {int} adds up to {string}', async function (set, text) {
  await this.eventually(async () =>
    assert.ok((await editor(this).locator(`.enp-set[data-set="${set}"] .enp-set-tot`).innerText()).includes(text)),
  );
});
Then('the last set adds up to {string}', async function (text) {
  const set = await lastSet(this);
  await this.eventually(async () =>
    assert.ok((await editor(this).locator(`.enp-set[data-set="${set}"] .enp-set-tot`).innerText()).includes(text)),
  );
});
When('I add a set to the plan', async function () {
  const before = await editor(this).locator('.enp-set').count();
  await editor(this).getByRole('button', { name: 'Añadir set', exact: true }).click();
  await this.eventually(async () => assert.equal(await editor(this).locator('.enp-set').count(), before + 1));
});
When('I duplicate set {int} of the plan', async function (set) {
  await editor(this)
    .getByRole('button', { name: `Acciones del set ${set}`, exact: true })
    .click();
  await this.page.getByRole('menuitem', { name: `Duplicar el set ${set}`, exact: true }).click();
});
When('I remove row {int} of set {int}', async function (row, set) {
  await planRow(this, set, row)
    .getByRole('button', { name: `Acciones de la fila (Set ${set}, fila ${row})`, exact: true })
    .click();
  await this.page.getByRole('menuitem', { name: `Quitar fila (Set ${set}, fila ${row})`, exact: true }).click();
});
When('I leave the field {string} of row {int} of set {int}', async function (label, row, set) {
  await (await visibleField(this, set, row, label)).evaluate((el) => el.blur());
});
Then('row {int} of set {int} flags an error in {string}', async function (row, set, label) {
  await this.eventually(async () =>
    assert.equal(await rowField(this, set, row, label).getAttribute('aria-invalid'), 'true'),
  );
});
Then('I see the plan notice {string}', async function (text) {
  await this.expectVisible(
    editor(this).locator('.enp-avisos li', { hasText: text }),
    `There is no plan notice "${text}"`,
  );
});
When('I save the plan', async function () {
  await editor(this).getByRole('button', { name: 'Guardar', exact: true }).click();
  await this.expectVisible(this.page.locator('#toasts .toast', { hasText: 'Plan guardado' }));
});
When('I close the plan', async function () {
  await editor(this).locator('.enp-head .icon-btn').click();
});
When('I close the plan and discard the changes', async function () {
  await editor(this).locator('.enp-head .icon-btn').click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});
Then('the plan is still open', async function () {
  await this.expectVisible(editor(this).locator('.enp-panel'));
});
Then('the plan is closed', async function () {
  await this.expectHidden(editor(this).locator('.enp-panel'));
});
Then('I see the confirmation dialog {string}', async function (text) {
  await this.expectVisible(this.page.locator('.modal', { hasText: text }), `There is no dialog with "${text}"`);
});
When('I cancel the dialog', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
});
When('I accept the dialog', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});
When('I choose the template {string}', async function (name) {
  await openDetails(this, 'details.enp-tools-d');
  const sel = editor(this).locator('.enp-tools select').first();
  const options = (await sel.locator('option').allInnerTexts()).map((o) => o.trim());
  const label = options.find((o) => o.startsWith(name));
  assert.ok(label, `There is no template ${name}: ${options}`);
  await sel.selectOption({ label });
  await editor(this).getByRole('button', { name: 'Usar plantilla', exact: true }).click();
});
When('I copy the plan of the first available session', async function () {
  await openDetails(this, 'details.enp-tools-d');
  await editor(this).locator('.enp-tools select').nth(1).selectOption({ index: 0 });
  await editor(this).getByRole('button', { name: 'Copiar plan', exact: true }).click();
});
Then('the session {string} shows its metres and minutes summary', async function (title) {
  const row = this.view
    .locator('.ent-sess')
    .filter({ has: this.page.locator('.ent-title', { hasText: title }) })
    .first();
  await this.eventually(async () => assert.match(await row.innerText(), SUMMARY));
});
Then('there are {int} sessions equal to the reference one with a plan summary', async function (n) {
  await this.eventually(async () => {
    const rows = this.view
      .locator('.ent-day')
      .filter({ has: this.page.locator('h2', { hasText: this.ref.dayText }) })
      .locator('.ent-sess')
      .filter({ hasText: this.ref.title })
      .filter({ hasText: SUMMARY });
    assert.equal(await rows.count(), n);
  });
});

// ---------- Compact rows, bottom bar, unsaved changes ----------
Then('no plan row is taller than {int} px', async function (max) {
  const heights = await editor(this)
    .locator('.enp-row')
    .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.ok(heights.length > 0);
  assert.ok(
    heights.every((a) => a <= max),
    `Row heights: ${heights}`,
  );
});
Then('when the plan opens no field has the focus', async function () {
  const role = await this.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role'));
  assert.equal(role, 'dialog');
});
Then('the plan bottom bar shows the total, the main button {string} and the more actions menu', async function (save) {
  const bar = editor(this).locator('.enp-foot');
  await this.expectVisible(bar.locator('.enp-tot'));
  await this.expectVisible(bar.getByRole('button', { name: save, exact: true }));
  await this.expectVisible(bar.getByRole('button', { name: 'Más acciones', exact: true }));
  assert.equal(await bar.locator('.btn--primary').count(), 1);
});
Then('the plan bottom bar is inside the screen', async function () {
  const box = await editor(this).locator('.enp-foot').boundingBox();
  const height = this.page.viewportSize().height;
  assert.ok(box.y + box.height <= height + 1 && box.y >= 0, `Bar outside the screen: ${JSON.stringify(box)}`);
});
Then('the toast does not cover the plan bottom bar', async function () {
  const toast = this.page.locator('#toasts .toast').first();
  await this.expectVisible(toast);
  const t = await toast.boundingBox();
  const b = await editor(this).locator('.enp-foot').boundingBox();
  assert.ok(t.y + t.height <= b.y + 1, `The toast (${JSON.stringify(t)}) covers the bar (${JSON.stringify(b)})`);
});
Then('the plan says {string}', async function (text) {
  await this.expectVisible(editor(this).locator('.enp-estado', { hasText: text }));
});
When('I press the browser back button', async function () {
  await this.page.goBack().catch(() => null);
});
When('I open the chip {string} of row {int} of set {int}', async function (chip, row, set) {
  const key = { Salida: 'salida', Material: 'material', Objetivo: 'objetivo', Contenidos: 'contenidos' }[chip];
  assert.ok(key, 'Unknown chip ' + chip);
  const button = planRow(this, set, row).locator(`[data-chip="${key}"]`);
  if (await button.isVisible()) await button.click();
});
Then('the field {string} of row {int} of set {int} is visible', async function (label, row, set) {
  await this.expectVisible(rowField(this, set, row, label));
});

// ---------- Downloads ----------
When('I generate the PDF of the open plan', async function () {
  await capture(this, () => editorMenu(this, PDF_ACTION));
});
When('I try to generate the PDF of the open plan', async function () {
  this.hasDownload = false;
  this.page.once('download', () => {
    this.hasDownload = true;
  });
  await editorMenu(this, PDF_ACTION);
});
Then('no PDF is downloaded', async function () {
  await this.page.waitForTimeout(800);
  assert.equal(this.hasDownload, false);
});
Then('the PDF {string} is downloaded', async function (name) {
  assert.ok(this.download, 'Nothing has been downloaded');
  const expected = name.replace('{monday}', thisMonday()).replace('{today}', isoLocal(new Date()));
  assert.equal(this.download.name, expected);
});
Then('the PDF of the reference session is downloaded with the name {string}', async function (pattern) {
  assert.ok(this.download, 'Nothing has been downloaded');
  const re = new RegExp(
    '^' + esc(pattern).replace('YYYY-MM-DD', '\\d{4}-\\d{2}-\\d{2}').replace('weekday', esc(this.ref.day)) + '$',
  );
  assert.match(this.download.name, re);
});
Then('the PDF is valid and has {int} page(s)', async function (n) {
  assert.match(this.download.info.cabecera, /^%PDF-/);
  assert.equal(this.download.info.paginas, n);
});
Then('the PDF contains {string}', async function (text) {
  assert.ok(compact(this.download.info.texto).includes(compact(text)), `The PDF does not contain «${text}»`);
});
Then('the PDF has as many pages as sessions shown in the week', async function () {
  const txt = await this.view
    .getByText(/\d+ sesiones esta semana/)
    .first()
    .innerText();
  const n = Number(/(\d+) sesiones/.exec(txt)[1]);
  assert.ok(n > 0);
  assert.equal(this.download.info.paginas, n);
});

// ---------- Empty plan warning ----------
When('I open the plan of a session without a plan', async function () {
  await this.expectVisible(this.view.locator('.ent-sess').first());
  const row = this.view.locator('.ent-sess').filter({ hasNotText: SUMMARY }).first();
  this.ref = { title: (await row.locator('.ent-title').innerText()).trim() };
  await openPlan(this, row);
});
When('I generate the PDF of the open plan confirming the warning', async function () {
  await capture(this, async () => {
    await editorMenu(this, PDF_ACTION);
    await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
  });
});
When('I try to generate the PDF of the open plan and cancel the warning', async function () {
  this.hasDownload = false;
  this.page.once('download', () => {
    this.hasDownload = true;
  });
  await editorMenu(this, PDF_ACTION);
  await this.page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
});

// ---------- Share (touch devices), preview, print and Drive ----------
// The desktop profile has no touch pointer: the page is told it has one (the mobile profile already does).
Given('I use a touch device', async function () {
  await this.page.evaluate(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q) =>
      /pointer:\s*coarse/.test(q)
        ? {
            matches: true,
            media: q,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
          }
        : original(q);
  });
});
When('my device can share files', async function () {
  await this.page.evaluate(() => {
    window.__shared = [];
    Object.defineProperty(navigator, 'canShare', {
      value: (d) => !!(d && d.files && d.files.length),
      configurable: true,
    });
    Object.defineProperty(navigator, 'share', {
      value: async (d) => {
        window.__shared.push({ name: d.files[0].name, type: d.files[0].type, bytes: d.files[0].size });
      },
      configurable: true,
    });
  });
});
Then('the menu offers {string} and not {string}', async function (yes, no) {
  await editor(this).locator('.enp-barra-mas').click();
  await this.expectVisible(this.page.getByRole('menuitem', { name: yes, exact: true }));
  assert.equal(await this.page.getByRole('menuitem', { name: no, exact: true }).count(), 0);
  await this.page.keyboard.press('Escape');
});
When('I share the PDF of the open plan', async function () {
  await editorMenu(this, 'pdf');
});
Then('a PDF file whose name starts with {string} is shared', async function (pattern) {
  await this.eventually(async () => {
    const c = await this.page.evaluate(() => window.__shared || []);
    assert.equal(c.length, 1);
    assert.equal(c[0].type, 'application/pdf');
    assert.ok(c[0].bytes > 1000);
    assert.match(
      c[0].name,
      new RegExp('^' + esc(pattern).replace('YYYY-MM-DD', '\\d{4}-\\d{2}-\\d{2}') + '-.+\\.pdf$'),
    );
  });
});
When('I open the PDF preview', async function () {
  await editorMenu(this, 'previa');
});
Then('I see the PDF preview', async function () {
  const frame = this.page.locator('.enp-prev iframe.enp-frame');
  await this.expectVisible(frame, 'The preview is not visible');
  assert.match(await frame.getAttribute('src'), /^blob:/);
});
When('I close the preview', async function () {
  await this.page.locator('.enp-prev .btn--primary').click();
});
Then('I do not see the PDF preview', async function () {
  await this.expectHidden(this.page.locator('.enp-prev'));
});
// Opening a tab is observed through window.open (a PDF in a headless browser tab cannot be inspected)
When('I open the PDF preview on the phone', async function () {
  await this.page.evaluate(() => {
    window.__opened = [];
    window.open = (u) => {
      window.__opened.push(String(u));
      return {};
    };
  });
  await editorMenu(this, 'previa');
});
Then('the PDF opens in another tab and not in a frame of the page', async function () {
  await this.eventually(async () => {
    const opened = await this.page.evaluate(() => window.__opened || []);
    assert.equal(opened.length, 1);
    assert.match(opened[0], /^blob:/);
  });
  assert.equal(await this.page.locator('.enp-prev').count(), 0);
});
When('I press print in the plan', async function () {
  await editorMenu(this, 'imprimir');
});
Then('the PDF printing is prepared', async function () {
  await this.page.locator('iframe.enp-print').first().waitFor({ state: 'attached', timeout: this.timeout });
});
When('I save the PDF to Drive', async function () {
  await editorMenu(this, 'drive');
});
async function driveFiles(world) {
  return world.page.evaluate(() => ({
    files: window.__CNL_FAKE__.archivos(),
    folders: window.__CNL_FAKE__.estado().carpetas,
  }));
}
const refName = (world) =>
  new RegExp(`^${esc(stripAccents(world.ref.group))}-\\d{4}-\\d{2}-\\d{2}-${esc(world.ref.day)}\\.pdf$`);
Then('Drive contains the PDF of the reference session in the folder {string}', async function (path) {
  assert.equal(path, 'cnl/entrenos');
  await this.eventually(async () => {
    const { files, folders } = await driveFiles(this);
    const cnl = folders['root/cnl'];
    assert.ok(cnl, 'the cnl folder does not exist');
    const trainings = folders[`${cnl}/entrenos`];
    assert.ok(trainings, 'the cnl/entrenos folder does not exist');
    const f = files.find((a) => refName(this).test(a.name));
    assert.ok(f, 'there is no PDF in Drive: ' + files.map((a) => a.name));
    assert.equal(f.parentId, trainings);
    assert.equal(f.mimeType, 'application/pdf');
    assert.ok(f.contenido.blobSize > 1000, 'empty PDF');
  });
});
Then('Drive contains a single PDF of the reference session', async function () {
  const { files } = await driveFiles(this);
  assert.equal(files.filter((a) => refName(this).test(a.name)).length, 1);
});
Then('the menu option {string} is disabled and explains why', async function (_option) {
  await editor(this).locator('.enp-barra-mas').click();
  const item = this.page.locator('.enp-mn [data-accion="drive"]');
  await this.expectVisible(item);
  assert.equal(await item.getAttribute('aria-disabled'), 'true');
  await this.expectVisible(this.page.locator('.enp-mn-ayuda'));
  await this.page.keyboard.press('Escape');
});

// On a phone the account menu stays open after choosing a language and would cover the page
When('I close the account menu', async function () {
  const panel = this.page.locator('#account-panel');
  if (await panel.isVisible()) {
    await this.page.keyboard.press('Escape');
    await this.expectHidden(panel);
  }
});
