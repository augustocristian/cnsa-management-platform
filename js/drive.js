// Google Drive REST (scope drive.file): carpeta 'cnl' con un .xlsx por club.
import { auth } from './auth.js';
import { DRIVE_FOLDER } from './config.js';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
let folderId = null;

// fetch con token; reintenta una vez si el token ha caducado (401).
async function gfetch(url, opts = {}, retry = true) {
  const token = await auth.ensureToken();
  if (!token) { const e = new Error('Sin sesión de Google'); e.status = 401; throw e; }
  const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
  const r = await fetch(url, Object.assign({}, opts, { headers }));
  if (r.status === 401 && retry) { auth.invalidate(); return gfetch(url, opts, false); }
  if (!r.ok) {
    const e = new Error('Drive ' + r.status + ': ' + (await r.text()).slice(0, 200));
    e.status = r.status;
    throw e;
  }
  return r;
}

const q = (s) => s.replace(/'/g, "\\'");

export const drive = {
  // Devuelve el id de la carpeta (la crea si no existe).
  async ensureFolder(name = DRIVE_FOLDER) {
    if (folderId && name === DRIVE_FOLDER) return folderId;
    const query = `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    const r = await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`);
    const found = (await r.json()).files || [];
    let id = found.length ? found[0].id : null;
    if (!id) {
      const c = await gfetch(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME }),
      });
      id = (await c.json()).id;
    }
    if (name === DRIVE_FOLDER) folderId = id;
    return id;
  },

  // Lista de clubes: [{id, name, modified}]
  async listClubs() {
    const fid = await drive.ensureFolder();
    const query = `'${fid}' in parents and trashed=false and name contains '.xlsx'`;
    const r = await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name,modifiedTime)&orderBy=name&pageSize=100`);
    return ((await r.json()).files || []).map((f) => ({ id: f.id, name: f.name.replace(/\.xlsx$/i, ''), modified: f.modifiedTime }));
  },

  // Crea el fichero vacío del club y devuelve {id, name}. El store lo rellena al iniciar.
  async createClub(name) {
    const fid = await drive.ensureFolder();
    const r = await gfetch(`${API}/files?fields=id,name`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name + '.xlsx', mimeType: XLSX_MIME, parents: [fid] }),
    });
    const f = await r.json();
    return { id: f.id, name };
  },

  // Descarga el contenido como ArrayBuffer (vacío si el fichero es nuevo).
  async download(fileId) {
    const r = await gfetch(`${API}/files/${encodeURIComponent(fileId)}?alt=media`);
    return r.arrayBuffer();
  },

  // Sustituye el contenido del fichero.
  async upload(fileId, blob) {
    await gfetch(`${UPLOAD}/files/${encodeURIComponent(fileId)}?uploadType=media`, {
      method: 'PATCH',
      headers: { 'Content-Type': XLSX_MIME },
      body: blob,
    });
  },
};

export default drive;
