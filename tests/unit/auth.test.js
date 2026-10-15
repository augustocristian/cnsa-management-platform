import test from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';

setupEnv();
const { auth } = await importApp('js/auth.js');

test('modo local: sin Client ID, rol admin y sin usuario', async () => {
  await auth.init();
  assert.equal(auth.enabled, false);
  assert.equal(auth.user, null);
  assert.equal(auth.role(), 'admin');
  assert.equal(auth.token(), null);
  assert.equal(await auth.signIn(), null);
  assert.equal(await auth.ensureToken(), null);
});

test('setDemoRole cambia el rol, emite y se limpia', () => {
  let n = 0;
  const off = auth.on(() => n++);
  auth.setDemoRole('nadador');
  assert.equal(auth.role(), 'nadador');
  auth.setDemoRole('entrenador');
  assert.equal(auth.role(), 'entrenador');
  auth.setDemoRole(null);
  assert.equal(auth.role(), 'admin');
  assert.equal(n, 3);
  off();
  auth.setDemoRole('nadador');
  assert.equal(n, 3);
  auth.setDemoRole('');
  assert.equal(auth.role(), 'admin');
});

test('signOut limpia el rol demo', () => {
  auth.setDemoRole('nadador');
  auth.signOut();
  assert.equal(auth.role(), 'admin');
  assert.equal(auth.user, null);
});
