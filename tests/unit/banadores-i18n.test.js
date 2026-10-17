import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import es from '../../js/presentation/i18n/locales/banadores.es.js';
import en from '../../js/presentation/i18n/locales/banadores.en.js';
import it from '../../js/presentation/i18n/locales/banadores.it.js';
import { t, setLang } from '../../js/presentation/i18n/i18n.js';
import { TIPOS_BANADOR, validarBanador } from '../../js/domain/banadores.js';

const vars = (s) =>
  [...s.matchAll(/\{(\w+)\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');

test('banadores locales: same keys and interpolation variables in es/en/it, all prefixed bn., none empty', () => {
  for (const [name, d] of [
    ['en', en],
    ['it', it],
  ]) {
    assert.deepEqual(
      Object.keys(es).filter((k) => !(k in d)),
      [],
      'missing in ' + name,
    );
    assert.deepEqual(
      Object.keys(d).filter((k) => !(k in es)),
      [],
      'orphan in ' + name,
    );
    for (const k of Object.keys(es)) assert.equal(vars(d[k]), vars(es[k]), k);
  }
  for (const d of [es, en, it])
    for (const [k, v] of Object.entries(d)) {
      assert.match(k, /^bn\./);
      assert.ok(v.trim(), k);
    }
});

test('every type and every validation code has a translation; the merged dictionary exposes them', () => {
  const codigos = [
    'tipo-invalido',
    'marca-vacia',
    'modelo-vacio',
    'marca-larga',
    'modelo-largo',
    'notas-largas',
    'duplicado',
    'no-existe',
  ];
  for (const d of [es, en, it]) {
    for (const tp of TIPOS_BANADOR)
      for (const p of ['bn.tipo.', 'bn.tipo-corto.', 'bn.grupo.', 'bn.vacio.']) assert.ok(d[p + tp], p + tp);
    for (const c of codigos) assert.ok(d['bn.err.' + c], c);
  }
  assert.deepEqual(
    validarBanador({ tipo: 'competicion' })
      .map((e) => e.codigo)
      .filter((c) => !es['bn.err.' + c]),
    [],
  );
  setLang('en', { persist: false });
  assert.equal(t('bn.tipo.entrenamiento'), 'Training suit');
  assert.equal(t('bn.tipo.competicion'), 'Fast skin (competition)');
  setLang('it', { persist: false });
  assert.equal(t('bn.tipo.competicion'), 'Costume tecnico (gara)');
  setLang('es', { persist: false });
  assert.equal(t('bn.tipo.competicion'), 'Bañador técnico (competición)');
});

test('the view only uses keys that exist (static scan of js/presentation/views/banadores-catalogo.js)', () => {
  const src = readFileSync(new URL('../../js/presentation/views/banadores-catalogo.js', import.meta.url), 'utf8');
  const literales = [...src.matchAll(/'(bn\.[\w.-]+)'/g)].map((m) => m[1]).filter((k) => !k.endsWith('.'));
  assert.ok(literales.length > 20);
  for (const k of literales) assert.ok(k in es, k);
  const prefijos = [...src.matchAll(/'(bn\.[\w.-]+\.)'/g)].map((m) => m[1]);
  assert.ok(prefijos.length >= 4);
  for (const p of prefijos)
    assert.ok(
      Object.keys(es).some((k) => k.startsWith(p)),
      p,
    );
});
