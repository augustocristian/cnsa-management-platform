import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const modal = () => document.querySelector('.modal');
const cell = (calle, hora) => c.container.querySelector(`button.pl-cell[data-calle="${calle}"][data-hora="${hora}"]`);
const click = async (el) => { el.click(); await tick(); };
const lunes = async () => { // the view opens on the current day: switch to Monday deterministically
  await click(c.container.querySelector('.pl-dias [role=tab]'));
};
// Infrequent actions: the «Más acciones» (More actions) menu in the page header
const abrirMenu = async (etiqueta) => {
  await click(c.container.querySelector('.page-head-actions .enp-mn-btn'));
  const item = [...document.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === etiqueta);
  if (!item) throw new Error('No menu option: ' + etiqueta);
  await click(item);
};
const asignaciones = () => c.store.list('AsignacionesCalle');
const guardarAsignacion = async () => { await click(buttonByText(modal(), 'Guardar')); };

test('demo data: 6-lane pool and consistent assignments with no errors', async () => {
  const D = await importApp('js/domain/planificacion.js');
  const p = c.store.list('Piscinas');
  assert.equal(p.length, 1);
  assert.equal(p[0].numCalles, 6);
  assert.ok(c.store.list('AsignacionesCalle').length >= 10);
  const r = D.detectarConflictos({ piscinas: p, asignaciones: asignaciones(), grupos: c.store.list('Grupos'), nadadores: c.store.list('Nadadores') });
  assert.equal(r.filter((x) => x.severidad === 'error').length, 0);
  assert.ok(r.some((x) => x.tipo === 'sin-entrenador'), 'intentional demo warning');
  // the optional second set adds errors
  c.store.seedPlanificacionConflictos();
  const r2 = D.detectarConflictos({ piscinas: p, asignaciones: asignaciones(), grupos: c.store.list('Grupos'), nadadores: c.store.list('Nadadores') });
  assert.ok(r2.some((x) => x.severidad === 'error'));
});

test('the view draws the grid with lanes, Monday blocks, legend and panel', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  assert.match(c.container.textContent, /Planificación de la piscina/);
  assert.match(c.container.textContent, /Piscina Lugones/);
  for (let i = 1; i <= 6; i++) assert.ok([...c.container.querySelectorAll('.pl-head')].some((x) => x.textContent === `Calle ${i}`));
  const bloques = c.container.querySelectorAll('.pl-gridwrap .pl-block');
  assert.equal(bloques.length, 2); // Promoción and Infantil-Junior
  assert.ok([...bloques].every((b) => b.getAttribute('aria-label')));
  assert.equal(c.container.querySelectorAll('.pl-screen .pl-legend li').length, 4);
  assert.match(c.container.querySelector('.pl-panel').textContent, /Panel de conflictos/);
  assert.match(c.container.querySelector('.pl-chip').textContent, /0 errores · 1 avisos/);
  assert.ok(c.container.querySelectorAll('.pl-dias [role=tab]').length === 7);
  assert.equal(c.container.querySelectorAll('h1').length, 1, 'a single h1 (page header)');
  assert.equal(c.container.querySelector('.pl-gridwrap').getAttribute('role'), 'region', 'the grid scrolls inside a named region');
  assert.ok(c.container.querySelector('.pl-gridwrap').getAttribute('aria-label'));
  assert.match(c.container.querySelector('.pl-panel .alert--warn .alert-title').textContent, /Avisos \(1\)/, 'the panel uses alerts with a count');
});

test('full-week mode lists the courses of every day', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await click(buttonByText(c.container, 'Semana completa'));
  assert.equal(c.container.querySelectorAll('.pl-screen .pl-day').length, 7);
  assert.ok(c.container.querySelectorAll('.pl-screen .pl-item').length >= 10);
  assert.equal(buttonByText(c.container, 'Semana completa').getAttribute('aria-pressed'), 'true');
});

test('create an assignment from a grid slot', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  const n0 = asignaciones().length;
  await click(cell(5, '10:00'));
  assert.ok(modal(), 'the form opens');
  assert.equal(fieldByLabel(modal(), 'Hora de inicio').value, '10:00');
  assert.equal(fieldByLabel(modal(), 'Calle desde').value, '5');
  setValue(fieldByLabel(modal(), 'Curso / grupo'), 'g2');
  assert.equal(fieldByLabel(modal(), 'Entrenador').value, 'Jorge Prieto'); // by default, the group's coach
  await guardarAsignacion();
  assert.equal(asignaciones().length, n0 + 1);
  const nueva = asignaciones().find((a) => a.horaInicio === '10:00' && Number(a.dia) === 1);
  assert.equal(nueva.grupoId, 'g2');
  assert.equal(Number(nueva.dia), 1);
  assert.equal(modal(), null, 'the form closes');
  assert.ok(c.container.querySelectorAll('.pl-gridwrap .pl-block').length === 3);
});

test('an error conflict blocks saving and explains why', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  const n0 = asignaciones().length;
  await click(cell(1, '17:30')); // lane 1 at 17:30: already taken by Promoción
  setValue(fieldByLabel(modal(), 'Curso / grupo'), 'g2');
  assert.match(modal().textContent, /No se puede guardar/);
  assert.match(modal().textContent, /ocupan a la vez/);
  await guardarAsignacion();
  assert.ok(modal(), 'stays open');
  assert.equal(asignaciones().length, n0);
  assert.equal(buttonByText(modal(), 'Guardar').textContent, 'Guardar'); // forcing an error is not offered
});

test('a warning can be forced with «Guardar de todos modos» (Save anyway)', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  const n0 = asignaciones().length;
  await click(cell(6, '12:00'));
  setValue(fieldByLabel(modal(), 'Curso / grupo'), 'g2');
  setValue(fieldByLabel(modal(), 'Entrenador'), ''); // no coach -> warning
  assert.match(modal().textContent, /no tiene entrenador asignado/);
  await guardarAsignacion();
  assert.ok(modal(), 'asks for confirmation');
  assert.equal(asignaciones().length, n0);
  const btn = buttonByText(modal(), 'Guardar de todos modos');
  await click(btn);
  assert.equal(asignaciones().length, n0 + 1);
  assert.equal(modal(), null);
});

test('edit and delete an assignment from its block', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  await click(c.container.querySelector('.pl-gridwrap .pl-block'));
  assert.match(modal().textContent, /Editar asignación/);
  setValue(fieldByLabel(modal(), 'Notas'), 'nota nueva');
  await guardarAsignacion();
  assert.ok(asignaciones().some((a) => a.notas === 'nota nueva'));
  const n0 = asignaciones().length;
  await click(c.container.querySelector('.pl-gridwrap .pl-block'));
  await click(buttonByText(modal(), 'Eliminar'));
  assert.equal(asignaciones().length, n0 - 1, 'deleted instantly (no confirmation)');
  assert.equal(modal(), null);
  const deshacer = [...document.querySelectorAll('#toasts .toast-action')].find((b) => b.textContent === 'Deshacer');
  assert.ok(deshacer, 'notifies with «Deshacer» (Undo)');
  await click(deshacer);
  assert.equal(asignaciones().length, n0, 'undo restores it');
});

test('duplicate opens a new form with the same data', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  await click(c.container.querySelector('.pl-gridwrap .pl-block'));
  await click(buttonByText(modal(), 'Duplicar'));
  await tick(5);
  assert.match(modal().textContent, /Nueva asignación/);
  assert.equal(fieldByLabel(modal(), 'Día de la semana').value, '2'); // the next day
});

test('changing the number of lanes trims the assignments and warns about those left out', async () => {
  const antes = asignaciones().length;
  c.store.upsert('AsignacionesCalle', { id: 'parcial', piscinaId: 'p1', dia: 2, fecha: '', horaInicio: '10:00', horaFin: '11:00', calleDesde: 3, calleHasta: 6, grupoId: 'g1', entrenadorId: 'Marta Valdés', notas: '' });
  await renderView('planificacion', c.container, ['piscina'], c);
  await abrirMenu('Configurar piscina');
  assert.match(modal().textContent, /Configuración de la piscina/);
  setValue(fieldByLabel(modal(), 'Número de calles'), '4');
  await click(buttonByText(modal(), 'Guardar'));
  assert.match(document.body.textContent, /se recortarán 1 asignaciones y 1 quedarán fuera/);
  await click(buttonByText(document.body, 'Aceptar'));
  await tick(5);
  assert.equal(c.store.get('Piscinas', 'p1').numCalles, 4);
  assert.equal(c.store.get('AsignacionesCalle', 'parcial').calleHasta, 4);
  assert.equal(asignaciones().length, antes + 1);
  // the Saturday reinforcement (lanes 5-6) is out of range: error visible in the panel
  assert.match(c.container.querySelector('.pl-panel').textContent, /solo tiene 4 calles/);
  assert.match(c.container.querySelector('.pl-chip').textContent, /1 errores/);
  assert.equal(c.container.querySelectorAll('.pl-head').length, 5); // corner + 4 lanes
});

test('invalid settings are not saved', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await abrirMenu('Configurar piscina');
  setValue(fieldByLabel(modal(), 'Nombre'), '');
  await click(buttonByText(modal(), 'Guardar'));
  assert.match(modal().textContent, /obligatorio/, 'inline error next to the field');
  assert.equal(fieldByLabel(modal(), 'Nombre').getAttribute('aria-invalid'), 'true');
  setValue(fieldByLabel(modal(), 'Nombre'), 'X');
  setValue(fieldByLabel(modal(), 'Número de calles'), '99');
  await click(buttonByText(modal(), 'Guardar'));
  assert.ok(modal(), 'a lane count out of range is not saved');
  assert.equal(fieldByLabel(modal(), 'Número de calles').getAttribute('aria-invalid'), 'true');
  assert.equal(c.store.get('Piscinas', 'p1').numCalles, 6);
  assert.equal(c.store.get('Piscinas', 'p1').nombre, 'Piscina Lugones');
});

test('create a new pool with the button (no previous pools)', async () => {
  c.store.clear();
  c.store.upsert('Grupos', { id: 'g1', nombre: 'A', categoria: 'Alevín', entrenador: 'X' });
  await renderView('planificacion', c.container, ['piscina'], c);
  assert.match(c.container.textContent, /Todavía no hay ninguna piscina/);
  await click(buttonByText(c.container, 'Crear piscina'));
  setValue(fieldByLabel(modal(), 'Nombre'), 'Municipal');
  setValue(fieldByLabel(modal(), 'Longitud'), '50');
  await click(buttonByText(modal(), 'Guardar'));
  const p = c.store.list('Piscinas')[0];
  assert.equal(p.nombre, 'Municipal');
  assert.equal(Number(p.longitudM), 50);
  assert.equal(JSON.parse(p.horario)['7'], null);
  assert.match(c.container.textContent, /Municipal/);
});

test('single user: planning is always editable (no read-only mode)', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await lunes();
  assert.ok(buttonByText(c.container, 'Sugerir distribución'));
  assert.ok(buttonByText(c.container, 'Nueva asignación'));
  await click(c.container.querySelector('.page-head-actions .enp-mn-btn'));
  assert.ok([...document.querySelectorAll('[role=menuitem]')].some((b) => b.textContent.trim() === 'Configurar piscina'));
  assert.doesNotMatch(c.container.textContent, /solo lectura/);
  assert.ok(c.container.querySelectorAll('.pl-gridwrap .pl-block').length > 0);
});

test('suggest distribution: proposes and applies with no errors', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  await click(buttonByText(c.container, 'Sugerir distribución'));
  setValue(modal().querySelector('select'), '3'); // Wednesday: Alevín and Absoluto-Master have no slot
  assert.match(modal().textContent, /Alevín/);
  assert.match(modal().textContent, /Absoluto-Master/);
  const n0 = asignaciones().length;
  await click(buttonByText(modal(), 'Aplicar propuesta'));
  assert.equal(asignaciones().length, n0 + 2);
  const D = await importApp('js/domain/planificacion.js');
  const r = D.detectarConflictos({ piscinas: c.store.list('Piscinas'), asignaciones: asignaciones(), grupos: c.store.list('Grupos'), nadadores: c.store.list('Nadadores') });
  assert.equal(r.filter((x) => x.severidad === 'error').length, 0);
});

test('the conflicts panel lists errors from the second demo set and opens editing', async () => {
  c.store.seedPlanificacionConflictos();
  await renderView('planificacion', c.container, ['piscina'], c);
  const panel = c.container.querySelector('.pl-panel');
  assert.match(panel.textContent, /Errores \(2\)/);
  assert.match(panel.textContent, /ocupan a la vez/);
  assert.match(panel.textContent, /dos clases a la vez/);
  await click(panel.querySelector('.e button'));
  assert.match(modal().textContent, /Editar asignación/);
});

test('languages: the view and the conflicts are translated', async () => {
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('en', { persist: false });
  c.store.seedPlanificacionConflictos();
  await renderView('planificacion', c.container, ['piscina'], c);
  assert.match(c.container.textContent, /Pool planning/);
  assert.match(c.container.querySelector('.pl-panel').textContent, /at the same time/);
  i18n.setLang('it', { persist: false });
  await renderView('planificacion', c.container, ['piscina'], c);
  assert.match(c.container.textContent, /Pianificazione della piscina/);
  assert.match(c.container.querySelector('.pl-panel').textContent, /contemporaneamente/);
  i18n.setLang('es', { persist: false });
});

test('the view includes the printable copy of the week', async () => {
  await renderView('planificacion', c.container, ['piscina'], c);
  const imp = c.container.querySelector('.pl-print');
  assert.ok(imp);
  assert.equal(imp.querySelectorAll('.pl-day').length, 7);
  assert.ok(!document.getElementById('pl-style'), 'no injected <style>: the stylesheet is css/views/planificacion.css');
  assert.ok(imp.closest('.pl-root'));
  const css = (await import('node:fs')).readFileSync(new URL('../../css/views/planificacion.css', import.meta.url), 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /@page/);
  assert.ok(!c.container.querySelector('.pl-print button'), 'the printable copy has no controls');
});
