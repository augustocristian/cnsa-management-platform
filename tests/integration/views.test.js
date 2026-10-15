import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, VIEWS } from '../helpers/app.js';

let c;
// Cada test arranca con DOM limpio y store sembrado (sin hooks: los ficheros comparten proceso vía index.js).
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const EXPECT = {
  inicio: /Bienvenido/,
  nadadores: /Nadadores/,
  grupos: /Grupos/,
  entrenamientos: /Entrenamientos/,
  asistencia: /Asistencia/,
  cargas: /Cargas/,
  marcas: /Marcas/,
  banador: /Bañador/,
  comunicaciones: /Comunicaciones/,
  club: /Identidad del club/,
  'mi-espacio': /nadador/i,
};

for (const name of VIEWS) {
  test(`vista ${name}: renderiza con datos demo sin lanzar`, async () => {
    await renderView(name, c.container, [], c);
    assert.ok(c.container.children.length > 0, 'contenedor vacío');
    assert.match(c.container.textContent, EXPECT[name]);
    assert.doesNotMatch(c.container.textContent, /undefined|NaN|\[object/);
  });

  test(`vista ${name}: renderiza sin datos (club vacío)`, async () => {
    c = await fresh({ demo: false });
    await renderView(name, c.container, [], c);
    assert.ok(c.container.children.length > 0);
    assert.doesNotMatch(c.container.textContent, /undefined|NaN|\[object/);
  });

  test(`vista ${name}: renderiza como entrenador y como nadador`, async () => {
    for (const rol of ['entrenador', 'nadador']) {
      c.auth.setDemoRole(rol);
      await renderView(name, c.container, [], c);
      assert.ok(c.container.children.length > 0, rol);
    }
  });
}

test('inicio muestra datos del club: tarjetas y SVG', async () => {
  await renderView('inicio', c.container, [], c);
  assert.ok(c.container.querySelectorAll('svg').length >= 2);
  assert.match(c.container.textContent, /Admin/);
  c.auth.setDemoRole('entrenador');
  await renderView('inicio', c.container, [], c);
  assert.match(c.container.textContent, /Bienvenido, Entrenador/);
});

test('grupos lista los 4 grupos demo con sus nadadores', async () => {
  await renderView('grupos', c.container, [], c);
  for (const g of c.store.list('Grupos')) assert.ok(c.container.textContent.includes(g.nombre));
  assert.ok(c.container.querySelectorAll('a[href^="#/nadadores/"]').length >= 12);
});

test('banador cuenta pendientes', async () => {
  await renderView('banador', c.container, [], c);
  const pend = c.store.list('Banador').filter((b) => b.estado !== 'entregado').length;
  assert.ok(c.container.textContent.includes(`${pend} pendiente(s) de 12`));
});

test('comunicaciones lista los avisos demo', async () => {
  await renderView('comunicaciones', c.container, [], c);
  assert.match(c.container.textContent, /Horarios de la próxima semana/);
  assert.match(c.container.textContent, /Competición en Gijón/);
});

test('club: guardar identidad actualiza el store', async () => {
  await renderView('club', c.container, [], c);
  const inputs = c.container.querySelectorAll('input[type=text]');
  inputs[0].value = 'Club Renombrado';
  [...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Guardar identidad').click();
  assert.equal(c.store.club.nombre, 'Club Renombrado');
});

test('club: añadir usuario valida email y guarda', async () => {
  await renderView('club', c.container, [], c);
  const add = [...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Añadir usuario');
  add.click();
  assert.equal(c.store.list('Usuarios').length, 0);
  c.container.querySelector('input[type=email]').value = 'Nuevo@Club.es';
  add.click();
  assert.equal(c.store.list('Usuarios').length, 1);
  assert.equal(c.store.list('Usuarios')[0].email, 'nuevo@club.es');
});

test('mi-espacio con nadador seleccionado muestra sus datos', async () => {
  await renderView('mi-espacio', c.container, { id: 'n04' }, c);
  assert.match(c.container.textContent, /Hola, Carla/);
  assert.match(c.container.textContent, /Mis marcas/);
  assert.ok(c.container.querySelectorAll('table').length >= 2);
});
