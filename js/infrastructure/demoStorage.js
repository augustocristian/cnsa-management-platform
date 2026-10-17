// Demo mode storage: the adapter the store uses INSTEAD of Google Drive when the person tries the app without connecting a Drive.
//
// It satisfies the same "club file" port as js/infrastructure/drive.js (meta / read / write / renameClub / backups...), but everything lives in this
// browser: one JSON document in localStorage under the namespace 'cnl:demo:*' (with a memory fallback when storage is blocked).
// It NEVER calls Drive and its keys never collide with the real club mirrors ('cnl:club:*'), so demo data cannot leak into a
// real club. The store keeps its own local mirror of the demo club under 'cnl:demo:club:' (see DEMO_CACHE_PREFIX).
//
// Disabled in demo on purpose: daily backups and import backups (listarBackups is always empty), the Excel copy in Drive, PDFs
// saved to Drive, Google Calendar sync. Those calls throw an Error with code 'demo-sin-drive' or are no-ops.
import { cache } from './cache.js';

export const DEMO_PREFIX = 'cnl:demo:';
export const DEMO_CACHE_PREFIX = DEMO_PREFIX + 'club:'; // the store's mirror of the demo club
export const DEMO_MODE_KEY = 'cnl:mode'; // localStorage flag remembering that the person chose the demo ('demo')
const FILE_KEY = DEMO_PREFIX + 'file';
const DEMO_ID = 'demo-club';

const clon = (x) => (x === undefined ? undefined : JSON.parse(JSON.stringify(x)));
const sinDrive = () => Object.assign(new Error('Demo mode does not use Google Drive.'), { code: 'demo-sin-drive' });

function almacenPorDefecto() {
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}

// opciones: { almacen?: Storage-like, ahora?: () => Date }
export function crearDemoStorage({ almacen, ahora = () => new Date() } = {}) {
  const ls = almacen === undefined ? almacenPorDefecto() : almacen;
  let memoria = null; // fallback when localStorage is not available (or full)

  function leer() {
    if (ls) {
      try { const f = JSON.parse(ls.getItem(FILE_KEY) || 'null'); if (f && typeof f === 'object') return f; } catch (e) { /* fall back to memory */ }
    }
    return memoria;
  }
  function guardar(f) {
    memoria = f;
    if (!ls) return;
    try { ls.setItem(FILE_KEY, JSON.stringify(f)); } catch (e) { /* too big / blocked: memory only */ }
  }
  const archivo = (id) => {
    const f = leer();
    if (!f || (id && f.id !== id)) throw Object.assign(new Error('The demo club does not exist.'), { status: 404, code: 'no-encontrado' });
    return f;
  };
  const metaDe = (f) => ({ rev: 'd' + f.rev, modifiedTime: f.modified, name: f.name, version: f.version });

  const demo = {
    modo: 'demo',

    // ---- Lifecycle (used by application/modoService.js) ----
    existe() { return !!leer(); },
    ref() { const f = leer(); return f ? { id: f.id, name: f.name } : null; },

    // Creates the (empty) demo club file if it does not exist yet. -> { ref, nuevo }
    asegurar(nombre = 'Demo') {
      const f = leer();
      if (f) return { ref: { id: f.id, name: f.name }, nuevo: false };
      const nuevoF = { id: DEMO_ID, name: String(nombre), doc: { version: 1, club: {}, hojas: {} }, rev: 1, version: 1, modified: ahora().toISOString() };
      guardar(nuevoF);
      return { ref: { id: nuevoF.id, name: nuevoF.name }, nuevo: true };
    },

    // Erases EVERYTHING demo: the club file, the store's mirror and any other 'cnl:demo:*' key. Real data is never touched.
    async borrar() {
      const f = leer();
      memoria = null;
      if (ls) {
        try {
          for (const k of Object.keys(ls)) if (k.startsWith(DEMO_PREFIX)) ls.removeItem(k);
        } catch (e) { /* ignore */ }
        try { ls.removeItem(DEMO_MODE_KEY); } catch (e) { /* ignore */ }
      }
      await cache.eliminar(DEMO_CACHE_PREFIX + (f ? f.id : DEMO_ID));
    },

    // ---- "Club file" port (same shape as js/infrastructure/drive.js) ----
    fileUrl: () => '',
    folderUrl: () => '',
    async meta(id) { return metaDe(archivo(id)); },
    async read(id) {
      const f = archivo(id);
      return { doc: clon(f.doc), rev: 'd' + f.rev, version: f.version, name: f.name };
    },
    async write(id, doc) {
      const f = archivo(id);
      f.doc = clon(doc);
      f.rev++;
      f.version++;
      f.modified = ahora().toISOString();
      guardar(f);
      return { rev: 'd' + f.rev, version: f.version };
    },
    async renameClub(id, nombre) {
      const f = archivo(id);
      f.name = String(nombre);
      f.version++;
      f.modified = ahora().toISOString();
      guardar(f);
      return { version: f.version };
    },

    // ---- Disabled in demo: no backups, no history, no folders, no uploads ----
    async backupClub() { return { id: '', name: '', creado: false, omitido: true }; },
    async listarBackups() { return []; },
    async revisionPrevia() { return null; },
    async borrarRevisionesAntiguas() { return 0; },
    async leerFichero() { throw sinDrive(); },
    async ensureFolder() { throw sinDrive(); },
    async ensureFolderPath() { throw sinDrive(); },
    async findFile() { throw sinDrive(); },
    async upload() { throw sinDrive(); },
    async eliminarDefinitivo() { throw sinDrive(); },
    reset() { /* nothing cached */ },
  };
  return demo;
}

// The instance used by the app (composition: js/composicion/modo.js).
export const demoStorage = crearDemoStorage();
export default demoStorage;
