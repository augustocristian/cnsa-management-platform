// Architecture test: the real js/ tree respects the layer rules (scripts/check-arch.mjs) and the checker itself works
// (rule tests run on small synthetic trees, so a regression in the checker cannot hide a real violation).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { analizar, capaDe, ciclos, comprobar, leerBaseline } from '../../scripts/check-arch.mjs';
import { scan } from '../../scripts/lib/scan.mjs';

function arbol(ficheros) {
  const raiz = mkdtempSync(join(tmpdir(), 'cnl-arch-'));
  for (const [rel, src] of Object.entries(ficheros)) {
    mkdirSync(dirname(join(raiz, rel)), { recursive: true });
    writeFileSync(join(raiz, rel), src);
  }
  return raiz;
}
const reglas = (ficheros) => {
  const raiz = arbol(ficheros);
  try { return analizar(raiz); } finally { rmSync(raiz, { recursive: true, force: true }); }
};
const ids = (r) => r.errores.map((e) => e.regla);

test('the real tree has no architecture violation beyond the baseline (ratchet)', () => {
  const r = comprobar();
  assert.deepEqual(r.nuevos.map((e) => e.msg), [], 'new violations: fix them, do not add them to the baseline');
  assert.deepEqual(r.obsoletos, [], 'fixed violations still in scripts/arch-baseline.json: run node scripts/check-arch.mjs --update-baseline');
});

test('the baseline is a sorted list without duplicates', () => {
  const b = leerBaseline();
  assert.deepEqual(b, [...new Set(b)].sort());
});

test('layer of a path', () => {
  assert.equal(capaDe('js/domain/x.js'), 'domain');
  assert.equal(capaDe('js/application/x.js'), 'application');
  assert.equal(capaDe('js/application/ports/x.js'), 'ports');
  assert.equal(capaDe('js/infrastructure/x.js'), 'infrastructure');
  assert.equal(capaDe('js/presentation/views/x.js'), 'presentation');
  assert.equal(capaDe('js/composicion/x.js'), 'composicion');
  assert.equal(capaDe('js/main.js'), 'composicion');
});

test('scanner: comments, strings, templates and regexes do not produce code', () => {
  const src = [
    "import a from './a.js'; // import x from './no.js'",
    "/* import y from './no2.js' */",
    "const s = 'localStorage fetch Date.now()'; const t = `document ${window} done`;",
    'const r = /fetch\\(/g; const d = 4 / 2; const e = x.fetch;',
    "const m = await import('./dyn.js');",
  ].join('\n');
  const { code, imports } = scan(src);
  assert.deepEqual(imports.map((i) => i.spec), ['./a.js', './dyn.js']);
  assert.equal(imports[1].dynamic, true);
  assert.ok(!/localStorage|Date\.now/.test(code));
  assert.ok(/window/.test(code), 'the code inside ${} is still code');
  assert.ok(!/fetch\(/.test(code), 'regex contents are blanked');
});

test('R1/R4/R6: forbidden directions', () => {
  const r = reglas({
    'js/domain/a.js': "import './../application/b.js';",
    'js/application/b.js': "import '../presentation/ui.js';",
    'js/presentation/ui.js': "import '../infrastructure/c.js';",
    'js/infrastructure/c.js': "import '../presentation/ui.js';",
  });
  assert.deepEqual(ids(r).sort(), ['R1', 'R1', 'R2', 'R4', 'R6']);
});

test('allowed directions pass', () => {
  const r = reglas({
    'js/domain/a.js': 'export const a = 1;',
    'js/application/ports/p.js': "import '../../domain/a.js';",
    'js/application/b.js': "import '../domain/a.js';",
    'js/infrastructure/c.js': "import '../application/b.js'; import '../domain/a.js';",
    'js/presentation/v.js': "import '../application/b.js'; import '../domain/a.js';",
    'js/composicion/x.js': "import '../infrastructure/c.js'; import '../presentation/v.js';",
    'js/main.js': "import './composicion/x.js';",
  });
  assert.deepEqual(r.errores, []);
});

test('R2: cycles', () => {
  const r = reglas({ 'js/domain/a.js': "import './b.js';", 'js/domain/b.js': "import './a.js';" });
  assert.deepEqual(ids(r), ['R2']);
  assert.deepEqual(ciclos(new Map([['a', new Set(['b'])], ['b', new Set(['c'])], ['c', new Set()]])), []);
});

test('R3: forbidden globals in domain/application, strings and properties are ignored', () => {
  const r = reglas({
    'js/domain/ok.js': "export const a = 'document fetch'; // window\nexport const f = (o) => o.fetch + o.window; export const d = new Date(2026, 1, 1);",
    'js/domain/bad.js': 'export const a = () => Date.now() + Math.random(); export const b = () => localStorage.getItem("x"); export const c = new Date();',
    'js/application/bad.js': 'export const a = () => { setTimeout(() => console.log(1), 5); return document.title; };',
  });
  const claves = r.errores.map((e) => e.clave).sort();
  assert.deepEqual(claves, [
    'R3 js/application/bad.js: console', 'R3 js/application/bad.js: document', 'R3 js/application/bad.js: setTimeout',
    'R3 js/domain/bad.js: Date.now()', 'R3 js/domain/bad.js: Math.random()', 'R3 js/domain/bad.js: localStorage', 'R3 js/domain/bad.js: new Date()',
  ].sort());
});

test('R5/R7/R8: locales, ports and composition root', () => {
  const r = reglas({
    'js/presentation/i18n/locales/es.js': 'export default {};',
    'js/presentation/i18n/i18n.js': "import './locales/es.js';",
    'js/presentation/views/v.js': "import '../i18n/locales/es.js'; import '../../composicion/x.js';",
    'js/application/ports/p.js': "import '../s.js';",
    'js/application/s.js': 'export const s = 1;',
    'js/composicion/x.js': 'export const x = 1;',
  });
  assert.deepEqual(ids(r).sort(), ['R5', 'R7', 'R8']);
});

test('R9: size, R10: <style>, R11: warning, R12: unresolved or without .js', () => {
  const grande = Array.from({ length: 620 }, (_, i) => `export const v${i} = ${i};`).join('\n');
  const medio = Array.from({ length: 500 }, (_, i) => `export const v${i} = ${i};`).join('\n');
  const r = reglas({
    'js/domain/grande.js': grande,
    'js/domain/medio.js': medio,
    'js/presentation/views/v.js': "export const a = () => { const s = document.createElement('style'); store.upsert('X', {}); };",
    'js/presentation/views/w.js': "import './no-existe.js'; import './v';",
  });
  assert.deepEqual(ids(r).sort(), ['R10', 'R12', 'R12', 'R9']);
  assert.ok(r.avisos.some((a) => a.startsWith('R9 js/domain/medio.js')));
  assert.ok(r.avisos.some((a) => a.startsWith('R11 js/presentation/views/v.js')));
});

test('ratchet: a new violation fails, a stale baseline entry fails', () => {
  const raiz = arbol({ 'js/domain/a.js': "import '../presentation/x.js';", 'js/presentation/x.js': 'export const x = 1;' });
  try {
    const sin = comprobar(raiz, []);
    assert.equal(sin.nuevos.length, 1);
    const clave = sin.nuevos[0].clave;
    const con = comprobar(raiz, [clave]);
    assert.equal(con.nuevos.length, 0);
    assert.equal(con.tolerados, 1);
    const obsoleto = comprobar(raiz, [clave, 'R1 js/zzz.js -> js/yyy.js']);
    assert.deepEqual(obsoleto.obsoletos, ['R1 js/zzz.js -> js/yyy.js']);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});

test('R12: a dynamic import with a template must point to an existing folder', () => {
  const r = reglas({
    'js/presentation/views/a.js': 'export const a = 1;',
    'js/presentation/shell/s.js': 'export const l = (n) => import(`../views/${n}.js`); export const m = (n) => import(`../vistas/${n}.js`);',
  });
  assert.deepEqual(r.errores.map((e) => e.clave), ['R12 js/presentation/shell/s.js -> ../vistas/... (missing folder)']);
});
