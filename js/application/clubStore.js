// Data store for ONE club (sync engine + repository): in-memory rows, a local mirror with a queue of pending changes
// (offline) and the cnl/<Club>.json file (source of truth). Per-field 3-way merge with logical stamps and tombstones when
// another device changes the file, concurrency control with Drive's `version`, daily backups and GDPR tools.
//
// Split by responsibility (all share the state object `s` created here):
//   clubStore.js  state, local cache, persistence (dirty/debounce/polling), CRUD, init/sync entry points
//   clubSync.js   opening from the remote file, one sync cycle with merge, refresh, merge with another tab
//   clubDatos.js  backup/restore support, import replacement, GDPR, damaged-file recovery, demo seeding
// Everything concrete is injected (see application/ports/): the club file port (Drive or demo), the cache, timers, window
// events, network state, id generator and clock. composicion/store.js builds the real instance used by the app.
import { ENTITY_SHEETS } from '../domain/schema.js';
import { validarFila, errorValidacion } from '../domain/validacion.js';
import { metaVacia } from '../domain/sheetdata.js';
import { emptyDb, cleanRow, hayDatosReales, fechaIsoLocal, errSoloLectura, errProblema } from '../domain/filas.js';
import { asegurarCatalogo } from '../domain/catalogoClub.js';
import { indexar, reconciliarMeta as reconciliarSellos } from '../domain/sellos.js';
import { crearSincronizacion } from './clubSync.js';
import { crearOperacionesDatos } from './clubDatos.js';

const SILENCIO = { warn() {}, error() {} }; // default log: the composition root injects the real console
const DEBOUNCE_MS = 1500;
const POLL_MS = 30000;
const POLL_MAX_MS = 300000; // cap of the growing polling delay after errors

/**
 * @param {object} deps
 * @param {import('./ports/ArchivoClubPort.js').ArchivoClubPort} deps.drive   club file port of the real mode
 * @param {import('./ports/ArchivoClubPort.js').ArchivoClubPort} [deps.demo]   club file port of the demo mode
 * @param {import('./ports/CachePort.js').CachePort} deps.cache
 * @param {{drive: string, demo: string}} deps.prefijos   key prefix of the local mirror per mode
 * @param {() => string} deps.genId
 * @param {string} deps.dispositivo   id of this tab (stamps are "n@tab")
 * @param {() => Date} deps.ahora
 * @param {import('./ports/VentanaPort.js').RedPort} deps.red
 * @param {import('./ports/TimersPort.js').TimersPort} deps.timers
 * @param {import('./ports/VentanaPort.js').VentanaPort} deps.ventana
 * @param {(nombre: string, fn: () => Promise<unknown>) => Promise<unknown>} [deps.bloqueo]   mutual exclusion between tabs
 * @param {{warn: Function, error: Function}} [deps.log]
 */
export function crearClubStore(deps) {
  const { cache, prefijos, genId, dispositivo, red, timers, ventana, log = SILENCIO } = deps;

  // Settings (tests override them)
  const config = { watchdogMs: 90000, cacheDebounceMs: 200 };
  const listeners = new Set();

  // State shared with clubSync.js and clubDatos.js
  const s = {
    db: emptyDb(),
    club: {},
    meta: metaVacia(), // logical clock + per-row stamps + tombstones (see sheetdata.js)
    extra: { top: {}, hojas: {}, cols: {} }, // what a newer version wrote and this one does not understand: it is preserved
    avisos: [], // duplicated ids / rows without id found while reading
    ref: null, // {name, id}
    // Storage backend of the open club: the real Drive client ('drive' mode) or the local demo adapter ('demo' mode, never touches Drive).
    puerto: deps.drive,
    modo: 'drive', // 'drive' | 'demo'
    cachePrefijo: prefijos.drive,
    dirty: false,
    timer: null,
    syncing: null,
    syncGen: 0, // sync generation: one that timed out through the watchdog becomes stale
    rev: 0, // local change counter (so edits made during an upload are not lost)
    base: null, // last version synced with Drive (to merge changes made from another device)
    lastRev: null, // revision (md5Checksum/modifiedTime) of the remote file at the last sync
    lastVersion: null, // Drive `version` (monotonic integer) of our last read/write
    pollTimer: null,
    pollFallos: 0,
    cacheTimer: null,
    cachePendiente: false,
    cacheFallo: false,
    problema: null, // {tipo:'danado'|'vacio', raw?, tieneCopiaLocal}: the remote file is not trustworthy; nothing is written until it is resolved
    soloLectura: null, // {version}: the file was written by a newer version of the app
    omitirRespaldo: false,
    visto: new Map(), // 'sheet\u0001id' -> JSON of the row as it was when data was applied / at the last reconciliation
    respaldos: new Map(), // club id -> day (YYYYMMDD) on which the daily backup was already made
  };

  const tick = () => `${++s.meta.reloj}@${dispositivo}`;
  const snapshot = () => JSON.parse(JSON.stringify({ db: s.db, club: s.club, meta: s.meta, extra: s.extra }));
  const reconciliarMeta = () => reconciliarSellos({ db: s.db, meta: s.meta, visto: s.visto, tick });
  const ensureCatalog = () => asegurarCatalogo(s.db, genId);
  const guardaEscritura = () => {
    if (s.soloLectura) throw errSoloLectura();
  };
  const programar = (fn, ms, opciones) => timers.programar(fn, ms, opciones);
  const cacheKey = () => s.cachePrefijo + s.ref.id;

  function emit(evt) {
    listeners.forEach((fn) => {
      try {
        fn(evt);
      } catch (e) {
        log.error(e);
      }
    });
  }

  function setStatus(st) {
    if (store.status === st) return;
    store.status = st;
    emit({ type: 'status', status: st });
  }

  // ---------- Local cache (200 ms debounce; flushed when the tab is hidden/closed and on sync) ----------
  // Reconciling before saving keeps the cache's stamps/tombstones up to date with the edits.
  function cargaCache() {
    if (s.dirty) reconciliarMeta();
    return {
      v: 2,
      db: s.db,
      club: s.club,
      meta: s.meta,
      extra: s.extra,
      dirty: s.dirty,
      lastRev: s.lastRev,
      lastVersion: s.lastVersion,
      base: s.dirty ? s.base : null,
    };
  }

  function saveCache() {
    if (!s.ref) return;
    s.cachePendiente = true;
    timers.cancelar(s.cacheTimer);
    s.cacheTimer = programar(() => {
      flushCache();
    }, config.cacheDebounceMs);
  }

  function flushCache() {
    timers.cancelar(s.cacheTimer);
    if (!s.cachePendiente || !s.ref) return Promise.resolve();
    s.cachePendiente = false;
    return cache.guardar(cacheKey(), cargaCache()).then(
      () => {
        if (s.cacheFallo) {
          s.cacheFallo = false;
          emit({ type: 'cache-ok' });
          setStatus(s.dirty ? 'pendiente' : 'sincronizado');
        }
      },
      (e) => {
        s.cacheFallo = true;
        store.lastError = e;
        log.warn('Could not save the local cache', e);
        setStatus('error');
        emit({ type: 'cache-error', error: e });
      },
    );
  }

  function applyData(data) {
    s.db = emptyDb();
    ENTITY_SHEETS.forEach((sheet) => {
      if (Array.isArray(data.db[sheet])) s.db[sheet] = data.db[sheet];
    });
    s.club = data.club || {};
    const reloj = s.meta.reloj;
    s.meta = data.meta ? JSON.parse(JSON.stringify(data.meta)) : metaVacia();
    s.meta.sellos ||= {};
    s.meta.lapidas ||= {};
    s.meta.reloj = Math.max(Number(s.meta.reloj) || 0, reloj);
    s.extra = data.extra || { top: {}, hojas: {}, cols: {} };
    s.avisos = data.avisos || [];
    s.visto = indexar(s.db);
  }

  // ---------- Persistence ----------
  function markDirty() {
    guardaEscritura();
    s.dirty = true;
    s.rev++;
    saveCache();
    if (!s.cacheFallo) setStatus(red.enLinea() ? 'pendiente' : 'offline');
    timers.cancelar(s.timer);
    s.timer = programar(() => store.sync().catch(() => {}), DEBOUNCE_MS);
  }

  // Poll every ~30 s to detect changes made from the same user's other devices/tabs (only while the tab is visible).
  // After errors the delay grows exponentially (honouring Retry-After) up to 5 minutes; a success resets it.
  function programarSondeo(ms) {
    timers.cancelar(s.pollTimer);
    s.pollTimer = programar(sondear, ms);
  }

  async function sondear() {
    let siguiente = POLL_MS;
    try {
      if (!ventana.oculta() && s.ref) {
        if (s.dirty) {
          if (red.enLinea()) await store.sync();
        } // queue of pending changes (e.g. after a network outage)
        else await store.refresh();
      }
      s.pollFallos = 0;
    } catch (e) {
      if (!e.offline) {
        store.lastError = e;
        setStatus('error');
      }
      s.pollFallos++;
      siguiente = Math.min(POLL_MS * 2 ** s.pollFallos, POLL_MAX_MS);
      if (e.retryAfterMs) siguiente = Math.max(siguiente, Math.min(e.retryAfterMs, POLL_MAX_MS));
    }
    programarSondeo(siguiente);
  }

  function startPolling() {
    if (s.modo === 'demo') return;
    s.pollFallos = 0;
    programarSondeo(POLL_MS);
  }

  function ponerProblema(tipo, e) {
    s.problema = { tipo, raw: e && e.raw, tieneCopiaLocal: hayDatosReales(s.db, s.club), mensaje: e && e.message };
    timers.cancelar(s.timer);
    setStatus('error');
    emit({ type: 'problema', problema: s.problema });
  }

  function entrarSoloLectura(version) {
    s.soloLectura = { version };
    s.dirty = false;
    timers.cancelar(s.timer);
    setStatus('error');
    emit({ type: 'solo-lectura', version });
  }

  // Only one tab syncs at a time when the adapter provides a lock.
  const conBloqueo = (fn) => (deps.bloqueo ? deps.bloqueo('cnl-sync-' + s.ref.id, fn) : fn());

  // Helpers handed to clubSync.js and clubDatos.js
  const h = {
    store: null,
    DEBOUNCE_MS,
    tick,
    snapshot,
    reconciliarMeta,
    ensureCatalog,
    guardaEscritura,
    programar,
    emit,
    setStatus,
    saveCache,
    flushCache,
    applyData,
    markDirty,
    startPolling,
    ponerProblema,
    entrarSoloLectura,
  };
  const sincronizacion = crearSincronizacion({ s, h, deps: { ...deps, log } });
  const datos = crearOperacionesDatos({ s, h, deps: { ...deps, log } });

  // When the network returns, changes left pending offline are uploaded; when the tab is hidden or closed the cache is flushed.
  // Bound in init() (the adapter binds once per window).
  function enlazarEventosDeVentana() {
    ventana.enlazar({
      volverLaRed: () => {
        if (s.ref && s.dirty) store.sync().catch(() => {});
      },
      cerrando: () => {
        flushCache();
      },
      oculta: () => {
        flushCache();
        if (s.ref && s.dirty && red.enLinea() && !s.problema && !s.soloLectura) store.sync().catch(() => {});
      },
      otraPestana: ({ clave, valor }) => {
        if (!s.ref || clave !== cacheKey() || !valor) return;
        try {
          const c = JSON.parse(valor);
          if (c && c.db) sincronizacion.adoptarDeOtraPestana(c);
        } catch (e) {
          /* ignorar */
        }
      },
    });
  }

  // Clears the sync state for a (re)opened club.
  function reiniciarEstado(clubRef, demo) {
    s.ref = { name: clubRef.name, id: clubRef.id };
    s.puerto = demo || deps.drive;
    s.modo = demo ? 'demo' : 'drive';
    s.cachePrefijo = demo ? prefijos.demo : prefijos.drive;
    s.syncGen++; // a sync left hanging from before can no longer touch the state
    s.syncing = null;
    s.dirty = false;
    timers.cancelar(s.pollTimer);
    s.pollTimer = null;
    s.base = null;
    s.lastRev = null;
    s.lastVersion = null;
    s.problema = null;
    s.soloLectura = null;
    s.cacheFallo = false;
    s.cachePendiente = false;
    s.respaldos.delete(s.ref.id); // one check of the daily backup per opening
    s.meta = metaVacia();
    s.extra = { top: {}, hojas: {}, cols: {} };
    s.avisos = [];
  }

  const store = {
    status: 'sincronizado', // sincronizado | pendiente | offline | error (kept in Spanish: they are translation keys)
    lastError: null,
    config,

    // clubRef: {id, name} (id of the cnl/<Club>.json file in Drive).
    // opciones.demo = the demo adapter (infrastructure/demoStorage.js): the club is read/written there instead of Drive,
    // its local mirror lives under the demo prefix and store.mode is 'demo'.
    async init(clubRef, { demo = null } = {}) {
      timers.cancelar(s.timer);
      if (!clubRef || !clubRef.id) throw new Error('Falta el club (id del fichero en Drive).');
      enlazarEventosDeVentana();
      if (s.ref) {
        // Anything pending from the previous session is flushed, unless it is the same club and its cache no longer exists
        // (someone cleared the local data): then it is dropped, not resurrected.
        if (s.cachePendiente && s.ref.id === clubRef.id && !cache.existe(cacheKey())) {
          s.cachePendiente = false;
          timers.cancelar(s.cacheTimer);
        } else await flushCache();
      }
      reiniciarEstado(clubRef, demo);
      let cached = await cache.leer(cacheKey()).catch(() => null);
      if (cached && cached.db) {
        applyData({ db: cached.db, club: cached.club, meta: cached.meta, extra: cached.extra });
        s.dirty = !!cached.dirty;
        s.lastRev = cached.lastRev || null;
        s.lastVersion = cached.lastVersion == null ? null : cached.lastVersion;
        s.base = cached.base || null;
      } else {
        cached = null;
        s.db = emptyDb();
        s.club = {};
        s.visto = indexar(s.db);
      }
      try {
        await sincronizacion.abrirDesdeRemoto(cached);
      } catch (e) {
        if (!cached) throw e;
        if (ensureCatalog()) {
          s.dirty = true;
          s.cachePendiente = true;
          await flushCache();
        }
        setStatus(e.offline ? 'offline' : 'error');
        startPolling();
      }
      emit({ type: 'init' });
      return store;
    },

    // Closes the club without flushing anything (sign-out): cancels timers and drops the data so that no
    // later flush (e.g. pagehide on reload) writes back the local cache that was just erased.
    cerrar() {
      timers.cancelar(s.timer);
      timers.cancelar(s.pollTimer);
      timers.cancelar(s.cacheTimer);
      s.cachePendiente = false;
      s.syncGen++;
      s.syncing = null;
      s.dirty = false;
      s.ref = null;
      s.puerto = deps.drive;
      s.modo = 'drive';
      s.cachePrefijo = prefijos.drive;
      s.db = emptyDb();
      s.club = {};
      s.base = null;
      s.problema = null;
      s.soloLectura = null;
      s.meta = metaVacia();
      s.visto = new Map();
    },

    // Opens the DEMO club (store.mode becomes 'demo'): sample data kept only in this browser, Drive is never touched. The first time
    // the club is created and seeded (dates relative to `hoy`); afterwards it reopens what the person had. Prefer
    // application/modoService.js `enterDemo()`, which also remembers the choice. -> store
    async initDemo({ hoy, demo = deps.demo } = {}) {
      const { ref: demoRef, nuevo } = demo.asegurar();
      await store.init(demoRef, { demo });
      if (nuevo) {
        await store.sync(); // settle the sync that init() started for the fresh file, so the seed below is uploaded by its own sync
        store.seedDemo({ hoy: hoy || deps.ahora() });
        await store.sync();
      }
      return store;
    },

    // 'drive' (the club lives in the person's Google Drive) | 'demo' (sample data kept only in this browser; Drive is never touched)
    get mode() {
      return s.modo;
    },

    // Data of the open club: {name, id}
    get clubRef() {
      return s.ref ? { name: s.ref.name, id: s.ref.id } : null;
    },

    // The club file port in use (Drive or demo): for the adapters that compose this store (Excel copy in Drive...).
    get puerto() {
      return s.puerto;
    },

    // File integrity state: problem (damaged / emptied JSON) or read-only (future version); read warnings.
    get problema() {
      return s.problema;
    },
    get soloLectura() {
      return s.soloLectura;
    },
    get avisos() {
      return s.avisos.slice();
    },
    get pendiente() {
      return s.dirty;
    },

    // Checks (with a cheap metadata request) whether another device changed the file and, if so,
    // incorporates the changes. Returns true if anything changed.
    refresh() {
      return sincronizacion.refresh();
    },

    get club() {
      return s.club;
    },
    setClub(obj) {
      guardaEscritura();
      s.club = Object.assign({}, s.club, obj);
      markDirty();
      emit({ type: 'club' });
    },

    list(sheet) {
      return s.db[sheet] ? s.db[sheet].slice() : [];
    },
    get(sheet, id) {
      return (s.db[sheet] || []).find((r) => r.id === String(id)) || null;
    },

    // Validates (real dates, numeric ranges...) and saves the row; throws an Error with code 'validacion' (and .errores) if invalid.
    upsert(sheet, row) {
      return store.upsertMany(sheet, [row])[0];
    },

    // Several rows with ONE markDirty/emit (imports, seeding). All or nothing: if one is invalid none is saved.
    upsertMany(sheet, rows) {
      if (!s.db[sheet]) throw new Error('Hoja desconocida: ' + sheet);
      guardaEscritura();
      const limpias = (rows || []).map((r) => cleanRow(sheet, r, genId));
      limpias.forEach((c) => {
        const e = validarFila(sheet, c, { hoy: fechaIsoLocal(deps.ahora()) });
        if (e.length) throw errorValidacion(sheet, e);
      });
      if (!limpias.length) return [];
      const idx = new Map(s.db[sheet].map((r, i) => [r.id, i]));
      limpias.forEach((c) => {
        if (idx.has(c.id)) s.db[sheet][idx.get(c.id)] = c;
        else {
          idx.set(c.id, s.db[sheet].length);
          s.db[sheet].push(c);
        }
      });
      markDirty();
      emit({ type: 'change', sheet });
      return limpias;
    },

    remove(sheet, id) {
      return store.removeMany(sheet, [id]);
    },

    // Deletes several rows with ONE markDirty/emit. -> number of rows deleted
    removeMany(sheet, ids) {
      guardaEscritura();
      const quitar = new Set((ids || []).map(String));
      const n = (s.db[sheet] || []).length;
      s.db[sheet] = (s.db[sheet] || []).filter((r) => !quitar.has(r.id));
      const borradas = n - s.db[sheet].length;
      if (borradas) {
        markDirty();
        emit({ type: 'change', sheet });
      }
      return borradas;
    },

    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    // Uploads the changes to Drive (first merging any made by another device).
    // With a watchdog: if the sync does not finish within config.watchdogMs `syncing` is released and the error reported.
    async sync() {
      if (!s.ref) return;
      if (s.syncing) return s.syncing;
      timers.cancelar(s.timer);
      if (s.soloLectura) return;
      if (s.problema) throw errProblema();
      if (!red.enLinea()) {
        setStatus('offline');
        return;
      }
      const gen = ++s.syncGen;
      let vigilante = null;
      const trabajo = conBloqueo(() => sincronizacion.sincronizar(gen)).catch((e) => {
        if (e && e.obsoleta) return undefined;
        if (e && e.code === 'fichero-danado' && !s.problema) ponerProblema('danado', e);
        (e && e.offline ? log.warn : log.error)(e); // being offline is an expected state, not a failure
        setStatus(red.enLinea() && !e.offline ? 'error' : 'offline');
        store.lastError = e;
        s.cachePendiente = true;
        flushCache();
        throw e;
      });
      const limite = new Promise((resolve, reject) => {
        // Not unref'd: callers await this deadline, and Node would otherwise end the event loop while it is pending.
        vigilante = programar(
          () => {
            s.syncGen++; // the hung sync becomes stale: if it wakes up it will not touch anything
            const e = Object.assign(new Error('La sincronización no responde (tiempo agotado). Se reintentará.'), {
              timeout: true,
              code: 'timeout',
            });
            setStatus('error');
            store.lastError = e;
            reject(e);
          },
          config.watchdogMs,
          { unref: false },
        );
      });
      s.syncing = Promise.race([trabajo, limite]);
      const mia = s.syncing;
      const libera = () => {
        timers.cancelar(vigilante);
        if (s.syncing === mia) s.syncing = null;
      };
      mia.then(libera, libera);
      trabajo.catch(() => {}); // avoids an unhandled rejection if the watchdog wins the race
      return s.syncing;
    },

    ...datos,
  };
  h.store = store;
  return store;
}
