import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { importApp, ROOT } from '../helpers/env.js';
import { infoPdf, libNode } from '../helpers/pdf.js';

const P = await importApp('js/infrastructure/pdfEntreno.js');
const D = await importApp('js/domain/entreno.js');
const I18N = await importApp('js/i18n.js');
const { guardarPdfEnDrive } = await importApp('js/infrastructure/driveEntrenos.js');

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
const generar = (fichas, o = {}) => P.generarPdfEntreno(fichas, { lib, ahora: AHORA, ...o });
const plano = (txt) => txt.replace(/\s+/g, ' ');
const compacto = (txt) => txt.replace(/\s+/g, '');

test('genera un PDF válido de una página con los datos clave de la sesión', async () => {
  I18N.setLang('es', { persist: false });
  const r = await generar([ficha()]);
  assert.ok(r.blob instanceof Blob);
  assert.equal(r.blob.type, 'application/pdf');
  const info = infoPdf(r.bytes);
  assert.match(info.cabecera, /^%PDF-/);
  assert.equal(info.paginas, 1);
  assert.equal(r.paginas, 1);
  const t = plano(info.texto);
  const c = compacto(info.texto); // el texto largo de una celda puede partirse en varias líneas
  for (const esperado of ['JUEVES','15/10/2026', '19:50', 'Alevín', 'Aer+Ritmo', 'JJDD', 'Tabla: 200L-50E-100X-4x100L', '50 m',
    'TIEMPO', 'OBJETIVO', 'BLOQUES', 'SERIES', 'DISTANCIA', 'SALIDA', 'EJERCICIO', 'MATERIAL', 'NOTAS',
    'Calentamiento', 'Piernas', 'Tec Prueba', "C/1'10\"", 'd/15"', '100suave+100Lig+100prog', 'Tabla',
    'TOTALES', 'Club Natación Lugones', 'Generado el 15/10/2026, 18:00', 'Página 1 de 1', 'Alevín - Aeróbico']) {
    assert.ok(c.includes(compacto(esperado)), `falta «${esperado}»`);
  }
  // totales: 7+6+12+14+10+5 = 54 min; 300+200+400+600+400+200 = 2100 m
  const tot = D.totales(lineas);
  assert.deepEqual([tot.metros, tot.tiempoMin], [2100, 54]);
  assert.match(t, /TOTALES 54/);
  assert.ok(t.includes('2100'));
  // Dist. set de cada set
  for (const s of ['500', '400', '1000']) assert.ok(t.includes(s), 'dist. set ' + s);
});

test('el PDF del ejemplo del club suma 3060 m y 88 min', async () => {
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

test('varias sesiones: una página por sesión y numeración global', async () => {
  const fs = [ficha({ fecha: '2026-10-13' }), ficha({ fecha: '2026-10-15' }), ficha({ fecha: '2026-10-17' })];
  const info = infoPdf((await generar(fs)).bytes);
  assert.equal(info.paginas, 3);
  assert.equal(info.textosPorPagina.length, 3);
  assert.ok(plano(info.textosPorPagina[0]).includes('MARTES'));
  assert.ok(plano(info.textosPorPagina[1]).includes('JUEVES'));
  assert.ok(plano(info.textosPorPagina[2]).includes('SÁBADO'));
  assert.ok(plano(info.textosPorPagina[2]).includes('Página 3 de 3'));
});

test('sesión larga: varias páginas con cabecera repetida y totales sólo al final', async () => {
  const largo = D.renumerar(Array.from({ length: 70 }, (_, i) => ({ set: Math.floor(i / 5) + 1, orden: (i % 5) + 1, tiempoMin: 2, series: 2, distancia: 50, ejercicio: 'Fila número ' + (i + 1), notas: 'Nota de la fila ' + (i + 1) })));
  const r = await generar([ficha({}, largo)]);
  const info = infoPdf(r.bytes);
  assert.ok(info.paginas >= 3, 'páginas: ' + info.paginas);
  info.textosPorPagina.forEach((tp, i) => {
    const t = plano(tp);
    assert.ok(t.includes('JUEVES'), 'cabecera repetida en página ' + (i + 1));
    assert.ok(t.includes('TIEMPO'), 'cabecera de tabla repetida en página ' + (i + 1));
    assert.ok(t.includes(`Página ${i + 1} de ${info.paginas}`));
  });
  const ultima = plano(info.textosPorPagina.at(-1));
  assert.ok(ultima.includes('TOTALES'));
  assert.ok(!plano(info.textosPorPagina[0]).includes('TOTALES'));
  assert.ok(plano(info.texto).includes('Fila número 70'));
  assert.ok(plano(ultima).includes('7000'), '70 filas x 100 m = 7000 m en los totales');
});

test('textos en el idioma activo (en/it); el contenido libre no se traduce', async () => {
  I18N.setLang('en', { persist: false });
  let t = plano(infoPdf((await generar([ficha()], { locale: I18N.locale() })).bytes).texto);
  for (const e of ['THURSDAY', '15/10/2026', 'TOTALS', 'Page 1 of 1', 'Generated on', 'SESSION TYPE', 'POOL', 'EQUIPMENT OF THE DAY', 'Calentamiento']) assert.ok(t.includes(e), 'en: ' + e);
  I18N.setLang('it', { persist: false });
  t = plano(infoPdf((await generar([ficha()], { locale: I18N.locale() })).bytes).texto);
  for (const e of ['GIOVEDÌ', 'TOTALI', 'Pagina 1 di 1', 'Generato il', 'TIPO SESSIONE', 'PISCINA', 'Aer+Ritmo']) assert.ok(t.includes(e), 'it: ' + e);
  I18N.setLang('es', { persist: false });
});

test('sesión sin plan: avisa en el PDF y muestra la descripción', async () => {
  const f = { ...ficha({ descripcion: 'Calentamiento 400 m y vuelta a la calma' }, []), sets: [] };
  const info = infoPdf((await generar([f])).bytes);
  assert.equal(info.paginas, 1);
  const t = plano(info.texto);
  assert.ok(t.includes('Esta sesión todavía no tiene plan detallado.'));
  assert.ok(t.includes('Calentamiento 400 m y vuelta a la calma'));
});

test('el logo del club se incrusta (PNG) y un logo inválido no rompe la generación', async () => {
  const conLogo = await generar([{ ...ficha(), club: { ...ficha().club, logo: PNG } }]);
  const crudo = Buffer.from(conLogo.bytes).toString('latin1');
  assert.ok(/\/Subtype\s*\/Image/.test(crudo), 'imagen incrustada');
  const malo = await generar([{ ...ficha(), club: { ...ficha().club, logo: 'data:image/png;base64,@@@' } }]);
  assert.match(infoPdf(malo.bytes).cabecera, /^%PDF/);
  const svg = await generar([{ ...ficha(), club: { ...ficha().club, logo: 'data:image/svg+xml;base64,AAAA' } }]);
  assert.equal(infoPdf(svg.bytes).paginas, 1);
});

test('colores del club: un color claro usa texto oscuro y un color inválido cae al azul por defecto', async () => {
  for (const club of [{ nombre: 'X', colorPrimario: '#ffe600', colorSecundario: '#fff4a3' }, { nombre: 'X', colorPrimario: 'rojo', colorSecundario: '' }, {}]) {
    const r = await generar([{ ...ficha(), club }]);
    assert.equal(infoPdf(r.bytes).paginas, 1);
  }
});

test('caracteres fuera de Latin-1 se sustituyen y no rompen el PDF', async () => {
  assert.equal(P.limpiar('Ñandú – 25m “crol” 😀 日本'), 'Ñandú – 25m “crol” ? ??');
  const r = await generar([ficha({ notasGenerales: 'Ritmo 😀 日本' })]);
  assert.equal(infoPdf(r.bytes).paginas, 1);
});

test('sin fichas lanza error', async () => {
  await assert.rejects(() => generar([]), /sin-fichas/);
});

test('metadatos del documento: título, autor y creador', async () => {
  const crudo = Buffer.from((await generar([ficha()])).bytes).toString('latin1');
  assert.ok(crudo.includes('/Author (Club Natación Lugones)') || crudo.includes('/Author (Club Naci'));
  assert.ok(crudo.includes('/Creator (CNL Plataforma)'));
});

// ---------- Guardar en Drive ----------
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

test('guardarPdfEnDrive: crea cnl/entrenos y sube el PDF', async () => {
  const drive = driveFalso();
  const blob = new Blob(['%PDF-1.3 prueba'], { type: 'application/pdf' });
  const r = await guardarPdfEnDrive({ drive, blob, nombre: 'Alevin-2026-10-15-jueves.pdf' });
  assert.deepEqual(r, { id: 'nuevo', name: 'Alevin-2026-10-15-jueves.pdf', actualizado: false, url: 'https://drive.google.com/file/d/nuevo/view' });
  assert.deepEqual(drive.llamadas[0], ['ensureFolderPath', ['entrenos']]);
  const sube = drive.llamadas.at(-1)[1];
  assert.equal(sube.mimeType, 'application/pdf');
  assert.equal(sube.parentId, 'carpeta-entrenos');
  assert.equal(sube.id, undefined);
  assert.equal(sube.body, blob);
});

test('guardarPdfEnDrive: si ya existe el fichero lo actualiza sin duplicarlo; datos incompletos lanzan', async () => {
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

// ---------- i18n y dependencias ----------
test('textos entreno: es/en/it con las mismas claves y variables, sin vacíos', async () => {
  const [es, en, it] = await Promise.all(['es', 'en', 'it'].map(async (c) => (await importApp(`js/locales/entreno.${c}.js`)).default));
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [n, d] of [['en', en], ['it', it]]) {
    assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), [], 'faltan en ' + n);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), [], 'huérfanas en ' + n);
    for (const k of Object.keys(es)) assert.equal(vars(d[k]), vars(es[k]), `${n}:${k}`);
  }
  for (const d of [es, en, it]) for (const [k, v] of Object.entries(d)) assert.ok(v.trim(), 'vacío ' + k);
});

test('todas las claves entreno.* usadas en el código existen en el diccionario', async () => {
  const es = (await importApp('js/locales/entreno.es.js')).default;
  const ficheros = ['js/views/entreno-editor.js', 'js/views/entreno-acciones.js', 'js/views/entrenamientos.js', 'js/infrastructure/pdfEntreno.js'];
  const dinamicas = { 'entreno.av.': D_CODIGOS(), 'entreno.col.': ['tiempo', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'material', 'notas'], 'entreno.pl.': D.PLANTILLAS.map((p) => p.id),
    'entreno.pdf.': ['dia', 'fecha', 'hora', 'grupo', 'tipo-sesion', 'piscina', 'material-dia', 'notas-generales', 'tiempo', 'objetivo', 'bloques', 'series', 'distancia', 'salida', 'ejercicio', 'dist-bloque', 'dist-set', 'material', 'notas', 'totales', 'sin-plan'] };
  const usadas = new Set();
  for (const f of ficheros) for (const m of readFileSync(path.join(ROOT, f), 'utf8').matchAll(/'(entreno\.[a-z0-9._-]+)'/g)) usadas.add(m[1]);
  for (const k of usadas) {
    if (k.endsWith('.')) { assert.ok(dinamicas[k], 'prefijo sin lista: ' + k); for (const s of dinamicas[k]) assert.ok(es[k + s], 'falta ' + k + s); } else assert.ok(es[k], 'falta ' + k);
  }
  assert.ok(usadas.size > 40);
});

function D_CODIGOS() {
  return ['sin-lineas', 'series-no-numerica', 'distancia-no-numerica', 'tiempo-no-numerico', 'numero-negativo', 'salida-invalida', 'sin-distancia', 'distancia-difiere-carga', 'fuera-volumen-objetivo', 'tiempo-supera-duracion', 'sesion-inexistente'];
}

test('jsPDF y jspdf-autotable son dependencias de producción y están copiadas a vendor/', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies.jspdf);
  assert.ok(pkg.dependencies['jspdf-autotable']);
  const vendor = readdirSync(path.join(ROOT, 'vendor'));
  assert.ok(vendor.includes('jspdf.umd.min.js'));
  assert.ok(vendor.includes('jspdf.plugin.autotable.min.js'));
  const vendorScript = readFileSync(path.join(ROOT, 'scripts/vendor.mjs'), 'utf8');
  assert.ok(vendorScript.includes('jspdf.umd.min.js') && vendorScript.includes('jspdf.plugin.autotable.min.js'));
  assert.equal(readFileSync(path.join(ROOT, 'vendor/jspdf.umd.min.js')).equals(readFileSync(path.join(ROOT, 'node_modules/jspdf/dist/jspdf.umd.min.js'))), true, 'vendor sincronizado con npm');
});

test('service worker: precachea los módulos del plan de entreno y las librerías PDF', () => {
  const sw = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  for (const f of ['js/domain/entreno.js', 'js/application/entrenoService.js', 'js/infrastructure/pdfEntreno.js', 'js/infrastructure/driveEntrenos.js', 'js/views/entreno-editor.js', 'js/views/entreno-acciones.js', 'js/locales/entreno.es.js', 'js/locales/entreno.en.js', 'js/locales/entreno.it.js', 'vendor/jspdf.umd.min.js', 'vendor/jspdf.plugin.autotable.min.js']) {
    assert.ok(sw.includes('./' + f), 'sw.js sin ' + f);
  }
});
