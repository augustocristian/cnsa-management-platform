// Static checks of the design system: real contrast of css/tokens.css, CSP, manifest, icons and SRI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { ROOT } from '../helpers/env.js';
import { parseHex, contraste, mezclar } from '../../js/domain/tema.js';

const leer = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const tokens = leer('css/tokens.css');

// Extracts the hex variables of the block starting at `inicio` (first '{' to its closing '}')
function bloque(inicio) {
  const i = tokens.indexOf(inicio);
  assert.ok(i >= 0, 'block not found: ' + inicio);
  const a = tokens.indexOf('{', i);
  let nivel = 0;
  let j = a;
  for (; j < tokens.length; j++) {
    if (tokens[j] === '{') nivel++;
    else if (tokens[j] === '}' && --nivel === 0) break;
  }
  const vars = {};
  for (const m of tokens.slice(a, j).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) vars[m[1]] = m[2];
  return vars;
}
const claro = bloque(':root {');
const oscuro = bloque(":root[data-theme='dark'] {");
const auto = bloque(":root:not([data-theme='light']):not([data-theme='dark']) {");
const rgb = (hex) => parseHex(hex);
const c = (a, b) => contraste(rgb(a), rgb(b));
const mezcla = (a, b, pct) => mezclar(rgb(b), rgb(a), pct / 100); // color-mix(in srgb, a pct%, b)

test('tokens.css: the automatic dark theme repeats the dark values exactly', () => {
  for (const [k, v] of Object.entries(oscuro)) assert.equal(auto[k], v, k);
  assert.deepEqual(Object.keys(auto).sort(), Object.keys(oscuro).sort());
});

test('tokens.css: values from the specification', () => {
  assert.deepEqual(
    [claro['--bg'], claro['--surface'], claro['--text'], claro['--muted'], claro['--border']],
    ['#f4f7fb', '#ffffff', '#1f2a3a', '#566377', '#c9d3e0'],
  );
  assert.deepEqual([claro['--ok'], claro['--warn'], claro['--danger']], ['#157a45', '#8a5300', '#c5221f']);
  assert.deepEqual(
    [
      oscuro['--bg'],
      oscuro['--surface'],
      oscuro['--surface-2'],
      oscuro['--text'],
      oscuro['--muted'],
      oscuro['--border'],
    ],
    ['#0f1723', '#172233', '#1d2b40', '#e8eef7', '#9fb0c8', '#2c3d57'],
  );
});

for (const [nombre, t] of [
  ['light', claro],
  ['dark', oscuro],
]) {
  test(`real contrast (${nombre}): text and secondary >= 4.5:1 on every surface`, () => {
    for (const s of ['--bg', '--surface', '--surface-2']) {
      assert.ok(c(t['--text'], t[s]) >= 7, `--text on ${s}: ${c(t['--text'], t[s]).toFixed(2)}`);
      assert.ok(c(t['--muted'], t[s]) >= 4.5, `--muted on ${s}: ${c(t['--muted'], t[s]).toFixed(2)}`);
      assert.ok(
        c(t['--field-border'], t[s]) >= 3,
        `--field-border on ${s}: ${c(t['--field-border'], t[s]).toFixed(2)}`,
      );
    }
  });
  test(`real contrast (${nombre}): semantic colours as text on their tinted background and on the surface`, () => {
    for (const k of ['ok', 'warn', 'danger', 'info', 'neutral']) {
      const pct = nombre === 'light' ? (k === 'danger' || k === 'info' ? 10 : 12) : 16;
      const tinte =
        '#' +
        mezcla(t[`--${k}`], t['--surface'], pct)
          .map((v) => Math.round(v).toString(16).padStart(2, '0'))
          .join('');
      assert.ok(c(t[`--${k}`], tinte) >= 4.5, `${k} on its tint ${tinte}: ${c(t[`--${k}`], tinte).toFixed(2)}`);
      assert.ok(c(t[`--${k}`], t['--surface']) >= 4.5, `${k} on --surface`);
      assert.ok(c(t['--text'], tinte) >= 7, `normal text on the ${k} tint`);
    }
    assert.ok(c(t['--on-danger'], t['--danger']) >= 4.5, 'danger button text');
    assert.ok(c(t['--toast-text'], t['--toast-bg']) >= 7, 'toast');
    assert.ok(c(t['--toast-action'], t['--toast-bg']) >= 4.5, 'toast Undo action');
  });
  test(`real contrast (${nombre}): default brand colour`, () => {
    assert.ok(c(t['--c-on-primary'], t['--c-action']) >= 4.5, 'primary button text');
    for (const s of ['--bg', '--surface', '--surface-2']) {
      assert.ok(c(t['--c-accent'], t[s]) >= 4.5, `--c-accent on ${s}`);
      assert.ok(c(t['--c-heading'], t[s]) >= 4.5, `--c-heading on ${s}`);
    }
  });
}

test('tokens.css defines the required scales', () => {
  for (const v of [
    '--sp-1: 4px',
    '--sp-2: 8px',
    '--sp-3: 12px',
    '--sp-4: 16px',
    '--sp-5: 24px',
    '--sp-6: 32px',
    '--r-sm: 8px',
    '--r-md: 12px',
    '--r-lg: 16px',
    '--r-pill: 999px',
    '--fs-h1: 1.5rem',
    '--fs-h2: 1.125rem',
    '--fs-h3: 1rem',
    '--fs-sm: 0.875rem',
    '--fs-xs: 0.75rem',
    '--touch: 44px',
  ])
    assert.ok(tokens.includes(v), v);
  for (const s of ['--shadow-1', '--shadow-2', '--shadow-3']) assert.ok(tokens.includes(s + ':'), s);
  assert.match(tokens, /h1 \{\s*font-size: var\(--fs-h1\);\s*font-weight: 700;\s*\}/);
  assert.match(tokens, /:focus-visible \{\s*outline: 2px solid var\(--focus\)/);
  assert.match(tokens, /prefers-reduced-motion: reduce/);
  assert.match(tokens, /font-variant-numeric: tabular-nums/);
});

test('components.css: every component of the contract exists', () => {
  const css = leer('css/components.css');
  for (const s of [
    '.btn--primary',
    '.btn--secondary',
    '.btn--ghost',
    '.btn--danger',
    '.btn-sm',
    '.btn-icon',
    '.field',
    '.field-error',
    '.filters',
    '.badge--ok',
    '.badge--warn',
    '.badge--danger',
    '.badge--info',
    '.badge--neutral',
    '.chip',
    '.alert',
    '.card-head',
    '.table-wrap',
    '.table--cards',
    '.empty',
    '.tabs',
    '.segmented',
    '.stat',
    '.stat-delta',
    '.page-head',
    '.sheet',
    '.toast',
    '.toast-action',
    '.skip-link',
    '.avatar',
    '.progress',
    '.check',
  ]) {
    assert.ok(css.includes(s), s);
  }
  assert.match(css, /content: attr\(data-label\)/);
  assert.match(css, /input\[type=["']file["']\]::file-selector-button/);
});

test('index.html: CSP, skip link, color-scheme, styles and apple-touch-icon', () => {
  const html = leer('index.html');
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'missing CSP');
  const dir = Object.fromEntries(
    csp
      .split(';')
      .map((d) => d.trim().split(/\s+/))
      .map(([k, ...v]) => [k, v]),
  );
  assert.deepEqual(dir['default-src'], ["'none'"]);
  assert.deepEqual(dir['script-src'], ["'self'", 'https://accounts.google.com/gsi/client']);
  assert.ok(!dir['script-src'].includes("'unsafe-inline'") && !dir['script-src'].includes("'unsafe-eval'"));
  assert.ok(dir['connect-src'].includes('https://www.googleapis.com'));
  assert.deepEqual(dir['form-action'], ["'none'"]);
  assert.deepEqual(dir['base-uri'], ["'self'"]);
  assert.ok(
    dir['frame-src'].includes('blob:') && dir['img-src'].includes('data:') && dir['worker-src'].includes("'self'"),
  );
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>[^<]/.test(html), 'no inline scripts');
  assert.match(html, /<meta name="color-scheme" content="light dark"\s*\/?>/);
  assert.match(html, /<a class="skip-link" href="#view">/);
  assert.ok(
    html.indexOf('tokens.css') < html.indexOf('app.css') && html.indexOf('app.css') < html.indexOf('components.css'),
    'order tokens -> app -> components',
  );
  assert.ok(html.indexOf('theme-boot.js') < html.indexOf('tokens.css'), 'the theme is set before styles load');
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/icons\/apple-touch-icon\.png"\s*\/?>/);
  assert.match(html, /<title>CNL Plataforma<\/title>/);
});

// Reads the dimensions and colour type of a PNG (IHDR); callers check there is no alpha channel
function infoPng(rel) {
  const b = readFileSync(path.join(ROOT, rel));
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], rel + ' is not a PNG');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), colorType: b[25], bytes: b };
}

test('icons: apple-touch 180x180 and maskable 512x512 without transparency', () => {
  const a = infoPng('icons/apple-touch-icon.png');
  assert.deepEqual([a.w, a.h], [180, 180]);
  assert.ok(a.colorType === 2 || a.colorType === 0, 'RGB without alpha');
  const m = infoPng('icons/icon-maskable-512.png');
  assert.deepEqual([m.w, m.h], [512, 512]);
  assert.equal(m.colorType, 2);
});

test('maskable icon: the motif fits the safe zone (central 80 % circle) and the edges are the brand colour', () => {
  const { bytes, w } = infoPng('icons/icon-maskable-512.png');
  // join the IDAT chunks and unfilter (the generator uses filter 0)
  let off = 8;
  const partes = [];
  while (off < bytes.length) {
    const len = bytes.readUInt32BE(off);
    const tipo = bytes.toString('ascii', off + 4, off + 8);
    if (tipo === 'IDAT') partes.push(bytes.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(partes));
  const px = (x, y) => {
    const o = y * (w * 3 + 1) + 1 + x * 3;
    return [raw[o], raw[o + 1], raw[o + 2]];
  };
  const fondo = px(0, 0);
  assert.deepEqual(fondo, [26, 115, 232]);
  const radioSeguro = w * 0.4;
  for (let y = 0; y < w; y += 3)
    for (let x = 0; x < w; x += 3) {
      const p = px(x, y);
      if (p.every((v, i) => v === fondo[i])) continue;
      assert.ok(Math.hypot(x - w / 2, y - w / 2) <= radioSeguro, `motif pixel outside the safe zone at ${x},${y}`);
    }
});

test('manifest: id, separate any and maskable icons, shortcuts and categories', () => {
  const m = JSON.parse(leer('manifest.webmanifest'));
  assert.ok(m.id && m.lang === 'es' && m.description && m.categories.length);
  assert.equal(m.display, 'standalone');
  assert.equal(m.theme_color, '#1a73e8');
  for (const i of m.icons) {
    assert.ok(existsSync(path.join(ROOT, i.src)), i.src);
    assert.ok(!/\bany\b.*\bmaskable\b|\bmaskable\b.*\bany\b/.test(i.purpose || ''), 'any and maskable are not mixed');
  }
  assert.ok(m.icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'any' && i.sizes === '512x512'));
  assert.deepEqual(
    m.shortcuts.map((s) => s.name),
    ['Entrenamientos', 'Asistencia', 'Calendario'],
  );
  assert.deepEqual(
    m.shortcuts.map((s) => s.url.split('#')[1]),
    ['/entrenamientos', '/asistencia', '/calendario'],
  );
});

test('SRI: vendor/integrity.json matches the vendor/ files and the lazy loaders use it', () => {
  const sri = JSON.parse(leer('vendor/integrity.json'));
  for (const f of ['xlsx.full.min.js', 'jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js']) {
    const esperado =
      'sha384-' +
      createHash('sha384')
        .update(readFileSync(path.join(ROOT, 'vendor', f)))
        .digest('base64');
    assert.equal(sri[f], esperado, f);
  }
  assert.match(leer('js/infrastructure/pdfEntreno.js'), /s\.integrity = sri/);
  assert.match(leer('scripts/vendor.mjs'), /integrity\.json/);
});

test('sw.js includes the new design system files in the shell', () => {
  const sw = leer('sw.js');
  for (const f of [
    './css/tokens.css',
    './css/components.css',
    './js/presentation/theme.js',
    './js/presentation/theme-boot.js',
    './js/domain/tema.js',
    './vendor/integrity.json',
    './icons/apple-touch-icon.png',
    './icons/icon-maskable-512.png',
    './js/presentation/i18n/locales/diseno.es.js',
  ])
    assert.ok(sw.includes(`'${f}'`), f);
});
