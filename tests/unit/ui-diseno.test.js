// Design system helpers (js/presentation/ui.js) with jsdom: sheet, confirmDialog, toast, fieldError, field, empty, time mask.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const ui = await importApp('js/presentation/ui.js');
const { setLang } = await importApp('js/presentation/i18n/i18n.js');
setLang('es', { persist: false });

const key = (el, k, extra = {}) => {
  const ev = new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  el.dispatchEvent(ev);
  return ev;
};
const limpiar = () => {
  document.querySelectorAll('.sheet-overlay, #toasts').forEach((e) => e.remove());
  document.body.removeAttribute('style');
  document.getElementById('app').removeAttribute('inert');
};
// Base scenario: #app with a button that opens the sheet
function montar() {
  limpiar();
  const app = document.getElementById('app');
  app.replaceChildren();
  const abrir = ui.h('button', { type: 'button', id: 'abrir' }, 'Abrir');
  app.appendChild(abrir);
  abrir.focus();
  return { app, abrir };
}

test('sheet: ARIA roles, title, body and initial focus on the first field', () => {
  const { abrir } = montar();
  const s = ui.sheet({ title: 'Nuevo nadador', body: ui.h('div', null, ui.h('input', { id: 'nombre' })), actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true }] });
  const d = s.dialog;
  assert.equal(d.getAttribute('role'), 'dialog');
  assert.equal(d.getAttribute('aria-modal'), 'true');
  assert.equal(document.getElementById(d.getAttribute('aria-labelledby')).textContent, 'Nuevo nadador');
  assert.ok(document.getElementById(d.getAttribute('aria-describedby')).contains(d.querySelector('#nombre')));
  assert.equal(document.activeElement.id, 'nombre');
  assert.ok(s.el.classList.contains('modal-overlay') && d.classList.contains('modal'), 'compatibility .modal-overlay / .modal');
  s.close();
  assert.equal(document.activeElement, abrir, 'focus returns to the button that opened the sheet');
});

test('sheet: focus trapped (Tab and Shift+Tab cycle), #app inert and focus restored', () => {
  const { app, abrir } = montar();
  const s = ui.sheet({ title: 'T', body: ui.h('input', { id: 'a' }), actions: [{ label: 'Cancelar' }, { label: 'Guardar', primary: true }] });
  assert.ok(app.hasAttribute('inert'), '#app stays inert while the sheet is open');
  const f = [...s.dialog.querySelectorAll('button,input')];
  const primero = f[0];
  const ultimo = f[f.length - 1];
  ultimo.focus();
  let ev = key(ultimo, 'Tab');
  assert.equal(ev.defaultPrevented, true);
  assert.equal(document.activeElement, primero, 'Tab on the last wraps to the first');
  ev = key(primero, 'Tab', { shiftKey: true });
  assert.equal(ev.defaultPrevented, true);
  assert.equal(document.activeElement, ultimo, 'Shift+Tab on the first jumps to the last');
  // if focus escapes the sheet it comes back in
  abrir.focus();
  assert.ok(s.dialog.contains(document.activeElement), 'focus cannot leave the sheet');
  s.close();
  assert.equal(app.hasAttribute('inert'), false, 'closing restores #app');
  assert.equal(document.activeElement, abrir);
});

test('sheet: Escape closes; body scroll is locked and restored', () => {
  montar();
  document.body.style.overflow = 'scroll';
  let cerrada = 0;
  const s = ui.sheet({ title: 'T', body: 'x', onClose: () => cerrada++ });
  assert.equal(document.body.style.overflow, 'hidden');
  key(document.activeElement, 'Escape');
  assert.equal(document.querySelector('.sheet-overlay'), null);
  assert.equal(cerrada, 1);
  assert.equal(document.body.style.overflow, 'scroll', 'restores the previous value');
  s.close(); // closing twice is harmless
  assert.equal(cerrada, 1);
});

test('sheet: restores scroll and focus even if onClose throws', () => {
  const { abrir } = montar();
  const err = mock.method(console, 'error', () => {});
  const s = ui.sheet({ title: 'T', body: 'x', onClose: () => { throw new Error('onClose failure'); } });
  assert.doesNotThrow(() => s.close());
  assert.equal(document.body.style.overflow, '');
  assert.equal(document.getElementById('app').hasAttribute('inert'), false);
  assert.equal(document.activeElement, abrir);
  assert.equal(err.mock.callCount(), 1);
  err.mock.restore();
});

test('sheet: an action returning false does not close; one that throws shows a toast and keeps the sheet open', async () => {
  montar();
  const err = mock.method(console, 'error', () => {});
  const s = ui.sheet({ title: 'T', body: 'x', actions: [
    { label: 'No cerrar', onClick: () => false },
    { label: 'Rompe', onClick: () => { throw new Error('boom'); } },
    { label: 'Cerrar', onClick: () => {} },
  ] });
  const [a, b, c] = s.dialog.querySelectorAll('.sheet-actions button');
  a.click(); await new Promise((r) => setTimeout(r, 0));
  assert.ok(document.querySelector('.sheet-overlay'));
  b.click(); await new Promise((r) => setTimeout(r, 0));
  assert.ok(document.querySelector('.sheet-overlay'), 'still open');
  assert.equal(document.querySelector('#toasts .toast--error').getAttribute('role'), 'alert');
  c.click(); await new Promise((r) => setTimeout(r, 0));
  assert.equal(document.querySelector('.sheet-overlay'), null);
  err.mock.restore();
});

test('nested sheets: Escape only closes the top one and #app stays inert until the last closes', () => {
  const { app } = montar();
  const a = ui.sheet({ title: 'A', body: ui.h('input', { id: 'ia' }) });
  const b = ui.sheet({ title: 'B', body: ui.h('input', { id: 'ib' }) });
  assert.ok(a.el.hasAttribute('inert'), 'the one underneath becomes inert');
  assert.equal(document.activeElement.id, 'ib');
  key(document.activeElement, 'Escape');
  assert.equal(document.querySelectorAll('.sheet-overlay').length, 1);
  assert.equal(a.el.hasAttribute('inert'), false);
  assert.ok(app.hasAttribute('inert'));
  assert.equal(document.body.style.overflow, 'hidden');
  a.close();
  assert.equal(app.hasAttribute('inert'), false);
  assert.equal(document.body.style.overflow, '');
  b.close();
});

test('confirmDialog: initial focus on Cancel and destructive action labelled «Eliminar»', async () => {
  montar();
  const p = ui.confirmDialog('¿Borrar a Lucía?', { danger: true });
  const botones = [...document.querySelectorAll('.sheet-actions button')];
  assert.deepEqual(botones.map((b) => b.textContent), ['Cancelar', 'Eliminar']);
  assert.equal(document.activeElement, botones[0], 'initial focus is on Cancel');
  assert.ok(botones[1].classList.contains('btn--danger'));
  botones[1].click();
  assert.equal(await p, true);

  const q = ui.confirmDialog('¿Seguro?');
  assert.equal([...document.querySelectorAll('.sheet-actions button')].pop().textContent, 'Aceptar');
  document.querySelector('.sheet-actions button').click();
  assert.equal(await q, false);

  const r = ui.confirmDialog('¿Borrar?', { danger: true, okLabel: 'Quitar fila' });
  assert.equal([...document.querySelectorAll('.sheet-actions button')].pop().textContent, 'Quitar fila');
  key(document.activeElement, 'Escape');
  assert.equal(await r, false);
});

test('toast: role=status (error: role=alert), 5 s, paused by pointer/focus', () => {
  limpiar();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    const t1 = ui.toast('Guardado');
    assert.equal(t1.el.getAttribute('role'), 'status');
    assert.equal(document.getElementById('toasts').contains(t1.el), true);
    mock.timers.tick(4900);
    assert.ok(t1.el.isConnected, 'lasts at least 5 s even if less is requested');
    mock.timers.tick(200);
    assert.equal(t1.el.isConnected, false);

    const t2 = ui.toast('Pausado', 3000);
    mock.timers.tick(2000);
    t2.el.dispatchEvent(new window.Event('mouseenter'));
    mock.timers.tick(60000);
    assert.ok(t2.el.isConnected, 'paused with the pointer over it');
    t2.el.dispatchEvent(new window.Event('mouseleave'));
    mock.timers.tick(2900);
    assert.ok(t2.el.isConnected, 'resumes with what was left (3 s)');
    mock.timers.tick(200);
    assert.equal(t2.el.isConnected, false);

    const t3 = ui.toast('Foco', 5000);
    t3.el.dispatchEvent(new window.Event('focusin'));
    mock.timers.tick(30000);
    assert.ok(t3.el.isConnected, 'paused with focus inside');
    t3.close();

    const e = ui.toast.error('No se pudo guardar');
    assert.equal(e.el.getAttribute('role'), 'alert');
    assert.ok(e.el.querySelector('button[aria-label]'), 'errors can be dismissed');
    mock.timers.tick(5900);
    assert.ok(e.el.isConnected, 'errors last 6 s');
    mock.timers.tick(200);
    assert.equal(e.el.isConnected, false);
  } finally { mock.timers.reset(); }
});

test('toast.undo: the Undo button runs the action once and closes the toast; it expires after 6 s', async () => {
  limpiar();
  mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    let deshechos = 0;
    const t = ui.toast.undo('Nadador eliminado', () => { deshechos++; });
    const btn = t.el.querySelector('.toast-action');
    assert.equal(btn.textContent, 'Deshacer');
    assert.equal(t.el.getAttribute('role'), 'status');
    btn.click();
    btn.click();
    await Promise.resolve();
    assert.equal(deshechos, 1);
    assert.equal(t.el.isConnected, false);

    const t2 = ui.toast.undo('Otro', () => { deshechos++; }, { timeout: 6000 });
    mock.timers.tick(5900);
    assert.ok(t2.el.isConnected);
    mock.timers.tick(200);
    assert.equal(t2.el.isConnected, false);
    assert.equal(deshechos, 1, 'if it expires nothing is undone');
  } finally { mock.timers.reset(); }
});

test('fieldError: red border (aria-invalid), linked message below, focus and cleanup on edit', () => {
  montar();
  const input = ui.h('input', { type: 'text' });
  const campo = ui.field({ label: 'Nombre', input, hint: 'Como en la licencia', required: true });
  document.getElementById('app').appendChild(campo);

  const err = ui.fieldError(input, 'Falta el nombre');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(document.activeElement, input);
  assert.ok(campo.contains(err) && err.classList.contains('field-error'));
  assert.equal(err.textContent, 'Falta el nombre');
  assert.ok(err.querySelector('svg'), 'the error carries an icon (not colour alone)');
  const ids = input.getAttribute('aria-describedby').split(' ');
  assert.ok(ids.includes(err.id) && ids.some((i) => document.getElementById(i)?.classList.contains('hint')), 'linked to hint and error');

  ui.fieldError(input, 'Otro mensaje');
  assert.equal(campo.querySelectorAll('.field-error').length, 1, 'does not duplicate the message');
  assert.equal(campo.querySelector('.field-error').textContent, 'Otro mensaje');

  input.value = 'x';
  input.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.equal(input.hasAttribute('aria-invalid'), false, 'clears on typing');
  assert.equal(campo.querySelector('.field-error'), null);
  assert.ok(!(input.getAttribute('aria-describedby') || '').includes('-err'));

  ui.fieldError(input, 'Otra vez', { focus: false });
  ui.clearFieldError(input);
  assert.equal(input.hasAttribute('aria-invalid'), false);
});

test('field: the label wraps the control, hint linked, asterisk hidden from screen readers', () => {
  const input = ui.h('input');
  const campo = ui.field({ label: 'Licencia', input, hint: 'Ej. AST4000', required: true });
  const label = campo.querySelector('label');
  assert.ok(label.contains(input));
  assert.equal(input.labels[0], label);
  assert.equal(input.required, true);
  assert.equal(label.querySelector('.req').getAttribute('aria-hidden'), 'true');
  assert.equal(document.body.contains(campo), false);
  assert.equal(campo.querySelector('.hint').textContent, 'Ej. AST4000');
  assert.ok(input.getAttribute('aria-describedby').includes(campo.querySelector('.hint').id));
});

test('formFields.validate: inline errors, focus on the first invalid field and no alert()', () => {
  montar();
  const f = ui.formFields([
    { name: 'nombre', label: 'Nombre', required: true },
    { name: 'email', label: 'Correo', type: 'email' },
    { name: 'ok', label: 'Activo', type: 'checkbox' },
  ], { email: 'no-es-correo' });
  document.getElementById('app').appendChild(f.el);
  assert.equal(f.validate(), false);
  const [nombre, email] = [f.inputs.nombre, f.inputs.email];
  assert.equal(nombre.getAttribute('aria-invalid'), 'true');
  assert.equal(email.getAttribute('aria-invalid'), 'true');
  assert.equal(document.activeElement, nombre, 'focus on the first invalid field');
  assert.equal(nombre.closest('.field').querySelector('.field-error').textContent, 'Este campo es obligatorio');
  assert.equal(f.el.querySelectorAll('.field-error').length, 2);
  nombre.value = 'Lucía'; email.value = 'a@b.es';
  assert.equal(f.validate(), true);
  assert.equal(f.el.querySelectorAll('.field-error').length, 0);
  assert.ok(f.el.querySelector('label.field.check input[type=checkbox]'), 'checkbox inline with its label');
});

test('empty: icon, title, text and CTA', () => {
  let n = 0;
  const e = ui.empty({ icon: 'nadadores', title: 'Aún no hay nadadores', text: 'Añade el primero', action: { label: 'Nuevo nadador', onClick: () => n++ } });
  assert.ok(e.classList.contains('empty'));
  assert.ok(e.querySelector('.empty-icon svg'));
  assert.equal(e.querySelector('.empty-title').textContent, 'Aún no hay nadadores');
  assert.equal(e.querySelector('.empty-text').textContent, 'Añade el primero');
  const cta = e.querySelector('button.btn--primary');
  assert.equal(cta.textContent, 'Nuevo nadador');
  cta.click();
  assert.equal(n, 1);
  const sinCta = ui.empty({ title: 'Nada' });
  assert.equal(sinCta.querySelector('button'), null);
});

test('badge and avatar', () => {
  assert.equal(ui.badge('Presente', 'ok').className, 'badge badge--ok');
  assert.equal(ui.iniciales('Martina Suárez Cuesta'), 'MC');
  assert.equal(ui.iniciales('lucía'), 'L');
  assert.equal(ui.iniciales('  '), '?');
  assert.equal(ui.avatar('Noa Díaz', { size: 'sm' }).textContent, 'ND');
});

test('parseTime with numeric mask: 10245 -> 1:02.45', () => {
  assert.equal(ui.parseTime('10245'), 62450);
  assert.equal(ui.parseTime('2845'), 28450);
  assert.equal(ui.parseTime('6234'), 62340);
  assert.equal(ui.parseTime('545'), 5450);
  assert.equal(ui.parseTime('102345'), 623450);
  assert.ok(Number.isNaN(ui.parseTime('17550')), '1:75.50 is not valid');
  // formats with separators keep working
  assert.equal(ui.parseTime('1:02.34'), 62340);
  assert.equal(ui.parseTime('62.34'), 62340);
  assert.equal(ui.parseTime('02:05,5'), 125500);
  for (const mala of ['', 'abc', '1:2:3', '-5', null, undefined, '1234567']) assert.ok(Number.isNaN(ui.parseTime(mala)), String(mala));
});

test('maskTime and timeInput format while typing', () => {
  assert.equal(ui.maskTime('10245'), '1:02.45');
  assert.equal(ui.maskTime('2845'), '28.45');
  assert.equal(ui.maskTime('545'), '5.45');
  assert.equal(ui.maskTime('28'), '28');
  assert.equal(ui.maskTime('1:02.34'), '1:02.34');
  assert.equal(ui.maskTime('a1b0c2d4e5'), '1:02.45');
  assert.equal(ui.maskTime(''), '');
  assert.equal(ui.parseTime(ui.maskTime('10245')), 62450);
  const i = ui.timeInput(ui.h('input'));
  assert.equal(i.getAttribute('inputmode'), 'numeric');
  i.value = '10245';
  i.dispatchEvent(new window.Event('input'));
  assert.equal(i.value, '1:02.45');
});

test('modal/confirmDialog remain compatible with the previous signatures', () => {
  montar();
  let cerrado = false;
  const m = ui.modal({ title: 'Hola', body: 'cuerpo', onClose: () => { cerrado = true; }, actions: [{ label: 'Aceptar', primary: true, onClick: () => {} }] });
  assert.equal(m.el.querySelector('.modal-actions .btn-primary').textContent, 'Aceptar');
  m.el.querySelector('.modal-actions .btn-primary').click();
  return new Promise((r) => setTimeout(r, 0)).then(() => { assert.equal(cerrado, true); assert.equal(document.querySelector('.modal-overlay'), null); });
});
