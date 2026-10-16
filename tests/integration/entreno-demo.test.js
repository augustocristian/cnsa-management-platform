// Datos demo del plan de entreno sobre el store real, persistencia en el documento del club y compatibilidad con datos antiguos.
import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';
import { infoPdf, libNode } from '../helpers/pdf.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });
const pad = (n) => String(n).padStart(2, '0');
const hoyIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

test('seedDemo: las sesiones de hoy y próximas traen un plan detallado coherente con su volumen; las pasadas no', async () => {
  const D = await importApp('js/domain/entreno.js');
  const hoy = hoyIso();
  const sesiones = c.store.list('Entrenamientos');
  const futuras = sesiones.filter((s) => String(s.fecha) >= hoy);
  const pasadas = sesiones.filter((s) => String(s.fecha) < hoy);
  assert.ok(futuras.length >= 6 && pasadas.length > 0);
  const lineas = c.store.list('EntrenoLineas');
  for (const s of futuras) {
    const ls = lineas.filter((l) => l.entrenamientoId === s.id);
    assert.ok(ls.length >= 5, `${s.titulo}: ${ls.length} filas`);
    assert.ok(s.tipoSesion && s.materialDia, 'tipo de sesión y material del día');
    const tot = D.totales(ls);
    assert.ok(tot.metros >= Number(s.volumenMin) && tot.metros <= Number(s.volumenMax), `${s.titulo}: ${tot.metros} m fuera de ${s.volumenMin}-${s.volumenMax}`);
    assert.deepEqual(D.validarSesion({ sesion: s, lineas: ls }), [], s.titulo);
    const objetivos = ls.map((l) => String(l.objetivo).toLowerCase());
    assert.ok(objetivos.some((o) => o.includes('calentamiento')), 'calentamiento');
    assert.ok(objetivos.some((o) => o.includes('vuelta a la calma')), 'vuelta a la calma');
  }
  for (const s of pasadas) assert.equal(lineas.filter((l) => l.entrenamientoId === s.id).length, 0);
  assert.ok(lineas.every((l) => sesiones.some((s) => s.id === l.entrenamientoId)), 'sin líneas huérfanas');
  const ids = lineas.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'ids únicos');
});

test('hoy hay una sesión con plan completa y su PDF se genera con los datos del club', async () => {
  const { crearEntrenoService } = await importApp('js/application/entrenoService.js');
  const P = await importApp('js/infrastructure/pdfEntreno.js');
  const hoy = hoyIso();
  const delDia = c.store.list('Entrenamientos').filter((s) => String(s.fecha) === hoy);
  assert.ok(delDia.length >= 1, 'hay sesiones hoy en la demo');
  const svc = crearEntrenoService(c.store, { club: () => c.store.club });
  const ficha = svc.ficha(delDia[0].id);
  assert.ok(ficha.sets.length >= 4);
  const r = await P.generarPdfEntreno([ficha], { lib: libNode() });
  const info = infoPdf(r.bytes);
  assert.equal(info.paginas, 1);
  assert.ok(info.texto.includes('TOTALES'));
  assert.ok(info.texto.includes(c.store.club.nombre.split(' ')[0]));
  const semana = svc.fichasSemana(hoy.slice(0, 8) + pad(1)); // semana cualquiera: no falla
  assert.ok(Array.isArray(semana));
});

test('la vista Entrenamientos muestra el resumen del plan de las sesiones de la demo', async () => {
  await renderView('entrenamientos', c.container, [], c);
  assert.match(c.container.textContent, /\d+ m · \d+ min/);
  assert.ok([...c.container.querySelectorAll('button')].some((b) => b.textContent.trim() === 'PDF'));
  assert.doesNotMatch(c.container.textContent, /undefined|NaN|\[object/);
});

test('persistencia: el plan viaja en el documento del club y los datos antiguos (sin columnas nuevas) se leen', async () => {
  const { dataToDoc, docToData, hashData } = await importApp('js/sheetdata.js');
  const { SHEETS } = await importApp('js/schema.js');
  assert.deepEqual(SHEETS.EntrenoLineas, ['id', 'entrenamientoId', 'set', 'orden', 'tiempoMin', 'objetivo', 'bloque', 'series', 'distancia', 'salida', 'ejercicio', 'material', 'notas', 'componentes', 'estilo']);
  for (const col of ['tipoSesion', 'materialDia', 'notasGenerales']) assert.ok(SHEETS.Entrenamientos.includes(col), col);
  const data = { db: Object.fromEntries(Object.keys(SHEETS).filter((s) => s !== 'Club').map((s) => [s, c.store.list(s)])), club: { ...c.store.club } };
  const doc = dataToDoc(data);
  assert.ok(doc.hojas.EntrenoLineas.length > 20);
  const vuelta = docToData(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(vuelta.db.EntrenoLineas, data.db.EntrenoLineas);
  assert.equal(hashData(vuelta), hashData(data));
  // documento anterior a esta función: sesiones sin las columnas nuevas y sin la hoja EntrenoLineas
  const antiguo = { version: 1, club: { nombre: 'Viejo' }, hojas: { Entrenamientos: [{ id: 'e1', fecha: '2026-01-05', hora: '18:00', titulo: 'Antigua', grupoId: '', estado: 'realizado' }] } };
  const d = docToData(antiguo);
  assert.equal(d.db.Entrenamientos[0].tipoSesion, '');
  assert.equal(d.db.Entrenamientos[0].materialDia, '');
  assert.equal(d.db.Entrenamientos[0].notasGenerales, '');
  assert.deepEqual(d.db.EntrenoLineas, []);
  const { crearEntrenoService } = await importApp('js/application/entrenoService.js');
  const repo = { list: (h) => d.db[h] || [], get: (h, id) => (d.db[h] || []).find((r) => r.id === id) || null, upsert: (h, r) => r, remove: () => {} };
  const svc = crearEntrenoService(repo, { club: () => d.club });
  assert.equal(svc.tienePlan('e1'), false);
  assert.deepEqual(svc.ficha('e1').sets, []);
});

test('exportar a Excel incluye la hoja EntrenoLineas con las cabeceras del esquema', async () => {
  const blob = await c.store.exportXlsx();
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  assert.ok(wb.SheetNames.includes('EntrenoLineas'));
  const filas = XLSX.utils.sheet_to_json(wb.Sheets.EntrenoLineas, { header: 1 });
  assert.equal(filas[0][1], 'entrenamientoId');
  assert.ok(filas.length > 20);
});
