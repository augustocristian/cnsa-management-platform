// Google Sheets API v4 (+ Drive API, scope drive.file): una hoja de cálculo compartida por club,
// con una pestaña por entidad (fila 1 = cabeceras de schema.js). Carpeta 'cnl' en Drive del propietario.
import { auth } from './auth.js';
import { DRIVE_FOLDER } from './config.js';
import { SHEETS } from './schema.js';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const API = 'https://www.googleapis.com/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const CLUBS_KEY = 'cnl:clubs';
let folderId = null;

const TAB_NAMES = Object.keys(SHEETS);
const quote = (name) => "'" + name.replace(/'/g, "''") + "'";

// Error con mensaje claro y `status` HTTP (o `offline` si no hay red).
function httpError(status, body) {
  let detail = '';
  try { detail = JSON.parse(body).error.message || ''; } catch (e) { detail = String(body || '').slice(0, 160); }
  const msg = {
    401: 'La sesión de Google ha caducado. Vuelve a iniciar sesión.',
    403: 'No tienes permiso sobre esta hoja. Pide al propietario que la comparta contigo como editor (o revisa que las APIs de Sheets y Drive estén activadas).',
    404: 'No se encuentra la hoja de cálculo (¿enlace incorrecto o sin acceso?).',
    429: 'Google limita las peticiones: espera un momento y reintenta.',
  }[status] || 'Error de Google ' + status;
  const e = new Error(msg + (detail && status !== 401 ? ' [' + detail + ']' : ''));
  e.status = status;
  return e;
}

// fetch con token; si caduca (401) lo renueva una vez.
async function gfetch(url, opts = {}, retry = true) {
  const token = await auth.ensureToken();
  if (!token) { const e = new Error('Sin sesión de Google. Inicia sesión.'); e.status = 401; throw e; }
  const headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
  let r;
  try { r = await fetch(url, Object.assign({}, opts, { headers })); }
  catch (err) { const e = new Error('Sin conexión'); e.offline = true; throw e; }
  if (r.status === 401 && retry) { auth.invalidate(); return gfetch(url, opts, false); }
  if (!r.ok) throw httpError(r.status, await r.text());
  return r;
}

const jsonPost = (url, body, method = 'POST') => gfetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const q = (s) => s.replace(/'/g, "\\'");

// ---- Lista local de clubes conocidos (creados o a los que se ha unido el usuario) ----
function readKnown() {
  try { const l = JSON.parse(localStorage.getItem(CLUBS_KEY) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; }
}
function writeKnown(list) { try { localStorage.setItem(CLUBS_KEY, JSON.stringify(list)); } catch (e) { /* ignorar */ } }
function remember(club) {
  const list = readKnown().filter((c) => c.id !== club.id);
  list.push({ id: club.id, name: club.name });
  writeKnown(list);
}

export const drive = {
  // Extrae el ID de una URL docs.google.com/spreadsheets/d/<id>/... o de un ID suelto; null si no vale.
  parseSheetId(input) {
    const s = String(input || '').trim();
    const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/.exec(s);
    if (m) return m[1];
    return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : null;
  },

  sheetUrl(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit'; },

  // Devuelve el id de la carpeta (la crea si no existe).
  async ensureFolder(name = DRIVE_FOLDER) {
    if (folderId && name === DRIVE_FOLDER) return folderId;
    const query = `name='${q(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
    const r = await gfetch(`${API}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`);
    const found = (await r.json()).files || [];
    let id = found.length ? found[0].id : null;
    if (!id) id = (await (await jsonPost(`${API}/files?fields=id`, { name, mimeType: FOLDER_MIME })).json()).id;
    if (name === DRIVE_FOLDER) folderId = id;
    return id;
  },

  // Clubes conocidos en este dispositivo a los que aún se tiene acceso: [{id, name, url}]
  async listClubs() {
    const known = readKnown();
    const res = await Promise.all(known.map(async (c) => {
      try {
        const r = await gfetch(`${SHEETS_API}/${encodeURIComponent(c.id)}?fields=properties.title`);
        return { id: c.id, name: (await r.json()).properties.title || c.name, url: drive.sheetUrl(c.id) };
      } catch (e) {
        if (e.status === 404) return { gone: c.id };      // borrada
        if (e.status === 403) return null;                  // sin acceso (otra cuenta / revocado): se oculta
        if (e.status === 401) throw e;
        return { id: c.id, name: c.name, url: drive.sheetUrl(c.id), unverified: true }; // offline u otro fallo
      }
    }));
    const gone = res.filter((x) => x && x.gone).map((x) => x.gone);
    if (gone.length) writeKnown(known.filter((c) => !gone.includes(c.id)));
    return res.filter((x) => x && !x.gone).sort((a, b) => a.name.localeCompare(b.name));
  },

  // Crea la hoja del club con todas las pestañas y cabeceras, la guarda en la carpeta 'cnl' y la recuerda.
  async createClub(name) {
    const sheets = TAB_NAMES.map((t, i) => ({
      properties: { sheetId: i, title: t, gridProperties: { frozenRowCount: 1 } },
      data: [{ startRow: 0, startColumn: 0, rowData: [{ values: SHEETS[t].map((c) => ({ userEnteredValue: { stringValue: c }, userEnteredFormat: { textFormat: { bold: true } } })) }] }],
    }));
    const r = await jsonPost(`${SHEETS_API}?fields=spreadsheetId,properties.title`, { properties: { title: name }, sheets });
    const id = (await r.json()).spreadsheetId;
    try { // mover a la carpeta 'cnl' (si falla se queda en la raíz del Drive)
      const fid = await drive.ensureFolder();
      const meta = await (await gfetch(`${API}/files/${encodeURIComponent(id)}?fields=parents`)).json();
      const remove = (meta.parents || []).join(',');
      await gfetch(`${API}/files/${encodeURIComponent(id)}?addParents=${encodeURIComponent(fid)}${remove ? '&removeParents=' + encodeURIComponent(remove) : ''}&fields=id`, { method: 'PATCH' });
    } catch (e) { if (e.status === 401) throw e; console.warn('No se pudo mover a la carpeta cnl', e); }
    remember({ id, name });
    return { id, name, url: drive.sheetUrl(id), owner: auth.user ? auth.user.email : '' };
  },

  // Une al usuario a un club compartido (URL o ID de la hoja): valida acceso y lo guarda en la lista local.
  async joinClub(input) {
    const id = drive.parseSheetId(input);
    if (!id) throw new Error('No parece un enlace ni un ID de Google Sheets.');
    const r = await gfetch(`${SHEETS_API}/${encodeURIComponent(id)}?fields=properties.title,sheets.properties.title`);
    const j = await r.json();
    const titles = (j.sheets || []).map((s) => s.properties.title);
    if (!titles.includes('Club') || !titles.includes('Nadadores')) throw new Error('Esa hoja no es un club de CNL Plataforma (faltan las pestañas Club/Nadadores).');
    const name = j.properties.title;
    remember({ id, name });
    return { id, name, url: drive.sheetUrl(id) };
  },

  // Olvida un club de la lista local (no borra nada en Google).
  forgetClub(id) { writeKnown(readKnown().filter((c) => c.id !== id)); },

  // Lee todas las pestañas: {title, tabs: {Nombre: [[celdas]...]}}. Las pestañas ausentes quedan vacías.
  async read(id) {
    const base = `${SHEETS_API}/${encodeURIComponent(id)}`;
    const meta = await (await gfetch(`${base}?fields=properties.title,sheets.properties.title`)).json();
    const have = new Set((meta.sheets || []).map((s) => s.properties.title));
    const names = TAB_NAMES.filter((t) => have.has(t));
    const tabs = {};
    if (names.length) {
      const qs = names.map((n) => 'ranges=' + encodeURIComponent(quote(n))).join('&');
      const j = await (await gfetch(`${base}/values:batchGet?${qs}&majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`)).json();
      (j.valueRanges || []).forEach((vr, i) => { tabs[names[i]] = vr.values || []; });
    }
    return { title: meta.properties.title, tabs };
  },

  // Escribe todas las pestañas (tabs = {Nombre: [[cabeceras],[fila]...]}): crea las que falten, amplía la
  // cuadrícula si hace falta, sobrescribe valores y limpia las filas sobrantes.
  async write(id, tabs) {
    const base = `${SHEETS_API}/${encodeURIComponent(id)}`;
    const meta = await (await gfetch(`${base}?fields=sheets.properties(sheetId,title,gridProperties)`)).json();
    const byTitle = new Map((meta.sheets || []).map((s) => [s.properties.title, s.properties]));
    const names = Object.keys(tabs);
    const requests = [];
    names.forEach((n) => {
      const rows = tabs[n].length;
      const cols = Math.max(1, ...tabs[n].map((r) => r.length));
      const p = byTitle.get(n);
      if (!p) requests.push({ addSheet: { properties: { title: n, gridProperties: { rowCount: Math.max(rows + 50, 100), columnCount: Math.max(cols, 5), frozenRowCount: 1 } } } });
      else {
        const g = p.gridProperties || {};
        if ((g.rowCount || 0) < rows + 1 || (g.columnCount || 0) < cols) {
          requests.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { rowCount: Math.max(g.rowCount || 0, rows + 50), columnCount: Math.max(g.columnCount || 0, cols) } }, fields: 'gridProperties.rowCount,gridProperties.columnCount' } });
        }
      }
    });
    if (requests.length) await jsonPost(`${base}:batchUpdate`, { requests });
    // Primero se sobrescribe, luego se limpia la cola: nunca queda la hoja vacía a mitad de escritura.
    await jsonPost(`${base}/values:batchUpdate`, {
      valueInputOption: 'RAW',
      data: names.map((n) => ({ range: quote(n) + '!A1', majorDimension: 'ROWS', values: tabs[n] })),
    });
    await jsonPost(`${base}/values:batchClear`, { ranges: names.map((n) => `${quote(n)}!A${tabs[n].length + 1}:ZZ`) });
  },

  // Comparte la hoja con un email (rol writer por defecto). Sólo funciona si la hoja la creó esta app con esa cuenta.
  async shareWithEmail(id, email, role = 'writer') {
    const em = String(email || '').trim();
    if (!/^[^@\s]+@[^@\s]+$/.test(em)) throw new Error('Email no válido.');
    try {
      await jsonPost(`${API}/files/${encodeURIComponent(id)}/permissions?sendNotificationEmail=true`, { type: 'user', role, emailAddress: em });
    } catch (e) {
      if (e.status === 403 || e.status === 404) e.message = 'No se pudo compartir desde la app (sólo el creador de la hoja puede). Compártela desde Google Drive con ' + em + '.';
      throw e;
    }
  },
};

export default drive;
