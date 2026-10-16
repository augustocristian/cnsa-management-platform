import { test } from 'node:test';
import assert from 'node:assert/strict';
import es from '../../js/locales/es.js';
import en from '../../js/locales/en.js';
import it from '../../js/locales/it.js';
import { t, setLang, getLang, tCat, tEstado, tTipo, tDate, LANGS } from '../../js/i18n.js';

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
  assert.equal(t('gerr.detalle').includes('{msg}'), true); // sin vars se deja el marcador
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
  assert.equal(tCat('Master'), 'Masters');
  assert.equal(tCat('Desconocida'), 'Desconocida');
  assert.equal(tCat(''), '');
  setLang('es', { persist: false });
  assert.equal(tCat('Pre-Benjamín'), 'Pre-Benjamín');
});

test('categorías, estados y tipos del schema tienen traducción', async () => {
  const s = await import('../../js/schema.js');
  setLang('it', { persist: false });
  for (const c of s.CATEGORIAS) assert.notEqual(tCat(c), '', c);
  for (const [fn, list] of [[tTipo, s.TIPOS_CARGA],
    [tEstado, [...s.ESTADOS_ENTRENAMIENTO, ...s.ESTADOS_ASISTENCIA]]]) {
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

test('vistas-a: paridad de claves y variables en es/en/it', async () => {
  const [a, b, c] = await Promise.all(['es', 'en', 'it'].map((l) => import(`../../js/locales/vistas-a.${l}.js`).then((m) => m.default)));
  for (const [name, d] of [['en', b], ['it', c]]) {
    assert.deepEqual(Object.keys(a).filter((k) => !(k in d)), [], 'faltan en ' + name);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in a)), [], 'huérfanas en ' + name);
    for (const k of Object.keys(a)) assert.equal(vars(d[k]), vars(a[k]), k);
  }
  setLang('en', { persist: false });
  assert.equal(t('grupos.titulo'), 'Groups');
  setLang('es', { persist: false });
});

test('vistas-b (entrenamientos, asistencia, cargas, marcas): paridad es/en/it', async () => {
  const [bes, ben, bit] = (await Promise.all(['es', 'en', 'it'].map((l) => import(`../../js/locales/vistas-b.${l}.js`)))).map((m) => m.default);
  for (const [name, d] of [['en', ben], ['it', bit]]) {
    assert.deepEqual(Object.keys(bes).filter((k) => !(k in d)), [], 'faltan en ' + name);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in bes)), [], 'huérfanas en ' + name);
    for (const k of Object.keys(bes)) assert.equal(vars(d[k]), vars(bes[k]), k);
  }
  for (const k of Object.keys(bes)) assert.match(k, /^(entre|asist|cargas|marcas)\./);
  setLang('en', { persist: false });
  assert.equal(t('marcas.estilo.libre'), 'Freestyle');
  setLang('es', { persist: false });
});

test('cargas-tipos: paridad de claves y variables en es/en/it, y todo predefinido traducido', async () => {
  const [ces, cen, cit] = (await Promise.all(['es', 'en', 'it'].map((l) => import(`../../js/locales/cargas-tipos.${l}.js`)))).map((m) => m.default);
  const D = await import('../../js/domain/cargas.js');
  for (const [name, d] of [['en', cen], ['it', cit]]) {
    assert.deepEqual(Object.keys(ces).filter((k) => !(k in d)), [], 'faltan en ' + name);
    assert.deepEqual(Object.keys(d).filter((k) => !(k in ces)), [], 'huérfanas en ' + name);
    for (const k of Object.keys(ces)) assert.equal(vars(d[k]), vars(ces[k]), k);
  }
  for (const k of Object.keys(ces)) assert.match(k, /^tc\./);
  for (const c of D.CATALOGO_PREDEFINIDO) {
    assert.equal(ces[`tc.${c.clave}.nombre`], c.nombre);
    assert.equal(ces[`tc.${c.clave}.desc`], c.descripcion);
  }
});

test('contenidos: predefinidos se traducen, personalizados se muestran tal cual y la descripción editada manda', async () => {
  const { tContenido, tContenidoDesc } = await import('../../js/i18n.js');
  const D = await import('../../js/domain/cargas.js');
  const fila = D.sembrarCatalogo([]).find((x) => x.id === 'tc-alactico');
  setLang('en', { persist: false });
  assert.equal(tContenido(fila), 'Alactic / Sprint');
  assert.match(tContenidoDesc(fila), /Maximum speed/);
  assert.equal(tContenidoDesc({ ...fila, descripcion: 'Mi texto' }), 'Mi texto');
  assert.equal(tTipo('Aláctico / Sprint'), 'Alactic / Sprint');
  assert.equal(tTipo('aerobico LIGERO'), 'Light aerobic');
  const propio = { id: 'x1', nombre: 'Piernas rápidas', descripcion: 'Texto propio', predefinido: false };
  assert.equal(tContenido(propio), 'Piernas rápidas');
  assert.equal(tContenidoDesc(propio), 'Texto propio');
  setLang('it', { persist: false });
  assert.equal(tContenido(fila), 'Alattacido / Sprint');
  assert.match(tContenidoDesc(fila), /Velocità massima/);
  setLang('es', { persist: false });
  assert.equal(tContenido(fila), 'Aláctico / Sprint');
  assert.equal(tTipo('Aeróbico'), 'Aeróbico', 'tipos antiguos siguen funcionando');
});
