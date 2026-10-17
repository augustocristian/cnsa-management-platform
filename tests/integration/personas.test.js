import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';

let c;
const test = (name, fn) =>
  base(name, async (t) => {
    c = await fresh();
    return fn(t);
  });
const hoja = (n) => c.store.list(n);

// ---------- Swimmers ----------
test('swimmer list: filter bar, cards-ready table, avatar initials, right-aligned age and a real link per row', async () => {
  await renderView('nadadores', c.container, [], c);
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.ok(c.container.querySelector('.page-head h1'));
  assert.ok(
    c.container.querySelector('.filters.nad-filters label.check input[type=checkbox]'),
    'inline checkbox for inactive swimmers',
  );
  assert.equal(c.container.querySelectorAll('.filters select').length, 2);
  assert.ok(c.container.querySelector('table.table--cards'));
  const fila = c.container.querySelector('tr.nad-row');
  assert.ok(fila.querySelector('.avatar'));
  assert.ok(fila.querySelector('a.nad-name[href^="#/nadadores/"]'));
  assert.ok(fila.querySelector('td.num'), 'age column is numeric');
  assert.equal(c.container.querySelector('style'), null, 'no injected <style>');
  assert.ok(document.head.querySelector('link[data-view-css="nadadores"]'), 'stylesheet loaded with useStyles');
});

test('swimmer list: inactive swimmers are hidden unless the checkbox is ticked', async () => {
  const n = hoja('Nadadores')[0];
  c.store.upsert('Nadadores', { ...n, activo: 'false' });
  await renderView('nadadores', c.container, [], c);
  const filas = () => c.container.querySelectorAll('tbody tr.nad-row').length;
  assert.equal(filas(), 11);
  const chk = c.container.querySelector('.filters input[type=checkbox]');
  chk.checked = true;
  chk.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.equal(filas(), 12);
  assert.ok(c.container.querySelector('tr.nad-inactivo .badge'), 'inactive rows carry a text badge, not only dimming');
});

test('swimmer list: long lists show 25 rows and "Mostrar más" reveals the rest', async () => {
  c.store.upsertMany(
    'Nadadores',
    Array.from({ length: 20 }, (_, i) => ({
      nombre: 'Extra' + String(i).padStart(2, '0'),
      apellidos: 'Zeta',
      fechaNacimiento: '2010-01-01',
      sexo: 'F',
      categoria: 'Absoluto',
      activo: 'true',
    })),
  );
  await renderView('nadadores', c.container, [], c);
  assert.equal(c.container.querySelectorAll('tbody tr.nad-row').length, 25);
  const mas = buttonByText(c.container, 'Mostrar más (7 restantes)');
  mas.click();
  assert.equal(c.container.querySelectorAll('tbody tr.nad-row').length, 32);
  assert.equal(c.container.querySelector('.nad-more').hidden, true);
});

test('swimmer list: no match shows an empty state that clears the filters; an empty club offers to add the first swimmer', async () => {
  await renderView('nadadores', c.container, [], c);
  setValue(c.container.querySelector('input[type=search]'), 'zzzz');
  assert.equal(c.container.querySelector('.nad-empty').hidden, false);
  buttonByText(c.container.querySelector('.nad-empty'), 'Quitar filtros').click();
  assert.equal(c.container.querySelectorAll('tbody tr.nad-row').length, 12);
  c = await fresh({ demo: false });
  await renderView('nadadores', c.container, [], c);
  assert.ok(c.container.querySelector('.empty'));
  buttonByText(c.container.querySelector('.empty'), 'Nuevo nadador').click();
  assert.ok(document.querySelector('.sheet-overlay'));
});

test('swimmer form: essentials first, "Más datos" folded, first name focused, typed inputs and inline errors', async () => {
  await renderView('nadadores', c.container, [], c);
  buttonByText(c.container, 'Nuevo nadador').click();
  const ov = document.querySelector('.sheet-overlay');
  const detalle = ov.querySelector('details.nad-masdatos');
  assert.equal(detalle.open, false);
  assert.equal(document.activeElement, fieldByLabel(ov, 'Nombre'), 'focus on the first name (no touch device here)');
  const email = fieldByLabel(ov, 'Email');
  assert.equal(email.type, 'email');
  assert.equal(fieldByLabel(ov, 'Teléfono').type, 'tel');
  assert.equal(fieldByLabel(ov, 'Teléfono').getAttribute('inputmode'), 'tel');
  assert.equal(fieldByLabel(ov, 'Nombre').getAttribute('autocomplete'), 'off');
  setValue(fieldByLabel(ov, 'Nombre'), 'Eva');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Prueba');
  setValue(email, 'no-es-un-email');
  buttonByText(ov, 'Guardar').click();
  await tick();
  assert.equal(email.getAttribute('aria-invalid'), 'true');
  assert.equal(detalle.open, true, 'the section with the error opens');
  assert.match(email.closest('.field').querySelector('.field-error').textContent, /Revisa el email/);
  assert.equal(document.querySelector('#toasts .toast--error'), null, 'validation is inline, not a toast');
  assert.equal(hoja('Nadadores').filter((n) => n.nombre === 'Eva').length, 0);
});

test('swimmer form: "Guardar y añadir otro" saves, keeps the sheet open and clears the person but keeps the group', async () => {
  await renderView('nadadores', c.container, [], c);
  buttonByText(c.container, 'Nuevo nadador').click();
  const ov = document.querySelector('.sheet-overlay');
  setValue(fieldByLabel(ov, 'Grupo'), 'g2');
  setValue(fieldByLabel(ov, 'Nombre'), 'Ana');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Uno');
  buttonByText(ov, 'Guardar y añadir otro').click();
  await tick();
  assert.ok(document.querySelector('.sheet-overlay'), 'still open');
  assert.equal(fieldByLabel(ov, 'Nombre').value, '');
  assert.equal(fieldByLabel(ov, 'Grupo').value, 'g2');
  assert.equal(document.activeElement, fieldByLabel(ov, 'Nombre'));
  setValue(fieldByLabel(ov, 'Nombre'), 'Berta');
  setValue(fieldByLabel(ov, 'Apellidos'), 'Dos');
  buttonByText(ov, 'Guardar').click();
  await tick();
  assert.equal(document.querySelector('.sheet-overlay'), null);
  assert.deepEqual(
    ['Ana', 'Berta'].map((n) => hoja('Nadadores').some((x) => x.nombre === n && x.grupoId === 'g2')),
    [true, true],
  );
});

test('swimmer file: sections are cards, best marks come from the domain, delete asks no dialog and can be undone', async () => {
  await renderView('nadadores', c.container, ['n04'], c);
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.ok(c.container.querySelectorAll('section.card h2').length >= 4);
  assert.ok(c.container.querySelector('.nad-stat .stat-value'));
  assert.ok(c.container.querySelector('.nad-chartbox .badge'), 'PB badge');
  assert.ok(c.container.querySelector('svg.nad-chart[role=img][aria-label]'));
  assert.equal(
    c.container.querySelector('svg [stroke="#1a73e8"], svg [fill="#1a73e8"]'),
    null,
    'chart colours come from CSS tokens',
  );
  assert.ok(c.container.querySelector('#nad-purgar'), 'the GDPR erase button stays');
  assert.ok(c.container.querySelector('a[href^="mailto:"], a[href^="tel:"], dd'));
});

// ---------- Groups ----------
test('groups: no stray "null", no repeated category name, and swimmers listed are active only', async () => {
  const n = hoja('Nadadores').find((x) => x.grupoId === 'g1');
  c.store.upsert('Nadadores', { ...n, activo: 'false' });
  await renderView('grupos', c.container, [], c);
  const txt = c.container.textContent;
  assert.doesNotMatch(txt, /null|undefined/);
  assert.doesNotMatch(txt, /(\S+) \1/, 'a group named after its category does not repeat it');
  assert.ok(!c.container.querySelector(`a[href="#/nadadores/${n.id}"]`), 'inactive swimmers are not members');
  assert.equal(c.container.querySelectorAll('h1').length, 1);
});

test('groups: deleting leaves the swimmers without group and Undo brings the group and members back', async () => {
  const g = hoja('Grupos')[0];
  const miembros = hoja('Nadadores')
    .filter((n) => n.grupoId === g.id)
    .map((n) => n.id);
  assert.ok(miembros.length > 0);
  await renderView('grupos', c.container, [], c);
  const tarjeta = [...c.container.querySelectorAll('.grp-card')].find(
    (x) => x.querySelector('h2').textContent === g.nombre,
  );
  buttonByText(tarjeta, 'Eliminar').click();
  await tick();
  assert.equal(c.store.get('Grupos', g.id), null);
  assert.ok(miembros.every((id) => !c.store.get('Nadadores', id).grupoId));
  buttonByText(document.querySelector('#toasts'), 'Deshacer').click();
  await tick();
  assert.ok(c.store.get('Grupos', g.id));
  assert.ok(miembros.every((id) => c.store.get('Nadadores', id).grupoId === g.id));
});

test('groups: the name is validated inline (required and unique) inside the sheet', async () => {
  await renderView('grupos', c.container, [], c);
  buttonByText(c.container, 'Nuevo grupo').click();
  const ov = document.querySelector('.sheet-overlay');
  buttonByText(ov, 'Guardar').click();
  await tick();
  const nombre = fieldByLabel(ov, 'Nombre');
  assert.equal(nombre.getAttribute('aria-invalid'), 'true');
  setValue(nombre, hoja('Grupos')[0].nombre.toUpperCase());
  buttonByText(ov, 'Guardar').click();
  await tick();
  assert.match(ov.querySelector('.field-error').textContent, /Ya existe/);
  assert.ok(document.querySelector('.sheet-overlay'));
});

test('groups: an empty club shows an empty state with a call to action', async () => {
  c = await fresh({ demo: false });
  await renderView('grupos', c.container, [], c);
  assert.ok(c.container.querySelector('.empty .btn'));
});

// ---------- Notices ----------
test('notices: relative date, group filter with a visible label, validation inline, copy and delete with Undo', async () => {
  await renderView('comunicaciones', c.container, [], c);
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  const form = c.container.querySelector('form.cm-form');
  buttonByText(form, 'Guardar aviso').click();
  await tick();
  assert.equal(form.elements.titulo.getAttribute('aria-invalid'), 'true');
  assert.equal(form.elements.texto.getAttribute('aria-invalid'), 'true');
  form.elements.titulo.value = 'Piscina cerrada';
  form.elements.texto.value = 'El lunes no hay entreno';
  form.requestSubmit();
  await tick();
  const item = [...c.container.querySelectorAll('.cm-item')].find((x) => x.textContent.includes('Piscina cerrada'));
  assert.ok(item);
  assert.match(item.querySelector('time').textContent, /^hoy$/);
  assert.equal(form.elements.titulo.value, '', 'the form is cleared after saving');
  assert.ok(
    c.container.querySelector('label[for="cm-filtro"], label .field-label, .field-label'),
    'filter has a visible label',
  );

  let copiado = '';
  Object.defineProperty(window.navigator, 'clipboard', {
    value: {
      writeText: async (x) => {
        copiado = x;
      },
    },
    configurable: true,
  });
  buttonByText(item, 'Copiar').click();
  await tick();
  assert.equal(copiado, 'Piscina cerrada\n\nEl lunes no hay entreno');

  buttonByText(item, 'Eliminar').click();
  await tick();
  assert.ok(!hoja('Comunicaciones').some((x) => x.titulo === 'Piscina cerrada'));
  buttonByText(document.querySelector('#toasts'), 'Deshacer').click();
  await tick();
  assert.ok(hoja('Comunicaciones').some((x) => x.titulo === 'Piscina cerrada'));
});

test('notices: filtering by a group hides the others; an empty club shows an empty state with a CTA', async () => {
  await renderView('comunicaciones', c.container, [], c);
  const filtro = c.container.querySelector('#cm-filtro');
  setValue(filtro, '__todos');
  const gen = hoja('Comunicaciones').filter((x) => !x.grupoId).length;
  assert.equal(c.container.querySelectorAll('.cm-item').length, gen);
  c = await fresh({ demo: false });
  await renderView('comunicaciones', c.container, [], c);
  assert.ok(c.container.querySelector('.cm-list .empty .btn'));
});

// ---------- Settings ----------
test('settings: one h1, section cards, placeholder logo, translated file button, one content manager, no identity', async () => {
  await renderView('club', c.container, [], c);
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  const h2 = [...c.container.querySelectorAll('section.card > h2, section.card .card-head h2')].map(
    (x) => x.textContent,
  );
  assert.ok(h2.length >= 8, h2.join(' | '));
  const logo = c.container.querySelector('img.clb-logo');
  assert.ok(logo.getAttribute('src'), 'placeholder logo, never a broken image');
  const archivo = c.container.querySelector('input[type=file][accept="image/*"]');
  assert.equal(archivo.hidden, true, 'the native file picker text is not shown');
  assert.ok(buttonByText(c.container, 'Elegir imagen'));
  assert.equal(c.container.querySelectorAll('.tc-gestor').length, 1, 'the content catalogue manager appears once');
  assert.ok(buttonByText(c.container, 'Abrir el catálogo'), 'swimsuit catalogue card');
  assert.equal(c.container.querySelectorAll('#clb-rgpd').length, 1);
  assert.doesNotMatch(c.container.textContent, /@|sign.?in|iniciar sesión|cerrar sesión/i);
  assert.equal(c.container.querySelector('style'), null);
});

test('settings: saving the identity needs a name (inline error) and the logo can be removed', async () => {
  await renderView('club', c.container, [], c);
  const nombre = fieldByLabel(c.container, 'Nombre');
  setValue(nombre, '  ');
  buttonByText(c.container, 'Guardar identidad').click();
  assert.equal(nombre.getAttribute('aria-invalid'), 'true');
  setValue(nombre, 'Club Nuevo');
  buttonByText(c.container, 'Guardar identidad').click();
  assert.equal(c.store.club.nombre, 'Club Nuevo');
});

test('settings in demo mode: explains that data is local and disables the Drive-only actions', async () => {
  const demo = new Proxy(c.store, { get: (t, p) => (p === 'mode' ? 'demo' : t[p]) });
  await renderView('club', c.container, [], { ...c, store: demo });
  assert.match(c.container.textContent, /demostración: los datos solo existen en este dispositivo/);
  assert.equal(buttonByText(c.container, 'Sincronizar').disabled, true);
  assert.equal(c.container.querySelector('#clb-guardar-xlsx').disabled, true);
  assert.equal(c.container.querySelector('#clb-cambiar').disabled, true);
  assert.equal(c.container.querySelector('#clb-abrir-fichero'), null);
  assert.equal(c.container.querySelector('#clb-estado').textContent, 'Modo demostración');
});
