import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { infoPdf } from '../../tests/helpers/pdf.js';
import { elegirEnMenu, formulario } from './entrenamientos.steps.js';

// Fields of a plan row. `chip` is the chip that opens the inline pane holding the input (none = visible in the first line).
const CAMPOS = {
  'Tiempo': { campo: 'tiempoMin', chip: 'tiempoMin' }, 'Objetivo': { campo: 'objetivo', chip: 'objetivo' }, 'Bloques': { campo: 'bloque', chip: 'mas' },
  'Series': { campo: 'series' }, 'Distancia': { campo: 'distancia' }, 'Salida': { campo: 'salida', chip: 'salida' },
  'Ejercicio': { campo: 'ejercicio' }, 'Material': { campo: 'material', chip: 'material' }, 'Notas': { campo: 'notas', chip: 'mas' },
};
const RESUMEN = /\d+ m · \d+ min/;
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lunesDeHoy = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoLocal(d); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compacto = (s) => String(s).replace(/\s+/g, '');
const ACCION_PDF = 'pdf';

// ---------- Locators ----------
const editor = (mundo) => mundo.page.locator('.enp-ov');
const filaPlan = (mundo, set, orden) => editor(mundo).locator(`.enp-row[data-set="${set}"][data-orden="${orden}"]`);
const campoFila = (mundo, set, orden, etiqueta) => {
  const def = CAMPOS[etiqueta];
  assert.ok(def, `Campo desconocido: ${etiqueta}`);
  return filaPlan(mundo, set, orden).locator(`[data-campo="${def.campo}"]`);
};
// Same, but makes sure the pane that holds the input is open (on wide screens every pane is already visible)
async function campoVisible(mundo, set, orden, etiqueta) {
  const campo = campoFila(mundo, set, orden, etiqueta);
  const def = CAMPOS[etiqueta];
  if (def.chip && !(await campo.isVisible())) await filaPlan(mundo, set, orden).locator(`[data-chip="${def.chip}"]`).click();
  return campo;
}
async function abrirDetalle(mundo, selector) {
  await editor(mundo).locator(selector).evaluate((d) => { d.open = true; });
}
async function ultimoSet(mundo) {
  const sets = await editor(mundo).locator('.enp-set').evaluateAll((els) => els.map((e) => Number(e.dataset.set)));
  assert.ok(sets.length, 'El plan no tiene sets');
  return Math.max(...sets);
}
const metrosTotales = async (mundo) => {
  const txt = await editor(mundo).locator('.enp-tot').innerText();
  const m = /Total: (\d+) m/.exec(txt);
  assert.ok(m, 'Total ilegible: ' + txt);
  return Number(m[1]);
};
// Opens the "more" menu of the bottom bar and clicks an item by id (pdf, previa, imprimir, drive, registrar, copiar)
const menuEditor = async (mundo, id) => {
  await editor(mundo).locator('.enp-barra-mas').click();
  await mundo.page.locator(`.enp-mn [data-accion="${id}"]`).click();
};

// First session of the group with a plan (today or later) in the visible week or the next ones.
async function localizarSesion(mundo, grupo) {
  for (let intento = 0; intento < 3; intento++) {
    const filas = mundo.vista.locator('.ent-day .ent-sess')
      .filter({ has: mundo.page.locator('.ent-meta .badge:first-child', { hasText: new RegExp(`^${esc(grupo)}$`) }) })
      .filter({ hasText: RESUMEN });
    if (await filas.count()) {
      const fila = filas.first();
      const dia = (await fila.locator('xpath=ancestor::section[contains(@class,"ent-day")]//h2').innerText()).trim();
      const titulo = (await fila.locator('.ent-title').innerText()).trim();
      mundo.ref = { grupo, titulo, diaTexto: dia, dia: sinTildes(dia.split(/\s+/)[0]).toLowerCase() };
      return fila;
    }
    await mundo.vista.locator('[data-accion="semana-siguiente"]').click();
    await mundo.page.waitForTimeout(150);
  }
  throw new Error(`No hay ninguna sesión del grupo ${grupo} con plan en las próximas semanas`);
}
async function filaDeReferencia(mundo) {
  assert.ok(mundo.ref, 'No hay sesión de referencia');
  return mundo.vista.locator('.ent-day').filter({ has: mundo.page.locator('h2', { hasText: mundo.ref.diaTexto }) })
    .locator('.ent-sess').filter({ hasText: mundo.ref.titulo }).first();
}
async function abrirPlan(mundo, fila) {
  await fila.locator('[data-accion="abrir-plan"]').click();
  await editor(mundo).locator('.enp-panel').waitFor({ timeout: mundo.timeout });
}

// Runs an action and captures the resulting download
async function capturar(mundo, accion) {
  const [dl] = await Promise.all([mundo.page.waitForEvent('download', { timeout: 20_000 }), accion()]);
  const bytes = readFileSync(await dl.path());
  mundo.descarga = { nombre: dl.suggestedFilename(), bytes, info: infoPdf(bytes) };
}

// ---------- Open the plan and generate PDFs from the list ----------
When('abro el plan de la próxima sesión del grupo {string}', async function (grupo) {
  await abrirPlan(this, await localizarSesion(this, grupo));
});
When('abro el plan de la sesión de referencia', async function () {
  await abrirPlan(this, await filaDeReferencia(this));
});
When('abro el plan de la sesión {string}', async function (titulo) {
  const fila = this.vista.locator('.ent-sess').filter({ has: this.page.locator('.ent-title', { hasText: titulo }) }).first();
  await abrirPlan(this, fila);
});
When('genero el PDF de la próxima sesión del grupo {string}', async function (grupo) {
  const fila = await localizarSesion(this, grupo);
  await capturar(this, () => elegirEnMenu(this, fila, ACCION_PDF));
});
// If every session of the week lacks a plan the app asks before generating: accept it
When('genero el PDF de la semana', async function () {
  await capturar(this, async () => {
    await this.vista.locator('[data-accion="pdf-semana"]').click();
    const aviso = this.page.locator('.modal').getByRole('button', { name: 'Aceptar' });
    if (await aviso.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false)) await aviso.click();
  });
});
When('duplico la próxima sesión del grupo {string}', async function (grupo) {
  const fila = await localizarSesion(this, grupo);
  await elegirEnMenu(this, fila, 'duplicar');
  await formulario(this).getByRole('button', { name: 'Guardar' }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Sesión guardada' }));
});

// ---------- Editor ----------
Then('el plan tiene al menos {int} sets', async function (n) {
  await this.eventually(async () => assert.ok((await editor(this).locator('.enp-set').count()) >= n, `Sets: menos de ${n}`));
});
Then('el total del plan coincide con la suma de los sets', async function () {
  await this.eventually(async () => {
    const total = await metrosTotales(this);
    const sets = await editor(this).locator('.enp-set-tot').allInnerTexts();
    const suma = sets.reduce((a, s) => a + Number(/^(\d+) m/.exec(s.trim())[1]), 0);
    assert.equal(suma, total);
    assert.ok(total > 0);
  });
});
When('anoto el total actual del plan', async function () { this.totalPrevio = await metrosTotales(this); });
Then('el total del plan ha cambiado', async function () {
  await this.eventually(async () => assert.notEqual(await metrosTotales(this), this.totalPrevio));
});
When('pongo {string} en {string} de la fila {int} del set {int}', async function (valor, etiqueta, fila, set) {
  await (await campoVisible(this, set, fila, etiqueta)).fill(valor);
});
When('pongo {string} en {string} de la fila {int} del último set', async function (valor, etiqueta, fila) {
  await (await campoVisible(this, await ultimoSet(this), fila, etiqueta)).fill(valor);
});
When('pongo {string} en {string} del plan', async function (valor, etiqueta) {
  await abrirDetalle(this, 'details.enp-datos');
  await editor(this).locator('.enp-meta').getByLabel(etiqueta).fill(valor);
});
Then('el campo {string} del plan vale {string}', async function (etiqueta, valor) {
  await abrirDetalle(this, 'details.enp-datos');
  await this.eventually(async () => assert.equal(await editor(this).locator('.enp-meta').getByLabel(etiqueta).inputValue(), valor));
});
Then('la fila {int} del set {int} tiene {string} en {string}', async function (fila, set, valor, etiqueta) {
  await this.eventually(async () => assert.equal(await campoFila(this, set, fila, etiqueta).inputValue(), valor));
});
Then('la distancia del bloque de la fila {int} del set {int} es {string}', async function (fila, set, valor) {
  await this.eventually(async () => assert.equal((await filaPlan(this, set, fila).locator('output').innerText()).trim(), valor));
});
Then('la distancia del bloque de la fila {int} del último set es {string}', async function (fila, valor) {
  const set = await ultimoSet(this);
  await this.eventually(async () => assert.equal((await filaPlan(this, set, fila).locator('output').innerText()).trim(), valor));
});
Then('el set {int} suma {string}', async function (set, texto) {
  await this.eventually(async () => assert.ok((await editor(this).locator(`.enp-set[data-set="${set}"] .enp-set-tot`).innerText()).includes(texto)));
});
Then('el último set suma {string}', async function (texto) {
  const set = await ultimoSet(this);
  await this.eventually(async () => assert.ok((await editor(this).locator(`.enp-set[data-set="${set}"] .enp-set-tot`).innerText()).includes(texto)));
});
When('añado un set al plan', async function () {
  const antes = await editor(this).locator('.enp-set').count();
  await editor(this).getByRole('button', { name: 'Añadir set', exact: true }).click();
  await this.eventually(async () => assert.equal(await editor(this).locator('.enp-set').count(), antes + 1));
});
When('duplico el set {int} del plan', async function (set) {
  await editor(this).getByRole('button', { name: `Acciones del set ${set}`, exact: true }).click();
  await this.page.getByRole('menuitem', { name: `Duplicar el set ${set}`, exact: true }).click();
});
When('quito la fila {int} del set {int}', async function (fila, set) {
  await filaPlan(this, set, fila).getByRole('button', { name: `Acciones de la fila (Set ${set}, fila ${fila})`, exact: true }).click();
  await this.page.getByRole('menuitem', { name: `Quitar fila (Set ${set}, fila ${fila})`, exact: true }).click();
});
When('salgo del campo {string} de la fila {int} del set {int}', async function (etiqueta, fila, set) {
  await (await campoVisible(this, set, fila, etiqueta)).evaluate((el) => el.blur());
});
Then('la fila {int} del set {int} marca error en {string}', async function (fila, set, etiqueta) {
  await this.eventually(async () => assert.equal(await campoFila(this, set, fila, etiqueta).getAttribute('aria-invalid'), 'true'));
});
Then('veo el aviso del plan {string}', async function (texto) {
  await this.verVisible(editor(this).locator('.enp-avisos li', { hasText: texto }), `No hay aviso del plan "${texto}"`);
});
When('guardo el plan', async function () {
  await editor(this).getByRole('button', { name: 'Guardar', exact: true }).click();
  await this.verVisible(this.page.locator('#toasts .toast', { hasText: 'Plan guardado' }));
});
When('cierro el plan', async function () {
  await editor(this).locator('.enp-head .icon-btn').click();
});
When('cierro el plan y descarto los cambios', async function () {
  await editor(this).locator('.enp-head .icon-btn').click();
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});
Then('el plan sigue abierto', async function () { await this.verVisible(editor(this).locator('.enp-panel')); });
Then('el plan está cerrado', async function () { await this.noVer(editor(this).locator('.enp-panel')); });
Then('veo el diálogo de confirmación {string}', async function (texto) {
  await this.verVisible(this.page.locator('.modal', { hasText: texto }), `No hay diálogo con "${texto}"`);
});
When('cancelo el diálogo', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
});
When('acepto el diálogo', async function () {
  await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
});
When('elijo la plantilla {string}', async function (nombre) {
  await abrirDetalle(this, 'details.enp-tools-d');
  const sel = editor(this).locator('.enp-tools select').first();
  const opciones = (await sel.locator('option').allInnerTexts()).map((o) => o.trim());
  const etiqueta = opciones.find((o) => o.startsWith(nombre));
  assert.ok(etiqueta, `No hay plantilla ${nombre}: ${opciones}`);
  await sel.selectOption({ label: etiqueta });
  await editor(this).getByRole('button', { name: 'Usar plantilla', exact: true }).click();
});
When('copio el plan de la primera sesión disponible', async function () {
  await abrirDetalle(this, 'details.enp-tools-d');
  await editor(this).locator('.enp-tools select').nth(1).selectOption({ index: 0 });
  await editor(this).getByRole('button', { name: 'Copiar plan', exact: true }).click();
});
Then('la sesión {string} muestra su resumen de metros y minutos', async function (titulo) {
  const fila = this.vista.locator('.ent-sess').filter({ has: this.page.locator('.ent-title', { hasText: titulo }) }).first();
  await this.eventually(async () => assert.match(await fila.innerText(), RESUMEN));
});
Then('hay {int} sesiones iguales a la de referencia con resumen de plan', async function (n) {
  await this.eventually(async () => {
    const filas = this.vista.locator('.ent-day').filter({ has: this.page.locator('h2', { hasText: this.ref.diaTexto }) })
      .locator('.ent-sess').filter({ hasText: this.ref.titulo }).filter({ hasText: RESUMEN });
    assert.equal(await filas.count(), n);
  });
});

// ---------- Compact rows, bottom bar, unsaved changes ----------
Then('ninguna fila del plan ocupa más de {int} px de alto', async function (max) {
  const altos = await editor(this).locator('.enp-row').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
  assert.ok(altos.length > 0);
  assert.ok(altos.every((a) => a <= max), `Alturas de fila: ${altos}`);
});
Then('al abrir el plan no hay ningún campo con el foco', async function () {
  const rol = await this.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('role'));
  assert.equal(rol, 'dialog');
});
Then('la barra inferior del plan muestra el total, el botón principal {string} y el menú de más acciones', async function (guardar) {
  const barra = editor(this).locator('.enp-foot');
  await this.verVisible(barra.locator('.enp-tot'));
  await this.verVisible(barra.getByRole('button', { name: guardar, exact: true }));
  await this.verVisible(barra.getByRole('button', { name: 'Más acciones', exact: true }));
  assert.equal(await barra.locator('.btn--primary').count(), 1);
});
Then('la barra inferior del plan está dentro de la pantalla', async function () {
  const caja = await editor(this).locator('.enp-foot').boundingBox();
  const alto = this.page.viewportSize().height;
  assert.ok(caja.y + caja.height <= alto + 1 && caja.y >= 0, `Barra fuera de pantalla: ${JSON.stringify(caja)}`);
});
Then('el aviso no tapa la barra inferior del plan', async function () {
  const toast = this.page.locator('#toasts .toast').first();
  await this.verVisible(toast);
  const t = await toast.boundingBox();
  const b = await editor(this).locator('.enp-foot').boundingBox();
  assert.ok(t.y + t.height <= b.y + 1, `El aviso (${JSON.stringify(t)}) tapa la barra (${JSON.stringify(b)})`);
});
Then('el plan indica {string}', async function (texto) {
  await this.verVisible(editor(this).locator('.enp-estado', { hasText: texto }));
});
When('pulso volver atrás del navegador', async function () {
  await this.page.goBack().catch(() => null);
});
When('abro el chip {string} de la fila {int} del set {int}', async function (chip, fila, set) {
  const clave = { Salida: 'salida', Material: 'material', Objetivo: 'objetivo', Contenidos: 'contenidos' }[chip];
  assert.ok(clave, 'Chip desconocido ' + chip);
  const boton = filaPlan(this, set, fila).locator(`[data-chip="${clave}"]`);
  if (await boton.isVisible()) await boton.click();
});
Then('el campo {string} de la fila {int} del set {int} es visible', async function (etiqueta, fila, set) {
  await this.verVisible(campoFila(this, set, fila, etiqueta));
});

// ---------- Downloads ----------
When('genero el PDF del plan abierto', async function () {
  await capturar(this, () => menuEditor(this, ACCION_PDF));
});
When('intento generar el PDF del plan abierto', async function () {
  this.hayDescarga = false;
  this.page.once('download', () => { this.hayDescarga = true; });
  await menuEditor(this, ACCION_PDF);
});
Then('no se descarga ningún PDF', async function () {
  await this.page.waitForTimeout(800);
  assert.equal(this.hayDescarga, false);
});
Then('se descarga el PDF {string}', async function (nombre) {
  assert.ok(this.descarga, 'No se ha descargado nada');
  const esperado = nombre.replace('{lunes}', lunesDeHoy()).replace('{hoy}', isoLocal(new Date()));
  assert.equal(this.descarga.nombre, esperado);
});
Then('se descarga el PDF de la sesión de referencia con el nombre {string}', async function (patron) {
  assert.ok(this.descarga, 'No se ha descargado nada');
  const re = new RegExp('^' + esc(patron).replace('AAAA-MM-DD', '\\d{4}-\\d{2}-\\d{2}').replace('día', esc(this.ref.dia)) + '$');
  assert.match(this.descarga.nombre, re);
});
Then('el PDF es válido y tiene {int} página(s)', async function (n) {
  assert.match(this.descarga.info.cabecera, /^%PDF-/);
  assert.equal(this.descarga.info.paginas, n);
});
Then('el PDF contiene {string}', async function (texto) {
  assert.ok(compacto(this.descarga.info.texto).includes(compacto(texto)), `El PDF no contiene «${texto}»`);
});
Then('el PDF tiene tantas páginas como sesiones se ven en la semana', async function () {
  const txt = await this.vista.getByText(/\d+ sesiones esta semana/).first().innerText();
  const n = Number(/(\d+) sesiones/.exec(txt)[1]);
  assert.ok(n > 0);
  assert.equal(this.descarga.info.paginas, n);
});

// ---------- Empty plan warning ----------
When('abro el plan de una sesión sin plan', async function () {
  await this.verVisible(this.vista.locator('.ent-sess').first());
  const fila = this.vista.locator('.ent-sess').filter({ hasNotText: RESUMEN }).first();
  this.ref = { titulo: (await fila.locator('.ent-title').innerText()).trim() };
  await abrirPlan(this, fila);
});
When('genero el PDF del plan abierto confirmando el aviso', async function () {
  await capturar(this, async () => {
    await menuEditor(this, ACCION_PDF);
    await this.page.locator('.modal').getByRole('button', { name: 'Aceptar' }).click();
  });
});
When('intento generar el PDF del plan abierto y cancelo el aviso', async function () {
  this.hayDescarga = false;
  this.page.once('download', () => { this.hayDescarga = true; });
  await menuEditor(this, ACCION_PDF);
  await this.page.locator('.modal').getByRole('button', { name: 'Cancelar' }).click();
});

// ---------- Share (touch devices), preview, print and Drive ----------
// The desktop profile has no touch pointer: the page is told it has one (the mobile profile already does).
Given('que uso un dispositivo táctil', async function () {
  await this.page.evaluate(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = (q) => (/pointer:\s*coarse/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } : original(q));
  });
});
When('mi dispositivo permite compartir archivos', async function () {
  await this.page.evaluate(() => {
    window.__compartido = [];
    Object.defineProperty(navigator, 'canShare', { value: (d) => !!(d && d.files && d.files.length), configurable: true });
    Object.defineProperty(navigator, 'share', { value: async (d) => { window.__compartido.push({ nombre: d.files[0].name, tipo: d.files[0].type, bytes: d.files[0].size }); }, configurable: true });
  });
});
Then('el menú ofrece {string} y no {string}', async function (si, no) {
  await editor(this).locator('.enp-barra-mas').click();
  await this.verVisible(this.page.getByRole('menuitem', { name: si, exact: true }));
  assert.equal(await this.page.getByRole('menuitem', { name: no, exact: true }).count(), 0);
  await this.page.keyboard.press('Escape');
});
When('comparto el PDF del plan abierto', async function () {
  await menuEditor(this, 'pdf');
});
Then('se comparte un archivo PDF cuyo nombre empieza por {string}', async function (patron) {
  await this.eventually(async () => {
    const c = await this.page.evaluate(() => window.__compartido || []);
    assert.equal(c.length, 1);
    assert.equal(c[0].tipo, 'application/pdf');
    assert.ok(c[0].bytes > 1000);
    assert.match(c[0].nombre, new RegExp('^' + esc(patron).replace('AAAA-MM-DD', '\\d{4}-\\d{2}-\\d{2}') + '-.+\\.pdf$'));
  });
});
When('abro la vista previa del PDF', async function () {
  await menuEditor(this, 'previa');
});
Then('veo la vista previa del PDF', async function () {
  const marco = this.page.locator('.enp-prev iframe.enp-frame');
  await this.verVisible(marco, 'No se ve la vista previa');
  assert.match(await marco.getAttribute('src'), /^blob:/);
});
When('cierro la vista previa', async function () {
  await this.page.locator('.enp-prev .btn--primary').click();
});
Then('no veo la vista previa del PDF', async function () {
  await this.noVer(this.page.locator('.enp-prev'));
});
// Opening a tab is observed through window.open (a PDF in a headless browser tab cannot be inspected)
When('abro la vista previa del PDF en el móvil', async function () {
  await this.page.evaluate(() => { window.__abiertas = []; window.open = (u) => { window.__abiertas.push(String(u)); return {}; }; });
  await menuEditor(this, 'previa');
});
Then('el PDF se abre en otra pestaña y no en un marco de la página', async function () {
  await this.eventually(async () => {
    const abiertas = await this.page.evaluate(() => window.__abiertas || []);
    assert.equal(abiertas.length, 1);
    assert.match(abiertas[0], /^blob:/);
  });
  assert.equal(await this.page.locator('.enp-prev').count(), 0);
});
When('pulso imprimir en el plan', async function () {
  await menuEditor(this, 'imprimir');
});
Then('se prepara la impresión del PDF', async function () {
  await this.page.locator('iframe.enp-print').first().waitFor({ state: 'attached', timeout: this.timeout });
});
When('guardo el PDF en Drive', async function () {
  await menuEditor(this, 'drive');
});
async function archivosDrive(mundo) {
  return mundo.page.evaluate(() => ({ archivos: window.__CNL_FAKE__.archivos(), carpetas: window.__CNL_FAKE__.estado().carpetas }));
}
const nombreRef = (mundo) => new RegExp(`^${esc(sinTildes(mundo.ref.grupo))}-\\d{4}-\\d{2}-\\d{2}-${esc(mundo.ref.dia)}\\.pdf$`);
Then('Drive contiene el PDF de la sesión de referencia en la carpeta {string}', async function (ruta) {
  assert.equal(ruta, 'cnl/entrenos');
  await this.eventually(async () => {
    const { archivos, carpetas } = await archivosDrive(this);
    const cnl = carpetas['root/cnl'];
    assert.ok(cnl, 'no existe la carpeta cnl');
    const entrenos = carpetas[`${cnl}/entrenos`];
    assert.ok(entrenos, 'no existe la carpeta cnl/entrenos');
    const f = archivos.find((a) => nombreRef(this).test(a.name));
    assert.ok(f, 'no hay PDF en Drive: ' + archivos.map((a) => a.name));
    assert.equal(f.parentId, entrenos);
    assert.equal(f.mimeType, 'application/pdf');
    assert.ok(f.contenido.blobSize > 1000, 'PDF vacío');
  });
});
Then('Drive contiene un solo PDF de la sesión de referencia', async function () {
  const { archivos } = await archivosDrive(this);
  assert.equal(archivos.filter((a) => nombreRef(this).test(a.name)).length, 1);
});
Then('la opción {string} del menú está desactivada y explica el motivo', async function (opcion) {
  await editor(this).locator('.enp-barra-mas').click();
  const item = this.page.locator('.enp-mn [data-accion="drive"]');
  await this.verVisible(item);
  assert.equal(await item.getAttribute('aria-disabled'), 'true');
  await this.verVisible(this.page.locator('.enp-mn-ayuda'));
  await this.page.keyboard.press('Escape');
});

// On a phone the account menu stays open after choosing a language and would cover the page
When('cierro el menú de la cuenta', async function () {
  const panel = this.page.locator('#account-panel');
  if (await panel.isVisible()) {
    await this.page.keyboard.press('Escape');
    await this.noVer(panel);
  }
});
