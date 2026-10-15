import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';

let c;
// Cada test arranca con DOM limpio y store sembrado (sin hooks: los ficheros comparten proceso vía index.js).
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const today = () => c.ui.isoDate(new Date());
const submit = (form) => form.dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));

test('crear nadador desde el modal y verlo en el listado', async () => {
  await renderView('nadadores', c.container, [], c);
  const before = c.store.list('Nadadores').length;
  buttonByText(c.container, '+ Nuevo nadador').click();
  const ov = document.querySelector('.nad-ov');
  assert.ok(ov, 'no se abrió el modal');

  // validación: sin nombre no guarda y el modal sigue abierto
  buttonByText(ov, 'Guardar').click();
  assert.equal(c.store.list('Nadadores').length, before);
  assert.ok(document.querySelector('.nad-ov'));

  setValue(fieldByLabel(ov, 'Nombre'), 'Zoe');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Zamora Test');
  setValue(fieldByLabel(ov, 'Categoría'), 'Alevín');
  setValue(fieldByLabel(ov, 'Grupo'), 'g2');
  buttonByText(ov, 'Guardar').click();
  await tick();

  assert.equal(document.querySelector('.nad-ov'), null, 'modal cerrado');
  const nuevo = c.store.list('Nadadores').find((n) => n.nombre === 'Zoe');
  assert.ok(nuevo && nuevo.id);
  assert.equal(nuevo.grupoId, 'g2');
  assert.equal(c.store.list('Nadadores').length, before + 1);
  assert.match(c.container.textContent, /Zamora Test, Zoe/);
  assert.match(c.container.textContent, new RegExp(`${before + 1} nadadores`));
});

test('listado de nadadores: búsqueda y filtros', async () => {
  await renderView('nadadores', c.container, [], c);
  const rows = () => c.container.querySelectorAll('tbody tr.nad-row').length;
  assert.equal(rows(), 12);
  setValue(c.container.querySelector('input[type=search]'), 'alvaro'); // sin tildes
  assert.equal(rows(), 1);
  setValue(c.container.querySelector('input[type=search]'), '');
  setValue(c.container.querySelectorAll('select')[0], 'Infantil');
  assert.equal(rows(), 2);
});

test('clic en una fila navega a la ficha y la ficha muestra datos', async () => {
  await renderView('nadadores', c.container, [], c);
  c.container.querySelector('tr.nad-row').click();
  assert.match(location.hash, /^#\/nadadores\/n\d+$/);
  const id = location.hash.split('/')[2];
  await renderView('nadadores', c.container, [id], c);
  const n = c.store.get('Nadadores', id);
  assert.ok(c.container.textContent.includes(`${n.nombre} ${n.apellidos}`));
  for (const t of ['Asistencia', 'Cargas', 'Evolución de marcas', 'Licencia']) assert.ok(c.container.textContent.includes(t), t);
  assert.ok(c.container.querySelector('svg.nad-chart'), 'gráfico de marcas');
});

test('ficha de nadador inexistente y ficha vía hash', async () => {
  await renderView('nadadores', c.container, ['nope'], c);
  assert.match(c.container.textContent, /no encontrado/i);
  location.hash = '#/nadadores/n05';
  await renderView('nadadores', c.container, undefined, c);
  assert.match(c.container.textContent, /Álvaro/);
});

test('editar y eliminar nadador desde la ficha', async () => {
  await renderView('nadadores', c.container, ['n01'], c);
  buttonByText(c.container, 'Editar').click();
  const ov = document.querySelector('.nad-ov');
  setValue(fieldByLabel(ov, 'Notas'), 'Nota de prueba');
  buttonByText(ov, 'Guardar').click();
  await tick();
  assert.equal(c.store.get('Nadadores', 'n01').notas, 'Nota de prueba');
  assert.match(c.container.textContent, /Nota de prueba/);

  buttonByText(c.container, 'Eliminar').click();
  [...document.querySelectorAll('.modal-overlay button')].find((b) => b.textContent === 'Aceptar').click();
  await tick(10);
  assert.equal(c.store.get('Nadadores', 'n01'), null);
  for (const sheet of ['Asistencia', 'Cargas', 'Marcas', 'Banador']) {
    assert.equal(c.store.list(sheet).filter((a) => a.nadadorId === 'n01').length, 0, sheet);
  }
});

test('grupos: crear grupo desde el modal', async () => {
  await renderView('grupos', c.container, [], c);
  buttonByText(c.container, '+ Nuevo grupo').click();
  const input = document.querySelector('body > div input[type=text]');
  assert.ok(input, 'modal de grupo');
  input.value = 'Grupo Nuevo';
  buttonByText(input.closest('body > div'), 'Guardar').click();
  await tick();
  assert.ok(c.store.list('Grupos').some((g) => g.nombre === 'Grupo Nuevo'));
  assert.match(c.container.textContent, /Grupo Nuevo/);
});

test('asistencia: pasar lista guarda registros y cicla estados', async () => {
  const ses = c.store.upsert('Entrenamientos', { fecha: today(), hora: '10:00', titulo: 'Sesión test', grupoId: 'g1', estado: 'planificado' });
  await renderView('asistencia', c.container, [ses.id], c);
  const regs = () => c.store.list('Asistencia').filter((a) => a.entrenamientoId === ses.id);
  const botones = () => [...c.container.querySelectorAll('button.asi-sw')];
  assert.equal(botones().length, 3, 'g1 tiene 3 nadadores');
  assert.equal(regs().length, 0);

  botones()[0].click();
  await tick();
  assert.equal(regs().length, 1);
  assert.equal(regs()[0].estado, 'presente');
  assert.match(c.container.textContent, /Presentes: 1/);

  botones()[0].click(); await tick();
  assert.equal(regs()[0].estado, 'ausente');
  botones()[0].click(); await tick();
  assert.equal(regs()[0].estado, 'justificado');
  botones()[0].click(); await tick();
  assert.equal(regs().length, 0, 'cuarto clic = sin marcar');

  buttonByText(c.container, 'Marcar todos presentes').click();
  await tick(10);
  assert.equal(regs().length, 3);
  assert.ok(regs().every((r) => r.estado === 'presente'));
  const ids = new Set(c.store.list('Nadadores').filter((n) => n.grupoId === 'g1').map((n) => n.id));
  assert.ok(regs().every((r) => ids.has(r.nadadorId)));
});

test('asistencia: historial por nadador', async () => {
  await renderView('asistencia', c.container, [], c);
  buttonByText(c.container, 'Historial').click();
  assert.match(c.container.textContent, /% asistencia/);
  assert.ok(c.container.querySelectorAll('tbody tr').length >= 12);
  c.container.querySelector('tbody tr').click();
  assert.ok(c.container.querySelector('tr.asi-det'));
});

test('asistencia sin sesiones muestra aviso', async () => {
  c = await fresh({ demo: false });
  await renderView('asistencia', c.container, [], c);
  assert.match(c.container.textContent, /No hay sesiones/);
});

test('entrenamientos: crear sesión desde el formulario', async () => {
  await renderView('entrenamientos', c.container, [], c);
  const before = c.store.list('Entrenamientos').length;
  buttonByText(c.container, '+ Nueva sesión').click();
  const form = document.querySelector('.ent-ov form');
  assert.ok(form);
  form.elements.titulo.value = 'Sesión creada en test';
  form.elements.fecha.value = today();
  form.elements.hora.value = '09:15';
  form.elements.duracionMin.value = '60';
  form.elements.grupoId.value = 'g3';
  form.elements.volumenMin.value = '3000';
  form.elements.volumenMax.value = '3500';
  form.requestSubmit();
  await tick(10);
  assert.equal(c.store.list('Entrenamientos').length, before + 1);
  const s = c.store.list('Entrenamientos').find((e) => e.titulo === 'Sesión creada en test');
  assert.ok(s);
  assert.equal(s.hora, '09:15');
  assert.equal(s.grupoId, 'g3');
  assert.equal(s.estado, 'planificado');
  assert.equal(document.querySelector('.ent-ov'), null);
  assert.match(c.container.textContent, /Sesión creada en test/);
});

test('entrenamientos: volumen mínimo > máximo no guarda', async () => {
  await renderView('entrenamientos', c.container, [], c);
  const before = c.store.list('Entrenamientos').length;
  buttonByText(c.container, '+ Nueva sesión').click();
  const form = document.querySelector('.ent-ov form');
  form.elements.titulo.value = 'Mala';
  form.elements.fecha.value = today();
  form.elements.volumenMin.value = '5000';
  form.elements.volumenMax.value = '1000';
  form.requestSubmit();
  await tick(10);
  assert.equal(c.store.list('Entrenamientos').length, before);
});

test('entrenamientos: marcar realizado y reabrir', async () => {
  const s = c.store.upsert('Entrenamientos', { fecha: today(), hora: '07:00', titulo: 'Para cambiar', grupoId: 'g1', estado: 'planificado' });
  await renderView('entrenamientos', c.container, [], c);
  const fila = () => [...c.container.querySelectorAll('.ent-sess')].find((e) => e.textContent.includes('Para cambiar'));
  buttonByText(fila(), 'Marcar realizado').click();
  await tick();
  assert.equal(c.store.get('Entrenamientos', s.id).estado, 'realizado');
  buttonByText(fila(), 'Reabrir').click();
  await tick();
  assert.equal(c.store.get('Entrenamientos', s.id).estado, 'planificado');
});

test('cargas: registrar carga y verla en la semana', async () => {
  await renderView('cargas', c.container, [], c);
  const form = c.container.querySelector('form.cg-form');
  const before = c.store.list('Cargas').length;
  form.elements.nadadorId.value = 'n04';
  form.elements.notas.value = 'marca-test';
  form.elements.fecha.value = today();
  form.elements.tipo.value = 'Velocidad';
  form.elements.metros.value = '2400';
  form.elements.rpe.value = '7';
  form.elements.minutos.value = '75';
  form.requestSubmit();
  await tick();
  assert.equal(c.store.list('Cargas').length, before + 1);
  const r = c.store.list('Cargas').find((x) => x.notas === 'marca-test');
  assert.deepEqual([r.nadadorId, r.tipo, r.rpe, r.minutos, r.fecha], ['n04', 'Velocidad', 7, 75, today()]);
  assert.match(c.container.textContent, /Carla Menéndez Vigil/);
});

test('cargas: sin metros no registra', async () => {
  await renderView('cargas', c.container, [], c);
  const before = c.store.list('Cargas').length;
  const form = c.container.querySelector('form.cg-form');
  form.elements.nadadorId.value = 'n04';
  form.elements.metros.value = '';
  submit(form);
  await tick();
  assert.equal(c.store.list('Cargas').length, before);
});

test('cargas: guardar objetivo semanal', async () => {
  await renderView('cargas', c.container, [], c);
  const fila = [...c.container.querySelectorAll('.cg-obj tbody tr')].find((tr) => tr.firstChild.textContent === 'Fuerza');
  const [mn, mx] = fila.querySelectorAll('input');
  mn.value = '100'; mx.value = '900';
  fila.querySelector('button').click();
  const o = c.store.list('ObjetivosCarga').find((x) => x.tipo === 'Fuerza');
  assert.deepEqual([o.minSemanalM, o.maxSemanalM], [100, 900]);
});

test('marcas: registrar marca válida', async () => {
  await renderView('marcas', c.container, [], c);
  const form = c.container.querySelector('form.mc-form');
  const before = c.store.list('Marcas').length;
  form.elements.nadadorId.value = 'n05';
  form.elements.fecha.value = today();
  form.elements.prueba.value = '50 libre';
  form.elements.piscina.value = '25';
  form.elements.tiempo.value = '00:27.85';
  form.elements.competicion.value = 'Test Cup';
  form.requestSubmit();
  await tick();
  assert.equal(c.store.list('Marcas').length, before + 1);
  const m = c.store.list('Marcas').find((x) => x.competicion === 'Test Cup');
  assert.equal(m.tiempoMs, 27850);
  assert.match(c.container.textContent, /00:27\.85/);
});

test('marcas: tiempo inválido no se guarda', async () => {
  await renderView('marcas', c.container, [], c);
  const form = c.container.querySelector('form.mc-form');
  const before = c.store.list('Marcas').length;
  form.elements.nadadorId.value = 'n05';
  form.elements.fecha.value = today();
  form.elements.prueba.value = '50 libre';
  form.elements.tiempo.value = 'abc';
  submit(form);
  await tick();
  assert.equal(c.store.list('Marcas').length, before);
  assert.ok(c.store.list('Marcas').every((m) => Number.isFinite(m.tiempoMs)));
});

test('marcas: evolución con nadador y prueba seleccionados dibuja SVG', async () => {
  const m = c.store.list('Marcas')[0];
  await renderView('marcas', c.container, [], c);
  setValue(c.container.querySelectorAll('.mc-bar select')[0], m.nadadorId);
  setValue(c.container.querySelectorAll('.mc-bar select')[1], m.prueba);
  assert.ok(c.container.querySelector('svg.mc-svg'));
});

test('comunicaciones: publicar aviso con HTML en el título lo escapa', async () => {
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
  assert.equal(c.container.querySelector('h4 b'), null);
  assert.ok(c.container.textContent.includes('Aviso <b>test</b>'));
});

test('banador: marcar entregado exige talla y guarda fecha', async () => {
  c.store.upsert('Banador', { ...c.store.list('Banador').find((b) => b.nadadorId === 'n01'), talla: '' });
  await renderView('banador', c.container, [], c);
  const fila = () => [...c.container.querySelectorAll('tbody tr')].find((tr) => tr.textContent.startsWith('Lucía'));
  fila().querySelector('button').click();
  assert.equal(c.store.list('Banador').find((b) => b.nadadorId === 'n01').estado, 'pendiente');
  setValue(fila().querySelector('select'), 'S');
  fila().querySelector('button').click();
  const b = c.store.list('Banador').find((x) => x.nadadorId === 'n01');
  assert.equal(b.estado, 'entregado');
  assert.equal(b.talla, 'S');
  assert.equal(b.fecha, today());
});

test('rol nadador: sin formularios ni botones de edición', async () => {
  c.auth.setDemoRole('nadador');
  await renderView('entrenamientos', c.container, [], c);
  assert.equal(c.container.querySelector('.ent-act'), null);
  assert.equal(c.container.textContent.includes('+ Nueva sesión'), false);
  for (const [name, sel] of [['cargas', 'form.cg-form'], ['marcas', 'form.mc-form'], ['comunicaciones', 'form.cm-form']]) {
    await renderView(name, c.container, [], c);
    assert.equal(c.container.querySelector(sel), null, `${name} no debería mostrar ${sel}`);
  }
  await renderView('cargas', c.container, [], c);
  assert.ok([...c.container.querySelectorAll('.cg-obj input')].every((i) => i.disabled));
  await renderView('asistencia', c.container, [], c);
  assert.equal(c.container.querySelectorAll('button.asi-sw:not([disabled])').length, 0);
  assert.equal(c.container.textContent.includes('Marcar todos presentes'), false);
  await renderView('banador', c.container, [], c);
  assert.equal(c.container.querySelector('tbody select'), null);
  assert.equal(c.container.querySelector('tbody button'), null);
});

test('rol nadador: nadadores, grupos y club están restringidos', async () => {
  c.auth.setDemoRole('nadador');
  for (const name of ['nadadores', 'grupos', 'club']) {
    await renderView(name, c.container, [], c);
    assert.match(c.container.textContent, /permisos|Sólo los administradores/, name);
    assert.equal(c.container.querySelector('input'), null, name);
  }
});

test('rol entrenador: no accede a club pero sí a nadadores', async () => {
  c.auth.setDemoRole('entrenador');
  await renderView('club', c.container, [], c);
  assert.match(c.container.textContent, /administradores/);
  await renderView('nadadores', c.container, [], c);
  assert.ok(buttonByText(c.container, '+ Nuevo nadador'));
});

test('nadador solo ve comunicaciones generales y de su grupo', async () => {
  c.store.upsert('Usuarios', { email: 'x@y.es', rol: 'nadador', nadadorId: 'n01' }); // g1
  c.auth.user = { email: 'x@y.es', name: 'X' };
  c.auth.setDemoRole('nadador');
  await renderView('comunicaciones', c.container, [], c);
  assert.ok(c.container.textContent.includes('Horarios de la próxima semana'));
  assert.equal(c.container.textContent.includes('Competición en Gijón'), false); // es de g3
  c.auth.user = null;
});

test('mi-espacio sin vínculo ofrece selector y al elegir renderiza', async () => {
  c.auth.setDemoRole('nadador');
  await renderView('mi-espacio', c.container, [], c);
  const sel = c.container.querySelector('select');
  assert.ok(sel);
  setValue(sel, 'n02');
  await tick(10);
  assert.match(c.container.textContent, /Hola, Martina/);
});
