// Integración del calendario: vista (jsdom + store real) y servicio (store/auth/cliente simulados).
import base from 'node:test';
import assert from 'node:assert/strict';
import { fresh, tick } from '../helpers/app.js';
import { importApp } from '../helpers/env.js';

let c;
let hoy;
const test = (name, fn) => base(name, async (t) => { c = await fresh({ demo: false }); return fn(t); });

// Club mínimo con fechas relativas a hoy (determinista sea cual sea el día de ejecución).
function sembrar() {
  const { store, ui } = c;
  hoy = ui.isoDate();
  store.upsert('Grupos', { id: 'g1', nombre: 'Promoción', entrenador: 'Marta Valdés' });
  store.upsert('Grupos', { id: 'g2', nombre: 'Alevín', entrenador: 'Jorge Prieto' });
  store.upsert('Nadadores', { id: 'n1', nombre: 'Lucía', apellidos: 'F', grupoId: 'g1', activo: 'true' });
  store.upsert('Nadadores', { id: 'n2', nombre: 'Carla', apellidos: 'M', grupoId: 'g2', activo: 'true' });
  store.upsert('Entrenamientos', { id: 'e1', fecha: hoy, hora: '17:30', duracionMin: 60, grupoId: 'g1', titulo: 'Sesión Promo', piscina: '25', enfoque: 'Técnica' });
  store.upsert('Entrenamientos', { id: 'e2', fecha: hoy, hora: '18:30', duracionMin: 75, grupoId: 'g2', titulo: 'Sesión Alevín', piscina: '25', enfoque: 'Velocidad' });
  store.upsert('Entrenamientos', { id: 'e3', fecha: hoy, hora: '20:00', duracionMin: 90, grupoId: '', titulo: 'Reunión del club', piscina: '' });
}

async function montar(extra = {}) {
  sembrar();
  c.preferencias.set('calendario.vista', 'agenda');
  const mod = await importApp('js/views/calendario.js');
  const cal = { ...extra };
  await mod.render(c.container, [], { store: c.store, auth: c.auth, ui: c.ui, cal });
  await tick();
  return cal;
}
const titulos = () => [...c.container.querySelectorAll('.cal-ev-titulo')].map((e) => e.textContent);
const clic = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const cambiar = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

test('admin ve todos los grupos y puede filtrar por grupo', async () => {
  await montar();
  assert.deepEqual(titulos().sort(), ['Reunión del club', 'Sesión Alevín', 'Sesión Promo']);
  cambiar(c.container.querySelector('#cal-grupo'), 'g2');
  assert.deepEqual(titulos().sort(), ['Reunión del club', 'Sesión Alevín']); // las del club entero siempre
  assert.ok(c.container.querySelectorAll('.cal-gchip').length >= 2, 'leyenda con chips');
});

test('un solo usuario: se ven todos los grupos, sin ámbito por rol ni vista de nadador', async () => {
  await montar();
  assert.deepEqual(titulos().sort(), ['Reunión del club', 'Sesión Alevín', 'Sesión Promo']);
  assert.match(c.container.querySelector('#cal-ambito').textContent, /todo el club/);
  assert.equal(c.container.querySelector('#cal-nadador'), null, 'sin previsualización como nadador');
  assert.equal(c.container.querySelector('#cal-todos'), null, 'sin interruptor de grupos propios');
  cambiar(c.container.querySelector('#cal-piscina'), '50');
  assert.deepEqual(titulos(), ['Reunión del club'], 'el filtro de piscina responde (el evento sin piscina siempre se ve)');
});

test('la vista, la ventana y el recordatorio elegidos se guardan en las preferencias del usuario (Drive)', async () => {
  await montar();
  clic(c.container.querySelector('.cal-seg button[data-vista="semana"]'));
  assert.equal(c.preferencias.get('calendario.vista'), 'semana');
  cambiar(c.container.querySelector('#cal-ventana'), '180');
  assert.equal(c.preferencias.get('calendario.ventanaDias'), 180);
  cambiar(c.container.querySelector('select[aria-label="Recordatorio"]'), '60');
  assert.equal(c.preferencias.get('calendario.alarmaMin'), 60);
  await c.preferencias.conectar({ remoto: c.drive.preferencias, email: c.auth.user.email });
  const enDrive = c.fake.prefs();
  assert.equal(enDrive.valores['calendario.vista'], 'semana');
  assert.equal(enDrive.valores['calendario.ventanaDias'], 180);
  // una vista nueva recupera lo elegido
  const mod = await importApp('js/views/calendario.js');
  await mod.render(c.container, [], { store: c.store, auth: c.auth, ui: c.ui, cal: {} });
  await tick();
  assert.equal(c.container.querySelector('#cal-ventana').value, '180');
  assert.equal(c.container.querySelector('.cal-seg button[aria-pressed="true"]').dataset.vista, 'semana');
});

test('cambiar de vista (mes/semana/agenda) y navegar mantiene el contenido', async () => {
  await montar();
  const vista = (v) => clic(c.container.querySelector(`.cal-seg button[data-vista="${v}"]`));
  vista('mes');
  assert.ok(c.container.querySelector('table.cal-mes'));
  assert.ok(c.container.querySelectorAll('td.cal-celda').length >= 28);
  assert.equal(c.container.querySelector('.cal-hoy .cal-num').getAttribute('aria-current'), 'date');
  assert.equal(titulos().length, 3, 'detalle del día seleccionado (hoy)');
  vista('semana');
  assert.equal(c.container.querySelectorAll('.cal-col').length, 7);
  assert.equal(titulos().length, 3);
  const tit = c.container.querySelector('#cal-titulo').textContent;
  clic(c.container.querySelector('button[aria-label="Siguiente"]'));
  assert.notEqual(c.container.querySelector('#cal-titulo').textContent, tit);
  assert.equal(titulos().length, 0);
  clic([...c.container.querySelectorAll('button')].find((b) => b.textContent === 'Hoy'));
  assert.equal(titulos().length, 3);
});

test('exportar genera un .ics con N eventos (Blob text/calendar) y respeta los filtros', async () => {
  const capturas = [];
  await montar({ descargar: (blob, nombre, extra) => capturas.push({ blob, nombre, ...extra }) });
  clic(c.container.querySelector('#cal-descargar'));
  assert.equal(capturas.length, 1);
  assert.match(capturas[0].blob.type, /^text\/calendar/);
  assert.match(capturas[0].nombre, /\.ics$/);
  const txt = capturas[0].ics;
  assert.equal(txt.split('BEGIN:VEVENT').length - 1, 3);
  assert.ok(txt.includes('X-WR-CALNAME:CNL – Club Test'));
  assert.equal(await capturas[0].blob.text(), txt);
  assert.match(c.container.textContent, /Calendario exportado: 3 eventos/);
  cambiar(c.container.querySelector('#cal-grupo'), 'g1');
  clic(c.container.querySelector('#cal-descargar'));
  assert.equal(capturas[1].ics.split('BEGIN:VEVENT').length - 1, 2);
  // recordatorio configurable
  cambiar(c.container.querySelector('#cal-exp-t').parentElement.querySelector('select[aria-label="Recordatorio"]'), '30');
  clic(c.container.querySelector('#cal-anadir'));
  assert.equal(capturas[2].abrir, true);
  assert.ok(capturas[2].ics.includes('TRIGGER:-PT30M'));
});

test('exportar un periodo sin eventos avisa y no descarga', async () => {
  const capturas = [];
  await montar({ descargar: (...a) => capturas.push(a) });
  c.store.remove('Entrenamientos', 'e1'); c.store.remove('Entrenamientos', 'e2'); c.store.remove('Entrenamientos', 'e3');
  clic(c.container.querySelector('#cal-descargar'));
  assert.equal(capturas.length, 0);
  assert.match(c.container.textContent, /No hay eventos que exportar/);
});

test('el admin guarda la zona horaria en Club.zonaHoraria y el .ics la usa; una inválida se rechaza', async () => {
  const capturas = [];
  await montar({ descargar: (b, n, x) => capturas.push(x) });
  const input = c.container.querySelector('#cal-zona');
  assert.equal(input.value, 'Europe/Madrid');
  input.value = 'No/Existe';
  clic(c.container.querySelector('#cal-zona-guardar'));
  assert.match(c.container.textContent, /no válida/);
  assert.equal(c.store.club.zonaHoraria, undefined);
  input.value = 'America/Mexico_City';
  clic(c.container.querySelector('#cal-zona-guardar'));
  assert.equal(c.store.club.zonaHoraria, 'America/Mexico_City');
  clic(c.container.querySelector('#cal-descargar'));
  assert.ok(capturas[0].ics.includes('DTSTART;TZID=America/Mexico_City:'));
});

test('con la sesión de Google la sincronización de Calendar está disponible (ya no hay modo local)', async () => {
  await montar();
  assert.equal(c.container.querySelector('#cal-sync').disabled, false);
  assert.equal(c.container.querySelector('#cal-sync-parar').disabled, false);
  assert.equal(c.container.querySelector('#cal-sync-motivo'), null);
  assert.equal(c.container.querySelector('#cal-sync-estado').textContent.length > 0, true);
});

// ---------- servicio con store/auth/cliente simulados ----------
async function servicioSimulado({ filas }) {
  const { crearCalendarioService } = await importApp('js/application/calendarioService.js');
  const db = { Entrenamientos: filas, Grupos: [{ id: 'g1', nombre: 'Promoción', entrenador: '' }], Nadadores: [], Piscinas: [], AsignacionesCalle: [] };
  const store = { list: (h) => (db[h] || []).slice(), club: { nombre: 'Club Test' }, clubRef: { id: 'club-1', name: 'Club Test' }, setClub(o) { Object.assign(this.club, o); } };
  const auth = { enabled: true, user: { email: 'yo@club.es', name: 'Yo' } };
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
  const remoto = new Map();
  let n = 0;
  const llamadas = [];
  const cliente = {
    insertar: async (cuerpo) => { llamadas.push('insertar'); const id = 'G' + (++n); remoto.set(id, cuerpo); return { id }; },
    actualizar: async (gid, cuerpo) => { llamadas.push('actualizar'); if (!remoto.has(gid)) { const e = new Error('x'); e.code = 'no-existe'; throw e; } remoto.set(gid, cuerpo); },
    borrar: async (gid) => { llamadas.push('borrar'); remoto.delete(gid); },
    listarGestionados: async () => [...remoto].map(([gid, b]) => ({ gid, cnlId: b.extendedProperties.private.cnlId, fecha: b.start.dateTime.slice(0, 10) })),
  };
  const ahora = () => new Date(2026, 9, 15, 9, 0, 0);
  const svc = crearCalendarioService({ store, auth, storage, cliente, ahora });
  return { svc, db, auth, remoto, llamadas, storage, mem };
}
const fila = (id, fecha, titulo = 'S' + id) => ({ id, fecha, hora: '17:30', duracionMin: 60, grupoId: 'g1', titulo, descripcion: '', estado: 'planificado', piscina: '25', volumenMin: '', volumenMax: '', enfoque: '' });

base('servicio: sincroniza de forma idempotente (crea, no repite, actualiza, borra) y deja de sincronizar', async () => {
  const s = await servicioSimulado({ filas: [fila('a', '2026-10-20'), fila('b', '2026-10-21')] });
  let r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.deepEqual([r.creados, r.actualizados, r.borrados, r.errores.length], [2, 0, 0, 0]);
  assert.equal(s.remoto.size, 2);
  assert.equal(s.svc.estadoSync().total, 2);
  s.llamadas.length = 0;
  r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.deepEqual([r.creados, r.actualizados, r.borrados, r.iguales], [0, 0, 0, 2]);
  assert.deepEqual(s.llamadas, [], 'segunda pasada sin llamadas a la API');
  // cambio, alta y baja
  s.db.Entrenamientos[0] = fila('a', '2026-10-20', 'Título nuevo');
  s.db.Entrenamientos.splice(1, 1);
  s.db.Entrenamientos.push(fila('c', '2026-10-22'));
  r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.deepEqual([r.creados, r.actualizados, r.borrados], [1, 1, 1]);
  assert.equal(s.remoto.size, 2);
  // fuera de la ventana no se crea
  s.db.Entrenamientos.push(fila('lejos', '2027-06-01'));
  r = await s.svc.sincronizar({ ventanaDias: 30 });
  assert.equal(r.creados, 0);
  // mapa perdido: se recupera de Google sin duplicar
  s.mem.clear();
  r = await s.svc.sincronizar({ ventanaDias: 90 });
  assert.equal(r.creados, 0);
  assert.equal(s.remoto.size, 2);
  // dejar de sincronizar elimina lo creado
  const p = await s.svc.dejarDeSincronizar();
  assert.equal(p.borrados, 2);
  assert.equal(s.remoto.size, 0);
  assert.equal(s.svc.estadoSync().activa, false);
});

base('servicio: errores fatales abortan y se resumen; sin sesión no se puede sincronizar', async () => {
  const s = await servicioSimulado({ filas: [fila('a', '2026-10-20'), fila('b', '2026-10-21'), fila('c', '2026-10-22')] });
  const original = s.svc;
  const { crearCalendarioService } = await importApp('js/application/calendarioService.js');
  const roto = crearCalendarioService({
    store: { list: (h) => (h === 'Entrenamientos' ? s.db.Entrenamientos : s.db[h] || []), club: {}, clubRef: { id: 'x' } }, auth: s.auth,
    storage: { getItem: () => null, setItem() {} }, ahora: () => new Date(2026, 9, 15),
    cliente: { listarGestionados: async () => [], insertar: async () => { const e = new Error('403'); e.code = 'api-desactivada'; throw e; } },
  });
  const r = await roto.sincronizar({});
  assert.equal(r.abortado, 'api-desactivada');
  assert.equal(r.creados, 0);
  assert.ok(r.errores.length >= 1);
  s.auth.user = null;
  await assert.rejects(original.sincronizar({}), (e) => e.code === 'sin-sesion');
  assert.deepEqual(original.puedeSincronizar(), { ok: false, motivo: 'sin-sesion' });
});
