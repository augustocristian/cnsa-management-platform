// Lazy loading of heavy libraries (SheetJS, ~900 KB): downloaded only when an Excel is exported/imported.
// The service worker already precaches them (sw.js), so they also work offline.
import { integridad } from './vendorIntegridad.js';

let xlsxPromise = null;

async function cargarScript(src) {
  const sri = await integridad(src.split('/').pop()); // SRI: vendor/integrity.json (scripts/vendor.mjs)
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    if (sri) {
      s.integrity = sri;
      s.crossOrigin = 'anonymous';
    }
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      s.remove();
      reject(new Error('No se pudo cargar la librería de Excel (' + src + ').'));
    };
    document.head.appendChild(s);
  });
}

// -> the global XLSX object (SheetJS). If it was already loaded (tests, old index.html versions) nothing is downloaded.
export function loadXLSX() {
  if (globalThis.XLSX) return Promise.resolve(globalThis.XLSX);
  xlsxPromise ||= cargarScript(new URL('../../vendor/xlsx.full.min.js', import.meta.url).href)
    .then(() => {
      if (!globalThis.XLSX) throw new Error('La librería de Excel no se inicializó.');
      return globalThis.XLSX;
    })
    .catch((e) => {
      xlsxPromise = null;
      throw e;
    });
  return xlsxPromise;
}

export default loadXLSX;
