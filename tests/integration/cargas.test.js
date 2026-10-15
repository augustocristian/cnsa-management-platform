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
  assert.ok(m, 'se abre el formulario');
  setValue(fieldByLabel(m, 'Nombre'), datos.nombre);
  if (datos.descripcion) setValue(fieldByLabel(m, 'Descripción'), datos.descripcion);
  if (datos.min) setValue(fieldByLabel(m, 'Objetivo mínimo'), datos.min);
  if (datos.max) setValue(fieldByLabel(m, 'Objetivo máximo'), datos.max);
  buttonByText(m, 'Guardar').click();
  await tick(10);
}

test('el formulario ofrece el catálogo activo agrupado por categoría, con descripción de ayuda y "Añadir contenido…"', async () => {
  await vista();
  const form = c.container.querySelector('form.cg-form');
  const sel = form.elements.tipoId;
  assert.deepEqual([...sel.querySelectorAll('optgroup')].map((g) => g.label), ['Intensidad', 'Trabajo específico']);
  const nombres = opciones(sel);
  assert.equal(nombres.length, 11);
  assert.equal(nombres[0], 'Aeróbico ligero');
  assert.equal(nombres.at(-1), 'Añadir contenido…');
  assert.match(c.container.querySelector('#cg-tipo-ayuda').textContent, /Borg 4-5\/10/);
  sel.value = 'tc-alactico';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match(c.container.querySelector('#cg-tipo-ayuda').textContent, /Velocidad máxima/);
  assert.equal(sel.getAttribute('aria-describedby'), 'cg-tipo-ayuda');
  assert.ok(form.elements.entrenamientoId, 'sesión opcional');
});

test('registrar una carga eligiendo contenido y sesión la vincula a ambos', async () => {
  await vista();
  const ses = c.store.list('Entrenamientos').find((e) => e.grupoId === 'g1');
  const form = c.container.querySelector('form.cg-form');
  form.elements.nadadorId.value = 'n04';
  form.elements.fecha.value = today();
  form.elements.tipoId.value = 'tc-tecnica';
  form.elements.entrenamientoId.value = ses.id;
  form.elements.metros.value = '2400';
  form.elements.notas.value = 'vinculada';
  form.requestSubmit();
  await tick();
  const r = c.store.list('Cargas').find((x) => x.notas === 'vinculada');
  assert.deepEqual([r.tipo, r.entrenamientoId, r.metros], ['Técnica', ses.id, 2400]);
  assert.match(c.container.textContent, new RegExp(ses.titulo));
});

test('gestor: crear un contenido manual, rechazar el nombre duplicado y usarlo al registrar', async () => {
  await vista();
  await abrirGestor();
  const gestor = c.container.querySelector('#cg-gestor');
  assert.equal(gestor.querySelectorAll('.tc-item').length, 10);
  await crearContenido(gestor, { nombre: 'Aguas abiertas', descripcion: 'Nado en mar', min: '1000', max: '3000' });
  const t = c.store.list('TiposCarga').find((x) => x.nombre === 'Aguas abiertas');
  assert.deepEqual([t.categoria, t.predefinido, t.activo, t.minSemanalM, t.maxSemanalM], ['personalizado', 'false', 'true', 1000, 3000]);
  assert.ok(item(c.container, 'Aguas abiertas'));
  assert.match(c.container.textContent, /Contenido «Aguas abiertas» creado|Personalizados/);

  // duplicado (sin distinguir mayúsculas ni tildes): error y no guarda
  buttonByText(c.container.querySelector('#cg-gestor'), 'Nuevo contenido').click();
  setValue(fieldByLabel(modal(), 'Nombre'), 'AGUAS ABIERTAS');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  assert.ok(modal(), 'el modal sigue abierto');
  assert.match(modal().querySelector('.tc-error').textContent, /Ya existe un contenido con ese nombre/);
  assert.equal(c.store.list('TiposCarga').filter((x) => x.nombre.toLowerCase().includes('aguas')).length, 1);
  // nombre vacío
  setValue(fieldByLabel(modal(), 'Nombre'), '  ');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  assert.match(modal().querySelector('.tc-error').textContent, /obligatorio/);
  buttonByText(modal(), 'Cancelar').click();
  await tick();

  const form = c.container.querySelector('form.cg-form');
  assert.ok(opciones(form.elements.tipoId).includes('Aguas abiertas'));
  form.elements.nadadorId.value = 'n05';
  form.elements.fecha.value = today();
  form.elements.tipoId.value = t.id;
  form.elements.metros.value = '1800';
  form.requestSubmit();
  await tick();
  assert.equal(c.store.list('Cargas').filter((x) => x.tipo === 'Aguas abiertas').length, 1);
  assert.match(c.container.querySelector('.cg-ctrack') ? c.container.textContent : '', /Aguas abiertas/);
});

test('"Añadir contenido…" en el formulario crea uno al vuelo, lo selecciona y conserva lo escrito', async () => {
  await vista();
  const form = c.container.querySelector('form.cg-form');
  form.elements.metros.value = '1234';
  form.elements.notas.value = 'borrador';
  form.elements.tipoId.value = '__nuevo__';
  form.elements.tipoId.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.ok(modal());
  assert.notEqual(form.elements.tipoId.value, '__nuevo__', 'no se queda en la opción de añadir');
  setValue(fieldByLabel(modal(), 'Nombre'), 'Apnea');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  const nuevo = c.store.list('TiposCarga').find((x) => x.nombre === 'Apnea');
  const f2 = c.container.querySelector('form.cg-form');
  assert.equal(f2.elements.tipoId.value, nuevo.id);
  assert.deepEqual([f2.elements.metros.value, f2.elements.notas.value], ['1234', 'borrador']);
});

test('gestor: desactivar quita el contenido del selector y reactivar lo devuelve; los predefinidos no se borran', async () => {
  await vista();
  await abrirGestor();
  let li = item(c.container, 'Brazos');
  assert.equal(boton(li, 'Eliminar'), undefined, 'predefinido sin botón de eliminar');
  boton(li, 'Desactivar').click();
  await tick();
  assert.equal(c.store.get('TiposCarga', 'tc-brazos').activo, 'false');
  assert.ok(!opciones(c.container.querySelector('form.cg-form').elements.tipoId).includes('Brazos'));
  li = item(c.container, 'Brazos');
  assert.ok(li.classList.contains('tc-inactivo'));
  boton(li, 'Activar').click();
  await tick();
  assert.equal(c.store.get('TiposCarga', 'tc-brazos').activo, 'true');
  assert.ok(opciones(c.container.querySelector('form.cg-form').elements.tipoId).includes('Brazos'));
});

test('gestor: editar un predefinido cambia descripción, color y objetivos pero no el nombre', async () => {
  await vista();
  await abrirGestor();
  boton(item(c.container, 'Piernas'), 'Editar').click();
  const m = modal();
  assert.equal(fieldByLabel(m, 'Nombre').disabled, true);
  setValue(fieldByLabel(m, 'Descripción'), 'Patada con aletas');
  setValue(fieldByLabel(m, 'Color'), '#112233');
  setValue(fieldByLabel(m, 'Objetivo mínimo'), '600');
  setValue(fieldByLabel(m, 'Objetivo máximo'), '300'); // inválido
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.match(modal().querySelector('.tc-error').textContent, /mínimo no puede superar/);
  setValue(fieldByLabel(modal(), 'Objetivo máximo'), '1800');
  buttonByText(modal(), 'Guardar').click();
  await tick(10);
  const p = c.store.get('TiposCarga', 'tc-piernas');
  assert.deepEqual([p.nombre, p.descripcion, p.color, p.minSemanalM, p.maxSemanalM], ['Piernas', 'Patada con aletas', '#112233', 600, 1800]);
  assert.match(item(c.container, 'Piernas').textContent, /Patada con aletas/);
});

test('gestor: no se borra un contenido con cargas (desactivar o fusionar); sin cargas se borra con confirmación', async () => {
  await vista();
  await abrirGestor();
  await crearContenido(c.container.querySelector('#cg-gestor'), { nombre: 'Temporal' });
  await crearContenido(c.container.querySelector('#cg-gestor'), { nombre: 'Vacío' });
  const temp = c.store.list('TiposCarga').find((x) => x.nombre === 'Temporal');
  c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 700, tipo: 'Temporal' });

  boton(item(c.container, 'Temporal'), 'Eliminar').click();
  await tick();
  assert.match(modal().textContent, /tiene 1 cargas registradas, así que no se puede eliminar/);
  assert.ok(c.store.get('TiposCarga', temp.id), 'sigue existiendo');
  const sel = modal().querySelector('select');
  sel.value = 'tc-tecnica';
  buttonByText(modal(), 'Fusionar y eliminar').click();
  await tick(10);
  assert.equal(c.store.get('TiposCarga', temp.id), null);
  assert.ok(c.store.list('Cargas').some((x) => x.notas === '' && x.metros === 700 && x.tipo === 'Técnica') || c.store.list('Cargas').some((x) => x.tipo === 'Técnica' && Number(x.metros) === 700));

  boton(item(c.container, 'Vacío'), 'Eliminar').click();
  await tick();
  buttonByText(document.body.querySelector('.modal'), 'Eliminar').click();
  await tick(10);
  assert.equal(c.store.list('TiposCarga').find((x) => x.nombre === 'Vacío'), undefined);
});

test('gestor: desactivar desde el aviso de "en uso" y reordenar con las flechas', async () => {
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

test('rol nadador: ve el catálogo y los datos pero sin formulario ni acciones de gestión', async () => {
  // Rol de sólo lectura inyectado en el ctx (la vista y el servicio consultan auth.role())
  const ctxNadador = { ...c, auth: { role: () => 'nadador' } };
  await renderView('cargas', c.container, [], ctxNadador);
  assert.equal(c.container.querySelector('form.cg-form'), null);
  await abrirGestor();
  const g = c.container.querySelector('#cg-gestor');
  assert.equal(g.querySelectorAll('.tc-item').length, 10);
  assert.equal(g.querySelectorAll('button').length, 0);
  assert.ok([...c.container.querySelectorAll('.cg-obj input')].every((i) => i.disabled));
  // aunque se llame al servicio directamente, no escribe
  const { crearCargasService } = await import('../../js/application/cargasService.js');
  const svc = crearCargasService(c.store, { puedeEditar: () => ctxNadador.auth.role() !== 'nadador' });
  assert.throws(() => svc.crear({ nombre: 'Hack' }), (e) => e.code === 'sin-permiso');
});

test('objetivos: guardar desde la tabla actualiza el contenido y las alertas usan los mismos criterios en Cargas e Inicio', async () => {
  await vista();
  const fila = [...c.container.querySelectorAll('.cg-obj tbody tr')].find((tr) => tr.firstChild.textContent === 'Brazos');
  const [mn, mx] = fila.querySelectorAll('input');
  mn.value = '5000'; mx.value = '2000';
  fila.querySelector('button').click();
  assert.equal(c.store.get('TiposCarga', 'tc-brazos').minSemanalM, '', 'mín > máx no guarda');
  mn.value = '100'; mx.value = '900';
  fila.querySelector('button').click();
  const b = c.store.get('TiposCarga', 'tc-brazos');
  assert.deepEqual([b.minSemanalM, b.maxSemanalM], [100, 900]);

  // objetivo imposible de cumplir: debe faltar lo mismo en las dos vistas
  const lunes = new Date(); lunes.setHours(0, 0, 0, 0); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
  const { crearCargasService } = await import('../../js/application/cargasService.js');
  const svc = crearCargasService(c.store);
  const ev = svc.semana(lunes).evaluacion;
  assert.ok(ev.some((e) => e.tipo.id === 'tc-brazos' && e.estado === 'bajo' && e.diferencia === 100));
  await vista();
  assert.match(c.container.querySelector('.cg-alert.lo, .cg-alert.hi').textContent, /\S/);
  await renderView('inicio', c.container, [], c);
  const txt = c.container.querySelector('.ini-card').parentElement.textContent;
  assert.match(txt, /Faltan 100 m/);
  assert.doesNotMatch(txt, /undefined|NaN/);
});

test('inicio: alertas con "Exceso de" y "Faltan" traducidos y gráfico con los colores del catálogo', async () => {
  c.store.upsert('TiposCarga', { ...c.store.get('TiposCarga', 'tc-alactico'), minSemanalM: '', maxSemanalM: 100 });
  c.store.upsert('TiposCarga', { ...c.store.get('TiposCarga', 'tc-salidas'), minSemanalM: 2300, maxSemanalM: '' });
  c.store.upsert('Cargas', { nadadorId: 'n01', fecha: today(), metros: 5000, tipo: 'Aláctico / Sprint' });
  await renderView('inicio', c.container, [], c);
  const t = c.container.textContent;
  assert.match(t, /Exceso de [\d.]+ m/);
  assert.match(t, /Faltan 2\.300 m/);
  assert.ok(c.container.querySelector('.ini-chart svg rect[fill="#d93025"]'), 'barras con el color del contenido');
  const { setLang } = await import('../../js/i18n.js');
  setLang('en', { persist: false });
  await renderView('inicio', c.container, [], c);
  assert.match(c.container.textContent, /Excess of [\d,]+ m/);
  assert.match(c.container.textContent, /2,300 m short/);
  setLang('it', { persist: false });
  await renderView('inicio', c.container, [], c);
  assert.match(c.container.textContent, /Mancano 2\.300 m/);
  setLang('es', { persist: false });
});

test('configuración incluye el gestor de contenidos (editable por el admin)', async () => {
  await renderView('club', c.container, [], { ...c, auth: { role: () => 'admin' } });
  assert.match(c.container.textContent, /Contenidos de entrenamiento/);
  assert.equal(c.container.querySelectorAll('.tc-item').length, 10);
  await crearContenido(c.container, { nombre: 'Desde configuración' });
  assert.ok(c.store.list('TiposCarga').some((x) => x.nombre === 'Desde configuración'));
});

test('la ficha de nadador muestra los contenidos con el catálogo', async () => {
  await renderView('nadadores', c.container, ['n04'], c);
  assert.ok(c.container.querySelector('.tc-chip .tc-dot'), 'chip de color en la ficha');
  c.store.upsert('Cargas', { nadadorId: 'n04', fecha: today(), metros: 1000, tipo: 'Hecho a mano' });
  assert.ok(c.container.querySelector('.tc-chip'), 'la ficha sigue mostrando chips con el color del catálogo');
});

test('cargas antiguas con tipos viejos siguen visibles tras abrir el club (migración)', async () => {
  c.store.upsert('Cargas', { id: 'old', nadadorId: 'n01', fecha: today(), metros: 4321, tipo: 'Fuerza' });
  c.store.upsert('ObjetivosCarga', { id: 'oo', tipo: 'Fuerza', minSemanalM: 10, maxSemanalM: 5000 });
  const { crearCargasService } = await import('../../js/application/cargasService.js');
  assert.ok(crearCargasService(c.store).asegurarCatalogo() > 0); // misma migración que se ejecuta al abrir el club (ver store.test.js)
  await vista();
  assert.ok(c.store.list('TiposCarga').some((x) => x.nombre === 'Fuerza' && x.predefinido === 'false'));
  assert.match(c.container.textContent, /Fuerza/);
  assert.match(c.container.textContent, /4\.321/);
});
