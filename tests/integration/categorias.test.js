import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';
import { temporadaDe, etiquetaTemporada } from '../../js/domain/categorias.js';

let c;
// Each test starts with a clean DOM and the store seeded with the demo; the season is fixed in the club so it does not depend on the clock.
const test = (name, fn) => base(name, async (t) => {
  c = await fresh();
  c.store.setClub({ ...c.store.club, temporadaActual: '2026-2027', temporadaAplicada: '2026-2027' });
  return fn(t);
});

const marcar = (el, valor) => { el.checked = valor; el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const abrirAlta = async () => {
  await renderView('nadadores', c.container, [], c);
  buttonByText(c.container, 'Nuevo nadador').click();
  return document.querySelector('.sheet-overlay');
};
const vivo = (ov) => ov.querySelector('[data-testid=categoria-auto]').textContent;
const porNombre = (n) => c.store.list('Nadadores').find((x) => x.nombre === n);

test('demo data: the 12 swimmers fall into the expected categories and no recalculation is needed', async () => {
  const esperado = { 'Lucía': 'Pre-Benjamín', 'Martina': 'Benjamín', 'Pelayo': 'Benjamín', 'Carla': 'Alevín', 'Álvaro': 'Alevín', 'Noa': 'Infantil', 'Iker': 'Infantil', 'Paula': 'Junior', 'Marcos': 'Junior', 'Claudia': 'Absoluto', 'Daniel': 'Absoluto', 'Javier': 'Master' };
  for (const [nombre, cat] of Object.entries(esperado)) assert.equal(porNombre(nombre).categoria, cat, nombre);
  assert.equal(porNombre('Javier').licenciaMaster, 'true');
  assert.equal(porNombre('Daniel').licenciaMaster, 'false', 'Daniel is 25 but has no master licence');
  assert.ok(c.store.list('Nadadores').every((n) => n.categoriaManual === ''));
  // the demo stores the applied season from its clock and the dates are relative to that season
  const hoy = temporadaDe(c.ui.isoDate(new Date()));
  const demo = await fresh();
  assert.equal(demo.store.club.temporadaAplicada, etiquetaTemporada(hoy));
  const pelayo = demo.store.list('Nadadores').find((n) => n.nombre === 'Pelayo');
  assert.equal(pelayo.fechaNacimiento.slice(0, 4), String(hoy - 9));
  const { crearCategoriasService } = await import('../../js/application/categoriasService.js');
  assert.deepEqual(crearCategoriasService(demo.store, { ahora: () => new Date() }).recalcular().cambios, []);
});

test('new swimmer: the category is computed live from birth date and sex, read-only', async () => {
  const ov = await abrirAlta();
  assert.match(vivo(ov), /Indica la fecha de nacimiento/);
  assert.equal(ov.querySelector('[data-testid=categoria-auto]').getAttribute('aria-live'), 'polite');
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2014-05-05');
  assert.match(vivo(ov), /Alevín · nacidos en 2014-2015 · temporada 2026-2027/);
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2008-12-31');
  assert.match(vivo(ov), /Absoluto · nacidos en 2008 y anteriores/);
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2009-01-01');
  assert.match(vivo(ov), /Junior · nacidos en 2009-2011/);
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2018-06-01');
  assert.match(vivo(ov), /Pre-Benjamín · nacidos en 2018 /);
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2022-06-01');
  assert.match(vivo(ov), /Por debajo de la edad mínima/);
  setValue(fieldByLabel(ov, 'Sexo'), 'M');
  assert.match(vivo(ov), /Pre-Benjamín/);
  // the automatic category is not an editable field
  assert.equal(ov.querySelector('[data-testid=categoria-auto]').querySelector('input,select'), null);
});

test('automatic new swimmer: saves the computed category and does not flag manual', async () => {
  const ov = await abrirAlta();
  setValue(fieldByLabel(ov, 'Nombre'), 'Zoe');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Zamora Test');
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2016-03-03');
  buttonByText(ov, 'Guardar').click();
  await tick();
  const n = porNombre('Zoe');
  assert.deepEqual([n.categoria, n.categoriaManual, n.licenciaMaster], ['Benjamín', '', 'false']);
  const fila = [...c.container.querySelectorAll('tr.nad-row')].find((r) => r.textContent.includes('Zoe'));
  assert.ok(fila.textContent.includes('Benjamín'));
  assert.equal(fila.querySelector('.nad-manual'), null, 'no manual badge');
});

test('Master: only with a master licence and minimum age', async () => {
  const ov = await abrirAlta();
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '1985-02-02');
  assert.match(vivo(ov), /Absoluto/);
  marcar(fieldByLabel(ov, 'Licencia máster'), true);
  assert.match(vivo(ov), /Master · licencia máster y 25 años o más · temporada 2026-2027/);
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2005-02-02'); // 21 years old
  assert.match(vivo(ov), /Absoluto/);
  assert.match(vivo(ov), /requiere 25 años o más/);
  setValue(fieldByLabel(ov, 'Nombre'), 'Mari');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Master Test');
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '1985-02-02');
  buttonByText(ov, 'Guardar').click();
  await tick();
  const n = porNombre('Mari');
  assert.deepEqual([n.categoria, n.licenciaMaster], ['Master', 'true']);
});

test('manual category: the switch shows the selector, overrides the calculation and is flagged with a badge', async () => {
  const ov = await abrirAlta();
  const chk = fieldByLabel(ov, 'Categoría manual');
  const eleg = fieldByLabel(ov, 'Categoría elegida');
  assert.equal(eleg.closest('.field').hidden, true);
  marcar(chk, true);
  assert.equal(eleg.closest('.field').hidden, false);
  setValue(fieldByLabel(ov, 'Nombre'), 'Mano');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Manual Test');
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2014-05-05');
  setValue(eleg, 'Junior');
  assert.match(vivo(ov), /Junior · fijada manualmente \(la automática sería Alevín\)/);
  buttonByText(ov, 'Guardar').click();
  await tick();
  const n = porNombre('Mano');
  assert.deepEqual([n.categoria, n.categoriaManual], ['Junior', 'Junior']);
  const fila = [...c.container.querySelectorAll('tr.nad-row')].find((r) => r.textContent.includes('Mano'));
  assert.equal(fila.querySelector('.nad-manual').textContent, 'manual');

  // profile: current category + badge
  await renderView('nadadores', c.container, [n.id], c);
  const dd = [...c.container.querySelectorAll('dt')].find((d) => d.textContent === 'Categoría').nextElementSibling;
  assert.match(dd.textContent, /Junior/);
  assert.match(dd.textContent, /manual/);
  // it is left untouched when the season changes
  const { crearCategoriasService } = await import('../../js/application/categoriasService.js');
  crearCategoriasService(c.store, { ahora: () => new Date() }).cambiarTemporada(2030);
  assert.equal(porNombre('Mano').categoria, 'Junior');
});

test('edit: it can be switched from manual to automatic', async () => {
  const n = porNombre('Carla'); // 2014 in the 2026 demo -> Alevín
  c.store.upsert('Nadadores', { ...n, categoria: 'Junior', categoriaManual: 'Junior' });
  await renderView('nadadores', c.container, [n.id], c);
  buttonByText(c.container, 'Editar').click();
  const ov = document.querySelector('.sheet-overlay');
  assert.equal(fieldByLabel(ov, 'Categoría manual').checked, true);
  marcar(fieldByLabel(ov, 'Categoría manual'), false);
  buttonByText(ov, 'Guardar').click();
  await tick();
  const g = c.store.get('Nadadores', n.id);
  assert.deepEqual([g.categoria, g.categoriaManual], ['Alevín', '']);
});

test('profile: age and category consistent with the season, and the category rule', async () => {
  const n = porNombre('Carla');
  await renderView('nadadores', c.container, [n.id], c);
  const txt = c.container.textContent;
  assert.match(txt, /Alevín/);
  assert.match(txt, /Temporada 2026-2027: nacidos en 2014-2015/);
  assert.match(txt, /Licencia máster/);
});

test('list: season years table, filter and sort by category order', async () => {
  await renderView('nadadores', c.container, [], c);
  const det = c.container.querySelector('details');
  assert.match(det.querySelector('summary').textContent, /Categorías de la temporada 2026-2027/);
  const filas = [...det.querySelectorAll('tbody tr')].map((r) => [...r.children].map((x) => x.textContent));
  assert.deepEqual(filas.slice(0, 6), [
    ['Pre-Benjamín', '2018'], ['Benjamín', '2016-2017'], ['Alevín', '2014-2015'], ['Infantil', '2012-2013'], ['Junior', '2009-2011'], ['Absoluto', '2008 y anteriores'],
  ]);
  assert.match(filas[6][1], /Licencia máster y 25 años o más \(2001 y anteriores\)/);
  const cats = [...c.container.querySelectorAll('tr.nad-row td:nth-child(2) .badge:first-child')].map((x) => x.textContent);
  const orden = ['Pre-Benjamín', 'Benjamín', 'Alevín', 'Infantil', 'Junior', 'Absoluto', 'Master'];
  assert.deepEqual(cats, [...cats].sort((a, b) => orden.indexOf(a) - orden.indexOf(b)));
  const sel = c.container.querySelectorAll('.nad-filters select')[0];
  assert.deepEqual([...sel.options].slice(1).map((o) => o.textContent), orden);
});

// ---------- Settings: categories panel ----------
const panel = () => c.container.querySelector('.catp');

test('club: "Categorías de la temporada 2026-2027" panel with the computed table', async () => {
  await renderView('club', c.container, [], c);
  assert.match(panel().querySelector('h2').textContent, /Categorías de la temporada 2026-2027/);
  const filas = [...panel().querySelectorAll('table[aria-label] tbody tr')].map((r) => r.textContent);
  assert.ok(filas[0].includes('Pre-Benjamín') && filas[0].includes('2018'));
  assert.ok(filas[4].includes('Junior') && filas[4].includes('2009-2011'));
  assert.match(panel().textContent, /Temporada vigente: 2026-2027/);
  assert.match(panel().textContent, /Fijada manualmente/);
});

test('change season: previews who changes and applies after confirming', async () => {
  await renderView('club', c.container, [], c);
  const sel = panel().querySelector('#catp-temporada');
  setValue(sel, '2027');
  panel().querySelector('#catp-cambiar').click();
  const modal = document.querySelector('.modal');
  assert.match(modal.textContent, /Cambiar a la temporada 2027-2028/);
  assert.match(modal.textContent, /nadadores cambian de categoría/);
  const filas = [...modal.querySelectorAll('tbody tr')].map((r) => r.textContent);
  // Lucía (8) moves to Benjamín; Pelayo (9 -> 10) stays; Martina (10 -> 11) moves to Alevín
  assert.ok(filas.some((f) => f.includes('Fernández Roces') && f.includes('Pre-Benjamín') && f.includes('Benjamín')));
  assert.ok(filas.some((f) => f.includes('Suárez Cuesta') && f.includes('Alevín')));
  assert.equal(porNombre('Lucía').categoria, 'Pre-Benjamín', 'the preview does not write');
  assert.equal(c.store.club.temporadaActual, '2026-2027');
  buttonByText(modal, 'Aplicar cambio de temporada').click();
  await tick();
  assert.equal(document.querySelector('.modal'), null);
  assert.equal(porNombre('Lucía').categoria, 'Benjamín');
  assert.equal(porNombre('Martina').categoria, 'Alevín');
  assert.equal(c.store.club.temporadaActual, '2027-2028');
  assert.equal(c.store.club.temporadaAplicada, '2027-2028');
  assert.match(panel().querySelector('h2').textContent, /2027-2028/);
});

test('changing to the same season warns and opens no preview; "Automática" returns to the current season', async () => {
  c.store.setClub({ ...c.store.club, temporadaActual: '2040-2041' });
  await renderView('club', c.container, [], c);
  panel().querySelector('#catp-cambiar').click();
  assert.equal(document.querySelector('.modal'), null);
  assert.match(document.body.textContent, /Ya estás en la temporada 2040-2041/);
  const hoy = etiquetaTemporada(temporadaDe(c.ui.isoDate(new Date())));
  setValue(panel().querySelector('#catp-temporada'), '');
  panel().querySelector('#catp-cambiar').click();
  buttonByText(document.querySelector('.modal'), 'Aplicar cambio de temporada').click();
  await tick();
  assert.equal(c.store.club.temporadaActual, '');
  assert.match(panel().querySelector('h2').textContent, new RegExp(hoy));
});

test('on-demand recalculation fixes outdated categories', async () => {
  const n = porNombre('Carla');
  c.store.upsert('Nadadores', { ...n, categoria: 'Master' });
  await renderView('club', c.container, [], c);
  panel().querySelector('#catp-recalcular').click();
  assert.equal(porNombre('Carla').categoria, 'Alevín');
  assert.match(document.body.textContent, /Categorías recalculadas: 1 cambio/);
});

test('rules by sex: validation, saving and recalculation', async () => {
  await renderView('club', c.container, [], c);
  const inp = (sexo, cat, i) => panel().querySelector(`input[aria-label="${cat} (${sexo === 'F' ? 'Femenino' : 'Masculino'}): ${i === 0 ? 'Edad desde' : 'Edad hasta'}"]`);
  // gap between Junior and Absoluto -> error and nothing saved
  setValue(inp('M', 'Junior', 1), '18');
  panel().querySelector('#catp-guardar-reglas').click();
  assert.match(panel().querySelector('.catp-errores').textContent, /Absoluto \(Masculino\) debe empezar justo después/);
  assert.equal(c.store.club.categoriasConfig, undefined);
  // continuous table -> saves; 18-year-old boys stay in Junior
  setValue(inp('M', 'Absoluto', 0), '19');
  panel().querySelector('#catp-guardar-reglas').click();
  assert.ok(c.store.club.categoriasConfig);
  assert.equal(JSON.parse(c.store.club.categoriasConfig).edades.M.Junior[1], 18);
  // different F and M: the table shows two columns
  await renderView('club', c.container, [], c);
  const cab = [...panel().querySelectorAll('table[aria-label] thead th')].map((x) => x.textContent);
  assert.deepEqual(cab, ['Categoría', 'Nacidos en (Femenino)', 'Nacidos en (Masculino)']);
  // master minimum age
  setValue(panel().querySelector('#catp-master-edad'), '30');
  panel().querySelector('#catp-guardar-reglas').click();
  assert.equal(JSON.parse(c.store.club.categoriasConfig).edadMinimaMaster, 30);
  assert.equal(porNombre('Javier').categoria, 'Master'); // 42 years old
  // reset
  await renderView('club', c.container, [], c);
  panel().querySelector('#catp-restablecer').click();
  assert.equal(c.store.club.categoriasConfig, '');
});

test('schema: Nadadores includes licenciaMaster and categoriaManual and an old club without them reads fine', async () => {
  const { SHEETS } = await import('../../js/domain/schema.js');
  assert.ok(SHEETS.Nadadores.includes('licenciaMaster') && SHEETS.Nadadores.includes('categoriaManual'));
  const antiguo = { id: 'old1', nombre: 'Vieja', apellidos: 'Fila', fechaNacimiento: '2013-02-02', sexo: 'F', categoria: 'Alevín', grupoId: '' };
  const guardada = c.store.upsert('Nadadores', antiguo);
  assert.equal(guardada.licenciaMaster, '');
  assert.equal(guardada.categoriaManual, '');
  await renderView('nadadores', c.container, ['old1'], c);
  assert.match(c.container.textContent, /Vieja Fila/);
  const { crearCategoriasService } = await import('../../js/application/categoriasService.js');
  crearCategoriasService(c.store, { ahora: () => new Date() }).recalcular();
  assert.equal(c.store.get('Nadadores', 'old1').categoria, 'Infantil');
});
