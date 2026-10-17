// User preferences (cnl/preferencias.json): pure domain (merge, sanitising) and service (debounce, cache, offline queue).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../js/domain/preferencias.js';
import { crearPreferencias } from '../../js/application/preferenciasService.js';

// ---------- utilities ----------
function memoria() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _m: m,
  };
}
// Manual timer: nothing runs until avanza() is called.
function reloj() {
  let t = 1000;
  const cola = [];
  let id = 0;
  return {
    ahora: () => (t += 10), // each call advances: the stamps are strictly increasing
    temporizador: {
      set: (fn, ms) => {
        cola.push({ id: ++id, fn, ms });
        return id;
      },
      clear: (i) => {
        const k = cola.findIndex((x) => x.id === i);
        if (k >= 0) cola.splice(k, 1);
      },
    },
    pendientes: () => cola.map((x) => x.ms),
    async avanza() {
      const todos = cola.splice(0);
      for (const x of todos) await x.fn();
      await Promise.resolve();
    },
  };
}
// Simulated remote Drive with a call counter.
function remotoSim(inicial = null) {
  const r = { dato: inicial, lecturas: 0, escrituras: 0, fallo: null };
  r.puerto = {
    async leer() {
      r.lecturas++;
      if (r.fallo) throw r.fallo;
      return r.dato === null ? null : JSON.parse(JSON.stringify(r.dato));
    },
    async escribir(o) {
      if (r.fallo) throw r.fallo;
      r.escrituras++;
      r.dato = JSON.parse(JSON.stringify(o));
    },
  };
  return r;
}
const nuevo = (extra = {}) => {
  const rj = reloj();
  const almacen = memoria();
  const rem = remotoSim(extra.remoto === undefined ? null : extra.remoto);
  const svc = crearPreferencias({
    almacen,
    ahora: rj.ahora,
    temporizador: rj.temporizador,
    debounceMs: 2000,
    reintentoMs: 30000,
    legado: extra.legado,
    enLinea: extra.enLinea,
  });
  return { rj, almacen, rem, svc };
};
const offline = () => Object.assign(new Error('Offline'), { offline: true });

// ---------- domain ----------
test('domain: poner does not mutate, ignores invalid values and returns the same instance if nothing changes', () => {
  const p0 = P.vacias();
  const p1 = P.poner(p0, 'idioma', 'en', 10);
  assert.notEqual(p1, p0);
  assert.deepEqual(p0.valores, {});
  assert.equal(P.obtener(p1, 'idioma', 'es'), 'en');
  assert.equal(P.poner(p1, 'idioma', 'en', 20), p1, 'same value: no change and no new stamp');
  assert.equal(P.poner(p1, 'idioma', 'klingon', 30), p1, 'invalid value ignored');
  assert.equal(P.poner(p1, 'calendario.vista', 'anual', 30), p1);
  assert.equal(P.poner(p1, 'calendario.ventanaDias', 45, 30), p1);
  assert.equal(P.obtener(P.poner(p1, 'idioma', null, 40), 'idioma', 'es'), 'es', 'tombstone -> default value');
});

test('domain: normalizar tolerates garbage and keeps future versions and unknown keys', () => {
  assert.deepEqual(P.normalizar(null), P.vacias());
  assert.deepEqual(P.normalizar('texto'), P.vacias());
  assert.deepEqual(P.normalizar([1, 2]), P.vacias());
  const n = P.normalizar({
    version: 3,
    valores: {
      idioma: 'it',
      tutorial: { done: [2, 2, 99, 'x', 1], current: 'x' },
      futuro: { a: 1 },
      'calendario.vista': 'raro',
    },
    marcas: { idioma: 5 },
  });
  assert.equal(n.version, 3, 'the version is not downgraded');
  assert.equal(n.valores.idioma, 'it');
  assert.deepEqual(n.valores.tutorial, { done: [1, 2], current: 1 });
  assert.deepEqual(n.valores.futuro, { a: 1 });
  assert.equal('calendario.vista' in n.valores, false);
  assert.equal(n.marcas.idioma, 5);
  assert.equal(n.marcas.futuro, 0);
});

test('domain: fusionar picks the most recent stamp per key; on a tie the remote wins', () => {
  const local = {
    version: 1,
    valores: { idioma: 'es', ultimoClub: 'A', 'calendario.vista': 'mes' },
    marcas: { idioma: 50, ultimoClub: 100, 'calendario.vista': 70 },
  };
  const remoto = {
    version: 2,
    valores: { idioma: 'en', ultimoClub: 'B', tutorial: { done: [1], current: 2 } },
    marcas: { idioma: 80, ultimoClub: 100, tutorial: 10 },
  };
  const { resultado, deLocal, deRemoto } = P.fusionar(local, remoto);
  assert.equal(resultado.version, 2);
  assert.equal(resultado.valores.idioma, 'en', 'remote is more recent');
  assert.equal(resultado.valores.ultimoClub, 'B', 'tie: remote');
  assert.equal(resultado.valores['calendario.vista'], 'mes', 'local only');
  assert.deepEqual(resultado.valores.tutorial, { done: [1], current: 2 }, 'remote only');
  assert.deepEqual(deLocal.sort(), ['calendario.vista']);
  assert.deepEqual(deRemoto.sort(), ['idioma', 'tutorial', 'ultimoClub']);
});

test('domain: a more recent tombstone deletes the value on the other side', () => {
  const local = P.poner(P.poner(P.vacias(), 'ultimoClub', 'A', 10), 'ultimoClub', null, 30);
  const remoto = P.poner(P.vacias(), 'ultimoClub', 'A', 20);
  const { resultado } = P.fusionar(local, remoto);
  assert.equal(P.obtener(resultado, 'ultimoClub', 'nada'), 'nada');
});

// ---------- service: values and cache ----------
test('service: get/set with default values, validation and change event', () => {
  const { svc } = nuevo();
  const evts = [];
  svc.on((e) => evts.push(e));
  assert.equal(svc.get('idioma', 'es'), 'es');
  assert.equal(svc.set('idioma', 'en'), true);
  assert.equal(svc.set('idioma', 'en'), false, 'no change');
  assert.equal(svc.set('idioma', 'zz'), false, 'invalid');
  assert.equal(svc.get('idioma', 'es'), 'en');
  assert.deepEqual(evts, [{ tipo: 'cambio', claves: ['idioma'], origen: 'local' }]);
  assert.deepEqual(svc.pendientes, ['idioma']);
});

test('service: the local cache is a mirror that survives a new instance (fast start and offline)', () => {
  const a = nuevo();
  a.svc.set('idioma', 'it');
  a.svc.set('tutorial', { done: [1, 2], current: 3 });
  const b = crearPreferencias({ almacen: a.almacen, temporizador: a.rj.temporizador, ahora: () => Date.now() });
  assert.equal(b.get('idioma'), 'it');
  assert.deepEqual(b.get('tutorial'), { done: [1, 2], current: 3 });
  assert.deepEqual(b.pendientes.sort(), ['idioma', 'tutorial'], 'the pending queue is also kept');
});

test('service: a corrupt cache is ignored without breaking', () => {
  const almacen = memoria();
  almacen.setItem('cnl:prefs', '{no json');
  const s = crearPreferencias({ almacen, ahora: () => Date.now() });
  assert.equal(s.get('idioma', 'es'), 'es');
  almacen.setItem('cnl:prefs', JSON.stringify({ prefs: { valores: { idioma: 'xx' } }, pendientes: 'mal' }));
  assert.equal(crearPreferencias({ almacen, ahora: () => Date.now() }).get('idioma', 'es'), 'es');
});

// ---------- service: debounce ----------
test('service: debounce - several consecutive changes produce ONE write after the wait', async () => {
  const { svc, rj, rem } = nuevo();
  await svc.conectar({ remoto: rem.puerto });
  const escritasIniciales = rem.escrituras;
  svc.set('idioma', 'en');
  svc.set('calendario.vista', 'semana');
  svc.set('calendario.ventanaDias', 180);
  assert.equal(rem.escrituras, escritasIniciales, 'nothing is written before the debounce expires');
  assert.deepEqual(rj.pendientes(), [2000], 'a single timer (the previous ones are cancelled)');
  assert.equal(svc.estado, 'pendiente');
  await rj.avanza();
  assert.equal(rem.escrituras, escritasIniciales + 1);
  assert.equal(rem.dato.valores.idioma, 'en');
  assert.equal(rem.dato.valores['calendario.vista'], 'semana');
  assert.equal(svc.estado, 'sincronizado');
  assert.deepEqual(svc.pendientes, []);
});

test('service: flush() uploads immediately without waiting for the debounce', async () => {
  const { svc, rem } = nuevo();
  await svc.conectar({ remoto: rem.puerto });
  svc.set('idioma', 'it');
  await svc.flush();
  assert.equal(rem.dato.valores.idioma, 'it');
});

test('service: without a session nothing is uploaded; on connecting, what was chosen earlier is synced (login language)', async () => {
  const { svc, rem, rj } = nuevo();
  svc.set('idioma', 'en'); // chosen on the sign-in screen
  assert.deepEqual(rj.pendientes(), [], 'without a session there is no timer');
  assert.equal(svc.estado, 'sin-sesion');
  await svc.conectar({ remoto: rem.puerto });
  assert.equal(rem.dato.valores.idioma, 'en');
  assert.equal(svc.estado, 'sincronizado');
});

// ---------- service: safe merge ----------
test('service: the more recent remote wins, is applied and notified; the more recent local is uploaded', async () => {
  const remoto = {
    version: 1,
    valores: { idioma: 'en', ultimoClub: 'REM' },
    marcas: { idioma: 900000, ultimoClub: 1 },
  };
  const { svc, rem } = nuevo({ remoto });
  svc.set('idioma', 'it'); // stamp ~1010: older than the remote one
  svc.set('ultimoClub', 'LOC'); // more recent than the remote one (1)
  const evts = [];
  svc.on((e) => {
    if (e.tipo === 'cambio') evts.push(e);
  });
  await svc.conectar({ remoto: rem.puerto });
  assert.equal(svc.get('idioma'), 'en', 'remote is more recent');
  assert.equal(svc.get('ultimoClub'), 'LOC', 'local is more recent');
  assert.deepEqual(
    evts.map((e) => [e.origen, e.claves]),
    [['remoto', ['idioma']]],
  );
  assert.equal(rem.dato.valores.ultimoClub, 'LOC');
  assert.equal(rem.dato.valores.idioma, 'en');
});

test('service: two devices changing different keys do not overwrite each other', async () => {
  const remoto = { version: 1, valores: { idioma: 'en' }, marcas: { idioma: 1 } };
  const { svc, rem, rj } = nuevo({ remoto });
  await svc.conectar({ remoto: rem.puerto });
  // another device changes the calendar view
  rem.dato = {
    version: 1,
    valores: { idioma: 'en', 'calendario.vista': 'agenda' },
    marcas: { idioma: 1, 'calendario.vista': 99999999 },
  };
  svc.set('ultimoClub', 'X');
  await rj.avanza();
  assert.equal(rem.dato.valores['calendario.vista'], 'agenda', "the other device's change is kept (read-merge-write)");
  assert.equal(rem.dato.valores.ultimoClub, 'X');
  assert.equal(svc.get('calendario.vista'), 'agenda');
});

test('service: a corrupt remote file or one from a future version is not downgraded and loses no keys', async () => {
  const futuro = { version: 7, valores: { idioma: 'en', cosaNueva: { x: 1 } }, marcas: { idioma: 1, cosaNueva: 1 } };
  const a = nuevo({ remoto: futuro });
  await a.svc.conectar({ remoto: a.rem.puerto });
  a.svc.set('calendario.vista', 'mes');
  await a.svc.flush();
  assert.equal(a.rem.dato.version, 7);
  assert.deepEqual(a.rem.dato.valores.cosaNueva, { x: 1 });
  assert.equal(a.rem.dato.valores['calendario.vista'], 'mes');

  const b = nuevo({ remoto: 'basura {{' });
  b.svc.set('idioma', 'it');
  await b.svc.conectar({ remoto: b.rem.puerto });
  assert.equal(b.rem.dato.valores.idioma, 'it', 'an unreadable file is rewritten');
});

test('service: it stores no identity (neither e-mail nor name) in the local cache', async () => {
  const a = nuevo();
  await a.svc.conectar({ remoto: a.rem.puerto });
  a.svc.set('ultimoClub', 'CLUB-1');
  await a.svc.flush();
  const guardado = a.almacen.getItem('cnl:prefs');
  assert.ok(guardado, 'the cache exists');
  assert.deepEqual(Object.keys(JSON.parse(guardado)).sort(), ['pendientes', 'prefs']);
  assert.equal(a.svc.email, undefined);
  a.svc.desconectar();
  assert.equal(a.almacen.getItem('cnl:prefs'), null, 'on disconnecting Drive the local cache is deleted');
});

test('service: migrates the old localStorage keys only if Drive does not have them', async () => {
  const legado = () => ({
    idioma: 'it',
    'calendario.vista': 'semana',
    tutorial: { done: [1], current: 2 },
    'calSync.cnl:cal-sync:c1': { items: { e1: { gid: 'g' } }, ultima: null },
  });
  const remoto = { version: 1, valores: { idioma: 'en' }, marcas: { idioma: 5 } };
  const { svc, rem } = nuevo({ remoto, legado });
  await svc.conectar({ remoto: rem.puerto });
  assert.equal(svc.get('idioma'), 'en', 'what is on Drive takes precedence over the old mirror');
  assert.equal(svc.get('calendario.vista'), 'semana');
  assert.deepEqual(svc.get('tutorial'), { done: [1], current: 2 });
  assert.equal(rem.dato.valores['calendario.vista'], 'semana', 'and it is uploaded to Drive');
  assert.ok(rem.dato.valores['calSync.cnl:cal-sync:c1'].items.e1);
});

// ---------- service: network failures ----------
test('service: network failure -> offline state, changes stay in the queue and are retried', async () => {
  const { svc, rem, rj, almacen } = nuevo();
  await svc.conectar({ remoto: rem.puerto });
  rem.fallo = offline();
  svc.set('idioma', 'en');
  await rj.avanza();
  assert.equal(svc.estado, 'offline');
  assert.deepEqual(svc.pendientes, ['idioma'], 'still in the queue');
  assert.deepEqual(rj.pendientes(), [30000], 'retry scheduled');
  assert.deepEqual(
    JSON.parse(almacen.getItem('cnl:prefs')).pendientes,
    ['idioma'],
    'the queue survives closing the tab',
  );
  assert.equal(rem.dato, null);
  rem.fallo = null;
  await rj.avanza();
  assert.equal(svc.estado, 'sincronizado');
  assert.deepEqual(svc.pendientes, []);
  assert.equal(rem.dato.valores.idioma, 'en');
});

test('service: a server error (not a network one) leaves the error state and keeps the queue', async () => {
  const { svc, rem, rj } = nuevo();
  await svc.conectar({ remoto: rem.puerto });
  rem.fallo = Object.assign(new Error('500'), { status: 500 });
  svc.set('idioma', 'it');
  const r = await svc.flush();
  assert.equal(r.ok, false);
  assert.equal(svc.estado, 'error');
  assert.equal(svc.ultimoError.status, 500);
  assert.deepEqual(svc.pendientes, ['idioma']);
  rem.fallo = null;
  await rj.avanza();
  assert.equal(svc.estado, 'sincronizado');
});

test('service: offline, Drive is not called; when the network returns the queue is uploaded', async () => {
  let enLinea = true;
  const { svc, rem } = nuevo({ enLinea: () => enLinea });
  await svc.conectar({ remoto: rem.puerto });
  const lecturas = rem.lecturas;
  enLinea = false;
  svc.set('idioma', 'en');
  assert.equal(svc.estado, 'offline');
  await svc.flush();
  assert.equal(rem.lecturas, lecturas, 'no request while there is no network');
  enLinea = true;
  await svc.volverLaRed();
  assert.equal(rem.dato.valores.idioma, 'en');
  assert.equal(svc.estado, 'sincronizado');
});

test('service: a change made while uploading stays pending', async () => {
  const { svc, rem } = nuevo();
  await svc.conectar({ remoto: rem.puerto });
  const escribir = rem.puerto.escribir;
  rem.puerto.escribir = async (o) => {
    svc.set('ultimoClub', 'durante');
    await escribir(o);
  };
  svc.set('idioma', 'en');
  await svc.flush();
  assert.deepEqual(svc.pendientes, ['ultimoClub']);
  assert.equal(svc.estado, 'pendiente');
  rem.puerto.escribir = escribir;
  await svc.flush();
  assert.equal(rem.dato.valores.ultimoClub, 'durante');
  assert.deepEqual(svc.pendientes, []);
});

// ---------- service: misc ----------
test('service: desconectar() stops syncing and deletes the account cache', async () => {
  const { svc, rem, almacen } = nuevo();
  await svc.conectar({ remoto: rem.puerto });
  svc.set('idioma', 'it');
  svc.desconectar();
  assert.equal(svc.estado, 'sin-sesion');
  assert.equal(almacen.getItem('cnl:prefs'), null);
  assert.equal(svc.get('idioma', 'es'), 'es');
});

test('service: comoAlmacenamiento acts as "storage" (JSON round trip) over a prefix', () => {
  const { svc } = nuevo();
  const st = svc.comoAlmacenamiento(P.CLAVES.calSync);
  assert.equal(st.getItem('cnl:cal-sync:c1'), null);
  st.setItem('cnl:cal-sync:c1', JSON.stringify({ items: { e1: { gid: 'g1' } }, ultima: null }));
  assert.deepEqual(JSON.parse(st.getItem('cnl:cal-sync:c1')).items.e1, { gid: 'g1' });
  assert.deepEqual(svc.pendientes, ['calSync.cnl:cal-sync:c1']);
  st.setItem('x', 'no es json');
  assert.equal(st.getItem('x'), null);
});
