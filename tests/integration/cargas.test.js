import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const today = () => c.ui.isoDate(new Date());
const vista = () => renderView('cargas', c.container, [], c);
const abrirGestor = async () => { buttonByText(c.container, 'Contenidos de entrenamiento').click(); await tick(); };
const item = (root, nombre) => [...root.querySelectorAll('.tc-item')].find((li) => li.querySelector('.tc-nombre').textContent === nombre);
const boton = (li, prefijo) => [...li.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent).startsWith(prefijo));
const modal = () => document.querySelector('.modal');
const opciones = (sel) => [...sel.options].map((o) => o.textContent);

async function crearContenido(root, datos) {
  buttonByText(root, 'Nuevo contenido').click();
  const m = modal();
  assert.ok(m, 'the form opens');
  setValue(fieldByLabel(m, 'Nombre'), datos.nombre);
  if (datos.descripcion) setValue(fieldByLabel(m, 'Descripción'), datos.descripcion);
  if (datos.min) setValue(fieldByLabel(m, 'Objetivo mínimo'), datos.min);
  if (datos.max) setValue(fieldByLabel(m, 'Objetivo máximo'), datos.max);
  buttonByText(m, 'Guardar').click();
  await tick(10);
}

// Log-load sheet
const abrirRegistro = async () => { buttonByText(c.container, 'Registrar carga').click(); await tick(); const d = document.querySelector('.sheet'); assert.ok(d, 'the log sheet opens'); return d; };
const elegirNadador = (d, texto) => setValue(fieldByLabel(d, 'Nadador'), texto);
const rellenar = (d, etiqueta, valor) => setValue(fieldByLabel(d, etiqueta), valor);
const errores = (d) => [...d.querySelectorAll('.field-error')].map((e) => e.textContent.trim());

test('the page has ONE primary "Registrar carga" action and the form is not buried under the charts', async () => {
  await vista();
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.ok(c.container.querySelector('.page-head .btn--primary.cg-add'));
  assert.equal(c.container.querySelector('form.cg-form'), null, 'the form lives in a sheet, not on the page');
  assert.ok(c.container.querySelector('.cg-fab[aria-label="Registrar carga"]'), 'floating button for phones');
  const d = await abrirRegistro();
  assert.equal(d.getAttribute('role'), 'dialog');
  assert.ok(d.querySelector('.combo input[role="combobox"]'), 'swimmer combobox');
});

test('the form offers the active catalogue grouped by category, with help text and "Añadir contenido…"', async () => {
  await vista();
  const d = await abrirRegistro();
  const sel = d.querySelector('select[name="tipoId"]');
  assert.deepEqual([...sel.querySelectorAll('optgroup')].map((g) => g.label), ['Intensidad', 'Trabajo específico']);
  const nombres = opciones(sel);
  assert.equal(nombres.length, 11);
  assert.equal(nombres[0], 'Aeróbico ligero');
  assert.equal(nombres.at(-1), 'Añadir contenido…');
  assert.match(d.querySelector('#cg-tipo-ayuda').textContent, /Borg 4-5\/10/);
  sel.value = 'tc-alactico';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match(d.querySelector('#cg-tipo-ayuda').textContent, /Velocidad máxima/);
  assert.equal(sel.getAttribute('aria-describedby'), 'cg-tipo-ayuda');
  assert.ok(d.querySelector('select[name="entrenamientoId"]'), 'optional session');
  const metros = d.querySelector('input[name="metros"]');
  assert.equal(metros.getAttribute('step'), null, 'metres are free: no 50 m step restriction');
});

test('logging a load choosing content and session links it to both and highlights the new row', async () => {
  await vista();
  const ses = c.store.list('Entrenamientos').find((e) => e.grupoId === 'g1');
  const d = await abrirRegistro();
  elegirNadador(d, 'Carla Menéndez');
  rellenar(d, 'Fecha', ses.fecha);
  d.querySelector('select[name="tipoId"]').value = 'tc-tecnica';
  d.querySelector('select[name="entrenamientoId"]').value = ses.id;
  rellenar(d, 'Metros', '2437');
  rellenar(d, 'Notas', 'vinculada');
  buttonByText(d, 'Registrar').click();
  await tick(10);
  const r = c.store.list('Cargas').find((x) => x.notas === 'vinculada');
  assert.deepEqual([r.tipo, r.entrenamientoId, r.metros, r.nadadorId], ['Técnica', ses.id, 2437, 'n04']);
  assert.equal(document.querySelector('.sheet'), null, 'the sheet closes');
  const fila = c.container.querySelector('tr.is-new');
  assert.ok(fila, 'new row highlighted');
  assert.match(fila.textContent, new RegExp(ses.titulo));
  assert.match(fila.textContent, /2\.437/);
  assert.match(document.getElementById('toasts').textContent, /Carga registrada/);
  assert.equal(document.activeElement, c.container.querySelector('.cg-add'), 'focus returns to the Log button');
});

test('inline validation: without swimmer or metres nothing is saved and each field explains its error', async () => {
  await vista();
  const antes = c.store.list('Cargas').length;
  const d = await abrirRegistro();
  buttonByText(d, 'Registrar').click();
  await tick(5);
  assert.ok(document.querySelector('.sheet'), 'stays open');
  assert.equal(c.store.list('Cargas').length, antes);
  assert.deepEqual(errores(d), ['Elige un nadador de la lista', 'Indica los metros (mayor que 0)']);
  assert.equal(fieldByLabel(d, 'Metros').getAttribute('aria-invalid'), 'true');
  rellenar(d, 'Metros', '500');
  assert.equal(fieldByLabel(d, 'Metros').getAttribute('aria-invalid'), null, 'the error clears while editing');
  elegirNadador(d, 'Carla');
  rellenar(d, 'RPE', '11');
  buttonByText(d, 'Registrar').click();
  await tick(5);
  assert.deepEqual(errores(d), ['El RPE debe estar entre 1 y 10']);
});

test('"Registrar y añadir otra" keeps swimmer, date and content and clears the rest', async () => {
  await vista();
  const d = await abrirRegistro();
  elegirNadador(d, 'Carla Menéndez');
  rellenar(d, 'Fecha', today());
  d.querySelector('select[name="tipoId"]').value = 'tc-piernas';
  rellenar(d, 'Metros', '600');
  buttonByText(d, 'Registrar y añadir otra').click();
  await tick(10);
  assert.ok(document.querySelector('.sheet'), 'the sheet stays open');
  assert.equal(fieldByLabel(d, 'Metros').value, '');
  assert.equal(fieldByLabel(d, 'Nadador').value, 'Carla Menéndez Vigil');
  assert.equal(d.querySelector('select[name="tipoId"]').value, 'tc-piernas');
  rellenar(d, 'Metros', '750');
  buttonByText(d, 'Registrar').click();
  await tick(10);
  const mias = c.store.list('Cargas').filter((x) => x.nadadorId === 'n04' && x.tipo === 'Piernas' && [600, 750].includes(x.metros));
  assert.equal(mias.length, 2);
  // reopening remembers the last swimmer, date and content
  const d2 = await abrirRegistro();
  assert.equal(fieldByLabel(d2, 'Nadador').value, 'Carla Menéndez Vigil');
  assert.equal(d2.querySelector('select[name="tipoId"]').value, 'tc-piernas');
});

test('the swimmer selector filters while typing (accent- and case-insensitive) and works with the keyboard', async () => {
  await vista();
  const d = await abrirRegistro();
  const input = fieldByLabel(d, 'Nadador');
  setValue(input, 'MENENDEZ');
  const lista = d.querySelector('[role="listbox"]');
  assert.equal(lista.hidden, false);
  assert.ok([...lista.querySelectorAll('[role="option"]')].every((o) => /Menéndez/.test(o.textContent)));
  setValue(input, '');
  const todas = lista.querySelectorAll('[role="option"]').length;
  assert.ok(todas >= 12);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.ok(input.value.length > 3);
  assert.equal(lista.hidden, true);
});

test('manager: create a manual content, reject the duplicate name and use it when logging', async () => {
  await vista();
  await abrirGestor();
  const gestor = c.container.querySelector('#cg-gestor');
  assert.equal(gestor.querySelectorAll('.tc-item').length, 10);
  await crearContenido(gestor, { nombre: 'Aguas abiertas', descripcion: 'Nado en mar', min: '1000', max: '3000' });
  const t = c.store.list('TiposCarga').find((x) => x.nombre === 'Aguas abiertas');
  assert.deepEqual([t.categoria, t.predefinido, t.activo, t.minSemanalM, t.maxSemanalM], ['personalizado', 'false', 'true', 1000, 3000]);
  assert.ok(item(c.container, 'Aguas abiertas'));
  assert.match(c.container.textContent, /Contenido «Aguas abiertas» creado|Personalizados/);

  // duplicate (case- and accent-insensitive): inline error and nothing saved
  buttonByText(c.container.querySelector('#cg-gestor'), 'Nuevo contenido').click();
  setValue(fieldByLabel(modal(), 'Nombre'), 'AGUAS ABIERTAS');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  assert.ok(modal(), 'the modal stays open');
  assert.match(modal().querySelector('.field-error').textContent, /Ya existe un contenido con ese nombre/);
  assert.equal(fieldByLabel(modal(), 'Nombre').getAttribute('aria-invalid'), 'true');
  assert.equal(c.store.list('TiposCarga').filter((x) => x.nombre.toLowerCase().includes('aguas')).length, 1);
  // empty name
  setValue(fieldByLabel(modal(), 'Nombre'), '  ');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  assert.match(modal().querySelector('.field-error').textContent, /obligatorio/);
  buttonByText(modal(), 'Cancelar').click();
  await tick();

  const d = await abrirRegistro();
  assert.ok(opciones(d.querySelector('select[name="tipoId"]')).includes('Aguas abiertas'));
  elegirNadador(d, 'Marcos');
  rellenar(d, 'Fecha', today());
  d.querySelector('select[name="tipoId"]').value = t.id;
  rellenar(d, 'Metros', '1800');
  buttonByText(d, 'Registrar').click();
  await tick(10);
  assert.equal(c.store.list('Cargas').filter((x) => x.tipo === 'Aguas abiertas').length, 1);
  assert.match(c.container.textContent, /Aguas abiertas/);
});

test('"Añadir contenido…" in the form creates one on the fly, selects it and keeps what was typed', async () => {
  await vista();
  const d = await abrirRegistro();
  rellenar(d, 'Metros', '1234');
  rellenar(d, 'Notas', 'borrador');
  const sel = d.querySelector('select[name="tipoId"]');
  sel.value = '__nuevo__';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  const m = [...document.querySelectorAll('.modal')].find((x) => x !== d);
  assert.ok(m, 'the content form opens');
  assert.notEqual(sel.value, '__nuevo__', 'it does not stay on the add option');
  setValue(fieldByLabel(m, 'Nombre'), 'Apnea');
  buttonByText(m, 'Guardar').click();
  await tick(10);
  const nuevo = c.store.list('TiposCarga').find((x) => x.nombre === 'Apnea');
  assert.equal(d.querySelector('select[name="tipoId"]').value, nuevo.id);
  assert.deepEqual([fieldByLabel(d, 'Metros').value, fieldByLabel(d, 'Notas').value], ['1234', 'borrador']);
});

test('manager: deactivating removes the content from the selector and reactivating brings it back; predefined ones are not deleted', async () => {
  await vista();
  await abrirGestor();
  let li = item(c.container, 'Brazos');
  assert.equal(boton(li, 'Eliminar'), undefined, 'predefined has no delete button');
  boton(li, 'Desactivar').click();
  await tick();
  assert.equal(c.store.get('TiposCarga', 'tc-brazos').activo, 'false');
  let d = await abrirRegistro();
  assert.ok(!opciones(d.querySelector('select[name="tipoId"]')).includes('Brazos'));
  buttonByText(d, 'Cancelar').click();
  await tick();
  li = item(c.container, 'Brazos');
  assert.ok(li.classList.contains('tc-inactivo'));
  boton(li, 'Activar').click();
  await tick();
  assert.equal(c.store.get('TiposCarga', 'tc-brazos').activo, 'true');
  d = await abrirRegistro();
  assert.ok(opciones(d.querySelector('select[name="tipoId"]')).includes('Brazos'));
});

test('manager: editing a predefined one changes description, colour and targets but not the name', async () => {
  await vista();
  await abrirGestor();
  boton(item(c.container, 'Piernas'), 'Editar').click();
  const m = modal();
  assert.equal(fieldByLabel(m, 'Nombre').disabled, true);
  setValue(fieldByLabel(m, 'Descripción'), 'Patada con aletas');
  setValue(fieldByLabel(m, 'Color'), '#112233');
  setValue(fieldByLabel(m, 'Objetivo mínimo'), '600');
  setValue(fieldByLabel(m, 'Objetivo máximo'), '300'); // invalid
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.match(modal().querySelector('.field-error').textContent, /mínimo no puede superar/);
  setValue(fieldByLabel(modal(), 'Objetivo máximo'), '1800');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  const p = c.store.get('TiposCarga', 'tc-piernas');
  assert.deepEqual([p.nombre, p.descripcion, p.color, p.minSemanalM, p.maxSemanalM], ['Piernas', 'Patada con aletas', '#112233', 600, 1800]);
  assert.match(item(c.container, 'Piernas').textContent, /Patada con aletas/);
});

test('manager: a content with loads is not deleted (deactivate or merge); without loads it is deleted with confirmation', async () => {
  await vista();
  await abrirGestor();
  await crearContenido(c.container.querySelector('#cg-gestor'), { nombre: 'Temporal' });
  await crearContenido(c.container.querySelector('#cg-gestor'), { nombre: 'Vacío' });
  const temp = c.store.list('TiposCarga').find((x) => x.nombre === 'Temporal');
  c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 700, tipo: 'Temporal' });

  boton(item(c.container, 'Temporal'), 'Eliminar').click();
  await tick();
  assert.match(modal().textContent, /tiene 1 cargas registradas, así que no se puede eliminar/);
  assert.ok(c.store.get('TiposCarga', temp.id), 'still exists');
  const sel = modal().querySelector('select');
  sel.value = 'tc-tecnica';
  buttonByText(modal(), 'Fusionar y eliminar').click();
  await tick(10);
  assert.equal(c.store.get('TiposCarga', temp.id), null);
  assert.ok(c.store.list('Cargas').some((x) => x.tipo === 'Técnica' && Number(x.metros) === 700));

  boton(item(c.container, 'Vacío'), 'Eliminar').click();
  await tick();
  buttonByText(document.body.querySelector('.modal'), 'Eliminar').click();
  await tick(10);
  assert.equal(c.store.list('TiposCarga').find((x) => x.nombre === 'Vacío'), undefined);
});

test('manager: deactivate from the "in use" warning and reorder with the arrows', async () => {
  await vista();
  await abrirGestor();
  await crearContenido(c.container.querySelector('#cg-gestor'), { nombre: 'Uno' });
  await crearContenido(c.container.querySelector('#cg-gestor'), { nombre: 'Dos' });
  const orden = () => [...c.container.querySelectorAll('#cg-gestor .tc-nombre')].map((n) => n.textContent).slice(-2);
  assert.deepEqual(orden(), ['Uno', 'Dos']);
  boton(item(c.container, 'Dos'), 'Subir').click();
  await tick();
  assert.deepEqual(orden(), ['Dos', 'Uno']);
  assert.equal(boton(item(c.container, 'Dos'), 'Subir').disabled, true);
  c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 100, tipo: 'Dos' });
  boton(item(c.container, 'Dos'), 'Eliminar').click();
  await tick();
  buttonByText(modal(), 'Desactivar').click();
  await tick(10);
  assert.equal(c.store.list('TiposCarga').find((x) => x.nombre === 'Dos').activo, 'false');
});

test('targets: ONE single button saves all changes (all or nothing) and the alerts match in Cargas and Inicio', async () => {
  await vista();
  const form = c.container.querySelector('form.cg-obj');
  assert.equal([...form.querySelectorAll('button')].length, 1, 'one save button, not one per row');
  const fila = (nombre) => [...form.querySelectorAll('tbody tr')].find((tr) => tr.firstChild.textContent === nombre);
  const [bmn, bmx] = fila('Brazos').querySelectorAll('input');
  const [pmn, pmx] = fila('Piernas').querySelectorAll('input');
  const piernasAntes = c.store.get('TiposCarga', 'tc-piernas').minSemanalM;
  bmn.value = '5000'; bmx.value = '2000'; pmn.value = '300'; pmx.value = '900';
  buttonByText(form, 'Guardar objetivos').click();
  await tick();
  assert.equal(c.store.get('TiposCarga', 'tc-brazos').minSemanalM, '', 'min > max does not save');
  assert.equal(c.store.get('TiposCarga', 'tc-piernas').minSemanalM, piernasAntes, 'not even the valid rows (all or nothing)');
  assert.equal(c.container.querySelector('form.cg-obj [aria-invalid="true"]'), bmx);
  assert.match(c.container.querySelector('form.cg-obj .field-error').textContent, /mínimo no puede superar/);
  const f2 = c.container.querySelector('form.cg-obj');
  const f2fila = (nombre) => [...f2.querySelectorAll('tbody tr')].find((tr) => tr.firstChild.textContent === nombre);
  const [mn, mx] = f2fila('Brazos').querySelectorAll('input');
  mn.value = '100'; mx.value = '900';
  buttonByText(f2, 'Guardar objetivos').click();
  await tick();
  const b = c.store.get('TiposCarga', 'tc-brazos');
  assert.deepEqual([b.minSemanalM, b.maxSemanalM], [100, 900]);
  assert.match(document.getElementById('toasts').textContent, /Objetivos guardados/);

  // unreachable target: the same shortfall must show in both views
  const lunes = new Date(); lunes.setHours(0, 0, 0, 0); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  const { crearCargasService } = await import('../../js/application/cargasService.js');
  const svc = crearCargasService(c.store, { generarId: () => 'x' });
  const ev = svc.semana(lunes).evaluacion;
  assert.ok(ev.some((e) => e.tipo.id === 'tc-brazos' && e.estado === 'bajo' && e.diferencia === 100));
  await vista();
  assert.ok(c.container.querySelector('.alert--warn, .alert--danger'), 'alerts use the shared .alert');
  assert.ok([...c.container.querySelectorAll('.alert--warn')].some((a) => /Brazos/.test(a.textContent)));
  await renderView('inicio', c.container, [], c);
  const txt = c.container.querySelector('.ini-card').parentElement.textContent;
  assert.match(txt, /Faltan 100 m/);
  assert.doesNotMatch(txt, /undefined|NaN/);
});

test('deleting a load can be undone', async () => {
  const carga = c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 4321, tipo: 'Técnica' });
  await vista();
  const fila = () => c.container.querySelector(`tr[data-id="${carga.id}"]`);
  assert.ok(fila());
  fila().querySelector('button[aria-label^="Eliminar la carga"]').click();
  await tick();
  assert.equal(c.store.get('Cargas', carga.id), null);
  assert.equal(fila(), null);
  const undo = [...document.querySelectorAll('#toasts .toast-action')].find((b) => /Deshacer/.test(b.textContent));
  assert.ok(undo, 'toast with Undo');
  undo.click();
  await tick();
  assert.equal(c.store.get('Cargas', carga.id).metros, 4321);
  assert.ok(fila());
});

test('charts reflow: content list, bars per day with 7 rows and legend with chips', async () => {
  c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 3000, tipo: 'Técnica' });
  await vista();
  assert.ok(c.container.querySelector('ul[aria-label="Metros semanales por tipo"]'));
  assert.equal(c.container.querySelectorAll('ul[aria-label="Metros por día"] > li').length, 7);
  assert.ok(c.container.querySelector('.cg-legend .tc-chip'));
  assert.equal(c.container.querySelector('.cg-grid svg:not(.icon)'), null, 'no tiny SVG text on phones');
});

test('home: alerts with "Exceso de" and "Faltan" translated', async () => {
  c.store.upsert('TiposCarga', { ...c.store.get('TiposCarga', 'tc-alactico'), minSemanalM: '', maxSemanalM: 100 });
  c.store.upsert('TiposCarga', { ...c.store.get('TiposCarga', 'tc-salidas'), minSemanalM: 2300, maxSemanalM: '' });
  c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 5000, tipo: 'Aláctico / Sprint' });
  await renderView('inicio', c.container, [], c);
  const t = c.container.textContent;
  assert.match(t, /Exceso de [\d.]+ m/);
  assert.match(t, /Faltan 2\.300 m/);
  const { setLang } = await import('../../js/presentation/i18n/i18n.js');
  setLang('en', { persist: false });
  await renderView('inicio', c.container, [], c);
  assert.match(c.container.textContent, /Excess of [\d,]+ m/);
  assert.match(c.container.textContent, /2,300 m short/);
  setLang('it', { persist: false });
  await renderView('inicio', c.container, [], c);
  assert.match(c.container.textContent, /Mancano 2\.300 m/);
  setLang('es', { persist: false });
});

test('settings include the training-content manager (editable)', async () => {
  await renderView('club', c.container, [], c);
  assert.match(c.container.textContent, /Contenidos de entrenamiento/);
  assert.equal(c.container.querySelectorAll('.tc-item').length, 10);
  await crearContenido(c.container, { nombre: 'Desde configuración' });
  assert.ok(c.store.list('TiposCarga').some((x) => x.nombre === 'Desde configuración'));
});

test('the swimmer profile shows the contents with the catalogue', async () => {
  await renderView('nadadores', c.container, ['n04'], c);
  assert.ok(c.container.querySelector('.tc-chip .tc-dot'), 'colour chip in the profile');
  c.store.upsert('Cargas', { nadadorId: 'n04', fecha: today(), metros: 1000, tipo: 'Hecho a mano' });
  assert.ok(c.container.querySelector('.tc-chip'), 'the profile still shows chips with the catalogue colour');
});

test('old loads with old types remain visible after opening the club (migration)', async () => {
  c.store.upsert('Cargas', { id: 'old', nadadorId: 'n01', fecha: today(), metros: 4321, tipo: 'Fuerza' });
  c.store.upsert('ObjetivosCarga', { id: 'oo', tipo: 'Fuerza', minSemanalM: 10, maxSemanalM: 5000 });
  const { crearCargasService } = await import('../../js/application/cargasService.js');
  assert.ok(crearCargasService(c.store, { generarId: () => 'tc-h' + Math.random().toString(36).slice(2) }).asegurarCatalogo() > 0); // same migration that runs when opening the club (see store.test.js)
  await vista();
  assert.ok(c.store.list('TiposCarga').some((x) => x.nombre === 'Fuerza' && x.predefinido === 'false'));
  assert.match(c.container.textContent, /Fuerza/);
  assert.match(c.container.textContent, /4\.321/);
});
