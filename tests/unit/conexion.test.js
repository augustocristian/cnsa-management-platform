// Drive connection (authorization only, no identity): state machine, silent reconnect, disconnect, the test adapter.
import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp, appUrl } from '../helpers/env.js';

setupEnv();
const { driveConnection: conexion } = await importApp('js/infrastructure/driveConnection.js');
const { drive } = await importApp('js/drive.js');
const config = await importApp('js/config.js');
const { instalarFakeGoogle, leerOpciones } = await importApp('js/infrastructure/fakeGoogle.js');
const { limpiarDatosLocales } = await importApp('js/cache.js');
const { crearSesionService } = await importApp('js/application/sesionService.js');
// Isolated copy of the REAL module (the shared instance may be replaced by the simulator in other tests of the same process)
const { driveConnection: real } = await import(appUrl('js/infrastructure/driveConnection.js') + '?conexion');

let fake = null;
let tc = null;
let peticiones = [];
function instalarGis({ auto = null } = {}) {
  tc = null;
  peticiones = [];
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg) => {
          const c = { cfg, callback: null, error_callback: null, requestAccessToken: (o) => { peticiones.push(o.prompt); if (auto) setTimeout(() => auto(c), 0); } };
          tc = c;
          return c;
        },
        revoke: () => {},
      },
    },
  };
}

describe('Drive connection (authorization only, no identity)', () => {
afterEach(() => {
  if (fake) { fake.desinstalar(); fake = null; }
  delete window.google;
  config.setClientId('');
  real.disconnect();
  localStorage.clear();
  sessionStorage.clear();
});

test('cannot connect without a Client ID (the demo keeps working without Drive)', async () => {
  await real.init();
  assert.equal(real.enabled, false);
  assert.equal(real.state, 'disconnected');
  assert.equal(real.isConnected(), false);
  assert.equal(real.token(), null);
  assert.equal(await real.ensureToken(), null);
  await assert.rejects(real.connect(), (e) => e.code === 'sin-client-id');
  assert.equal(await real.connect({ interactive: false }), false, 'silent mode does not throw');
});

test('there is no identity at all: no user, no signIn/signOut, no profile scopes', () => {
  for (const k of ['user', 'signIn', 'signOut', 'role', 'currentUserRow', 'nadadorId']) assert.equal(real[k], undefined, k);
  assert.equal(config.SCOPES, 'https://www.googleapis.com/auth/drive.file');
});

test('state machine: disconnected -> connecting -> connected -> expired -> connected -> disconnected', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis();
  await real.init();
  const estados = [];
  const off = real.onChange((s) => estados.push(s));
  assert.equal(real.state, 'disconnected');
  const p = real.connect();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(real.state, 'connecting');
  assert.deepEqual(peticiones, ['consent'], 'first time: Google consent screen');
  tc.callback({ access_token: 'tok', expires_in: 3600 });
  assert.equal(await p, true);
  assert.equal(real.state, 'connected');
  assert.equal(localStorage.getItem('cnl:drive-auth'), '1');
  real.markExpired();
  assert.equal(real.state, 'expired');
  const q = real.connect(); // "Reconnect"
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(peticiones.at(-1), '', 'reconnect: Google decides whether a screen is needed');
  tc.callback({ access_token: 'tok2', expires_in: 3600 });
  await q;
  assert.equal(real.state, 'connected');
  assert.equal(real.expired, false);
  real.disconnect();
  assert.equal(real.state, 'disconnected');
  off();
  assert.deepEqual(estados, ['connecting', 'connected', 'expired', 'connecting', 'connected', 'disconnected']);
});

test('an interactive failure throws with a stable code and does not leave the connection half-open', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis();
  await real.init();
  const p = real.connect();
  await new Promise((r) => setTimeout(r, 5));
  tc.error_callback({ type: 'popup_closed' });
  await assert.rejects(p, (e) => e.code === 'popup-cerrado' && typeof e.origin === 'string');
  assert.equal(real.state, 'disconnected');
  assert.equal(localStorage.getItem('cnl:drive-auth'), null);
});

test('silent reconnection on reload: there is only a flag; the token is renewed without a screen (prompt none)', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  localStorage.setItem('cnl:drive-auth', '1');
  instalarGis({ auto: (c) => c.callback({ access_token: 'renovado', expires_in: 3600 }) });
  await real.init();
  assert.equal(real.isConnected(), true, 'connected through the flag, without identity');
  assert.equal(real.token(), null, 'the token lives in memory only');
  assert.equal(await real.ensureToken(), 'renovado');
  assert.deepEqual(peticiones, ['none']);
  assert.equal(await real.connect({ interactive: false }), true);
  const volcado = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
  assert.ok(!volcado.includes('renovado'), 'the token is not stored');
});

test('if Google needs a click, the silent renewal fails without throwing and the UI offers to reconnect', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  localStorage.setItem('cnl:drive-auth', '1');
  instalarGis({ auto: (c) => c.error_callback({ type: 'popup_failed_to_open' }) });
  await real.init();
  assert.equal(await real.ensureToken(), null);
  assert.equal(await real.connect({ interactive: false }), false);
  assert.equal(real.isConnected(), true, 'the previous authorization remains; it only needs renewing with a click');
});

test('no identity is stored or requested: no userinfo, no cnl:user, no e-mail or name', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis({ auto: (c) => c.callback({ access_token: 'tok', expires_in: 3600 }) });
  const prev = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); throw new Error('no network'); };
  try {
    localStorage.setItem('cnl:user', JSON.stringify({ email: 'viejo@x.com', name: 'Viejo' })); // left by an old version
    await real.init();
    assert.equal(localStorage.getItem('cnl:user'), null, 'the old profile is deleted on startup');
    await real.connect();
  } finally { globalThis.fetch = prev; }
  assert.deepEqual(urls, [], 'no request to userinfo or anywhere else');
  assert.equal(tc.cfg.scope, 'https://www.googleapis.com/auth/drive.file');
  assert.equal(tc.cfg.hint, undefined);
  const volcado = JSON.stringify({ ...localStorage });
  assert.ok(!/@|email|picture/i.test(volcado), volcado);
});

test('Calendar is a separate incremental scope: requested only with tokenForScope and without an account hint', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis({ auto: (c) => c.cfg.callback({ access_token: 'cal', expires_in: 3600 }) });
  const t = await real.tokenForScope(config.CALENDAR_SCOPE, { interactive: true });
  assert.equal(t, 'cal');
  assert.equal(tc.cfg.scope, config.CALENDAR_SCOPE);
  assert.equal(tc.cfg.include_granted_scopes, true);
  assert.equal(tc.cfg.hint, undefined);
});

test('disconnecting revokes the tokens, forgets the flag and the safe flow deletes ALL personal data (but not the language)', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  const revocados = [];
  instalarGis({ auto: (c) => c.callback({ access_token: 'tok-1', expires_in: 3600 }) });
  window.google.accounts.oauth2.revoke = (t) => revocados.push(t);
  await real.init();
  await real.connect();
  localStorage.setItem('cnl:club:abc', '{"db":{}}');
  localStorage.setItem('cnl:prefs', '{}');
  localStorage.setItem('cnl:cal-sync:abc', '{}');
  localStorage.setItem('cnl:lang', 'en');
  let cerrado = false;
  const sesion = crearSesionService({
    auth: real, drive: { reset() {} }, prefs: { flush: async () => {}, desconectar() {} },
    store: { clubRef: null, cerrar() { cerrado = true; } }, banderas: { guardarDemo() {} }, limpiarDatosLocales, espera: async () => {},
  });
  assert.deepEqual(await sesion.cerrarSesion(), { salio: true });
  assert.deepEqual(revocados, ['tok-1']);
  assert.equal(real.isConnected(), false);
  assert.equal(real.token(), null);
  assert.equal(cerrado, true);
  assert.deepEqual(Object.keys(localStorage).sort(), ['cnl:clientId', 'cnl:lang'].filter((k) => localStorage.getItem(k) !== null).sort());
  assert.equal(localStorage.getItem('cnl:lang'), 'en');
});

test('the test adapter only activates with cnl:test or __CNL_TEST__ and accepts the old names', () => {
  assert.equal(leerOpciones(globalThis), null);
  localStorage.setItem('cnl:test', '1');
  assert.deepEqual(leerOpciones(globalThis).fallos, {});
  assert.equal(leerOpciones(globalThis).conectado, false);
  localStorage.removeItem('cnl:test');
  const o = leerOpciones({ localStorage, __CNL_TEST__: { sesion: true, usuario: 'a@b.c', errorLogin: 'popup-cerrado' } });
  assert.equal(o.conectado, true);
  assert.equal(o.errorConexion, 'popup-cerrado');
  assert.equal(o.usuario, undefined, 'there is no identity any more');
  assert.equal(leerOpciones({ localStorage, __CNL_TEST__: true }).conectado, false);
});

test('with the adapter: connect, flag, reload with silent reconnection and disconnect', async () => {
  fake = instalarFakeGoogle({ conexion, drive, opciones: {} });
  await conexion.init();
  assert.equal(conexion.enabled, true);
  assert.equal(conexion.isConnected(), false, 'starts disconnected by default');
  assert.equal(await conexion.connect({ interactive: false }), false);
  assert.equal(await conexion.connect(), true);
  assert.equal(conexion.token(), 'fake-token');
  assert.equal(localStorage.getItem('cnl:drive-auth'), '1');
  await conexion.init(); // "reload"
  assert.equal(conexion.isConnected(), true);
  conexion.disconnect();
  assert.equal(conexion.isConnected(), false);
  assert.equal(conexion.token(), null);
  assert.equal(localStorage.getItem('cnl:drive-auth'), null);
});

test('with the adapter: auto-connected only once; errorConexion; sinClientId', async () => {
  fake = instalarFakeGoogle({ conexion, drive, config, opciones: { conectado: true } });
  await conexion.init();
  assert.equal(conexion.isConnected(), true);
  conexion.disconnect();
  await conexion.init();
  assert.equal(conexion.isConnected(), false, 'after disconnecting it does not reconnect on its own');
  fake.desinstalar();
  fake = instalarFakeGoogle({ conexion, drive, opciones: { errorConexion: 'acceso-denegado' } });
  await assert.rejects(conexion.connect(), (e) => e.code === 'acceso-denegado');
  assert.equal(await conexion.connect({ interactive: false }), false);
  fake.desinstalar();
  fake = instalarFakeGoogle({ conexion, drive, config, opciones: { sinClientId: true } });
  assert.equal(conexion.enabled, false);
  await assert.rejects(conexion.connect(), (e) => e.code === 'sin-client-id');
  await conexion.connect({ clientId: 'x-1.apps.googleusercontent.com' });
  assert.equal(conexion.enabled, true);
  assert.equal(localStorage.getItem('cnl:clientId'), 'x-1.apps.googleusercontent.com');
});

test('desinstalar() restores the real methods', async () => {
  const original = conexion.connect;
  fake = instalarFakeGoogle({ conexion, drive, opciones: {} });
  assert.notEqual(conexion.connect, original);
  fake.desinstalar();
  fake = null;
  assert.equal(conexion.connect, original);
  assert.equal(conexion.enabled, false);
});
});
