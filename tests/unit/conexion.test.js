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

describe('conexión con Drive (sólo autorización, sin identidad)', () => {
afterEach(() => {
  if (fake) { fake.desinstalar(); fake = null; }
  delete window.google;
  config.setClientId('');
  real.disconnect();
  localStorage.clear();
  sessionStorage.clear();
});

test('sin Client ID no se puede conectar (la demo sigue funcionando sin Drive)', async () => {
  await real.init();
  assert.equal(real.enabled, false);
  assert.equal(real.state, 'disconnected');
  assert.equal(real.isConnected(), false);
  assert.equal(real.token(), null);
  assert.equal(await real.ensureToken(), null);
  await assert.rejects(real.connect(), (e) => e.code === 'sin-client-id');
  assert.equal(await real.connect({ interactive: false }), false, 'en silencio no lanza');
});

test('no existe nada de identidad: ni usuario, ni signIn/signOut, ni scopes de perfil', () => {
  for (const k of ['user', 'signIn', 'signOut', 'role', 'currentUserRow', 'nadadorId']) assert.equal(real[k], undefined, k);
  assert.equal(config.SCOPES, 'https://www.googleapis.com/auth/drive.file');
});

test('máquina de estados: disconnected -> connecting -> connected -> expired -> connected -> disconnected', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis();
  await real.init();
  const estados = [];
  const off = real.onChange((s) => estados.push(s));
  assert.equal(real.state, 'disconnected');
  const p = real.connect();
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(real.state, 'connecting');
  assert.deepEqual(peticiones, ['consent'], 'primera vez: pantalla de consentimiento de Google');
  tc.callback({ access_token: 'tok', expires_in: 3600 });
  assert.equal(await p, true);
  assert.equal(real.state, 'connected');
  assert.equal(localStorage.getItem('cnl:drive-auth'), '1');
  real.markExpired();
  assert.equal(real.state, 'expired');
  const q = real.connect(); // "Reconnect"
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(peticiones.at(-1), '', 'reconectar: Google decide si hace falta pantalla');
  tc.callback({ access_token: 'tok2', expires_in: 3600 });
  await q;
  assert.equal(real.state, 'connected');
  assert.equal(real.expired, false);
  real.disconnect();
  assert.equal(real.state, 'disconnected');
  off();
  assert.deepEqual(estados, ['connecting', 'connected', 'expired', 'connecting', 'connected', 'disconnected']);
});

test('un fallo interactivo lanza con código estable y no deja la conexión a medias', async () => {
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

test('reconexión silenciosa al recargar: sólo hay una bandera; el token se renueva sin pantalla (prompt none)', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  localStorage.setItem('cnl:drive-auth', '1');
  instalarGis({ auto: (c) => c.callback({ access_token: 'renovado', expires_in: 3600 }) });
  await real.init();
  assert.equal(real.isConnected(), true, 'conectado por la bandera, sin identidad');
  assert.equal(real.token(), null, 'el token vive sólo en memoria');
  assert.equal(await real.ensureToken(), 'renovado');
  assert.deepEqual(peticiones, ['none']);
  assert.equal(await real.connect({ interactive: false }), true);
  const volcado = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
  assert.ok(!volcado.includes('renovado'), 'el token no se guarda');
});

test('si Google necesita un clic, la renovación silenciosa falla sin lanzar y la UI ofrece reconectar', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  localStorage.setItem('cnl:drive-auth', '1');
  instalarGis({ auto: (c) => c.error_callback({ type: 'popup_failed_to_open' }) });
  await real.init();
  assert.equal(await real.ensureToken(), null);
  assert.equal(await real.connect({ interactive: false }), false);
  assert.equal(real.isConnected(), true, 'la autorización previa sigue; sólo falta renovar con un clic');
});

test('no se guarda ni se pide ninguna identidad: sin userinfo, sin cnl:user, sin e-mail ni nombre', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis({ auto: (c) => c.callback({ access_token: 'tok', expires_in: 3600 }) });
  const prev = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (u) => { urls.push(String(u)); throw new Error('no network'); };
  try {
    localStorage.setItem('cnl:user', JSON.stringify({ email: 'viejo@x.com', name: 'Viejo' })); // left by an old version
    await real.init();
    assert.equal(localStorage.getItem('cnl:user'), null, 'el perfil antiguo se borra al arrancar');
    await real.connect();
  } finally { globalThis.fetch = prev; }
  assert.deepEqual(urls, [], 'ninguna petición a userinfo ni a otro sitio');
  assert.equal(tc.cfg.scope, 'https://www.googleapis.com/auth/drive.file');
  assert.equal(tc.cfg.hint, undefined);
  const volcado = JSON.stringify({ ...localStorage });
  assert.ok(!/@|email|picture/i.test(volcado), volcado);
});

test('Calendar es un scope incremental aparte: se pide sólo con tokenForScope y sin pista de cuenta', async () => {
  config.setClientId('t-1.apps.googleusercontent.com');
  instalarGis({ auto: (c) => c.cfg.callback({ access_token: 'cal', expires_in: 3600 }) });
  const t = await real.tokenForScope(config.CALENDAR_SCOPE, { interactive: true });
  assert.equal(t, 'cal');
  assert.equal(tc.cfg.scope, config.CALENDAR_SCOPE);
  assert.equal(tc.cfg.include_granted_scopes, true);
  assert.equal(tc.cfg.hint, undefined);
});

test('desconectar revoca los tokens, olvida la bandera y el flujo seguro borra TODO lo personal (pero no el idioma)', async () => {
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

test('el adaptador de pruebas sólo se activa con cnl:test o __CNL_TEST__ y acepta los nombres antiguos', () => {
  assert.equal(leerOpciones(globalThis), null);
  localStorage.setItem('cnl:test', '1');
  assert.deepEqual(leerOpciones(globalThis).fallos, {});
  assert.equal(leerOpciones(globalThis).conectado, false);
  localStorage.removeItem('cnl:test');
  const o = leerOpciones({ localStorage, __CNL_TEST__: { sesion: true, usuario: 'a@b.c', errorLogin: 'popup-cerrado' } });
  assert.equal(o.conectado, true);
  assert.equal(o.errorConexion, 'popup-cerrado');
  assert.equal(o.usuario, undefined, 'ya no hay identidad');
  assert.equal(leerOpciones({ localStorage, __CNL_TEST__: true }).conectado, false);
});

test('con el adaptador: conectar, bandera, recarga con reconexión silenciosa y desconectar', async () => {
  fake = instalarFakeGoogle({ conexion, drive, opciones: {} });
  await conexion.init();
  assert.equal(conexion.enabled, true);
  assert.equal(conexion.isConnected(), false, 'por defecto parte sin conectar');
  assert.equal(await conexion.connect({ interactive: false }), false);
  assert.equal(await conexion.connect(), true);
  assert.equal(conexion.token(), 'fake-token');
  assert.equal(localStorage.getItem('cnl:drive-auth'), '1');
  await conexion.init(); // "recarga"
  assert.equal(conexion.isConnected(), true);
  conexion.disconnect();
  assert.equal(conexion.isConnected(), false);
  assert.equal(conexion.token(), null);
  assert.equal(localStorage.getItem('cnl:drive-auth'), null);
});

test('con el adaptador: conectado automático una sola vez; errorConexion; sinClientId', async () => {
  fake = instalarFakeGoogle({ conexion, drive, config, opciones: { conectado: true } });
  await conexion.init();
  assert.equal(conexion.isConnected(), true);
  conexion.disconnect();
  await conexion.init();
  assert.equal(conexion.isConnected(), false, 'tras desconectar no se vuelve a conectar sola');
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

test('desinstalar() devuelve los métodos reales', async () => {
  const original = conexion.connect;
  fake = instalarFakeGoogle({ conexion, drive, opciones: {} });
  assert.notEqual(conexion.connect, original);
  fake.desinstalar();
  fake = null;
  assert.equal(conexion.connect, original);
  assert.equal(conexion.enabled, false);
});
});
