import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, renderView, tick, buttonByText } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';
import { crearBackupCrypto } from '../../js/infrastructure/backupCrypto.js';

let c;
const test = (name, fn) => base(name, async (t) => { c = await fresh(); return fn(t); });

const AHORA = new Date(2026, 9, 16, 15, 30, 12);

// Real store + fake Drive + the real service built by the composition root, with the download captured.
async function montar({ modoDemo = false } = {}) {
  const { crearServicioBackupApp } = await importApp('js/composicion/backup.js');
  const { renderBackupPanel } = await importApp('js/presentation/views/backup-panel.js');
  const descargas = [];
  const svc = crearServicioBackupApp({ store: c.store, ahora: () => AHORA, descargar: (blob, nombre) => { descargas.push({ blob, nombre }); }, cripto: crearBackupCrypto({ iteraciones: 1000 }) });
  const pintar = () => {
    c.container.replaceChildren(renderBackupPanel({ store: c.store, ui: c.ui, backup: svc, recargar: pintar }));
    return c.container;
  };
  void modoDemo;
  pintar();
  await tick();
  return { svc, descargas, pintar };
}

const archivoElegido = async (panel, texto, nombre = 'copia.json') => {
  const input = panel.querySelector('#backup-archivo');
  const file = new File([texto], nombre, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new window.Event('change', { bubbles: true }));
  for (let i = 0; i < 40 && !panel.querySelector('#backup-restaurar, .alert--danger'); i++) await tick(5);
};
const hojasConDatos = () => ['Nadadores', 'Grupos', 'Entrenamientos', 'Asistencia', 'Cargas', 'Marcas', 'Comunicaciones', 'Banadores', 'Piscinas', 'TiposCarga'];
const foto = () => JSON.stringify(hojasConDatos().map((s) => c.store.list(s).sort((a, b) => a.id.localeCompare(b.id)))); // row order is not part of the data

test('Settings mounts the backup panel', async () => {
  await renderView('club', c.container, [], c);
  assert.ok(c.container.querySelector('#backup-panel'));
  assert.ok(c.container.querySelector('#backup-descargar'));
  assert.ok(c.container.querySelector('#backup-archivo'));
  assert.match(c.container.querySelector('.backup-panel').textContent, /menores/);
  // exactly one h1 in the page and the cards use h2
  assert.equal(c.container.querySelectorAll('.backup-panel h1').length, 0);
  assert.ok(c.container.querySelectorAll('.backup-panel h2').length >= 3);
});

test('download: delivers a file with valid content and shows the latest backup', async () => {
  const { svc, descargas } = await montar();
  const panel = c.container;
  assert.match(panel.querySelector('#backup-ultima').textContent, /Todavía no has descargado/);
  panel.querySelector('#backup-descargar').click();
  for (let i = 0; i < 40 && !descargas.length; i++) await tick(5);
  assert.equal(descargas.length, 1);
  assert.equal(descargas[0].nombre, 'cnl-backup-club-natacion-lugones-2026-10-16-1530.json');
  const doc = JSON.parse(await descargas[0].blob.text());
  assert.equal(doc.format, 'cnl-backup');
  assert.equal(doc.sheets.Nadadores.length, c.store.list('Nadadores').length);
  assert.equal((await svc.leerBackup(descargas[0].blob)).resumen.nadadores, 12);
  await tick(5);
  assert.match(panel.querySelector('#backup-descarga-estado').textContent, /Copia descargada/);
  assert.ok(svc.ultimaCopia().nombre);
});

test('download with password: validates the confirmation and encrypts the file', async () => {
  const { descargas } = await montar();
  const panel = c.container;
  const p1 = panel.querySelector('#backup-pass');
  const p2 = panel.querySelector('#backup-pass2');
  p1.value = 'abc';
  p1.dispatchEvent(new window.Event('input', { bubbles: true }));
  panel.querySelector('#backup-descargar').click();
  await tick(5);
  assert.equal(descargas.length, 0);
  assert.match(panel.textContent, /al menos 8 caracteres/);
  p1.value = 'una-clave-larga-1'; p2.value = 'otra-distinta-123';
  p1.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.match(panel.querySelector('#backup-fuerza').textContent, /Fortaleza/);
  panel.querySelector('#backup-descargar').click();
  await tick(5);
  assert.equal(descargas.length, 0);
  assert.match(panel.textContent, /no coinciden/);
  p2.value = 'una-clave-larga-1';
  panel.querySelector('#backup-descargar').click();
  for (let i = 0; i < 40 && !descargas.length; i++) await tick(5);
  assert.equal(descargas.length, 1);
  assert.match(descargas[0].nombre, /-encrypted\.json$/);
  assert.equal(JSON.parse(await descargas[0].blob.text()).format, 'cnl-backup-encrypted');
});

test('restore from file: preview, confirmation gate and the data comes back', async () => {
  const { svc, descargas } = await montar();
  const original = foto();
  await svc.descargarBackup();
  const texto = await descargas[0].blob.text();
  // modify: delete swimmers and edit the club
  c.store.removeMany('Nadadores', c.store.list('Nadadores').slice(0, 3).map((n) => n.id));
  c.store.setClub({ lema: 'Cambiado' });
  assert.notEqual(foto(), original);
  const panel = c.container;
  await archivoElegido(panel, texto);
  assert.ok(panel.querySelector('#backup-restaurar'), 'valid backup shows the Restore button');
  assert.match(panel.querySelector('.alert--ok').textContent, /Copia válida/);
  const filaNad = [...panel.querySelectorAll('#backup-tabla tbody tr')].find((tr) => tr.firstChild.textContent === 'Nadadores');
  assert.equal(filaNad.children[3].textContent, '3'); // 3 new rows
  // Replace is the default
  assert.equal(panel.querySelector('input[name="backup-modo"]:checked').value, 'replace');
  // confirmation gate
  panel.querySelector('#backup-restaurar').click();
  await tick();
  const dlg = document.querySelector('.sheet');
  assert.ok(dlg, 'a confirmation dialog opens');
  const campo = dlg.querySelector('#backup-confirmar-texto');
  campo.value = 'no';
  [...dlg.querySelectorAll('.sheet-actions button')].find((b) => /Restaurar ahora/.test(b.textContent)).click();
  await tick(5);
  assert.ok(document.querySelector('.sheet'), 'a wrong text keeps the dialog open');
  assert.match(dlg.textContent, /No coincide/);
  assert.equal(c.store.list('Nadadores').length, 9); // nothing restored yet
  campo.value = c.store.club.nombre.toUpperCase(); // the club name, any case
  [...dlg.querySelectorAll('.sheet-actions button')].find((b) => /Restaurar ahora/.test(b.textContent)).click();
  for (let i = 0; i < 60 && !panel.querySelector('#backup-exito'); i++) await tick(10);
  assert.ok(panel.querySelector('#backup-exito'), 'success summary: ');
  assert.equal(foto(), original);
  assert.equal(c.store.club.lema, 'Pequeño gran club');
  assert.ok(svc.haySeguridad());
  // Undo through the safety copy
  assert.ok(panel.querySelector('#backup-revertir'));
  assert.ok(document.querySelector('#toasts .toast-action'), 'undo toast');
  panel.querySelector('#backup-revertir').click();
  await tick();
  [...document.querySelectorAll('.sheet-actions button')].find((b) => /Revertir/.test(b.textContent)).click();
  for (let i = 0; i < 60 && c.store.list('Nadadores').length !== 9; i++) await tick(10);
  assert.equal(c.store.list('Nadadores').length, 9);
  assert.equal(c.store.club.lema, 'Cambiado');
});

test('the deletion tombstone reaches the Drive file when restoring in replace mode', async () => {
  const { svc } = await montar();
  const doc = JSON.parse(await (await svc.crearBackup()).blob.text());
  c.store.upsert('Grupos', { id: 'extra-g', nombre: 'Extra', categoria: '', entrenador: '' });
  await c.store.sync();
  await svc.restaurar(doc, { modo: 'replace' });
  assert.equal(c.store.get('Grupos', 'extra-g'), null);
  const enDrive = (await c.drive.read(c.ref.id)).doc;
  assert.ok(enDrive.sync.lapidas.Grupos['extra-g'], 'the removed row left a tombstone in the synced file');
  assert.equal(enDrive.hojas.Grupos.some((g) => g.id === 'extra-g'), false);
  // the safety copy exists in cnl/backups
  const copias = await c.drive.listarBackups(c.store.clubRef.name, { todos: true });
  assert.ok(copias.some((b) => /-restore-\d{14}\.json$/.test(b.name)));
});

test('damaged backup: the error is shown and nothing changes', async () => {
  const { svc, descargas } = await montar();
  await svc.descargarBackup();
  const doc = JSON.parse(await descargas[0].blob.text());
  doc.sheets.Nadadores[0].nombre = 'Manipulado';
  const antes = foto();
  const panel = c.container;
  await archivoElegido(panel, JSON.stringify(doc));
  assert.ok(panel.querySelector('.alert--danger'));
  assert.match(panel.querySelector('.alert--danger').textContent, /dañado|modificado/);
  assert.equal(panel.querySelector('#backup-restaurar'), null);
  assert.equal(foto(), antes);
  await archivoElegido(panel, 'no es json');
  assert.match(panel.querySelector('.alert--danger').textContent, /JSON/);
});

test('encrypted backup: asks for the passphrase and a wrong one is flagged on the field', async () => {
  const { svc } = await montar();
  const r = await svc.crearBackup({ passphrase: 'una-clave-larga-1' });
  const panel = c.container;
  await archivoElegido(panel, await r.blob.text());
  const campo = panel.querySelector('#backup-pass-abrir');
  assert.ok(campo, 'asks for the passphrase');
  campo.value = 'equivocada-123';
  panel.querySelector('#backup-desbloquear').click();
  for (let i = 0; i < 40 && !/incorrecta/.test(panel.textContent); i++) await tick(10);
  assert.match(panel.textContent, /incorrecta/);
  const campo2 = panel.querySelector('#backup-pass-abrir');
  campo2.value = 'una-clave-larga-1';
  panel.querySelector('#backup-desbloquear').click();
  for (let i = 0; i < 60 && !panel.querySelector('#backup-restaurar'); i++) await tick(10);
  assert.ok(panel.querySelector('#backup-restaurar'));
});

test('backups in Drive: lists those in cnl/backups and allows restoring one', async () => {
  const { svc } = await montar();
  await c.drive.backupClub(c.store.clubRef.name, await (async () => { const d = c.store.documento(); return d; })(), { fecha: new Date(2026, 9, 14) });
  c.store.removeMany('Nadadores', c.store.list('Nadadores').map((n) => n.id));
  const panel = c.container;
  panel.replaceChildren();
  const { renderBackupPanel } = await importApp('js/presentation/views/backup-panel.js');
  panel.append(renderBackupPanel({ store: c.store, ui: c.ui, backup: svc }));
  for (let i = 0; i < 60 && !panel.querySelector('#backup-drive-tabla tbody tr'); i++) await tick(10);
  const filas = panel.querySelectorAll('#backup-drive-tabla tbody tr');
  assert.equal(filas.length, 1);
  assert.match(filas[0].textContent, /Diaria/);
  for (let i = 0; i < 60 && !/nadadores/.test(filas[0].children[2].textContent); i++) await tick(10);
  assert.match(filas[0].children[2].textContent, /12 nadadores/);
  buttonByText(filas[0], 'Restaurar').click();
  for (let i = 0; i < 60 && !panel.querySelector('#backup-restaurar'); i++) await tick(10);
  assert.ok(panel.querySelector('#backup-restaurar'));
  const r = await svc.restaurar((await svc.leerBackupDrive((await svc.listarBackupsDrive())[0].id)).doc, { modo: 'merge' });
  assert.equal(r.total.nuevas > 0, true);
  assert.equal(c.store.list('Nadadores').length, 12);
});

test('demo mode: download and restore work; Drive backups are explained and disabled', async () => {
  const { crearDemoStorage } = await importApp('js/infrastructure/demoStorage.js');
  await c.store.initDemo({ hoy: AHORA, demo: crearDemoStorage() });
  assert.equal(c.store.mode, 'demo');
  const { svc, descargas } = await montar();
  const panel = c.container;
  assert.ok(panel.querySelector('#backup-drive-demo'));
  assert.equal(panel.querySelector('#backup-drive-actualizar').disabled, true);
  assert.match(panel.querySelector('#backup-drive-demo').textContent, /modo demostración/);
  panel.querySelector('#backup-descargar').click();
  for (let i = 0; i < 40 && !descargas.length; i++) await tick(5);
  assert.equal(descargas.length, 1);
  const nombres = c.store.list('Nadadores').length;
  assert.ok(nombres > 0);
  c.store.removeMany('Nadadores', c.store.list('Nadadores').map((n) => n.id));
  const r = await svc.restaurar((await svc.leerBackup(descargas[0].blob)).doc);
  assert.equal(r.seguridad.destino, 'sesion');
  assert.equal(c.store.list('Nadadores').length, nombres);
});
