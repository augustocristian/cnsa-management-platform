import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang, t } from '../../js/presentation/i18n/i18n.js';

const FICHEROS = ['vistas-a', 'vistas-c', 'datos'];
const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const cargar = (lang) => Promise.all(FICHEROS.map((f) => import(`../../js/presentation/i18n/locales/${f}.${lang}.js`).then((m) => m.default)));

for (const f of FICHEROS) {
  test(`${f}: es/en/it have the same keys, variables and no empty values`, async () => {
    const [es, en, it] = await Promise.all(['es', 'en', 'it'].map((l) => import(`../../js/presentation/i18n/locales/${f}.${l}.js`).then((m) => m.default)));
    for (const [nombre, d] of [['en', en], ['it', it]]) {
      assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), [], `missing in ${nombre}`);
      assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), [], `orphans in ${nombre}`);
      for (const k of Object.keys(es)) {
        assert.equal(vars(d[k]), vars(es[k]), k);
        assert.ok(d[k].trim().length > 0, `empty: ${k}`);
      }
    }
  });
}

// Every t('key') used by the people-and-club views must exist (guards typos and removed keys).
test('keys used by the swimmer, group, notice and settings views exist in every language', async () => {
  const vistas = ['nadadores', 'nadadores-lista', 'nadadores-form', 'nadadores-categoria', 'nadadores-ficha', 'nadadores-secciones', 'nadadores-grafico',
    'grupos', 'comunicaciones', 'club', 'club-identidad', 'club-datos', 'categorias-panel', 'datos-integridad'];
  const usadas = new Set();
  for (const v of vistas) {
    const src = readFileSync(new URL(`../../js/presentation/views/${v}.js`, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('([\w.-]+)'/g)) usadas.add(m[1]);
  }
  // Keys built from a code (t('prefix.' + code)) end with a dot in the source: check their real variants instead.
  [...usadas].filter((k) => k.endsWith('.')).forEach((k) => usadas.delete(k));
  ['nadadores.err.nombre-obligatorio', 'nadadores.err.apellidos-obligatorios', 'nadadores.err.email-invalido', 'nadadores.err.telefono-invalido',
    'grupos.err.nombre-obligatorio', 'grupos.err.nombre-duplicado', 'comu.err.titulo-obligatorio', 'comu.err.texto-obligatorio', 'club.err.nombre-obligatorio',
    'comu.rel.hoy', 'comu.rel.ayer', 'comu.rel.dias', 'shell.drive.demo', 'shell.drive.sincronizado'].forEach((k) => usadas.add(k));
  for (const lang of ['es', 'en', 'it']) {
    const todo = Object.assign({}, ...(await Promise.all([import(`../../js/presentation/i18n/locales/${lang}.js`).then((m) => m.default), ...['acceso', 'categorias', 'cargas-tipos', 'diseno', 'banadores', 'inicio', 'vistas-b'].map((f) => import(`../../js/presentation/i18n/locales/${f}.${lang}.js`).then((m) => m.default).catch(() => ({}))), cargar(lang).then((l) => Object.assign({}, ...l))])));
    const faltan = [...usadas].filter((k) => !(k in todo));
    assert.deepEqual(faltan, [], `missing in ${lang}`);
  }
});

test('the three languages render the new people texts', () => {
  for (const [lang, esperado] of [['es', 'Guardar y añadir otro'], ['en', 'Save and add another'], ['it', 'Salva e aggiungi un altro']]) {
    setLang(lang, { persist: false });
    assert.equal(t('nadadores.guardar-y-otro'), esperado);
  }
  setLang('es', { persist: false });
});
