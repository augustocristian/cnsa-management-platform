import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { importApp, ROOT } from '../helpers/env.js';
import { infoPdf, libNode } from '../helpers/pdf.js';

const P = await importApp('js/infrastructure/pdfEntreno.js');
const D = await importApp('js/domain/entreno.js');
const I18N = await importApp('js/presentation/i18n/i18n.js');
const { guardarPdfEnDrive } = await importApp('js/infrastructure/driveEntrenos.js');
const { crearEtiquetasPdf } = await importApp('js/application/etiquetasPdf.js');

const lib = libNode();
const AHORA = new Date('2026-10-15T18:00:00');
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const lineas = D.renumerar([
  { set: 1, orden: 1, tiempoMin: 7, objetivo: 'Calentamiento', series: 1, distancia: 300, ejercicio: '100suave+100Lig+100prog' },
  { set: 1, orden: 2, tiempoMin: 6, series: 4, distancia: 50, ejercicio: '25tec/25N. 1xEstilo', notas: 'Contar brazadas p50' },
  { set: 2, orden: 1, tiempoMin: 12, objetivo: 'Piernas', series: 8, distancia: 50, salida: "C/1'10\"", ejercicio: 'Pn C', material: 'Tabla' },
  { set: 3, orden: 1, tiempoMin: 14, objetivo: 'Aerobico', series: 6, distancia: 100, salida: 'd/15"', ejercicio: 'C AeL ritmo uniforme' },
  { set: 3, orden: 2, tiempoMin: 10, bloque: 'Tec Prueba', series: 4, distancia: 100, ejercicio: '1C/1E/1C/1X c salida' },
  { set: 4, orden: 1, tiempoMin: 5, objetivo: 'vuelta a la calma', series: 1, distancia: 200, ejercicio: 'Suave' },
]);
const ficha = (extra = {}, ls = lineas) => ({
  club: { nombre: 'Club Natación Lugones', colorPrimario: '#4aa32a', colorSecundario: '#2f6f1a' },
  sesion: { fecha: '2026-10-15', hora: '19:50', titulo: 'Alevín - Aeróbico', grupo: 'Alevín', piscina: '50 m', tipoSesion: 'Aer+Ritmo', materialDia: 'JJDD', notasGenerales: 'Tabla: 200L-50E-100X-4x100L', descripcion: '', ...extra },
  sets: D.agruparSets(ls), totales: D.totales(ls),
});
// The adapter receives already translated labels (application/etiquetasPdf.js); the tests build them from the real dictionaries.
const etiquetas = (o = {}) => crearEtiquetasPdf({ t: I18N.t, locale: I18N.locale(), ahora: AHORA, ...o });
const generar = (fichas, o = {}) => P.generar(fichas, etiquetas(o), { lib });
const plano = (txt) => txt.replace(/\s+/g, ' ');
const compacto = (txt) => txt.replace(/\s+/g, '');

test('generates a valid one-page PDF with the key session data', async () => {
  I18N.setLang('es', { persist: false });
  const r = await generar([ficha()]);
  assert.ok(r.blob instanceof Blob);
  assert.equal(r.blob.type, 'application/pdf');
  const info = infoPdf(r.bytes);
  assert.match(info.cabecera, /^%PDF-/);
  assert.equal(info.paginas, 1);
  assert.equal(r.paginas, 1);
  const t = plano(info.texto);
  const c = compacto(info.texto); // the long text of a cell may be split across several lines
  for (const esperado of ['JUEVES','15/10/2026', '19:50', 'Alevín', 'Aer+Ritmo', 'JJDD', 'Tabla: 200L-50E-100X-4x100L', '50 m',
    'TIEMPO', 'OBJETIVO', 'BLOQUES', 'SERIES', 'DISTANCIA', 'SALIDA', 'EJERCICIO', 'MATERIAL', 'NOTAS',
    'Calentamiento', 'Piernas', 'Tec Prueba', "C/1'10\"", 'd/15"', '100suave+100Lig+100prog', 'Tabla',
    'TOTALES', 'Club Natación Lugones', 'Generado el 15/10/2026, 18:00', 'Página 1 de 1', 'Alevín - Aeróbico']) {
    assert.ok(c.includes(compacto(esperado)), `missing «${esperado}»`);
  }
  // totals: 7+6+12+14+10+5 = 54 min; 300+200+400+600+400+200 = 2100 m
  const tot = D.totales(lineas);
  assert.deepEqual([tot.metros, tot.tiempoMin], [2100, 54]);
  assert.match(t, /TOTALES 54/);
  assert.ok(t.includes('2100'));
  // Set distance of each set
  for (const s of ['500', '400', '1000']) assert.ok(t.includes(s), 'set dist. ' + s);
});

test('the example PDF of the club adds up to 3060 m and 88 min', async () => {
  const ls = D.renumerar([
    { set: 1, tiempoMin: 7, series: 1, distancia: 300 }, { set: 1, tiempoMin: 6, series: 4, distancia: 50 }, { set: 1, tiempoMin: 4, series: 2, distancia: 50 },
    { set: 1, tiempoMin: 6, series: 4, distancia: 50 }, { set: 2, tiempoMin: 12, series: 8, distancia: 50 }, { set: 3, tiempoMin: 14, series: 6, distancia: 100 },
    { set: 3, tiempoMin: 10, series: 4, distancia: 100 }, { set: 3, tiempoMin: 14, series: 6, distancia: 100 }, { set: 4, tiempoMin: 10, series: 4, distancia: 15 },
    { set: 5, tiempoMin: 5, series: 1, distancia: 200 },
  ]);
  const t = plano(infoPdf((await generar([ficha({}, ls)])).bytes).texto);
  assert.match(t, /TOTALES 88/);
  assert.ok(t.includes('3060'));
});

test('several sessions: one page per session and global numbering', async () => {
  const fs = [ficha({ fecha: '2026-10-13' }), ficha({ fecha: '2026-10-15' }), ficha({ fecha: '2026-10-17' })];
  const info = infoPdf((await generar(fs)).bytes);
  assert.equal(info.paginas, 3);
  assert.equal(info.textosPorPagina.length, 3);
  assert.ok(plano(info.textosPorPagina[0]).includes('MARTES'));
  assert.ok(plano(info.textosPorPagina[1]).includes('JUEVES'));
  assert.ok(plano(info.textosPorPagina[2]).includes('SÁBADO'));
  assert.ok(plano(info.textosPorPagina[2]).includes('Página 3 de 3'));
});

test('long session: several pages with repeated header and totals only at the end', async () => {
  const largo = D.renumerar(Array.from({ length: 70 }, (_, i) => ({ set: Math.floor(i / 5) + 1, orden: (i % 5) + 1, tiempoMin: 2, series: 2, distancia: 50, ejercicio: 'Fila número ' + (i + 1), notas: 'Nota de la fila ' + (i + 1) })));
  const r = await generar([ficha({}, largo)]);
  const info = infoPdf(r.bytes);
  assert.ok(info.paginas >= 3, 'pages: ' + info.paginas);
  info.textosPorPagina.forEach((tp, i) => {
    const t = plano(tp);
    assert.ok(t.includes('JUEVES'), 'repeated header on page ' + (i + 1));
    assert.ok(t.includes('TIEMPO'), 'repeated table header on page ' + (i + 1));
    assert.ok(t.includes(`Página ${i + 1} de ${info.paginas}`));
  });
  const ultima = plano(info.textosPorPagina.at(-1));
  assert.ok(ultima.includes('TOTALES'));
  assert.ok(!plano(info.textosPorPagina[0]).includes('TOTALES'));
  assert.ok(plano(info.texto).includes('Fila número 70'));
  assert.ok(plano(ultima).includes('7000'), '70 rows x 100 m = 7000 m in the totals');
});

test('texts in the active language (en/it); free content is not translated', async () => {
  I18N.setLang('en', { persist: false });
  let t = plano(infoPdf((await generar([ficha()], { locale: I18N.locale() })).bytes).texto);
  for (const e of ['THURSDAY', '15/10/2026', 'TOTALS', 'Page 1 of 1', 'Generated on', 'SESSION TYPE', 'POOL', 'EQUIPMENT OF THE DAY', 'Calentamiento']) assert.ok(t.includes(e), 'en: ' + e);
  I18N.setLang('it', { persist: false });
  t = plano(infoPdf((await generar([ficha()], { locale: I18N.locale() })).bytes).texto);
  for (const e of ['GIOVEDÌ', 'TOTALI', 'Pagina 1 di 1', 'Generato il', 'TIPO SESSIONE', 'PISCINA', 'Aer+Ritmo']) assert.ok(t.includes(e), 'it: ' + e);
  I18N.setLang('es', { persist: false });
});

test('session without a plan: the PDF warns and shows the description', async () => {
  const f = { ...ficha({ descripcion: 'Calentamiento 400 m y vuelta a la calma' }, []), sets: [] };
  const info = infoPdf((await generar([f])).bytes);
  assert.equal(info.paginas, 1);
  const t = plano(info.texto);
  assert.ok(t.includes('Esta sesión todavía no tiene plan detallado.'));
  assert.ok(t.includes('Calentamiento 400 m y vuelta a la calma'));
});

test('the club logo is embedded (PNG) and an invalid logo does not break generation', async () => {
  const conLogo = await generar([{ ...ficha(), club: { ...ficha().club, logo: PNG } }]);
  const crudo = Buffer.from(conLogo.bytes).toString('latin1');
  assert.ok(/\/Subtype\s*\/Image/.test(crudo), 'embedded image');
  const malo = await generar([{ ...ficha(), club: { ...ficha().club, logo: 'data:image/png;base64,@@@' } }]);
  assert.match(infoPdf(malo.bytes).cabecera, /^%PDF/);
  const svg = await generar([{ ...ficha(), club: { ...ficha().club, logo: 'data:image/svg+xml;base64,AAAA' } }]);
  assert.equal(infoPdf(svg.bytes).paginas, 1);
});

test('club colours: a light colour uses dark text and an invalid colour falls back to the default blue', async () => {
  for (const club of [{ nombre: 'X', colorPrimario: '#ffe600', colorSecundario: '#fff4a3' }, { nombre: 'X', colorPrimario: 'rojo', colorSecundario: '' }, {}]) {
    const r = await generar([{ ...ficha(), club }]);
    assert.equal(infoPdf(r.bytes).paginas, 1);
  }
});

test('characters outside Latin-1 are replaced and do not break the PDF', async () => {
  assert.equal(P.limpiar('Ñandú – 25m “crol” 😀 日本'), 'Ñandú – 25m “crol” ? ??');
  const r = await generar([ficha({ notasGenerales: 'Ritmo 😀 日本' })]);
  assert.equal(infoPdf(r.bytes).paginas, 1);
});

test('no sheets throws an error', async () => {
  await assert.rejects(() => generar([]), /sin-fichas/);
});

test('document metadata: title, author and creator', async () => {
  const crudo = Buffer.from((await generar([ficha()])).bytes).toString('latin1');
  assert.ok(crudo.includes('/Author (Club Natación Lugones)') || crudo.includes('/Author (Club Naci'));
  assert.ok(crudo.includes('/Creator (CNL Plataforma)'));
});

// ---------- Save to Drive ----------
function driveFalso({ existente = false } = {}) {
  const llamadas = [];
  return {
    llamadas,
    ensureFolderPath: async (p) => { llamadas.push(['ensureFolderPath', p]); return 'carpeta-entrenos'; },
    findFile: async (nombre, padre) => { llamadas.push(['findFile', nombre, padre]); return existente ? { id: 'previo', name: nombre } : null; },
    upload: async (o) => { llamadas.push(['upload', o]); return { id: o.id || 'nuevo', name: o.name }; },
    fileUrl: (id) => 'https://drive.google.com/file/d/' + id + '/view',
  };
}

test('guardarPdfEnDrive: creates cnl/entrenos and uploads the PDF', async () => {
  const drive = driveFalso();
  const blob = new Blob(['%PDF-1.3 test'], { type: 'application/pdf' });
  const r = await guardarPdfEnDrive({ drive, blob, nombre: 'Alevin-2026-10-15-jueves.pdf' });
  assert.deepEqual(r, { id: 'nuevo', name: 'Alevin-2026-10-15-jueves.pdf', actualizado: false, url: 'https://drive.google.com/file/d/nuevo/view' });
  assert.deepEqual(drive.llamadas[0], ['ensureFolderPath', ['entrenos']]);
  const sube = drive.llamadas.at(-1)[1];
  assert.equal(sube.mimeType, 'application/pdf');
  assert.equal(sube.parentId, 'carpeta-entrenos');
  assert.equal(sube.id, undefined);
  assert.equal(sube.body, blob);
});

test('guardarPdfEnDrive: if the file already exists it updates it without duplicating; incomplete data throws', async () => {
  const drive = driveFalso({ existente: true });
  const blob = new Blob(['x'], { type: 'application/pdf' });
  const r = await guardarPdfEnDrive({ drive, blob, nombre: 'a.pdf' });
  assert.equal(r.actualizado, true);
  assert.equal(drive.llamadas.at(-1)[1].id, 'previo');
  await assert.rejects(() => guardarPdfEnDrive({ drive, blob }), /datos-incompletos/);
  await assert.rejects(() => guardarPdfEnDrive({ blob, nombre: 'a.pdf' }), /datos-incompletos/);
  const roto = { ...driveFalso(), upload: async () => { throw Object.assign(new Error('x'), { status: 403 }); } };
  await assert.rejects(() => guardarPdfEnDrive({ drive: roto, blob, nombre: 'a.pdf' }), (e) => e.status === 403);
});

// ---------- i18n and dependencies ----------
test('entreno texts: es/en/it with the same keys and variables, no empty values', async () => {
  const [es, en, it] = await Promise.all(['es', 'en', 'it'].map(async (c) => (await importApp(`js/presentation/i18n/locales/entreno.${c}.js`)).default));
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [n, d] of [['en', en], ['it', it]]) {
    assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), [], 'missing in ' + n);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), [], 'orphans in ' + n);
    for (const k of Object.keys(es)) assert.equal(vars(d[k]), vars(es[k]), `${n}:${k}`);
  }
  for (const d of [es, en, it]) for (const [k, v] of Object.entries(d)) assert.ok(v.trim(), 'empty ' + k);
});

test('every entreno.* key used in the code exists in the dictionary', async () => {
  const es = (await importApp('js/presentation/i18n/locales/entreno.es.js')).default;
  const ficheros = [...readdirSync(path.join(ROOT, 'js/presentation/views')).filter((f) => /^entren/.test(f)).map((f) => 'js/presentation/views/' + f), 'js/application/etiquetasPdf.js', 'js/application/entrenamientosService.js', 'js/domain/entrenamientos.js'];
  const dinamicas = { 'entreno.av.': D_CODIGOS(), 'entreno.col.': ['tiempo', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'contenidos', 'dist-bloque', 'material', 'notas'], 'entreno.estilo.': ['crol', 'espalda', 'braza', 'mariposa', 'estilos'], 'entreno.pl.': D.PLANTILLAS.map((p) => p.id),
    'entreno.pdf.': ['dia', 'fecha', 'hora', 'grupo', 'tipo-sesion', 'piscina', 'material-dia', 'notas-generales', 'tiempo', 'objetivo', 'bloques', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'dist-set', 'material', 'notas', 'totales', 'sin-plan'] };
  const usadas = new Set();
  for (const f of ficheros) for (const m of readFileSync(path.join(ROOT, f), 'utf8').matchAll(/'(entreno\.[a-z0-9._-]+)'/g)) usadas.add(m[1]);
  for (const k of usadas) {
    if (k.endsWith('.')) { assert.ok(dinamicas[k], 'prefix without list: ' + k); for (const s of dinamicas[k]) assert.ok(es[k + s], 'missing ' + k + s); } else assert.ok(es[k], 'missing ' + k);
  }
  assert.ok(usadas.size > 40);
});

function D_CODIGOS() {
  return ['sin-lineas', 'series-no-numerica', 'distancia-no-numerica', 'tiempo-no-numerico', 'numero-negativo', 'salida-invalida', 'sin-distancia', 'distancia-difiere-carga', 'fuera-volumen-objetivo', 'tiempo-supera-duracion', 'sesion-inexistente', 'reparto-incompleto', 'reparto-excede', 'reparto-sin-distancia', 'estilo-incompleto', 'estilo-excede'];
}

test('jsPDF and jspdf-autotable are production dependencies and are copied to vendor/', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies.jspdf);
  assert.ok(pkg.dependencies['jspdf-autotable']);
  const vendor = readdirSync(path.join(ROOT, 'vendor'));
  assert.ok(vendor.includes('jspdf.umd.min.js'));
  assert.ok(vendor.includes('jspdf.plugin.autotable.min.js'));
  const vendorScript = readFileSync(path.join(ROOT, 'scripts/vendor.mjs'), 'utf8');
  assert.ok(vendorScript.includes('jspdf.umd.min.js') && vendorScript.includes('jspdf.plugin.autotable.min.js'));
  assert.equal(readFileSync(path.join(ROOT, 'vendor/jspdf.umd.min.js')).equals(readFileSync(path.join(ROOT, 'node_modules/jspdf/dist/jspdf.umd.min.js'))), true, 'vendor in sync with npm');
});

test('service worker: precaches the training plan modules and the PDF libraries', () => {
  const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of ['js/domain/entreno.js', 'js/domain/desglose.js', 'js/application/entrenoService.js', 'js/infrastructure/pdfEntreno.js', 'js/infrastructure/driveEntrenos.js', 'js/presentation/views/entreno-editor.js', 'js/presentation/views/entreno-acciones.js', 'js/presentation/views/entrenamientos.js', 'js/presentation/i18n/locales/entreno.es.js', 'js/presentation/i18n/locales/entreno.en.js', 'js/presentation/i18n/locales/entreno.it.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js']) {
    assert.ok(sw.includes('./' + f), 'sw.js lacks ' + f);
  }
});

// ---------- Contents per exercise and summary block ----------
const GD = await importApp('js/domain/desglose.js');
const comp = (contenido, metrosPorRep = null, modo = 'auto') => ({ contenido, metrosPorRep, modo });
const lineasMulti = D.renumerar([
  { set: 1, orden: 1, tiempoMin: 7, objetivo: 'Calentamiento', series: 1, distancia: 300, ejercicio: 'Suave' },
  { set: 2, orden: 1, tiempoMin: 20, series: 4, distancia: 100, ejercicio: '4x100 Crol. 75 AeL-25 Tope', componentes: [comp('Aeróbico ligero', 75), comp('Aláctico / Sprint', 25)], estilos: [{ estilo: 'Crol', metrosPorRep: null }] },
  { set: 2, orden: 2, tiempoMin: 8, series: 4, distancia: 50, ejercicio: 'Mixto', estilos: [{ estilo: 'Mariposa', metrosPorRep: 25 }, { estilo: 'Espalda', metrosPorRep: 25 }] },
]);
const fichaMulti = (extra = {}) => {
  const tipos = GD.catalogoBase();
  return { ...ficha({}, lineasMulti), tipos, desglose: GD.desgloseSesion(lineasMulti, { tipos }), ...extra };
};

test('PDF with contents: line «75 AeL + 25 Sprint · Crol» in the exercise and summary block with m and %', async () => {
  I18N.setLang('es', { persist: false });
  const r = await generar([fichaMulti()]);
  const info = infoPdf(r.bytes);
  assert.equal(info.paginas, 1);
  const t = plano(info.texto);
  const c = compacto(info.texto);
  assert.ok(c.includes(compacto('75 AeL + 25 Sprint')), 'contents of the row');
  assert.ok(c.includes('Crol'));
  assert.ok(c.includes('RESUMENDELASESIÓN'));
  assert.ok(c.includes('Volumentotal:'));
  assert.ok(c.includes('900m'), 'total session volume: 300 + 400 + 200');
  for (const e of ['POR CONTENIDO', 'POR ESTILO', 'Aeróbico ligero', 'Aláctico / Sprint', 'Sin contenido', 'Crol', 'Mariposa', 'Espalda', 'Sin estilo']) assert.ok(c.includes(compacto(e)), e);
  // metres and % of each content and stroke (the % add up to 100)
  for (const e of ['600 m', '66,7 %', '100 m', '11,1 %', '200 m', '22,2 %', '400 m', '44,5 %', '33,3 %']) assert.ok(t.includes(e), e);
  const d = GD.desgloseSesion(lineasMulti);
  assert.deepEqual(d.porContenido.map((x) => [x.contenido, x.metros, x.pct]), [['Aeróbico ligero', 600, 66.7], ['Aláctico / Sprint', 100, 11.1], ['', 200, 22.2]]);
  assert.equal(Math.round(d.porEstilo.reduce((s, x) => s + x.pct, 0) * 10) / 10, 100);
});

test('PDF with contents: translated labels (English) and injectable names', async () => {
  I18N.setLang('en', { persist: false });
  const r = await generar([fichaMulti()], { t: I18N.t, locale: 'en-GB' });
  const c = compacto(infoPdf(r.bytes).texto);
  for (const e of ['SESSION SUMMARY', 'Total volume:', 'BY CONTENT', 'BY STROKE', 'Freestyle', 'Butterfly', 'Backstroke', 'No stroke']) assert.ok(c.includes(compacto(e)), e);
  assert.ok(c.includes('66.7%') && c.includes('600m'), 'numbers in the language format');
  I18N.setLang('es', { persist: false });
  const inj = await generar([fichaMulti()], { nombreContenido: (it) => 'C-' + it.tipoId, nombreEstilo: (e) => 'E-' + e });
  const ci = compacto(infoPdf(inj.bytes).texto);
  assert.ok(ci.includes('C-tc-aerobico-ligero') && ci.includes('E-Crol'));
});

test('PDF without breakdown (old sheets) does not draw the summary; with many contents it is still valid', async () => {
  I18N.setLang('es', { persist: false });
  const sin = await generar([ficha()]);
  assert.ok(!compacto(infoPdf(sin.bytes).texto).includes('RESUMENDELASESIÓN'));
  const tipos = GD.catalogoBase();
  const muchas = D.renumerar(tipos.map((tp, i) => ({ set: 1, orden: i + 1, series: 2, distancia: 100, ejercicio: 'x' + i, componentes: [comp(tp.nombre)], estilos: [{ estilo: ['Crol', 'Espalda', 'Braza', 'Mariposa', 'Estilos', 'Tortuga'][i % 6], metrosPorRep: null }] })));
  const r = await generar([{ ...ficha({}, muchas), tipos, desglose: GD.desgloseSesion(muchas, { tipos }) }]);
  const info = infoPdf(r.bytes);
  assert.ok(info.paginas >= 1);
  const c = compacto(info.texto);
  assert.ok(c.includes('Tortuga') && c.includes('Virajes/volteos'));
});

// ---------- PdfPort: independent of i18n ----------
test('pdfEntreno.js does not import i18n nor read the clock: labels and date arrive as parameters', () => {
  const src = readFileSync(path.join(ROOT, 'js/infrastructure/pdfEntreno.js'), 'utf8');
  assert.ok(!/from '\.\.\/i18n\.js'/.test(src));
  assert.ok(!/new Date\(\)|Date\.now/.test(src));
  assert.equal(typeof P.pdfEntreno.generar, 'function');
});

test('generar requires labels and prints only the texts it receives', async () => {
  await assert.rejects(() => P.generar([ficha()], null, { lib }), /sin-etiquetas/);
  const e = etiquetas();
  e.totales = 'GRAND TOTAL';
  e.pagina = (n, total) => `P ${n}/${total}`;
  const t = plano(infoPdf((await P.generar([ficha()], e, { lib })).bytes).texto);
  assert.ok(t.includes('GRAND TOTAL') && t.includes('P 1/1'));
});

test('PDF labels: translated texts and parametrised functions', () => {
  I18N.setLang('es', { persist: false });
  const e = etiquetas();
  assert.equal(e.pagina(2, 5), 'Página 2 de 5');
  assert.equal(e.sets(3), '3 sets');
  assert.equal(e.cols.length, 11);
  assert.equal(e.nombreEstilo('Crol'), 'Crol');
  assert.equal(e.nombreEstilo(''), 'Sin estilo');
  assert.equal(e.nombreEstilo('Tortuga'), 'Tortuga');
  I18N.setLang('en', { persist: false });
  assert.equal(etiquetas().pagina(1, 1), 'Page 1 of 1');
  I18N.setLang('es', { persist: false });
});
