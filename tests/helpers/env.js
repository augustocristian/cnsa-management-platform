// Entorno jsdom global para ejecutar los módulos ES de la app bajo node --test.
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function define(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

// Instala window/document/localStorage... como globales. loadXlsx=true carga SheetJS (global XLSX).
export function setupEnv({ loadXlsx = false, hash = '' } = {}) {
  const dom = new JSDOM('<!doctype html><html><body><main id="app"></main></body></html>', {
    url: 'http://localhost/' + (hash ? '#' + hash : ''),
    pretendToBeVisual: true,
  });
  const w = dom.window;
  define('window', w);
  define('document', w.document);
  define('localStorage', w.localStorage);
  define('sessionStorage', w.sessionStorage);
  define('location', w.location);
  define('navigator', w.navigator);
  for (const k of ['Node', 'HTMLElement', 'Event', 'FormData', 'MouseEvent', 'KeyboardEvent']) define(k, w[k]);
  define('alert', () => {});
  define('confirm', () => true);
  if (loadXlsx) {
    const src = readFileSync(path.join(ROOT, 'vendor', 'xlsx.full.min.js'), 'utf8');
    vm.runInThisContext(src);
    if (!globalThis.XLSX) throw new Error('XLSX no se cargó');
  }
  return dom;
}

export const appUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
export const importApp = (rel) => import(appUrl(rel));

// Deja que los handlers async pendientes terminen.
export const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
