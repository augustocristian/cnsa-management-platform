// Google Drive API v3 con el ÚNICO scope drive.file (la app sólo ve los ficheros que ella misma crea).
// Todo vive en la carpeta 'cnl' del Drive del usuario:
//   cnl/<NombreClub>.json   datos del club ({version, club, hojas}) - uno por club
//   cnl/preferencias.json   preferencias del usuario
//   cnl/entrenos/           PDFs de entrenamientos (y copias .xlsx en cnl/)
// Si el usuario ya tenía una carpeta 'cnl' creada a mano, la app crea y usa la suya (drive.file no ve la otra).
import { driveConnection as auth } from './infrastructure/driveConnection.js';
import { DRIVE_FOLDER, PREFS_FILE } from './config.js';
import { clasificarErrorApi } from './domain/erroresGoogle.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const JSON_MIME = 'application/json';
const FILE_FIELDS = 'id,name,modifiedTime,md5Checksum,version';
const BACKUPS = 'backups';
const BACKUPS_DIARIOS = 14;
const BACKUPS_IMPORT = 5;
const folderIds = new Map(); // 'padre/nombre' -> id (caché de la sesión)
let prefsFileId = null;

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const rev = (f) => (f && (f.md5Checksum || f.modifiedTime)) || '';
const ver = (f) => { const n = Number(f && f.version); return Number.isFinite(n) && n > 0 ? n : null; };

// Network settings (tests replace them: no real waits). timeoutMs: a request that does not answer is aborted.
const net = {
  timeoutMs: 30000, reintentos: 3, esperaBaseMs: 500, esperaMaxMs: 30000,
  sleep: (ms) => new Promise((r) => { setTimeout(r, ms); }),
};

// Error con `status` HTTP, `code` estable (domain/erroresGoogle.js) o `offline` si no hay red.
function httpError(status, body) {
  const c = clasificarErrorApi(status, body);
  let detail = '';
  try { detail = JSON.parse(body).error.message || ''; } catch (e) { detail = String(body || '').slice(0, 160); }
  const msg = {
    'sesion-caducada': 'La conexión con Google Drive ha caducado. Vuelve a conectar.',
    'sin-permiso': 'Google ha denegado el acceso a tu Drive. Desconecta Drive, vuelve a conectarlo y acepta el permiso de archivos.',
    'no-encontrado': 'No se encuentra el fichero en tu Drive (¿borrado o movido a la papelera?).',
    'limite': 'Google limita las peticiones: espera un momento y reintenta.',
    'cuota-drive': 'Tu Google Drive está lleno: libera espacio para poder guardar los cambios.',
    'timeout': 'Google no responde (tiempo agotado). Reintenta en unos instantes.',
    'api-desactivada': 'La API de Google Drive no está activada en el proyecto de Google Cloud.',
  }[c.codigo] || 'Error de Google ' + status;
  const e = new Error(msg + (detail && status !== 401 ? ' [' + detail + ']' : ''));
  e.status = status;
  e.code = c.codigo;
  if (c.enlace) e.enlace = c.enlace;
  return e;
}

const offlineError = () => Object.assign(new Error('Sin conexión'), { offline: true, code: 'sin-conexion' });

const timeoutError = () => Object.assign(new Error('Google no responde (tiempo agotado).'), { timeout: true, code: 'timeout' });
const razonesDe = (body) => { try { return (JSON.parse(body).error.errors || []).map((e) => String(e.reason || '')); } catch (e) { return []; } };
// Transient error worth retrying? 429/5xx, or 403 for request rate limits (not for storage quota).
const esTransitorio = (status, body) => status === 429 || status === 500 || status === 502 || status === 503 || status === 504
  || (status === 403 && razonesDe(body).some((r) => /rateLimitExceeded|userRateLimitExceeded/i.test(r)));
// Wait before retry n (0..): Retry-After if Google gives one; otherwise exponential with some jitter.
export function esperaReintento(n, retryAfter) {
  const ra = retryAfter === null || retryAfter === undefined || retryAfter === '' ? NaN : Number(retryAfter);
  if (Number.isFinite(ra) && ra >= 0) return Math.min(ra * 1000, net.esperaMaxMs);
  const d = Math.min(net.esperaBaseMs * 2 ** n, net.esperaMaxMs);
  return Math.round(d * (0.75 + Math.random() * 0.5));
}

// ONE request with a token and a deadline. Returns a response with the body already read (text()/json()), so the deadline also covers the download.
async function pedir(url, opts, token) {
  const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
  const ctl = typeof AbortController === 'undefined' ? null : new AbortController();
  const timer = ctl ? setTimeout(() => ctl.abort(), net.timeoutMs) : null;
  try {
    const r = await fetch(url, Object.assign({}, opts, { headers }, ctl ? { signal: ctl.signal } : {}));
    const texto = await r.text();
    return { ok: r.ok, status: r.status, retryAfter: r.headers && r.headers.get ? r.headers.get('Retry-After') : null, text: async () => texto, json: async () => JSON.parse(texto) };
  } catch (err) {
    if (ctl && ctl.signal.aborted) throw timeoutError();
    throw offlineError();
  } finally { if (timer) clearTimeout(timer); }
}

// fetch with a token; if it expires (401) it renews it once; on 429/5xx it retries with exponential backoff (honouring Retry-After);
// if Google does not answer within net.timeoutMs it aborts (and only retries reads).
async function gfetch(url, opts = {}, retry = true) {
  const metodo = String(opts.method || 'GET').toUpperCase();
  for (let intento = 0; ; intento++) {
    const token = await auth.ensureToken();
    if (!token) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError();
      const e = new Error('Google Drive no está conectado. Conéctalo de nuevo.'); e.status = 401; e.code = 'sesion-caducada'; throw e;
    }
    let r;
    try { r = await pedir(url, opts, token); }
    catch (err) {
      if (err.timeout && metodo === 'GET' && intento < net.reintentos) { await net.sleep(esperaReintento(intento)); continue; }
      throw err;
    }
    if (r.status === 401 && retry) { auth.invalidate(); return gfetch(url, opts, false); }
    if (r.ok) return r;
    const body = await r.text();
    if (esTransitorio(r.status, body) && intento < net.reintentos) { await net.sleep(esperaReintento(intento, r.retryAfter)); continue; }
    const e = httpError(r.status, body);
    if (r.retryAfter != null && r.retryAfter !== '' && Number.isFinite(Number(r.retryAfter))) e.retryAfterMs = Number(r.retryAfter) * 1000;
    if (r.status === 401 && typeof auth.markExpired === 'function') auth.markExpired();
    throw e;
  }
}

const jsonReq = (url, body, method = 'POST') => gfetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Cuerpo multipart/related (metadatos JSON + contenido). `contenido` = string | Blob | ArrayBuffer.
function multipart(meta, mimeType, contenido) {
  const b = 'cnl' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mimeType}\r\n\r\n`, contenido, `\r\n--${b}--`]);
  return { body, headers: { 'Content-Type': 'multipart/related; boundary=' + b } };
}

// Nombre de fichero seguro para Drive.
const safeName = (s) => String(s || 'club').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120) || 'club';
const jsonName = (name) => safeName(name) + '.json';

const dosCifras = (n) => String(n).padStart(2, '0');
// 'Club' + date -> 'Club-20261015.json' | 'Club-import-20261015143005.json'
export function nombreBackup(nombre, fecha = new Date(), etiqueta = '') {
  const d = fecha.getFullYear() + dosCifras(fecha.getMonth() + 1) + dosCifras(fecha.getDate());
  const h = dosCifras(fecha.getHours()) + dosCifras(fecha.getMinutes()) + dosCifras(fecha.getSeconds());
  return safeName(nombre) + '-' + (etiqueta ? etiqueta + '-' + d + h : d) + '.json';
}
const escapar = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patronBackup = (nombre, etiqueta) => new RegExp('^' + escapar(safeName(nombre)) + '-' + (etiqueta ? escapar(etiqueta) + '-\\d{14}' : '\\d{8}') + '\\.json$');

export const drive = {
  config: net,
  fileUrl(id) { return 'https://drive.google.com/file/d/' + id + '/view'; },
  folderUrl(id) { return 'https://drive.google.com/drive/folders/' + id; },

  // Returns the folder id (creates it if missing; if there are several with the same name the oldest is used: never duplicated).
  // With two tabs/devices opening at once: it searches again (after a random pause) before creating and,
  // after creating, searches again: if another instance created its own first, the oldest is kept and ours (empty) is discarded.
  async ensureFolder(name = DRIVE_FOLDER, parentId = 'root') {
    const k = parentId + '/' + name;
    if (folderIds.has(k)) return folderIds.get(k);
    // La carpeta raíz 'cnl' se busca en todo el Drive (con drive.file sólo se ven las creadas por la app; así se encuentra aunque el usuario la haya movido).
    const enPadre = parentId === 'root' ? '' : ` and '${q(parentId)}' in parents`;
    const query = `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false${enPadre}`;
    const buscar = async () => {
      const r = await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive&pageSize=10`);
      return (await r.json()).files || [];
    };
    let found = await buscar();
    if (!found.length) {
      await net.sleep(Math.round(Math.random() * 250));
      found = await buscar();
    }
    let id = found.length ? found[0].id : null;
    if (!id) {
      id = (await (await jsonReq(`${API}/files?fields=id`, { name, mimeType: FOLDER_MIME, parents: [parentId] })).json()).id;
      const despues = await buscar().catch(() => []);
      const iPropia = despues.findIndex((f) => f.id === id);
      if (iPropia > 0) { // another instance created its own first: keep the oldest and discard ours (empty)
        await drive.deleteFile(id).catch(() => {});
        id = despues[0].id;
      }
    }
    folderIds.set(k, id);
    return id;
  },

  // ensureFolderPath(['entrenos']) -> id de cnl/entrenos (crea lo que falte dentro de 'cnl').
  async ensureFolderPath(partes = []) {
    let id = await drive.ensureFolder(DRIVE_FOLDER);
    for (const p of partes) id = await drive.ensureFolder(p, id);
    return id;
  },

  // Busca un fichero por nombre dentro de una carpeta -> {id,name,rev,modifiedTime}|null
  async findFile(name, parentId, { appProperty } = {}) {
    let query = `name='${q(name)}' and '${q(parentId)}' in parents and trashed=false`;
    if (appProperty) query += ` and appProperties has { key='${q(appProperty[0])}' and value='${q(appProperty[1])}' }`;
    const j = await (await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(${FILE_FIELDS})&orderBy=createdTime&spaces=drive&pageSize=5`)).json();
    const f = (j.files || [])[0];
    return f ? { id: f.id, name: f.name, rev: rev(f), modifiedTime: f.modifiedTime, version: ver(f) } : null;
  },

  // Lists the files of a folder (paginated) -> [{id,name,createdTime,modifiedTime}]
  async listFiles(parentId, { max = 1000 } = {}) {
    const out = [];
    let token = '';
    for (let n = 0; n < 50 && out.length < max; n++) {
      const query = `'${q(parentId)}' in parents and trashed=false`;
      const j = await (await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,createdTime,modifiedTime)&spaces=drive&pageSize=200${token ? '&pageToken=' + encodeURIComponent(token) : ''}`)).json();
      out.push(...(j.files || []));
      token = j.nextPageToken || '';
      if (!token) break;
    }
    return out;
  },

  // Crea o actualiza (si se da `id`) un fichero. contenido = string | Blob. -> {id,name,rev}
  async upload({ name, mimeType = JSON_MIME, body, parentId, id, appProperties }) {
    if (id) {
      const r = await gfetch(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': mimeType }, body });
      const f = await r.json();
      return { id: f.id, name: f.name, rev: rev(f), version: ver(f) };
    }
    const meta = { name, parents: [parentId || (await drive.ensureFolder())] };
    if (appProperties) meta.appProperties = appProperties;
    const m = multipart(meta, mimeType, body);
    const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, { method: 'POST', headers: m.headers, body: m.body });
    const f = await r.json();
    return { id: f.id, name: f.name, rev: rev(f), version: ver(f) };
  },

  // -> {version} (renaming also increments the file version in Drive)
  async renameFile(id, name) {
    const f = await (await jsonReq(`${API}/files/${encodeURIComponent(id)}?fields=id,version`, { name }, 'PATCH')).json().catch(() => ({}));
    return { version: ver(f) };
  },

  // Manda el fichero a la papelera de Drive.
  async deleteFile(id) {
    await jsonReq(`${API}/files/${encodeURIComponent(id)}?fields=id`, { trashed: true }, 'PATCH');
  },

  // Deletes the file PERMANENTLY (bypassing the bin): right to erasure (GDPR).
  async eliminarDefinitivo(id) {
    await gfetch(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  // Deletes the old revisions of a file (Drive keeps them ~30 days or more). Keeps the current one. -> number of revisions deleted
  async borrarRevisionesAntiguas(id) {
    const revs = await drive.revisiones(id);
    let n = 0;
    for (const r of revs.slice(0, -1)) {
      try { await gfetch(`${API}/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(r.id)}`, { method: 'DELETE' }); n++; } catch (e) { /* no se puede borrar: se informa al usuario */ }
    }
    return n;
  },

  // Clubes del usuario: los .json marcados como club dentro de 'cnl' (drive.file sólo ve los creados por la app).
  // -> [{id, name, url, modified, rev}]
  async listClubs() {
    const fid = await drive.ensureFolder();
    const query = `'${q(fid)}' in parents and trashed=false and appProperties has { key='cnl' and value='club' }`;
    const files = [];
    let token = '';
    for (let n = 0; n < 50; n++) { // paginated: more than 100 clubs are not left out
      const j = await (await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${FILE_FIELDS})&spaces=drive&pageSize=100${token ? '&pageToken=' + encodeURIComponent(token) : ''}`)).json();
      files.push(...(j.files || []));
      token = j.nextPageToken || '';
      if (!token) break;
    }
    return files
      .map((f) => ({ id: f.id, name: String(f.name || '').replace(/\.json$/i, ''), url: drive.fileUrl(f.id), modified: f.modifiedTime, rev: rev(f) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },

  // Crea el fichero del club en cnl/ (vacío: la app lo inicializa al abrirlo). -> {id, name, url, rev}
  async createClub(nombre) {
    const fid = await drive.ensureFolder();
    let name = jsonName(nombre);
    for (let n = 2; await drive.findFile(name, fid); n++) name = jsonName(nombre + ' (' + n + ')');
    const doc = { version: 1, club: {}, hojas: {} };
    const f = await drive.upload({ name, body: JSON.stringify(doc), parentId: fid, appProperties: { cnl: 'club' } });
    return { id: f.id, name: name.replace(/\.json$/i, ''), url: drive.fileUrl(f.id), rev: f.rev };
  },

  // Renombra el fichero del club (sigue al nombre del club).
  async renameClub(id, nombre) { return drive.renameFile(id, jsonName(nombre)); },

  // Cheap metadata to detect changes from another device -> {rev, modifiedTime, name, version}
  // version = Drive's monotonic integer (it grows with every change to the file): it allows detecting in-between writes.
  async meta(id) {
    const f = await (await gfetch(`${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS},trashed`)).json();
    if (f.trashed) throw Object.assign(new Error('El club está en la papelera de Drive.'), { status: 404, code: 'no-encontrado' });
    return { rev: rev(f), modifiedTime: f.modifiedTime, name: String(f.name || '').replace(/\.json$/i, ''), version: ver(f) };
  },

  // Reads the club file -> {doc, rev, version, name}. If it is not JSON it throws an error with code 'fichero-danado' and the text in .raw.
  async read(id) {
    const m = await drive.meta(id);
    const r = await gfetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    const raw = await r.text();
    let doc;
    try { doc = JSON.parse(raw); } catch (e) { throw Object.assign(new Error('El fichero del club no es un JSON válido.'), { code: 'fichero-danado', raw: String(raw).slice(0, 2000000) }); }
    return { doc, rev: m.rev, version: m.version, name: m.name };
  },

  // Writes the club file (overwrites the content) -> {rev, version}
  async write(id, doc) {
    const f = await drive.upload({ id, body: JSON.stringify(doc) });
    return { rev: f.rev, version: f.version };
  },

  // ---- Revisions (Drive history) ----
  // -> [{id, modifiedTime}] from oldest to most recent.
  async revisiones(id) {
    const out = [];
    let token = '';
    for (let n = 0; n < 20; n++) {
      const j = await (await gfetch(`${API}/files/${encodeURIComponent(id)}/revisions?fields=nextPageToken,revisions(id,modifiedTime)&pageSize=200${token ? '&pageToken=' + encodeURIComponent(token) : ''}`)).json();
      out.push(...(j.revisions || []));
      token = j.nextPageToken || '';
      if (!token) break;
    }
    return out;
  },

  async leerRevision(id, revId) {
    const r = await gfetch(`${API}/files/${encodeURIComponent(id)}/revisions/${encodeURIComponent(revId)}?alt=media`);
    try { return JSON.parse(await r.text()); } catch (e) { return null; }
  },

  // Document of the revision before the last one (the one right before our write) or null if there is none / it cannot be read.
  async revisionPrevia(id) {
    const revs = await drive.revisiones(id);
    if (revs.length < 2) return null;
    return drive.leerRevision(id, revs[revs.length - 2].id);
  },

  // ---- Backups: cnl/backups/<club>-YYYYMMDD.json (daily, the last 14 are kept) ----
  // etiqueta 'import' = copy taken before an import (cnl/backups/<club>-import-YYYYMMDDHHMMSS.json, last 5).
  // -> {id, name, creado}
  async backupClub(nombre, doc, { etiqueta = '', fecha = new Date() } = {}) {
    const fid = await drive.ensureFolderPath([BACKUPS]);
    const name = nombreBackup(nombre, fecha, etiqueta);
    const prev = await drive.findFile(name, fid);
    if (prev && !etiqueta) return { id: prev.id, name, creado: false };
    const body = JSON.stringify(doc);
    const f = await drive.upload({ name, body, parentId: fid, id: prev && prev.id, appProperties: { cnl: 'backup' } });
    // Rotation: only of this club's backups of this kind
    const re = patronBackup(nombre, etiqueta);
    const todos = (await drive.listFiles(fid)).filter((x) => re.test(x.name)).sort((a, b) => b.name.localeCompare(a.name));
    for (const viejo of todos.slice(etiqueta ? BACKUPS_IMPORT : BACKUPS_DIARIOS)) await drive.deleteFile(viejo.id).catch(() => {});
    return { id: f.id, name, creado: true };
  },

  // Backups of this club, most recent first -> [{id,name}]
  // todos: also the copies taken before an import and before a restore (needed to erase a swimmer everywhere).
  async listarBackups(nombre, { todos = false } = {}) {
    const fid = await drive.ensureFolderPath([BACKUPS]);
    const res = (todos ? ['', 'import', 'restore'] : ['']).map((e) => patronBackup(nombre, e));
    return (await drive.listFiles(fid)).filter((x) => res.some((re) => re.test(x.name))).sort((a, b) => b.name.localeCompare(a.name)).map((x) => ({ id: x.id, name: x.name }));
  },

  async leerFichero(id) {
    const r = await gfetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    return JSON.parse(await r.text());
  },

  // ---- Preferencias del usuario: cnl/preferencias.json ----
  async leerPreferencias() {
    const fid = await drive.ensureFolder();
    if (!prefsFileId) {
      const f = await drive.findFile(PREFS_FILE, fid, { appProperty: ['cnl', 'prefs'] });
      if (!f) return null;
      prefsFileId = f.id;
    }
    try {
      const r = await gfetch(`${API}/files/${encodeURIComponent(prefsFileId)}?alt=media`);
      return JSON.parse(await r.text());
    } catch (e) {
      if (e.status === 404) { prefsFileId = null; return null; }
      if (e instanceof SyntaxError) return null; // fichero corrupto: se reescribe
      throw e;
    }
  },

  async guardarPreferencias(obj) {
    const fid = await drive.ensureFolder();
    const body = JSON.stringify(obj, null, 2);
    if (!prefsFileId) {
      const f = await drive.findFile(PREFS_FILE, fid, { appProperty: ['cnl', 'prefs'] });
      if (f) prefsFileId = f.id;
    }
    if (prefsFileId) {
      try { await drive.upload({ id: prefsFileId, body }); return; } catch (e) { if (e.status !== 404) throw e; prefsFileId = null; }
    }
    prefsFileId = (await drive.upload({ name: PREFS_FILE, body, parentId: fid, appProperties: { cnl: 'prefs' } })).id;
  },

  // Puerto remoto para el servicio de preferencias.
  get preferencias() {
    return { leer: () => drive.leerPreferencias(), escribir: (o) => drive.guardarPreferencias(o) };
  },

  // Forgets internal caches (when Drive is disconnected).
  reset() { folderIds.clear(); prefsFileId = null; },
};

export default drive;
