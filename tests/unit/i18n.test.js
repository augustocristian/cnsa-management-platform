import { test } from 'node:test';
import assert from 'node:assert/strict';
import es from '../../js/locales/es.js';
import en from '../../js/locales/en.js';
import it from '../../js/locales/it.js';
import { t, setLang, getLang, tCat, tEstado, tTipo, tRol, tDate, LANGS } from '../../js/i18n.js';

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

for (const [name, d] of [['en', en], ['it', it]]) {
  test(`${name}: mismas claves que es, sin huérfanas`, () => {
    const missing = Object.keys(es).filter((k) => !(k in d));
    const orphan = Object.keys(d).filter((k) => !(k in es));
    assert.deepEqual(missing, [], 'faltan en ' + name);
    assert.deepEqual(orphan, [], 'huérfanas en ' + name);
  });
  test(`${name}: mismas variables de interpolación`, () => {
    for (const k of Object.keys(es)) assert.equal(vars(d[k]), vars(es[k]), k);
  });
}

test('no hay valores vacíos', () => {
  for (const d of [es, en, it]) {
    for (const [k, v] of Object.entries(d)) {
      assert.equal(typeof v, 'string', k);
      assert.ok(v.trim().length > 0, 'vacío: ' + k);
    }
  }
});

test('interpolación y fallback', () => {
  setLang('es', { persist: false });
  assert.equal(t('tutorial.progreso', { hecho: 2, total: 8 }), '2 de 8 pasos completados');
  assert.equal(t('login.sin-acceso').includes('{email}'), true); // sin vars se deja el marcador
  assert.equal(t('clave.inexistente'), 'clave.inexistente');
  setLang('en', { persist: false });
  assert.equal(t('common.guardar'), 'Save');
  assert.equal(t('tutorial.progreso', { hecho: 1, total: 8 }), '1 of 8 steps completed');
  setLang('xx', { persist: false });
  assert.equal(getLang(), 'es');
  assert.deepEqual(LANGS.map((l) => l.code), ['es', 'en', 'it']);
});

test('helpers de valores internos', () => {
  setLang('en', { persist: false });
  assert.equal(tTipo('Aeróbico'), 'Aerobic');
  assert.equal(tEstado('justificado'), 'Excused');
  assert.equal(tRol('entrenador'), 'Coach');
  assert.equal(tCat('Máster'), 'Masters');
  assert.equal(tCat('Desconocida'), 'Desconocida');
  assert.equal(tCat(''), '');
  setLang('es', { persist: false });
  assert.equal(tCat('Prebenjamín'), 'Prebenjamín');
});

test('categorías, estados y tipos del schema tienen traducción', async () => {
  const s = await import('../../js/schema.js');
  setLang('it', { persist: false });
  for (const c of s.CATEGORIAS) assert.notEqual(tCat(c), '', c);
  for (const [fn, list] of [[tTipo, s.TIPOS_CARGA], [tRol, s.ROLES],
    [tEstado, [...s.ESTADOS_ENTRENAMIENTO, ...s.ESTADOS_ASISTENCIA, ...s.ESTADOS_BANADOR]]]) {
    for (const v of list) assert.notEqual(fn(v), v, v);
  }
  assert.equal(tTipo('Velocidad'), 'Velocità');
  setLang('es', { persist: false });
});

test('tDate por idioma', () => {
  setLang('es', { persist: false });
  assert.equal(tDate('2026-10-15'), '15/10/2026');
  assert.match(tDate('2026-10-15', 'long'), /jueves.*15.*octubre.*2026/);
  setLang('en', { persist: false });
  assert.match(tDate('2026-10-15', 'long'), /Thursday.*15.*October.*2026/);
  setLang('es', { persist: false });
});
