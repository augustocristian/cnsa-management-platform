import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as D from '../../js/domain/backup.js';
import { crearBackupCrypto, aBase64, deBase64 } from '../../js/infrastructure/backupCrypto.js';
import { SHEETS } from '../../js/schema.js';
import { RELACIONES } from '../../js/sheetdata.js';

const hash = async (texto) => createHash('sha256').update(texto).digest('hex');
const fecha = new Date(2026, 9, 16, 15, 30, 12); // 16 Oct 2026 15:30 local

const hojasBase = () => ({
  Nadadores: [{ id: 'n1', nombre: 'Lucía' }, { id: 'n2', nombre: 'Pelayo' }],
  Grupos: [{ id: 'g1', nombre: 'Alevín' }],
  Hoja_futura: [{ id: 'x1', dato: 1 }],
});
async function backupBase(extra = {}) {
  return D.construirBackup({
    nombre: 'Club Natación Lugones', club: { nombre: 'Club Natación Lugones', lema: 'Pequeño gran club' }, hojas: hojasBase(), top: { campoFuturo: { a: 1 } },
    preferencias: { idioma: 'es' }, appVersion: '1.0.0', docVersion: 1, creado: fecha.toISOString(), ...extra,
  }, hash);
}

// ---------- canonical JSON and checksum ----------
test('canonico: same text regardless of key order; undefined is dropped', () => {
  assert.equal(D.canonico({ b: 1, a: [2, { d: 1, c: undefined }] }), D.canonico({ a: [2, { c: undefined, d: 1 }], b: 1 }));
  assert.equal(D.canonico({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(D.canonico([undefined, null]), '[null,null]');
});

test('construirBackup: format, counts, unknown sheets and sha256 checksum', async () => {
  const doc = await backupBase();
  assert.equal(doc.format, 'cnl-backup');
  assert.equal(doc.formatVersion, 1);
  assert.equal(doc.club.name, 'Club Natación Lugones');
  assert.deepEqual(doc.counts, { Nadadores: 2, Grupos: 1, Hoja_futura: 1 });
  assert.deepEqual(doc.sheets.Hoja_futura, [{ id: 'x1', dato: 1 }]); // unknown sheet preserved
  assert.deepEqual(doc.extra.top, { campoFuturo: { a: 1 } });
  assert.match(doc.checksum, /^sha256:[0-9a-f]{64}$/);
  assert.equal(doc.checksum, await D.calcularChecksum(doc, hash));
  assert.equal(D.totalFilas(doc.counts), 4);
});

// ---------- validation ----------
const opciones = { hash, esquema: SHEETS, docVersion: 1 };

test('validarBackup: a correct backup is valid and survives a JSON round trip', async () => {
  const doc = JSON.parse(JSON.stringify(await backupBase()));
  const v = await D.validarBackup(doc, opciones);
  assert.equal(v.ok, true, JSON.stringify(v));
});

test('validarBackup: not a backup / future version / invalid version', async () => {
  assert.equal((await D.validarBackup({ version: 1, hojas: {} }, opciones)).errores[0].codigo, 'no-es-backup');
  assert.equal((await D.validarBackup(null, opciones)).errores[0].codigo, 'no-es-backup');
  const futura = { ...(await backupBase()), formatVersion: 2 };
  const v = await D.validarBackup(futura, opciones);
  assert.equal(v.ok, false);
  assert.equal(v.errores[0].codigo, 'version-futura');
  assert.equal(v.errores[0].version, 2);
  assert.equal((await D.validarBackup({ ...(await backupBase()), formatVersion: 'x' }, opciones)).errores[0].codigo, 'version-invalida');
});

test('validarBackup: altered checksum, tampered data or missing checksum = damaged', async () => {
  const doc = await backupBase();
  const manipulado = JSON.parse(JSON.stringify(doc));
  manipulado.sheets.Nadadores[0].nombre = 'Otro';
  assert.equal((await D.validarBackup(manipulado, opciones)).errores[0].codigo, 'danado');
  const mal = { ...doc, checksum: 'sha256:' + '0'.repeat(64) };
  assert.equal((await D.validarBackup(mal, opciones)).errores[0].codigo, 'danado');
  const sin = { ...doc }; delete sin.checksum;
  const v = await D.validarBackup(sin, opciones);
  assert.equal(v.errores[0].codigo, 'danado');
  assert.equal(v.errores[0].motivo, 'sin-checksum');
});

test('validarBackup: structure (known sheet that is not a list, rows that are not objects) and limits', async () => {
  const mk = (sheets) => D.construirBackup({ nombre: 'C', club: {}, hojas: sheets, docVersion: 1, creado: fecha.toISOString() }, hash);
  const a = await D.validarBackup(await mk({ Nadadores: 'no' }), opciones);
  assert.equal(a.ok, false);
  assert.deepEqual(a.errores[0], { codigo: 'estructura', hoja: 'Nadadores', detalle: 'hoja' });
  const b = await D.validarBackup(await mk({ Nadadores: [1, 2] }), opciones);
  assert.equal(b.errores[0].detalle, 'fila');
  // a sheet this version does not know may hold anything
  assert.equal((await D.validarBackup(await mk({ Futura: 'lo que sea' }), opciones)).ok, true);
  const c = await D.validarBackup(await mk({ Nadadores: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }), { ...opciones, maxFilas: 2 });
  assert.equal(c.errores[0].codigo, 'demasiadas-filas');
  const d = await D.validarBackup(await mk({ Nadadores: [{ id: 'a' }, { nombre: 'sin id' }] }), opciones);
  assert.equal(d.ok, true);
  assert.deepEqual(d.avisos.find((x) => x.codigo === 'filas-sin-id'), { codigo: 'filas-sin-id', n: 1 });
});

test('validarBackup: data from a newer document version is rejected', async () => {
  const doc = await backupBase({ docVersion: 3 });
  const v = await D.validarBackup(doc, opciones);
  assert.equal(v.errores[0].codigo, 'documento-futuro');
});

test('documentoABackup / aDocumentoClub: daily Drive copy = club document', () => {
  const clubDoc = { version: 1, club: { nombre: 'A' }, hojas: { Nadadores: [{ id: '1' }], Banador: [{ id: 'b' }] }, sync: { reloj: 4 }, extraTop: 7 };
  assert.equal(D.esDocumentoClub(clubDoc), true);
  assert.equal(D.esDocumentoClub({ format: 'cnl-backup' }), false);
  const b = D.documentoABackup(clubDoc, { retiradas: ['Banador'] });
  assert.equal(b.club.name, 'A');
  assert.deepEqual(Object.keys(b.sheets), ['Nadadores']);
  assert.deepEqual(b.extra.top, { extraTop: 7 });
  const vuelta = D.aDocumentoClub(b);
  assert.equal(vuelta.version, 1);
  assert.equal(vuelta.extraTop, 7);
  assert.deepEqual(vuelta.hojas.Nadadores, [{ id: '1' }]);
});

test('prefsDeUsuario: only sanitised user preferences (never calSync nor last club)', () => {
  const p = D.prefsDeUsuario({ idioma: 'it', tema: 'dark', 'calendario.vista': 'mes', 'calSync.x': { items: {} }, ultimoClub: 'abc', clubes: [], tutorial: {}, idioma2: 'x', 'calendario.alarmaMin': 999 });
  assert.deepEqual(p, { idioma: 'it', tema: 'dark', 'calendario.vista': 'mes' });
  assert.deepEqual(D.prefsDeUsuario({ idioma: 'zz' }), {});
});

// ---------- summary and comparison ----------
test('resumenBackup: club, date, counts and unknown sheets', async () => {
  const r = D.resumenBackup(await backupBase(), { esquema: SHEETS });
  assert.equal(r.club, 'Club Natación Lugones');
  assert.equal(r.total, 4);
  assert.equal(r.nadadores, 2);
  assert.deepEqual(r.hojasDesconocidas, ['Hoja_futura']);
  assert.deepEqual(r.preferencias, ['idioma']);
});

const fila = (hoja, parcial) => Object.fromEntries([...SHEETS[hoja].map((c) => [c, '']), ...Object.entries(parcial)]);

test('compararConActual: new, changed, removed and equal rows per sheet and in the club identity', async () => {
  const doc = await D.construirBackup({
    nombre: 'C', club: { nombre: 'C', lema: 'Nuevo', color: 'rojo' }, docVersion: 1, creado: fecha.toISOString(),
    hojas: { Nadadores: [fila('Nadadores', { id: 'n1', nombre: 'Igual' }), fila('Nadadores', { id: 'n2', nombre: 'Cambiado' }), fila('Nadadores', { id: 'n3', nombre: 'Nuevo' })] },
  }, hash);
  const actual = {
    club: { nombre: 'Otro nombre', lema: 'Viejo', extra: 'sobra' },
    hojas: { Nadadores: [fila('Nadadores', { id: 'n1', nombre: 'Igual' }), fila('Nadadores', { id: 'n2', nombre: 'Antes' }), fila('Nadadores', { id: 'n9', nombre: 'Solo ahora' })], Grupos: [fila('Grupos', { id: 'g1' })] },
  };
  const c = D.compararConActual(doc, actual, { esquema: SHEETS });
  const nad = c.hojas.find((x) => x.hoja === 'Nadadores');
  assert.deepEqual({ ...nad }, { hoja: 'Nadadores', enBackup: 3, actuales: 3, nuevas: 1, cambiadas: 1, eliminadas: 1, iguales: 1 });
  assert.equal(c.hojas.find((x) => x.hoja === 'Grupos').eliminadas, 1);
  assert.deepEqual(c.club, { nuevas: 1, cambiadas: 1, eliminadas: 1 }); // the name is not compared
  assert.equal(c.hayCambios, true);
  assert.deepEqual(c.total, { nuevas: 2, cambiadas: 2, eliminadas: 3 });
  const igual = D.compararConActual(doc, { club: { ...doc.club.data }, hojas: doc.sheets }, { esquema: SHEETS });
  assert.equal(igual.hayCambios, false);
});

test('diferenciarFilas: the comparison ignores row order and equivalent empty values', () => {
  const d = D.diferenciarFilas([{ id: '1', a: '' }, { id: '2', a: 'x' }], [{ id: '2', a: 'x' }, { id: '1', a: null }], ['id', 'a']);
  assert.deepEqual({ ...d }, { nuevas: [], cambiadas: [], eliminadas: [], iguales: 2 });
});

test('separarInvalidas: rows the store would reject are set aside and counted', () => {
  const r = D.separarInvalidas('Nadadores', [fila('Nadadores', { id: 'a', fechaNacimiento: '2015-03-04' }), fila('Nadadores', { id: 'b', fechaNacimiento: '2015-02-31' })], '2026-10-16');
  assert.deepEqual(r.filas.map((f) => f.id), ['a']);
  assert.equal(r.omitidas[0].id, 'b');
});

test('excluirBorradosRgpd: permanently deleted rows and their children do not come back', () => {
  const hojas = {
    Nadadores: [{ id: 'n1' }, { id: 'n2' }], Asistencia: [{ id: 'a1', nadadorId: 'n1', entrenamientoId: 'e1' }, { id: 'a2', nadadorId: 'n2', entrenamientoId: 'e1' }],
    Marcas: [{ id: 'm1', nadadorId: 'n1' }], Entrenamientos: [{ id: 'e1' }],
  };
  const lapidas = { Nadadores: { n1: { s: '3@x', h: 1 } }, Entrenamientos: { e1: { s: '2@x' } } }; // e1: normal deletion, does not count
  const r = D.excluirBorradosRgpd(hojas, lapidas, RELACIONES);
  assert.deepEqual(r.hojas.Nadadores.map((x) => x.id), ['n2']);
  assert.deepEqual(r.hojas.Asistencia.map((x) => x.id), ['a2']);
  assert.deepEqual(r.hojas.Marcas, []);
  assert.equal(r.hojas.Entrenamientos.length, 1);
  assert.equal(r.excluidas, 3);
  assert.deepEqual(D.lapidasPermanentes({ lapidas }), { Nadadores: { n1: { h: 1 } } });
});

// ---------- file names ----------
test('nombreFichero: cnl-backup-<club>-YYYY-MM-DD-HHMM.json', () => {
  assert.equal(D.nombreFichero('Club Natación Lugones', fecha), 'cnl-backup-club-natacion-lugones-2026-10-16-1530.json');
  assert.equal(D.nombreFichero('Club Natación Lugones', fecha, { cifrada: true }), 'cnl-backup-club-natacion-lugones-2026-10-16-1530-encrypted.json');
  assert.equal(D.nombreFichero('', fecha), 'cnl-backup-club-2026-10-16-1530.json');
  assert.equal(D.slug('  ¡¡Ñandú / Club??  '), 'nandu-club');
  assert.ok(D.slug('x'.repeat(100)).length <= 40);
});

test('analizarNombreDrive: daily, before import and before restore', () => {
  assert.deepEqual(D.analizarNombreDrive('Club-20261015.json', 'Club-'), { tipo: 'diario', fecha: '2026-10-15', hora: '' });
  assert.deepEqual(D.analizarNombreDrive('Club-import-20261015143005.json', 'Club-'), { tipo: 'importacion', fecha: '2026-10-15', hora: '14:30' });
  assert.deepEqual(D.analizarNombreDrive('Club-restore-20261015143005.json', 'Club-'), { tipo: 'restauracion', fecha: '2026-10-15', hora: '14:30' });
  assert.equal(D.analizarNombreDrive('Club-2-20261015.json', 'Club-'), null); // another club whose name starts like this one
  assert.equal(D.analizarNombreDrive('Otro-20261015.json', 'Club-'), null);
});

// ---------- passphrase ----------
test('evaluarPassphrase: empty, short, weak, medium, strong', () => {
  assert.equal(D.evaluarPassphrase('').clave, 'vacia');
  assert.equal(D.evaluarPassphrase('abc').clave, 'corta');
  assert.equal(D.evaluarPassphrase('aaaaaaaaaa').clave, 'debil');
  assert.equal(D.evaluarPassphrase('abcdefgh').clave, 'debil');
  assert.equal(D.evaluarPassphrase('abcdefgh12').clave, 'media');
  assert.equal(D.evaluarPassphrase('Correcto-Caballo-Pila-9').clave, 'fuerte');
  assert.equal(D.passphraseValida('abc'), false);
  assert.equal(D.passphraseValida('abcdefgh'), true);
});

// ---------- encrypted envelope ----------
const cripto = crearBackupCrypto({ iteraciones: 1000 });

test('crypto: base64 round trip and sha256', async () => {
  const bytes = new Uint8Array([0, 1, 2, 250, 255]);
  assert.deepEqual([...deBase64(aBase64(bytes))], [...bytes]);
  assert.equal(await cripto.sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('encryption: round trip with the correct passphrase (unicode) and well-formed envelope', async () => {
  const texto = JSON.stringify(await backupBase());
  const sobre = await cripto.cifrar(texto, 'contraseña-ñ-ç 123');
  assert.equal(sobre.format, 'cnl-backup-encrypted');
  assert.equal(sobre.kdf, 'PBKDF2-SHA256');
  assert.equal(sobre.cipher, 'AES-GCM');
  assert.equal(sobre.iterations, 1000);
  assert.equal(D.validarSobre(sobre).ok, true);
  assert.ok(!sobre.ciphertext.includes('Lucía'));
  assert.equal(await cripto.descifrar(sobre, 'contraseña-ñ-ç 123'), texto);
  // two encryptions of the same text differ (random salt and iv)
  assert.notEqual((await cripto.cifrar(texto, 'contraseña-ñ-ç 123')).ciphertext, sobre.ciphertext);
});

test('encryption: wrong passphrase or tampered envelope = passphrase-incorrecta', async () => {
  const sobre = await cripto.cifrar('hola', 'una-buena-clave');
  await assert.rejects(cripto.descifrar(sobre, 'otra-clave-distinta'), (e) => e.code === 'passphrase-incorrecta');
  const trucado = { ...sobre, ciphertext: aBase64(Uint8Array.from(deBase64(sobre.ciphertext), (b, i) => (i === 0 ? b ^ 1 : b))) };
  await assert.rejects(cripto.descifrar(trucado, 'una-buena-clave'), (e) => e.code === 'passphrase-incorrecta');
  // changing the iterations (bound as authenticated data) also fails
  await assert.rejects(cripto.descifrar({ ...sobre, iterations: 1001 }, 'una-buena-clave'), (e) => e.code === 'passphrase-incorrecta');
});

test('validarSobre: structure, out-of-range iterations and future version', async () => {
  const sobre = await cripto.cifrar('x', 'una-buena-clave');
  assert.equal(D.validarSobre({ ...sobre, formatVersion: 2 }).errores[0].codigo, 'version-futura');
  assert.equal(D.validarSobre({ ...sobre, iterations: 5 }).errores[0].codigo, 'estructura');
  assert.equal(D.validarSobre({ ...sobre, iterations: 1e9 }).errores[0].codigo, 'estructura');
  assert.equal(D.validarSobre({ ...sobre, kdf: 'MD5' }).errores[0].codigo, 'estructura');
  assert.equal(D.validarSobre({ ...sobre, iv: '***' }).errores[0].codigo, 'estructura');
  assert.equal(D.validarSobre({ format: 'otra' }).errores[0].codigo, 'no-es-backup');
  await assert.rejects(cripto.descifrar({ ...sobre, iv: '***' }, 'x'), (e) => e.code === 'estructura');
});

test('encryption: without WebCrypto the code sin-cifrado is reported', async () => {
  const sin = crearBackupCrypto({ cripto: {} });
  assert.equal(sin.disponible, false);
  await assert.rejects(sin.cifrar('x', 'abcdefgh'), (e) => e.code === 'sin-cifrado');
});
