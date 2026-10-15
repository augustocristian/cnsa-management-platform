import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, fieldByLabel, buttonByText, setValue } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const modal = () => document.querySelector('.modal');
const cell = (calle, hora) => c.container.querySelector(`button.pl-cell[data-calle="${calle}"][data-hora="${hora}"]`);
const click = async (el) => { el.click(); await tick(); };
const lunes = async () => { // la vista abre en el día actual: se pasa al lunes de forma determinista
  await click(c.container.querySelector('[role=tab]'));
};
const asignaciones = () => c.store.list('AsignacionesCalle');
const guardarAsignacion = async () => { await click(buttonByText(modal(), 'Guardar')); };

test('datos demo: piscina de 6 calles y asignaciones coherentes sin errores', async () => {
  const D = await importApp('js/domain/planificacion.js');
  const p = c.store.list('Piscinas');
  assert.equal(p.length, 1);
  assert.equal(p[0].numCalles, 6);
  assert.ok(c.store.list('AsignacionesCalle').length >= 10);
  const r = D.detectarConflictos({ piscinas: p, asignaciones: asignaciones(), grupos: c.store.list('Grupos'), nadadores: c.store.list('Nadadores') });
  assert.equal(r.filter((x) => x.severidad === 'error').length, 0);
  assert.ok(r.some((x) => x.tipo === 'sin-entrenador'), 'aviso demo intencionado');
  // el segundo conjunto opcional añade errores
  c.store.seedPlanificacionConflictos();
  const r2 = D.detectarConflictos({ piscinas: p, asignaciones: asignaciones(), grupos: c.store.list('Grupos'), nadadores: c.store.list('Nadadores') });
  assert.ok(r2.some((x) => x.severidad === 'error'));
});

test('la vista pinta rejilla con calles, bloques del lunes, leyenda y panel', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  assert.match(c.container.textContent, /Planificación de la piscina/);
  assert.match(c.container.textContent, /Piscina Lugones/);
  for (let i = 1; i <= 6; i++) assert.ok([...c.container.querySelectorAll('.pl-head')].some((x) => x.textContent === `Calle ${i}`));
  const bloques = c.container.querySelectorAll('.pl-gridwrap .pl-block');
  assert.equal(bloques.length, 2); // Promoción e Infantil-Junior
  assert.ok([...bloques].every((b) => b.getAttribute('aria-label')));
  assert.equal(c.container.querySelectorAll('.pl-screen .pl-legend li').length, 4);
  assert.match(c.container.querySelector('.pl-panel').textContent, /Panel de conflictos/);
  assert.match(c.container.querySelector('.pl-chip').textContent, /0 errores · 1 avisos/);
  assert.ok(c.container.querySelectorAll('[role=tab]').length === 7);
});

test('modo semana completa lista los cursos de todos los días', async () => {
  await renderView('planificacion', c.container, [], c);
  await click(buttonByText(c.container, 'Semana completa'));
  assert.equal(c.container.querySelectorAll('.pl-screen .pl-day').length, 7);
  assert.ok(c.container.querySelectorAll('.pl-screen .pl-item').length >= 10);
  assert.equal(buttonByText(c.container, 'Semana completa').getAttribute('aria-pressed'), 'true');
});

test('crear una asignación desde un hueco de la rejilla', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  const n0 = asignaciones().length;
  await click(cell(5, '10:00'));
  assert.ok(modal(), 'se abre el formulario');
  assert.equal(fieldByLabel(modal(), 'Hora de inicio').value, '10:00');
  assert.equal(fieldByLabel(modal(), 'Calle desde').value, '5');
  setValue(fieldByLabel(modal(), 'Curso / grupo'), 'g2');
  assert.equal(fieldByLabel(modal(), 'Entrenador').value, 'Jorge Prieto'); // por defecto, el del grupo
  await guardarAsignacion();
  assert.equal(asignaciones().length, n0 + 1);
  const nueva = asignaciones().find((a) => a.horaInicio === '10:00' && Number(a.dia) === 1);
  assert.equal(nueva.grupoId, 'g2');
  assert.equal(Number(nueva.dia), 1);
  assert.equal(modal(), null, 'el formulario se cierra');
  assert.ok(c.container.querySelectorAll('.pl-gridwrap .pl-block').length === 3);
});

test('un conflicto de error bloquea el guardado y lo explica', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  const n0 = asignaciones().length;
  await click(cell(1, '17:30')); // calle 1 a las 17:30: ya ocupada por Promoción
  setValue(fieldByLabel(modal(), 'Curso / grupo'), 'g2');
  assert.match(modal().textContent, /No se puede guardar/);
  assert.match(modal().textContent, /ocupan a la vez/);
  await guardarAsignacion();
  assert.ok(modal(), 'sigue abierto');
  assert.equal(asignaciones().length, n0);
  assert.equal(buttonByText(modal(), 'Guardar').textContent, 'Guardar'); // no se ofrece forzar un error
});

test('un aviso se puede forzar con «Guardar de todos modos»', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  const n0 = asignaciones().length;
  await click(cell(6, '12:00'));
  setValue(fieldByLabel(modal(), 'Curso / grupo'), 'g2');
  setValue(fieldByLabel(modal(), 'Entrenador'), ''); // sin entrenador -> aviso
  assert.match(modal().textContent, /no tiene entrenador asignado/);
  await guardarAsignacion();
  assert.ok(modal(), 'pide confirmación');
  assert.equal(asignaciones().length, n0);
  const btn = buttonByText(modal(), 'Guardar de todos modos');
  await click(btn);
  assert.equal(asignaciones().length, n0 + 1);
  assert.equal(modal(), null);
});

test('editar y eliminar una asignación desde su bloque', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  await click(c.container.querySelector('.pl-gridwrap .pl-block'));
  assert.match(modal().textContent, /Editar asignación/);
  setValue(fieldByLabel(modal(), 'Notas'), 'nota nueva');
  await guardarAsignacion();
  assert.ok(asignaciones().some((a) => a.notas === 'nota nueva'));
  const n0 = asignaciones().length;
  await click(c.container.querySelector('.pl-gridwrap .pl-block'));
  await click(buttonByText(modal(), 'Eliminar'));
  await click(buttonByText([...document.querySelectorAll('.modal')].pop(), 'Eliminar')); // confirmación
  assert.equal(asignaciones().length, n0 - 1);
});

test('duplicar abre un formulario nuevo con los mismos datos', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  await click(c.container.querySelector('.pl-gridwrap .pl-block'));
  await click(buttonByText(modal(), 'Duplicar'));
  await tick(5);
  assert.match(modal().textContent, /Nueva asignación/);
  assert.equal(fieldByLabel(modal(), 'Día de la semana').value, '2'); // el siguiente día
});

test('cambiar el nº de calles recorta las asignaciones y avisa de las que quedan fuera', async () => {
  const antes = asignaciones().length;
  c.store.upsert('AsignacionesCalle', { id: 'parcial', piscinaId: 'p1', dia: 2, fecha: '', horaInicio: '10:00', horaFin: '11:00', calleDesde: 3, calleHasta: 6, grupoId: 'g1', entrenadorId: 'Marta Valdés', notas: '' });
  await renderView('planificacion', c.container, [], c);
  await click(buttonByText(c.container, 'Configurar piscina'));
  assert.match(modal().textContent, /Configuración de la piscina/);
  setValue(fieldByLabel(modal(), 'Número de calles'), '4');
  await click(buttonByText(modal(), 'Guardar'));
  assert.match(document.body.textContent, /se recortarán 1 asignaciones y 1 quedarán fuera/);
  await click(buttonByText(document.body, 'Aceptar'));
  await tick(5);
  assert.equal(c.store.get('Piscinas', 'p1').numCalles, 4);
  assert.equal(c.store.get('AsignacionesCalle', 'parcial').calleHasta, 4);
  assert.equal(asignaciones().length, antes + 1);
  // el refuerzo del sábado (calles 5-6) queda fuera de rango: error visible en el panel
  assert.match(c.container.querySelector('.pl-panel').textContent, /solo tiene 4 calles/);
  assert.match(c.container.querySelector('.pl-chip').textContent, /1 errores/);
  assert.equal(c.container.querySelectorAll('.pl-head').length, 5); // esquina + 4 calles
});

test('configuración inválida no se guarda', async () => {
  await renderView('planificacion', c.container, [], c);
  await click(buttonByText(c.container, 'Configurar piscina'));
  setValue(fieldByLabel(modal(), 'Nombre'), '');
  await click(buttonByText(modal(), 'Guardar'));
  assert.match(modal().textContent, /Escribe un nombre/);
  assert.equal(c.store.get('Piscinas', 'p1').nombre, 'Piscina Lugones');
});

test('crear una piscina nueva con el botón (sin piscinas previas)', async () => {
  c.store.clear();
  c.store.upsert('Grupos', { id: 'g1', nombre: 'A', categoria: 'Alevín', entrenador: 'X' });
  await renderView('planificacion', c.container, [], c);
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

test('un solo usuario: la planificación siempre es editable (sin modo de sólo lectura)', async () => {
  await renderView('planificacion', c.container, [], c);
  await lunes();
  assert.ok(buttonByText(c.container, 'Sugerir distribución'));
  assert.ok(buttonByText(c.container, 'Configurar piscina'));
  assert.doesNotMatch(c.container.textContent, /solo lectura/);
  assert.ok(c.container.querySelectorAll('.pl-gridwrap .pl-block').length > 0);
});

test('sugerir distribución: propone y aplica sin errores', async () => {
  await renderView('planificacion', c.container, [], c);
  await click(buttonByText(c.container, 'Sugerir distribución'));
  setValue(modal().querySelector('select'), '3'); // miércoles: Alevín y Absoluto-Máster no tienen sitio
  assert.match(modal().textContent, /Alevín/);
  assert.match(modal().textContent, /Absoluto-Máster/);
  const n0 = asignaciones().length;
  await click(buttonByText(modal(), 'Aplicar propuesta'));
  assert.equal(asignaciones().length, n0 + 2);
  const D = await importApp('js/domain/planificacion.js');
  const r = D.detectarConflictos({ piscinas: c.store.list('Piscinas'), asignaciones: asignaciones(), grupos: c.store.list('Grupos'), nadadores: c.store.list('Nadadores') });
  assert.equal(r.filter((x) => x.severidad === 'error').length, 0);
});

test('el panel de conflictos lista errores del segundo conjunto demo y abre la edición', async () => {
  c.store.seedPlanificacionConflictos();
  await renderView('planificacion', c.container, [], c);
  const panel = c.container.querySelector('.pl-panel');
  assert.match(panel.textContent, /Errores \(2\)/);
  assert.match(panel.textContent, /ocupan a la vez/);
  assert.match(panel.textContent, /dos clases a la vez/);
  await click(panel.querySelector('.e button'));
  assert.match(modal().textContent, /Editar asignación/);
});

test('idiomas: la vista y los conflictos se traducen', async () => {
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('en', { persist: false });
  c.store.seedPlanificacionConflictos();
  await renderView('planificacion', c.container, [], c);
  assert.match(c.container.textContent, /Pool planning/);
  assert.match(c.container.querySelector('.pl-panel').textContent, /at the same time/);
  i18n.setLang('it', { persist: false });
  await renderView('planificacion', c.container, [], c);
  assert.match(c.container.textContent, /Pianificazione della piscina/);
  assert.match(c.container.querySelector('.pl-panel').textContent, /contemporaneamente/);
  i18n.setLang('es', { persist: false });
});

test('la vista incluye la copia imprimible de la semana', async () => {
  await renderView('planificacion', c.container, [], c);
  const imp = c.container.querySelector('.pl-print');
  assert.ok(imp);
  assert.equal(imp.querySelectorAll('.pl-day').length, 7);
  assert.ok(document.getElementById('pl-style').textContent.includes('@media print'));
});
