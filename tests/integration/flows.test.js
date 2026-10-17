import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';

let c;
// Each test starts with a clean DOM and a seeded store (no hooks: the files share a process via index.js).
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const today = () => c.ui.isoDate(new Date());
const submit = (form) => form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));

test('create a swimmer from the modal and see it in the list', async () => {
  c.store.setClub({ ...c.store.club, temporadaActual: '2026-2027' });
  await renderView('nadadores', c.container, [], c);
  const before = c.store.list('Nadadores').length;
  buttonByText(c.container, 'Nuevo nadador').click();
  const ov = document.querySelector('.sheet-overlay');
  assert.ok(ov, 'the modal did not open');

  // validation: without a name it does not save, the modal stays open and the error appears next to the field
  buttonByText(ov, 'Guardar').click();
  await tick();
  assert.equal(c.store.list('Nadadores').length, before);
  assert.ok(document.querySelector('.sheet-overlay'));
  assert.equal(fieldByLabel(ov, 'Nombre').getAttribute('aria-invalid'), 'true');
  assert.match(ov.querySelector('.field-error').textContent, /Escribe el nombre/);

  setValue(fieldByLabel(ov, 'Nombre'), 'Zoe');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Zamora Test');
  setValue(fieldByLabel(ov, 'Fecha de nacimiento'), '2014-05-05'); // the category is computed: Alevín in the 2026-2027 season
  setValue(fieldByLabel(ov, 'Grupo'), 'g2');
  buttonByText(ov, 'Guardar').click();
  await tick();

  assert.equal(document.querySelector('.sheet-overlay'), null, 'modal closed');
  const nuevo = c.store.list('Nadadores').find((n) => n.nombre === 'Zoe');
  assert.ok(nuevo && nuevo.id);
  assert.equal(nuevo.grupoId, 'g2');
  assert.equal(nuevo.categoria, 'Alevín');
  assert.equal(nuevo.categoriaManual, '');
  assert.equal(c.store.list('Nadadores').length, before + 1);
  assert.match(c.container.textContent, /Zamora Test, Zoe/);
  assert.match(c.container.textContent, new RegExp(`${before + 1} nadadores`));
});

test('swimmer list: search and filters', async () => {
  await renderView('nadadores', c.container, [], c);
  const rows = () => c.container.querySelectorAll('tbody tr.nad-row').length;
  assert.equal(rows(), 12);
  setValue(c.container.querySelector('input[type=search]'), 'alvaro'); // without accents
  assert.equal(rows(), 1);
  setValue(c.container.querySelector('input[type=search]'), '');
  setValue(c.container.querySelectorAll('select')[0], 'Infantil');
  assert.equal(rows(), 2);
});

test('clicking a row navigates to the profile and the profile shows data', async () => {
  await renderView('nadadores', c.container, [], c);
  c.container.querySelector('tr.nad-row').click();
  assert.match(location.hash, /^#\/nadadores\/n\d+$/);
  const id = location.hash.split('/')[2];
  await renderView('nadadores', c.container, [id], c);
  const n = c.store.get('Nadadores', id);
  assert.ok(c.container.textContent.includes(`${n.nombre} ${n.apellidos}`));
  for (const t of ['Asistencia', 'Cargas', 'Evolución de marcas', 'Licencia']) assert.ok(c.container.textContent.includes(t), t);
  assert.ok(c.container.querySelector('svg.nad-chart'), 'times chart');
});

test('non-existent swimmer profile and profile via hash', async () => {
  await renderView('nadadores', c.container, ['nope'], c);
  assert.match(c.container.textContent, /no encontrado/i);
  location.hash = '#/nadadores/n05';
  await renderView('nadadores', c.container, undefined, c);
  assert.match(c.container.textContent, /Álvaro/);
});

test('edit and delete a swimmer from the profile', async () => {
  await renderView('nadadores', c.container, ['n01'], c);
  buttonByText(c.container, 'Editar').click();
  const ov = document.querySelector('.sheet-overlay');
  setValue(fieldByLabel(ov, 'Notas'), 'Nota de prueba');
  buttonByText(ov, 'Guardar').click();
  await tick();
  assert.equal(c.store.get('Nadadores', 'n01').notas, 'Nota de prueba');
  assert.match(c.container.textContent, /Nota de prueba/);

  // deleting is undoable: no dialog, with a «Deshacer» (Undo) notice
  const antes = ['Asistencia', 'Cargas', 'Marcas'].map((sheet) => c.store.list(sheet).filter((a) => a.nadadorId === 'n01').length);
  buttonByText(c.container, 'Eliminar').click();
  await tick(10);
  assert.equal(c.store.get('Nadadores', 'n01'), null);
  for (const sheet of ['Asistencia', 'Cargas', 'Marcas']) {
    assert.equal(c.store.list(sheet).filter((a) => a.nadadorId === 'n01').length, 0, sheet);
  }
  buttonByText(document.querySelector('#toasts'), 'Deshacer').click();
  await tick(10);
  assert.ok(c.store.get('Nadadores', 'n01'), 'undo brings the swimmer back');
  assert.deepEqual(['Asistencia', 'Cargas', 'Marcas'].map((sheet) => c.store.list(sheet).filter((a) => a.nadadorId === 'n01').length), antes);
});

test('groups: create a group from the modal', async () => {
  await renderView('grupos', c.container, [], c);
  buttonByText(c.container, 'Nuevo grupo').click();
  const input = document.querySelector('body > div input[type=text]');
  assert.ok(input, 'group modal');
  input.value = 'Grupo Nuevo';
  buttonByText(input.closest('body > div'), 'Guardar').click();
  await tick();
  assert.ok(c.store.list('Grupos').some((g) => g.nombre === 'Grupo Nuevo'));
  assert.match(c.container.textContent, /Grupo Nuevo/);
});

test('attendance: one tap marks present, tapping again clears it, "Marcar todos" uses a single write and can be undone', async () => {
  const ses = c.store.upsert('Entrenamientos', { fecha: today(), hora: '10:00', titulo: 'Sesión test', grupoId: 'g1', estado: 'planificado' });
  await renderView('asistencia', c.container, [ses.id], c);
  const regs = () => c.store.list('Asistencia').filter((a) => a.entrenamientoId === ses.id);
  const tarjetas = () => [...c.container.querySelectorAll('li.asi-card')];
  const pulsar = (i, estado) => tarjetas()[i].querySelector('.asi-btn[data-estado="' + estado + '"]').click();
  assert.equal(tarjetas().length, 3, 'g1 has 3 swimmers');
  assert.equal(regs().length, 0);
  assert.ok(tarjetas().every((t) => t.dataset.estado === ''), 'nobody is marked by default');

  pulsar(0, 'presente');
  await tick();
  assert.equal(regs().length, 1);
  assert.equal(regs()[0].estado, 'presente');
  assert.match(c.container.textContent, /1 presentes/);
  assert.match(c.container.textContent, /1 de 3 marcados/);
  pulsar(0, 'ausente'); await tick();
  assert.equal(regs()[0].estado, 'ausente');
  pulsar(0, 'ausente'); await tick();
  assert.equal(regs().length, 0, 'tapping the same state clears it');

  const marcar = [...c.container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Marcar todos presentes');
  marcar.click();
  await tick(10);
  assert.equal(regs().length, 3);
  assert.ok(regs().every((r) => r.estado === 'presente'));
  const ids = new Set(c.store.list('Nadadores').filter((n) => n.grupoId === 'g1').map((n) => n.id));
  assert.ok(regs().every((r) => ids.has(r.nadadorId)));
  const undo = [...document.querySelectorAll('#toasts .toast-action')].find((b) => /Deshacer/.test(b.textContent));
  assert.ok(undo, 'undo toast after the bulk action');
  undo.click();
  await tick(10);
  assert.equal(regs().length, 0);
});

test('attendance: history per swimmer', async () => {
  await renderView('asistencia', c.container, [], c);
  buttonByText(c.container, 'Historial').click();
  assert.match(c.container.textContent, /% asistencia/);
  assert.ok(c.container.querySelectorAll('tbody tr').length >= 12);
  c.container.querySelector('tbody tr').click();
  assert.ok(c.container.querySelector('tr.asi-det'));
});

test('attendance without sessions shows a notice', async () => {
  c = await fresh({ demo: false });
  await renderView('asistencia', c.container, [], c);
  assert.match(c.container.textContent, /No hay sesiones/);
});

test('training: create a session from the form', async () => {
  await renderView('entrenamientos', c.container, [], c);
  const before = c.store.list('Entrenamientos').length;
  buttonByText(c.container, 'Nueva sesión').click();
  const m = document.querySelector('.sheet');
  assert.ok(m);
  setValue(fieldByLabel(m, 'Título'), 'Sesión creada en test');
  setValue(fieldByLabel(m, 'Fecha'), today());
  setValue(fieldByLabel(m, 'Hora'), '09:15');
  setValue(fieldByLabel(m, 'Duración (min)'), '60');
  setValue(fieldByLabel(m, 'Grupo'), 'g3');
  setValue(fieldByLabel(m, 'Volumen objetivo mín.'), '3000');
  setValue(fieldByLabel(m, 'Volumen objetivo máx.'), '3500');
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.equal(c.store.list('Entrenamientos').length, before + 1);
  const s = c.store.list('Entrenamientos').find((e) => e.titulo === 'Sesión creada en test');
  assert.ok(s);
  assert.equal(s.hora, '09:15');
  assert.equal(s.grupoId, 'g3');
  assert.equal(s.estado, 'planificado');
  assert.equal(document.querySelector('.sheet'), null);
  assert.match(c.container.textContent, /Sesión creada en test/);
});

test('training: minimum volume > maximum does not save', async () => {
  await renderView('entrenamientos', c.container, [], c);
  const before = c.store.list('Entrenamientos').length;
  buttonByText(c.container, 'Nueva sesión').click();
  const m = document.querySelector('.sheet');
  setValue(fieldByLabel(m, 'Título'), 'Mala');
  setValue(fieldByLabel(m, 'Fecha'), today());
  setValue(fieldByLabel(m, 'Volumen objetivo mín.'), '5000');
  setValue(fieldByLabel(m, 'Volumen objetivo máx.'), '1000');
  buttonByText(m, 'Guardar').click();
  await tick(10);
  assert.equal(c.store.list('Entrenamientos').length, before);
  assert.match(m.querySelector('.field-error').textContent, /El volumen mínimo no puede superar el máximo/);
});

test('training: mark as done and reopen from the session menu', async () => {
  const s = c.store.upsert('Entrenamientos', { fecha: today(), hora: '07:00', titulo: 'Para cambiar', grupoId: 'g1', estado: 'planificado' });
  await renderView('entrenamientos', c.container, [], c);
  const fila = () => [...c.container.querySelectorAll('.ent-sess')].find((e) => e.textContent.includes('Para cambiar'));
  const elegir = (texto) => { fila().querySelector('button[aria-haspopup="menu"]').click(); [...document.querySelectorAll('.enp-mn [role="menuitem"]')].find((b) => b.textContent.trim() === texto).click(); };
  elegir('Marcar realizado');
  await tick();
  assert.equal(c.store.get('Entrenamientos', s.id).estado, 'realizado');
  elegir('Reabrir');
  await tick();
  assert.equal(c.store.get('Entrenamientos', s.id).estado, 'planificado');
});

test('loads: log a load and see it in the week', async () => {
  await renderView('cargas', c.container, [], c);
  const before = c.store.list('Cargas').length;
  buttonByText(c.container, 'Registrar carga').click();
  const d = document.querySelector('.sheet');
  setValue(fieldByLabel(d, 'Nadador'), 'Carla Menéndez');
  setValue(fieldByLabel(d, 'Notas'), 'marca-test');
  setValue(fieldByLabel(d, 'Fecha'), today());
  d.querySelector('select[name="tipoId"]').value = 'tc-alactico';
  setValue(fieldByLabel(d, 'Metros'), '2400');
  setValue(fieldByLabel(d, 'RPE'), '7');
  setValue(fieldByLabel(d, 'Minutos'), '75');
  buttonByText(d, 'Registrar').click();
  await tick(10);
  assert.equal(c.store.list('Cargas').length, before + 1);
  const r = c.store.list('Cargas').find((x) => x.notas === 'marca-test');
  assert.deepEqual([r.nadadorId, r.tipo, r.rpe, r.minutos, r.fecha], ['n04', 'Aláctico / Sprint', 7, 75, today()]);
  assert.match(c.container.textContent, /Carla Menéndez Vigil/);
});

test('loads: without metres it does not log', async () => {
  await renderView('cargas', c.container, [], c);
  const before = c.store.list('Cargas').length;
  buttonByText(c.container, 'Registrar carga').click();
  const d = document.querySelector('.sheet');
  setValue(fieldByLabel(d, 'Nadador'), 'Carla Menéndez');
  buttonByText(d, 'Registrar').click();
  await tick();
  assert.equal(c.store.list('Cargas').length, before);
  assert.match(d.textContent, /Indica los metros/);
});

test('loads: save weekly target', async () => {
  await renderView('cargas', c.container, [], c);
  const form = c.container.querySelector('form.cg-obj');
  const fila = [...form.querySelectorAll('tbody tr')].find((tr) => tr.firstChild.textContent === 'Brazos');
  const [mn, mx] = fila.querySelectorAll('input');
  mn.value = '100'; mx.value = '900';
  buttonByText(form, 'Guardar objetivos').click();
  const o = c.store.get('TiposCarga', 'tc-brazos');
  assert.deepEqual([o.minSemanalM, o.maxSemanalM], [100, 900]);
});

test('times: log a valid time (sheet with numeric mask)', async () => {
  await renderView('marcas', c.container, [], c);
  const before = c.store.list('Marcas').length;
  buttonByText(c.container, 'Registrar marca').click();
  const d = document.querySelector('.sheet');
  setValue(fieldByLabel(d, 'Nadador'), 'Marcos');
  setValue(fieldByLabel(d, 'Fecha'), today());
  setValue(fieldByLabel(d, 'Prueba'), '50 Libre');
  setValue(fieldByLabel(d, 'Piscina'), '25');
  const tiempo = fieldByLabel(d, 'Tiempo');
  setValue(tiempo, '2785');
  assert.equal(tiempo.value, '27.85');
  assert.equal(tiempo.getAttribute('inputmode'), 'numeric');
  assert.match(d.textContent, /Se guardará como 00:27\.85/);
  setValue(fieldByLabel(d, 'Competición'), 'Test Cup');
  buttonByText(d, 'Registrar').click();
  await tick(10);
  assert.equal(c.store.list('Marcas').length, before + 1);
  const m = c.store.list('Marcas').find((x) => x.competicion === 'Test Cup');
  assert.equal(m.tiempoMs, 27850);
  assert.equal(m.prueba, '50 Libre');
  assert.match(c.container.textContent, /00:27\.85/);
});

test('times: invalid time is not saved and is explained inline', async () => {
  await renderView('marcas', c.container, [], c);
  const before = c.store.list('Marcas').length;
  buttonByText(c.container, 'Registrar marca').click();
  const d = document.querySelector('.sheet');
  setValue(fieldByLabel(d, 'Nadador'), 'Marcos');
  setValue(fieldByLabel(d, 'Tiempo'), '17550');
  buttonByText(d, 'Registrar').click();
  await tick();
  assert.equal(c.store.list('Marcas').length, before);
  assert.match(d.querySelector('.field-error').textContent, /Tiempo no válido/);
  assert.ok(c.store.list('Marcas').every((m) => Number.isFinite(m.tiempoMs)));
});

test('times: the progression is drawn by default for the swimmer with most times and when filtering', async () => {
  await renderView('marcas', c.container, [], c);
  assert.ok(c.container.querySelector('svg.mc-svg'), 'chart without choosing anything');
  const m = c.store.list('Marcas')[0];
  setValue(c.container.querySelectorAll('.mc-filters select')[0], m.nadadorId);
  assert.ok(c.container.querySelector('svg.mc-svg'));
});

test('notices and notes: saving a notice with HTML in the title escapes it', async () => {
  await renderView('comunicaciones', c.container, [], c);
  const form = c.container.querySelector('form.cm-form');
  form.elements.titulo.value = 'Aviso <b>test</b>';
  form.elements.texto.value = 'Texto de prueba';
  form.elements.grupoId.value = 'g2';
  form.requestSubmit();
  await tick();
  const a = c.store.list('Comunicaciones').find((x) => x.texto === 'Texto de prueba');
  assert.ok(a);
  assert.equal(a.grupoId, 'g2');
  assert.equal(c.container.querySelector('h3 b'), null);
  assert.ok(c.container.textContent.includes('Aviso <b>test</b>'));
});

test('individual use: forms and edit actions are always available (no roles)', async () => {
  assert.equal(c.auth.role, undefined, 'there are no roles');
  assert.equal(c.auth.setDemoRole, undefined, 'there is no role selector');
  await renderView('entrenamientos', c.container, [], c);
  assert.ok(c.container.textContent.includes('Nueva sesión'));
  for (const [name, sel] of [['cargas', '.cg-add'], ['marcas', '.mc-add'], ['comunicaciones', 'form.cm-form']]) {
    await renderView(name, c.container, [], c);
    assert.ok(c.container.querySelector(sel), `${name} should show ${sel}`);
  }
  await renderView('nadadores', c.container, [], c);
  assert.ok(buttonByText(c.container, 'Nuevo nadador'));
  await renderView('club', c.container, [], c);
  assert.ok(c.container.querySelector('input[type=text]'), 'Settings open for the only user');
});

test('notices and notes: all of them are shown (no per-group filter)', async () => {
  await renderView('comunicaciones', c.container, [], c);
  assert.ok(c.container.textContent.includes('Horarios de la próxima semana'));
  assert.ok(c.container.textContent.includes('Competición en Gijón'));
});
