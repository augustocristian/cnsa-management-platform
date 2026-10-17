import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { langSwitch, flagIcon } = await importApp('js/presentation/lang-switch.js');
const { LANGS, getLang, setLang } = await importApp('js/presentation/i18n/i18n.js');

test('langSwitch renders one radio button per language with flag SVGs, no select and no emoji', () => {
  setLang('es', { persist: false });
  const root = langSwitch();
  const buttons = [...root.querySelectorAll('button[role=radio]')];
  assert.equal(root.getAttribute('role'), 'radiogroup');
  assert.deepEqual(
    buttons.map((b) => b.dataset.lang),
    LANGS.map((l) => l.code),
  );
  assert.equal(root.querySelector('select'), null);
  for (const b of buttons) {
    assert.ok(b.querySelector('svg.flag'), 'flag icon present');
    assert.ok(b.getAttribute('aria-label'), 'accessible name present');
  }
  assert.doesNotMatch(root.textContent, /[\u{1F1E6}-\u{1F1FF}]/u, 'no regional-indicator emoji flags');
});

test('langSwitch reflects and changes the active language', () => {
  setLang('es', { persist: false });
  const root = langSwitch();
  const pressed = () => root.querySelector('[aria-checked=true]').dataset.lang;
  assert.equal(pressed(), 'es');
  root.querySelector('[data-lang=en]').click();
  assert.equal(getLang(), 'en');
  assert.equal(pressed(), 'en');
  setLang('it', { persist: false });
  assert.equal(pressed(), 'it');
  assert.equal(root.querySelector('[aria-checked=true]').tabIndex, 0);
  assert.equal(root.querySelector('[aria-checked=false]').tabIndex, -1);
  setLang('es', { persist: false });
});

test('langSwitch supports arrow-key navigation', () => {
  setLang('es', { persist: false });
  const root = langSwitch();
  document.body.append(root);
  root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(getLang(), 'en');
  root.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(getLang(), 'es');
  root.remove();
});

test('flagIcon draws an SVG for every language', () => {
  for (const l of LANGS) assert.equal(flagIcon(l.code).tagName.toLowerCase(), 'svg');
});
