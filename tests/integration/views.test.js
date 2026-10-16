import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, VIEWS } from '../helpers/app.js';

let c;
// Cada test arranca con DOM limpio y store sembrado (sin hooks: los ficheros comparten proceso vía index.js).
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const EXPECT = {
  inicio: /Nadadores activos/,
  nadadores: /Nadadores/,
  grupos: /Grupos/,
  entrenamientos: /Entrenamientos/,
  asistencia: /Asistencia/,
  cargas: /Cargas/,
  marcas: /Marcas/,
  comunicaciones: /Avisos y notas/,
  club: /Identidad del club/,
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

  test(`vista ${name}: se puede volver a pintar sobre sí misma`, async () => {
    for (let i = 0; i < 2; i++) {
      await renderView(name, c.container, [], c);
      assert.ok(c.container.children.length > 0, 'pasada ' + i);
    }
  });
}

test('inicio muestra datos del club: tarjetas y SVG', async () => {
  await renderView('inicio', c.container, [], c);
  assert.ok(c.container.querySelectorAll('svg').length >= 2);
  assert.match(c.container.textContent, /Acciones rápidas/);
  assert.equal(c.container.querySelector('#primeros-pasos'), null, 'con datos no se muestran los primeros pasos');
});

test('grupos lista los 4 grupos demo con sus nadadores', async () => {
  await renderView('grupos', c.container, [], c);
  for (const g of c.store.list('Grupos')) assert.ok(c.container.textContent.includes(g.nombre));
  assert.ok(c.container.querySelectorAll('a[href^="#/nadadores/"]').length >= 12);
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

test('club: sin usuarios, roles ni compartir; explica dónde se guardan los datos en Drive', async () => {
  await renderView('club', c.container, [], c);
  const txt = c.container.textContent;
  assert.doesNotMatch(txt, /Usuarios y roles|Unirse con enlace|Compartir por email/);
  assert.equal(c.container.querySelector('input[type=email]'), null);
  assert.match(txt, /carpeta «cnl» de tu Google Drive/);
  assert.match(txt, /Test[.]json|[.]json/);
  assert.equal(c.container.querySelector('#clb-abrir-fichero').href, 'https://drive.google.com/file/d/' + c.ref.id + '/view');
  assert.match(c.container.querySelector('#clb-prefs-estado').textContent, /Estado de las preferencias/);
});

test('club: guardar copia Excel en Drive sube cnl/<Club>.xlsx', async () => {
  await renderView('club', c.container, [], c);
  c.container.querySelector('#clb-guardar-xlsx').click();
  await tick(30);
  assert.ok(c.fake.archivos().some((f) => f.name.endsWith('.xlsx')));
});

test('club nuevo y vacío: el inicio muestra los primeros pasos (estado vacío con acciones), sin datos de ejemplo', async () => {
  c = await fresh({ demo: false });
  await renderView('inicio', c.container, [], c);
  const pp = c.container.querySelector('#primeros-pasos');
  assert.ok(pp, 'tarjeta de primeros pasos');
  assert.deepEqual([...pp.querySelectorAll('a')].map((a) => a.getAttribute('href')), ['#/grupos', '#/nadadores', '#/planificacion/piscina', '#/entrenamientos']);
  assert.equal(c.store.list('Nadadores').length, 0);
  assert.doesNotMatch(c.container.textContent, /undefined|NaN|[[]object/);
});
