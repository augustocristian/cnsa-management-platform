// Resilience of js/infrastructure/drive.js and js/infrastructure/driveConnection.js: deadlines, retries with exponential backoff / Retry-After, Drive quota,
// Drive version, revisions, non-duplicated cnl folder, pagination and memory-only token. Simulated fetch, no network.
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp, appUrl } from '../helpers/env.js';

setupEnv();
const { drive, nombreBackup, esperaReintento } = await importApp('js/infrastructure/drive.js');
const { driveConnection: auth } = await importApp('js/infrastructure/driveConnection.js');
const config = await importApp('js/infrastructure/config.js');
// Isolated copy of driveConnection.js (other files in the same process may have replaced the shared instance's methods with the simulator)
const { driveConnection: authReal } = await import(appUrl('js/infrastructure/driveConnection.js') + '?aislado');

const prev = { fetch: globalThis.fetch };
const authOriginal = { ensureToken: auth.ensureToken, invalidate: auth.invalidate, expired: auth.expired };
let calls;
let handler;
let esperas;

const resp = (obj, status = 200, headers = {}) => ({
  ok: status < 400, status,
  headers: { get: (k) => headers[k] ?? null },
  text: async () => (typeof obj === 'string' ? obj : JSON.stringify(obj)),
});

describe('Drive: deadlines, retries and quota', () => {
beforeEach(() => {
  drive.reset();
  calls = [];
  esperas = [];
  Object.assign(drive.config, { timeoutMs: 30000, reintentos: 3, sleep: async (ms) => { esperas.push(ms); } });
  auth.expired = false;
  auth.ensureToken = async () => 'tok';
  auth.invalidate = () => {};
  handler = () => resp({ id: 'F', name: 'X.json', md5Checksum: 'm', version: '3' });
  globalThis.fetch = async (url, opts = {}) => { calls.push({ url: String(url), method: opts.method || 'GET', signal: opts.signal }); return handler(calls[calls.length - 1], opts); };
});

// fetch that never answers but honours AbortController
const colgado = (url, opts) => new Promise((_, rej) => { opts.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))); });

test('P0-4: a request that does not answer is aborted after 30 s (here 30 ms) with code timeout', async () => {
  drive.config.timeoutMs = 30;
  drive.config.reintentos = 0;
  globalThis.fetch = colgado;
  const t0 = Date.now();
  await assert.rejects(drive.meta('F'), (e) => e.code === 'timeout' && e.timeout === true && !e.offline);
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(drive.config.timeoutMs, 30);
});

test('P0-4: a read that hangs is retried; a write (POST) is not', async () => {
  drive.config.timeoutMs = 20;
  drive.config.reintentos = 1;
  let n = 0;
  globalThis.fetch = (url, opts) => (++n === 1 ? colgado(url, opts) : Promise.resolve(resp({ id: 'F', name: 'X.json', md5Checksum: 'm' })));
  assert.equal((await drive.meta('F')).rev, 'm');
  assert.equal(n, 2);
  n = 0;
  globalThis.fetch = (url, opts) => { n++; return colgado(url, opts); };
  await assert.rejects(drive.upload({ name: 'a.json', body: '{}', parentId: 'P' }), (e) => e.code === 'timeout');
  assert.equal(n, 1, 'creating a file is not repeated when it is unknown whether it arrived');
});

test('P0-4: 429/5xx are retried with exponential backoff; Retry-After rules; in the end the error is reported', async () => {
  let n = 0;
  handler = () => (++n <= 2 ? resp({ error: { message: 'busy' } }, 503) : resp({ id: 'F', name: 'X.json', md5Checksum: 'm' }));
  assert.equal((await drive.meta('F')).rev, 'm');
  assert.equal(esperas.length, 2);
  assert.ok(esperas[0] >= 375 && esperas[0] <= 625, 'first wait ~500 ms: ' + esperas[0]);
  assert.ok(esperas[1] >= 750 && esperas[1] <= 1250, 'second wait ~1000 ms: ' + esperas[1]);
  esperas.length = 0;
  n = 0;
  handler = () => (++n === 1 ? resp({ error: {} }, 429, { 'Retry-After': '7' }) : resp({ id: 'F', name: 'X.json', md5Checksum: 'm' }));
  await drive.meta('F');
  assert.deepEqual(esperas, [7000]);
  esperas.length = 0;
  calls.length = 0;
  handler = () => resp({ error: { message: 'down' } }, 500);
  await assert.rejects(drive.meta('F'), (e) => e.status === 500);
  assert.equal(calls.length, 4, '1 attempt + 3 retries');
  assert.equal(esperas.length, 3);
  assert.ok(esperas[2] > esperas[0]);
  assert.equal(esperaReintento(0, '3'), 3000);
  assert.ok(esperaReintento(20) <= 37500, 'cap');
});

test('P0-4: the request rate limit (403 rateLimitExceeded) is retried; a full storage quota (403 storageQuotaExceeded) is NOT and has its own code', async () => {
  let n = 0;
  handler = () => (++n === 1 ? resp({ error: { message: 'rate', errors: [{ reason: 'userRateLimitExceeded' }] } }, 403) : resp({ id: 'F', name: 'X.json', md5Checksum: 'm' }));
  assert.equal((await drive.meta('F')).rev, 'm');
  calls.length = 0;
  handler = () => resp({ error: { message: 'The user\'s Drive storage quota has been exceeded.', errors: [{ reason: 'storageQuotaExceeded' }] } }, 403);
  await assert.rejects(drive.meta('F'), (e) => e.code === 'cuota-drive' && e.status === 403 && /lleno/.test(e.message));
  assert.equal(calls.length, 1, 'waiting is pointless');
});

test('P0-4: after an unsuccessful renewal a 401 marks the session as expired and notifies listeners', async () => {
  const avisos = [];
  const off = auth.onExpired((v) => avisos.push(v));
  handler = () => resp({ error: { message: 'x' } }, 401);
  await assert.rejects(drive.meta('F'), (e) => e.code === 'sesion-caducada');
  off();
  assert.deepEqual(avisos, [true]);
  assert.equal(auth.expired, true);
});

test('P0-1: meta/read/write return Drive\'s `version` (integer) and request it in fields', async () => {
  handler = (c) => (c.url.includes('alt=media') ? resp('{"version":1,"club":{},"hojas":{}}') : resp({ id: 'F', name: 'X.json', md5Checksum: c.method === 'PATCH' ? 'n' : 'v', version: c.method === 'PATCH' ? '6' : '5' }));
  assert.equal((await drive.meta('F')).version, 5);
  assert.equal((await drive.read('F')).version, 5);
  const w = await drive.write('F', { version: 1 });
  assert.equal(w.version, 6);
  assert.match(calls.find((c) => c.method === 'PATCH').url, /fields=[^&]*version/);
  assert.match(calls[0].url, /fields=[^&]*version/);
});

test('P0-1: revisionPrevia reads the revision before the last one (the one another device wrote)', async () => {
  handler = (c) => {
    if (/revisions\?/.test(c.url)) return resp({ revisions: [{ id: 'R1' }, { id: 'R2' }, { id: 'R3' }] });
    if (/revisions\/R2\?alt=media/.test(c.url)) return resp('{"version":1,"club":{"nombre":"intermediate"},"hojas":{}}');
    return resp({});
  };
  assert.equal((await drive.revisionPrevia('F')).club.nombre, 'intermediate');
  handler = () => resp({ revisions: [{ id: 'R1' }] });
  assert.equal(await drive.revisionPrevia('F'), null);
});

test('P0-3: a file that is not JSON throws code fichero-danado with the original text', async () => {
  handler = (c) => (c.url.includes('alt=media') ? resp('{ roto') : resp({ id: 'F', name: 'X.json', md5Checksum: 'm' }));
  await assert.rejects(drive.read('F'), (e) => e.code === 'fichero-danado' && e.raw === '{ roto' && /JSON válido/.test(e.message));
});

test('P2: ensureFolder does not duplicate cnl with two tabs: it searches again before creating and, if another created first, discards its own', async () => {
  let gets = 0;
  handler = (c) => {
    if (c.method === 'GET') { gets++; return resp({ files: gets >= 3 ? [{ id: 'ANTIGUA' }, { id: 'NUEVA' }] : [] }); }
    if (c.method === 'POST') return resp({ id: 'NUEVA' });
    return resp({});
  };
  assert.equal(await drive.ensureFolder(), 'ANTIGUA');
  assert.ok(gets >= 3, 'second search before creating and third after creating');
  const papelera = calls.find((c) => c.method === 'PATCH');
  assert.match(papelera.url, /files\/NUEVA/, 'the newly created (empty) folder is sent to the bin');
  // if the other instance had already created it by the second search, it is not even created
  drive.reset();
  calls.length = 0;
  gets = 0;
  handler = (c) => (c.method === 'GET' ? resp({ files: ++gets >= 2 ? [{ id: 'OTRA' }] : [] }) : resp({}));
  assert.equal(await drive.ensureFolder(), 'OTRA');
  assert.ok(!calls.some((c) => c.method === 'POST'));
});

test('P2: listClubs walks every page (more than 100 clubs)', async () => {
  handler = (c) => {
    if (c.url.includes('mimeType')) return resp({ files: [{ id: 'CNL' }] });
    if (c.url.includes('pageToken=P2')) return resp({ files: [{ id: 'C3', name: 'Tercero.json' }] });
    return resp({ files: [{ id: 'C1', name: 'Primero.json' }, { id: 'C2', name: 'Segundo.json' }], nextPageToken: 'P2' });
  };
  assert.deepEqual((await drive.listClubs()).map((c) => c.name), ['Primero', 'Segundo', 'Tercero']);
});

test('GDPR: eliminarDefinitivo uses DELETE (not the bin) and borrarRevisionesAntiguas keeps only the current one', async () => {
  handler = (c) => (/revisions\?/.test(c.url) ? resp({ revisions: [{ id: 'A' }, { id: 'B' }, { id: 'C' }] }) : resp(''));
  await drive.eliminarDefinitivo('F');
  assert.equal(calls[0].method, 'DELETE');
  calls.length = 0;
  assert.equal(await drive.borrarRevisionesAntiguas('F'), 2);
  assert.deepEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/revisions/')[1]), ['A', 'B']);
});

test('nombreBackup: <club>-YYYYMMDD.json and <club>-import-YYYYMMDDHHMMSS.json', () => {
  const f = new Date(2026, 9, 5, 14, 30, 9);
  assert.equal(nombreBackup('Club/Raro', f), 'Club-Raro-20261005.json');
  assert.equal(nombreBackup('Club', f, 'import'), 'Club-import-20261005143009.json');
});
});

describe('auth: memory-only token, a single request in flight and a deadline', () => {
let intentos;
let tc;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  intentos = 0;
  tc = null;
  config.setClientId('t-1.apps.googleusercontent.com');
  window.google = { accounts: { oauth2: { initTokenClient: () => { tc = { requestAccessToken: () => { intentos++; }, callback: null, error_callback: null }; return tc; }, revoke: () => {} } } };
  authReal.tiempos.silencioso = 40;
  await authReal.init();
  authReal.invalidate();
});
after(() => {
  delete window.google;
  config.setClientId('');
  globalThis.fetch = prev.fetch;
  authReal.expired = false;
  authReal.disconnect();
});

test('P2: simultaneous token requests share ONE; the token is not stored in sessionStorage or localStorage', async () => {
  const todas = Promise.all([authReal.ensureToken(), authReal.ensureToken(), authReal.ensureToken()]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(intentos, 1);
  tc.callback({ access_token: 'secreto-123', expires_in: 3600 });
  assert.deepEqual(await todas, ['secreto-123', 'secreto-123', 'secreto-123']);
  assert.equal(authReal.token(), 'secreto-123');
  const volcado = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
  assert.ok(!volcado.includes('secreto-123'), 'the token lives in memory only');
  assert.equal(sessionStorage.getItem('cnl:token'), null);
});

test('P0-4: if Google does not answer, the renewal times out (does not hang) and can be requested again', async () => {
  assert.equal(await authReal.ensureToken(), null, 'failed silent renewal => null');
  assert.equal(intentos, 1);
  const otra = authReal.ensureToken();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(intentos, 2, 'the hung request was released');
  tc.callback({ access_token: 'ok', expires_in: 3600 });
  assert.equal(await otra, 'ok');
});

test('P2: after expiry, reconnecting (from a click) renews the token and clears the expired-session mark', async () => {
  const avisos = [];
  const off = authReal.onExpired((v) => avisos.push(v));
  authReal.markExpired();
  authReal.markExpired();
  assert.deepEqual(avisos, [true], 'a single notification');
  const p = authReal.connect({ interactive: true });
  await new Promise((r) => setTimeout(r, 5));
  tc.callback({ access_token: 'nuevo', expires_in: 3600 });
  assert.equal(await p, true);
  assert.equal(authReal.token(), 'nuevo');
  assert.equal(authReal.state, 'connected');
  off();
  assert.deepEqual(avisos, [true, false]);
  assert.equal(authReal.expired, false);
});

test('P2: after a reload there is no token (it must be renewed) but the authorization flag stays; disconnect forgets everything', async () => {
  localStorage.setItem('cnl:drive-auth', '1');
  localStorage.setItem('cnl:user', JSON.stringify({ email: 'a@b.c', name: 'A' })); // legacy profile left by an old version
  sessionStorage.setItem('cnl:token', JSON.stringify({ access_token: 'viejo', expires: Date.now() + 1e6 }));
  await authReal.init();
  assert.equal(authReal.isConnected(), true);
  assert.equal(authReal.token(), null);
  assert.equal(sessionStorage.getItem('cnl:token'), null, 'the legacy sessionStorage token is deleted');
  assert.equal(localStorage.getItem('cnl:user'), null, 'the legacy profile is deleted');
  authReal.disconnect();
  assert.equal(authReal.isConnected(), false);
  assert.equal(localStorage.getItem('cnl:drive-auth'), null);
});
});
