import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { auth } = await importApp('js/auth.js');
const { drive } = await importApp('js/drive.js');
const config = await importApp('js/config.js');
const { instalarFakeGoogle, leerOpciones } = await importApp('js/infrastructure/fakeGoogle.js');

let fake = null;
describe('auth y adaptador de pruebas', () => {
afterEach(() => { if (fake) { fake.desinstalar(); fake = null; } localStorage.clear(); sessionStorage.clear(); });

test('sin Client ID no se puede iniciar sesión (no existe modo local)', async () => {
  await auth.init();
  assert.equal(auth.enabled, false);
  assert.equal(auth.user, null);
  assert.equal(auth.token(), null);
  assert.equal(await auth.ensureToken(), null);
  await assert.rejects(auth.signIn(), (e) => e.code === 'sin-client-id');
});

test('individual use: there are no roles or role selector', () => {
  assert.equal(auth.role, undefined);
  assert.equal(auth.setDemoRole, undefined, 'ya no hay selector de rol');
  assert.equal(auth.currentUserRow, undefined);
});

test('setClientId guarda el ID en este navegador y lo valida', () => {
  assert.equal(config.isValidClientId('123-abc.apps.googleusercontent.com'), true);
  assert.equal(config.isValidClientId('hola'), false);
  assert.equal(config.isValidClientId(''), false);
  config.setClientId('123-abc.apps.googleusercontent.com');
  assert.equal(localStorage.getItem('cnl:clientId'), '123-abc.apps.googleusercontent.com');
  assert.equal(auth.enabled, true, 'binding vivo: no hace falta recargar');
  config.setClientId('');
  assert.equal(auth.enabled, false);
  assert.equal(localStorage.getItem('cnl:clientId'), null);
});

test('el adaptador de pruebas sólo se activa con cnl:test o __CNL_TEST__', () => {
  assert.equal(leerOpciones(globalThis), null);
  localStorage.setItem('cnl:test', '1');
  assert.deepEqual(leerOpciones(globalThis).fallos, {});
  assert.equal(leerOpciones(globalThis).sesion, false);
  localStorage.removeItem('cnl:test');
  assert.equal(leerOpciones({ localStorage, __CNL_TEST__: { sesion: true, usuario: 'a@b.c' } }).usuario, 'a@b.c');
  assert.equal(leerOpciones({ localStorage, __CNL_TEST__: true }).sesion, false);
});

test('con el adaptador: sesión simulada, cierre de sesión y recuperación tras recargar', async () => {
  fake = instalarFakeGoogle({ auth, drive, opciones: { usuario: 'ana@club.test' } });
  await auth.init();
  assert.equal(auth.enabled, true);
  assert.equal(auth.user, null, 'por defecto parte sin sesión');
  const u = await auth.signIn();
  assert.equal(u.email, 'ana@club.test');
  assert.equal(auth.token(), 'fake-token');
  assert.equal(await auth.ensureToken(), 'fake-token');
  auth.user = null; // "recarga": se recupera de cnl:user + token de sesión
  await auth.init();
  assert.equal(auth.user.email, 'ana@club.test');
  auth.signOut();
  assert.equal(auth.user, null);
  assert.equal(auth.token(), null);
});

test('con el adaptador: sesión inicial automática una sola vez y Client ID ausente', async () => {
  fake = instalarFakeGoogle({ auth, drive, config, opciones: { sesion: true } });
  await auth.init();
  assert.ok(auth.user);
  auth.signOut();
  await auth.init();
  assert.equal(auth.user, null, 'tras cerrar sesión no se vuelve a abrir sola');
  fake.desinstalar();
  fake = instalarFakeGoogle({ auth, drive, config, opciones: { sinClientId: true } });
  assert.equal(auth.enabled, false);
  await assert.rejects(auth.signIn(), (e) => e.code === 'sin-client-id');
  await auth.signIn({ clientId: 'x-1.apps.googleusercontent.com' });
  assert.equal(auth.enabled, true);
  assert.equal(localStorage.getItem('cnl:clientId'), 'x-1.apps.googleusercontent.com');
  config.setClientId('');
});

test('desinstalar() devuelve los métodos reales', async () => {
  const originalSignIn = auth.signIn;
  fake = instalarFakeGoogle({ auth, drive, opciones: {} });
  assert.notEqual(auth.signIn, originalSignIn);
  fake.desinstalar();
  fake = null;
  assert.equal(auth.signIn, originalSignIn);
  assert.equal(auth.enabled, false);
});
});
