import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const ui = await importApp('js/ui.js');

test('parseTime / fmtTime round trip', () => {
  for (const ms of [0, 50, 28500, 62340, 125500, 3599990]) {
    assert.equal(ui.parseTime(ui.fmtTime(ms)), ms, String(ms));
  }
  assert.equal(ui.fmtTime(62340), '01:02.34');
  assert.equal(ui.parseTime('1:02.34'), 62340);
  assert.equal(ui.parseTime('62.34'), 62340);
  assert.equal(ui.parseTime('02:05,5'), 125500);
});

test('parseTime rejects invalid inputs and fmtTime invalid values', () => {
  for (const s of ['', 'abc', '1:2:3', '-5', null, undefined]) assert.ok(Number.isNaN(ui.parseTime(s)), String(s));
  assert.equal(ui.fmtTime(-1), '');
  assert.equal(ui.fmtTime('x'), '');
});

test('fmtDate short and long formats', () => {
  assert.equal(ui.fmtDate('2026-10-15'), '15/10/2026');
  assert.equal(ui.fmtDate('2026-10-15', 'long'), 'jueves, 15 de octubre de 2026');
  assert.equal(ui.fmtDate(''), '');
  assert.equal(ui.fmtDate(null), '');
  assert.equal(ui.fmtDate('no-fecha'), 'no-fecha');
});

test('isoDate returns YYYY-MM-DD in local time', () => {
  assert.equal(ui.isoDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(ui.isoDate('2026-12-31'), '2026-12-31');
  assert.match(ui.isoDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('h() escapes text and does not interpret HTML', () => {
  const el = ui.h('div', { class: 'x' }, '<img src=x onerror=alert(1)>', '<b>hola</b>');
  assert.equal(el.querySelector('img'), null);
  assert.equal(el.querySelector('b'), null);
  assert.equal(el.textContent, '<img src=x onerror=alert(1)><b>hola</b>');
  assert.equal(el.className, 'x');
});

test('h() attributes, events, nested children and SVG', () => {
  let n = 0;
  const el = ui.h('button', { onclick: () => n++, dataset: { a: '1' }, 'aria-busy': true, hidden: false, title: null }, ['a', [null, 'b', false, 0]]);
  el.click();
  assert.equal(n, 1);
  assert.equal(el.dataset.a, '1');
  assert.ok(el.hasAttribute('aria-busy'));
  assert.ok(!el.hasAttribute('hidden'));
  assert.equal(el.textContent, 'ab0');
  const svg = ui.h('svg', { viewBox: '0 0 1 1' }, ui.h('circle', { r: 1 }));
  assert.equal(svg.namespaceURI, 'http://www.w3.org/2000/svg');
  assert.equal(svg.firstChild.namespaceURI, 'http://www.w3.org/2000/svg');
});

test('formFields reads values and validates', () => {
  const f = ui.formFields([
    { name: 'a', label: 'A', required: true },
    { name: 'n', type: 'number' },
    { name: 'c', type: 'checkbox' },
    { name: 's', type: 'select', options: ['x', { value: 'y', label: 'Y' }] },
  ], { a: 'hola', n: 5, c: true, s: 'y' });
  assert.deepEqual(f.values(), { a: 'hola', n: 5, c: true, s: 'y' });
  assert.equal(f.validate(), true);
});

test('modal and confirmDialog', async () => {
  const p = ui.confirmDialog('¿Seguro?');
  const ov = document.querySelector('.modal-overlay');
  assert.ok(ov.textContent.includes('¿Seguro?'));
  [...ov.querySelectorAll('button.btn')].find((b) => b.textContent === 'Aceptar').click();
  assert.equal(await p, true);
  assert.equal(document.querySelector('.modal-overlay'), null);
});
