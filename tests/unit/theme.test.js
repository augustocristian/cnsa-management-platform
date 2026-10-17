// js/theme.js: auto | light | dark, persistence and pre-paint (js/theme-boot.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { setupEnv, importApp, ROOT } from '../helpers/env.js';
import path from 'node:path';

setupEnv();
let sistemaOscuro = false;
const oyentes = [];
// Other test files reinstall the jsdom environment when loaded: each test restores its own clean one.
function prep() {
  window.matchMedia = (q) => ({
    matches: q.includes('dark') && sistemaOscuro, media: q,
    addEventListener: (_, fn) => oyentes.push(fn), removeEventListener() {},
  });
  document.documentElement.removeAttribute('data-theme');
  localStorage.removeItem('cnl:tema');
  sistemaOscuro = false;
}
prep();
const theme = await importApp('js/theme.js');
const html = { getAttribute: (k) => document.documentElement.getAttribute(k), hasAttribute: (k) => document.documentElement.hasAttribute(k) };

test('setTheme sets data-theme, mirrors it in localStorage and auto removes it', () => {
  prep();
  assert.equal(theme.getTheme(), 'auto');
  assert.equal(theme.setTheme('dark'), 'dark');
  assert.equal(html.getAttribute('data-theme'), 'dark');
  assert.equal(localStorage.getItem('cnl:tema'), 'dark');
  assert.equal(theme.getTheme(), 'dark');
  assert.equal(theme.effectiveTheme(), 'dark');
  theme.setTheme('light');
  assert.equal(html.getAttribute('data-theme'), 'light');
  assert.equal(theme.effectiveTheme(), 'light');
  theme.setTheme('auto');
  assert.equal(html.hasAttribute('data-theme'), false);
  assert.equal(localStorage.getItem('cnl:tema'), null);
  theme.setTheme('nonsense');
  assert.equal(theme.getTheme(), 'auto', 'unknown value = automatic');
});

test('in automatic mode the system decides and the change is notified', () => {
  prep();
  const vistos = [];
  const off = theme.onThemeChange((ef, pref) => vistos.push([ef, pref]));
  theme.setTheme('auto');
  sistemaOscuro = true;
  assert.equal(theme.effectiveTheme(), 'dark');
  oyentes.forEach((fn) => fn());
  assert.deepEqual(vistos.at(-1), ['dark', 'auto']);
  theme.setTheme('light');
  assert.deepEqual(vistos.at(-1), ['light', 'light'], 'forcing light beats the system');
  theme.setTheme('auto');
  sistemaOscuro = false;
  off();
  const n = vistos.length;
  theme.setTheme('dark');
  assert.equal(vistos.length, n, 'after unsubscribing nothing is notified');
  theme.setTheme('auto');
});

test('persistence: saves to preferences and applies the stored / remote value', () => {
  prep();
  const guardado = {};
  let oyente = null;
  const prefs = {
    get: (k, def) => (k in guardado ? guardado[k] : def),
    set: (k, v) => { if (v === null) delete guardado[k]; else guardado[k] = v; },
    on: (fn) => { oyente = fn; },
  };
  theme.setTheme('auto', { persist: false });
  guardado.tema = 'dark';
  theme.enlazar(prefs, { tema: 'tema' });
  assert.equal(theme.getTheme(), 'dark', 'applies the stored value when linking');
  theme.setTheme('light');
  assert.equal(guardado.tema, 'light');
  theme.setTheme('auto');
  assert.equal('tema' in guardado, false, 'auto deletes the preference');
  // change made on another device
  guardado.tema = 'dark';
  oyente({ tipo: 'cambio', origen: 'remoto', claves: ['tema'] });
  assert.equal(theme.getTheme(), 'dark');
  assert.equal(localStorage.getItem('cnl:tema'), 'dark');
  delete guardado.tema;
  oyente({ tipo: 'cambio', origen: 'remoto', claves: ['tema'] });
  assert.equal(theme.getTheme(), 'auto', 'value deleted remotely = automatic');
  oyente({ tipo: 'cambio', origen: 'local', claves: ['tema'] });
});

test('the "tema" preference is sanitised in the preferences domain', async () => {
  prep();
  const P = await importApp('js/domain/preferencias.js');
  assert.equal(P.CLAVES.tema, 'tema');
  assert.equal(P.sanear('tema', 'dark'), 'dark');
  assert.equal(P.sanear('tema', 'light'), 'light');
  assert.equal(P.sanear('tema', 'rojo'), undefined);
  assert.equal(P.sanear('tema', null), null);
});

test('themeSelect: labelled, 3 options and changes the theme', () => {
  prep();
  theme.setTheme('auto', { persist: false });
  const sel = theme.themeSelect();
  assert.equal(sel, theme.themeSelect(), 'single instance');
  assert.ok(sel.getAttribute('aria-label'));
  assert.deepEqual([...sel.options].map((o) => o.value), ['auto', 'light', 'dark']);
  assert.deepEqual([...sel.options].map((o) => o.textContent), ['Automático', 'Claro', 'Oscuro']);
  sel.value = 'dark';
  sel.dispatchEvent(new window.Event('change'));
  assert.equal(theme.getTheme(), 'dark');
  theme.setTheme('light');
  assert.equal(sel.value, 'light', 'the selector follows the theme');
  theme.setTheme('auto');
});

test('theme-boot.js applies the stored theme before first paint', () => {
  prep();
  const src = readFileSync(path.join(ROOT, 'js', 'theme-boot.js'), 'utf8');
  const correr = (valor) => {
    const attrs = {};
    const store = valor === undefined ? {} : { 'cnl:tema': valor };
    vm.runInNewContext(src, {
      localStorage: { getItem: (k) => store[k] ?? null },
      document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
    });
    return attrs;
  };
  assert.deepEqual(correr('dark'), { 'data-theme': 'dark' });
  assert.deepEqual(correr('light'), { 'data-theme': 'light' });
  assert.deepEqual(correr(undefined), {});
  assert.deepEqual(correr('<script>'), {}, 'unknown values are ignored');
  assert.doesNotThrow(() => vm.runInNewContext(src, { localStorage: { getItem: () => { throw new Error('blocked'); } }, document: { documentElement: {} } }));
});
