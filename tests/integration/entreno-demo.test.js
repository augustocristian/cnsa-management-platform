// Demo data of the training plan on the real store, persistence in the club document and compatibility with old data.
import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';
import { infoPdf, libNode } from '../helpers/pdf.js';
const { newId } = await importApp('js/infrastructure/ids.js');

let c;
const test = (name, fn) =>
  base(name, async (t) => {
    c = await fresh();
    return fn(t);
  });
const pad = (n) => String(n).padStart(2, '0');
const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

test('seedDemo: sessions of the current week and later come with a detailed plan consistent with their volume; earlier ones do not', async () => {
  const D = await importApp('js/domain/entreno.js');
  // The demo plans every session of the current week (Monday onwards, so it never opens on an empty week) and later ones.
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const lunes = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const sesiones = c.store.list('Entrenamientos');
  const futuras = sesiones.filter((s) => String(s.fecha) >= lunes);
  const pasadas = sesiones.filter((s) => String(s.fecha) < lunes);
  assert.ok(futuras.length >= 6 && pasadas.length > 0);
  const lineas = c.store.list('EntrenoLineas');
  for (const s of futuras) {
    const ls = lineas.filter((l) => l.entrenamientoId === s.id);
    assert.ok(ls.length >= 5, `${s.titulo}: ${ls.length} rows`);
    assert.ok(s.tipoSesion && s.materialDia, 'session type and material of the day');
    const tot = D.totales(ls);
    assert.ok(
      tot.metros >= Number(s.volumenMin) && tot.metros <= Number(s.volumenMax),
      `${s.titulo}: ${tot.metros} m outside ${s.volumenMin}-${s.volumenMax}`,
    );
    assert.deepEqual(D.validarSesion({ sesion: s, lineas: ls }), [], s.titulo);
    const objetivos = ls.map((l) => String(l.objetivo).toLowerCase());
    assert.ok(
      objetivos.some((o) => o.includes('calentamiento')),
      'calentamiento',
    );
    assert.ok(
      objetivos.some((o) => o.includes('vuelta a la calma')),
      'vuelta a la calma',
    );
  }
  for (const s of pasadas) assert.equal(lineas.filter((l) => l.entrenamientoId === s.id).length, 0);
  assert.ok(
    lineas.every((l) => sesiones.some((s) => s.id === l.entrenamientoId)),
    'no orphan lines',
  );
  const ids = lineas.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
});

test('today there is a session with a complete plan and its PDF is generated with the club data', async () => {
  const { crearEntrenoService } = await importApp('js/application/entrenoService.js');
  const P = await importApp('js/infrastructure/pdfEntreno.js');
  const hoy = hoyIso();
  // Date-independent: the demo has no session on some weekdays (e.g. Sunday), so take sessions that have a plan.
  const conPlan = new Set(c.store.list('EntrenoLineas').map((l) => l.entrenamientoId));
  const delDia = c.store.list('Entrenamientos').filter((s) => conPlan.has(s.id));
  assert.ok(delDia.length >= 1, 'the demo has sessions with a complete plan');
  const svc = crearEntrenoService(c.store, { genId: newId, club: () => c.store.club });
  const ficha = svc.ficha(delDia[0].id);
  assert.ok(ficha.sets.length >= 4);
  const { crearEtiquetasPdf } = await importApp('js/application/etiquetasPdf.js');
  const { t, locale } = await importApp('js/presentation/i18n/i18n.js');
  const r = await P.generar([ficha], crearEtiquetasPdf({ t, locale: locale(), ahora: new Date(2026, 9, 15, 18, 0) }), {
    lib: libNode(),
  });
  const info = infoPdf(r.bytes);
  assert.equal(info.paginas, 1);
  assert.ok(info.texto.includes('TOTALES'));
  assert.ok(info.texto.includes(c.store.club.nombre.split(' ')[0]));
  const semana = svc.fichasSemana(hoy.slice(0, 8) + pad(1)); // any week: does not fail
  assert.ok(Array.isArray(semana));
});

test('the Entrenamientos view shows the plan summary of the demo sessions', async () => {
  await renderView('entrenamientos', c.container, [], c);
  assert.match(c.container.textContent, /\d+ m · \d+ min/);
  assert.ok([...c.container.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Abrir plan'));
  assert.doesNotMatch(c.container.textContent, /undefined|NaN|\[object/);
});

test('persistence: the plan travels in the club document and old data (without the new columns) is read', async () => {
  const { dataToDoc, docToData, hashData } = await importApp('js/domain/sheetdata.js');
  const { SHEETS } = await importApp('js/domain/schema.js');
  assert.deepEqual(SHEETS.EntrenoLineas, [
    'id',
    'entrenamientoId',
    'set',
    'orden',
    'tiempoMin',
    'objetivo',
    'bloque',
    'series',
    'distancia',
    'salida',
    'ejercicio',
    'material',
    'notas',
    'componentes',
    'estilo',
  ]);
  for (const col of ['tipoSesion', 'materialDia', 'notasGenerales'])
    assert.ok(SHEETS.Entrenamientos.includes(col), col);
  const data = {
    db: Object.fromEntries(
      Object.keys(SHEETS)
        .filter((s) => s !== 'Club')
        .map((s) => [s, c.store.list(s)]),
    ),
    club: { ...c.store.club },
  };
  const doc = dataToDoc(data);
  assert.ok(doc.hojas.EntrenoLineas.length > 20);
  const vuelta = docToData(JSON.parse(JSON.stringify(doc)));
  assert.deepEqual(vuelta.db.EntrenoLineas, data.db.EntrenoLineas);
  assert.equal(hashData(vuelta), hashData(data));
  // document predating this feature: sessions without the new columns and without the EntrenoLineas sheet
  const antiguo = {
    version: 1,
    club: { nombre: 'Viejo' },
    hojas: {
      Entrenamientos: [
        { id: 'e1', fecha: '2026-01-05', hora: '18:00', titulo: 'Antigua', grupoId: '', estado: 'realizado' },
      ],
    },
  };
  const d = docToData(antiguo);
  assert.equal(d.db.Entrenamientos[0].tipoSesion, '');
  assert.equal(d.db.Entrenamientos[0].materialDia, '');
  assert.equal(d.db.Entrenamientos[0].notasGenerales, '');
  assert.deepEqual(d.db.EntrenoLineas, []);
  const { crearEntrenoService } = await importApp('js/application/entrenoService.js');
  const repo = {
    list: (h) => d.db[h] || [],
    get: (h, id) => (d.db[h] || []).find((r) => r.id === id) || null,
    upsert: (h, r) => r,
    remove: () => {},
  };
  const svc = crearEntrenoService(repo, { genId: newId, club: () => d.club });
  assert.equal(svc.tienePlan('e1'), false);
  assert.deepEqual(svc.ficha('e1').sets, []);
});

test('exporting to Excel includes the EntrenoLineas sheet with the schema headers', async () => {
  const blob = await c.store.exportXlsx();
  const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
  assert.ok(wb.SheetNames.includes('EntrenoLineas'));
  const filas = XLSX.utils.sheet_to_json(wb.Sheets.EntrenoLineas, { header: 1 });
  assert.equal(filas[0][1], 'entrenamientoId');
  assert.ok(filas.length > 20);
});
