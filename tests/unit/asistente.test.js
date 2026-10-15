// Asistente de primer arranque (lógica), clasificación de errores de Google y adaptador de pruebas de Drive.
import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp } from '../helpers/env.js';
import { PASOS, validar, datosDelClub, crearClub, zonaDelNavegador, COLOR_PRIMARIO } from '../../js/application/asistenteClub.js';
import { clasificarErrorLogin, clasificarErrorApi, CODIGOS } from '../../js/domain/erroresGoogle.js';

setupEnv();
const { auth } = await importApp('js/auth.js');
const { drive } = await importApp('js/drive.js');
const { instalarFakeGoogle } = await importApp('js/infrastructure/fakeGoogle.js');
let fake = null;
describe('asistente, errores de Google y Drive simulado', () => {
afterEach(() => { if (fake) { fake.desinstalar(); fake = null; } localStorage.clear(); sessionStorage.clear(); });

// ---------- asistente ----------
test('asistente: dos pasos, nombre obligatorio y límites', () => {
  assert.deepEqual(PASOS, ['datos', 'aspecto']);
  assert.deepEqual(validar({ nombre: '' }, 'datos').errores, { nombre: 'nombre-vacio' });
  assert.deepEqual(validar({ nombre: '   ' }, 'datos').errores, { nombre: 'nombre-vacio' });
  assert.deepEqual(validar({ nombre: 'A' }, 'datos').errores, { nombre: 'nombre-corto' });
  assert.deepEqual(validar({ nombre: 'x'.repeat(61) }, 'datos').errores, { nombre: 'nombre-largo' });
  assert.deepEqual(validar({ nombre: 'Club', lema: 'y'.repeat(121) }, 'datos').errores, { lema: 'lema-largo' });
  assert.equal(validar({ nombre: 'Club Natación' }, 'datos').ok, true);
});

test('asistente: paso de aspecto valida colores y zona horaria', () => {
  assert.equal(validar({ colorPrimario: '#1a73e8', colorSecundario: '#0b3d91', zonaHoraria: 'Europe/Madrid' }, 'aspecto').ok, true);
  assert.equal(validar({}, 'aspecto').ok, true, 'todo opcional: hay valores por defecto');
  assert.deepEqual(validar({ colorPrimario: 'rojo', colorSecundario: '#12', zonaHoraria: 'Marte/Olimpo' }, 'aspecto').errores,
    { colorPrimario: 'color', colorSecundario: 'color', zonaHoraria: 'zona' });
  assert.equal(validar({ nombre: '' }, 'todo').ok, false);
});

test('asistente: datosDelClub rellena valores por defecto y limpia espacios', () => {
  const c = datosDelClub({ nombre: '  Club Lugones ', lema: ' Pequeño ', colorPrimario: 'mal' });
  assert.equal(c.nombre, 'Club Lugones');
  assert.equal(c.lema, 'Pequeño');
  assert.equal(c.colorPrimario, COLOR_PRIMARIO);
  assert.match(c.colorSecundario, /^#[0-9a-f]{6}$/i);
  assert.equal(c.zonaHoraria, zonaDelNavegador());
  assert.equal(datosDelClub({ nombre: 'X', zonaHoraria: 'America/Mexico_City' }).zonaHoraria, 'America/Mexico_City');
  assert.equal('logo' in c, false, 'club nuevo sin datos de ejemplo');
});

test('asistente: crearClub crea el fichero en cnl y devuelve la identidad elegida', async () => {
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true } });
  await auth.init();
  const r = await crearClub({ drive, datos: { nombre: ' Club Nuevo ', lema: 'Lema', colorPrimario: '#e91e63' } });
  assert.equal(r.ref.name, 'Club Nuevo');
  assert.equal(r.club.colorPrimario, '#e91e63');
  assert.deepEqual(fake.clubs().map((c) => c.name), ['Club Nuevo']);
  assert.deepEqual(fake.club(r.ref.id).doc, { version: 1, club: {}, hojas: {} }, 'el fichero nace vacío');
  assert.deepEqual((await drive.listClubs()).map((c) => c.name), ['Club Nuevo']);
});

test('asistente: crearClub rechaza datos inválidos sin tocar Drive', async () => {
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true } });
  await auth.init();
  await assert.rejects(crearClub({ drive, datos: { nombre: '' } }), (e) => e.code === 'datos-invalidos' && e.errores.nombre === 'nombre-vacio');
  assert.equal(fake.clubs().length, 0);
});

test('asistente: si Drive falla el error se propaga con su código (para mostrar la ayuda)', async () => {
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true, fallos: { crearClub: 'offline' } } });
  await auth.init();
  await assert.rejects(crearClub({ drive, datos: { nombre: 'Club' } }), (e) => e.offline === true);
});

// ---------- errores de Google ----------
test('errores de login: popup bloqueado, cerrado, acceso denegado, origen y red', () => {
  assert.equal(clasificarErrorLogin({ type: 'popup_failed_to_open' }), 'popup-bloqueado');
  assert.equal(clasificarErrorLogin({ type: 'popup_closed' }), 'popup-cerrado');
  assert.equal(clasificarErrorLogin({ error: 'access_denied' }), 'acceso-denegado');
  assert.equal(clasificarErrorLogin(new Error('access_blocked: app not verified')), 'acceso-denegado');
  assert.equal(clasificarErrorLogin({ error: 'invalid_request', error_description: 'origin_mismatch' }), 'origen-no-autorizado');
  assert.equal(clasificarErrorLogin(new Error('Error 400: redirect_uri_mismatch')), 'origen-no-autorizado');
  assert.equal(clasificarErrorLogin(new Error('No se pudo cargar Google Identity Services')), 'sin-gis');
  assert.equal(clasificarErrorLogin(new TypeError('Failed to fetch')), 'sin-conexion');
  assert.equal(clasificarErrorLogin({ offline: true }), 'sin-conexion');
  assert.equal(clasificarErrorLogin(null), 'desconocido');
  assert.equal(clasificarErrorLogin('algo raro'), 'desconocido');
});

test('errores de la API: API no activada con enlace de activación, permisos, límite', () => {
  const cuerpo = { error: { code: 403, message: 'Google Drive API has not been used in project 424242 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }],
    details: [{ reason: 'SERVICE_DISABLED', metadata: { activationUrl: 'https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=424242', serviceTitle: 'Google Drive API' } }] } };
  const a = clasificarErrorApi(403, cuerpo);
  assert.equal(a.codigo, 'api-desactivada');
  assert.match(a.enlace, /project=424242/);
  assert.equal(a.servicio, 'Google Drive API');
  // sin detalles: se deduce el proyecto del mensaje
  const b = clasificarErrorApi(403, JSON.stringify({ error: { message: 'API has not been used in project 777 before or it is disabled' } }));
  assert.equal(b.codigo, 'api-desactivada');
  assert.match(b.enlace, /drive\.googleapis\.com\?project=777/);
  assert.equal(clasificarErrorApi(403, { error: { message: 'insufficientPermissions' } }).codigo, 'sin-permiso');
  assert.equal(clasificarErrorApi(403, { error: { errors: [{ reason: 'userRateLimitExceeded' }] } }).codigo, 'limite');
  assert.equal(clasificarErrorApi(429, '').codigo, 'limite');
  assert.equal(clasificarErrorApi(401, 'x').codigo, 'sesion-caducada');
  assert.equal(clasificarErrorApi(404, 'x').codigo, 'no-encontrado');
  assert.equal(clasificarErrorApi(500, 'x').codigo, 'desconocido');
});

test('todos los códigos de error tienen texto en es, en e it', async () => {
  const { t, setLang } = await importApp('js/i18n.js');
  for (const l of ['es', 'en', 'it']) {
    setLang(l);
    for (const c of CODIGOS) assert.notEqual(t('gerr.' + c), 'gerr.' + c, `${l} gerr.${c}`);
  }
  setLang('es');
});

// ---------- Drive simulado ----------
test('Drive simulado: misma interfaz que drive.js (clubes, lectura/escritura, preferencias, ficheros)', async () => {
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true } });
  await auth.init();
  assert.deepEqual(await drive.listClubs(), []);
  const c = await drive.createClub('Mi Club');
  assert.match(c.url, /drive\.google\.com/);
  const m0 = await drive.meta(c.id);
  const w = await drive.write(c.id, { version: 1, club: { nombre: 'Mi Club' }, hojas: {} });
  assert.notEqual(w.rev, m0.rev);
  assert.equal((await drive.read(c.id)).doc.club.nombre, 'Mi Club');
  await drive.renameClub(c.id, 'Otro');
  assert.deepEqual((await drive.listClubs()).map((x) => x.name), ['Otro']);
  assert.equal(await drive.leerPreferencias(), null);
  await drive.guardarPreferencias({ version: 1, valores: { idioma: 'en' }, marcas: { idioma: 1 } });
  assert.equal((await drive.leerPreferencias()).valores.idioma, 'en');
  const carpeta = await drive.ensureFolderPath(['entrenos']);
  const f = await drive.upload({ name: 's.pdf', mimeType: 'application/pdf', body: new Blob(['x']), parentId: carpeta });
  assert.equal((await drive.findFile('s.pdf', carpeta)).id, f.id);
  await drive.deleteFile(f.id);
  assert.equal(await drive.findFile('s.pdf', carpeta), null);
  await assert.rejects(drive.read('nada'), (e) => e.status === 404);
});

test('Drive simulado: sin sesión pide iniciar sesión; los datos sobreviven a recargar (espejo en localStorage)', async () => {
  fake = instalarFakeGoogle({ auth, drive, opciones: {} });
  await auth.init();
  await assert.rejects(drive.listClubs(), (e) => e.status === 401);
  await auth.signIn();
  const c = await drive.createClub('Persistente');
  fake.desinstalar();
  fake = instalarFakeGoogle({ auth, drive, opciones: {} }); // "recarga": lee 'cnl:test:drive'
  await auth.init();
  assert.deepEqual((await drive.listClubs()).map((x) => x.id), [c.id]);
});

test('Drive simulado: opción demo prepara un club y siembra los datos de demostración una sola vez', async () => {
  const { store } = await importApp('js/store.js');
  fake = instalarFakeGoogle({ auth, drive, opciones: { sesion: true, demo: true, club: 'Club Demo' } });
  await auth.init();
  const [club] = await drive.listClubs();
  assert.equal(club.name, 'Club Demo');
  await store.init(club);
  assert.equal(fake.despuesDeAbrirClub(store), true);
  assert.ok(store.list('Nadadores').length > 0);
  assert.equal(fake.despuesDeAbrirClub(store), false, 'no se vuelve a sembrar');
});
});
