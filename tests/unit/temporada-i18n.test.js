import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import es from '../../js/locales/temporada.es.js';
import en from '../../js/locales/temporada.en.js';
import it from '../../js/locales/temporada.it.js';
import { t, setLang } from '../../js/i18n.js';
import * as D from '../../js/domain/temporada.js';

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

for (const [name, d] of [['en', en], ['it', it]]) {
  test(`temporada ${name}: same keys and variables as es, no empty values`, () => {
    assert.deepEqual(Object.keys(es).filter((k) => !(k in d)), [], 'missing');
    assert.deepEqual(Object.keys(d).filter((k) => !(k in es)), [], 'orphans');
    for (const k of Object.keys(es)) {
      assert.equal(vars(d[k]), vars(es[k]), k);
      assert.ok(d[k].trim().length > 0, k);
    }
  });
}

test('terminology: Fase and Semana in es; Phase/Week in en; Fase/Settimana in it', () => {
  assert.equal(es['tp.fase'], 'Fase');
  assert.equal(es['tp.semana'], 'Semana');
  assert.equal(en['tp.fase'], 'Phase');
  assert.equal(en['tp.semana'], 'Week');
  assert.equal(it['tp.fase'], 'Fase');
  assert.equal(it['tp.semana'], 'Settimana');
  assert.ok(!Object.values(es).some((v) => /macrociclo|microciclo/i.test(v)), 'macro/microcycles are not mentioned in the interface');
});

test('all keys used by the views (literals and dynamic families) exist', () => {
  const claves = new Set();
  for (const f of ['js/views/temporada.js', 'js/views/temporada-grafico.js', 'js/views/planificacion.js', 'js/views/calendario.js']) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    for (const m of src.matchAll(/\bt\('((?:tp|plan\.apartado)[\w.-]*)'/g)) claves.add(m[1]);
  }
  const falta = [...claves].filter((k) => !(k in es) && !k.endsWith('.') && !k.endsWith('-'));
  assert.deepEqual(falta, []);
  const familias = {
    'tp.fase.': D.TIPOS_FASE, 'tp.evento.': D.TIPOS_EVENTO, 'tp.evento-abrev.': D.TIPOS_EVENTO,
    'tp.estado.': ['en-rango', 'bajo', 'alto', 'pendiente', 'en-curso', 'sin-previsto'], 'tp.fuente.': ['cargas', 'planes', 'ninguna'],
    'tp.fuente-op.': ['auto', 'planes', 'cargas'], 'tp.v.': ['sin-fases', 'fases-solapadas', 'hueco-fases', 'fase-fuera-temporada', 'evento-fuera-temporada'],
    'tp.v.sev.': ['error', 'aviso'], 'tp.sug.': ['contenido-bajo', 'contenido-alto', 'previa-competicion', 'tapering', 'sin-previsto'],
    'tp.err.': ['nombre-vacio', 'nombre-largo', 'fecha-invalida', 'fin-antes-inicio', 'duracion-excesiva', 'tipo-invalido', 'color-invalido', 'prioridad-requerida', 'prioridad-invalida', 'volumen-invalido', 'intensidad-invalida', 'contenido-invalido'],
  };
  for (const [pre, lista] of Object.entries(familias)) for (const x of lista) assert.ok(pre + x in es, pre + x);
});

test('texts are resolved in each language through t()', () => {
  setLang('en', { persist: false });
  assert.equal(t('tp.semana-n', { n: 3 }), 'Week 3');
  assert.equal(t('plan.apartado.piscina'), 'Pool');
  setLang('it', { persist: false });
  assert.equal(t('tp.semana-n', { n: 3 }), 'Settimana 3');
  setLang('es', { persist: false });
  assert.equal(t('tp.semana-n', { n: 3 }), 'Semana 3');
  assert.equal(t('plan.apartado.temporada'), 'Temporada');
});
