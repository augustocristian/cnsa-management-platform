// Tests for the Google Calendar client (js/infrastructure/googleCalendar.js) with a simulated fetch and no real waits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteGoogleCalendar, GoogleCalendarError } from '../../js/infrastructure/googleCalendar.js';

const resp = (status, body, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (k) => headers[k] ?? null },
  json: async () => body,
});

function montar(respuestas, extra = {}) {
  const llamadas = [];
  const esperas = [];
  const tokens = [];
  const cola = [...respuestas];
  const cliente = crearClienteGoogleCalendar({
    fetch: async (url, opts) => {
      llamadas.push({ url, ...opts });
      const r = cola.shift();
      if (r instanceof Error) throw r;
      return r;
    },
    getToken: async ({ force } = {}) => {
      tokens.push(!!force);
      return force ? 'nuevo' : 'viejo';
    },
    sleep: async (ms) => {
      esperas.push(ms);
    },
    ...extra,
  });
  return { cliente, llamadas, esperas, tokens };
}

test('insertar: POST to the primary calendar with Bearer and JSON', async () => {
  const { cliente, llamadas } = montar([resp(200, { id: 'g1' })]);
  const r = await cliente.insertar({ summary: 'x' });
  assert.equal(r.id, 'g1');
  assert.equal(llamadas[0].method, 'POST');
  assert.equal(llamadas[0].url, 'https://www.googleapis.com/calendar/v3/calendars/primary/events');
  assert.equal(llamadas[0].headers.Authorization, 'Bearer viejo');
  assert.deepEqual(JSON.parse(llamadas[0].body), { summary: 'x' });
});

test('actualizar: PATCH with status confirmed; 404 => code no-existe', async () => {
  const { cliente, llamadas } = montar([resp(200, { id: 'g1' }), resp(404, { error: { message: 'Not Found' } })]);
  await cliente.actualizar('g/1', { summary: 'y' });
  assert.equal(llamadas[0].method, 'PATCH');
  assert.ok(llamadas[0].url.endsWith('/events/g%2F1'));
  assert.equal(JSON.parse(llamadas[0].body).status, 'confirmed');
  await assert.rejects(cliente.actualizar('g2', {}), (e) => e instanceof GoogleCalendarError && e.code === 'no-existe');
});

test('borrar: DELETE 204 and an already missing event (404/410) counts as deleted', async () => {
  const { cliente, llamadas } = montar([resp(204), resp(404, {}), resp(410, {})]);
  await cliente.borrar('a');
  await cliente.borrar('b');
  await cliente.borrar('c');
  assert.deepEqual(
    llamadas.map((l) => l.method),
    ['DELETE', 'DELETE', 'DELETE'],
  );
});

test('401: refreshes the token once and retries; if it fails again => code auth', async () => {
  const a = montar([resp(401, {}), resp(200, { id: 'ok' })]);
  assert.equal((await a.cliente.insertar({})).id, 'ok');
  assert.deepEqual(a.tokens, [false, true]);
  assert.equal(a.llamadas[1].headers.Authorization, 'Bearer nuevo');
  const b = montar([resp(401, {}), resp(401, {})]);
  await assert.rejects(b.cliente.insertar({}), (e) => e.code === 'auth' && e.status === 401);
  assert.equal(b.llamadas.length, 2);
});

test('no token => code auth without calling the API', async () => {
  const { cliente, llamadas } = montar([], { getToken: async () => null });
  await assert.rejects(cliente.insertar({}), (e) => e.code === 'auth');
  assert.equal(llamadas.length, 0);
});

test('429: retries honouring Retry-After and then succeeds', async () => {
  const { cliente, llamadas, esperas } = montar([
    resp(429, { error: { message: 'slow' } }, { 'Retry-After': '3' }),
    resp(429, {}),
    resp(200, { id: 'z' }),
  ]);
  assert.equal((await cliente.insertar({})).id, 'z');
  assert.equal(llamadas.length, 3);
  assert.deepEqual(esperas, [3000, 1000]); // Retry-After, then exponential backoff (500 * 2^1)
});

test('persistent 429: exhausts retries and fails with code limite', async () => {
  const { cliente, llamadas } = montar(
    Array.from({ length: 10 }, () => resp(429, { error: { message: 'slow' } })),
    { maxReintentos: 2 },
  );
  await assert.rejects(cliente.insertar({}), (e) => e.code === 'limite' && e.status === 429);
  assert.equal(llamadas.length, 3);
});

test('403: user rate limit is retried; permissions and disabled API are not', async () => {
  const lim = montar([
    resp(403, { error: { message: 'rate', errors: [{ reason: 'userRateLimitExceeded' }] } }),
    resp(200, { id: 'k' }),
  ]);
  assert.equal((await lim.cliente.insertar({})).id, 'k');
  const perm = montar([
    resp(403, { error: { message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } }),
  ]);
  await assert.rejects(perm.cliente.insertar({}), (e) => e.code === 'permisos');
  assert.equal(perm.llamadas.length, 1);
  const off = montar([
    resp(403, {
      error: {
        message: 'Google Calendar API has not been used in project 1 before or it is disabled.',
        errors: [{ reason: 'accessNotConfigured' }],
      },
    }),
  ]);
  await assert.rejects(off.cliente.insertar({}), (e) => e.code === 'api-desactivada');
});

test('5xx and network failures are retried; in the end => servidor / red', async () => {
  const a = montar([resp(503, {}), resp(200, { id: 'm' })]);
  assert.equal((await a.cliente.insertar({})).id, 'm');
  const b = montar([new TypeError('fail'), resp(200, { id: 'n' })]);
  assert.equal((await b.cliente.insertar({})).id, 'n');
  const c = montar([new TypeError('fail'), new TypeError('fail')], { maxReintentos: 1 });
  await assert.rejects(c.cliente.insertar({}), (e) => e.code === 'red');
  const d = montar([resp(500, {}), resp(500, {})], { maxReintentos: 1 });
  await assert.rejects(d.cliente.insertar({}), (e) => e.code === 'servidor');
});

test('listarGestionados: filters by cnlClub, paginates and discards cancelled events', async () => {
  const item = (id, cnl, f, status = 'confirmed') => ({
    id,
    status,
    start: { dateTime: f + 'T10:00:00+02:00' },
    extendedProperties: { private: { cnlId: cnl, cnlClub: 'c1' } },
  });
  const { cliente, llamadas } = montar([
    resp(200, {
      items: [item('g1', 'a', '2026-10-20'), item('g2', 'b', '2026-10-21', 'cancelled')],
      nextPageToken: 'T2',
    }),
    resp(200, { items: [item('g3', 'c', '2026-10-22'), { id: 'ajeno', start: { date: '2026-10-22' } }] }),
  ]);
  const r = await cliente.listarGestionados({ clubId: 'c1', timeMin: '2026-10-01T00:00:00Z' });
  assert.deepEqual(r, [
    { gid: 'g1', cnlId: 'a', fecha: '2026-10-20' },
    { gid: 'g3', cnlId: 'c', fecha: '2026-10-22' },
  ]);
  assert.match(llamadas[0].url, /privateExtendedProperty=cnlClub%3Dc1/);
  assert.match(llamadas[1].url, /pageToken=T2/);
});
