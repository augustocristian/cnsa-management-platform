// The club store of the running app (composition root): the sync engine of application/clubStore.js wired to the real adapters
// (Drive or demo storage, localStorage/IndexedDB cache, timers, window events, UUIDs) plus the file operations that need the
// browser (Excel import/export, downloads, the .xlsx copy in Drive). The public API is the one the views, services and tests use:
// store.list/get/upsert/remove/upsertMany/removeMany/on/status/sync/club/setClub/refresh/...
import { crearClubStore } from '../application/clubStore.js';
import { ENTITY_SHEETS } from '../domain/schema.js';
import { DOC_VERSION } from '../domain/sheetdata.js';
import { nombreArchivo, fechaIsoLocal, errSoloLectura } from '../domain/filas.js';
import { drive } from '../infrastructure/drive.js';
import { cache } from '../infrastructure/cache.js';
import { demoStorage, DEMO_CACHE_PREFIX } from '../infrastructure/demoStorage.js'; // demo mode: local adapter + namespace of its mirror ('cnl:demo:club:')
import { newId, nuevoDispositivo } from '../infrastructure/ids.js';
import { descargarBlob } from '../infrastructure/descargas.js';
import { libroABlob, leerLibro, XLSX_MIME } from '../infrastructure/xlsx.js';

const ahora = () => new Date();

// Ports of application/ports/ implemented over the browser.
const cacheClub = {
  guardar: (clave, objeto) => cache.guardar(clave, objeto),
  leer: (clave) => cache.leer(clave),
  existe(clave) {
    try {
      return localStorage.getItem(clave) !== null || cache._enIdb.has(clave);
    } catch (e) {
      return false;
    }
  },
};
const timers = {
  programar(fn, ms, { unref = true } = {}) {
    const h = globalThis.setTimeout(fn, ms);
    if (unref && h && h.unref) h.unref();
    return h;
  },
  cancelar: (h) => globalThis.clearTimeout(h),
};
const red = { enLinea: () => navigator.onLine };
const enlazadas = new WeakSet();
const ventana = {
  enlazar(h) {
    if (typeof window === 'undefined' || !window.addEventListener || enlazadas.has(window)) return;
    enlazadas.add(window);
    window.addEventListener('online', () => h.volverLaRed());
    window.addEventListener('pagehide', () => h.cerrando());
    window.addEventListener('storage', (ev) => h.otraPestana({ clave: ev.key, valor: ev.newValue }));
    if (typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') h.oculta();
      });
    }
  },
  oculta: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
};
// Only one tab syncs at a time (Web Locks) when the browser supports it.
const bloqueo = (nombre, fn) => {
  const locks = typeof navigator !== 'undefined' && navigator.locks;
  return locks && locks.request ? locks.request(nombre, fn) : fn();
};

export const store = crearClubStore({
  drive,
  demo: demoStorage,
  cache: cacheClub,
  prefijos: { drive: 'cnl:club:', demo: DEMO_CACHE_PREFIX },
  genId: newId,
  dispositivo: nuevoDispositivo(),
  ahora,
  red,
  timers,
  ventana,
  bloqueo,
  log: console,
});

const datos = () => ({ club: store.club, db: Object.fromEntries(ENTITY_SHEETS.map((s) => [s, store.list(s)])) });
const nombreClub = () => store.club.nombre || (store.clubRef && store.clubRef.name) || 'club';
const nombreXlsx = () => nombreArchivo(nombreClub(), '.xlsx');

Object.assign(store, {
  // Downloads the current club's .xlsx.
  async exportXlsx() {
    const blob = await libroABlob(datos());
    descargarBlob(blob, nombreXlsx());
    return blob;
  },

  // Downloads a JSON copy (the same one saved in Drive) of what is in memory now: an emergency exit.
  descargarCopia() {
    const blob = new Blob([JSON.stringify(store.documento(), null, 1)], { type: 'application/json' });
    descargarBlob(blob, nombreArchivo(nombreClub(), '.json'));
    return blob;
  },

  // Saves an .xlsx copy in the cnl folder in Drive (overwrites the previous one for the same club).
  async guardarXlsxEnDrive() {
    if (store.mode === 'demo')
      throw Object.assign(new Error('Demo mode does not use Google Drive.'), { code: 'demo-sin-drive' });
    const puerto = store.puerto;
    const name = nombreXlsx();
    const body = await libroABlob(datos());
    const fid = await puerto.ensureFolder();
    const prev = await puerto.findFile(name, fid);
    return puerto.upload({ name, mimeType: XLSX_MIME, body, parentId: fid, id: prev && prev.id });
  },

  // Preview of an .xlsx (changes nothing): per-sheet count against the current data, duplicates and doubtful rows.
  previsualizarXlsx(file) {
    return leerLibro(file, {
      club: Object.keys(store.club).length,
      filas: (s) => store.list(s).length,
      hoy: fechaIsoLocal(ahora()),
    });
  },

  // Replaces the data with that of an .xlsx (File/Blob) or of an already computed preview. First saves a copy
  // cnl/backups/<club>-import-YYYYMMDDHHMMSS.json; if that is not possible (e.g. offline) it does not import, unless { sinCopia: true }.
  async importXlsx(file, { sinCopia = false } = {}) {
    if (store.soloLectura) throw errSoloLectura();
    const prev = file && file.data && file.hojas ? file : await store.previsualizarXlsx(file);
    await store.reemplazarDatos(prev.data, { sinCopia });
    return { hojas: prev.hojas, total: prev.total };
  },

  // Right of access/portability: JSON with everything stored about a swimmer, and downloads it. -> {datos, blob, nombre}
  exportNadador(id, { descargar = true } = {}) {
    const d = store.datosNadador(id);
    if (!d) throw new Error('Nadador no encontrado');
    const exportado = {
      version: DOC_VERSION,
      tipo: 'nadador',
      exportadoEl: ahora().toISOString(),
      club: store.club.nombre || '',
      ...d,
    };
    const blob = new Blob([JSON.stringify(exportado, null, 2)], { type: 'application/json' });
    const nombre =
      'nadador-' +
      [d.nadador.nombre, d.nadador.apellidos]
        .filter(Boolean)
        .join('-')
        .replace(/[/:*?"<>|\s]+/g, '-') +
      '.json';
    if (descargar) descargarBlob(blob, nombre);
    return { datos: exportado, blob, nombre };
  },
});

export default store;
