// Service worker generator: the precache list is complete, the version is a content hash, stale lists and broken
// references are reported. Runs against a throw-away copy of a tiny app (never against the real tree, except one sanity test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  listarArchivos,
  calcularVersion,
  bloqueGenerado,
  aplicarBloque,
  comprobar,
  generar,
  verificar,
  MARCA_INICIO,
  MARCA_FIN,
  EXCLUIDOS,
} from '../../scripts/generate-sw.mjs';
import { ROOT } from '../helpers/env.js';

const PLANTILLA = `// header\n${MARCA_INICIO}\nconst VERSION = 'x';\nconst SHELL = [];\nconst OPCIONALES = [];\n${MARCA_FIN}\n// footer\n`;

function app(extra = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'cnl-sw-'));
  const files = {
    'index.html':
      '<!doctype html><link rel="stylesheet" href="./css/app.css"><script type="module" src="./js/main.js"></script>',
    'manifest.webmanifest': '{}',
    'css/app.css': 'body{margin:0}',
    'css/views/grupos.css': '.g{color:red}',
    'js/main.js': "import { a } from './util/a.js';\nimport('./util/lazy.js');\nuseStyles('grupos');\n",
    'js/util/a.js': 'export const a = 1;',
    'js/util/lazy.js': 'export const l = 1;',
    'js/infrastructure/fakeGoogle.js': 'export const fake = 1;',
    'icons/icon.svg': '<svg/>',
    'vendor/lib.min.js': 'var lib=1;',
    'sw.js': PLANTILLA,
    ...extra,
  };
  for (const [rel, contenido] of Object.entries(files)) {
    const abs = join(raiz, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, contenido);
  }
  return raiz;
}
const limpiar = (raiz) => rmSync(raiz, { recursive: true, force: true });

test('lists every file under index/manifest/css/js/icons/vendor, sorted, without test tooling or sw.js', () => {
  const raiz = app();
  try {
    const lista = listarArchivos(raiz);
    assert.deepEqual(lista, [
      'css/app.css',
      'css/views/grupos.css',
      'icons/icon.svg',
      'index.html',
      'js/main.js',
      'js/util/a.js',
      'js/util/lazy.js',
      'manifest.webmanifest',
      'vendor/lib.min.js',
    ]);
    assert.ok(!lista.includes('sw.js'));
    for (const x of EXCLUIDOS) assert.ok(!lista.includes(x));
  } finally {
    limpiar(raiz);
  }
});

test('picks up new per-view stylesheets and modules automatically', () => {
  const raiz = app();
  try {
    writeFileSync(join(raiz, 'css/views/marcas.css'), '.m{}');
    mkdirSync(join(raiz, 'js/presentation'), { recursive: true });
    writeFileSync(join(raiz, 'js/presentation/nuevo.js'), 'export {};');
    const lista = listarArchivos(raiz);
    assert.ok(lista.includes('css/views/marcas.css') && lista.includes('js/presentation/nuevo.js'));
  } finally {
    limpiar(raiz);
  }
});

test('version: stable, changes when a file changes, is added or removed, ignores CRLF', () => {
  const raiz = app();
  try {
    const v0 = calcularVersion(listarArchivos(raiz), raiz);
    assert.match(v0, /^[0-9a-f]{12}$/);
    assert.equal(calcularVersion(listarArchivos(raiz), raiz), v0, 'deterministic');
    writeFileSync(join(raiz, 'js/util/a.js'), 'export const a = 2;');
    const v1 = calcularVersion(listarArchivos(raiz), raiz);
    assert.notEqual(v1, v0, 'content change');
    writeFileSync(join(raiz, 'js/util/b.js'), 'export {};');
    const v2 = calcularVersion(listarArchivos(raiz), raiz);
    assert.notEqual(v2, v1, 'new file');
    rmSync(join(raiz, 'js/util/b.js'));
    assert.equal(calcularVersion(listarArchivos(raiz), raiz), v1, 'removal restores the version');
    // CRLF checkout (Windows) must hash like an LF checkout (Linux CI)
    writeFileSync(join(raiz, 'css/app.css'), 'body{margin:0}\r\n');
    const crlf = calcularVersion(listarArchivos(raiz), raiz);
    writeFileSync(join(raiz, 'css/app.css'), 'body{margin:0}\n');
    assert.equal(calcularVersion(listarArchivos(raiz), raiz), crlf);
    // editing sw.js itself does not change the version
    writeFileSync(join(raiz, 'sw.js'), PLANTILLA + '// edited\n');
    assert.equal(calcularVersion(listarArchivos(raiz), raiz), crlf);
  } finally {
    limpiar(raiz);
  }
});

test('generated block: SHELL has every file, vendor is optional, markers are replaced in place', () => {
  const raiz = app();
  try {
    const archivos = listarArchivos(raiz);
    const bloque = bloqueGenerado(archivos, 'abc123');
    assert.match(bloque, /const VERSION = 'abc123';/);
    for (const f of archivos) assert.ok(bloque.includes(`'./${f}'`), f);
    assert.ok(bloque.includes("'./',"));
    const opcionales = bloque.slice(bloque.indexOf('const OPCIONALES'));
    assert.ok(opcionales.includes('./vendor/lib.min.js') && !opcionales.includes('./js/main.js'));
    const sw = aplicarBloque(PLANTILLA, bloque);
    assert.ok(sw.startsWith('// header\n') && sw.endsWith('// footer\n'));
    assert.throws(() => aplicarBloque('no markers', bloque), /markers/);
    // CRLF files keep CRLF
    const crlf = aplicarBloque(PLANTILLA.replace(/\n/g, '\r\n'), bloque);
    assert.ok(!/[^\r]\n/.test(crlf));
  } finally {
    limpiar(raiz);
  }
});

test('comprobar: stale after a new file, fixed after generar', () => {
  const raiz = app();
  try {
    assert.equal(comprobar(raiz).ok, false, 'placeholder list is stale');
    generar(raiz);
    const ok = comprobar(raiz);
    assert.equal(ok.ok, true, ok.problemas.join('\n'));
    writeFileSync(join(raiz, 'css/views/nuevo.css'), '.n{}');
    const rancio = comprobar(raiz);
    assert.equal(rancio.ok, false);
    assert.match(rancio.problemas.join('\n'), /stale.*npm run build:sw/s);
    assert.match(rancio.problemas.join('\n'), /css\/views\/nuevo\.css/);
    generar(raiz);
    assert.equal(comprobar(raiz).ok, true);
    // the written file carries the computed version
    assert.ok(readFileSync(join(raiz, 'sw.js'), 'utf8').includes(`const VERSION = '${comprobar(raiz).version}'`));
  } finally {
    limpiar(raiz);
  }
});

test('verificar: missing imports, missing useStyles sheets and missing html references are visible errors', () => {
  const raiz = app({
    'js/rota.js': "import './no-existe.js';\nimport { x } from './util/a.js';\nuseStyles('inexistente');\n",
    'js/comentada.js': "// import './fantasma.js';\n/* import('./fantasma2.js') */\nexport {};",
    'index.html': '<link rel="stylesheet" href="./css/falta.css"><script src="./js/main.js"></script>',
  });
  try {
    const errores = verificar(raiz).join('\n');
    assert.match(errores, /js\/rota\.js: import "js\/no-existe\.js" does not exist/);
    assert.match(errores, /useStyles stylesheet "css\/views\/inexistente\.css" does not exist/);
    assert.match(errores, /index\.html: reference "css\/falta\.css" does not exist/);
    assert.ok(!/fantasma/.test(errores), 'commented-out imports are ignored');
    assert.ok(!/fakeGoogle/.test(errores));
  } finally {
    limpiar(raiz);
  }
});

test('verificar: the intentionally excluded fakeGoogle import is not an error', () => {
  const raiz = app({ 'js/boot.js': "const f = await import('./infrastructure/fakeGoogle.js');\n" });
  try {
    assert.deepEqual(verificar(raiz), []);
  } finally {
    limpiar(raiz);
  }
});

test('the real service worker: strategies, no skipWaiting on install, Google never cached', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes(MARCA_INICIO) && sw.includes(MARCA_FIN));
  const install = sw.slice(sw.indexOf("addEventListener('install'"), sw.indexOf("addEventListener('activate'"));
  assert.ok(!install.includes('skipWaiting'), 'a new worker must wait for the user');
  assert.match(sw, /type === 'SKIP_WAITING'\) self\.skipWaiting\(\)/);
  assert.match(sw, /googleapis\\\.com/);
  assert.match(sw, /staleWhileRevalidate/);
  assert.match(sw, /cacheFirst/);
  assert.ok(!sw.includes('fakeGoogle'));
});
