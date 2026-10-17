// Integration of the training area: sessions list, plan editor (compact rows, bottom bar, unsaved state, leave guard) and the
// PDF flow (download / share / preview / print / Drive), on jsdom with an in-memory repository and a fixed clock.
import base from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setupEnv, importApp, tick, ROOT } from '../helpers/env.js';
import { infoPdf, libNode } from '../helpers/pdf.js';

const HOY = '2026-10-14'; // Wednesday
const MANANA = '2026-10-15';
const AHORA = () => new Date(2026, 9, 14, 10, 30);
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function fakeStore(datos = {}) {
  const db = { Entrenamientos: [], EntrenoLineas: [], Grupos: [], Cargas: [], Nadadores: [], Asistencia: [], Marcas: [], Comunicaciones: [], ...datos };
  const oyentes = new Set();
  let n = 0;
  const emit = () => oyentes.forEach((f) => f({ type: 'change' }));
  return {
    db, club: { nombre: 'Club Test', colorPrimario: '#4aa32a', colorSecundario: '#2f6f1a' }, mode: 'drive',
    list: (h) => (db[h] || []).slice(),
    get: (h, id) => (db[h] || []).find((r) => r.id === String(id)) || null,
    upsert(h, row) {
      const fila = { ...row, id: row.id ? String(row.id) : 'id' + (++n) };
      const i = db[h].findIndex((r) => r.id === fila.id);
      if (i >= 0) db[h][i] = fila; else db[h].push(fila);
      emit();
      return fila;
    },
    remove(h, id) { db[h] = db[h].filter((r) => r.id !== String(id)); emit(); },
    on(f) { oyentes.add(f); return () => oyentes.delete(f); },
  };
}

const L = (set, orden, extra) => ({ id: `l${set}-${orden}`, entrenamientoId: 's1', set, orden, ...extra });
const PLAN = [
  L(1, 1, { tiempoMin: 7, objetivo: 'Calentamiento', series: 1, distancia: 300, ejercicio: 'Suave' }),
  L(1, 2, { tiempoMin: 6, series: 4, distancia: 50, ejercicio: '25tec/25N' }),
  L(2, 1, { tiempoMin: 12, objetivo: 'Piernas', series: 8, distancia: 50, salida: "C/1'10\"", ejercicio: 'Pn C', material: 'Tabla' }),
];

async function montar({ modo = 'drive', conPlan = true, extraDatos = {} } = {}) {
  setupEnv();
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('es', { persist: false });
  const ui = await importApp('js/ui.js');
  const P = await importApp('js/infrastructure/pdfEntreno.js');
  P.usarLibreria(libNode());
  const store = fakeStore({
    Grupos: [{ id: 'g2', nombre: 'Alevín' }, { id: 'g1', nombre: 'Promoción' }],
    Entrenamientos: [
      { id: 's1', fecha: HOY, hora: '19:50', grupoId: 'g2', titulo: 'Sesión Alevín', estado: 'planificado', piscina: '50', tipoSesion: 'Aer+Ritmo', materialDia: 'JJDD', notasGenerales: 'Tabla' },
      { id: 's2', fecha: HOY, hora: '17:30', grupoId: 'g1', titulo: 'Sesión Promo', estado: 'planificado', piscina: '25' },
      { id: 's3', fecha: MANANA, hora: '18:00', grupoId: 'g2', titulo: 'Sesión mañana', estado: 'planificado', piscina: '25' },
    ],
    EntrenoLineas: conPlan ? PLAN.map((l) => ({ ...l })) : [],
    Nadadores: [{ id: 'n1', nombre: 'Carla', apellidos: 'Menéndez', grupoId: 'g2', categoria: 'Alevín' }],
    ...extraDatos,
  });
  store.mode = modo;
  const blobs = [];
  const descargas = [];
  globalThis.URL.createObjectURL = (b) => { blobs.push(b); return 'blob:test/' + blobs.length; };
  globalThis.URL.revokeObjectURL = () => {};
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[download]');
    if (a) { descargas.push({ nombre: a.getAttribute('download'), href: a.getAttribute('href') }); e.preventDefault(); }
  }, true);
  const container = document.createElement('main');
  document.body.appendChild(container);
  const ctx = { store, auth: { user: null, on: () => () => {} }, ui, ahora: AHORA };
  const vista = await importApp('js/views/entrenamientos.js');
  await vista.render(container, [], ctx);
  await tick();
  return { store, ui, ctx, container, blobs, descargas, vista, P };
}

const test = (name, fn) => base(name, async () => { try { await fn(); } finally { delete globalThis.matchMedia; } });
const botones = (raiz) => [...raiz.querySelectorAll('button')];
const botonTexto = (raiz, txt, exacto = true) => {
  const b = botones(raiz).find((x) => (exacto ? x.textContent.trim() === txt : x.textContent.includes(txt)) || x.getAttribute('aria-label') === txt);
  if (!b) throw new Error('No button: ' + txt + ' in ' + botones(raiz).map((x) => x.textContent.trim()).join(' | '));
  return b;
};
const tarjeta = (c, titulo) => [...c.container.querySelectorAll('.ent-sess')].find((e) => e.textContent.includes(titulo));
async function esperar(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) {
    try { const r = fn(); if (r) return r; } catch (e) { /* retry */ }
    if (Date.now() > fin) throw new Error('Timed out waiting for: ' + fn);
    await tick(20);
  }
}
const poner = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const editor = () => document.querySelector('.enp-ov');
const fila = (set, orden) => editor().querySelector(`.enp-row[data-set="${set}"][data-orden="${orden}"]`);
const campo = (set, orden, c) => fila(set, orden).querySelector(`[data-campo="${c}"]`);
const totalTexto = () => editor().querySelector('.enp-tot').textContent;
const estadoTexto = () => editor().querySelector('.enp-estado').textContent;

// Overflow menus: open the one whose button has this aria-label and click an item by its text.
function abrirMenu(raiz, etiqueta) {
  const b = [...raiz.querySelectorAll('button[aria-haspopup="menu"]')].find((x) => x.getAttribute('aria-label') === etiqueta);
  if (!b) throw new Error('No menu button: ' + etiqueta);
  b.click();
  return document.querySelector('.enp-mn');
}
function elegir(raiz, etiquetaMenu, item) {
  const m = abrirMenu(raiz, etiquetaMenu);
  const it = [...m.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent.trim() === item);
  if (!it) throw new Error('No menu item: ' + item + ' in ' + [...m.querySelectorAll('[role="menuitem"]')].map((x) => x.textContent.trim()).join(' | '));
  it.click();
  return it;
}
const menuFilaDe = (set, orden) => `Acciones de la fila (Set ${set}, fila ${orden})`;
const abrirPlan = (c, titulo) => botonTexto(tarjeta(c, titulo), 'Abrir plan').click();
async function pdfDescargado(c, n = 1) {
  await esperar(() => c.descargas.length >= n);
  const d = c.descargas[n - 1];
  const blob = c.blobs[c.blobs.length - 1];
  return { ...d, info: infoPdf(Buffer.from(await blob.arrayBuffer())) };
}
const dialogo = () => esperar(() => document.querySelector('.modal'));

// ---------------------------------------------------------------- sessions list
test('list: summary of the plan, ONE primary action and a more menu per card; compact week navigation', async () => {
  const c = await montar();
  const s = tarjeta(c, 'Sesión Alevín');
  assert.match(s.textContent, /900 m · 25 min/);
  assert.deepEqual(botones(s).map((b) => b.getAttribute('aria-haspopup') || b.textContent.trim()), ['Abrir plan', 'menu']);
  assert.ok(s.querySelector('.btn--primary'));
  assert.doesNotMatch(tarjeta(c, 'Sesión Promo').textContent, / m · \d+ min/, 'no plan, no summary');
  assert.ok(botonTexto(c.container, 'Generar PDF de la semana', false));
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.ok(c.container.querySelector('.ent-today'), 'today is highlighted (fixed clock)');
  assert.match(c.container.querySelector('.ent-week').textContent, /12 oct\. – 18 oct\. 2026|12 oct – 18 oct 2026/);
  const items = [...abrirMenu(s, 'Más acciones de Sesión Alevín').querySelectorAll('[role="menuitem"]')].map((x) => x.textContent.trim());
  assert.deepEqual(items, ['Marcar realizado', 'Editar', 'Duplicar', 'Descargar PDF', 'Eliminar']);
});

test('list: week navigation uses the injected clock and an empty week shows an empty state with a call to action', async () => {
  const c = await montar();
  botonTexto(c.container, 'Semana siguiente').click();
  assert.match(c.container.textContent, /0 sesiones esta semana/);
  assert.ok(c.container.querySelector('.empty'));
  assert.ok(botonTexto(c.container.querySelector('.empty'), 'Nueva sesión'));
  botonTexto(c.container, 'Hoy').click();
  assert.ok(tarjeta(c, 'Sesión Alevín'));
});

test('mark as done from the menu and reopen', async () => {
  const c = await montar();
  elegir(tarjeta(c, 'Sesión Promo'), 'Más acciones de Sesión Promo', 'Marcar realizado');
  assert.equal(c.store.get('Entrenamientos', 's2').estado, 'realizado');
  assert.match(tarjeta(c, 'Sesión Promo').textContent, /Realizado/);
  elegir(tarjeta(c, 'Sesión Promo'), 'Más acciones de Sesión Promo', 'Reabrir');
  assert.equal(c.store.get('Entrenamientos', 's2').estado, 'planificado');
});

test('delete with Undo: session and plan disappear, Undo brings both back', async () => {
  const c = await montar();
  elegir(tarjeta(c, 'Sesión Alevín'), 'Más acciones de Sesión Alevín', 'Eliminar');
  assert.equal(document.querySelector('.modal'), null, 'no confirmation dialog: the toast offers Undo');
  assert.equal(c.store.get('Entrenamientos', 's1'), null);
  assert.equal(c.store.db.EntrenoLineas.length, 0);
  assert.equal(tarjeta(c, 'Sesión Alevín'), undefined);
  const toast = document.querySelector('#toasts .toast');
  assert.match(toast.textContent, /Sesión eliminada/);
  botonTexto(toast, 'Deshacer').click();
  await tick();
  assert.equal(c.store.get('Entrenamientos', 's1').titulo, 'Sesión Alevín');
  assert.equal(c.store.db.EntrenoLineas.length, 3);
  assert.ok(tarjeta(c, 'Sesión Alevín'));
  assert.match(tarjeta(c, 'Sesión Alevín').textContent, /900 m · 25 min/);
});

test('session form: inline validation (required, volume range) and nothing is saved until valid', async () => {
  const c = await montar();
  botonTexto(c.container, 'Nueva sesión').click();
  const m = await dialogo();
  const campoDe = (txt) => [...m.querySelectorAll('label')].find((l) => l.textContent.trim().startsWith(txt)).querySelector('input,select,textarea');
  botonTexto(m, 'Guardar').click();
  await tick();
  assert.equal(m.querySelectorAll('.field-error').length >= 1, true);
  assert.equal(campoDe('Título').getAttribute('aria-invalid'), 'true');
  poner(campoDe('Título'), 'Sesión incoherente');
  poner(campoDe('Volumen objetivo mín.'), '5000');
  poner(campoDe('Volumen objetivo máx.'), '1000');
  botonTexto(m, 'Guardar').click();
  await tick();
  const err = m.querySelector('.field-error');
  assert.match(err.textContent, /El volumen mínimo no puede superar el máximo/);
  assert.equal(campoDe('Volumen objetivo máx.').getAttribute('aria-invalid'), 'true');
  assert.equal(c.store.db.Entrenamientos.length, 3);
  poner(campoDe('Volumen objetivo máx.'), '6000');
  botonTexto(m, 'Guardar').click();
  await esperar(() => c.store.db.Entrenamientos.length === 4);
  assert.ok(tarjeta(c, 'Sesión incoherente'));
  assert.match(document.querySelector('#toasts').textContent, /Sesión guardada/);
});

test('duplicate copies the plan too', async () => {
  const c = await montar();
  elegir(tarjeta(c, 'Sesión Alevín'), 'Más acciones de Sesión Alevín', 'Duplicar');
  const form = await dialogo();
  botonTexto(form, 'Guardar').click();
  await esperar(() => c.store.db.Entrenamientos.length === 4);
  const nueva = c.store.db.Entrenamientos.find((e) => e.id !== 's1' && e.titulo === 'Sesión Alevín');
  assert.equal(nueva.tipoSesion, 'Aer+Ritmo');
  assert.equal(c.store.db.EntrenoLineas.filter((l) => l.entrenamientoId === nueva.id).length, 3);
});

// ---------------------------------------------------------------- PDF from the list
test('PDF of a session from the card menu: name Group-date-day.pdf and content', async () => {
  const c = await montar();
  elegir(tarjeta(c, 'Sesión Alevín'), 'Más acciones de Sesión Alevín', 'Descargar PDF');
  const d = await pdfDescargado(c);
  assert.equal(d.nombre, `Alevin-${HOY}-${ascii('miércoles')}.pdf`);
  assert.match(d.info.cabecera, /^%PDF-/);
  assert.equal(d.info.paginas, 1);
  const t = d.info.texto.replace(/\s+/g, ' ');
  for (const e of ['Aer+Ritmo', 'JJDD', 'Calentamiento', 'Piernas', "C/1'10\"", 'TOTALES', 'Club Test']) assert.ok(t.includes(e), e);
  await esperar(() => /PDF generado: Alevin-/.test(document.querySelector('#toasts')?.textContent || ''));
});

test('PDF of a session without plan warns first: Cancel generates nothing, Accept generates it', async () => {
  const c = await montar();
  elegir(tarjeta(c, 'Sesión Promo'), 'Más acciones de Sesión Promo', 'Descargar PDF');
  const m = await dialogo();
  assert.match(m.textContent, /saldrá en blanco/);
  botonTexto(m, 'Cancelar').click();
  await tick(60);
  assert.equal(c.descargas.length, 0);
  elegir(tarjeta(c, 'Sesión Promo'), 'Más acciones de Sesión Promo', 'Descargar PDF');
  botonTexto(await dialogo(), 'Aceptar').click();
  const d = await pdfDescargado(c);
  assert.ok(d.info.texto.includes('Esta sesión todavía no tiene plan detallado.'));
});

test('PDF of the week: one page per session and group filter', async () => {
  const c = await montar();
  botonTexto(c.container, 'Generar PDF de la semana', false).click();
  let d = await pdfDescargado(c);
  assert.match(d.nombre, /^Club-semana-2026-10-12\.pdf$/);
  assert.equal(d.info.paginas, 3);
  const sel = c.container.querySelector('.ent-bar select');
  sel.value = 'g2';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  botonTexto(c.container, 'Generar PDF de la semana', false).click();
  d = await pdfDescargado(c, 2);
  assert.match(d.nombre, /^Alevin-semana-/);
  assert.equal(d.info.paginas, 2);
});

// ---------------------------------------------------------------- editor
test('editor: compact two-line rows, no autofocus, live totals, mobile numeric keypads and suggestions', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  assert.ok(editor(), 'editor open');
  const panel = editor().querySelector('.enp-panel');
  assert.equal(panel.getAttribute('role'), 'dialog');
  assert.equal(document.activeElement, panel, 'focus goes to the dialog, not to a field (the keyboard stays closed)');
  assert.equal(totalTexto(), 'Total: 900 m · 25 min · 2 sets');
  assert.equal(editor().querySelectorAll('.enp-set').length, 2);
  const f = fila(1, 2);
  assert.ok(f.querySelector('.enp-l1 [data-campo="series"]') && f.querySelector('.enp-l1 [data-campo="distancia"]') && f.querySelector('.enp-l1 [data-campo="ejercicio"]'), 'line 1 = series x distance + exercise');
  assert.deepEqual([...f.querySelectorAll('.enp-l2 .enp-chip')].map((b) => b.dataset.chip), ['salida', 'tiempoMin', 'material', 'objetivo', 'contenidos', 'mas']);
  assert.equal(campo(1, 1, 'ejercicio').value, 'Suave');
  assert.equal(fila(1, 2).querySelector('output').textContent, '200');
  poner(campo(1, 2, 'series'), '6');
  assert.equal(fila(1, 2).querySelector('output').textContent, '300');
  assert.equal(totalTexto(), 'Total: 1000 m · 25 min · 2 sets');
  poner(campo(2, 1, 'tiempoMin'), '20');
  assert.equal(totalTexto(), 'Total: 1000 m · 33 min · 2 sets');
  assert.match(editor().querySelectorAll('.enp-set-tot')[0].textContent, /600 m · 13 min/);
  for (const cmp of ['tiempoMin', 'series', 'distancia']) assert.equal(campo(1, 1, cmp).getAttribute('inputmode'), 'numeric', cmp);
  assert.equal(campo(1, 1, 'salida').getAttribute('inputmode'), 'text');
  assert.equal(campo(1, 1, 'salida').getAttribute('autocapitalize'), 'off');
  assert.equal(campo(1, 1, 'objetivo').getAttribute('list'), 'enp-dl-objetivo');
  const opciones = [...document.querySelectorAll('#enp-dl-objetivo option')].map((o) => o.value);
  assert.ok(opciones.includes('Calentamiento') && opciones.includes('Piernas') && opciones.includes('Vuelta a la calma'));
  assert.ok(editor().querySelector('#enp-dl-distancia option[value="100"]'));
});

test('editor: chips show the values, open one inline pane at a time and the notes live in a collapsible detail', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  const f = fila(2, 1);
  const chip = (k) => f.querySelector(`[data-chip="${k}"]`);
  assert.match(chip('salida').textContent, /C\/1'10"/);
  assert.match(chip('material').textContent, /Tabla/);
  assert.match(chip('objetivo').textContent, /Piernas/);
  assert.match(chip('tiempoMin').textContent, /12 min/);
  assert.ok(f.querySelector('[data-pane="salida"]').hidden, 'panes start closed');
  chip('salida').click();
  assert.equal(f.querySelector('[data-pane="salida"]').hidden, false);
  assert.equal(chip('salida').getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, campo(2, 1, 'salida'));
  chip('material').click();
  assert.ok(f.querySelector('[data-pane="salida"]').hidden, 'only one pane open');
  assert.equal(f.querySelector('[data-pane="material"]').hidden, false);
  chip('material').click();
  assert.ok(f.querySelector('[data-pane="material"]').hidden, 'tapping again closes it');
  chip('mas').click();
  assert.ok(f.querySelector('[data-pane="mas"] [data-campo="notas"]') && f.querySelector('[data-pane="mas"] [data-campo="bloque"]'));
  poner(campo(2, 1, 'notas'), 'Contar brazadas');
  assert.match(chip('mas').className, /enp-chip--lleno/);
  poner(campo(2, 1, 'salida'), '');
  assert.equal(chip('salida').textContent.trim(), 'Salida');
});

test('editor: add, duplicate, move and remove sets and rows (set and row menus)', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  botonTexto(editor(), 'Añadir set').click();
  assert.equal(editor().querySelectorAll('.enp-set').length, 3);
  poner(campo(3, 1, 'ejercicio'), 'Nuevo');
  elegir(editor(), 'Acciones del set 2', 'Duplicar el set 2');
  assert.equal(editor().querySelectorAll('.enp-set').length, 4);
  assert.equal(campo(3, 1, 'ejercicio').value, 'Pn C', 'the copy sits right after the original');
  assert.equal(totalTexto(), 'Total: 1300 m · 37 min · 4 sets');
  elegir(editor(), 'Acciones del set 3', 'Subir el set 3');
  assert.equal(campo(2, 1, 'ejercicio').value, 'Pn C');
  elegir(editor(), 'Acciones del set 2', 'Quitar el set 2');
  assert.equal(editor().querySelectorAll('.enp-set').length, 3);
  botonTexto(editor(), 'Añadir fila al set 1').click();
  assert.ok(fila(1, 3));
  elegir(editor(), menuFilaDe(1, 1), 'Duplicar fila (Set 1, fila 1)');
  assert.equal(campo(1, 2, 'ejercicio').value, 'Suave');
  assert.equal(document.activeElement, campo(1, 2, 'ejercicio'));
});

test('editor: Enter moves to the next row and creates one at the end; rows move, duplicate and are removed from the row menu', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  campo(1, 2, 'ejercicio').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.ok(fila(1, 3), 'Enter on the last row of a set adds a new one');
  assert.equal(document.activeElement, campo(1, 3, 'ejercicio'));
  campo(1, 1, 'ejercicio').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, campo(1, 2, 'ejercicio'));
  elegir(editor(), menuFilaDe(1, 1), 'Bajar fila (Set 1, fila 1)');
  assert.equal(campo(1, 2, 'ejercicio').value, 'Suave');
  elegir(editor(), menuFilaDe(1, 2), 'Duplicar fila (Set 1, fila 2)');
  assert.equal(campo(1, 3, 'ejercicio').value, 'Suave');
  elegir(editor(), menuFilaDe(1, 3), 'Quitar fila (Set 1, fila 3)');
  assert.ok(!fila(1, 4));
});

test('row menu: items disabled at the edges and keyboard navigation (arrows, Escape returns focus)', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  const m = abrirMenu(editor(), menuFilaDe(1, 1));
  const items = [...m.querySelectorAll('[role="menuitem"]')];
  assert.equal(items[0].getAttribute('aria-disabled'), 'true', 'first row cannot go up');
  assert.equal(document.activeElement, items[0]);
  items[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(document.activeElement, items[1]);
  items[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.querySelector('.enp-mn'), null);
  assert.equal(document.activeElement.getAttribute('aria-label'), menuFilaDe(1, 1));
  assert.ok(editor(), 'Escape closed the menu, not the editor');
});

test('editor: non-numeric values are flagged (field and chip), block Save and PDF; the send-off is normalised', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  poner(campo(1, 2, 'series'), 'cuatro');
  assert.equal(campo(1, 2, 'series').getAttribute('aria-invalid'), 'true');
  assert.match(editor().querySelector('.enp-avisos').textContent, /Set 1, fila 2:.*series deben ser un número entero/);
  poner(campo(1, 2, 'tiempoMin'), 'x');
  assert.match(fila(1, 2).querySelector('[data-chip="tiempoMin"]').className, /enp-chip--error/, 'an error in a closed pane marks its chip');
  poner(campo(1, 2, 'tiempoMin'), '6');
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-2').series, 4, 'not saved with errors');
  assert.match(document.querySelector('#toasts').textContent, /Corrige los valores marcados antes de guardar/);
  elegir(editor(), 'Más acciones', 'Descargar PDF');
  await tick(50);
  assert.equal(c.descargas.length, 0);
  poner(campo(1, 2, 'series'), '4');
  assert.equal(campo(1, 2, 'series').getAttribute('aria-invalid'), null);
  poner(campo(1, 2, 'salida'), 'rapido');
  assert.match(editor().querySelector('.enp-avisos').textContent, /La salida "rapido" no se reconoce/);
  assert.equal(editor().querySelector('.enp-err'), null);
  poner(campo(1, 2, 'salida'), '1:10');
  campo(1, 2, 'salida').dispatchEvent(new window.Event('blur'));
  assert.equal(campo(1, 2, 'salida').value, "C/1'10\"");
});

test('editor: warns when the total differs from the recorded load', async () => {
  const c = await montar({ extraDatos: { Cargas: [{ id: 'c1', entrenamientoId: 's1', nadadorId: 'n1', metros: 3000 }] } });
  abrirPlan(c, 'Sesión Alevín');
  assert.match(editor().querySelector('.enp-avisos').textContent, /difiere de la carga registrada \(3000 m/);
});

test('bottom bar: live total, unsaved indicator that clears when the edit is undone, Save is the primary button', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  const barra = editor().querySelector('.enp-foot');
  assert.ok(barra.querySelector('.enp-guardar.btn--primary'));
  assert.equal(barra.querySelectorAll('.btn--primary').length, 1);
  assert.equal(estadoTexto(), 'Todo guardado');
  poner(campo(1, 1, 'ejercicio'), 'Otro');
  assert.equal(estadoTexto(), 'Cambios sin guardar');
  assert.equal(barra.dataset.sucio, 'true');
  poner(campo(1, 1, 'ejercicio'), 'Suave');
  assert.equal(estadoTexto(), 'Todo guardado', 'back to the saved value = clean');
  poner(campo(1, 1, 'series'), '2');
  assert.equal(totalTexto(), 'Total: 1200 m · 25 min · 2 sets');
  assert.equal(estadoTexto(), 'Cambios sin guardar');
  botonTexto(barra, 'Guardar').click();
  assert.equal(estadoTexto(), 'Todo guardado');
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').series, 2);
  const items = [...abrirMenu(barra, 'Más acciones').querySelectorAll('[role="menuitem"]')].map((x) => x.textContent.trim());
  assert.deepEqual(items, ['Descargar PDF', 'Vista previa', 'Imprimir', 'Guardar en Drive', 'Registrar cargas desde el plan', 'Copiar resumen']);
});

test('toasts are positioned above the editor bottom bar (stylesheet rule)', () => {
  const css = readFileSync(path.join(ROOT, 'css/views/entreno-editor.css'), 'utf8');
  assert.match(css, /body:has\(\.enp-ov\) #toasts \{ bottom: calc\(var\(--enp-bar-h\)/);
  assert.match(css, /--enp-bar-h: \d+px/);
});

test('editor: summary panel per content and per stroke with metres and percentage', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  poner(campo(1, 2, 'ejercicio'), '4x50 Crol. 25 AeL-25 Tope');
  botonTexto(fila(1, 2), 'Autocompletar desde el texto', false).click();
  const txt = editor().querySelector('[data-resumen="texto"]').textContent;
  assert.match(txt, /Volumen total: 900 m/);
  assert.ok(editor().querySelector('.enp-res-cont .enp-leg li'));
  assert.match(editor().querySelector('.enp-res-est .enp-leg').textContent, /Crol/);
  assert.match(editor().querySelector('.enp-res-bar').textContent, /900 m · 25 min/);
});

test('leave guard: closing with unsaved changes asks; Cancel keeps the editor; beforeunload and Back are guarded', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  let ev = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false, 'clean: no prompt');
  poner(campo(1, 1, 'ejercicio'), 'Otro');
  ev = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, true, 'dirty: the browser asks before leaving');
  editor().querySelector('.enp-head .icon-btn').click();
  const m = await dialogo();
  assert.match(m.textContent, /cambios sin guardar/);
  botonTexto(m, 'Cancelar').click();
  await tick();
  assert.ok(editor(), 'still open');
  // Back button while dirty
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
  const m2 = await dialogo();
  botonTexto(m2, 'Cancelar').click();
  await tick();
  assert.ok(editor(), 'Back cancelled');
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
  botonTexto(await dialogo(), 'Aceptar').click();
  await esperar(() => !editor());
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').ejercicio, 'Suave', 'discarded edits are not saved');
  // after closing the guard is gone
  ev = new window.Event('beforeunload', { cancelable: true });
  window.dispatchEvent(ev);
  assert.equal(ev.defaultPrevented, false);
  assert.equal(document.body.querySelectorAll('[inert]').length, 0, 'the page is interactive again');
});

test('editor: Back with no changes closes directly; the page behind is inert while it is open', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  assert.equal(c.container.hasAttribute('inert'), true);
  window.dispatchEvent(new window.PopStateEvent('popstate', { state: null }));
  await esperar(() => !editor());
  assert.equal(c.container.hasAttribute('inert'), false);
});

test('editor: Save persists session data and rows; a second save keeps the row ids', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  const meta = editor().querySelectorAll('.enp-meta input');
  poner(meta[0], 'Técnica');
  poner(meta[1], 'Aletas');
  poner(meta[2], 'Contar brazadas');
  botonTexto(editor(), 'Añadir set').click();
  poner(campo(3, 1, 'ejercicio'), 'Nuevo');
  poner(campo(1, 1, 'ejercicio'), 'Mixto suave');
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.get('Entrenamientos', 's1').tipoSesion, 'Técnica');
  assert.equal(c.store.get('Entrenamientos', 's1').notasGenerales, 'Contar brazadas');
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').ejercicio, 'Mixto suave');
  assert.match(document.querySelector('#toasts').textContent, /Plan guardado/);
  const idNuevo = c.store.db.EntrenoLineas.find((l) => l.ejercicio === 'Nuevo').id;
  assert.ok(idNuevo);
  poner(campo(3, 1, 'ejercicio'), 'Nuevo 2');
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.ejercicio === 'Nuevo 2').id, idNuevo, 'the row keeps its id');
  assert.equal(c.store.db.EntrenoLineas.length, 4);
});

test('editor: templates and copy from another session (confirm when there is content)', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión mañana');
  assert.equal(editor().querySelectorAll('.enp-row').length, 1, 'session without plan: one set with one empty row');
  const selPl = editor().querySelector('.enp-tools select');
  selPl.value = 'tecnica';
  botonTexto(editor(), 'Usar plantilla').click();
  await tick();
  assert.ok(editor().querySelectorAll('.enp-row').length >= 4);
  assert.equal(estadoTexto(), 'Cambios sin guardar');
  assert.equal(editor().querySelector('.enp-meta input').value, 'Técnica');
  const selSes = editor().querySelectorAll('.enp-tools select')[1];
  assert.ok([...selSes.options].some((o) => o.textContent.includes('Sesión Alevín')));
  selSes.value = 's1';
  botonTexto(editor(), 'Copiar plan').click();
  botonTexto(await dialogo(), 'Aceptar').click();
  await esperar(() => totalTexto() === 'Total: 900 m · 25 min · 2 sets');
  assert.equal(campo(2, 1, 'material').value, 'Tabla');
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.db.EntrenoLineas.filter((l) => l.entrenamientoId === 's3').length, 3);
});

// ---------------------------------------------------------------- PDF from the editor
test('editor PDF: uses the current draft; preview is a dialog with an iframe on desktop; print creates the frame', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión Alevín');
  poner(campo(1, 1, 'ejercicio'), 'Ejercicio sin guardar');
  elegir(editor(), 'Más acciones', 'Descargar PDF');
  const d = await pdfDescargado(c);
  assert.ok(d.info.texto.replace(/\s+/g, '').includes('Ejerciciosinguardar'));
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').ejercicio, 'Suave');
  elegir(editor(), 'Más acciones', 'Vista previa');
  const prev = await esperar(() => document.querySelector('.enp-prev iframe'));
  assert.match(prev.getAttribute('src'), /^blob:/);
  assert.ok(botonTexto(document.querySelector('.enp-prev'), 'Abrir en otra pestaña'));
  botonTexto(document.querySelector('.enp-prev'), 'Cerrar', false).click();
  await tick();
  assert.equal(document.querySelector('.enp-prev'), null);
  assert.ok(editor(), 'the editor stays open behind the preview');
  const antes = document.querySelectorAll('iframe.enp-print').length;
  elegir(editor(), 'Más acciones', 'Imprimir');
  await esperar(() => document.querySelectorAll('iframe.enp-print').length === antes + 1);
});

test('editor PDF with an empty plan warns before generating', async () => {
  const c = await montar();
  abrirPlan(c, 'Sesión mañana');
  elegir(editor(), 'Más acciones', 'Descargar PDF');
  const m = await dialogo();
  assert.match(m.textContent, /saldrá en blanco/);
  botonTexto(m, 'Cancelar').click();
  await tick(50);
  assert.equal(c.descargas.length, 0);
});

test('mobile: one Share PDF action with Web Share and a file; cancel is silent; failure falls back to download; preview opens a new tab', async () => {
  const c = await montar();
  globalThis.matchMedia = (q) => ({ matches: /coarse/.test(q) });
  const compartidos = [];
  let modo = 'ok';
  Object.defineProperty(navigator, 'canShare', { value: (d) => !!(d && d.files && d.files.length), configurable: true });
  Object.defineProperty(navigator, 'share', {
    value: async (d) => { compartidos.push(d); if (modo === 'cancel') throw Object.assign(new Error('x'), { name: 'AbortError' }); if (modo === 'fail') throw Object.assign(new Error('x'), { name: 'NotAllowedError' }); },
    configurable: true,
  });
  const abiertas = [];
  window.open = (...a) => { abiertas.push(a); return {}; };
  try {
    abrirPlan(c, 'Sesión Alevín');
    const items = [...abrirMenu(editor(), 'Más acciones').querySelectorAll('[role="menuitem"]')].map((x) => x.textContent.trim());
    assert.ok(items.includes('Compartir PDF') && !items.includes('Descargar PDF') && !items.includes('Imprimir'), items.join('|'));
    document.querySelector('.enp-mn-item').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    elegir(editor(), 'Más acciones', 'Compartir PDF');
    await esperar(() => compartidos.length === 1);
    assert.equal(compartidos[0].files[0].type, 'application/pdf');
    assert.match(compartidos[0].files[0].name, /^Alevin-2026-10-14-.*\.pdf$/);
    assert.equal(c.descargas.length, 0);
    await esperar(() => /PDF compartido/.test(document.querySelector('#toasts')?.textContent || ''));
    modo = 'cancel';
    elegir(editor(), 'Más acciones', 'Compartir PDF');
    await esperar(() => compartidos.length === 2);
    await tick(30);
    assert.equal(c.descargas.length, 0, 'cancelling the share sheet does nothing');
    modo = 'fail';
    elegir(editor(), 'Más acciones', 'Compartir PDF');
    await esperar(() => c.descargas.length === 1);
    elegir(editor(), 'Más acciones', 'Vista previa');
    await esperar(() => abiertas.length === 1);
    assert.match(abiertas[0][0], /^blob:/);
    assert.equal(document.querySelector('.enp-prev'), null, 'no iframe preview on mobile');
  } finally {
    delete navigator.share;
    delete navigator.canShare;
  }
});

test('Save to Drive: needs the Drive connection (disabled with an explanation in demo mode) and uploads to cnl/entrenos', async () => {
  const demo = await montar({ modo: 'demo' });
  abrirPlan(demo, 'Sesión Alevín');
  const m = abrirMenu(editor(), 'Más acciones');
  const it = [...m.querySelectorAll('[role="menuitem"]')].find((x) => x.textContent.includes('Guardar en Drive'));
  assert.equal(it.getAttribute('aria-disabled'), 'true');
  assert.match(m.textContent, /Disponible al conectar con tu Drive/);
  it.click();
  await tick(30);
  assert.ok(document.querySelector('.enp-mn'), 'a disabled item does nothing and keeps the menu open');
  assert.equal(demo.descargas.length, 0);

  const c = await montar();
  const llamadas = [];
  c.ctx.drive = {
    ensureFolderPath: async (p) => { llamadas.push(['carpeta', p]); return 'f1'; },
    findFile: async (n, padre) => { llamadas.push(['buscar', n, padre]); return null; },
    upload: async (o) => { llamadas.push(['subir', o]); return { id: 'nuevo', name: o.name }; },
    fileUrl: (id) => 'https://drive/' + id,
  };
  abrirPlan(c, 'Sesión Alevín');
  elegir(editor(), 'Más acciones', 'Guardar en Drive');
  await esperar(() => llamadas.some((x) => x[0] === 'subir'));
  assert.deepEqual(llamadas[0], ['carpeta', ['entrenos']]);
  const subida = llamadas.find((x) => x[0] === 'subir')[1];
  assert.match(subida.name, /^Alevin-\d{4}-\d{2}-\d{2}-[a-z]+\.pdf$/);
  assert.equal(subida.mimeType, 'application/pdf');
  assert.equal(subida.parentId, 'f1');
  await esperar(() => /PDF guardado en Drive \(cnl\/entrenos\): Alevin-/.test(document.querySelector('#toasts')?.textContent || ''));
  c.ctx.drive.upload = async () => { throw new Error('boom'); };
  const consola = console.error;
  console.error = () => {};
  try {
    elegir(editor(), 'Más acciones', 'Guardar en Drive');
    await esperar(() => /No se pudo guardar en Drive/.test(document.querySelector('#toasts')?.textContent || ''));
  } finally { console.error = consola; }
  assert.ok(editor());
});

test('in English the interface and the PDF are in English', async () => {
  const c = await montar();
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('en', { persist: false });
  await c.vista.render(c.container, [], c.ctx);
  botonTexto(c.container, 'Generate PDF for the week', false);
  botonTexto(tarjeta(c, 'Sesión Alevín'), 'Open plan').click();
  assert.equal(totalTexto(), 'Total: 900 m · 25 min · 2 sets');
  assert.equal(estadoTexto(), 'All saved');
  assert.ok(editor().textContent.includes('Session details'));
  elegir(editor(), 'More actions', 'Download PDF');
  const d = await pdfDescargado(c);
  assert.ok(d.info.texto.includes('TOTALS'));
  assert.match(d.nombre, /^Alevin-\d{4}-\d{2}-\d{2}-[a-z]+\.pdf$/);
  i18n.setLang('es', { persist: false });
});
