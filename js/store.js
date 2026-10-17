// Data store for ONE club: local cache (localStorage overflowing to IndexedDB, a mirror with a queue of pending changes) +
// the cnl/<Club>.json file in the user's Drive (source of truth). Per-field 3-way merge with logical stamps and tombstones
// when another device changes the file, concurrency control with Drive's `version`, backups and GDPR tools.
import { SHEETS, ENTITY_SHEETS, newId } from './schema.js';
import { prepararCatalogo, normalizarTipo, filaTipo, sembrarCatalogo } from './domain/cargas.js';
import { planDemo, serializarLinea } from './domain/entreno.js';
import { temporadaDemo } from './domain/temporada.js';
import { categoriaDe, temporadaDe, etiquetaTemporada } from './domain/categorias.js';
import { drive, nombreBackup } from './drive.js';
import { cache } from './cache.js';
import { demoStorage, DEMO_CACHE_PREFIX } from './infrastructure/demoStorage.js'; // demo mode: local adapter + namespace of its mirror ('cnl:demo:club:')
import { loadXLSX } from './lazy.js';
import { validarFila, errorValidacion } from './domain/validacion.js';
import { dataToDoc, docToData, mergeData, isEmptyData, pareceDocumentoClub, normalizarValor, normalizarClub, metaVacia, purgarLapidas, RELACIONES, DOC_VERSION } from './sheetdata.js';

const CACHE_PREFIX = 'cnl:club:';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DEBOUNCE_MS = 1500;
const POLL_MS = 30000;
const POLL_MAX_MS = 300000; // cap of the growing polling delay after errors
const MAX_VUELTAS = 5; // merge+write retries when another device writes in between
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const MAX_IMPORT_FILAS = 50000;
const SEP = '\u0001';
// Id of this tab (logical stamps are "n@tab"): two tabs of the same browser never generate the same stamp.
const DISPOSITIVO = Math.random().toString(36).slice(2, 7);

// Settings (tests override them)
const config = { watchdogMs: 90000, cacheDebounceMs: 200 };

const listeners = new Set();
let db = emptyDb();
let club = {};
let meta = metaVacia(); // logical clock + per-row stamps + tombstones (see sheetdata.js)
let extra = { top: {}, hojas: {}, cols: {} }; // what a newer version wrote and this one does not understand: it is preserved
let avisos = []; // duplicated ids / rows without id found while reading
let ref = null; // {name, id}
// Storage backend of the open club: the real Drive client ('drive' mode) or the local demo adapter ('demo' mode, never touches Drive).
let puerto = drive;
let modo = 'drive'; // 'drive' | 'demo'
let cachePrefijo = CACHE_PREFIX;
let dirty = false;
let timer = null;
let syncing = null;
let syncGen = 0; // sync generation: one that timed out through the watchdog becomes stale
let rev = 0; // local change counter (so edits made during an upload are not lost)
let base = null; // last version synced with Drive (to merge changes made from another device)
let lastRev = null; // revision (md5Checksum/modifiedTime) of the remote file at the last sync
let lastVersion = null; // Drive `version` (monotonic integer) of our last read/write
let pollTimer = null;
let pollFallos = 0;
let cacheTimer = null;
let cachePendiente = false;
let cacheFallo = false;
let problema = null; // {tipo:'danado'|'vacio', raw?, tieneCopiaLocal}: the remote file is not trustworthy; nothing is written until it is resolved
let soloLectura = null; // {version}: the file was written by a newer version of the app
let omitirRespaldo = false;
let visto = new Map(); // 'sheet\u0001id' -> JSON of the row as it was when data was applied / at the last reconciliation
const respaldos = new Map(); // club id -> day (YYYYMMDD) on which the daily backup was already made

const tick = () => `${++meta.reloj}@${DISPOSITIVO}`;
const snapshot = () => JSON.parse(JSON.stringify({ db, club, meta, extra }));
const diaHoy = () => nombreBackup('x').slice(2, 10);

// Reads the remote file -> {data, rev, version, empty, doc, esClub}
async function readRemote() {
  const { doc, rev: r, version } = await puerto.read(ref.id);
  const data = docToData(doc);
  return { data, rev: r, version, empty: isEmptyData(data), doc, esClub: pareceDocumentoClub(doc) };
}

function emptyDb() {
  const d = {};
  ENTITY_SHEETS.forEach((s) => { d[s] = []; });
  return d;
}

function emit(evt) {
  listeners.forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
}

function setStatus(s) {
  if (store.status === s) return;
  store.status = s;
  emit({ type: 'status', status: s });
}

const cacheKey = () => cachePrefijo + ref.id;
const cacheExiste = () => {
  try { return localStorage.getItem(cacheKey()) !== null || cache._enIdb.has(cacheKey()); } catch (e) { return false; }
};

// ---------- Local cache (200 ms debounce; flushed when the tab is hidden/closed and on sync) ----------
// Reconciling before saving keeps the cache's stamps/tombstones up to date with the edits.
function cargaCache() {
  if (dirty) reconciliarMeta();
  return { v: 2, db, club, meta, extra, dirty, lastRev, lastVersion, base: dirty ? base : null };
}

function saveCache() {
  if (!ref) return;
  cachePendiente = true;
  clearTimeout(cacheTimer);
  cacheTimer = setTimeout(() => { flushCache(); }, config.cacheDebounceMs);
  if (cacheTimer && cacheTimer.unref) cacheTimer.unref();
}

function flushCache() {
  clearTimeout(cacheTimer);
  if (!cachePendiente || !ref) return Promise.resolve();
  cachePendiente = false;
  return cache.guardar(cacheKey(), cargaCache()).then(() => {
    if (cacheFallo) { cacheFallo = false; emit({ type: 'cache-ok' }); setStatus(dirty ? 'pendiente' : 'sincronizado'); }
  }, (e) => {
    cacheFallo = true;
    store.lastError = e;
    console.warn('Could not save the local cache', e);
    setStatus('error');
    emit({ type: 'cache-error', error: e });
  });
}

// ---------- Logical stamps and tombstones ----------
function indexar() {
  visto = new Map();
  ENTITY_SHEETS.forEach((s) => db[s].forEach((r) => visto.set(s + SEP + r.id, JSON.stringify(r))));
}

// Compares the sheets with what was last seen: new/edited rows get a new logical stamp and missing rows leave a tombstone.
// This works for any write path (upsert, import, demo, catalogue migrations...). Returns how many changes it found.
function reconciliarMeta() {
  const actuales = new Set();
  let cambios = 0;
  ENTITY_SHEETS.forEach((s) => {
    db[s].forEach((r) => {
      const k = s + SEP + r.id;
      actuales.add(k);
      const j = JSON.stringify(r);
      if (visto.get(k) === j) return;
      visto.set(k, j);
      (meta.sellos[s] ||= {})[r.id] = tick();
      if (meta.lapidas[s]) delete meta.lapidas[s][r.id];
      cambios++;
    });
  });
  [...visto.keys()].forEach((k) => {
    if (actuales.has(k)) return;
    visto.delete(k);
    const [s, id] = k.split(SEP);
    if (meta.sellos[s]) delete meta.sellos[s][id];
    (meta.lapidas[s] ||= {})[id] = { s: tick() };
    cambios++;
  });
  return cambios;
}

function applyData(data) {
  db = emptyDb();
  ENTITY_SHEETS.forEach((s) => { if (Array.isArray(data.db[s])) db[s] = data.db[s]; });
  club = data.club || {};
  const reloj = meta.reloj;
  meta = data.meta ? JSON.parse(JSON.stringify(data.meta)) : metaVacia();
  meta.sellos ||= {};
  meta.lapidas ||= {};
  meta.reloj = Math.max(Number(meta.reloj) || 0, reloj);
  extra = data.extra || { top: {}, hojas: {}, cols: {} };
  avisos = data.avisos || [];
  indexar();
}

// Clean row with exactly the sheet's columns (and normalised types: phones/licences as text, ISO dates).
function cleanRow(sheet, row) {
  const clean = {};
  SHEETS[sheet].forEach((c) => { clean[c] = normalizarValor(c, row[c]); });
  clean.id = row.id !== undefined && row.id !== null && row.id !== '' ? String(row.id) : newId();
  return clean;
}

const hayDatosReales = () => ENTITY_SHEETS.some((s) => s !== 'TiposCarga' && db[s].length) || Object.keys(club).some((k) => k !== 'nombre');

const errSoloLectura = () => Object.assign(new Error('Este club lo guardó una versión más nueva de la aplicación: actualiza la app. Mientras tanto está en solo lectura.'), { code: 'solo-lectura' });
const errProblema = () => Object.assign(new Error('El fichero del club en Drive necesita tu atención antes de poder guardar.'), { code: 'problema-fichero' });
const guardaEscritura = () => { if (soloLectura) throw errSoloLectura(); };

// Seeds the training-content catalogue (TiposCarga) and migrates legacy data (see domain/cargas.js).
// Idempotent: only adds the missing predefined ones and never overwrites edits. Returns true if anything changed.
function ensureCatalog() {
  const plan = prepararCatalogo({
    tipos: db.TiposCarga.map(normalizarTipo), cargas: db.Cargas, objetivos: db.ObjetivosCarga, generarId: () => 'tc-' + newId(),
  });
  if (!plan.crear.length && !plan.actualizar.length && !plan.eliminarObjetivos.length) return false;
  plan.crear.concat(plan.actualizar).forEach((t) => {
    const fila = cleanRow('TiposCarga', filaTipo(t));
    const i = db.TiposCarga.findIndex((r) => r.id === fila.id);
    if (i >= 0) db.TiposCarga[i] = fila; else db.TiposCarga.push(fila);
  });
  if (plan.eliminarObjetivos.length) db.ObjetivosCarga = db.ObjetivosCarga.filter((o) => !plan.eliminarObjetivos.includes(o.id));
  return true;
}

function descargarBlob(blob, nombre) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const nombreXlsx = () => String(club.nombre || (ref && ref.name) || 'club').replace(/[\\/:*?"<>|]/g, '-') + '.xlsx';

// ---------- Excel ----------
function buildWorkbook(XLSX) {
  const wb = XLSX.utils.book_new();
  const clubRows = Object.keys(club).map((k) => ({ clave: k, valor: club[k] }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clubRows, { header: SHEETS.Club }), 'Club');
  ENTITY_SHEETS.forEach((s) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(db[s], { header: SHEETS[s] }), s);
  });
  return wb;
}

async function workbookBlob() {
  const XLSX = await loadXLSX();
  const out = XLSX.write(buildWorkbook(XLSX), { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: XLSX_MIME });
}

// .xlsx -> {data, hojas:[{nombre, filas, actuales}], total, duplicados:[{hoja,id}], invalidas:n}. Does not touch the store.
// Normalises types (phone/licence to text, Excel serial dates to ISO) and rejects huge files.
async function parseWorkbook(file) {
  if (file && Number(file.size) > MAX_IMPORT_BYTES) throw Object.assign(new Error('El fichero supera los 20 MB.'), { code: 'import-demasiado-grande' });
  const XLSX = await loadXLSX();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const data = { db: emptyDb(), club: {} };
  const rowsOf = (name) => (wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true }) : []);
  const hojas = [];
  const duplicados = [];
  let total = 0;
  let invalidas = 0;
  const clubRows = rowsOf('Club');
  clubRows.forEach((r) => { if (r.clave) data.club[String(r.clave)] = normalizarClub(r.valor); });
  hojas.push({ nombre: 'Club', filas: Object.keys(data.club).length, actuales: Object.keys(club).length });
  ENTITY_SHEETS.forEach((s) => {
    const crudas = rowsOf(s);
    total += crudas.length;
    if (total > MAX_IMPORT_FILAS) throw Object.assign(new Error('El fichero tiene más de 50.000 filas.'), { code: 'import-demasiadas-filas' });
    const porId = new Map();
    crudas.forEach((r) => {
      const o = {};
      SHEETS[s].forEach((c) => { o[c] = normalizarValor(c, r[c]); });
      if (o.id === '') return;
      o.id = String(o.id);
      if (porId.has(o.id)) duplicados.push({ hoja: s, id: o.id });
      porId.set(o.id, o);
      if (validarFila(s, o).length) invalidas++;
    });
    data.db[s] = [...porId.values()];
    hojas.push({ nombre: s, filas: data.db[s].length, actuales: db[s].length });
  });
  return { data, hojas, total, duplicados, invalidas };
}

// ---------- Persistence ----------
function markDirty() {
  guardaEscritura();
  dirty = true;
  rev++;
  saveCache();
  if (!cacheFallo) setStatus(navigator.onLine ? 'pendiente' : 'offline');
  clearTimeout(timer);
  timer = setTimeout(() => store.sync().catch(() => {}), DEBOUNCE_MS);
  if (timer && timer.unref) timer.unref();
}

// Poll every ~30 s to detect changes made from the same user's other devices/tabs (only while the tab is visible).
// After errors the delay grows exponentially (honouring Retry-After) up to 5 minutes; a success resets it.
function programarSondeo(ms) {
  clearTimeout(pollTimer);
  pollTimer = setTimeout(sondear, ms);
  if (pollTimer && pollTimer.unref) pollTimer.unref();
}

async function sondear() {
  let siguiente = POLL_MS;
  try {
    if (!(typeof document !== 'undefined' && document.visibilityState === 'hidden') && ref) {
      if (dirty) { if (navigator.onLine) await store.sync(); } // queue of pending changes (e.g. after a network outage)
      else await store.refresh();
    }
    pollFallos = 0;
  } catch (e) {
    if (!e.offline) { store.lastError = e; setStatus('error'); }
    pollFallos++;
    siguiente = Math.min(POLL_MS * 2 ** pollFallos, POLL_MAX_MS);
    if (e.retryAfterMs) siguiente = Math.max(siguiente, Math.min(e.retryAfterMs, POLL_MAX_MS));
  }
  programarSondeo(siguiente);
}

function startPolling() {
  if (modo === 'demo') return;
  pollFallos = 0;
  programarSondeo(POLL_MS);
}

// The club file in Drive follows the club name (best effort).
async function renameIfNeeded() {
  const nombre = String(club.nombre || '').trim();
  if (!nombre || nombre === ref.name) return;
  try {
    const r = await puerto.renameClub(ref.id, nombre);
    ref.name = nombre;
    if (r && r.version) lastVersion = r.version; // renaming also bumps the file's `version`
  } catch (e) { console.warn('Could not rename the club file', e); }
}

// Rotating daily backup cnl/backups/<club>-YYYYMMDD.json (last 14): made from the content in Drive BEFORE
// the first write of the day. Best effort: a failure here never prevents saving.
// "Empty" for the daily backup: no real data (the auto-seeded content catalogue and the club name do not count).
const docVacio = (doc) => !doc || !doc.hojas
  || (Object.keys(doc.hojas).every((k) => k === 'TiposCarga' || !Array.isArray(doc.hojas[k]) || !doc.hojas[k].length) && Object.keys(doc.club || {}).every((k) => k === 'nombre'));
async function respaldoDiario(docPrevio) {
  if (omitirRespaldo || !ref || docVacio(docPrevio) || respaldos.get(ref.id) === diaHoy()) return;
  try { await puerto.backupClub(ref.name, docPrevio); respaldos.set(ref.id, diaHoy()); } catch (e) { console.warn('Daily backup not made', e); }
}

function ponerProblema(tipo, e) {
  problema = { tipo, raw: e && e.raw, tieneCopiaLocal: hayDatosReales(), mensaje: e && e.message };
  clearTimeout(timer);
  setStatus('error');
  emit({ type: 'problema', problema });
}

function entrarSoloLectura(version) {
  soloLectura = { version };
  dirty = false;
  clearTimeout(timer);
  setStatus('error');
  emit({ type: 'solo-lectura', version });
}

async function hayRespaldos() {
  try { return (await puerto.listarBackups(ref.name)).length > 0; } catch (e) { return false; }
}

// Two tabs of the same browser share the local cache: if the other one saved changes they are merged with our own
// (instead of overwriting each other) and the result converges without rewriting in a loop.
function adoptarDeOtraPestana(c) {
  if (!ref || syncing || problema || soloLectura) return;
  reconciliarMeta();
  const antes = JSON.stringify({ db, club });
  const suyo = { db: c.db, club: c.club, meta: c.meta, extra: c.extra };
  const mg = mergeData(base, { db, club, meta, extra }, suyo, { dispositivo: DISPOSITIVO });
  const despues = JSON.stringify({ db: mg.db, club: mg.club });
  if (despues === antes) return;
  applyData(mg);
  dirty = dirty || !!c.dirty;
  rev++;
  if (despues !== JSON.stringify({ db: c.db, club: c.club })) saveCache(); // the merged result differs from the other tab's: save it
  setStatus(dirty ? 'pendiente' : store.status);
  emit({ type: 'remote' });
}

// When the network returns, changes left pending offline are uploaded; when the tab is hidden or closed the cache is flushed.
// Bound in init() on the current window (once per window).
const enlazadas = new WeakSet();
function enlazarEventosDeVentana() {
  if (typeof window === 'undefined' || !window.addEventListener || enlazadas.has(window)) return;
  enlazadas.add(window);
  window.addEventListener('online', () => { if (ref && dirty) store.sync().catch(() => {}); });
  window.addEventListener('pagehide', () => { flushCache(); });
  window.addEventListener('storage', (ev) => {
    if (!ref || ev.key !== cacheKey() || !ev.newValue) return;
    try { const c = JSON.parse(ev.newValue); if (c && c.db) adoptarDeOtraPestana(c); } catch (e) { /* ignorar */ }
  });
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'hidden') return;
      flushCache();
      if (ref && dirty && navigator.onLine && !problema && !soloLectura) store.sync().catch(() => {});
    });
  }
}

// Only one tab syncs at a time (Web Locks) when the browser supports it.
function conBloqueo(fn) {
  const locks = typeof navigator !== 'undefined' && navigator.locks;
  return locks && locks.request ? locks.request('cnl-sync-' + ref.id, fn) : fn();
}

// One sync cycle: meta -> (read + merge) -> write -> check that nobody wrote in between.
async function sincronizar(gen) {
  const vivo = () => { if (gen !== syncGen) throw Object.assign(new Error('Stale synchronisation'), { obsoleta: true }); };
  let merged = false;
  for (let vuelta = 0; ; vuelta++) {
    const m = await puerto.meta(ref.id);
    vivo();
    let remote = null;
    let docPrevio = null;
    let vBase = m.version;
    reconciliarMeta();
    if (m.rev !== lastRev) {
      remote = await readRemote();
      vivo();
      if (remote.data.versionFutura) { applyData(remote.data); base = snapshot(); lastRev = remote.rev; lastVersion = remote.version; entrarSoloLectura(remote.data.versionFutura); return; }
      if ((remote.empty || !remote.esClub) && base && !isEmptyData(base)) { ponerProblema('vacio'); throw errProblema(); } // someone emptied the file
      if (dirty) applyData(mergeData(remote.empty ? null : base, { db, club, meta, extra }, remote.data, { dispositivo: DISPOSITIVO }));
      else applyData(remote.data);
      merged = true;
      vBase = remote.version != null ? remote.version : m.version;
      docPrevio = remote.doc;
      if (ensureCatalog()) { dirty = true; rev++; }
    } else docPrevio = base ? dataToDoc(base) : null;
    if (!dirty) {
      if (remote) { base = snapshot(); lastRev = remote.rev; lastVersion = vBase; }
      break;
    }
    // Upload
    const startRev = rev;
    reconciliarMeta();
    purgarLapidas(meta);
    const data = snapshot();
    await respaldoDiario(docPrevio);
    vivo();
    const w = await puerto.write(ref.id, dataToDoc(data));
    vivo();
    if (vBase != null && w.version != null && w.version !== vBase + 1 && vuelta < MAX_VUELTAS) {
      // Drive's `version` jumped by more than 1: another device wrote between our read and our write and we overwrote it.
      // Its revision (the one before ours) is recovered, merged with ours and written again.
      const prev = await puerto.revisionPrevia(ref.id).catch(() => null);
      vivo();
      if (prev && !docToData(prev).versionFutura) {
        lastRev = w.rev;
        lastVersion = w.version;
        applyData(mergeData(base, { db, club, meta, extra }, docToData(prev), { dispositivo: DISPOSITIVO }));
        dirty = true;
        rev++;
        merged = true;
        continue;
      }
    }
    base = data;
    lastRev = w.rev;
    lastVersion = w.version;
    dirty = rev !== startRev; // edits made during the upload
    await renameIfNeeded();
    break;
  }
  saveCache();
  setStatus(dirty ? 'pendiente' : 'sincronizado');
  if (dirty) { timer = setTimeout(() => store.sync().catch(() => {}), DEBOUNCE_MS); if (timer && timer.unref) timer.unref(); }
  if (merged) emit({ type: 'remote' });
}

export const store = {
  status: 'sincronizado', // sincronizado | pendiente | offline | error (kept in Spanish: they are translation keys)
  lastError: null,
  config,

  // clubRef: {id, name} (id of the cnl/<Club>.json file in Drive).
  // opciones.demo = the demo adapter (js/infrastructure/demoStorage.js): the club is read/written there instead of Drive,
  // its local mirror lives under 'cnl:demo:club:' and store.mode is 'demo'.
  async init(clubRef, { demo = null } = {}) {
    clearTimeout(timer);
    if (!clubRef || !clubRef.id) throw new Error('Falta el club (id del fichero en Drive).');
    enlazarEventosDeVentana();
    if (ref) {
      // Anything pending from the previous session is flushed, unless it is the same club and its cache no longer exists
      // (someone cleared the local data): then it is dropped, not resurrected.
      if (cachePendiente && ref.id === clubRef.id && !cacheExiste()) { cachePendiente = false; clearTimeout(cacheTimer); } else await flushCache();
    }
    ref = { name: clubRef.name, id: clubRef.id };
    puerto = demo || drive;
    modo = demo ? 'demo' : 'drive';
    cachePrefijo = demo ? DEMO_CACHE_PREFIX : CACHE_PREFIX;
    syncGen++; // a sync left hanging from before can no longer touch the state
    syncing = null;
    dirty = false;
    clearTimeout(pollTimer);
    pollTimer = null;
    base = null;
    lastRev = null;
    lastVersion = null;
    problema = null;
    soloLectura = null;
    cacheFallo = false;
    cachePendiente = false;
    respaldos.delete(ref.id); // one check of the daily backup per opening
    meta = metaVacia();
    extra = { top: {}, hojas: {}, cols: {} };
    avisos = [];
    let cached = await cache.leer(cacheKey()).catch(() => null);
    if (cached && cached.db) {
      applyData({ db: cached.db, club: cached.club, meta: cached.meta, extra: cached.extra });
      dirty = !!cached.dirty;
      lastRev = cached.lastRev || null;
      lastVersion = cached.lastVersion == null ? null : cached.lastVersion;
      base = cached.base || null;
    } else { cached = null; db = emptyDb(); club = {}; indexar(); }
    const tenia = cached ? hayDatosReales() : false;

    // Without pending local changes the remote is taken; with them, they are merged when syncing.
    try {
      if (!navigator.onLine) throw Object.assign(new Error('offline'), { offline: true });
      if (!dirty) {
        let remote = null;
        try { remote = await readRemote(); } catch (e) {
          if (e.code !== 'fichero-danado') throw e;
          ponerProblema('danado', e); // unreadable JSON: nothing is overwritten
        }
        if (remote) {
          if (remote.data.versionFutura) {
            applyData(remote.data); base = snapshot(); lastRev = remote.rev; lastVersion = remote.version;
            entrarSoloLectura(remote.data.versionFutura);
          } else if ((remote.empty || !remote.esClub) && tenia) {
            lastRev = remote.rev; lastVersion = remote.version;
            ponerProblema('vacio'); // {} / null / no data while a local copy has data: this is not a new club
          } else if (remote.empty && !remote.esClub && await hayRespaldos()) {
            lastRev = remote.rev; lastVersion = remote.version;
            ponerProblema('vacio');
          } else {
            if (remote.empty) { // freshly created file
              if (!club.nombre) club.nombre = ref.name;
              dirty = true;
            } else applyData(remote.data);
            lastRev = remote.rev;
            lastVersion = remote.version;
            base = remote.empty ? null : snapshot();
          }
        }
      }
      if (!soloLectura) {
        if (!club.nombre) club.nombre = ref.name;
        if (!problema && ensureCatalog()) dirty = true;
      }
      cachePendiente = true;
      await flushCache();
      if (!problema && !soloLectura) setStatus(dirty ? 'pendiente' : 'sincronizado');
      if (dirty && !problema && !soloLectura) store.sync().catch(() => {});
      startPolling();
    } catch (e) {
      if (!cached) throw e;
      if (ensureCatalog()) { dirty = true; cachePendiente = true; await flushCache(); }
      setStatus(e.offline ? 'offline' : 'error');
      startPolling();
    }
    emit({ type: 'init' });
    return store;
  },

  // Closes the club without flushing anything (sign-out): cancels timers and drops the data so that no
  // later flush (e.g. pagehide on reload) writes back the local cache that was just erased.
  cerrar() {
    clearTimeout(timer);
    clearTimeout(pollTimer);
    clearTimeout(cacheTimer);
    cachePendiente = false;
    syncGen++;
    syncing = null;
    dirty = false;
    ref = null;
    puerto = drive;
    modo = 'drive';
    cachePrefijo = CACHE_PREFIX;
    db = emptyDb();
    club = {};
    base = null;
    problema = null;
    soloLectura = null;
    meta = metaVacia();
    visto = new Map();
  },

  // Opens the DEMO club (store.mode becomes 'demo'): sample data kept only in this browser, Drive is never touched. The first time
  // the club is created and seeded (dates relative to `hoy`); afterwards it reopens what the person had. Prefer
  // application/modoService.js `enterDemo()`, which also remembers the choice. -> store
  async initDemo({ hoy, demo = demoStorage } = {}) {
    const { ref: demoRef, nuevo } = demo.asegurar();
    await store.init(demoRef, { demo });
    if (nuevo) {
      await store.sync(); // settle the sync that init() started for the fresh file, so the seed below is uploaded by its own sync
      store.seedDemo({ hoy: hoy || new Date() });
      await store.sync();
    }
    return store;
  },

  // 'drive' (the club lives in the person's Google Drive) | 'demo' (sample data kept only in this browser; Drive is never touched)
  get mode() { return modo; },

  // Data of the open club: {name, id}
  get clubRef() { return ref ? { name: ref.name, id: ref.id } : null; },

  // File integrity state: problem (damaged / emptied JSON) or read-only (future version); read warnings.
  get problema() { return problema; },
  get soloLectura() { return soloLectura; },
  get avisos() { return avisos.slice(); },
  get pendiente() { return dirty; },

  // Checks (with a cheap metadata request) whether another device changed the file and, if so,
  // incorporates the changes. Returns true if anything changed.
  async refresh() {
    if (!ref || syncing || dirty || problema || !navigator.onLine) return false;
    const m = await puerto.meta(ref.id);
    if (m.rev === lastRev || dirty || syncing) return false;
    let remote;
    try { remote = await readRemote(); } catch (e) {
      if (e.code === 'fichero-danado') ponerProblema('danado', e);
      throw e;
    }
    if (dirty || syncing) return false;
    if (remote.data.versionFutura) { applyData(remote.data); base = snapshot(); lastRev = remote.rev; lastVersion = remote.version; entrarSoloLectura(remote.data.versionFutura); emit({ type: 'remote' }); return true; }
    if ((remote.empty || !remote.esClub) && hayDatosReales()) { lastRev = remote.rev; lastVersion = remote.version; ponerProblema('vacio'); return false; }
    applyData(remote.data);
    base = snapshot();
    lastRev = remote.rev;
    lastVersion = remote.version;
    if (!soloLectura && ensureCatalog()) markDirty(); else { saveCache(); setStatus('sincronizado'); }
    emit({ type: 'remote' });
    return true;
  },

  get club() { return club; },
  setClub(obj) {
    guardaEscritura();
    club = Object.assign({}, club, obj);
    markDirty();
    emit({ type: 'club' });
  },

  list(sheet) { return db[sheet] ? db[sheet].slice() : []; },
  get(sheet, id) { return (db[sheet] || []).find((r) => r.id === String(id)) || null; },

  // Validates (real dates, numeric ranges...) and saves the row; throws an Error with code 'validacion' (and .errores) if invalid.
  upsert(sheet, row) { return store.upsertMany(sheet, [row])[0]; },

  // Several rows with ONE markDirty/emit (imports, seeding). All or nothing: if one is invalid none is saved.
  upsertMany(sheet, rows) {
    if (!db[sheet]) throw new Error('Hoja desconocida: ' + sheet);
    guardaEscritura();
    const limpias = (rows || []).map((r) => cleanRow(sheet, r));
    limpias.forEach((c) => { const e = validarFila(sheet, c); if (e.length) throw errorValidacion(sheet, e); });
    if (!limpias.length) return [];
    const idx = new Map(db[sheet].map((r, i) => [r.id, i]));
    limpias.forEach((c) => {
      if (idx.has(c.id)) db[sheet][idx.get(c.id)] = c;
      else { idx.set(c.id, db[sheet].length); db[sheet].push(c); }
    });
    markDirty();
    emit({ type: 'change', sheet });
    return limpias;
  },

  remove(sheet, id) { return store.removeMany(sheet, [id]); },

  // Deletes several rows with ONE markDirty/emit. -> number of rows deleted
  removeMany(sheet, ids) {
    guardaEscritura();
    const quitar = new Set((ids || []).map(String));
    const n = (db[sheet] || []).length;
    db[sheet] = (db[sheet] || []).filter((r) => !quitar.has(r.id));
    const borradas = n - db[sheet].length;
    if (borradas) { markDirty(); emit({ type: 'change', sheet }); }
    return borradas;
  },

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // Uploads the changes to Drive (first merging any made by another device).
  // With a watchdog: if the sync does not finish within config.watchdogMs `syncing` is released and the error reported.
  async sync() {
    if (!ref) return;
    if (syncing) return syncing;
    clearTimeout(timer);
    if (soloLectura) return;
    if (problema) throw errProblema();
    if (!navigator.onLine) { setStatus('offline'); return; }
    const gen = ++syncGen;
    let vigilante = null;
    const trabajo = conBloqueo(() => sincronizar(gen)).catch((e) => {
      if (e && e.obsoleta) return undefined;
      if (e && e.code === 'fichero-danado' && !problema) ponerProblema('danado', e);
      (e && e.offline ? console.warn : console.error)(e); // being offline is an expected state, not a failure
      setStatus(navigator.onLine && !e.offline ? 'error' : 'offline');
      store.lastError = e;
      cachePendiente = true;
      flushCache();
      throw e;
    });
    const limite = new Promise((resolve, reject) => {
      vigilante = setTimeout(() => {
        syncGen++; // the hung sync becomes stale: if it wakes up it will not touch anything
        const e = Object.assign(new Error('La sincronización no responde (tiempo agotado). Se reintentará.'), { timeout: true, code: 'timeout' });
        setStatus('error');
        store.lastError = e;
        reject(e);
      }, config.watchdogMs);
      // Not unref'd: callers await this deadline, and Node would otherwise end the event loop while it is pending.
    });
    syncing = Promise.race([trabajo, limite]);
    const mia = syncing;
    const libera = () => { clearTimeout(vigilante); if (syncing === mia) syncing = null; };
    mia.then(libera, libera);
    trabajo.catch(() => {}); // avoids an unhandled rejection if the watchdog wins the race
    return syncing;
  },

  // ---------- Full backup / restore support (application/backupService.js) ----------
  // The whole club document as it is written to Drive (entity sheets, unknown sheets/columns/keys and the sync metadata).
  documento() { reconciliarMeta(); return dataToDoc({ db, club, meta, extra }); },

  // Runs the on-open migrations (content catalogue, legacy objectives) after data was replaced. -> true if something changed
  migrar() {
    guardaEscritura();
    if (!ensureCatalog()) return false;
    markDirty();
    emit({ type: 'change', sheet: 'TiposCarga' });
    return true;
  },

  // Unknown sheets / columns / top-level keys (from a newer version or a backup). reemplazar=false merges them over the current ones.
  // -> true if something changed
  aplicarExtras(nuevo, { reemplazar = true } = {}) {
    guardaEscritura();
    const n = nuevo || {};
    const siguiente = reemplazar
      ? { top: { ...(n.top || {}) }, hojas: { ...(n.hojas || {}) }, cols: JSON.parse(JSON.stringify(n.cols || {})) }
      : { top: { ...extra.top, ...(n.top || {}) }, hojas: { ...extra.hojas, ...(n.hojas || {}) }, cols: { ...extra.cols } };
    if (!reemplazar) Object.keys(n.cols || {}).forEach((s) => { siguiente.cols[s] = { ...(extra.cols[s] || {}), ...n.cols[s] }; });
    if (JSON.stringify(siguiente) === JSON.stringify(extra)) return false;
    extra = siguiente;
    markDirty();
    emit({ type: 'change', sheet: null });
    return true;
  },

  // Downloads the current club's .xlsx.
  async exportXlsx() {
    const blob = await workbookBlob();
    descargarBlob(blob, nombreXlsx());
    return blob;
  },

  // Downloads a JSON copy (the same one saved in Drive) of what is in memory now: an emergency exit.
  descargarCopia() {
    const blob = new Blob([JSON.stringify(dataToDoc({ db, club, meta, extra }), null, 1)], { type: 'application/json' });
    descargarBlob(blob, String(club.nombre || (ref && ref.name) || 'club').replace(/[\\/:*?"<>|]/g, '-') + '.json');
    return blob;
  },

  // Saves an .xlsx copy in the cnl folder in Drive (overwrites the previous one for the same club).
  async guardarXlsxEnDrive() {
    if (modo === 'demo') throw Object.assign(new Error('Demo mode does not use Google Drive.'), { code: 'demo-sin-drive' });
    const name = nombreXlsx();
    const body = await workbookBlob();
    const fid = await puerto.ensureFolder();
    const prev = await puerto.findFile(name, fid);
    return puerto.upload({ name, mimeType: XLSX_MIME, body, parentId: fid, id: prev && prev.id });
  },

  // Preview of an .xlsx (changes nothing): per-sheet count against the current data, duplicates and doubtful rows.
  previsualizarXlsx(file) { return parseWorkbook(file); },

  // Replaces the data with that of an .xlsx (File/Blob) or of an already computed preview. First saves a copy
  // cnl/backups/<club>-import-YYYYMMDDHHMMSS.json; if that is not possible (e.g. offline) it does not import, unless { sinCopia: true }.
  async importXlsx(file, { sinCopia = false } = {}) {
    guardaEscritura();
    const prev = file && file.data && file.hojas ? file : await parseWorkbook(file);
    if (!sinCopia) {
      try { await puerto.backupClub(ref.name, dataToDoc({ db, club, meta, extra }), { etiqueta: 'import' }); } catch (e) {
        throw Object.assign(new Error('No se pudo guardar la copia previa a la importación; no se ha importado nada. ' + (e.message || '')), { code: 'import-sin-copia', causa: e });
      }
    }
    db = emptyDb();
    ENTITY_SHEETS.forEach((s) => { db[s] = prev.data.db[s]; });
    club = prev.data.club;
    ensureCatalog();
    if (!club.nombre) club.nombre = ref.name;
    markDirty();
    emit({ type: 'init' });
    return { hojas: prev.hojas, total: prev.total };
  },

  // Deletes all data of the current club (keeps identity).
  clear() {
    guardaEscritura();
    db = emptyDb();
    ensureCatalog();
    markDirty();
    emit({ type: 'init' });
  },

  // ---------- GDPR ----------
  // All rows of a swimmer (profile + attendance, loads, times, swimsuit...) -> {nadador, hojas}
  datosNadador(id) {
    const n = store.get('Nadadores', id);
    if (!n) return null;
    const hojas = {};
    RELACIONES.filter(([, , padre]) => padre === 'Nadadores').forEach(([hijo, col]) => {
      hojas[hijo] = db[hijo].filter((r) => r[col] === n.id).map((r) => ({ ...r }));
    });
    return { nadador: { ...n }, hojas };
  },

  // Right of access/portability: JSON with everything stored about a swimmer, and downloads it. -> {datos, blob, nombre}
  exportNadador(id, { descargar = true } = {}) {
    const d = store.datosNadador(id);
    if (!d) throw new Error('Nadador no encontrado');
    const datos = { version: DOC_VERSION, tipo: 'nadador', exportadoEl: new Date().toISOString(), club: club.nombre || '', ...d };
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const nombre = ('nadador-' + [d.nadador.nombre, d.nadador.apellidos].filter(Boolean).join('-').replace(/[\\/:*?"<>|\s]+/g, '-') + '.json');
    if (descargar) descargarBlob(blob, nombre);
    return { datos, blob, nombre };
  },

  // Right to erasure: deletes the swimmer and ALL their rows (cascade), leaves permanent tombstones (no device with old data
  // can resurrect them), rewrites the club JSON, deletes the .xlsx copies and the club backups in Drive and the old revisions
  // of the file. -> {filas, sincronizado, copiasBorradas, revisionesBorradas, avisoRevisiones, errores}
  async purgarNadador(id, { borrarEnDrive = true } = {}) {
    guardaEscritura();
    const n = store.get('Nadadores', id);
    if (!n) throw new Error('Nadador no encontrado');
    let filas = 0;
    const quitadas = [];
    RELACIONES.filter(([, , padre]) => padre === 'Nadadores').forEach(([hijo, col]) => {
      const ids = db[hijo].filter((r) => r[col] === n.id).map((r) => r.id);
      if (ids.length) { filas += store.removeMany(hijo, ids); ids.forEach((x) => quitadas.push([hijo, x])); }
    });
    filas += store.removeMany('Nadadores', [n.id]);
    quitadas.push(['Nadadores', n.id]);
    reconciliarMeta();
    quitadas.forEach(([s, x]) => { (meta.lapidas[s] ||= {})[x] = { s: tick(), h: 1 }; }); // permanent tombstone
    omitirRespaldo = true; // the daily backup uses the PREVIOUS state, which would still contain the swimmer
    const res = { filas, sincronizado: false, copiasBorradas: 0, revisionesBorradas: 0, avisoRevisiones: true, errores: [] };
    try {
      await store.sync();
      res.sincronizado = !dirty;
    } catch (e) { res.errores.push(e.message || String(e)); } finally { omitirRespaldo = false; }
    if (borrarEnDrive && res.sincronizado && modo === 'drive') {
      try {
        const fid = await puerto.ensureFolder();
        for (const nombre of new Set([nombreXlsx(), String(ref.name) + '.xlsx'])) {
          const f = await puerto.findFile(nombre, fid);
          if (f) { await puerto.eliminarDefinitivo(f.id); res.copiasBorradas++; }
        }
        for (const b of await puerto.listarBackups(ref.name, { todos: true })) { await puerto.eliminarDefinitivo(b.id); res.copiasBorradas++; }
        res.revisionesBorradas = await puerto.borrarRevisionesAntiguas(ref.id);
      } catch (e) { res.errores.push(e.message || String(e)); }
    }
    return res;
  },

  // ---------- Damaged / emptied file ----------
  // accion: 'copia-local' (upload again what is on this device) | 'backup' (latest backup in Drive) | 'vacio' (start from scratch)
  async resolverProblema(accion) {
    if (!problema) return false;
    const p = problema;
    const m = await puerto.meta(ref.id);
    if (p.raw) { try { await puerto.backupClub(ref.name, { ficheroDanado: p.raw }, { etiqueta: 'danado' }); } catch (e) { console.warn('Could not save the damaged file', e); } }
    if (accion === 'backup') {
      const lista = await puerto.listarBackups(ref.name);
      if (!lista.length) throw Object.assign(new Error('No hay copias de seguridad de este club en Drive.'), { code: 'sin-backups' });
      applyData(docToData(await puerto.leerFichero(lista[0].id)));
    } else if (accion === 'vacio') {
      applyData({ db: emptyDb(), club: {} });
      club.nombre = ref.name;
    } else if (!p.tieneCopiaLocal) throw Object.assign(new Error('No hay copia local en este dispositivo.'), { code: 'sin-copia-local' });
    problema = null;
    lastRev = m.rev; // do not read the unreadable file again: it gets overwritten
    lastVersion = m.version;
    base = null;
    ensureCatalog();
    markDirty();
    emit({ type: 'init' });
    await store.sync();
    return true;
  },

  // Backups of this club in Drive, most recent first -> [{id, name}]
  listarBackups() { return puerto.listarBackups(ref.name); },

  // Adds (without touching the rest) sample conflicts to the pool planning: several errors and warnings.
  seedPlanificacionConflictos() {
    const pis = db.Piscinas[0];
    if (!pis) return 0;
    const g = db.Grupos;
    const filas = [
      { id: 'pcx1', piscinaId: pis.id, dia: 1, fecha: '', horaInicio: '17:30', horaFin: '18:30', calleDesde: 2, calleHasta: 3, grupoId: (g[1] || g[0]).id, entrenadorId: (g[1] || g[0]).entrenador, notas: 'Demo: calle solapada con Promoción' },
      { id: 'pcx2', piscinaId: pis.id, dia: 4, fecha: '', horaInicio: '18:30', horaFin: '19:30', calleDesde: 5, calleHasta: 5, grupoId: (g[2] || g[0]).id, entrenadorId: (g[1] || g[0]).entrenador, notas: 'Demo: mismo entrenador a la vez' },
    ];
    filas.forEach((f) => store.upsert('AsignacionesCalle', f));
    return filas.length;
  },

  // Replaces the data with a demo of Club Natación Lugones. `hoy` (Date) = demo clock: all dates are relative to it.
  seedDemo({ hoy } = {}) {
    const d = buildDemo(hoy);
    db = d.db;
    ensureCatalog();
    club = Object.assign({}, club, d.club);
    markDirty();
    emit({ type: 'init' });
    return Object.fromEntries(ENTITY_SHEETS.map((s) => [s, db[s].length]));
  },
};

// ---------- Demo data ----------
function buildDemo(hoyBase) {
  const reloj = () => (hoyBase instanceof Date && !Number.isNaN(hoyBase.getTime()) ? new Date(hoyBase) : new Date());
  let seed = 20251;
  const rnd = () => { // mulberry32 determinista
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const addDays = (dt, n) => { const x = new Date(dt); x.setDate(x.getDate() + n); return x; };

  const out = emptyDb();
  const clubObj = {
    nombre: 'Club Natación Lugones',
    lema: 'Pequeño gran club',
    logo: '',
    colorPrimario: '#1a73e8',
    colorSecundario: '#0b3d91',
  };

  const grupos = [
    { id: 'g1', nombre: 'Promoción', categoria: 'Benjamín', entrenador: 'Marta Valdés', dias: [1, 3, 5], hora: '17:30', dur: 60, base: 1800, piscina: '25' },
    { id: 'g2', nombre: 'Alevín', categoria: 'Alevín', entrenador: 'Jorge Prieto', dias: [2, 4], hora: '18:30', dur: 75, base: 2600, piscina: '25' },
    { id: 'g3', nombre: 'Infantil-Junior', categoria: 'Infantil', entrenador: 'Marta Valdés', dias: [1, 3, 5], hora: '19:30', dur: 90, base: 3800, piscina: '25' },
    { id: 'g4', nombre: 'Absoluto-Master', categoria: 'Absoluto', entrenador: 'Jorge Prieto', dias: [2, 4, 6], hora: '20:30', dur: 90, base: 4500, piscina: '50' },
  ];
  grupos.forEach((g) => out.Grupos.push({ id: g.id, nombre: g.nombre, categoria: g.categoria, entrenador: g.entrenador }));

  // Birth = year of the current season (per the clock) - age in that season: so each swimmer falls in the intended category
  // even as time passes. The category is NOT set by hand: it is computed with the rules of domain/categorias.js.
  const temporadaDemoCat = temporadaDe(ymd(reloj()));
  const nad = [
    // name, surnames, age in the season (start year - birth year), month-day, sex, group, master licence
    ['Lucía', 'Fernández Roces', 8, '03-12', 'F', 'g1'], // Pre-Benjamín
    ['Martina', 'Suárez Cuesta', 10, '09-04', 'F', 'g1'], // Benjamín
    ['Pelayo', 'García Alonso', 9, '01-22', 'M', 'g1'], // Benjamín
    ['Carla', 'Menéndez Vigil', 12, '06-30', 'F', 'g2'], // Alevín
    ['Álvaro', 'Rodríguez Fano', 11, '11-08', 'M', 'g2'], // Alevín
    ['Noa', 'Díaz Llano', 14, '02-17', 'F', 'g3'], // Infantil
    ['Iker', 'Pérez Naves', 13, '08-25', 'M', 'g3'], // Infantil
    ['Paula', 'González Mier', 17, '05-14', 'F', 'g3'], // Junior
    ['Marcos', 'Llano Bernardo', 15, '10-03', 'M', 'g3'], // Junior
    ['Claudia', 'Vigil Argüelles', 23, '04-19', 'F', 'g4'], // Absoluto
    ['Daniel', 'Cueto Faes', 25, '12-01', 'M', 'g4'], // Absoluto (without master licence)
    ['Javier', 'Álvarez Tuñón', 42, '07-09', 'M', 'g4', true], // Master (with master licence)
  ];
  nad.forEach((n, i) => {
    const id = 'n' + pad(i + 1);
    const fila = {
      id, nombre: n[0], apellidos: n[1], fechaNacimiento: `${temporadaDemoCat - n[2]}-${n[3]}`, sexo: n[4], categoria: '', grupoId: n[5],
      email: '', telefono: '6' + String(10000000 + Math.floor(rnd() * 89999999)), tutor: i < 9 ? 'Familia ' + n[1].split(' ')[0] : '',
      licencia: 'AST' + (4000 + i * 7), notas: '', activo: 'true', licenciaMaster: n[6] ? 'true' : 'false', categoriaManual: '',
    };
    fila.categoria = categoriaDe(fila, temporadaDemoCat).categoria;
    out.Nadadores.push(fila);
  });
  clubObj.temporadaActual = '';
  clubObj.temporadaAplicada = etiquetaTemporada(temporadaDemoCat);

  // Content catalogue with weekly goals per swimmer (metres) for the contents worked on in the demo
  const obj = { 'aerobico-medio': [1500, 4000], 'aerobico-intenso': [800, 2500], 'anaerobico': [300, 1200], 'alactico': [400, 1500], 'piernas': [500, 1500], 'virajes': [500, 1500] };
  sembrarCatalogo([]).forEach((t) => {
    const clave = t.id.replace(/^tc-/, '');
    if (obj[clave]) { t.min = obj[clave][0]; t.max = obj[clave][1]; }
    out.TiposCarga.push(cleanRow('TiposCarga', filaTipo(t)));
  });

  // Entrenamientos: from 3 weeks ago to next week
  const today = reloj(); today.setHours(0, 0, 0, 0);
  const monday = addDays(today, -((today.getDay() + 6) % 7));
  const enfoques = ['Resistencia aeróbica', 'Velocidad y salidas', 'Técnica de viraje', 'Trabajo de piernas', 'Series mixtas', 'Fuerza en seco'];
  const tipoDe = { 'Resistencia aeróbica': 'Aeróbico medio / Umbral anaeróbico', 'Velocidad y salidas': 'Aláctico / Sprint', 'Técnica de viraje': 'Virajes/volteos', 'Trabajo de piernas': 'Piernas', 'Series mixtas': 'Aeróbico intenso / Potencia aeróbica', 'Fuerza en seco': 'Anaeróbico / Tolerancia al lactato' };
  let ne = 0;
  const sesiones = [];
  for (let w = -3; w <= 1; w++) {
    grupos.forEach((g) => {
      g.dias.forEach((dow) => {
        const fecha = addDays(monday, w * 7 + (dow - 1));
        const f = ymd(fecha);
        const enfoque = enfoques[(ne + g.dias.length) % enfoques.length];
        const vol = Math.round((g.base * (0.9 + rnd() * 0.3)) / 100) * 100;
        const id = 'e' + String(++ne).padStart(3, '0');
        const pasada = fecha < today;
        out.Entrenamientos.push({
          id, fecha: f, hora: g.hora, duracionMin: g.dur, grupoId: g.id, titulo: `${g.nombre} - ${enfoque}`,
          descripcion: `Calentamiento 400 m, parte principal de ${enfoque.toLowerCase()}, vuelta a la calma.`,
          estado: pasada ? 'realizado' : 'planificado', piscina: g.piscina,
          volumenMin: Math.round(vol * 0.9 / 100) * 100, volumenMax: Math.round(vol * 1.1 / 100) * 100, enfoque,
        });
        sesiones.push({ id, fecha: f, pasada, hoy: ymd(fecha) === ymd(today), g, vol, tipo: tipoDe[enfoque] });
        Object.assign(out.Entrenamientos[out.Entrenamientos.length - 1], { tipoSesion: '', materialDia: '', notasGenerales: '' });
        if (!pasada) { // today's and upcoming sessions: realistic detailed plan (see domain/entreno.js)
          const plan = planDemo(ne, vol, g.dur);
          Object.assign(out.Entrenamientos[out.Entrenamientos.length - 1], { tipoSesion: plan.tipoSesion, materialDia: plan.materialDia, notasGenerales: plan.notasGenerales });
          plan.lineas.forEach((l, i) => out.EntrenoLineas.push(cleanRow('EntrenoLineas', { ...serializarLinea(l), id: 'el' + id + '-' + (i + 1), entrenamientoId: id })));
        }
      });
    });
  }

  // Attendance (Asistencia) and loads (Cargas)
  let na = 0, nc = 0;
  sesiones.forEach((s) => {
    if (!s.pasada && !s.hoy) return;
    out.Nadadores.filter((n) => n.grupoId === s.g.id).forEach((n) => {
      const r = rnd();
      let estado = r < 0.84 ? 'presente' : r < 0.92 ? 'justificado' : 'ausente';
      if (s.hoy && rnd() < 0.3) return; // today: some unconfirmed
      out.Asistencia.push({ id: 'a' + (++na), entrenamientoId: s.id, nadadorId: n.id, estado, nota: estado === 'justificado' ? 'Avisa la familia' : '' });
      if (estado === 'presente' && s.pasada) {
        out.Cargas.push({
          id: 'c' + (++nc), entrenamientoId: s.id, nadadorId: n.id, fecha: s.fecha,
          metros: Math.round((s.vol * (0.85 + rnd() * 0.3)) / 50) * 50, rpe: 4 + Math.floor(rnd() * 5),
          minutos: s.g.dur, tipo: s.tipo, notas: '',
        });
      }
    });
  });

  // Marks (times in ms)
  const pruebas = [['50 Libre', 28500], ['100 Libre', 62000], ['50 Espalda', 33000], ['100 Braza', 80000], ['50 Mariposa', 31000], ['200 Estilos', 150000]];
  const mult = { 'Pre-Benjamín': 1.45, 'Benjamín': 1.3, 'Alevín': 1.2, 'Infantil': 1.08, 'Junior': 1.0, 'Absoluto': 0.97, 'Master': 1.12 };
  // Club swimsuit catalogue: 2 training suits and 3 technical (fast skin) competition suits.
  [
    ['bn1', 'entrenamiento', 'Speedo', 'Endurance+'], ['bn2', 'entrenamiento', 'Arena', 'Solid'],
    ['bn3', 'competicion', 'Arena', 'Powerskin Carbon Core FX'], ['bn4', 'competicion', 'Speedo', 'Fastskin LZR Pure Intent'], ['bn5', 'competicion', 'Mizuno', 'GX Sonic V'],
  ].forEach(([id, tipo, marca, modelo]) => out.Banadores.push({ id, tipo, marca, modelo, activo: 'true', notas: '' }));
  const entreno = out.Banadores.filter((b) => b.tipo === 'entrenamiento');
  const tecnicos = out.Banadores.filter((b) => b.tipo === 'competicion');
  // Four competitions and, as a fifth option, a control test in training (no competition, training suit).
  const comps = ['Trofeo Ciudad de Gijón', 'Campeonato Asturias', 'Copa Federación', 'Torneo Lugones', ''];
  let nm = 0;
  out.Nadadores.forEach((n) => {
    const ps = [0, 1, 2, 3, 4, 5].sort(() => rnd() - 0.5).slice(0, 3);
    ps.forEach((pi) => {
      for (let k = 0; k < 2; k++) { // two marks: the recent one improves the previous one
        const fecha = addDays(today, -(k === 0 ? 20 + Math.floor(rnd() * 40) : 150 + Math.floor(rnd() * 120)));
        const base = pruebas[pi][1] * mult[n.categoria] * (n.sexo === 'F' ? 1.04 : 1) * (0.96 + rnd() * 0.08) * (k === 0 ? 1 : 1.04);
        const comp = pick(comps);
        // Suit consistent with the mark: technical in competition, training suit in tests; some mark without a recorded suit.
        const banador = nm % 7 === 6 ? null : (comp ? tecnicos : entreno)[nm % (comp ? tecnicos : entreno).length];
        out.Marcas.push({
          id: 'm' + (++nm), nadadorId: n.id, fecha: ymd(fecha), prueba: pruebas[pi][0], piscina: pi === 5 ? '50' : pick(['25', '50']),
          tiempoMs: Math.round(base / 10) * 10, competicion: comp, notas: comp ? '' : 'Test de control', banadorId: banador ? banador.id : '',
        });
      }
    });
  });

  // Pool planning: a 6-lane pool and recurring assignments consistent with the groups.
  // No error-level conflicts (only one intentional warning: a support session without a coach).
  const horario = JSON.stringify({ 1: { abre: '07:00', cierra: '22:00' }, 2: { abre: '07:00', cierra: '22:00' }, 3: { abre: '07:00', cierra: '22:00' }, 4: { abre: '07:00', cierra: '22:00' }, 5: { abre: '07:00', cierra: '22:00' }, 6: { abre: '09:00', cierra: '22:00' }, 7: null });
  out.Piscinas.push({ id: 'p1', nombre: 'Piscina Lugones', longitudM: 25, numCalles: 6, intervaloMin: 30, maxPorCalle: 8, horario });
  const calles = { g1: [1, 2], g2: [3, 4], g3: [1, 3], g4: [1, 4] };
  let np = 0;
  grupos.forEach((g) => g.dias.forEach((dow) => {
    const ini = Number(g.hora.slice(0, 2)) * 60 + Number(g.hora.slice(3));
    const hm = (m) => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
    out.AsignacionesCalle.push({
      id: 'ac' + (++np), piscinaId: 'p1', dia: dow, fecha: '', horaInicio: g.hora, horaFin: hm(ini + g.dur),
      calleDesde: calles[g.id][0], calleHasta: calles[g.id][1], grupoId: g.id, entrenadorId: g.entrenador, notas: '',
    });
  }));
  out.AsignacionesCalle.push({ id: 'ac' + (++np), piscinaId: 'p1', dia: 6, fecha: '', horaInicio: '10:00', horaFin: '11:00', calleDesde: 5, calleHasta: 6, grupoId: 'g1', entrenadorId: '', notas: 'Refuerzo (falta asignar entrenador)' });

  // Season planning: phases, weeks with planned volume and events (see domain/temporada.js)
  const demoTemp = temporadaDemo({ hoy: ymd(today), grupoId: 'g3', tipos: out.TiposCarga.map(normalizarTipo), desdeFecha: ymd(addDays(monday, -21)) });
  out.Temporadas.push(cleanRow('Temporadas', demoTemp.temporada));
  demoTemp.fases.forEach((f) => out.Fases.push(cleanRow('Fases', f)));
  demoTemp.semanas.forEach((s) => out.SemanasPlan.push(cleanRow('SemanasPlan', s)));
  demoTemp.eventos.forEach((e) => out.EventosTemporada.push(cleanRow('EventosTemporada', e)));

  // Comunicaciones
  out.Comunicaciones.push(
    { id: 'k1', fecha: ymd(addDays(today, -1)), titulo: 'Horarios de la próxima semana', texto: 'Se mantienen los horarios habituales. Recordad traer gorro y gafas.', grupoId: '', autor: 'Dirección técnica' },
    { id: 'k2', fecha: ymd(addDays(today, -4)), titulo: 'Competición en Gijón', texto: 'Salida en autobús a las 8:00 desde la piscina de Lugones.', grupoId: 'g3', autor: 'Marta Valdés' },
    { id: 'k3', fecha: ymd(addDays(today, -9)), titulo: 'Entrega de bañadores', texto: 'Quien tenga el bañador pendiente puede recogerlo en secretaría.', grupoId: '', autor: 'Secretaría' },
  );

  return { db: out, club: clubObj };
}

export default store;
