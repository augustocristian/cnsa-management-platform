import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { infoPdf } from '../../tests/helpers/pdf.js';

const CAMPOS = {
  'Tiempo': 'tiempoMin', 'Objetivo': 'objetivo', 'Bloques': 'bloque', 'Series': 'series', 'Distancia': 'distancia',
  'Salida': 'salida', 'Ejercicio': 'ejercicio', 'Material': 'material', 'Notas': 'notas',
};
const RESUMEN = /\d+ m · \d+ min/;
const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const pad = (n) => String(n).padStart(2, '0');
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lunesDeHoy = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoLocal(d); };
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const compacto = (s) => String(s).replace(/\s+/g, '');

// ---------- Localizadores ----------
const editor = (mundo) => mundo.page.locator('.enp-ov:not(.enp-prev-ov)');
const filaPlan = (mundo, set, orden) => editor(mundo).locator(`.enp-row[data-set="${set}"][data-orden="${orden}"]`);
const campoFila = (mundo, set, orden, etiqueta) => {
  const campo = CAMPOS[etiqueta];
  assert.ok(campo, `Campo desconocido: ${etiqueta}`);
  return filaPlan(mundo, set, orden).locator(`[data-campo="${campo}"]`);
};
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

// Busca la primera sesión del grupo con plan (hoy o futura) en la semana visible o en las siguientes.
async function localizarSesion(mundo, grupo) {
  for (let intento = 0; intento < 3; intento++) {
    const filas = mundo.vista.locator('.ent-day .ent-sess')
      .filter({ has: mundo.page.locator('.ent-meta .badge:first-child', { hasText: new RegExp(`^${esc(grupo)}$`) }) })
      .filter({ hasText: RESUMEN });
    if (await filas.count()) {
      const fila = filas.first();
      const dia = (await fila.locator('xpath=ancestor::div[contains(@class,"ent-day")]//h3').innerText()).trim();
      const titulo = (await fila.locator('.ent-title').innerText()).trim();
      mundo.ref = { grupo, titulo, diaTexto: dia, dia: sinTildes(dia.split(/\s+/)[0]).toLowerCase() };
      return fila;
    }
    await mundo.vista.locator('.ent-nav button', { hasText: '›' }).click();
    await mundo.page.waitForTimeout(150);
  }
  throw new Error(`No hay ninguna sesión del grupo ${grupo} con plan en las próximas semanas`);
}
async function filaDeReferencia(mundo) {
  assert.ok(mundo.ref, 'No hay sesión de referencia');
  return mundo.vista.locator('.ent-day').filter({ has: mundo.page.locator('h3', { hasText: mundo.ref.diaTexto }) })
    .locator('.ent-sess').filter({ hasText: mundo.ref.titulo }).first();
}
const botonFila = (fila, texto) => fila.locator('button', { hasText: new RegExp(`^\\s*${esc(texto)}\\s*$`) }).first();
async function abrirPlan(mundo, fila) {
  await botonFila(fila, 'Plan').click();
  await editor(mundo).locator('.enp-panel').waitFor({ timeout: mundo.timeout });
}

// Ejecuta una acción y captura la descarga resultante
async function capturar(mundo, accion) {
  const [dl] = await Promise.all([mundo.page.waitForEvent('download', { timeout: 20_000 }), accion()]);
  const bytes = readFileSync(await dl.path());
  mundo.descarga = { nombre: dl.suggestedFilename(), bytes, info: infoPdf(bytes) };
}

// ---------- Abrir el plan y generar PDF desde la lista ----------
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
  await capturar(this, () => botonFila(fila, 'PDF').click());
});
When('genero el PDF de la semana', async function () {
  await capturar(this, () => this.vista.getByRole('button', { name: 'Generar PDF de la semana' }).click());
});
When('duplico la próxima sesión del grupo {string}', async function (grupo) {
  const fila = await localizarSesion(this, grupo);
  await botonFila(fila, 'Duplicar').click();
  await this.page.locator('.ent-modal').getByRole('button', { name: 'Guardar' }).click();
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
  await campoFila(this, set, fila, etiqueta).fill(valor);
});
When('pongo {string} en {string} de la fila {int} del último set', async function (valor, etiqueta, fila) {
  await campoFila(this, await ultimoSet(this), fila, etiqueta).fill(valor);
});
When('pongo {string} en {string} del plan', async function (valor, etiqueta) {
  await editor(this).locator('.enp-meta').getByLabel(etiqueta).fill(valor);
});
Then('el campo {string} del plan vale {string}', async function (etiqueta, valor) {
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
  await editor(this).getByRole('button', { name: `Duplicar el set ${set}`, exact: true }).click();
});
When('quito la fila {int} del set {int}', async function (fila, set) {
  await editor(this).getByRole('button', { name: `Quitar fila (Set ${set}, fila ${fila})`, exact: true }).click();
});
When('salgo del campo {string} de la fila {int} del set {int}', async function (etiqueta, fila, set) {
  await campoFila(this, set, fila, etiqueta).evaluate((el) => el.blur());
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
When('elijo la plantilla {string}', async function (nombre) {
  const sel = editor(this).locator('.enp-tools select').first();
  const opciones = (await sel.locator('option').allInnerTexts()).map((o) => o.trim());
  const etiqueta = opciones.find((o) => o.startsWith(nombre));
  assert.ok(etiqueta, `No hay plantilla ${nombre}: ${opciones}`);
  await sel.selectOption({ label: etiqueta });
  await editor(this).getByRole('button', { name: 'Usar plantilla', exact: true }).click();
});
When('copio el plan de la primera sesión disponible', async function () {
  await editor(this).locator('.enp-tools select').nth(1).selectOption({ index: 0 });
  await editor(this).getByRole('button', { name: 'Copiar plan', exact: true }).click();
});
Then('la sesión {string} muestra su resumen de metros y minutos', async function (titulo) {
  const fila = this.vista.locator('.ent-sess').filter({ has: this.page.locator('.ent-title', { hasText: titulo }) }).first();
  await this.eventually(async () => assert.match(await fila.innerText(), RESUMEN));
});
Then('hay {int} sesiones iguales a la de referencia con resumen de plan', async function (n) {
  await this.eventually(async () => {
    const filas = this.vista.locator('.ent-day').filter({ has: this.page.locator('h3', { hasText: this.ref.diaTexto }) })
      .locator('.ent-sess').filter({ hasText: this.ref.titulo }).filter({ hasText: RESUMEN });
    assert.equal(await filas.count(), n);
  });
});

// ---------- Descargas ----------
When('genero el PDF del plan abierto', async function () {
  await capturar(this, () => editor(this).getByRole('button', { name: 'Generar PDF', exact: true }).click());
});
When('intento generar el PDF del plan abierto', async function () {
  this.hayDescarga = false;
  this.page.once('download', () => { this.hayDescarga = true; });
  await editor(this).getByRole('button', { name: 'Generar PDF', exact: true }).click();
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

// ---------- Vista previa, impresión y Drive ----------
When('abro la vista previa del PDF', async function () {
  await editor(this).getByRole('button', { name: 'Vista previa', exact: true }).click();
});
Then('veo la vista previa del PDF', async function () {
  const marco = this.page.locator('.enp-prev-ov iframe.enp-frame');
  await this.verVisible(marco, 'No se ve la vista previa');
  assert.match(await marco.getAttribute('src'), /^blob:/);
});
When('cierro la vista previa', async function () {
  await this.page.locator('.enp-prev-ov .btn-primary').click();
});
Then('no veo la vista previa del PDF', async function () {
  await this.noVer(this.page.locator('.enp-prev-ov'));
});
When('pulso imprimir en el plan', async function () {
  await editor(this).getByRole('button', { name: 'Imprimir', exact: true }).click();
});
Then('se prepara la impresión del PDF', async function () {
  await this.page.locator('iframe.enp-print').first().waitFor({ state: 'attached', timeout: this.timeout });
});
When('guardo el PDF en Drive', async function () {
  await editor(this).getByRole('button', { name: 'Guardar en Drive', exact: true }).click();
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
