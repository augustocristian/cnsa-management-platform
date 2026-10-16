// Tests de js/drive.js (Drive API v3, sólo scope drive.file) y js/sheetdata.js con fetch simulado (sin red).
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
const memStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
// Otros tests de la misma ejecución pueden definir su propio localStorage/fetch: se instala el mío por test y se restaura.
const prev = { localStorage: globalThis.localStorage, fetch: globalThis.fetch };

const { drive } = await import('../../js/drive.js');
const { auth } = await import('../../js/auth.js');
const { SHEETS, ENTITY_SHEETS } = await import('../../js/schema.js');
const { dataToDoc, docToData, hashData, mergeData, isEmptyData } = await import('../../js/sheetdata.js');
const { SCOPES } = await import('../../js/config.js');

let calls;
let handler;
let tokens;
const authOriginal = { ensureToken: auth.ensureToken, invalidate: auth.invalidate, user: auth.user };

const json = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)) });
const texto = (s) => ({ ok: true, status: 200, json: async () => JSON.parse(s), text: async () => s });

// Los hooks van en una suite propia: si fueran de raíz se aplicarían a TODOS los tests del proceso.
describe('Drive API con fetch simulado', () => {
beforeEach(() => {
  globalThis.localStorage = memStorage;
  mem.clear();
  drive.reset();
  calls = [];
  tokens = 0;
  handler = () => json({});
  auth.user = { email: 'owner@x.com' };
  auth.ensureToken = async () => 'tok' + (++tokens);
  auth.invalidate = () => {};
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: null, raw: opts.body };
    if (typeof opts.body === 'string') { try { c.body = JSON.parse(opts.body); } catch (e) { c.body = opts.body; } }
    else if (opts.body && typeof opts.body.text === 'function') c.body = await opts.body.text();
    calls.push(c);
    return handler(c);
  };
});

test('el único scope de datos es drive.file (sin Sheets API ni scopes sensibles)', () => {
  assert.equal(SCOPES, 'https://www.googleapis.com/auth/drive.file openid email profile');
  assert.ok(!/spreadsheets/.test(SCOPES));
});

test('ensureFolder reutiliza la carpeta existente (la más antigua), la crea si falta y la cachea', async () => {
  handler = (c) => (c.method === 'GET' ? json({ files: [{ id: 'F1' }, { id: 'F2' }] }) : json({}));
  assert.equal(await drive.ensureFolder(), 'F1');
  assert.equal(await drive.ensureFolder(), 'F1');
  assert.equal(calls.length, 1, 'segunda llamada desde la caché');
  const q = decodeURIComponent(calls[0].url);
  assert.match(q, /name='cnl'/);
  assert.doesNotMatch(q, /in parents/, 'la carpeta cnl se busca en todo el Drive (puede haberla movido el usuario)');
  assert.match(q, /orderBy=createdTime/);
  drive.reset();
  calls.length = 0;
  handler = (c) => (c.method === 'GET' ? json({ files: [] }) : json({ id: 'NUEVA' }));
  assert.equal(await drive.ensureFolder(), 'NUEVA');
  const post = calls.find((c) => c.method === 'POST');
  assert.deepEqual(post.body, { name: 'cnl', mimeType: 'application/vnd.google-apps.folder', parents: ['root'] });
});

test('ensureFolderPath crea cnl/entrenos dentro de cnl', async () => {
  handler = (c) => {
    if (c.method === 'GET') return json({ files: [] });
    return json({ id: c.body.name === 'cnl' ? 'CNL' : 'ENT' });
  };
  assert.equal(await drive.ensureFolderPath(['entrenos']), 'ENT');
  const creados = calls.filter((c) => c.method === 'POST').map((c) => [c.body.name, c.body.parents[0]]);
  assert.deepEqual(creados, [['cnl', 'root'], ['entrenos', 'CNL']]);
});

test('createClub crea cnl/<Club>.json marcado como club, sin tocar la API de Sheets', async () => {
  handler = (c) => {
    if (c.url.includes('/drive/v3/files?q=') && c.url.includes('mimeType')) return json({ files: [{ id: 'CNL' }] });
    if (c.url.includes('/drive/v3/files?q=')) return json({ files: [] }); // ningún fichero con ese nombre
    if (c.url.includes('uploadType=multipart')) return json({ id: 'CLUB1', name: 'Mi Club.json', md5Checksum: 'abc' });
    return json({});
  };
  const club = await drive.createClub('Mi Club');
  assert.deepEqual([club.id, club.name], ['CLUB1', 'Mi Club']);
  const up = calls.find((c) => c.url.includes('uploadType=multipart'));
  assert.equal(up.method, 'POST');
  assert.match(up.headers['Content-Type'], /^multipart\/related; boundary=/);
  assert.match(up.body, /"name":"Mi Club.json"/);
  assert.match(up.body, /"parents":\["CNL"\]/);
  assert.match(up.body, /"appProperties":\{"cnl":"club"\}/);
  assert.match(up.body, /"version":1/);
  assert.ok(calls.every((c) => !c.url.includes('sheets.googleapis.com')), 'no se usa la API de Sheets');
  assert.ok(calls.every((c) => /^Bearer tok/.test(c.headers.Authorization)));
});

test('createClub evita nombres repetidos añadiendo un número y limpia caracteres no válidos', async () => {
  let existentes = 0;
  handler = (c) => {
    if (c.url.includes('/drive/v3/files?q=') && c.url.includes('mimeType')) return json({ files: [{ id: 'CNL' }] });
    if (c.url.includes('/drive/v3/files?q=')) return json({ files: existentes++ < 1 ? [{ id: 'X', name: 'a-b.json' }] : [] });
    if (c.url.includes('uploadType=multipart')) return json({ id: 'C2', name: 'a-b (2).json' });
    return json({});
  };
  const club = await drive.createClub('a/b');
  assert.equal(club.name, 'a-b (2)');
  assert.match(calls.find((c) => c.url.includes('uploadType=multipart')).body, /"name":"a-b \(2\).json"/);
});

test('listClubs devuelve los .json marcados como club dentro de cnl, ordenados', async () => {
  handler = (c) => {
    if (c.url.includes('mimeType')) return json({ files: [{ id: 'CNL' }] });
    return json({ files: [{ id: 'B', name: 'Zeta.json', modifiedTime: '2026-10-01T10:00:00Z', md5Checksum: 'm' }, { id: 'A', name: 'Alfa.json' }] });
  };
  const l = await drive.listClubs();
  assert.deepEqual(l.map((c) => [c.id, c.name]), [['A', 'Alfa'], ['B', 'Zeta']]);
  const q = decodeURIComponent(calls[calls.length - 1].url);
  assert.match(q, /appProperties has \{ key='cnl' and value='club' \}/);
  assert.match(q, /'CNL' in parents/);
  assert.match(l[0].url, /drive\.google\.com/);
});

test('meta, read y write usan modifiedTime/md5Checksum como revisión', async () => {
  const doc = { version: 1, club: { nombre: 'X' }, hojas: { Grupos: [] } };
  handler = (c) => {
    if (c.url.includes('alt=media')) return texto(JSON.stringify(doc));
    if (c.method === 'PATCH') return json({ id: 'F', name: 'X.json', md5Checksum: 'nuevo' });
    return json({ id: 'F', name: 'X.json', md5Checksum: 'viejo', modifiedTime: '2026-10-01T00:00:00Z' });
  };
  assert.deepEqual(await drive.meta('F'), { rev: 'viejo', modifiedTime: '2026-10-01T00:00:00Z', name: 'X', version: null });
  const r = await drive.read('F');
  assert.deepEqual(r.doc, doc);
  assert.equal(r.rev, 'viejo');
  const w = await drive.write('F', doc);
  assert.equal(w.rev, 'nuevo');
  const patch = calls.find((c) => c.method === 'PATCH');
  assert.match(patch.url, /upload\/drive\/v3\/files\/F\?uploadType=media/);
  assert.equal(patch.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(patch.raw), doc);
  // sin md5 (p. ej. recién creado) se usa modifiedTime
  handler = () => json({ id: 'F', name: 'X.json', modifiedTime: 'T1' });
  assert.equal((await drive.meta('F')).rev, 'T1');
});

test('read de un fichero que no es JSON lanza un error claro; en la papelera es 404', async () => {
  handler = (c) => (c.url.includes('alt=media') ? texto('no es json') : json({ id: 'F', name: 'X.json', md5Checksum: 'm' }));
  await assert.rejects(drive.read('F'), /JSON válido/);
  handler = () => json({ id: 'F', name: 'X.json', trashed: true });
  await assert.rejects(drive.meta('F'), (e) => e.status === 404 && e.code === 'no-encontrado');
});

test('preferencias: sin fichero -> null; guardar crea cnl/preferencias.json y después lo actualiza', async () => {
  handler = (c) => {
    if (c.url.includes('mimeType')) return json({ files: [{ id: 'CNL' }] });
    if (c.url.includes('/drive/v3/files?q=')) return json({ files: [] });
    return json({ id: 'P1', name: 'preferencias.json' });
  };
  assert.equal(await drive.leerPreferencias(), null);
  await drive.guardarPreferencias({ version: 1, valores: { idioma: 'en' }, marcas: { idioma: 5 } });
  const create = calls.find((c) => c.url.includes('uploadType=multipart'));
  assert.match(create.body, /"name":"preferencias.json"/);
  assert.match(create.body, /"appProperties":\{"cnl":"prefs"\}/);
  assert.match(create.body, /"idioma": "en"/);
  calls.length = 0;
  handler = (c) => (c.url.includes('alt=media') ? texto('{"version":1,"valores":{"idioma":"en"},"marcas":{"idioma":5}}') : json({ id: 'P1', name: 'preferencias.json' }));
  assert.equal((await drive.leerPreferencias()).valores.idioma, 'en');
  await drive.guardarPreferencias({ version: 1, valores: { idioma: 'it' }, marcas: { idioma: 9 } });
  const upd = calls.find((c) => c.method === 'PATCH');
  assert.match(upd.url, /files\/P1\?uploadType=media/);
  assert.ok(!calls.some((c) => c.url.includes('uploadType=multipart')), 'no se crea un segundo fichero');
});

test('subida genérica (PDF/xlsx) a una subcarpeta con upload()', async () => {
  handler = () => json({ id: 'PDF1', name: 'sesion.pdf' });
  const f = await drive.upload({ name: 'sesion.pdf', mimeType: 'application/pdf', body: new Blob(['%PDF-1.4']), parentId: 'ENT' });
  assert.equal(f.id, 'PDF1');
  const c = calls[0];
  assert.match(c.body, /"parents":\["ENT"\]/);
  assert.match(c.body, /Content-Type: application\/pdf/);
  assert.match(c.body, /%PDF-1\.4/);
});

test('401 renueva el token y reintenta una vez; si persiste lanza 401', async () => {
  let n = 0;
  handler = () => (++n === 1 ? json({ error: { message: 'x' } }, 401) : json({ id: 'F', name: 'X.json', md5Checksum: 'm' }));
  const r = await drive.meta('F');
  assert.equal(r.rev, 'm');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok1');
  assert.equal(calls[1].headers.Authorization, 'Bearer tok2');
  handler = () => json({}, 401);
  await assert.rejects(drive.meta('F'), (e) => e.status === 401 && e.code === 'sesion-caducada');
});

test('errores típicos: API desactivada (con enlace), permisos, 404, límite y sin red', async () => {
  const cuerpoApi = { error: { code: 403, message: 'Google Drive API has not been used in project 123456 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }],
    details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', metadata: { activationUrl: 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=123456', serviceTitle: 'Google Drive API' } }] } };
  handler = () => json(cuerpoApi, 403);
  await assert.rejects(drive.meta('F'), (e) => e.status === 403 && e.code === 'api-desactivada' && /activationUrl|overview\?project=123456/.test(e.enlace || '') && /no está activada/.test(e.message));
  handler = () => json({ error: { message: 'The caller does not have permission' } }, 403);
  await assert.rejects(drive.meta('F'), (e) => e.status === 403 && e.code === 'sin-permiso' && /acceso/.test(e.message));
  handler = () => json({ error: { message: 'not found' } }, 404);
  await assert.rejects(drive.meta('F'), (e) => e.status === 404 && /No se encuentra/.test(e.message));
  handler = () => json({ error: { message: 'slow down' } }, 429);
  await assert.rejects(drive.meta('F'), (e) => e.code === 'limite');
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(drive.meta('F'), (e) => e.offline === true && e.code === 'sin-conexion');
});

test('sin token y sin red -> error offline; sin token con red -> sesión caducada', async () => {
  auth.ensureToken = async () => null;
  const nav = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    await assert.rejects(drive.meta('F'), (e) => e.offline === true);
    Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
    await assert.rejects(drive.meta('F'), (e) => e.status === 401);
  } finally {
    if (nav) Object.defineProperty(globalThis, 'navigator', nav); else delete globalThis.navigator;
  }
});

test('ya no existen compartir, unirse ni la hoja de Usuarios', () => {
  for (const k of ['joinClub', 'shareWithEmail', 'parseSheetId', 'sheetUrl', 'forgetClub']) assert.equal(drive[k], undefined, k);
  assert.ok(!('Usuarios' in SHEETS));
  assert.ok(!ENTITY_SHEETS.includes('Usuarios'));
});

test('sheetdata: documento {version, club, hojas}, ida y vuelta, logos largos sin trocear y hash estable', () => {
  const logo = 'x'.repeat(95000);
  const data = docToData(dataToDoc({ db: { Grupos: [{ id: 'g1', nombre: 'A', categoria: '', entrenador: '', extra: 'no' }] }, club: { nombre: 'CNL', logo } }));
  assert.equal(data.club.logo, logo);
  assert.equal(data.db.Grupos[0].nombre, 'A');
  assert.equal('extra' in data.db.Grupos[0], false, 'sólo las columnas del esquema');
  assert.equal(hashData(data), hashData(docToData(dataToDoc(data))));
  const doc = dataToDoc(data);
  assert.equal(doc.version, 1);
  assert.deepEqual(Object.keys(doc.hojas).sort(), [...ENTITY_SHEETS].sort());
  assert.equal(isEmptyData(docToData({ version: 1, club: {}, hojas: {} })), true);
  assert.equal(isEmptyData(data), false);
});

test('sheetdata: docToData tolera basura (hojas ausentes, filas sin id, ids repetidos)', () => {
  assert.equal(isEmptyData(docToData(null)), true);
  assert.equal(isEmptyData(docToData('texto')), true);
  const d = docToData({ club: [], hojas: { Grupos: [{ nombre: 'sin id' }, null, { id: 1, nombre: 'Uno' }, { id: '1', nombre: 'Uno bis' }], Nadadores: 'mal' } });
  assert.deepEqual(d.db.Grupos.map((g) => [g.id, g.nombre]), [['1', 'Uno bis']]);
  assert.deepEqual(d.db.Nadadores, []);
});

test('sheetdata: fusión por fila sin perder cambios locales', () => {
  const mk = (grupos, club = {}) => {
    const d = docToData({});
    d.db.Grupos = grupos.map(([id, nombre]) => ({ id, nombre, categoria: '', entrenador: '' }));
    d.club = club;
    return d;
  };
  const base = mk([['1', 'uno'], ['2', 'dos'], ['3', 'tres']], { nombre: 'X' });
  const local = mk([['1', 'UNO local'], ['3', 'tres'], ['4', 'cuatro local']], { nombre: 'X', lema: 'L' }); // edita 1, borra 2, añade 4
  const remote = mk([['1', 'uno'], ['2', 'dos'], ['3', 'TRES remoto'], ['5', 'cinco remoto']], { nombre: 'X' });
  const m = mergeData(base, local, remote);
  const byId = Object.fromEntries(m.db.Grupos.map((g) => [g.id, g.nombre]));
  assert.deepEqual(byId, { 1: 'UNO local', 3: 'TRES remoto', 4: 'cuatro local', 5: 'cinco remoto' });
  assert.equal(m.club.lema, 'L');
  assert.notEqual(hashData(base), hashData(remote));
});

after(() => {
  globalThis.localStorage = prev.localStorage;
  globalThis.fetch = prev.fetch;
  auth.ensureToken = authOriginal.ensureToken;
  auth.invalidate = authOriginal.invalidate;
  auth.user = authOriginal.user;
});
});
