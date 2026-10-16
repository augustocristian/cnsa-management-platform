// Contrast and derivation of the club colour (js/domain/tema.js): the chosen colour must never make text unreadable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, toHex, luminancia, contraste, colorSobrePrimario, variablesTema, ajustarContraste, SUPERFICIES, BLANCO, NEGRO_TEXTO, DEFECTO } from '../../js/domain/tema.js';

const HEX = /^#[0-9a-f]{6}$/;
const PROBLEMATICOS = ['#ffd600', '#4fc3f7', '#2ecc71', '#000000', '#ffffff', '#777777', '#e91e63', '#ff9800', '#9e9e9e', '#00bcd4'];

test('WCAG luminance and contrast ratio', () => {
  assert.equal(luminancia([255, 255, 255]), 1);
  assert.equal(luminancia([0, 0, 0]), 0);
  assert.equal(Math.round(contraste([0, 0, 0], BLANCO) * 100) / 100, 21);
  assert.equal(contraste([10, 20, 30], [10, 20, 30]), 1);
  assert.ok(Math.abs(contraste(parseHex('#777777'), BLANCO) - 4.48) < 0.02, '#777 on white ~4.48');
  assert.ok(Math.abs(contraste(BLANCO, parseHex('#777777')) - contraste(parseHex('#777777'), BLANCO)) < 1e-9, 'symmetric');
});

test('text tokens meet the required contrasts (light and dark)', () => {
  const c = (a, b) => contraste(parseHex(a), parseHex(b));
  assert.ok(c('#566377', '#f4f7fb') >= 4.5 && c('#566377', '#ffffff') >= 4.5, '--muted light');
  assert.ok(c('#9fb0c8', '#0f1723') >= 4.5 && c('#9fb0c8', '#1d2b40') >= 4.5, '--muted dark');
  assert.ok(c('#818fa3', '#ffffff') >= 3 && c('#818fa3', '#f4f7fb') >= 3, '--field-border light >= 3:1');
  assert.ok(c('#667794', '#172233') >= 3 && c('#667794', '#0f1723') >= 3, '--field-border dark >= 3:1');
  for (const col of ['#157a45', '#8a5300', '#c5221f', '#0b5cad']) assert.ok(c(col, '#ffffff') >= 4.5, col);
});

test('parseHex accepts #rgb and #rrggbb and rejects anything else', () => {
  assert.deepEqual(parseHex('#fff'), [255, 255, 255]);
  assert.deepEqual(parseHex('1A73E8'), [26, 115, 232]);
  assert.deepEqual(parseHex('  #0b3d91 '), [11, 61, 145]);
  const malas = ['', null, undefined, 42, {}, 'red', 'rgb(0,0,0)', '#12', '#12345', '#1234567', '#gggggg', 'url(javascript:alert(1))',
    '#ffd600;background:url(//evil)', '#fff</style><script>', 'var(--x)', '#fff !important', 'expression(alert(1))'];
  for (const mala of malas) assert.equal(parseHex(mala), null, String(mala));
});

test('toHex rounds and clamps', () => {
  assert.equal(toHex([0, 128.4, 255]), '#0080ff');
  assert.equal(toHex([-5, 300, 17]), '#00ff11');
});

test('colorSobrePrimario: white or #111 with contrast >= 4.5 for problematic colours', () => {
  const casos = { '#ffd600': NEGRO_TEXTO, '#4fc3f7': NEGRO_TEXTO, '#2ecc71': NEGRO_TEXTO, '#000000': BLANCO, '#1a73e8': BLANCO };
  for (const [hex, on] of Object.entries(casos)) {
    const r = colorSobrePrimario(parseHex(hex));
    assert.deepEqual(r.on, on, hex);
    assert.deepEqual(r.action, parseHex(hex), `${hex}: if it passes, it is left untouched`);
  }
  for (const hex of PROBLEMATICOS) {
    const { action, on } = colorSobrePrimario(parseHex(hex));
    assert.ok(contraste(action, on) >= 4.5, `${hex} -> ${toHex(action)} / ${toHex(on)} = ${contraste(action, on).toFixed(2)}`);
  }
});

test('colorSobrePrimario darkens the primary when neither white nor #111 passes', () => {
  // #e91e63: white gives 4.35 and #111 4.34 -> it is darkened until white passes
  const orig = parseHex('#e91e63');
  assert.ok(contraste(orig, BLANCO) < 4.5 && contraste(orig, NEGRO_TEXTO) < 4.5);
  const { action, on } = colorSobrePrimario(orig);
  assert.deepEqual(on, BLANCO);
  assert.ok(luminancia(action) < luminancia(orig), 'darker than the original');
  assert.ok(contraste(action, BLANCO) >= 4.5);
  assert.ok(action.every((v, i) => v <= orig[i] + 1), 'it only darkens, the hue does not change');
});

test('ajustarContraste: keeps what already passes and converges to the target', () => {
  assert.deepEqual(ajustarContraste([0, 0, 0], BLANCO, [0, 0, 0]), [0, 0, 0]);
  const c = ajustarContraste(parseHex('#ffd600'), SUPERFICIES.light.bg, [0, 0, 0]);
  assert.ok(contraste(c, SUPERFICIES.light.bg) >= 4.5);
  const d = ajustarContraste(parseHex('#0b3d91'), SUPERFICIES.dark.surface2, BLANCO);
  assert.ok(contraste(d, SUPERFICIES.dark.surface2) >= 4.5);
});

test('variablesTema: guaranteed contrasts in light and dark with problematic colours', () => {
  for (const modo of ['light', 'dark']) {
    const sup = SUPERFICIES[modo];
    const fondoTexto = modo === 'dark' ? sup.surface2 : sup.bg;
    for (const p of PROBLEMATICOS) {
      for (const s of ['#0b3d91', '#000000', '#ffd600', '#ffffff']) {
        const v = variablesTema({ primario: p, secundario: s }, modo);
        for (const [k, val] of Object.entries(v)) assert.match(val, HEX, `${modo} ${p}/${s} ${k}`);
        const rgb = (k) => parseHex(v[k]);
        assert.ok(contraste(rgb('--c-action'), rgb('--c-on-primary')) >= 4.5, `${modo} ${p}: primary button`);
        assert.ok(contraste(rgb('--c-accent'), fondoTexto) >= 4.5, `${modo} ${p}: accent as text`);
        assert.ok(contraste(rgb('--c-heading'), fondoTexto) >= 4.5, `${modo} ${s}: headings`);
        assert.ok(contraste(rgb('--c-accent'), sup.surface) >= 4.5, `${modo} ${p}: accent on the card`);
        assert.ok([toHex(BLANCO), toHex(NEGRO_TEXTO)].includes(v['--c-on-primary']), 'on-primary is white or #111');
      }
    }
  }
});

test('variablesTema: in light mode --c-primary/--c-secondary are exactly the chosen ones (compatibility with views and tests)', () => {
  const v = variablesTema({ primario: '#E91E63', secundario: '#00796b' }, 'light');
  assert.equal(v['--c-primary'], '#e91e63');
  assert.equal(v['--c-secondary'], '#00796b');
  assert.notEqual(v['--c-action'], '#e91e63', 'the button is darkened to reach 4.5:1');
});

test('variablesTema: invalid or malicious input falls back to the default colour', () => {
  const defecto = variablesTema({}, 'light');
  assert.equal(defecto['--c-primary'], DEFECTO.primario);
  assert.equal(defecto['--c-secondary'], DEFECTO.secundario);
  for (const mala of ['red', '#12', 'url(x)', '#fff;}body{display:none', 'javascript:alert(1)', null, undefined, 123, {}, ['#fff']]) {
    const v = variablesTema({ primario: mala, secundario: mala }, 'dark');
    assert.deepEqual(v, variablesTema({}, 'dark'), String(mala));
    for (const val of Object.values(v)) assert.match(val, HEX);
  }
  assert.deepEqual(variablesTema(undefined, 'light'), defecto);
  assert.deepEqual(variablesTema({ primario: '#ffd600' }, 'banana'), variablesTema({ primario: '#ffd600' }, 'light'), 'unknown mode = light');
});

test('variablesTema: a sweep of 600 colours always passes', () => {
  for (let i = 0; i < 600; i++) {
    const hex = toHex([(i * 53) % 256, (i * 97) % 256, (i * 193) % 256]);
    for (const modo of ['light', 'dark']) {
      const v = variablesTema({ primario: hex, secundario: hex }, modo);
      assert.ok(contraste(parseHex(v['--c-action']), parseHex(v['--c-on-primary'])) >= 4.5, `${modo} ${hex}`);
    }
  }
});
