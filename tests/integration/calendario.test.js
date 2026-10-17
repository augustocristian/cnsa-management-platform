// Calendar integration: view (jsdom + real store) and service (simulated store/connection/client).
import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, tick } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
let hoy;
const test = (name, fn) =>
  base(name, async (t) => {
    c = await fresh({ demo: false });
    return fn(t);
  });

// Minimal club with dates relative to today (deterministic whatever day it runs).
function sembrar() {
  const { store, ui } = c;
  hoy = ui.isoDate();
  store.upsert('Grupos', { id: 'g1', nombre: 'Promoción', entrenador: 'Marta Valdés' });
  store.upsert('Grupos', { id: 'g2', nombre: 'Alevín', entrenador: 'Jorge Prieto' });
  store.upsert('Nadadores', { id: 'n1', nombre: 'Lucía', apellidos: 'F', grupoId: 'g1', activo: 'true' });
  store.upsert('Nadadores', { id: 'n2', nombre: 'Carla', apellidos: 'M', grupoId: 'g2', activo: 'true' });
  store.upsert('Entrenamientos', {
    id: 'e1',
    fecha: hoy,
    hora: '17:30',
    duracionMin: 60,
    grupoId: 'g1',
    titulo: 'Sesión Promo',
    piscina: '25',
    enfoque: 'Técnica',
  });
  store.upsert('Entrenamientos', {
    id: 'e2',
    fecha: hoy,
    hora: '18:30',
    duracionMin: 75,
    grupoId: 'g2',
    titulo: 'Sesión Alevín',
    piscina: '25',
    enfoque: 'Velocidad',
  });
  store.upsert('Entrenamientos', {
    id: 'e3',
    fecha: hoy,
    hora: '20:00',
    duracionMin: 90,
    grupoId: '',
    titulo: 'Reunión del club',
    piscina: '',
  });
}

async function montar(extra = {}, vistaGuardada = 'agenda') {
  sembrar();
  c.preferencias.set('calendario.vista', vistaGuardada);
  const mod = await importApp('js/presentation/views/calendario.js');
  const cal = { ...extra };
  await mod.render(c.container, [], { ...c.servicios, store: c.store, auth: c.auth, ui: c.ui, cal });
  await tick();
  return cal;
}
const titulos = () => [...c.container.querySelectorAll('.cal-ev-titulo')].map((e) => e.textContent);
const clic = async (el) => {
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await tick();
};
const cambiar = (el, v) => {
  el.value = v;
  el.dispatchEvent(new window.Event('change', { bubbles: true }));
};
const vista = (v) => clic(c.container.querySelector(`.segmented button[data-vista="${v}"]`));
// The single "Exportar" menu of the page header
const exportarMenu = async (etiqueta) => {
  await clic(c.container.querySelector('#cal-exportar .enp-mn-btn'));
  const item = [...document.querySelectorAll('[role=menuitem]')].find((b) => b.textContent.trim() === etiqueta);
  assert.ok(item, 'menu option: ' + etiqueta);
  await clic(item);
};
const modal = () => document.querySelector('.modal');
const textoAvisos = () => document.getElementById('toasts')?.textContent || '';

test('structure: one h1 in the header, a single Export menu and no injected styles', async () => {
  await montar();
  assert.equal(c.container.querySelectorAll('h1').length, 1);
  assert.equal(c.container.querySelector('.page-head h1').textContent, 'Calendario');
  assert.equal(c.container.querySelectorAll('.page-head .enp-mn-btn').length, 1);
  assert.equal(c.container.querySelector('.page-head .enp-mn-btn').textContent.trim(), 'Exportar');
  assert.equal(c.container.querySelector('.segmented').getAttribute('role'), 'group');
  assert.ok(!document.getElementById('cal-style'), 'no injected <style>');
});

test('single user: all groups are visible and it can be filtered by group and pool', async () => {
  await montar();
  assert.deepEqual(titulos().sort(), ['Reunión del club', 'Sesión Alevín', 'Sesión Promo']);
  assert.match(c.container.querySelector('#cal-ambito').textContent, /todo el club/);
  assert.equal(c.container.querySelector('#cal-nadador'), null, 'no preview as a swimmer');
  cambiar(c.container.querySelector('#cal-grupo'), 'g2');
  assert.deepEqual(titulos().sort(), ['Reunión del club', 'Sesión Alevín']); // the club-wide ones always show
  assert.ok(c.container.querySelectorAll('.cal-gchip').length >= 2, 'legend with chips');
  cambiar(c.container.querySelector('#cal-grupo'), '');
  cambiar(c.container.querySelector('#cal-piscina'), '50');
  assert.deepEqual(
    titulos(),
    ['Reunión del club'],
    'the pool filter responds (the event without a pool is always shown)',
  );
});

test('the Agenda opens on TODAY (rolling window starting today), not on the 1st of the month', async () => {
  const { store, ui } = c;
  const hoyLocal = ui.isoDate();
  const ayer = ui.isoDate(new Date(new Date().setDate(new Date().getDate() - 1)));
  store.upsert('Entrenamientos', {
    id: 'p',
    fecha: ayer,
    hora: '10:00',
    duracionMin: 60,
    grupoId: '',
    titulo: 'Ayer',
    estado: 'realizado',
  });
  store.upsert('Entrenamientos', {
    id: 'h',
    fecha: hoyLocal,
    hora: '10:00',
    duracionMin: 60,
    grupoId: '',
    titulo: 'Hoy mismo',
  });
  c.preferencias.set('calendario.vista', 'agenda');
  const mod = await importApp('js/presentation/views/calendario.js');
  await mod.render(c.container, [], { ...c.servicios, store, auth: c.auth, ui, cal: {} });
  await tick();
  const dias = [...c.container.querySelectorAll('.cal-agenda-dia')];
  assert.ok(dias.length >= 1);
  assert.ok(dias[0].classList.contains('cal-hoy'), 'the first section is today');
  assert.match(dias[0].querySelector('h2').textContent, /Hoy/);
  assert.deepEqual(titulos(), ['Hoy mismo'], 'anything before today does not appear in the agenda');
});

test('the Agenda shows today even if there are no events that day', async () => {
  c.preferencias.set('calendario.vista', 'agenda');
  const mod = await importApp('js/presentation/views/calendario.js');
  await mod.render(c.container, [], { ...c.servicios, store: c.store, auth: c.auth, ui: c.ui, cal: {} });
  await tick();
  assert.ok(c.container.querySelector('.cal-agenda-dia.cal-hoy'));
  assert.match(c.container.querySelector('.cal-agenda-dia.cal-hoy').textContent, /No hay eventos este día/);
});

test('on mobile the default view is the Agenda (a saved "Mes" is ignored there)', async () => {
  window.matchMedia = (q) => ({
    matches: /max-width:\s*759px/.test(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
  });
  try {
    await montar({}, 'mes');
    assert.equal(c.container.querySelector('.segmented [aria-pressed="true"]').dataset.vista, 'agenda');
    c.container.replaceChildren();
    c.preferencias.set('calendario.vista', 'semana');
    const mod = await importApp('js/presentation/views/calendario.js');
    await mod.render(c.container, [], { ...c.servicios, store: c.store, auth: c.auth, ui: c.ui, cal: {} });
    assert.equal(
      c.container.querySelector('.segmented [aria-pressed="true"]').dataset.vista,
      'semana',
      'an explicit week choice is respected',
    );
  } finally {
    delete window.matchMedia;
  }
});

test('the chosen view, window and reminder are saved in the user preferences (Drive)', async () => {
  await montar();
  await vista('semana');
  assert.equal(c.preferencias.get('calendario.vista'), 'semana');
  cambiar(c.container.querySelector('#cal-ventana'), '180');
  assert.equal(c.preferencias.get('calendario.ventanaDias'), 180);
  cambiar(c.container.querySelector('.cal-sync select[aria-label="Recordatorio"]'), '60');
  assert.equal(c.preferencias.get('calendario.alarmaMin'), 60);
  await c.preferencias.conectar({ remoto: c.drive.preferencias, email: 'yo@club.test' });
  const enDrive = c.fake.prefs();
  assert.equal(enDrive.valores['calendario.vista'], 'semana');
  assert.equal(enDrive.valores['calendario.ventanaDias'], 180);
  // a new view recovers what was chosen
  const mod = await importApp('js/presentation/views/calendario.js');
  await mod.render(c.container, [], { ...c.servicios, store: c.store, auth: c.auth, ui: c.ui, cal: {} });
  await tick();
  assert.equal(c.container.querySelector('#cal-ventana').value, '180');
  assert.equal(c.container.querySelector('.segmented [aria-pressed="true"]').dataset.vista, 'semana');
});

test('switching view (month/week/agenda) and navigating keeps the content', async () => {
  await montar();
  await vista('mes');
  assert.ok(c.container.querySelector('table.cal-mes'));
  assert.ok(c.container.querySelectorAll('td.cal-celda').length >= 28);
  assert.equal(c.container.querySelector('.cal-hoy .cal-num').getAttribute('aria-current'), 'date');
  assert.equal(titulos().length, 3, 'detail of the selected day (today)');
  await vista('semana');
  assert.equal(c.container.querySelectorAll('.cal-col').length, 7);
  assert.equal(titulos().length, 3);
  const tit = c.container.querySelector('#cal-titulo').textContent;
  await clic(c.container.querySelector('button[aria-label="Siguiente"]'));
  assert.notEqual(c.container.querySelector('#cal-titulo').textContent, tit);
  assert.equal(titulos().length, 0);
  await clic([...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Hoy'));
  assert.equal(titulos().length, 3);
});

test('month grid: a single day in the tab order and navigation with arrows and Home/End', async () => {
  await montar({}, 'mes');
  const botones = [...c.container.querySelectorAll('button.cal-num')];
  assert.equal(botones.filter((b) => b.getAttribute('tabindex') === '0').length, 1, 'roving tabindex');
  assert.equal(c.container.querySelector('button.cal-num[tabindex="0"]').dataset.fecha, hoy);
  const tecla = async (key) => {
    c.container
      .querySelector('button.cal-num[tabindex="0"]')
      .dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    await tick();
    return c.container.querySelector('button.cal-num[tabindex="0"]').dataset.fecha;
  };
  const D = await importApp('js/domain/calendario.js');
  assert.equal(await tecla('ArrowRight'), D.addDias(hoy, 1));
  assert.equal(await tecla('ArrowLeft'), hoy);
  assert.equal(await tecla('ArrowDown'), D.addDias(hoy, 7));
  assert.equal(await tecla('ArrowUp'), hoy);
  assert.equal(await tecla('Home'), D.lunesDe(hoy));
  assert.equal(await tecla('End'), D.addDias(D.lunesDe(hoy), 6));
  assert.equal(c.container.querySelector('table.cal-mes').getAttribute('role'), 'grid');
});

test('export: a single "Exportar" menu generates an .ics with N events (Blob text/calendar) and respects the filters', async () => {
  const capturas = [];
  await montar({ descargar: (blob, nombre, extra) => capturas.push({ blob, nombre, ...extra }) });
  await exportarMenu('Descargar calendario (.ics)');
  assert.equal(capturas.length, 1);
  assert.match(capturas[0].blob.type, /^text\/calendar/);
  assert.match(capturas[0].nombre, /\.ics$/);
  const txt = capturas[0].ics;
  assert.equal(txt.split('BEGIN:VEVENT').length - 1, 3);
  assert.ok(txt.includes('X-WR-CALNAME:CNL – Club Test'));
  assert.equal(await capturas[0].blob.text(), txt);
  assert.match(textoAvisos(), /Calendario exportado: 3 eventos/);
  cambiar(c.container.querySelector('#cal-grupo'), 'g1');
  await exportarMenu('Descargar calendario (.ics)');
  assert.equal(capturas[1].ics.split('BEGIN:VEVENT').length - 1, 2);
  // the reminder is chosen in the export options
  await exportarMenu('Opciones de exportación');
  cambiar(modal().querySelector('#cal-alarma'), '30');
  await clic([...modal().querySelectorAll('.sheet-actions button')].pop());
  await exportarMenu('Añadir a mi calendario');
  assert.equal(capturas[2].abrir, true);
  assert.ok(capturas[2].ics.includes('TRIGGER:-PT30M'));
});

test('exporting a period without events warns and does not download', async () => {
  const capturas = [];
  await montar({ descargar: (...a) => capturas.push(a) });
  c.store.remove('Entrenamientos', 'e1');
  c.store.remove('Entrenamientos', 'e2');
  c.store.remove('Entrenamientos', 'e3');
  await exportarMenu('Descargar calendario (.ics)');
  assert.equal(capturas.length, 0);
  assert.match(textoAvisos(), /No hay eventos que exportar/);
});

test('the time zone is saved in Club.zonaHoraria from the options and the .ics uses it; an invalid one is rejected inline', async () => {
  const capturas = [];
  await montar({ descargar: (b, n, x) => capturas.push(x) });
  await exportarMenu('Opciones de exportación');
  const input = modal().querySelector('#cal-zona');
  assert.equal(input.value, 'Europe/Madrid');
  input.value = 'No/Existe';
  await clic(modal().querySelector('#cal-zona-guardar'));
  assert.match(modal().textContent, /no válida/);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(c.store.club.zonaHoraria, undefined);
  input.value = 'America/Mexico_City';
  await clic(modal().querySelector('#cal-zona-guardar'));
  assert.equal(c.store.club.zonaHoraria, 'America/Mexico_City');
  await clic([...modal().querySelectorAll('.sheet-actions button')].pop());
  await exportarMenu('Descargar calendario (.ics)');
  assert.ok(capturas[0].ics.includes('DTSTART;TZID=America/Mexico_City:'));
});

test('with the Drive connection, Calendar sync is available', async () => {
  await montar();
  assert.equal(c.container.querySelector('#cal-sync').disabled, false);
  assert.equal(c.container.querySelector('#cal-sync-parar').disabled, false);
  assert.equal(c.container.querySelector('#cal-sync-motivo'), null);
  assert.equal(c.container.querySelector('#cal-sync-estado').textContent.length > 0, true);
});

test('in demo mode sync is disabled and the reason is explained', async () => {
  sembrar();
  const store = Object.create(c.store, { mode: { value: 'demo' } });
  const mod = await importApp('js/presentation/views/calendario.js');
  await mod.render(c.container, [], { ...c.servicios, store, auth: c.auth, ui: c.ui, cal: {} });
  await tick();
  assert.equal(c.container.querySelector('#cal-sync').disabled, true);
  assert.equal(c.container.querySelector('#cal-sync-parar').disabled, true);
  assert.match(c.container.querySelector('#cal-sync-motivo').textContent, /modo demo/i);
});

test('without a Drive connection sync is explained and exporting still works', async () => {
  sembrar();
  const auth = { isConnected: () => false, tokenForScope: async () => null };
  const mod = await importApp('js/presentation/views/calendario.js');
  await mod.render(c.container, [], { ...c.servicios, store: c.store, auth, ui: c.ui, cal: {} });
  await tick();
  assert.equal(c.container.querySelector('#cal-sync').disabled, true);
  assert.match(c.container.querySelector('#cal-sync-motivo').textContent, /Conecta Google Drive/);
  assert.ok(c.container.querySelector('#cal-exportar .enp-mn-btn'));
});

test('languages: the menu and the sync section are translated', async () => {
  const { setLang } = await importApp('js/presentation/i18n/i18n.js');
  setLang('en', { persist: false });
  try {
    await montar();
    assert.equal(c.container.querySelector('.page-head .enp-mn-btn').textContent.trim(), 'Export');
    assert.match(c.container.querySelector('.cal-sync h2').textContent, /Google Calendar/);
  } finally {
    setLang('es', { persist: false });
  }
});

// ---------- service with simulated store/auth/client ----------
async function servicioSimulado({ filas }) {
  const { crearCalendarioService } = await importApp('js/application/calendarioService.js');
  const db = {
    Entrenamientos: filas,
    Grupos: [{ id: 'g1', nombre: 'Promoción', entrenador: '' }],
    Nadadores: [],
    Piscinas: [],
    AsignacionesCalle: [],
  };
  const store = {
    list: (h) => (db[h] || []).slice(),
    club: { nombre: 'Club Test' },
    clubRef: { id: 'club-1', name: 'Club Test' },
    setClub(o) {
      Object.assign(this.club, o);
    },
  };
  const auth = { enabled: true, user: { email: 'yo@club.es', name: 'Yo' } };
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const remoto = new Map();
  let n = 0;
  const llamadas = [];
  const cliente = {
    insertar: async (cuerpo) => {
      llamadas.push('insertar');
      const id = 'G' + ++n;
      remoto.set(id, cuerpo);
      return { id };
    },
    actualizar: async (gid, cuerpo) => {
      llamadas.push('actualizar');
      if (!remoto.has(gid)) {
        const e = new Error('x');
        e.code = 'no-existe';
        throw e;
      }
      remoto.set(gid, cuerpo);
    },
    borrar: async (gid) => {
      llamadas.push('borrar');
      remoto.delete(gid);
    },
    listarGestionados: async () =>
      [...remoto].map(([gid, b]) => ({
        gid,
        cnlId: b.extendedProperties.private.cnlId,
        fecha: b.start.dateTime.slice(0, 10),
      })),
  };
  const ahora = () => new Date(2026, 9, 15, 9, 0, 0);
  const svc = crearCalendarioService({ store, auth, storage, cliente, ahora });
  return { svc, db, auth, remoto, llamadas, storage, mem };
}
const fila = (id, fecha, titulo = 'S' + id) => ({
  id,
  fecha,
  hora: '17:30',
  duracionMin: 60,
  grupoId: 'g1',
  titulo,
  descripcion: '',
  estado: 'planificado',
  piscina: '25',
  volumenMin: '',
  volumenMax: '',
  enfoque: '',
});

base('service: syncs idempotently (creates, does not repeat, updates, deletes) and stops syncing', async () => {
  const s = await servicioSimulado({ filas: [fila('a', '2026-10-20'), fila('b', '2026-10-21')] });
  let r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.deepEqual([r.creados, r.actualizados, r.borrados, r.errores.length], [2, 0, 0, 0]);
  assert.equal(s.remoto.size, 2);
  assert.equal(s.svc.estadoSync().total, 2);
  s.llamadas.length = 0;
  r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.deepEqual([r.creados, r.actualizados, r.borrados, r.iguales], [0, 0, 0, 2]);
  assert.deepEqual(s.llamadas, [], 'second pass makes no API calls');
  // change, add and remove
  s.db.Entrenamientos[0] = fila('a', '2026-10-20', 'Título nuevo');
  s.db.Entrenamientos.splice(1, 1);
  s.db.Entrenamientos.push(fila('c', '2026-10-22'));
  r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.deepEqual([r.creados, r.actualizados, r.borrados], [1, 1, 1]);
  assert.equal(s.remoto.size, 2);
  // nothing outside the window is created
  s.db.Entrenamientos.push(fila('lejos', '2027-06-01'));
  r = await s.svc.sincronizar({ ventanaDias: 30 });
  assert.equal(r.creados, 0);
  // lost map: recovered from Google without duplicating
  s.mem.clear();
  r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.equal(r.creados, 0);
  assert.equal(s.remoto.size, 2);
  // stopping sync removes what was created
  const p = await s.svc.dejarDeSincronizar();
  assert.equal(p.borrados, 2);
  assert.equal(s.remoto.size, 0);
  assert.equal(s.svc.estadoSync().activa, false);
});

base('service: fatal errors abort and are summarised; without a session it cannot sync', async () => {
  const s = await servicioSimulado({
    filas: [fila('a', '2026-10-20'), fila('b', '2026-10-21'), fila('c', '2026-10-22')],
  });
  const original = s.svc;
  const { crearCalendarioService } = await importApp('js/application/calendarioService.js');
  const roto = crearCalendarioService({
    store: {
      list: (h) => (h === 'Entrenamientos' ? s.db.Entrenamientos : s.db[h] || []),
      club: {},
      clubRef: { id: 'x' },
    },
    auth: s.auth,
    storage: { getItem: () => null, setItem() {} },
    ahora: () => new Date(2026, 9, 15),
    cliente: {
      listarGestionados: async () => [],
      insertar: async () => {
        const e = new Error('403');
        e.code = 'api-desactivada';
        throw e;
      },
    },
  });
  const r = await roto.sincronizar({});
  assert.equal(r.abortado, 'api-desactivada');
  assert.equal(r.creados, 0);
  assert.ok(r.errores.length >= 1);
  s.auth.user = null;
  await assert.rejects(original.sincronizar({}), (e) => e.code === 'sin-conexion');
  assert.deepEqual(original.puedeSincronizar(), { ok: false, motivo: 'sin-conexion' });
});
