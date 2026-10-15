// Tests de js/drive.js y js/sheetdata.js con fetch simulado (sin red).
import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
const memStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
  clear: () => mem.clear(),
};
// Otros tests de la misma ejecución pueden definir su propio localStorage/fetch: se instala el mío por test y se restaura.
const prev = { localStorage: globalThis.localStorage, fetch: globalThis.fetch, ensureToken: null };

const { drive } = await import('../../js/drive.js');
const { auth } = await import('../../js/auth.js');
const { SHEETS } = await import('../../js/schema.js');
const { dataToTabs, tabsToData, hashData, mergeData } = await import('../../js/sheetdata.js');

const ID = ' 1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789'.trim();
let calls;
let handler;
let tokens;

const json = (obj, status = 200) => ({ ok: status < 400, status, json: async () => obj, text: async () => JSON.stringify(obj) });

beforeEach(() => {
  globalThis.localStorage = memStorage;
  mem.clear();
  calls = [];
  tokens = 0;
  handler = () => json({});
  auth.user = { email: 'owner@x.com' };
  auth.ensureToken = async () => 'tok' + (++tokens);
  auth.invalidate = () => {};
  globalThis.fetch = async (url, opts = {}) => {
    const c = { url: String(url), method: opts.method || 'GET', headers: opts.headers || {}, body: opts.body ? JSON.parse(opts.body) : null };
    calls.push(c);
    return handler(c);
  };
});

test('parseSheetId extrae el ID de URLs y acepta IDs sueltos', () => {
  assert.equal(drive.parseSheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`), ID);
  assert.equal(drive.parseSheetId(`  https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing `), ID);
  assert.equal(drive.parseSheetId(ID), ID);
  assert.equal(drive.parseSheetId('hola'), null);
  assert.equal(drive.parseSheetId(''), null);
});

test('createClub crea la hoja con todas las pestañas, la mueve a cnl y la recuerda', async () => {
  handler = (c) => {
    if (c.url.startsWith('https://sheets.googleapis.com/v4/spreadsheets?')) return json({ spreadsheetId: 'NEW1234567', properties: { title: 'Mi Club' } });
    if (c.url.includes('/drive/v3/files?q=')) return json({ files: [] });
    if (c.url.includes('/drive/v3/files?fields=id')) return json({ id: 'FOLDER1' });
    if (c.url.includes('fields=parents')) return json({ parents: ['ROOT'] });
    return json({ id: 'NEW1234567' });
  };
  const club = await drive.createClub('Mi Club');
  assert.equal(club.id, 'NEW1234567');
  assert.equal(club.owner, 'owner@x.com');
  const create = calls[0];
  assert.equal(create.method, 'POST');
  assert.equal(create.headers.Authorization, 'Bearer tok1');
  assert.equal(create.body.properties.title, 'Mi Club');
  assert.deepEqual(create.body.sheets.map((s) => s.properties.title), Object.keys(SHEETS));
  const head = create.body.sheets[1].data[0].rowData[0].values.map((v) => v.userEnteredValue.stringValue);
  assert.deepEqual(head, SHEETS.Usuarios);
  const move = calls.find((c) => c.method === 'PATCH');
  assert.match(move.url, /addParents=FOLDER1/);
  assert.match(move.url, /removeParents=ROOT/);
  handler = () => json({ properties: { title: 'Mi Club' } });
  const list = await drive.listClubs();
  assert.deepEqual(list.map((c) => c.id), ['NEW1234567']);
});

test('read pide batchGet de las pestañas existentes y devuelve las filas', async () => {
  handler = (c) => {
    if (c.url.includes('values:batchGet')) {
      return json({ valueRanges: [{ values: [['clave', 'valor'], ['nombre', 'CNL']] }, { values: [['id', 'email', 'nombre', 'rol', 'nadadorId'], ['u1', 'a@b.c', 'A', 'admin']] }] });
    }
    return json({ properties: { title: 'CNL' }, sheets: [{ properties: { title: 'Club' } }, { properties: { title: 'Usuarios' } }, { properties: { title: 'Otra' } }] });
  };
  const r = await drive.read(ID);
  const bg = calls.find((c) => c.url.includes('values:batchGet'));
  assert.match(bg.url, /ranges='Club'&ranges='Usuarios'/);
  assert.doesNotMatch(bg.url, /Otra/);
  const data = tabsToData(r.tabs);
  assert.equal(data.club.nombre, 'CNL');
  assert.deepEqual(data.db.Usuarios, [{ id: 'u1', email: 'a@b.c', nombre: 'A', rol: 'admin', nadadorId: '' }]);
  assert.deepEqual(data.db.Nadadores, []);
});

test('write amplía/crea pestañas, sobrescribe en RAW y limpia la cola', async () => {
  handler = (c) => {
    if (c.method === 'GET') return json({ sheets: [{ properties: { sheetId: 0, title: 'Club', gridProperties: { rowCount: 2, columnCount: 2 } } }] });
    return json({});
  };
  const data = { db: { Nadadores: [{ id: 'n1', nombre: 'Ana' }] }, club: { nombre: 'CNL' } };
  await drive.write(ID, dataToTabs(data));
  const posts = calls.filter((c) => c.method === 'POST');
  assert.match(posts[0].url, /:batchUpdate$/);
  assert.ok(posts[0].body.requests.some((r) => r.addSheet && r.addSheet.properties.title === 'Nadadores'));
  assert.ok(posts[0].body.requests.some((r) => r.updateSheetProperties));
  const upd = posts[1];
  assert.match(upd.url, /values:batchUpdate/);
  assert.equal(upd.body.valueInputOption, 'RAW');
  const nad = upd.body.data.find((d) => d.range === "'Nadadores'!A1");
  assert.equal(nad.values[1][0], 'n1');
  assert.equal(nad.values[1][1], 'Ana');
  const clear = posts[2];
  assert.match(clear.url, /values:batchClear/);
  assert.ok(clear.body.ranges.includes("'Nadadores'!A3:ZZ"));
});

test('401 renueva el token y reintenta una vez; si persiste lanza 401', async () => {
  let n = 0;
  handler = () => (++n === 1 ? json({ error: { message: 'x' } }, 401) : json({ properties: { title: 'T' }, sheets: [] }));
  const r = await drive.read(ID);
  assert.equal(r.title, 'T');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok1');
  assert.equal(calls[1].headers.Authorization, 'Bearer tok2');
  handler = () => json({}, 401);
  await assert.rejects(drive.read(ID), (e) => e.status === 401);
});

test('403 y 404 dan mensajes claros; sin red marca offline', async () => {
  handler = () => json({ error: { message: 'The caller does not have permission' } }, 403);
  await assert.rejects(drive.read(ID), (e) => e.status === 403 && /permiso/.test(e.message) && /compart/.test(e.message));
  handler = () => json({ error: { message: 'not found' } }, 404);
  await assert.rejects(drive.read(ID), (e) => e.status === 404 && /No se encuentra/.test(e.message));
  globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(drive.read(ID), (e) => e.offline === true);
});

test('joinClub acepta URL o ID, valida acceso y guarda en la lista local', async () => {
  handler = () => json({ properties: { title: 'Club Vecino' }, sheets: [{ properties: { title: 'Club' } }, { properties: { title: 'Nadadores' } }] });
  const a = await drive.joinClub(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`);
  assert.deepEqual([a.id, a.name], [ID, 'Club Vecino']);
  assert.match(calls[0].url, new RegExp('/spreadsheets/' + ID + '\\?'));
  await drive.joinClub(ID); // repetido: no duplica
  assert.deepEqual((await drive.listClubs()).map((c) => c.id), [ID]);
  await assert.rejects(drive.joinClub('no es un enlace'), /enlace/);
  handler = () => json({}, 403);
  await assert.rejects(drive.joinClub(ID), (e) => e.status === 403);
  handler = () => json({ properties: { title: 'Otra' }, sheets: [{ properties: { title: 'Hoja 1' } }] });
  await assert.rejects(drive.joinClub('Z'.repeat(20)), /no es un club/);
});

test('listClubs oculta los sin acceso (403), olvida los borrados (404) y tolera offline', async () => {
  mem.set('cnl:clubs', JSON.stringify([{ id: 'AAAAAAAAAA', name: 'A' }, { id: 'BBBBBBBBBB', name: 'B' }, { id: 'CCCCCCCCCC', name: 'C' }]));
  handler = (c) => {
    if (c.url.includes('AAAAAAAAAA')) return json({ properties: { title: 'A' } });
    if (c.url.includes('BBBBBBBBBB')) return json({}, 403);
    return json({}, 404);
  };
  assert.deepEqual((await drive.listClubs()).map((c) => c.id), ['AAAAAAAAAA']);
  assert.deepEqual(JSON.parse(mem.get('cnl:clubs')).map((c) => c.id), ['AAAAAAAAAA', 'BBBBBBBBBB']);
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  const l = await drive.listClubs();
  assert.equal(l.length, 2);
  assert.ok(l.every((c) => c.unverified));
});

test('shareWithEmail crea un permiso writer', async () => {
  await drive.shareWithEmail(ID, ' otro@x.com ');
  const c = calls[0];
  assert.match(c.url, new RegExp('/files/' + ID + '/permissions'));
  assert.deepEqual(c.body, { type: 'user', role: 'writer', emailAddress: 'otro@x.com' });
  await assert.rejects(drive.shareWithEmail(ID, 'mal'), /Email/);
  handler = () => json({}, 404);
  await assert.rejects(drive.shareWithEmail(ID, 'a@b.c'), /desde Google Drive/);
});

test('sheetdata: ida y vuelta, logos largos troceados y fusión sin perder cambios locales', () => {
  const logo = 'x'.repeat(95000);
  const data = tabsToData(dataToTabs({ db: { Grupos: [{ id: 'g1', nombre: 'A', categoria: '', entrenador: '' }] }, club: { nombre: 'CNL', logo } }));
  assert.equal(data.club.logo, logo);
  assert.equal(data.db.Grupos[0].nombre, 'A');
  assert.equal(hashData(data), hashData(tabsToData(dataToTabs(data))));

  const mk = (grupos, club = {}) => {
    const d = tabsToData({});
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
});
