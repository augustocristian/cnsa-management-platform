import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { crearBackupService } from '../../js/application/backupService.js';
import { crearBackupCrypto } from '../../js/infrastructure/backupCrypto.js';
import { crearBackupsDrive } from '../../js/infrastructure/backupDrive.js';
import { SHEETS, ENTITY_SHEETS } from '../../js/schema.js';
import { dataToDoc, metaVacia } from '../../js/sheetdata.js';
import { validarFila, errorValidacion } from '../../js/domain/validacion.js';

const hash = async (t) => createHash('sha256').update(t).digest('hex');
const cripto = crearBackupCrypto({ iteraciones: 1000 });
const AHORA = new Date(2026, 9, 16, 15, 30, 12);
const fila = (hoja, p) => Object.fromEntries([...SHEETS[hoja].map((c) => [c, '']), ...Object.entries(p)]);

// In-memory repository with the same contract as the store (documento/list/upsertMany/removeMany/club/setClub...)
function repoMem({ hojas = {}, club = { nombre: 'Club Test' }, extra, lapidas = {}, mode = 'drive' } = {}) {
  const db = Object.fromEntries(ENTITY_SHEETS.map((s) => [s, (hojas[s] || []).map((r) => ({ ...r }))]));
  const r = {
    db, club: { ...club }, extra: extra || { top: {}, hojas: {}, cols: {} }, lapidas, mode, soloLectura: null, pendiente: false,
    clubRef: { id: 'c1', name: club.nombre }, escrituras: [], fallarEn: null, migraciones: 0,
    documento: () => dataToDoc({ db: r.db, club: r.club, meta: { ...metaVacia(), reloj: 5, lapidas: r.lapidas }, extra: r.extra }),
    list: (s) => r.db[s].map((x) => ({ ...x })),
    upsertMany(s, rows) {
      if (r.fallarEn === s) throw new Error('simulated failure on ' + s);
      rows.forEach((x) => { const e = validarFila(s, x); if (e.length) throw errorValidacion(s, e); });
      r.escrituras.push(['upsert', s, rows.length]);
      rows.forEach((x) => { const i = r.db[s].findIndex((y) => y.id === x.id); if (i >= 0) r.db[s][i] = { ...x }; else r.db[s].push({ ...x }); });
      return rows;
    },
    removeMany(s, ids) {
      r.escrituras.push(['remove', s, ids.length]);
      ids.forEach((id) => { (r.lapidas[s] ||= {})[id] = { s: '9@t' }; });
      r.db[s] = r.db[s].filter((x) => !ids.includes(x.id));
      return ids.length;
    },
    setClub(o) { r.escrituras.push(['club']); r.club = { ...r.club, ...o }; },
    migrar() { r.migraciones++; return false; },
    aplicarExtras(n, { reemplazar }) {
      const sig = reemplazar ? { top: { ...n.top }, hojas: { ...n.hojas }, cols: { ...n.cols } } : { top: { ...r.extra.top, ...n.top }, hojas: { ...r.extra.hojas, ...n.hojas }, cols: { ...r.extra.cols, ...n.cols } };
      if (JSON.stringify(sig) === JSON.stringify(r.extra)) return false;
      r.escrituras.push(['extras']);
      r.extra = sig;
      return true;
    },
    async sync() { r.sincronizaciones = (r.sincronizaciones || 0) + 1; },
  };
  return r;
}

const prefsMem = (valores = {}) => ({ valores: { ...valores }, get: (k, d) => (k in prefsMem.v(valores) ? valores[k] : d), set(k, v) { valores[k] = v; } });
prefsMem.v = (x) => x;

function driveFalso() {
  const archivos = new Map();
  let n = 0;
  const d = {
    archivos, eventos: [], fallar: false,
    prefijo: 'Club Test-',
    async guardarSeguridad(club, doc, fecha) {
      if (d.fallar) throw new Error('Drive unavailable');
      const id = 'seg' + (++n);
      const nombre = `Club Test-restore-2026101615301${n}.json`;
      archivos.set(id, { id, name: nombre, modified: fecha.toISOString(), contenido: JSON.parse(JSON.stringify(doc)) });
      d.eventos.push('seguridad');
      return { id, nombre };
    },
    async listar() { return { prefijo: d.prefijo, archivos: [...archivos.values()].map((a) => ({ id: a.id, name: a.name, modified: a.modified })) }; },
    async leer(id) { return JSON.parse(JSON.stringify(archivos.get(id).contenido)); },
    async eliminar(id) { archivos.delete(id); },
    poner(id, name, contenido) { archivos.set(id, { id, name, modified: '', contenido }); },
  };
  return d;
}

function montar({ repo = repoMem(), prefs = {}, drive = null, descargas = [], categorias = null } = {}) {
  const preferencias = prefsMem(prefs);
  const svc = crearBackupService({
    repo, preferencias, hash, crypto: cripto, ahora: () => AHORA, appVersion: '1.0.0', driveBackups: drive, categorias,
    archivos: { descargar: async (blob, nombre) => { descargas.push({ blob, nombre }); } },
  });
  return { svc, repo, preferencias, prefs, drive, descargas };
}

const datosBase = () => ({
  Nadadores: [fila('Nadadores', { id: 'n1', nombre: 'Lucía', fechaNacimiento: '2015-03-04' }), fila('Nadadores', { id: 'n2', nombre: 'Pelayo', fechaNacimiento: '2013-01-02' })],
  Grupos: [fila('Grupos', { id: 'g1', nombre: 'Alevín' })],
  Marcas: [fila('Marcas', { id: 'm1', nadadorId: 'n1', fecha: '2026-05-01', prueba: '50 libre', piscina: '25', tiempoMs: 31000 })],
});
const clubBase = { nombre: 'Club Test', lema: 'Lema', colorPrimario: '#112233' };
const textoDe = async (blob) => JSON.parse(await blob.text());

// ---------- creating ----------
test('crearBackup: full backup with unknown sheets, user preferences and valid checksum', async () => {
  const repo = repoMem({ hojas: datosBase(), club: clubBase, extra: { top: { campoFuturo: 1 }, hojas: { HojaFutura: [{ id: 'f1', x: 1 }] }, cols: { Nadadores: { n1: { columnaFutura: 'z' } } } } });
  const { svc } = montar({ repo, prefs: { idioma: 'en', tema: 'dark', 'calSync.cuenta': { items: {} }, ultimoClub: 'c1' } });
  const r = await svc.crearBackup();
  const doc = await textoDe(r.blob);
  assert.equal(doc.format, 'cnl-backup');
  assert.equal(r.nombre, 'cnl-backup-club-test-2026-10-16-1530.json');
  assert.equal(doc.club.name, 'Club Test');
  assert.equal(doc.counts.Nadadores, 2);
  assert.deepEqual(doc.sheets.HojaFutura, [{ id: 'f1', x: 1 }]);
  assert.equal(doc.sheets.Nadadores.find((x) => x.id === 'n1').columnaFutura, 'z'); // unknown column of a row
  assert.deepEqual(doc.extra.top, { campoFuturo: 1 });
  assert.deepEqual(doc.preferences, { idioma: 'en', tema: 'dark' }); // never per-account data
  assert.equal(r.resumen.total, doc.counts && Object.values(doc.counts).reduce((a, b) => a + b, 0));
  assert.equal((await svc.leerBackup(new Blob([JSON.stringify(doc)]))).doc.checksum, doc.checksum);
});

test('descargarBackup: delivers the file and remembers the last backup in the preferences', async () => {
  const m = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }) });
  const r = await m.svc.descargarBackup();
  assert.equal(m.descargas.length, 1);
  assert.equal(m.descargas[0].nombre, r.nombre);
  const u = m.svc.ultimaCopia();
  assert.equal(u.nombre, r.nombre);
  assert.equal(u.cifrada, false);
  assert.equal(u.filas, r.resumen.total);
  assert.equal(new Date(u.creada).getTime(), AHORA.getTime());
});

test('encrypted backup: needs the passphrase, a wrong one fails with a clear error and a short one is rejected', async () => {
  const repo = repoMem({ hojas: datosBase(), club: clubBase });
  const { svc } = montar({ repo });
  await assert.rejects(svc.crearBackup({ passphrase: 'corta' }), (e) => e.code === 'passphrase-corta');
  const r = await svc.crearBackup({ passphrase: 'una-clave-larga-1' });
  assert.equal(r.cifrada, true);
  assert.match(r.nombre, /-encrypted\.json$/);
  const texto = await r.blob.text();
  assert.ok(!texto.includes('Lucía'));
  await assert.rejects(svc.leerBackup(new Blob([texto])), (e) => e.code === 'requiere-passphrase');
  await assert.rejects(svc.leerBackup(new Blob([texto]), { passphrase: 'otra-clave-larga' }), (e) => e.code === 'passphrase-incorrecta');
  const ok = await svc.leerBackup(new Blob([texto]), { passphrase: 'una-clave-larga-1' });
  assert.equal(ok.cifrada, true);
  assert.equal(ok.doc.sheets.Nadadores.length, 2);
});

// ---------- reading ----------
test('leerBackup: file that is not JSON, not a backup, tampered with, from a future version or too large', async () => {
  const { svc } = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }) });
  await assert.rejects(svc.leerBackup(new Blob(['this is not json'])), (e) => e.code === 'ilegible');
  await assert.rejects(svc.leerBackup(new Blob([JSON.stringify({ hola: 1 })])), (e) => e.code === 'no-es-backup');
  const doc = await textoDe((await svc.crearBackup()).blob);
  const manipulado = JSON.parse(JSON.stringify(doc));
  manipulado.sheets.Nadadores[0].nombre = 'Cambiado';
  await assert.rejects(svc.leerBackup(new Blob([JSON.stringify(manipulado)])), (e) => e.code === 'danado');
  await assert.rejects(svc.leerBackup(new Blob([JSON.stringify({ ...doc, formatVersion: 7 })])), (e) => e.code === 'version-futura' && e.version === 7);
  await assert.rejects(svc.leerBackup({ size: 21 * 1024 * 1024, text: async () => '{}' }), (e) => e.code === 'demasiado-grande');
});

test('leerBackup: returns the per-sheet preview (new, changed, removed) against the current data', async () => {
  const origen = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }) });
  const doc = await textoDe((await origen.svc.crearBackup()).blob);
  const actual = datosBase();
  actual.Nadadores[1].nombre = 'Pelayo cambiado';
  actual.Nadadores.push(fila('Nadadores', { id: 'n3', nombre: 'Sobra', fechaNacimiento: '2012-01-01' }));
  const destino = montar({ repo: repoMem({ hojas: actual, club: { ...clubBase, lema: 'Otro' } }) });
  const r = await destino.svc.leerBackup(new Blob([JSON.stringify(doc)]));
  const nad = r.comparacion.hojas.find((h) => h.hoja === 'Nadadores');
  assert.equal(nad.cambiadas, 1);
  assert.equal(nad.eliminadas, 1);
  assert.equal(nad.iguales, 1);
  assert.equal(r.comparacion.club.cambiadas, 1);
  assert.equal(r.resumen.nadadores, 2);
});

// ---------- restoring ----------
async function preparar({ actual, copia, club = clubBase, clubActual = clubBase, ...resto } = {}) {
  const origen = montar({ repo: repoMem({ hojas: copia || datosBase(), club }) });
  const doc = await textoDe((await origen.svc.crearBackup()).blob);
  const drive = driveFalso();
  const m = montar({ repo: repoMem({ hojas: actual || {}, club: clubActual }), drive, ...resto });
  return { ...m, doc, drive };
}

test('restaurar (replace): leaves the data as in the backup, removes the surplus and saves a safety copy BEFORE', async () => {
  const actual = { Nadadores: [fila('Nadadores', { id: 'n2', nombre: 'Editado', fechaNacimiento: '2013-01-02' }), fila('Nadadores', { id: 'n9', nombre: 'Sobra', fechaNacimiento: '2010-01-01' })], Grupos: [] };
  const m = await preparar({ actual, clubActual: { nombre: 'Club Test', lema: 'Cambiado', extra: 'sobra' } });
  const orden = [];
  const guardar = m.drive.guardarSeguridad;
  m.drive.guardarSeguridad = async (...a) => { orden.push(['seguridad', m.repo.escrituras.length]); return guardar(...a); };
  const fases = [];
  const r = await m.svc.restaurar(m.doc, { modo: 'replace', onProgreso: (f) => fases.push(f) });
  assert.deepEqual(orden, [['seguridad', 0]]); // saved before any write
  assert.deepEqual(fases, ['validando', 'seguridad', 'aplicando', 'sincronizando', 'listo']);
  assert.deepEqual(m.repo.list('Nadadores').map((x) => x.id).sort(), ['n1', 'n2']);
  assert.equal(m.repo.list('Nadadores').find((x) => x.id === 'n2').nombre, 'Pelayo');
  assert.equal(m.repo.list('Marcas').length, 1);
  assert.equal(m.repo.club.lema, 'Lema');
  assert.equal(m.repo.club.extra, ''); // key not in the backup is blanked
  assert.equal(m.repo.club.nombre, 'Club Test');
  // tombstone for the removed row, so other devices converge
  assert.ok(m.repo.lapidas.Nadadores.n9);
  assert.equal(r.total.eliminadas >= 1, true);
  assert.equal(r.seguridad.destino, 'drive');
  assert.equal(m.drive.archivos.size, 1);
  const seg = [...m.drive.archivos.values()][0].contenido;
  assert.equal(seg.format, 'cnl-backup');
  assert.equal(seg.sheets.Nadadores.length, 2); // the safety copy holds the PREVIOUS data (n2 edited + n9)
  assert.ok(seg.sheets.Nadadores.some((x) => x.id === 'n9'));
  assert.equal(r.sincronizado, true);
  assert.equal(m.repo.sincronizaciones, 1);
  assert.equal(m.repo.migraciones, 1);
});

test('restaurar: if the safety copy cannot be saved NOTHING is touched', async () => {
  const m = await preparar({ actual: { Nadadores: [fila('Nadadores', { id: 'n9', nombre: 'Intacto', fechaNacimiento: '2010-01-01' })] } });
  m.drive.fallar = true;
  const antes = JSON.stringify(m.repo.documento());
  await assert.rejects(m.svc.restaurar(m.doc), (e) => e.code === 'seguridad-fallida');
  assert.equal(JSON.stringify(m.repo.documento()), antes);
  assert.deepEqual(m.repo.escrituras, []);
  assert.equal(m.svc.haySeguridad(), false);
});

test('restaurar: if it fails halfway the previous state is restored automatically', async () => {
  const actual = { Nadadores: [fila('Nadadores', { id: 'n9', nombre: 'Intacto', fechaNacimiento: '2010-01-01' })], Marcas: [] };
  const m = await preparar({ actual });
  m.repo.fallarEn = 'Marcas'; // Nadadores are written first, then Marcas fails
  const antes = m.repo.list('Nadadores');
  await assert.rejects(m.svc.restaurar(m.doc), (e) => e.code === 'restauracion-fallida' && e.revertido === true);
  m.repo.fallarEn = null;
  assert.deepEqual(m.repo.list('Nadadores').map((x) => x.id), antes.map((x) => x.id));
  assert.equal(m.repo.list('Marcas').length, 0);
});

test('restaurar (merge): adds what is missing, keeps the current data and removes NOTHING; rows deleted afterwards come back', async () => {
  const actual = {
    Nadadores: [fila('Nadadores', { id: 'n1', nombre: 'Lucía (editada hoy)', fechaNacimiento: '2015-03-04' }), fila('Nadadores', { id: 'n9', nombre: 'Solo actual', fechaNacimiento: '2010-01-01' })],
  };
  const m = await preparar({ actual, clubActual: { nombre: 'Club Test', lema: 'Mi lema actual' } });
  m.repo.lapidas.Nadadores = { n2: { s: '4@t' } }; // n2 was deleted after the backup: merge brings it back (that is the point of restoring)
  const r = await m.svc.restaurar(m.doc, { modo: 'merge' });
  const ids = m.repo.list('Nadadores').map((x) => x.id).sort();
  assert.deepEqual(ids, ['n1', 'n2', 'n9']);
  assert.equal(m.repo.list('Nadadores').find((x) => x.id === 'n1').nombre, 'Lucía (editada hoy)'); // current value wins
  assert.equal(m.repo.club.lema, 'Mi lema actual');
  assert.equal(m.repo.club.colorPrimario, '#112233'); // missing in the current club: filled in from the backup
  assert.equal(m.repo.list('Marcas').length, 1);
  assert.equal(r.total.eliminadas, 0);
  assert.ok(!m.repo.escrituras.some((e) => e[0] === 'remove'));
});

test('restaurar twice is idempotent: the second time writes nothing', async () => {
  const m = await preparar({ actual: { Grupos: [fila('Grupos', { id: 'gx', nombre: 'Sobra' })] } });
  await m.svc.restaurar(m.doc);
  const escrituras = m.repo.escrituras.length;
  const r2 = await m.svc.restaurar(m.doc);
  assert.equal(m.repo.escrituras.length, escrituras);
  assert.deepEqual(r2.total, { nuevas: 0, cambiadas: 0, eliminadas: 0 });
  assert.equal(r2.hojas.length, 0);
  assert.equal(m.repo.sincronizaciones, 1); // nothing to upload the second time
});

test('restaurar a backup from an earlier version: missing columns, retired sheet and unnormalised values', async () => {
  // A club document from before several columns existed (a daily copy from Drive)
  const antiguo = {
    version: 1, club: { nombre: 'Club Test', lema: 'Viejo' },
    hojas: {
      Nadadores: [{ id: 'v1', nombre: 'Antigua', apellidos: 'Sin columnas', fechaNacimiento: '2012-05-06', telefono: 600123456 }],
      Banador: [{ id: 'b1', nadadorId: 'v1', talla: 'M' }],
      ObjetivosCarga: [{ id: 'o1', tipo: 'Piernas', minSemanalM: 100, maxSemanalM: 900 }],
      Hoja_de_futuro: [{ id: 'f1' }],
    },
  };
  const m = montar({ repo: repoMem({ club: clubBase }), drive: driveFalso() });
  const r = await m.svc.leerBackup(new Blob([JSON.stringify(antiguo)]));
  assert.equal(r.origen, 'documento-club');
  await m.svc.restaurar(r.doc);
  const n = m.repo.list('Nadadores')[0];
  assert.equal(n.id, 'v1');
  assert.equal(n.categoriaManual, ''); // column that did not exist yet
  assert.equal(n.telefono, '600123456'); // number turned into text
  assert.equal(m.repo.list('ObjetivosCarga').length, 1); // migration is the store's job (migrar() is called)
  assert.ok(m.repo.migraciones >= 1);
  assert.equal(m.repo.documento().hojas.Banador, undefined); // retired sheet is not kept
  assert.deepEqual(m.repo.documento().hojas.Hoja_de_futuro, [{ id: 'f1' }]); // unknown sheet is
});

test('unknown sheets, columns and keys travel in the backup and are kept on restore', async () => {
  const extra = { top: { campoFuturo: { a: 1 } }, hojas: { HojaFutura: [{ id: 'f1', x: 1 }] }, cols: { Nadadores: { n1: { columnaFutura: 'z' } } } };
  const origen = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase, extra }) });
  const doc = await textoDe((await origen.svc.crearBackup()).blob);
  const destino = montar({ repo: repoMem({ club: clubBase }), drive: driveFalso() });
  await destino.svc.restaurar((await destino.svc.leerBackup(new Blob([JSON.stringify(doc)]))).doc);
  assert.deepEqual(destino.repo.extra.hojas, extra.hojas);
  assert.deepEqual(destino.repo.extra.top, extra.top);
  assert.deepEqual(destino.repo.extra.cols, extra.cols);
  assert.equal(destino.repo.documento().hojas.HojaFutura.length, 1);
});

test('invalid rows are skipped and reported; the rest is restored', async () => {
  const origen = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }) });
  const doc = await textoDe((await origen.svc.crearBackup()).blob);
  doc.sheets.Nadadores.push(fila('Nadadores', { id: 'malo', nombre: 'Fecha imposible', fechaNacimiento: '2015-02-31' }));
  delete doc.checksum;
  const firmado = await (await import('../../js/domain/backup.js')).calcularChecksum(doc, hash);
  doc.checksum = firmado;
  const m = montar({ repo: repoMem({ club: clubBase }), drive: driveFalso() });
  const lectura = await m.svc.leerBackup(new Blob([JSON.stringify(doc)]));
  assert.equal(lectura.comparacion.omitidas, 1);
  const r = await m.svc.restaurar(lectura.doc);
  assert.equal(r.omitidas, 1);
  assert.equal(m.repo.list('Nadadores').length, 2);
});

test('GDPR: permanently deleted rows (and their children) are not resurrected on restore', async () => {
  const m = await preparar();
  m.repo.lapidas = { Nadadores: { n1: { s: '8@t', h: 1 } } }; // erased for good after the backup
  const lectura = await m.svc.leerBackup(new Blob([JSON.stringify(m.doc)]));
  assert.ok(lectura.comparacion.excluidas >= 2); // n1 + her mark m1
  const r = await m.svc.restaurar(lectura.doc);
  assert.deepEqual(m.repo.list('Nadadores').map((x) => x.id), ['n2']);
  assert.equal(m.repo.list('Marcas').length, 0);
  assert.ok(r.excluidas >= 2);
});

test('read-only club (future version): nothing is restored', async () => {
  const m = await preparar();
  m.repo.soloLectura = { version: 9 };
  await assert.rejects(m.svc.restaurar(m.doc), (e) => e.code === 'solo-lectura');
  assert.deepEqual(m.repo.escrituras, []);
  assert.equal(m.drive.archivos.size, 0);
});

test('unknown mode and invalid backup are rejected before touching anything', async () => {
  const m = await preparar();
  await assert.rejects(m.svc.restaurar(m.doc, { modo: 'borrar-todo' }), (e) => e.code === 'modo-invalido');
  await assert.rejects(m.svc.restaurar({ ...m.doc, checksum: 'sha256:00' }), (e) => e.code === 'danado');
  assert.deepEqual(m.repo.escrituras, []);
});

test('preferences: language/theme are applied and account keys never are', async () => {
  const origen = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }), prefs: { idioma: 'it', tema: 'dark' } });
  const doc = await textoDe((await origen.svc.crearBackup()).blob);
  doc.preferences.ultimoClub = 'x'; doc.preferences['calSync.a'] = { items: {} }; // tampering outside the checksum is impossible; this is a hand-made doc
  const D = await import('../../js/domain/backup.js');
  doc.checksum = await D.calcularChecksum(doc, hash);
  const m = montar({ repo: repoMem({ club: clubBase }), prefs: { idioma: 'es' }, drive: driveFalso() });
  const r = await m.svc.restaurar(doc);
  assert.deepEqual(r.preferencias.sort(), ['idioma', 'tema']);
  assert.equal(m.prefs.idioma, 'it');
  assert.equal(m.prefs.tema, 'dark');
  assert.equal(m.prefs.ultimoClub, undefined);
  assert.equal(m.prefs['calSync.a'], undefined);
});

test('categories: after restoring they are recalculated with the existing service', async () => {
  let llamadas = 0;
  const m = await preparar({ categorias: { alAbrirClub: () => { llamadas++; } } });
  await m.svc.restaurar(m.doc);
  assert.equal(llamadas, 1);
});

test('reverting the last restore brings back the previous data without another safety copy; it only exists in the session', async () => {
  const actual = { Nadadores: [fila('Nadadores', { id: 'n9', nombre: 'Lo de antes', fechaNacimiento: '2010-01-01' })] };
  const m = await preparar({ actual });
  assert.equal(m.svc.haySeguridad(), false);
  await assert.rejects(m.svc.revertirUltimaRestauracion(), (e) => e.code === 'sin-seguridad');
  await m.svc.restaurar(m.doc);
  assert.equal(m.svc.haySeguridad(), true);
  assert.deepEqual(m.repo.list('Nadadores').map((x) => x.id).sort(), ['n1', 'n2']);
  const r = await m.svc.revertirUltimaRestauracion();
  assert.equal(r.revertida, true);
  assert.deepEqual(m.repo.list('Nadadores').map((x) => x.id), ['n9']);
  assert.equal(m.svc.haySeguridad(), false);
  assert.equal(m.drive.archivos.size, 1); // reverting did not take another safety copy
});

test('demo mode: the safety copy stays in the session (downloadable), without touching Drive', async () => {
  const drive = driveFalso();
  const descargas = [];
  const origen = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }) });
  const doc = await textoDe((await origen.svc.crearBackup()).blob);
  const m = montar({ repo: repoMem({ club: clubBase, mode: 'demo' }), drive, descargas });
  const r = await m.svc.restaurar(doc);
  assert.equal(r.seguridad.destino, 'sesion');
  assert.equal(drive.archivos.size, 0);
  assert.equal(m.repo.list('Nadadores').length, 2);
  await m.svc.descargarSeguridad();
  assert.match(descargas[0].nombre, /^cnl-safety-.*\.json$/);
  await assert.rejects(m.svc.listarBackupsDrive(), (e) => e.code === 'sin-drive');
  assert.equal(m.svc.driveDisponible(), false);
});

// ---------- Drive backups ----------
test('Drive: lists (date, type), counts, restores and deletes copies in cnl/backups', async () => {
  const drive = driveFalso();
  const antiguo = { version: 1, club: { nombre: 'Club Test', lema: 'De Drive' }, hojas: { Nadadores: [fila('Nadadores', { id: 'd1', nombre: 'Drive', fechaNacimiento: '2012-05-06' })] } };
  drive.poner('a', 'Club Test-20261014.json', antiguo);
  drive.poner('b', 'Club Test-import-20261015101500.json', { ...antiguo, hojas: { Nadadores: [] } });
  drive.poner('c', 'Club Test-2-20261016.json', antiguo); // another club
  drive.poner('d', 'Club Test-20261015.json', antiguo);
  const m = montar({ repo: repoMem({ hojas: datosBase(), club: clubBase }), drive });
  const lista = await m.svc.listarBackupsDrive({ conteos: true });
  assert.deepEqual(lista.map((x) => [x.id, x.tipo, x.fecha]), [['b', 'importacion', '2026-10-15'], ['d', 'diario', '2026-10-15'], ['a', 'diario', '2026-10-14']]);
  assert.deepEqual(lista.find((x) => x.id === 'a').resumen, { cifrada: false, filas: 1, nadadores: 1 });
  const r = await m.svc.restaurarDesdeDrive('a', { modo: 'replace' });
  assert.deepEqual(m.repo.list('Nadadores').map((x) => x.id), ['d1']);
  assert.equal(m.repo.club.lema, 'De Drive');
  assert.equal(r.seguridad.destino, 'drive');
  await m.svc.eliminarBackupDrive('b');
  assert.ok(!(await m.svc.listarBackupsDrive()).some((x) => x.id === 'b'));
});

test('Drive adapter: club prefix, save with a restore label and list only the club backups', async () => {
  const llamadas = [];
  const drive = {
    backupClub: async (club, doc, op) => { llamadas.push(['backup', club, op.etiqueta]); return { id: 'x', name: 'Mi Club-restore-20261016153012.json' }; },
    ensureFolderPath: async (p) => { llamadas.push(['carpeta', p.join('/')]); return 'F'; },
    listFiles: async () => [{ id: '1', name: 'Mi Club-20261016.json', modifiedTime: 't' }, { id: '2', name: 'Otro-20261016.json' }],
    leerFichero: async (id) => ({ id }), deleteFile: async (id) => llamadas.push(['borrar', id]),
  };
  const nombreBackup = (n, f) => `${n}-${f.getFullYear()}${String(f.getMonth() + 1).padStart(2, '0')}${String(f.getDate()).padStart(2, '0')}.json`;
  const a = crearBackupsDrive({ drive, nombreBackup });
  assert.equal(a.prefijo('Mi Club'), 'Mi Club-');
  assert.deepEqual(await a.guardarSeguridad('Mi Club', {}, AHORA), { id: 'x', nombre: 'Mi Club-restore-20261016153012.json' });
  assert.deepEqual(llamadas[0], ['backup', 'Mi Club', 'restore']);
  const l = await a.listar('Mi Club');
  assert.deepEqual(l.archivos.map((x) => x.id), ['1']);
  await a.eliminar('1');
  assert.deepEqual(await a.leer('7'), { id: '7' });
});
