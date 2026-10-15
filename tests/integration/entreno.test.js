// Integración del plan de entreno: vista Entrenamientos, editor, PDF (descarga/vista previa/imprimir/Drive) y Mi espacio,
// sobre jsdom y un repositorio en memoria (independiente del store real).
import base from 'node:test';
import assert from 'node:assert/strict';
import { setupEnv, importApp, tick } from '../helpers/env.js';
import { infoPdf, libNode } from '../helpers/pdf.js';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = new Date();
const manana = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1);
const diaNombre = (f) => new Intl.DateTimeFormat('es-ES', { weekday: 'long' }).format(new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10)));
const ascii = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function fakeStore(datos = {}) {
  const db = { Entrenamientos: [], EntrenoLineas: [], Grupos: [], Cargas: [], Nadadores: [], Asistencia: [], Usuarios: [], Marcas: [], Comunicaciones: [], ...datos };
  const oyentes = new Set();
  let n = 0;
  const emit = () => oyentes.forEach((f) => f({ type: 'change' }));
  return {
    db, club: { nombre: 'Club Test', colorPrimario: '#4aa32a', colorSecundario: '#2f6f1a' },
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

// Entorno: DOM nuevo, i18n en español, PDF con la librería de Node, descargas y blobs interceptados
async function montar({ rol = 'admin', user = null, conPlan = true, extraDatos = {} } = {}) {
  setupEnv();
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('es', { persist: false });
  const ui = await importApp('js/ui.js');
  const P = await importApp('js/infrastructure/pdfEntreno.js');
  P.usarLibreria(libNode());
  const store = fakeStore({
    Grupos: [{ id: 'g2', nombre: 'Alevín' }, { id: 'g1', nombre: 'Promoción' }],
    Entrenamientos: [
      { id: 's1', fecha: iso(hoy), hora: '19:50', grupoId: 'g2', titulo: 'Sesión Alevín', estado: 'planificado', piscina: '50', volumenMin: '', volumenMax: '', tipoSesion: 'Aer+Ritmo', materialDia: 'JJDD', notasGenerales: 'Tabla' },
      { id: 's2', fecha: iso(hoy), hora: '17:30', grupoId: 'g1', titulo: 'Sesión Promo', estado: 'planificado', piscina: '25' },
      { id: 's3', fecha: iso(manana), hora: '18:00', grupoId: 'g2', titulo: 'Sesión mañana', estado: 'planificado', piscina: '25' },
    ],
    EntrenoLineas: conPlan ? PLAN.map((l) => ({ ...l })) : [],
    Nadadores: [{ id: 'n1', nombre: 'Carla', apellidos: 'Menéndez', grupoId: 'g2', categoria: 'Alevín' }],
    ...extraDatos,
  });
  const auth = { user, role: () => rol, ensureToken: async () => 'tok-test', demoRole: null, on: () => () => {} };
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
  const ctx = { store, auth, ui };
  const vista = await importApp('js/views/entrenamientos.js');
  await vista.render(container, [], ctx);
  await tick();
  return { store, auth, ui, ctx, container, blobs, descargas, vista, P };
}

const test = (name, fn) => base(name, async () => { await fn(); });
const botones = (raiz) => [...raiz.querySelectorAll('button')];
const botonTexto = (raiz, txt, exacto = true) => {
  const b = botones(raiz).find((x) => (exacto ? x.textContent.trim() === txt : x.textContent.includes(txt)) || x.getAttribute('aria-label') === txt);
  if (!b) throw new Error('No hay botón: ' + txt + ' en ' + botones(raiz).map((x) => x.textContent.trim()).join(' | '));
  return b;
};
const sesion = (c, titulo) => [...c.container.querySelectorAll('.ent-sess')].find((e) => e.textContent.includes(titulo));
async function esperar(fn, ms = 4000) {
  const fin = Date.now() + ms;
  for (;;) {
    try { const r = fn(); if (r) return r; } catch (e) { /* reintentar */ }
    if (Date.now() > fin) throw new Error('Tiempo agotado esperando: ' + fn);
    await tick(20);
  }
}
const poner = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input', { bubbles: true })); };
const editor = () => document.querySelector('.enp-ov:not(.enp-prev-ov)');
const fila = (set, orden) => editor().querySelector(`.enp-row[data-set="${set}"][data-orden="${orden}"]`);
const campo = (set, orden, c) => fila(set, orden).querySelector(`[data-campo="${c}"]`);
const totalTexto = () => editor().querySelector('.enp-tot').textContent;
async function pdfDescargado(c, n = 1) {
  await esperar(() => c.descargas.length >= n);
  const d = c.descargas[n - 1];
  const blob = c.blobs[c.blobs.length - 1];
  return { ...d, info: infoPdf(Buffer.from(await blob.arrayBuffer())) };
}

test('lista semanal: resumen del plan, botones Plan/PDF y PDF de la semana', async () => {
  const c = await montar();
  const s = sesion(c, 'Sesión Alevín');
  assert.match(s.textContent, /900 m · 25 min/);
  assert.ok(botonTexto(s, 'Plan'));
  assert.ok(botonTexto(s, 'PDF'));
  assert.ok(botonTexto(s, 'Editar'));
  assert.ok(botonTexto(c.container, 'Generar PDF de la semana', false));
  assert.doesNotMatch(sesion(c, 'Sesión Promo').textContent, / m · \d+ min/, 'sin plan no hay resumen');
});

test('descargar el PDF de una sesión: nombre Grupo-fecha-dia.pdf y contenido', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'PDF').click();
  const d = await pdfDescargado(c);
  assert.equal(d.nombre, `Alevin-${iso(hoy)}-${ascii(diaNombre(iso(hoy)))}.pdf`);
  assert.match(d.info.cabecera, /^%PDF-/);
  assert.equal(d.info.paginas, 1);
  const t = d.info.texto.replace(/\s+/g, ' ');
  for (const e of ['Aer+Ritmo', 'JJDD', 'Calentamiento', 'Piernas', "C/1'10\"", 'TOTALES', 'Club Test']) assert.ok(t.includes(e), e);
  assert.match(t, /TOTALES 25/);
  await esperar(() => document.querySelector('#toasts .toast'));
  assert.match(document.querySelector('#toasts').textContent, /PDF generado: Alevin-/);
});

test('PDF de la semana: una página por sesión y filtro por grupo', async () => {
  const c = await montar();
  botonTexto(c.container, 'Generar PDF de la semana', false).click();
  let d = await pdfDescargado(c);
  assert.match(d.nombre, /^Club-semana-\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(d.info.paginas, 2 + (iso(manana) >= iso(hoy) && new Date(manana).getDay() !== 1 ? 1 : 0), 'hoy (2 sesiones) y mañana si cae en la misma semana');
  const sel = c.container.querySelector('.ent-bar select');
  sel.value = 'g2';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  await tick();
  botonTexto(c.container, 'Generar PDF de la semana', false).click();
  d = await pdfDescargado(c, 2);
  assert.match(d.nombre, /^Alevin-semana-/);
  assert.ok(d.info.texto.replace(/\s+/g, ' ').includes('Alevín'));
});

test('editor: totales en vivo al escribir y estructura por sets', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  assert.ok(editor(), 'editor abierto');
  assert.equal(editor().querySelector('.enp-panel').getAttribute('role'), 'dialog');
  assert.equal(totalTexto(), 'Total: 900 m · 25 min · 2 sets');
  assert.equal(editor().querySelectorAll('.enp-set').length, 2);
  assert.equal(campo(1, 1, 'ejercicio').value, 'Suave');
  assert.equal(fila(1, 2).querySelector('output').textContent, '200');
  poner(campo(1, 2, 'series'), '6');
  assert.equal(fila(1, 2).querySelector('output').textContent, '300');
  assert.equal(totalTexto(), 'Total: 1000 m · 25 min · 2 sets');
  poner(campo(2, 1, 'tiempoMin'), '20');
  assert.equal(totalTexto(), 'Total: 1000 m · 33 min · 2 sets');
  assert.match(editor().querySelectorAll('.enp-set-tot')[0].textContent, /600 m · 13 min/);
  // atajos móviles: teclados numéricos y autocompletar
  for (const cmp of ['tiempoMin', 'series', 'distancia']) assert.equal(campo(1, 1, cmp).getAttribute('inputmode'), 'numeric');
  assert.equal(campo(1, 1, 'objetivo').getAttribute('list'), 'enp-dl-objetivo');
  const opciones = [...document.querySelectorAll('#enp-dl-objetivo option')].map((o) => o.value);
  assert.ok(opciones.includes('Calentamiento') && opciones.includes('Piernas'), 'sugiere lo usado antes');
  assert.ok(opciones.includes('Vuelta a la calma'), 'y los valores habituales');
  assert.ok(editor().querySelector('#enp-dl-distancia option[value="100"]'));
});

test('editor: añadir, duplicar, mover y quitar sets y filas', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  botonTexto(editor(), 'Añadir set').click();
  assert.equal(editor().querySelectorAll('.enp-set').length, 3);
  poner(campo(3, 1, 'ejercicio'), 'Nuevo');
  botonTexto(editor(), 'Duplicar el set 2').click();
  assert.equal(editor().querySelectorAll('.enp-set').length, 4);
  assert.equal(campo(3, 1, 'ejercicio').value, 'Pn C', 'la copia queda justo después del original');
  assert.equal(totalTexto(), 'Total: 1300 m · 37 min · 4 sets');
  botonTexto(editor(), 'Subir el set 3').click();
  assert.equal(campo(2, 1, 'ejercicio').value, 'Pn C');
  botonTexto(editor(), 'Quitar el set 2').click();
  assert.equal(editor().querySelectorAll('.enp-set').length, 3);
  botonTexto(editor(), 'Añadir fila al set 1').click();
  assert.ok(fila(1, 3));
  botonTexto(editor(), 'Duplicar fila (Set 1, fila 1)').click();
  assert.equal(campo(1, 2, 'ejercicio').value, 'Suave');
});

test('editor: Enter pasa a la fila siguiente y crea una al final; filas se mueven y duplican', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  const ultima = campo(1, 2, 'ejercicio');
  ultima.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.ok(fila(1, 3), 'Enter en la última fila del set añade una nueva');
  assert.equal(document.activeElement, campo(1, 3, 'ejercicio'));
  campo(1, 1, 'objetivo').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  assert.equal(document.activeElement, campo(1, 2, 'objetivo'));
  botonTexto(editor(), 'Bajar fila (Set 1, fila 1)').click();
  assert.equal(campo(1, 2, 'ejercicio').value, 'Suave', 'la fila 1 baja a la posición 2');
  botonTexto(editor(), 'Duplicar fila (Set 1, fila 2)').click();
  assert.equal(campo(1, 3, 'ejercicio').value, 'Suave');
  botonTexto(editor(), 'Quitar fila (Set 1, fila 3)').click();
  assert.ok(!fila(1, 4));
});

test('editor: valores no numéricos se marcan, bloquean guardar y PDF; la salida se normaliza', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  poner(campo(1, 2, 'series'), 'cuatro');
  assert.equal(campo(1, 2, 'series').getAttribute('aria-invalid'), 'true');
  assert.match(editor().querySelector('.enp-avisos').textContent, /Set 1, fila 2:.*series deben ser un número entero/);
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-2').series, 4, 'no se guarda con errores');
  botonTexto(editor(), 'Generar PDF').click();
  await tick(50);
  assert.equal(c.descargas.length, 0);
  poner(campo(1, 2, 'series'), '4');
  assert.equal(campo(1, 2, 'series').getAttribute('aria-invalid'), null);
  // salida desconocida: aviso (no error) y se normaliza al salir del campo
  poner(campo(1, 2, 'salida'), 'rapido');
  assert.match(editor().querySelector('.enp-avisos').textContent, /La salida "rapido" no se reconoce/);
  assert.equal(editor().querySelector('.enp-err'), null);
  poner(campo(1, 2, 'salida'), '1:10');
  campo(1, 2, 'salida').dispatchEvent(new window.Event('blur'));
  assert.equal(campo(1, 2, 'salida').value, "C/1'10\"");
});

test('editor: avisa si el total difiere de la carga registrada', async () => {
  const c = await montar({ extraDatos: { Cargas: [{ id: 'c1', entrenamientoId: 's1', nadadorId: 'n1', metros: 3000 }] } });
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  assert.match(editor().querySelector('.enp-avisos').textContent, /difiere de la carga registrada \(3000 m/);
});

test('editor: guardar persiste datos de la sesión y líneas; cerrar con cambios pide confirmar', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  const meta = editor().querySelectorAll('.enp-meta input');
  poner(meta[0], 'Técnica');
  poner(meta[1], 'Aletas');
  poner(meta[2], 'Contar brazadas');
  poner(campo(1, 1, 'ejercicio'), 'Mixto suave');
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.get('Entrenamientos', 's1').tipoSesion, 'Técnica');
  assert.equal(c.store.get('Entrenamientos', 's1').notasGenerales, 'Contar brazadas');
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').ejercicio, 'Mixto suave');
  assert.match(document.querySelector('#toasts').textContent, /Plan guardado/);
  // cambios sin guardar -> confirmación
  poner(campo(1, 1, 'ejercicio'), 'Otro');
  editor().querySelector('.enp-head .icon-btn').click();
  await esperar(() => document.querySelector('.modal'));
  assert.match(document.querySelector('.modal').textContent, /cambios sin guardar/);
  botonTexto(document.querySelector('.modal'), 'Cancelar').click();
  await tick();
  assert.ok(editor(), 'sigue abierto');
  editor().querySelector('.enp-head .icon-btn').click();
  await esperar(() => document.querySelector('.modal'));
  botonTexto(document.querySelector('.modal'), 'Aceptar').click();
  await esperar(() => !editor());
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').ejercicio, 'Mixto suave', 'lo descartado no se guarda');
});

test('editor: plantillas y copia desde otra sesión (con confirmación si hay contenido)', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión mañana'), 'Plan').click();
  assert.equal(editor().querySelectorAll('.enp-row').length, 1, 'sesión sin plan: un set con una fila vacía');
  const selPl = editor().querySelector('.enp-tools select');
  selPl.value = 'tecnica';
  botonTexto(editor(), 'Usar plantilla').click();
  await tick();
  assert.ok(editor().querySelectorAll('.enp-row').length >= 4);
  assert.match(totalTexto(), /Total: \d+ m/);
  assert.equal(editor().querySelector('.enp-meta input').value, 'Técnica');
  // copiar desde otra sesión: ya hay contenido -> confirmar
  const selSes = editor().querySelectorAll('.enp-tools select')[1];
  assert.ok([...selSes.options].some((o) => o.textContent.includes('Sesión Alevín')));
  selSes.value = 's1';
  botonTexto(editor(), 'Copiar plan').click();
  await esperar(() => document.querySelector('.modal'));
  botonTexto(document.querySelector('.modal'), 'Aceptar').click();
  await esperar(() => totalTexto() === 'Total: 900 m · 25 min · 2 sets');
  assert.equal(campo(2, 1, 'material').value, 'Tabla');
  botonTexto(editor(), 'Guardar').click();
  assert.equal(c.store.db.EntrenoLineas.filter((l) => l.entrenamientoId === 's3').length, 3);
});

test('editor: Generar PDF usa el borrador actual; vista previa e imprimir', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  poner(campo(1, 1, 'ejercicio'), 'Ejercicio sin guardar');
  botonTexto(editor(), 'Generar PDF').click();
  const d = await pdfDescargado(c);
  assert.ok(d.info.texto.replace(/\s+/g, '').includes('Ejerciciosinguardar'));
  assert.equal(c.store.db.EntrenoLineas.find((l) => l.id === 'l1-1').ejercicio, 'Suave');
  botonTexto(editor(), 'Vista previa').click();
  const prev = await esperar(() => document.querySelector('.enp-prev-ov iframe'));
  assert.match(prev.getAttribute('src'), /^blob:/);
  assert.ok(document.querySelector('.enp-prev-ov a[target="_blank"]'));
  botonTexto(document.querySelector('.enp-prev-ov'), 'Cerrar', false).click();
  assert.equal(document.querySelector('.enp-prev-ov'), null);
  const antes = document.querySelectorAll('iframe.enp-print').length;
  botonTexto(editor(), 'Imprimir').click();
  await esperar(() => document.querySelectorAll('iframe.enp-print').length === antes + 1);
});

test('Guardar en Drive sólo aparece con sesión de Google y sube el PDF a cnl/entrenos', async () => {
  const sin = await montar();
  botonTexto(sesion(sin, 'Sesión Alevín'), 'Plan').click();
  assert.throws(() => botonTexto(editor(), 'Guardar en Drive'));
  const c = await montar({ user: { email: 'a@b.c' } });
  const llamadas = [];
  c.ctx.drive = {
    ensureFolderPath: async (p) => { llamadas.push(['carpeta', p]); return 'f1'; },
    findFile: async (n, padre) => { llamadas.push(['buscar', n, padre]); return null; },
    upload: async (o) => { llamadas.push(['subir', o]); return { id: 'nuevo', name: o.name }; },
    fileUrl: (id) => 'https://drive/' + id,
  };
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  botonTexto(editor(), 'Guardar en Drive').click();
  await esperar(() => llamadas.some((x) => x[0] === 'subir'));
  assert.deepEqual(llamadas[0], ['carpeta', ['entrenos']]);
  const subida = llamadas.find((x) => x[0] === 'subir')[1];
  assert.match(subida.name, /^Alevin-\d{4}-\d{2}-\d{2}-[a-z]+\.pdf$/);
  assert.equal(subida.mimeType, 'application/pdf');
  assert.equal(subida.parentId, 'f1');
  assert.equal(subida.body.type, 'application/pdf');
  await esperar(() => /PDF guardado en Drive \(cnl\/entrenos\): Alevin-/.test(document.querySelector('#toasts')?.textContent || ''));
  // un fallo de Drive se comunica sin romper el editor
  c.ctx.drive.upload = async () => { throw new Error('boom'); };
  const consola = console.error;
  console.error = () => {};
  try {
    botonTexto(editor(), 'Guardar en Drive').click();
    await esperar(() => /No se pudo guardar en Drive/.test(document.querySelector('#toasts')?.textContent || ''));
  } finally { console.error = consola; }
  assert.ok(editor());
});

test('duplicar una sesión copia también su plan; eliminar la sesión borra el plan', async () => {
  const c = await montar();
  botonTexto(sesion(c, 'Sesión Alevín'), 'Duplicar').click();
  const form = document.querySelector('.ent-modal form');
  botonTexto(form, 'Guardar').click();
  await esperar(() => c.store.db.Entrenamientos.length === 4);
  const nueva = c.store.db.Entrenamientos.find((e) => e.id !== 's1' && e.titulo === 'Sesión Alevín');
  assert.equal(nueva.tipoSesion, 'Aer+Ritmo');
  assert.equal(c.store.db.EntrenoLineas.filter((l) => l.entrenamientoId === nueva.id).length, 3);
  botonTexto(sesion(c, 'Sesión Alevín'), 'Eliminar').click();
  await esperar(() => document.querySelector('.modal'));
  botonTexto(document.querySelector('.modal'), 'Aceptar').click();
  await esperar(() => c.store.db.Entrenamientos.length === 3);
  const quedan = new Set(c.store.db.Entrenamientos.map((e) => e.id));
  assert.ok(c.store.db.EntrenoLineas.every((l) => quedan.has(l.entrenamientoId)), 'no quedan líneas huérfanas');
});

test('modo sólo lectura (sin permiso de edición): ve el plan y descarga el PDF', async () => {
  const c = await montar({ rol: 'nadador' });
  const s = sesion(c, 'Sesión Alevín');
  assert.throws(() => botonTexto(s, 'Editar'));
  assert.throws(() => botonTexto(s, 'Eliminar'));
  botonTexto(s, 'Ver plan').click();
  const ed = editor();
  assert.ok(ed);
  assert.equal(ed.querySelectorAll('input').length, 0, 'sin campos editables');
  assert.equal(ed.querySelectorAll('table.enp-ro').length, 2);
  assert.match(ed.textContent, /Calentamiento/);
  assert.match(ed.querySelector('.enp-tot').textContent, /Total: 900 m · 25 min · 2 sets/);
  assert.throws(() => botonTexto(ed, 'Guardar'));
  botonTexto(ed, 'Generar PDF').click();
  const d = await pdfDescargado(c);
  assert.match(d.nombre, /^Alevin-/);
  assert.ok(d.info.texto.includes('TOTALES'));
});

test('en inglés la interfaz y el PDF salen en inglés', async () => {
  const c = await montar();
  const i18n = await importApp('js/i18n.js');
  i18n.setLang('en', { persist: false });
  await c.vista.render(c.container, [], c.ctx);
  botonTexto(c.container, 'Generate PDF for the week', false);
  botonTexto(sesion(c, 'Sesión Alevín'), 'Plan').click();
  assert.equal(totalTexto(), 'Total: 900 m · 25 min · 2 sets');
  assert.ok(editor().textContent.includes('Time (min)'));
  botonTexto(editor(), 'Generate PDF').click();
  const d = await pdfDescargado(c);
  assert.ok(d.info.texto.includes('TOTALS'));
  assert.match(d.nombre, /^Alevin-\d{4}-\d{2}-\d{2}-[a-z]+\.pdf$/);
  i18n.setLang('es', { persist: false });
});
