// Integration of the plan editor with several contents per exercise: chips, auto/manual split, unassigned remainder,
// autocomplete from the text, styles, live summary, copy, logging loads and read mode (jsdom + in-memory repository).
import base from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp, tick } from '../helpers/env.js';

const AEL = 'Aeróbico ligero';
const SPR = 'Aláctico / Sprint';
const hoy = '2026-10-15';

function fakeStore(datos = {}) {
  const db = { Entrenamientos: [], EntrenoLineas: [], Grupos: [], Cargas: [], Nadadores: [], Asistencia: [], TiposCarga: [], ObjetivosCarga: [], ...datos };
  let n = 0;
  return {
    db, club: { nombre: 'Club Test' },
    list: (h) => (db[h] || []).slice(),
    get: (h, id) => (db[h] || []).find((r) => r.id === String(id)) || null,
    upsert(h, row) {
      const fila = { ...row, id: row.id ? String(row.id) : 'id' + (++n) };
      const i = db[h].findIndex((r) => r.id === fila.id);
      if (i >= 0) db[h][i] = fila; else db[h].push(fila);
      return fila;
    },
    remove(h, id) { db[h] = db[h].filter((r) => r.id !== String(id)); },
    on: () => () => {},
  };
}
const L = (set, orden, extra) => ({ id: `l${set}-${orden}`, entrenamientoId: 's1', set, orden, ...extra });
const PLAN = [
  L(1, 1, { tiempoMin: 7, objetivo: 'Calentamiento', series: 1, distancia: 300, ejercicio: 'Suave' }),
  L(2, 1, { tiempoMin: 20, series: 4, distancia: 100, ejercicio: '4x100 Crol. 75 AeL-25 Tope', componentes: JSON.stringify([{ contenido: AEL, metrosPorRep: 75, modo: 'auto' }, { contenido: SPR, metrosPorRep: 25, modo: 'auto' }]), estilo: 'Crol' }),
];

async function montar({ plan = PLAN, extra = {} } = {}) {
  setupEnv();
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('es', { persist: false });
  const ui = await importApp('js/ui.js');
  const { sembrarCatalogo, filaTipo } = await importApp('js/domain/cargas.js');
  const store = fakeStore({
    Grupos: [{ id: 'g2', nombre: 'Alevín' }],
    Entrenamientos: [{ id: 's1', fecha: hoy, hora: '19:50', grupoId: 'g2', titulo: 'Sesión Alevín', estado: 'planificado', piscina: '50', duracionMin: 90 }],
    EntrenoLineas: plan.map((l) => ({ ...l })),
    TiposCarga: sembrarCatalogo([]).map(filaTipo),
    Nadadores: [{ id: 'n1', grupoId: 'g2', activo: 'true' }, { id: 'n2', grupoId: 'g2', activo: 'true' }],
    ...extra,
  });
  const auth = { user: null, ensureToken: async () => 'tok', on: () => () => {} };
  const ctx = { store, auth, ui };
  const { abrirEditor } = await importApp('js/views/entreno-editor.js');
  const ed = abrirEditor({ ctx, sesionId: 's1' });
  await tick();
  return { store, ctx, ed, i18n, ui };
}

const test = (name, fn) => base(name, async () => { await fn(); });
const editor = () => document.querySelector('.enp-ov:not(.enp-prev-ov)');
const fila = (set, orden) => editor().querySelector(`.enp-row[data-set="${set}"][data-orden="${orden}"]`);
const campo = (set, orden, c) => fila(set, orden).querySelector(`[data-campo="${c}"]`);
const poner = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const elegir = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };
const clic = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const botones = (raiz) => [...raiz.querySelectorAll('button')];
const boton = (raiz, txt) => {
  const b = botones(raiz).find((x) => x.textContent.trim() === txt || x.getAttribute('aria-label') === txt || x.textContent.includes(txt));
  if (!b) throw new Error('No button: ' + txt);
  return b;
};
const chips = (set, orden) => [...fila(set, orden).querySelectorAll('.enp-c')];
const chip = (set, orden, nombre) => chips(set, orden).find((c) => c.dataset.contenido === nombre);
const resumenTexto = () => editor().querySelector('[data-resumen="texto"]').textContent;
const leyenda = (cual) => Object.fromEntries([...editor().querySelectorAll(`.enp-res-${cual} .enp-leg li`)].map((li) => [li.dataset.clave, [...li.children].slice(2).map((x) => x.textContent)]));
const avisos = () => editor().querySelector('.enp-avisos').textContent;
const esperar = async (fn, ms = 4000) => {
  const fin = Date.now() + ms;
  for (;;) { try { const r = fn(); if (r) return r; } catch (e) { /* reintentar */ } if (Date.now() > fin) throw new Error('Tiempo agotado: ' + fn); await tick(20); }
};

test('shows the row contents as coloured chips and the coach\'s example summary', async () => {
  await montar();
  assert.equal(chips(2, 1).length, 2);
  assert.match(chip(2, 1, AEL).querySelector('.enp-c-name').textContent, /Aeróbico ligero/);
  assert.equal(chip(2, 1, AEL).style.getPropertyValue('--cc'), '#2e9e73', 'catalogue colour');
  assert.equal(chip(2, 1, AEL).querySelector('.enp-c-val').value, '75');
  assert.match(chip(2, 1, AEL).querySelector('.enp-c-res').textContent, /75 m\/rep · 300 m en total · 75 % de la fila/);
  assert.equal(chip(2, 1, SPR).querySelector('.enp-c-modo').textContent, 'Auto');
  assert.equal(fila(1, 1).querySelectorAll('.enp-c').length, 0, 'the old row has no chips');
  assert.equal(campo(2, 1, 'estilo').value, 'Crol');
  // summary: 700 m = warm-up (AeL by its objective) 300 + 400; AeL 600, Sprint 100
  assert.match(editor().querySelector('.enp-res-bar').textContent, /700 m · 27 min/);
  assert.deepEqual(leyenda('cont'), { [AEL]: ['600 m', '85,7 %'], [SPR]: ['100 m', '14,3 %'] });
  assert.deepEqual(leyenda('est'), { Crol: ['400 m', '57,1 %'], '': ['300 m', '42,9 %'] });
  assert.equal(resumenTexto().split('\n')[0], 'Volumen total: 700 m (AeL 600 m · Sprint 100 m) · Por estilo: Crol 400 m · Sin estilo 300 m');
  assert.match(editor().querySelector('.enp-set[data-set="2"] .enp-set-cont').textContent, /AeL 75 % · Sprint 25 %/);
  assert.equal(editor().querySelector('.enp-tot').textContent, 'Total: 700 m · 27 min · 2 sets', 'the total is still the sum of Dist. Bloque');
  assert.ok(editor().querySelector('.enp-res-bar').getAttribute('aria-controls'));
});

test('adding contents from the selector: one gets the whole distance, two split it equally', async () => {
  await montar();
  const sel = fila(1, 1).querySelector('.enp-c-add');
  assert.ok([...sel.options].some((o) => o.textContent === 'Añadir contenido…'), 'option to create a new one');
  assert.ok([...sel.options].some((o) => o.value === 'Piernas'));
  elegir(sel, 'Piernas');
  assert.equal(chips(1, 1).length, 1);
  assert.match(chip(1, 1, 'Piernas').querySelector('.enp-c-res').textContent, /300 m\/rep · 300 m en total · 100 %/);
  assert.deepEqual(leyenda('cont').Piernas, ['300 m', '42,8 %']);
  elegir(fila(1, 1).querySelector('.enp-c-add'), 'Técnica');
  assert.match(chip(1, 1, 'Piernas').querySelector('.enp-c-res').textContent, /150 m\/rep · 150 m en total · 50 %/);
  assert.match(chip(1, 1, 'Técnica').querySelector('.enp-c-res').textContent, /150 m\/rep/);
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-val').placeholder, '150', 'the automatic value is shown as a suggestion');
  assert.ok(![...fila(1, 1).querySelector('.enp-c-add').options].some((o) => o.value === 'Piernas'), 'already added: not offered again');
  assert.ok(boton(fila(1, 1), 'Repartir a partes iguales'));
  assert.deepEqual(leyenda('cont').Piernas, ['150 m', '21,4 %']);
  // remove
  clic(boton(fila(1, 1), 'Quitar Piernas (Set 1, fila 1)'));
  assert.equal(chips(1, 1).length, 1);
  assert.deepEqual(leyenda('cont')['Técnica'], ['300 m', '42,8 %']);
});

test('manual split by metres or %, Auto/Manual toggle and live summary (the % add up to 100)', async () => {
  await montar();
  elegir(fila(1, 1).querySelector('.enp-c-add'), 'Piernas');
  elegir(fila(1, 1).querySelector('.enp-c-add'), 'Técnica');
  // manual by metres per repetition
  poner(chip(1, 1, 'Piernas').querySelector('.enp-c-val'), '100');
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-modo').textContent, 'Manual');
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-modo').getAttribute('aria-pressed'), 'true');
  assert.match(chip(1, 1, 'Técnica').querySelector('.enp-c-res').textContent, /200 m\/rep/, 'the automatic one receives the remainder');
  assert.deepEqual(leyenda('cont').Piernas, ['100 m', '14,3 %']);
  assert.equal(editor().querySelector('.enp-c-resto').hidden, true);
  // unit %: 25 % of 300 = 75
  elegir(chip(1, 1, 'Piernas').querySelector('.enp-c-un'), 'pct');
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-val').value, '33.3', 'keeps what was calculated, now in %');
  poner(chip(1, 1, 'Piernas').querySelector('.enp-c-val'), '25');
  assert.match(chip(1, 1, 'Piernas').querySelector('.enp-c-res').textContent, /75 m\/rep · 75 m en total · 25 %/);
  assert.match(chip(1, 1, 'Técnica').querySelector('.enp-c-res').textContent, /225 m\/rep/);
  const pcts = Object.values(leyenda('cont')).map((x) => parseFloat(x[1].replace(',', '.')));
  assert.equal(Math.round(pcts.reduce((a, b) => a + b, 0) * 10) / 10, 100, 'the % add up to 100');
  // back to automatic
  clic(chip(1, 1, 'Piernas').querySelector('.enp-c-modo'));
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-modo').textContent, 'Auto');
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-val').value, '');
  assert.match(chip(1, 1, 'Piernas').querySelector('.enp-c-res').textContent, /150 m\/rep/);
  // auto -> manual freezes the current value
  clic(chip(1, 1, 'Técnica').querySelector('.enp-c-modo'));
  assert.equal(chip(1, 1, 'Técnica').querySelector('.enp-c-modo').textContent, 'Manual');
  assert.equal(chip(1, 1, 'Técnica').querySelector('.enp-c-val').value, '150');
  // an invalid value is flagged and does not change the split
  poner(chip(1, 1, 'Técnica').querySelector('.enp-c-val'), 'abc');
  assert.equal(chip(1, 1, 'Técnica').querySelector('.enp-c-val').getAttribute('aria-invalid'), 'true');
  assert.match(chip(1, 1, 'Técnica').querySelector('.enp-c-res').textContent, /150 m\/rep/);
});

test('unassigned remainder: warning, indicator and "Asignar resto" to a content; the excess is also warned about', async () => {
  await montar();
  elegir(fila(1, 1).querySelector('.enp-c-add'), 'Piernas');
  poner(chip(1, 1, 'Piernas').querySelector('.enp-c-val'), '200');
  const resto = fila(1, 1).querySelector('.enp-c-resto');
  assert.equal(resto.hidden, false);
  assert.match(resto.textContent, /Sin asignar: 100 m por repetición \(100 m en total\)/);
  assert.match(avisos(), /Set 1, fila 1:.*Reparto de contenidos incompleto: faltan 100 m por repetición \(de 300 m\)/);
  assert.equal(editor().querySelector('.enp-err'), null, 'it is a warning, not an error');
  assert.deepEqual(leyenda('cont')[''], ['100 m', '14,3 %'], 'the unassigned part counts as "no content"');
  // assign the remainder to another content (the dropdown offers those in the catalogue)
  const sel = resto.querySelector('select');
  assert.ok([...sel.options].some((o) => o.value === 'Técnica'));
  elegir(sel, 'Técnica');
  clic(boton(resto, 'Asignar resto'));
  assert.equal(chips(1, 1).length, 2);
  assert.equal(chip(1, 1, 'Técnica').querySelector('.enp-c-modo').textContent, 'Manual');
  assert.match(chip(1, 1, 'Técnica').querySelector('.enp-c-res').textContent, /100 m\/rep/);
  assert.equal(fila(1, 1).querySelector('.enp-c-resto').hidden, true);
  assert.doesNotMatch(avisos(), /Reparto de contenidos/);
  assert.match(document.querySelector('#toasts').textContent, /Resto asignado a Técnica/);
  // excess: two manual ones that overshoot
  poner(chip(1, 1, 'Técnica').querySelector('.enp-c-val'), '150');
  assert.match(fila(1, 1).querySelector('.enp-c-resto').textContent, /Se pasa 50 m por repetición/);
  assert.match(avisos(), /se pasa 50 m por repetición/);
  const total = Math.round(Object.values(leyenda('cont')).reduce((a, x) => a + parseFloat(x[0].replace(',', '.')), 0));
  assert.equal(total, 700, 'even so the per-content totals add up to the 700 m of the session');
});

test('autocomplete from the text: sets, distance, contents and style; respects manual ones', async () => {
  const c = await montar();
  poner(campo(1, 1, 'ejercicio'), '4x100 Crol. 75 AeL-25 Tope');
  clic(boton(fila(1, 1), 'Autocompletar desde el texto (Set 1, fila 1)'));
  assert.equal(campo(1, 1, 'series').value, '4');
  assert.equal(campo(1, 1, 'distancia').value, '100');
  assert.equal(fila(1, 1).querySelector('output').textContent, '400');
  assert.deepEqual(chips(1, 1).map((x) => x.dataset.contenido), [AEL, SPR]);
  assert.equal(campo(1, 1, 'estilo').value, 'Crol');
  assert.match(document.querySelector('#toasts').textContent, /Autocompletado desde el texto \(contenidos: 2, estilos: 1\)/);
  assert.equal(resumenTexto().split('\n')[0], 'Volumen total: 800 m (AeL 600 m · Sprint 200 m) · Por estilo: Crol 800 m');
  // a manual one is not replaced when autocompleting again
  poner(chip(1, 1, SPR).querySelector('.enp-c-val'), '40');
  clic(boton(fila(1, 1), 'Autocompletar desde el texto (Set 1, fila 1)'));
  assert.equal(chip(1, 1, SPR).querySelector('.enp-c-modo').textContent, 'Manual');
  assert.match(chip(1, 1, SPR).querySelector('.enp-c-res').textContent, /40 m\/rep/);
  // other patterns
  poner(campo(1, 1, 'ejercicio'), '3x(200 AeM + 100 AeI)');
  clic(boton(fila(1, 1), 'Autocompletar desde el texto (Set 1, fila 1)'));
  assert.equal(campo(1, 1, 'distancia').value, '300');
  assert.equal(campo(1, 1, 'series').value, '3');
  // text with nothing recognisable
  poner(campo(1, 1, 'ejercicio'), 'suave y a gusto');
  const antes = chips(1, 1).length;
  clic(boton(fila(1, 1), 'Autocompletar desde el texto (Set 1, fila 1)'));
  assert.match(document.querySelector('#toasts').textContent, /No se reconoce ningún contenido ni estilo/);
  assert.equal(chips(1, 1).length, antes);
  poner(campo(1, 1, 'ejercicio'), '2x100 AeL + 3x50 Pn');
  clic(boton(fila(1, 1), 'Autocompletar desde el texto (Set 1, fila 1)'));
  assert.match(document.querySelector('#toasts').textContent, /varios bloques/);
  void c;
});

test('style: one for the whole row, free "otro" and several styles with metres per repetition', async () => {
  await montar();
  assert.equal(campo(1, 1, 'estilo').value, '');
  elegir(campo(1, 1, 'estilo'), 'Espalda');
  assert.deepEqual(leyenda('est').Espalda, ['300 m', '42,9 %']);
  clic(boton(fila(1, 1), 'Añadir otro estilo'));
  const sels = fila(1, 1).querySelectorAll('[data-campo="estilo"]');
  assert.equal(sels.length, 2);
  const m = fila(1, 1).querySelectorAll('[data-campo="estilo-metros"]');
  assert.equal(m.length, 2);
  assert.equal(m[0].placeholder, '150', 'equal parts by default');
  poner(m[0], '100');
  assert.deepEqual(leyenda('est'), { Crol: ['600 m', '85,7 %'], Espalda: ['100 m', '14,3 %'] }, 'Espalda 100 + Crol the rest (200) in row 1, and 400 of Crol in row 2');
  // another free style
  elegir(fila(1, 1).querySelectorAll('[data-campo="estilo"]')[1], '__otro');
  const otro = fila(1, 1).querySelector('[data-campo="estilo-otro"]');
  assert.ok(otro);
  poner(otro, 'Tortuga');
  assert.ok(leyenda('est').Tortuga, 'the free style appears in the summary');
  // remove the second and go back to "no style"
  clic(boton(fila(1, 1), 'Quitar el estilo Tortuga (Set 1, fila 1)'));
  assert.equal(fila(1, 1).querySelectorAll('[data-campo="estilo"]').length, 1);
  elegir(campo(1, 1, 'estilo'), '');
  assert.equal(leyenda('est').Espalda, undefined);
});

test('saving persists components and style in the sheet; on reopening the chips come back', async () => {
  const c = await montar();
  elegir(fila(1, 1).querySelector('.enp-c-add'), 'Piernas');
  poner(chip(1, 1, 'Piernas').querySelector('.enp-c-val'), '100');
  elegir(fila(1, 1).querySelector('.enp-c-add'), 'Técnica');
  elegir(campo(1, 1, 'estilo'), 'Mariposa');
  clic(boton(editor(), 'Guardar'));
  const guardada = c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1');
  assert.deepEqual(JSON.parse(guardada.componentes).map((x) => [x.contenido, x.metrosPorRep, x.modo]), [['Piernas', 100, 'manual'], ['Técnica', null, 'auto']]);
  assert.equal(guardada.estilo, 'Mariposa');
  const intacta = c.store.db.EntrenoLineas.find((l) => l.id === 'l2-1');
  assert.deepEqual(JSON.parse(intacta.componentes).map((x) => x.metrosPorRep), [75, 25]);
  assert.equal(intacta.estilo, 'Crol');
  c.ed.cerrar();
  const { abrirEditor } = await importApp('js/views/entreno-editor.js');
  abrirEditor({ ctx: c.ctx, sesionId: 's1' });
  assert.deepEqual(chips(1, 1).map((x) => x.dataset.contenido), ['Piernas', 'Técnica']);
  assert.equal(chip(1, 1, 'Piernas').querySelector('.enp-c-modo').textContent, 'Manual');
  assert.equal(campo(1, 1, 'estilo').value, 'Mariposa');
  assert.match(chip(1, 1, 'Técnica').querySelector('.enp-c-res').textContent, /200 m\/rep/);
});

test('copy the summary: text with volume, contents, styles and percentages', async () => {
  await montar();
  const copiado = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (x) => { copiado.push(x); } }, configurable: true });
  clic(boton(editor(), 'Copiar resumen'));
  await esperar(() => copiado.length);
  const [linea1, linea2] = copiado[0].split('\n');
  assert.equal(linea1, 'Volumen total: 700 m (AeL 600 m · Sprint 100 m) · Por estilo: Crol 400 m · Sin estilo 300 m');
  assert.equal(linea2, '% por contenido: AeL 85,7 % · Sprint 14,3 % · % por estilo: Crol 57,1 % · Sin estilo 42,9 %');
  await esperar(() => /Resumen copiado/.test(document.querySelector('#toasts')?.textContent || ''));
  // no clipboard or execCommand: error notice
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('no'); } }, configurable: true });
  document.querySelector('#toasts').replaceChildren();
  clic(boton(editor(), 'Copiar resumen'));
  await esperar(() => /No se pudo copiar el resumen/.test(document.querySelector('#toasts')?.textContent || ''));
});

test('log loads from the plan: confirms, saves, creates one load per content and swimmer and does not duplicate', async () => {
  const c = await montar();
  clic(boton(editor(), 'Registrar cargas desde el plan'));
  await esperar(() => document.querySelector('.modal'));
  assert.match(document.querySelector('.modal').textContent, /se registrará una carga por contenido y nadador/);
  clic(boton(document.querySelector('.modal'), 'Aceptar'));
  await esperar(() => c.store.db.Cargas.length === 4);
  assert.deepEqual(c.store.db.Cargas.filter((x) => x.nadadorId === 'n1').map((x) => [x.tipo, x.metros]).sort(), [[AEL, 600], [SPR, 100]]);
  assert.ok(c.store.db.Cargas.every((x) => x.entrenamientoId === 's1' && x.fecha === hoy));
  await esperar(() => /Cargas registradas: 4 \(0 ya existían\)/.test(document.querySelector('#toasts')?.textContent || ''));
  clic(boton(editor(), 'Registrar cargas desde el plan'));
  await esperar(() => document.querySelector('.modal'));
  clic(boton(document.querySelector('.modal'), 'Aceptar'));
  await esperar(() => /ya estaban registradas \(4\)/.test(document.querySelector('#toasts')?.textContent || ''));
  assert.equal(c.store.db.Cargas.length, 4);
});

test('"Añadir contenido…" creates the content in the catalogue (with alias) and adds it to the row', async () => {
  const c = await montar();
  elegir(fila(1, 1).querySelector('.enp-c-add'), '__nuevo');
  const modal = await esperar(() => document.querySelector('.modal'));
  const inputs = modal.querySelectorAll('input[type="text"]');
  poner(inputs[0], 'Fuerza en seco');
  const alias = [...modal.querySelectorAll('label')].find((l) => l.textContent.startsWith('Alias')).querySelector('input');
  poner(alias, 'FZ, Fuer');
  clic(boton(modal, 'Guardar'));
  await esperar(() => c.store.db.TiposCarga.some((t) => t.nombre === 'Fuerza en seco'));
  const nuevo = c.store.db.TiposCarga.find((t) => t.nombre === 'Fuerza en seco');
  assert.equal(nuevo.alias, 'FZ, Fuer');
  await esperar(() => chips(1, 1).length === 1);
  assert.equal(chip(1, 1, 'Fuerza en seco').querySelector('.enp-c-name').textContent, 'Fuerza en seco');
  assert.deepEqual(leyenda('cont')['Fuerza en seco'], ['300 m', '42,8 %']);
  // the new alias is used when autocompleting
  poner(campo(2, 1, 'ejercicio'), '4x100 50 FZ + 50 AeL');
  clic(boton(fila(2, 1), 'Autocompletar desde el texto (Set 2, fila 1)'));
  assert.deepEqual(chips(2, 1).map((x) => x.dataset.contenido), ['Fuerza en seco', AEL]);
});

test('templates with contents and old plan without components: the summary appears without touching the data', async () => {
  const c = await montar({ plan: [L(1, 1, { objetivo: 'Piernas', series: 8, distancia: 50 }), L(1, 2, { series: 4, distancia: 25, ejercicio: 'tec' })] });
  assert.deepEqual(leyenda('cont'), { Piernas: ['500 m', '100 %'] });
  c.ed.cerrar();
  const { abrirEditor } = await importApp('js/views/entreno-editor.js');
  abrirEditor({ ctx: c.ctx, sesionId: 's1' });
  const sel = editor().querySelectorAll('.enp-tools select')[0];
  elegir(sel, 'aerobico');
  clic(boton(editor(), 'Usar plantilla'));
  await esperar(() => document.querySelector('.modal'));
  clic(boton(document.querySelector('.modal'), 'Aceptar'));
  await esperar(() => resumenTexto().includes('AeL'));
  assert.ok(chips(3, 2).some((x) => x.dataset.contenido === SPR), 'the template brings the 75 AeL + 25 Tope example');
  assert.equal(campo(3, 2, 'ejercicio').value, '4x100 Crol. 75 AeL-25 Tope');
  assert.match(avisosSinErrores(), /^$/, 'the template generates no split warnings');
});
const avisosSinErrores = () => [...editor().querySelectorAll('.enp-avisos li')].map((x) => x.textContent).filter((x) => /Reparto/.test(x)).join('');

test('in English: labels, styles and summary translated', async () => {
  const c = await montar();
  c.ed.cerrar();
  c.i18n.setLang('en', { persist: false });
  const { abrirEditor } = await importApp('js/views/entreno-editor.js');
  abrirEditor({ ctx: c.ctx, sesionId: 's1' });
  assert.ok(fila(1, 1).querySelector('.enp-c-add').options[0].textContent === 'Add content');
  assert.equal(editor().querySelector('.enp-res-bar').getAttribute('aria-label'), 'Session summary: 700 m · 27 min');
  assert.match(resumenTexto(), /Total volume: 700 m \(AeL 600 m · Sprint 100 m\) · By stroke: Freestyle 400 m · No stroke 300 m/);
  assert.ok([...campo(2, 1, 'estilo').options].some((o) => o.textContent === 'Backstroke'));
  assert.equal(chip(2, 1, AEL).querySelector('.enp-c-name').textContent, 'Light aerobic');
  c.i18n.setLang('es', { persist: false });
});
