// Preferencias del usuario (cnl/preferencias.json): dominio puro (fusión, saneado) y servicio (debounce, caché, cola offline).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../js/domain/preferencias.js';
import { crearPreferencias } from '../../js/application/preferenciasService.js';

// ---------- utilidades ----------
function memoria() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
// Temporizador manual: nada se ejecuta hasta llamar a avanza().
function reloj() {
  let t = 1000;
  const cola = [];
  let id = 0;
  return {
    ahora: () => (t += 10), // cada llamada avanza: las marcas son estrictamente crecientes
    temporizador: { set: (fn, ms) => { cola.push({ id: ++id, fn, ms }); return id; }, clear: (i) => { const k = cola.findIndex((x) => x.id === i); if (k >= 0) cola.splice(k, 1); } },
    pendientes: () => cola.map((x) => x.ms),
    async avanza() { const todos = cola.splice(0); for (const x of todos) await x.fn(); await Promise.resolve(); },
  };
}
// Drive remoto simulado con contador de llamadas.
function remotoSim(inicial = null) {
  const r = { dato: inicial, lecturas: 0, escrituras: 0, fallo: null };
  r.puerto = {
    async leer() { r.lecturas++; if (r.fallo) throw r.fallo; return r.dato === null ? null : JSON.parse(JSON.stringify(r.dato)); },
    async escribir(o) { if (r.fallo) throw r.fallo; r.escrituras++; r.dato = JSON.parse(JSON.stringify(o)); },
  };
  return r;
}
const nuevo = (extra = {}) => {
  const rj = reloj();
  const almacen = memoria();
  const rem = remotoSim(extra.remoto === undefined ? null : extra.remoto);
  const svc = crearPreferencias({ almacen, ahora: rj.ahora, temporizador: rj.temporizador, debounceMs: 2000, reintentoMs: 30000, legado: extra.legado, enLinea: extra.enLinea });
  return { rj, almacen, rem, svc };
};
const offline = () => Object.assign(new Error('Sin conexión'), { offline: true });

// ---------- dominio ----------
test('dominio: poner no muta, ignora valores inválidos y devuelve la misma instancia si no hay cambio', () => {
  const p0 = P.vacias();
  const p1 = P.poner(p0, 'idioma', 'en', 10);
  assert.notEqual(p1, p0);
  assert.deepEqual(p0.valores, {});
  assert.equal(P.obtener(p1, 'idioma', 'es'), 'en');
  assert.equal(P.poner(p1, 'idioma', 'en', 20), p1, 'mismo valor: sin cambio ni marca nueva');
  assert.equal(P.poner(p1, 'idioma', 'klingon', 30), p1, 'valor inválido ignorado');
  assert.equal(P.poner(p1, 'calendario.vista', 'anual', 30), p1);
  assert.equal(P.poner(p1, 'calendario.ventanaDias', 45, 30), p1);
  assert.equal(P.obtener(P.poner(p1, 'idioma', null, 40), 'idioma', 'es'), 'es', 'lápida -> valor por defecto');
});

test('dominio: normalizar tolera basura y conserva versiones futuras y claves desconocidas', () => {
  assert.deepEqual(P.normalizar(null), P.vacias());
  assert.deepEqual(P.normalizar('texto'), P.vacias());
  assert.deepEqual(P.normalizar([1, 2]), P.vacias());
  const n = P.normalizar({ version: 3, valores: { idioma: 'it', tutorial: { done: [2, 2, 99, 'x', 1], current: 'x' }, futuro: { a: 1 }, 'calendario.vista': 'raro' }, marcas: { idioma: 5 } });
  assert.equal(n.version, 3, 'no se degrada la versión');
  assert.equal(n.valores.idioma, 'it');
  assert.deepEqual(n.valores.tutorial, { done: [1, 2], current: 1 });
  assert.deepEqual(n.valores.futuro, { a: 1 });
  assert.equal('calendario.vista' in n.valores, false);
  assert.equal(n.marcas.idioma, 5);
  assert.equal(n.marcas.futuro, 0);
});

test('dominio: fusionar elige la marca más reciente por clave; empate gana lo remoto', () => {
  const local = { version: 1, valores: { idioma: 'es', ultimoClub: 'A', 'calendario.vista': 'mes' }, marcas: { idioma: 50, ultimoClub: 100, 'calendario.vista': 70 } };
  const remoto = { version: 2, valores: { idioma: 'en', ultimoClub: 'B', tutorial: { done: [1], current: 2 } }, marcas: { idioma: 80, ultimoClub: 100, tutorial: 10 } };
  const { resultado, deLocal, deRemoto } = P.fusionar(local, remoto);
  assert.equal(resultado.version, 2);
  assert.equal(resultado.valores.idioma, 'en', 'remoto más reciente');
  assert.equal(resultado.valores.ultimoClub, 'B', 'empate: remoto');
  assert.equal(resultado.valores['calendario.vista'], 'mes', 'sólo local');
  assert.deepEqual(resultado.valores.tutorial, { done: [1], current: 2 }, 'sólo remoto');
  assert.deepEqual(deLocal.sort(), ['calendario.vista']);
  assert.deepEqual(deRemoto.sort(), ['idioma', 'tutorial', 'ultimoClub']);
});

test('dominio: una lápida más reciente borra el valor del otro lado', () => {
  const local = P.poner(P.poner(P.vacias(), 'ultimoClub', 'A', 10), 'ultimoClub', null, 30);
  const remoto = P.poner(P.vacias(), 'ultimoClub', 'A', 20);
  const { resultado } = P.fusionar(local, remoto);
  assert.equal(P.obtener(resultado, 'ultimoClub', 'nada'), 'nada');
});

// ---------- servicio: valores y caché ----------
test('servicio: get/set con valores por defecto, validación y evento de cambio', () => {
  const { svc } = nuevo();
  const evts = [];
  svc.on((e) => evts.push(e));
  assert.equal(svc.get('idioma', 'es'), 'es');
  assert.equal(svc.set('idioma', 'en'), true);
  assert.equal(svc.set('idioma', 'en'), false, 'sin cambio');
  assert.equal(svc.set('idioma', 'zz'), false, 'inválido');
  assert.equal(svc.get('idioma', 'es'), 'en');
  assert.deepEqual(evts, [{ tipo: 'cambio', claves: ['idioma'], origen: 'local' }]);
  assert.deepEqual(svc.pendientes, ['idioma']);
});

test('servicio: la caché local es un espejo que sobrevive a una nueva instancia (arranque rápido y offline)', () => {
  const a = nuevo();
  a.svc.set('idioma', 'it');
  a.svc.set('tutorial', { done: [1, 2], current: 3 });
  const b = crearPreferencias({ almacen: a.almacen, temporizador: a.rj.temporizador });
  assert.equal(b.get('idioma'), 'it');
  assert.deepEqual(b.get('tutorial'), { done: [1, 2], current: 3 });
  assert.deepEqual(b.pendientes.sort(), ['idioma', 'tutorial'], 'la cola de pendientes también se conserva');
});

test('servicio: una caché corrupta se ignora sin romper', () => {
  const almacen = memoria();
  almacen.setItem('cnl:prefs', '{no json');
  const s = crearPreferencias({ almacen });
  assert.equal(s.get('idioma', 'es'), 'es');
  almacen.setItem('cnl:prefs', JSON.stringify({ email: 5, prefs: { valores: { idioma: 'xx' } }, pendientes: 'mal' }));
  assert.equal(crearPreferencias({ almacen }).get('idioma', 'es'), 'es');
});

// ---------- servicio: debounce ----------
test('servicio: debounce — varios cambios seguidos producen UNA escritura tras la espera', async () => {
  const { svc, rj, rem } = nuevo();
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  const escritasIniciales = rem.escrituras;
  svc.set('idioma', 'en');
  svc.set('calendario.vista', 'semana');
  svc.set('calendario.ventanaDias', 180);
  assert.equal(rem.escrituras, escritasIniciales, 'nada se escribe antes de que venza el debounce');
  assert.deepEqual(rj.pendientes(), [2000], 'un solo temporizador (los anteriores se cancelan)');
  assert.equal(svc.estado, 'pendiente');
  await rj.avanza();
  assert.equal(rem.escrituras, escritasIniciales + 1);
  assert.equal(rem.dato.valores.idioma, 'en');
  assert.equal(rem.dato.valores['calendario.vista'], 'semana');
  assert.equal(svc.estado, 'sincronizado');
  assert.deepEqual(svc.pendientes, []);
});

test('servicio: flush() sube de inmediato sin esperar al debounce', async () => {
  const { svc, rem } = nuevo();
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  svc.set('idioma', 'it');
  await svc.flush();
  assert.equal(rem.dato.valores.idioma, 'it');
});

test('servicio: sin sesión nada se sube; al conectar se sincroniza lo elegido antes (idioma del login)', async () => {
  const { svc, rem, rj } = nuevo();
  svc.set('idioma', 'en'); // elegido en la pantalla de acceso
  assert.deepEqual(rj.pendientes(), [], 'sin sesión no hay temporizador');
  assert.equal(svc.estado, 'sin-sesion');
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  assert.equal(rem.dato.valores.idioma, 'en');
  assert.equal(svc.estado, 'sincronizado');
});

// ---------- servicio: fusión segura ----------
test('servicio: lo remoto más reciente gana, se aplica y se notifica; lo local más reciente sube', async () => {
  const remoto = { version: 1, valores: { idioma: 'en', ultimoClub: 'REM' }, marcas: { idioma: 900000, ultimoClub: 1 } };
  const { svc, rem } = nuevo({ remoto });
  svc.set('idioma', 'it'); // marca ~1010: más antigua que la remota
  svc.set('ultimoClub', 'LOC'); // más reciente que la remota (1)
  const evts = [];
  svc.on((e) => { if (e.tipo === 'cambio') evts.push(e); });
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  assert.equal(svc.get('idioma'), 'en', 'remoto más reciente');
  assert.equal(svc.get('ultimoClub'), 'LOC', 'local más reciente');
  assert.deepEqual(evts.map((e) => [e.origen, e.claves]), [['remoto', ['idioma']]]);
  assert.equal(rem.dato.valores.ultimoClub, 'LOC');
  assert.equal(rem.dato.valores.idioma, 'en');
});

test('servicio: dos dispositivos que cambian claves distintas no se pisan', async () => {
  const remoto = { version: 1, valores: { idioma: 'en' }, marcas: { idioma: 1 } };
  const { svc, rem, rj } = nuevo({ remoto });
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  // otro dispositivo cambia la vista del calendario
  rem.dato = { version: 1, valores: { idioma: 'en', 'calendario.vista': 'agenda' }, marcas: { idioma: 1, 'calendario.vista': 99999999 } };
  svc.set('ultimoClub', 'X');
  await rj.avanza();
  assert.equal(rem.dato.valores['calendario.vista'], 'agenda', 'lo del otro dispositivo se conserva (lectura-fusión-escritura)');
  assert.equal(rem.dato.valores.ultimoClub, 'X');
  assert.equal(svc.get('calendario.vista'), 'agenda');
});

test('servicio: un fichero remoto corrupto o de versión futura no se degrada ni pierde claves', async () => {
  const futuro = { version: 7, valores: { idioma: 'en', cosaNueva: { x: 1 } }, marcas: { idioma: 1, cosaNueva: 1 } };
  const a = nuevo({ remoto: futuro });
  await a.svc.conectar({ remoto: a.rem.puerto, email: 'a@b.c' });
  a.svc.set('calendario.vista', 'mes');
  await a.svc.flush();
  assert.equal(a.rem.dato.version, 7);
  assert.deepEqual(a.rem.dato.valores.cosaNueva, { x: 1 });
  assert.equal(a.rem.dato.valores['calendario.vista'], 'mes');

  const b = nuevo({ remoto: 'basura {{' });
  b.svc.set('idioma', 'it');
  await b.svc.conectar({ remoto: b.rem.puerto, email: 'a@b.c' });
  assert.equal(b.rem.dato.valores.idioma, 'it', 'se reescribe un fichero ilegible');
});

test('servicio: cuenta distinta -> se descarta la caché de la anterior', async () => {
  const a = nuevo();
  await a.svc.conectar({ remoto: a.rem.puerto, email: 'ana@x.com' });
  a.svc.set('ultimoClub', 'CLUB-ANA');
  await a.svc.flush();
  const b = crearPreferencias({ almacen: a.almacen, temporizador: a.rj.temporizador, ahora: a.rj.ahora });
  const remB = remotoSim(null);
  await b.conectar({ remoto: remB.puerto, email: 'luis@x.com' });
  assert.equal(b.get('ultimoClub', null), null);
  assert.equal(remB.dato === null || !remB.dato.valores.ultimoClub, true, 'no se filtra nada de la otra cuenta');
});

test('servicio: migra las claves antiguas de localStorage sólo si Drive no las tiene', async () => {
  const legado = () => ({ idioma: 'it', 'calendario.vista': 'semana', tutorial: { done: [1], current: 2 }, 'calSync.cnl:cal-sync:c1:a@b.c': { items: { e1: { gid: 'g' } }, ultima: null } });
  const remoto = { version: 1, valores: { idioma: 'en' }, marcas: { idioma: 5 } };
  const { svc, rem } = nuevo({ remoto, legado });
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  assert.equal(svc.get('idioma'), 'en', 'lo de Drive manda sobre el espejo antiguo');
  assert.equal(svc.get('calendario.vista'), 'semana');
  assert.deepEqual(svc.get('tutorial'), { done: [1], current: 2 });
  assert.equal(rem.dato.valores['calendario.vista'], 'semana', 'y se sube a Drive');
  assert.ok(rem.dato.valores['calSync.cnl:cal-sync:c1:a@b.c'].items.e1);
});

// ---------- servicio: fallos de red ----------
test('servicio: fallo de red -> estado offline, los cambios quedan en la cola y se reintentan', async () => {
  const { svc, rem, rj, almacen } = nuevo();
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  rem.fallo = offline();
  svc.set('idioma', 'en');
  await rj.avanza();
  assert.equal(svc.estado, 'offline');
  assert.deepEqual(svc.pendientes, ['idioma'], 'sigue en la cola');
  assert.deepEqual(rj.pendientes(), [30000], 'reintento programado');
  assert.deepEqual(JSON.parse(almacen.getItem('cnl:prefs')).pendientes, ['idioma'], 'la cola sobrevive a cerrar la pestaña');
  assert.equal(rem.dato, null);
  rem.fallo = null;
  await rj.avanza();
  assert.equal(svc.estado, 'sincronizado');
  assert.deepEqual(svc.pendientes, []);
  assert.equal(rem.dato.valores.idioma, 'en');
});

test('servicio: un error del servidor (no de red) deja estado error y conserva la cola', async () => {
  const { svc, rem, rj } = nuevo();
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
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

test('servicio: sin conexión no se llama a Drive; al volver la red se sube la cola', async () => {
  let enLinea = true;
  const { svc, rem } = nuevo({ enLinea: () => enLinea });
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  const lecturas = rem.lecturas;
  enLinea = false;
  svc.set('idioma', 'en');
  assert.equal(svc.estado, 'offline');
  await svc.flush();
  assert.equal(rem.lecturas, lecturas, 'ninguna petición mientras no hay red');
  enLinea = true;
  await svc.volverLaRed();
  assert.equal(rem.dato.valores.idioma, 'en');
  assert.equal(svc.estado, 'sincronizado');
});

test('servicio: un cambio hecho mientras se sube sigue pendiente', async () => {
  const { svc, rem } = nuevo();
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  const escribir = rem.puerto.escribir;
  rem.puerto.escribir = async (o) => { svc.set('ultimoClub', 'durante'); await escribir(o); };
  svc.set('idioma', 'en');
  await svc.flush();
  assert.deepEqual(svc.pendientes, ['ultimoClub']);
  assert.equal(svc.estado, 'pendiente');
  rem.puerto.escribir = escribir;
  await svc.flush();
  assert.equal(rem.dato.valores.ultimoClub, 'durante');
  assert.deepEqual(svc.pendientes, []);
});

// ---------- servicio: varios ----------
test('servicio: desconectar() corta la sincronización y borra la caché de la cuenta', async () => {
  const { svc, rem, almacen } = nuevo();
  await svc.conectar({ remoto: rem.puerto, email: 'a@b.c' });
  svc.set('idioma', 'it');
  svc.desconectar();
  assert.equal(svc.estado, 'sin-sesion');
  assert.equal(almacen.getItem('cnl:prefs'), null);
  assert.equal(svc.get('idioma', 'es'), 'es');
});

test('servicio: comoAlmacenamiento hace de "storage" (JSON ida y vuelta) sobre un prefijo', () => {
  const { svc } = nuevo();
  const st = svc.comoAlmacenamiento(P.CLAVES.calSync);
  assert.equal(st.getItem('cnl:cal-sync:c1:a@b.c'), null);
  st.setItem('cnl:cal-sync:c1:a@b.c', JSON.stringify({ items: { e1: { gid: 'g1' } }, ultima: null }));
  assert.deepEqual(JSON.parse(st.getItem('cnl:cal-sync:c1:a@b.c')).items.e1, { gid: 'g1' });
  assert.deepEqual(svc.pendientes, ['calSync.cnl:cal-sync:c1:a@b.c']);
  st.setItem('x', 'no es json');
  assert.equal(st.getItem('x'), null);
});
