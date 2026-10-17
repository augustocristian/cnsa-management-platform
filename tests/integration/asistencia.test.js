import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, buttonByText, setValue } from '../helpers/app.js';

let c;
const test = (name, fn) =>
  base(name, async (t) => {
    c = await fresh();
    return fn(t);
  });

const today = () => c.ui.isoDate(new Date());
const sesion = (extra = {}) =>
  c.store.upsert('Entrenamientos', {
    fecha: today(),
    hora: '19:00',
    titulo: 'Lista E2E',
    grupoId: 'g1',
    estado: 'planificado',
    ...extra,
  });
const tarjeta = (nid) => c.container.querySelector(`li.asi-card[data-nid="${nid}"]`);
const regs = (id) => c.store.list('Asistencia').filter((a) => a.entrenamientoId === id);

test('roll call: cards with initials, two 44px-class targets and a "more" button; unmarked by default', async () => {
  const s = sesion();
  await renderView('asistencia', c.container, [s.id], c);
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  const cards = c.container.querySelectorAll('li.asi-card');
  assert.equal(cards.length, 3);
  const k = cards[0];
  assert.ok(k.querySelector('.avatar'), 'initials avatar');
  assert.deepEqual(
    [...k.querySelectorAll('.asi-btn')].map((b) => b.dataset.estado),
    ['presente', 'ausente'],
  );
  assert.ok(k.querySelector('.asi-more[aria-haspopup="dialog"]'));
  assert.equal(k.querySelector('.asi-state').textContent, 'Sin marcar');
  assert.ok([...k.querySelectorAll('.asi-btn')].every((b) => b.getAttribute('aria-pressed') === 'false'));
  assert.equal(c.container.querySelector('.tabs[role="tablist"]').children.length, 2);
});

test('one tap = present; the summary bar shows "X de N marcados" and coloured numeric chips; the state is text, not only colour', async () => {
  const s = sesion();
  await renderView('asistencia', c.container, [s.id], c);
  const n = c.store.list('Nadadores').find((x) => x.grupoId === 'g1').id;
  tarjeta(n).querySelector('.asi-btn[data-estado="presente"]').click();
  await tick();
  assert.equal(regs(s.id).length, 1);
  assert.equal(tarjeta(n).querySelector('.asi-state').textContent, 'Presente');
  assert.equal(tarjeta(n).querySelector('.asi-btn[data-estado="presente"]').getAttribute('aria-pressed'), 'true');
  const barra = c.container.querySelector('.asi-sticky');
  assert.match(barra.textContent, /1 de 3 marcados/);
  assert.deepEqual(
    [...barra.querySelectorAll('.badge')].map((b) => b.textContent),
    ['1 presentes', '0 ausentes', '0 justificados', '2 sin marcar'],
  );
  assert.ok(barra.querySelector('.badge--ok') && barra.querySelector('.badge--danger'));
  assert.equal(barra.querySelector('[role="progressbar"]').getAttribute('aria-valuenow'), '33');
});

test('single actions offer Undo and only one undo toast is kept', async () => {
  const s = sesion();
  await renderView('asistencia', c.container, [s.id], c);
  const [a, b] = c.store.list('Nadadores').filter((x) => x.grupoId === 'g1');
  tarjeta(a.id).querySelector('.asi-btn[data-estado="ausente"]').click();
  tarjeta(b.id).querySelector('.asi-btn[data-estado="presente"]').click();
  await tick();
  assert.equal(regs(s.id).length, 2);
  const toasts = document.querySelectorAll('#toasts .toast');
  assert.equal(toasts.length, 1, 'no pile of toasts');
  toasts[0].querySelector('.toast-action').click();
  await tick();
  assert.deepEqual(
    regs(s.id).map((r) => r.nadadorId),
    [a.id],
    'the undo reverts the last action',
  );
});

test('"..." opens a sheet with all the states (excused) and a note', async () => {
  const s = sesion();
  await renderView('asistencia', c.container, [s.id], c);
  const n = c.store.list('Nadadores').find((x) => x.grupoId === 'g1').id;
  tarjeta(n).querySelector('.asi-more').click();
  const d = document.querySelector('.sheet');
  assert.ok(d);
  const chips = [...d.querySelectorAll('.chip')];
  assert.deepEqual(
    chips.map((x) => x.textContent),
    ['Presente', 'Ausente', 'Justificado', 'Sin marcar'],
  );
  chips[2].click();
  setValue(d.querySelector('input[type="text"]'), 'Avisa la familia');
  buttonByText(d, 'Guardar').click();
  await tick(10);
  assert.deepEqual(
    regs(s.id).map((r) => [r.estado, r.nota]),
    [['justificado', 'Avisa la familia']],
  );
  assert.equal(tarjeta(n).dataset.estado, 'justificado');
  assert.match(tarjeta(n).textContent, /Avisa la familia/);
  assert.equal(document.querySelector('.sheet'), null);
});

test('the session selector is compact with few sessions and searchable with many', async () => {
  const s = sesion();
  await renderView('asistencia', c.container, [s.id], c);
  const pocas = c.store.list('Entrenamientos').length;
  assert.ok(pocas <= 10 ? c.container.querySelector('input[type="search"]') === null : true);
  for (let i = 0; i < 15; i++)
    c.store.upsert('Entrenamientos', {
      fecha: `2026-0${1 + (i % 9)}-1${i % 9}`,
      hora: '10:00',
      titulo: `Técnica ${i}`,
      grupoId: 'g2',
      estado: 'realizado',
    });
  await renderView('asistencia', c.container, [s.id], c);
  const buscar = c.container.querySelector('input[type="search"]');
  assert.ok(buscar, 'search box when there are many sessions');
  const sel = c.container.querySelector('#asi-sesion');
  const total = sel.options.length;
  setValue(buscar, 'TECNICA');
  assert.ok(sel.options.length < total && sel.options.length >= 1);
  assert.ok(
    [...sel.options].some((o) => o.value === s.id),
    'the selected session is kept',
  );
  assert.ok([...sel.options].every((o) => o.value === s.id || /Técnica/.test(o.textContent)));
  assert.match(c.container.textContent, /sesiones/);
  assert.ok(c.container.querySelector('button[aria-label="Sesión anterior"]'));
});

test('"Marcar todos presentes" is disabled when nobody is left and does not overwrite absences', async () => {
  const s = sesion();
  await renderView('asistencia', c.container, [s.id], c);
  const [a] = c.store.list('Nadadores').filter((x) => x.grupoId === 'g1');
  tarjeta(a.id).querySelector('.asi-btn[data-estado="ausente"]').click();
  await tick();
  buttonByText(c.container, 'Marcar todos presentes').click();
  await tick(10);
  assert.equal(regs(s.id).find((r) => r.nadadorId === a.id).estado, 'ausente');
  assert.equal(regs(s.id).length, 3);
  assert.equal(buttonByText(c.container, 'Marcar todos presentes').disabled, true);
});

test('history tab: rows by swimmer with percentage, expandable detail and group filter', async () => {
  await renderView('asistencia', c.container, [], c);
  buttonByText(c.container, 'Historial').click();
  await tick();
  assert.equal(c.container.querySelector('[role="tab"][aria-selected="true"]').textContent, 'Historial');
  const filas = c.container.querySelectorAll('tbody tr.asi-fila');
  assert.ok(filas.length >= 12);
  const conPct = [...filas].find((f) => f.querySelector('.asi-pct'));
  assert.ok(conPct.querySelector('[role="progressbar"]'));
  conPct.querySelector('.asi-name-btn').click();
  await tick();
  assert.ok(c.container.querySelector('tr.asi-det li'));
  assert.equal(c.container.querySelector('.asi-name-btn[aria-expanded="true"]') !== null, true);
  setValue(c.container.querySelector('#asi-grupo'), 'g1');
  assert.equal(
    c.container.querySelectorAll('tbody tr.asi-fila').length,
    c.store.list('Nadadores').filter((n) => n.grupoId === 'g1').length,
  );
});

test('inactive swimmers (any false-like value) are not in the roll call (esActivo)', async () => {
  const s = sesion();
  const n = c.store.list('Nadadores').find((x) => x.grupoId === 'g1');
  c.store.upsert('Nadadores', { ...n, activo: 'false' });
  await renderView('asistencia', c.container, [s.id], c);
  assert.equal(c.container.querySelectorAll('li.asi-card').length, 2);
  assert.equal(tarjeta(n.id), null);
});
