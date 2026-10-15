// Google Drive API v3 con el ÚNICO scope drive.file (la app sólo ve los ficheros que ella misma crea).
// Todo vive en la carpeta 'cnl' del Drive del usuario:
//   cnl/<NombreClub>.json   datos del club ({version, club, hojas}) - uno por club
//   cnl/preferencias.json   preferencias del usuario
//   cnl/entrenos/           PDFs de entrenamientos (y copias .xlsx en cnl/)
// Si el usuario ya tenía una carpeta 'cnl' creada a mano, la app crea y usa la suya (drive.file no ve la otra).
import { auth } from './auth.js';
import { DRIVE_FOLDER, PREFS_FILE } from './config.js';
import { clasificarErrorApi } from './domain/erroresGoogle.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const JSON_MIME = 'application/json';
const FILE_FIELDS = 'id,name,modifiedTime,md5Checksum';
const folderIds = new Map(); // 'padre/nombre' -> id (caché de la sesión)
let prefsFileId = null;

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const rev = (f) => (f && (f.md5Checksum || f.modifiedTime)) || '';

// Error con `status` HTTP, `code` estable (domain/erroresGoogle.js) o `offline` si no hay red.
function httpError(status, body) {
  const c = clasificarErrorApi(status, body);
  let detail = '';
  try { detail = JSON.parse(body).error.message || ''; } catch (e) { detail = String(body || '').slice(0, 160); }
  const msg = {
    'sesion-caducada': 'La sesión de Google ha caducado. Vuelve a iniciar sesión.',
    'sin-permiso': 'Google ha denegado el acceso a tu Drive. Vuelve a iniciar sesión y acepta el permiso de archivos.',
    'no-encontrado': 'No se encuentra el fichero en tu Drive (¿borrado o movido a la papelera?).',
    'limite': 'Google limita las peticiones: espera un momento y reintenta.',
    'api-desactivada': 'La API de Google Drive no está activada en el proyecto de Google Cloud.',
  }[c.codigo] || 'Error de Google ' + status;
  const e = new Error(msg + (detail && status !== 401 ? ' [' + detail + ']' : ''));
  e.status = status;
  e.code = c.codigo;
  if (c.enlace) e.enlace = c.enlace;
  return e;
}

const offlineError = () => Object.assign(new Error('Sin conexión'), { offline: true, code: 'sin-conexion' });

// fetch con token; si caduca (401) lo renueva una vez.
async function gfetch(url, opts = {}, retry = true) {
  const token = await auth.ensureToken();
  if (!token) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw offlineError();
    const e = new Error('Sin sesión de Google. Inicia sesión.'); e.status = 401; e.code = 'sesion-caducada'; throw e;
  }
  const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
  let r;
  try { r = await fetch(url, Object.assign({}, opts, { headers })); }
  catch (err) { throw offlineError(); }
  if (r.status === 401 && retry) { auth.invalidate(); return gfetch(url, opts, false); }
  if (!r.ok) throw httpError(r.status, await r.text());
  return r;
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

export const drive = {
  fileUrl(id) { return 'https://drive.google.com/file/d/' + id + '/view'; },
  folderUrl(id) { return 'https://drive.google.com/drive/folders/' + id; },

  // Devuelve el id de la carpeta (la crea si no existe; si hay varias iguales usa la más antigua: no se duplica).
  async ensureFolder(name = DRIVE_FOLDER, parentId = 'root') {
    const k = parentId + '/' + name;
    if (folderIds.has(k)) return folderIds.get(k);
    // La carpeta raíz 'cnl' se busca en todo el Drive (con drive.file sólo se ven las creadas por la app; así se encuentra aunque el usuario la haya movido).
    const enPadre = parentId === 'root' ? '' : ` and '${q(parentId)}' in parents`;
    const query = `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false${enPadre}`;
    const r = await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive&pageSize=10`);
    const found = (await r.json()).files || [];
    let id = found.length ? found[0].id : null;
    if (!id) id = (await (await jsonReq(`${API}/files?fields=id`, { name, mimeType: FOLDER_MIME, parents: [parentId] })).json()).id;
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
    return f ? { id: f.id, name: f.name, rev: rev(f), modifiedTime: f.modifiedTime } : null;
  },

  // Crea o actualiza (si se da `id`) un fichero. contenido = string | Blob. -> {id,name,rev}
  async upload({ name, mimeType = JSON_MIME, body, parentId, id, appProperties }) {
    if (id) {
      const r = await gfetch(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': mimeType }, body });
      const f = await r.json();
      return { id: f.id, name: f.name, rev: rev(f) };
    }
    const meta = { name, parents: [parentId || (await drive.ensureFolder())] };
    if (appProperties) meta.appProperties = appProperties;
    const m = multipart(meta, mimeType, body);
    const r = await gfetch(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, { method: 'POST', headers: m.headers, body: m.body });
    const f = await r.json();
    return { id: f.id, name: f.name, rev: rev(f) };
  },

  async renameFile(id, name) {
    await jsonReq(`${API}/files/${encodeURIComponent(id)}?fields=id`, { name }, 'PATCH');
  },

  // Manda el fichero a la papelera de Drive.
  async deleteFile(id) {
    await jsonReq(`${API}/files/${encodeURIComponent(id)}?fields=id`, { trashed: true }, 'PATCH');
  },

  // Clubes del usuario: los .json marcados como club dentro de 'cnl' (drive.file sólo ve los creados por la app).
  // -> [{id, name, url, modified, rev}]
  async listClubs() {
    const fid = await drive.ensureFolder();
    const query = `'${q(fid)}' in parents and trashed=false and appProperties has { key='cnl' and value='club' }`;
    const j = await (await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(${FILE_FIELDS})&spaces=drive&pageSize=100`)).json();
    return (j.files || [])
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
  async renameClub(id, nombre) { await drive.renameFile(id, jsonName(nombre)); },

  // Metadatos baratos para detectar cambios de otro dispositivo -> {rev, modifiedTime, name}
  async meta(id) {
    const f = await (await gfetch(`${API}/files/${encodeURIComponent(id)}?fields=${FILE_FIELDS},trashed`)).json();
    if (f.trashed) throw Object.assign(new Error('El club está en la papelera de Drive.'), { status: 404, code: 'no-encontrado' });
    return { rev: rev(f), modifiedTime: f.modifiedTime, name: String(f.name || '').replace(/\.json$/i, '') };
  },

  // Lee el fichero del club -> {doc, rev, name}
  async read(id) {
    const m = await drive.meta(id);
    const r = await gfetch(`${API}/files/${encodeURIComponent(id)}?alt=media`);
    let doc;
    try { doc = JSON.parse(await r.text()); } catch (e) { throw new Error('El fichero del club no es un JSON válido.'); }
    return { doc, rev: m.rev, name: m.name };
  },

  // Escribe el fichero del club (sobrescribe el contenido) -> {rev}
  async write(id, doc) {
    const f = await drive.upload({ id, body: JSON.stringify(doc) });
    return { rev: f.rev };
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

  // Olvida cachés internas (al cerrar sesión).
  reset() { folderIds.clear(); prefsFileId = null; },
};

export default drive;
